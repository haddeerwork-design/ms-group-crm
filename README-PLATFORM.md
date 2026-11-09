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

## Checks

- `cd app && npm test` — unit tests for all formulas (pricing, planner, quotations, analytics…).
- `cd app && npm run build && npm run e2e` — opens every page as several roles with fake data; fails if a page crashes or opens for a role that must not see it.
- `supabase/tests/` — database tests for every migration (RLS, numbering, guards). Local Postgres only.
- In the app: **Company Settings → System check → Run security check** (Super Admin).

## Switching off the old CRM

Do these in order. Nothing is deleted at any step, and every step can be undone.

1. Make sure every migration up to `0011_production` is installed (the Dashboard shows a red list to the Super Admin if not).
2. Tell the team the date. From that day new work happens only in the new platform.
3. On that day: **Company Settings → System check → Refresh old-CRM archive**. Check **Old CRM Archive** shows the old quotations and invoices.
4. GitHub → repository **Settings → Secrets and variables → Actions → Variables → New repository variable**: name `LEGACY_MODE`, value `retired`. Then **Actions → Deploy site → Run workflow**.
   - The main address now opens the new platform.
   - The old CRM is still at `/legacy/` for emergencies.
   - To undo: delete the variable and run the workflow again.
5. After a few weeks with no problems, the old CRM file can be removed from the site. The data stays in Supabase (`crm_records`) and in `legacy_archive`.
