# Система файловых вложений (Entity Files)

## Описание

Единая система для прикрепления файлов к активам (assets) и автомобилям (cars).

### Особенности

- **Private storage bucket**: файлы хранятся в bucket "assets" (приватный)
- **Signed URLs**: загрузка и просмотр через временные signed URLs
- **Multi-tenant isolation**: RLS обеспечивает изоляцию по company_id
- **Flexible file types**: поддержка различных типов (фото, документы, ПТС, СТС, ЕГРН и т.д.)
- **On-demand URL generation**: signed URLs генерируются при клике (TTL 10 минут)

## Архитектура

### Database Tables

**public.files**
- Основная таблица для метаданных файлов
- Columns: id, company_id, bucket, path, original_name, mime_type, size_bytes, created_by, created_at
- RLS: доступ только для пользователей своей компании

**public.entity_files**
- Junction table для связи файлов с сущностями
- Columns: company_id, entity_type ('asset'|'car'), entity_id, file_id, kind, sort_order, created_at
- PK: (entity_type, entity_id, file_id)
- RLS: доступ только для пользователей своей компании

### Storage

- **Bucket**: `assets` (private)
- **Path structure**: `company/{company_id}/{entity_type}/{entity_id}/{kind}/{file_id}-{filename}`
- **Access**: signed URLs с TTL 600s для просмотра

## Server Actions

### app/actions/files.ts

1. **createUploadForEntityFile()**
   - Проверяет доступ к сущности
   - Генерирует file_id и storage path
   - Создаёт signed upload URL (TTL 60s)
   - Returns: { file_id, bucket, path, signed_upload_url }

2. **commitUploadedEntityFile()**
   - Вставляет запись в public.files
   - Связывает файл с сущностью в public.entity_files
   - Пишет audit log

3. **listEntityFiles()**
   - Возвращает список файлов для сущности
   - Только метаданные (без signed URLs)

4. **getSignedViewUrl(file_id)**
   - Генерирует signed URL для просмотра/скачивания (TTL 10 min)
   - Вызывается по клику пользователя

5. **deleteEntityFile(file_id)**
   - Удаляет файл из storage
   - Удаляет запись из БД (cascade удаляет entity_files)

## UI Components

### components/files/file-attachments.tsx

Переиспользуемый компонент для управления файлами:

**Props:**
- `entityType`: 'asset' | 'car'
- `entityId`: UUID сущности
- `allowedKinds`: список типов файлов
- `readOnly`: запретить загрузку/удаление

**Features:**
- Drag & drop (будущее улучшение)
- Список файлов с иконками по mime-type
- Upload dialog с выбором типа файла
- Просмотр файла в новой вкладке
- Удаление файла с подтверждением

## Интеграция

### Assets (/app/assets/[id]/page.tsx)

Добавлена новая вкладка "Файлы" с типами:
- photo, egrn, plan, valuation, certificate, contract, other

### Cars (/app/cars/[id]/page.tsx)

Компонент файлов добавлен в правую колонку с типами:
- photo, pts, sts, contract, invoice, inspection, other

## Migration

**scripts/054_entity_files_attachments.sql**
- Создаёт таблицы files и entity_files
- Настраивает RLS policies
- Создаёт индексы

## Workflow

### Загрузка файла

1. User выбирает файл и тип → открывается dialog
2. Client вызывает `createUploadForEntityFile()` → получает signed_upload_url
3. Client загружает файл напрямую в storage через PUT
4. Client вызывает `commitUploadedEntityFile()` → сохраняет метаданные в БД
5. UI обновляется, показывая новый файл

### Просмотр файла

1. User кликает на файл
2. Client вызывает `getSignedViewUrl(file_id)` → получает временный URL
3. URL открывается в новой вкладке

### Удаление файла

1. User кликает "удалить" → подтверждение
2. Client вызывает `deleteEntityFile(file_id)`
3. Backend удаляет из storage и БД
4. UI обновляется

## Security

- ✅ RLS изоляция по company_id
- ✅ Signed URLs с коротким TTL
- ✅ Проверка доступа к entity перед созданием upload URL
- ✅ Audit logging всех операций
- ✅ Private storage bucket

## Testing

### Manual Test Steps

1. **Asset file upload**:
   - Открыть /assets/[id]
   - Перейти в "Файлы"
   - Загрузить фото → должно появиться в списке
   - Кликнуть на файл → откроется в новой вкладке
   - Удалить файл → исчезнет из списка

2. **Car file upload**:
   - Открыть /cars/[id]
   - Найти блок "Файлы" в правой колонке
   - Загрузить СТС/PDF → появляется в списке
   - Кликнуть → открывается
   - Перезагрузить страницу → файлы на месте

3. **Cross-tenant isolation**:
   - Проверить что файлы одной компании не видны другой

## Future Improvements

- [ ] Drag & drop upload
- [ ] Multiple file upload at once
- [ ] Image thumbnails/previews
- [ ] File re-ordering (sort_order)
- [ ] File categories/tags
- [ ] Search by filename
- [ ] Bulk delete
- [ ] Storage quota management
