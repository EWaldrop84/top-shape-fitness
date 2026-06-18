# Top Shape Fitness

A mobile-first Progressive Web App (PWA) for a private personal training studio. Manages clients, trainers, session packages, appointments, scheduling, payroll, and SMS notifications.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, `@supabase/supabase-js`, `vite-plugin-pwa`
- Auth & DB: Supabase (email+password auth, PostgreSQL)
- API: Express 5
- DB (internal): PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/top-shape-fitness/` — React PWA frontend
- `artifacts/top-shape-fitness/src/lib/supabase.ts` — Supabase client (uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`)
- `artifacts/top-shape-fitness/src/App.tsx` — Root auth router (loading → login → role dashboard)
- `artifacts/top-shape-fitness/src/pages/` — Login, AdminDashboard, TrainerPortal, ClientPortal
- `artifacts/top-shape-fitness/src/types/index.ts` — Shared TypeScript types (AppUser, UserRole)
- `supabase/migrations/001_initial_schema.sql` — Full DB schema (run in Supabase SQL Editor)
- `artifacts/api-server/` — Express backend (Phase 2+)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (Phase 2+)

## Architecture decisions

- Supabase auth session is persisted via `localStorage` (storageKey: `top-shape-fitness-auth`). `onAuthStateChange` keeps the session live across tabs and refreshes.
- After login, the app queries `public.users` by `auth.uid()` to get the role. Login fails gracefully if the user row doesn't exist or `is_active = false`.
- Role routing is handled entirely in `App.tsx` — no client-side router needed for Phase 1.
- PWA manifest and service worker wired via `vite-plugin-pwa` (disabled in dev, active in production build).
- Brand colors: Navy `#2A255D`, Teal `#06A29E`, Blue `#1F73B1` — mapped to CSS custom properties in `src/index.css`.

## Product

- **Admin**: Full studio management — schedules, clients, payroll, revenue
- **Trainer**: Personal schedule, client roster, payroll hours
- **Client**: Session history, appointment booking, package balance

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **SQL migration**: Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL Editor before any logins will work. Users in `auth.users` must also have a matching row in `public.users` with the same `id` UUID.
- **VITE_ prefix**: Supabase URL/key are stored as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` so Vite exposes them to the browser bundle.
- **Always run X before Y**: Run codegen after any OpenAPI spec change before touching frontend code.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
