# BUGFIX: Files Upload Auth Pattern Fixed

## Issue
`app/actions/files.ts` использовал неверный паттерн вызова `createSupabaseAndRequireUser()`:
- Использовалось: `const { supabase, employee, company } = await createSupabaseAndRequireUser()`
- Фактически возвращается: `{ supabase, user }`
- Ошибка: `Cannot read properties of undefined (reading 'id')` при попытке доступа к `employee.id` или `company.id`

## Root Cause
`lib/supabase/require-user.ts` возвращает только `{ supabase, user }`, но код в `files.ts` ожидал `{ employee, company }`, которых не существует.

## Changes Made

### 1. `/app/actions/files.ts`

**Добавлен helper для получения company_id:**
\`\`\`typescript
async function getCompanyIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('team_members')
    .select('company_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error || !data?.company_id) {
    throw new Error('No team membership or company not selected')
  }

  return data.company_id
}
\`\`\`

**Исправлены все server actions:**

1. `createUploadForEntityFile`:
   - ✅ Заменено: `{ employee, company }` → `{ user }`
   - ✅ Добавлено: `const companyId = await getCompanyIdForUser(supabase, user.id)`
   - ✅ Access checks: `if (!asset.company_id || asset.company_id !== companyId)`
   - ✅ Storage path: использует `companyId` вместо `company.id`

2. `commitUploadedEntityFile`:
   - ✅ Заменено: `{ employee, company }` → `{ user }`
   - ✅ Добавлено: `const companyId = await getCompanyIdForUser(supabase, user.id)`
   - ✅ DB insert: `company_id: companyId`, `created_by: user.id`
   - ✅ Audit log: `actorEmployeeId: user.id`

3. `listEntityFiles`:
   - ✅ Уже использовал только `{ supabase }` - не требует изменений

4. `getSignedViewUrl`:
   - ✅ Уже использовал только `{ supabase }` - не требует изменений

5. `deleteEntityFile`:
   - ✅ Заменено: `{ employee }` → `{ user }`
   - ✅ Audit log: `actorEmployeeId: user.id`

## Security Improvements

1. **Добавлены null-checks для company_id:**
   \`\`\`typescript
   if (!asset.company_id || asset.company_id !== companyId) {
     return { success: false, error: 'Access denied' }
   }
   \`\`\`

2. **Проверка team membership:**
   - Helper `getCompanyIdForUser` проверяет существование записи в `team_members`
   - Бросает ошибку если пользователь не состоит ни в одной компании

3. **RLS политики остаются активными:**
   - Все запросы проходят через RLS на уровне БД
   - Дополнительные проверки в коде - defense in depth

## Testing Required

### Manual Testing Checklist:
- [ ] Upload файла в asset → проверить успешную загрузку
- [ ] Upload файла в car → проверить успешную загрузку
- [ ] Попытка загрузки в чужой asset → должна быть ошибка "Access denied"
- [ ] Просмотр списка файлов → должны отображаться
- [ ] Удаление файла → должно работать с audit log
- [ ] Просмотр файла (signed URL) → должен открываться

### Build Verification:
\`\`\`bash
# Unicode check
pnpm check:unicode

# Build check
pnpm build
\`\`\`

## Files Changed
- ✅ `/app/actions/files.ts` - исправлен auth pattern + добавлен helper

## UI Changes
- ❌ Никаких изменений в UI (как требовалось)
- ✅ Компонент `/components/files/file-attachments.tsx` остался без изменений

## Migration Notes
Никаких изменений в БД не требуется - это исключительно фикс кода.

## Audit Trail
- user.id теперь записывается в:
  - `files.created_by`
  - `audit_log.actor_employee_id` (технически это user_id, не employee_id)
  
Note: В будущем может потребоваться рефакторинг `audit_log.actor_employee_id` → `actor_user_id` для консистентности, но это выходит за рамки текущего bugfix.

---

**STATUS:** ✅ FIXED - Ready for testing
**AUTHOR:** v0
**DATE:** 2026-02-23
