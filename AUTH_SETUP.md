# Auth Setup Guide

## Supabase Auth URL Configuration

In your Supabase Dashboard, go to **Authentication > URL Configuration** and set:

### Site URL
Set to your production domain (NOT `localhost`):
\`\`\`
https://your-domain.vercel.app
\`\`\`

### Redirect URLs
Add these redirect URLs (replace domain accordingly):
\`\`\`
https://your-domain.vercel.app/auth/callback
https://your-domain.vercel.app/login
https://your-domain.vercel.app/onboarding
\`\`\`

For local development, also add:
\`\`\`
http://localhost:3000/auth/callback
http://localhost:3000/login
http://localhost:3000/onboarding
\`\`\`

## Important Notes

- Recovery / magic link emails contain `#access_token` in the URL fragment. The middleware cannot read URL fragments (they are client-side only), so `/auth/callback` must be a **public route** (no auth required).
- The middleware already allows `/auth/*`, `/login`, and `/onboarding` without authentication.

## Environment Variables

Ensure these are set in Vercel (Project Settings > Environment Variables):

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Your Supabase anon/public key |

These are embedded at build time by Next.js for client-side usage.  
If they are missing, the login page will show an error alert.
