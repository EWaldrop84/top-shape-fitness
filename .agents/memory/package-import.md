---
name: Package import (import_packages.js)
description: Schema mapping and conventions for the one-off client_packages import script at repo root
---

# Package import conventions

`import_packages.js` (repo root) bulk-loads client packages into the live Supabase DB. Run with `SUPABASE_SERVICE_KEY=<service role> node import_packages.js` (the repl secret is named `SUPABASE_SERVICE_ROLE_KEY` — map it).

## Live schema constraints (the durable lesson)
- `packages` table has only: `name`, `session_count` (NOT `sessions_count`), `duration_days`, `is_active`. There is **no** `description` and **no** per-session minutes column.
- `client_packages` has no `per_session_price_cents`, `duration_minutes`, `notes`, or `start_date`. Use `price_paid_cents` and `purchase_date` instead.

## Conventions chosen for imported data
- Session duration (30/45/60 min) cannot be stored on a row, so it is encoded in per-duration package templates named `Imported - {N} Min`, created `is_active: false` so they don't show as purchasable options.
- Imported client_packages get `expiration_waived: true` so back-dated start dates don't auto-expire them.
- Dedup: skips a client who already has any client_packages row. Name match falls back to last-name if full name miss.

**Why:** the spreadsheet source carries more fields than the schema holds; these mappings keep the import faithful without schema changes. Group/class rows (e.g. "Autumn & Al", "Eveon Class") have no client record and are reported as "Not found".
