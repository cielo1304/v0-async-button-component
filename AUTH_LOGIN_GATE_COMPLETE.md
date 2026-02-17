# Auth: Login Gate + Server Action Auth Guards + Single Supabase Client

## Summary

Added authentication layer to the ERP system: unauthenticated users are redirected to `/login`, all server actions and API routes require a valid session, and the browser-side Supabase client is a singleton to prevent "Multiple GoTrueClient instances" warnings.

## Changes

### New Files
| File | Purpose |
|------|---------|
| `middleware.ts` | Root Next.js middleware - delegates to `updateSession` |
| `lib/supabase/middleware.ts` | Session refresh + redirect logic for unauthenticated users |
| `lib/supabase/require-user.ts` | `requireUser()` helper - throws `'Unauthorized'` if no session |
| `app/login/page.tsx` | Login / sign-up page (email+password via Supabase Auth) |
| `app/auth/callback/route.ts` | Supabase OAuth / email-confirm callback handler |

### Modified Files

#### Singleton Browser Client
| File | Change |
|------|--------|
| `lib/supabase/client.ts` | Singleton pattern - one `createBrowserClient` instance per browser tab |

#### Server Action Auth Guards (11 files)
Every exported async function now calls `await requireUser()` before any DB access:

- `app/actions/assets.ts`
- `app/actions/auto.ts`
- `app/actions/cashbox.ts`
- `app/actions/cashbox-locations.ts`
- `app/actions/client-exchange.ts`
- `app/actions/collateral-engine.ts`
- `app/actions/currency-rates.ts`
- `app/actions/exchange.ts`
- `app/actions/finance-deals.ts`
- `app/actions/finance-engine.ts`
- `app/actions/team.ts`

#### API Route Auth Guards (2 files)
- `app/api/upload/route.ts` - `requireUser()` at top of POST handler
- `app/api/delete/route.ts` - `requireUser()` at top of DELETE handler

#### Docs
- `ROUTES.md` - Added `/login` and `/auth/callback` routes, auth architecture notes

## Verification Checklist
1. Logout -> navigate to any URL -> redirect to `/login`
2. Login -> redirect back to `?next=` param or `/`
3. Server action without session -> throws `'Unauthorized'`
4. API route without session -> throws `'Unauthorized'` (caught by try/catch, returns 500)
5. No "Multiple GoTrueClient instances" console warning in browser
6. `/login` page accessible without session (no redirect loop)
7. `/auth/callback` accessible without session

## Middleware Public Path Allowlist
- `/login`
- `/auth/*`
- `/_next/*`
- `/api/*` (auth checked in route handlers)
- `/favicon.ico`
- Static assets (`.png`, `.svg`, `.jpg`, `.jpeg`, `.ico`)
