---
name: Session deduction and cancellation rules
description: Exact timing rules for when sessions are deducted and returned on booking/cancel
---

## Deduction rule
- On `POST /api/booking/create`: if `appointment_datetime - now() <= 24 hours` → deduct immediately (session_deducted=true, deducted_at=now(), sessions_remaining-1 on client_packages).
- If > 24 hours out → session_deducted=false; `checkAndDeductSessions` (POST /api/admin/deduct-sessions) handles it on next app load.
- Package deactivated (is_active=false) when sessions_remaining hits 0.

## checkAndDeductSessions SMS thresholds (after deduction)
- sessions_remaining === 3 → sendLowPackageAlert
- sessions_remaining === 1 → sendRenewalReminder
- sessions_remaining === 0 → set is_active=false (no SMS, just deactivate)

## Cancellation — 3 cases
1. session_deducted=true AND within24hr → status='forfeited', cancellation_within_24hr=true, session NOT returned.
2. session_deducted=true AND >24hr out → status='cancelled', session returned (sessions_remaining+1, sessions_used-1, reactivate package if it was at 0).
3. session_deducted=false → status='cancelled', no session adjustment (was never taken).

**Why:** A client who books within 24hrs and cancels immediately still forfeits — consistent with studio policy. No edge-case loophole via immediate cancellation.
