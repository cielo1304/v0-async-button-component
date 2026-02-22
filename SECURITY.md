# Security Policy

## What NEVER goes into the repository

- Passwords, tokens, API keys, anon keys
- SQL scripts that modify `auth.users` passwords (e.g., `UPDATE auth.users SET encrypted_password ...`)
- `.env` files (already in `.gitignore`)

## Setting passwords

Use the Supabase Dashboard:  
**Authentication > Users > (select user) > Set password**

Do NOT create SQL migration scripts for passwords.

## If a secret was accidentally committed

1. Immediately change the compromised password / rotate the key
2. Revoke all active sessions in Supabase Dashboard: **Authentication > Users > (select user) > Revoke sessions**
3. Remove the file from the repository and add it to `.gitignore`
4. Consider using `git filter-branch` or BFG Repo-Cleaner to remove the secret from git history

## Environment Variables

Required env vars (set in Vercel / `.env.local`, never in code):

| Variable | Where used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (admin ops) |

## Action Required

> **Change the password for `cielo1304@gmail.com` and revoke all sessions** -- the old password was exposed in a now-deleted SQL script.
