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
