# MS El-brancy Group — New Platform

| Folder | What it is |
|---|---|
| `index.html` (root) | The current CRM. Still live and unchanged. |
| `app/` | New platform (React + TypeScript + Vite + Tailwind + shadcn/ui). Published at `/app/`. |
| `supabase/migrations/` | Database changes, numbered. Run each one once, in order, in Supabase → SQL Editor. |
| `supabase/tests/` | Local tests only. **Never run these on the real project.** |
| `.github/workflows/deploy.yml` | Builds `app/` and publishes it next to the current CRM. |

Rules: only the publishable key is in the frontend (`app/src/config.ts`). Every table has Row Level Security.
Migrations only add things; they never delete existing data.

## Edge Function `admin-users`

`supabase/functions/admin-users/index.ts` lets the Super Admin add employees and reset passwords from **Team & Roles**.
It runs on Supabase's servers and uses the secret key from Supabase's own environment, so no secret key is ever in the app.
Deploy: Supabase → Edge Functions → Deploy a new function → Via Editor → name `admin-users` → paste the file → Deploy → turn **Verify JWT** off (the function checks the login and the super_admin role itself).

## Checks

- `cd app && npm test` — unit tests for all formulas (pricing, planner, quotations, analytics…).
- `cd app && npm run build && npm run e2e` — opens every page as several roles with fake data; fails if a page crashes or opens for a role that must not see it.
- `supabase/tests/` — database tests for every migration (RLS, numbering, guards). Local Postgres only.
- In the app: **Company Settings → System check → Run security check** (Super Admin).

## The old CRM

Retired on 12 Nov 2026. The main address now opens the platform (`index.html` only redirects to `/app/`).
The old one-page CRM file is kept in the git history only. Its data stays in Supabase (`crm_records`) and is readable in **Old CRM Archive**.
