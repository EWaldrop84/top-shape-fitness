---
name: Payroll sync pattern
description: payroll_sessions is not auto-populated; sync endpoint generates records from completed appointments
---

## Pattern
- `payroll_sessions` table is NOT auto-populated on appointment completion.
- `POST /api/admin/sync-payroll { week_start, week_end }` fetches all completed appointments in range, deduplicates against existing payroll_sessions, inserts missing records with color_code='tomato'.
- Frontend `AdminPayroll.tsx` has a "Sync Sessions" button that calls this endpoint, then refetches.

## AdminPayroll data join
```
payroll_sessions
  → trainers!trainer_id(display_color, users!trainers_user_id_fkey(first_name, last_name))
  → appointments!appointment_id(start_time, clients!client_id(users!clients_user_id_fkey(first_name, last_name)))
```

## color_code semantics
- tomato = payment due (default for synced sessions)
- charcoal = paid cancellation
- null = completed (no special status)

**Why:** Generating payroll on-the-fly from appointments would lose manual adjustments (color_code overrides, notes). The payroll_sessions table is the source of truth after sync.
