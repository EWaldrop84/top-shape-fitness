---
name: SMS module (Twilio)
description: Where the SMS logic lives, how to call it, required env vars, and log behavior
---

## Location
`artifacts/api-server/src/sms.ts`

## Required env vars (not yet set — user must add)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- From number hardcoded: `+18434102198`

## Behavior
- `sendSMS(url, key, recipientUserId, phone, triggerType, message)` — calls Twilio, then logs to sms_log table regardless of success/failure.
- If Twilio env vars are missing, status='failed' is logged but no exception is thrown.

## Trigger functions (all exported from sms.ts)
- sendBookingConfirmation — trigger_type: 'booking_confirmation'
- send24HrReminder — 'reminder_24hr'
- sendCancellationReceipt — 'cancellation' (>24hr) or 'forfeiture' (<24hr)
- sendTrainerCancellationAlert — 'cancellation'
- sendLowPackageAlert — 'low_package' (fires at 3 remaining)
- sendRenewalReminder — 'renewal' (fires at 1 remaining)
- sendExpirationWarning — 'expiration_warning'
- sendWaitlistNotification — 'waitlist_opened'

## sms_log trigger_type CHECK constraint
Allowed values: 'booking_confirmation','reminder_24hr','cancellation','forfeiture','low_package','renewal','expiration_warning','waitlist_opened'

**Why:** All SMS calls must be fire-and-forget (non-blocking) — never await them before sending the HTTP response. Wrap in async IIFE after res.json().
