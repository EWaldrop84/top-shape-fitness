---
name: Document signing system
description: Architecture and deployment requirements for the waiver + training agreement signing flow
---

## Overview
Two documents: Liability Waiver (client-blocking on login) and SC Personal Training Membership Agreement (shown to client after admin assigns package).

## Files
- `supabase/migrations/008_client_signatures.sql` — must be run in Supabase SQL Editor before the feature works
- `artifacts/top-shape-fitness/src/components/WaiverModal.tsx` — full-screen blocking modal for clients on first login
- `artifacts/top-shape-fitness/src/components/TrainingAgreementModal.tsx` — modal shown in admin view after package assignment
- `supabase/functions/upload-signed-document/index.ts` — Deno edge function for Google Drive upload

## App.tsx waiver check
After login for client role: queries `clients` then `client_signatures`. If `client_signatures` table doesn't exist (migration not run), error is swallowed and waiverPending stays false (safe fallback). Pattern: `setWaiverPending(!sigErr && !waiverRow)`.

## Admin training agreement flow
1. Admin opens "Assign Package" in ClientDetail → fills session type, amount paid, dates
2. Package inserted into `client_packages` → `onSuccess(agreementData)` called
3. TrainingAgreementModal opens with pre-filled admin data; client fills address/phones/emergency contact + signs
4. Saved to `client_signatures` with all extended fields

## PDF generation
Uses jsPDF (text-based, no html2canvas). Both modals generate PDFs in-browser after DB save. Drive upload is non-blocking (fire-and-forget).

## Google Drive edge function deployment
Requires:
1. `supabase functions deploy upload-signed-document` (run from Supabase CLI)
2. Supabase secret `GOOGLE_SERVICE_ACCOUNT_KEY` = full JSON string of service account key with Drive API access
3. Drive folder IDs are hardcoded: waiver=1J0jh8q3A9HWXJEqi8E5NwHmPEBZ-k5n2, agreement=1S_o0twk304dN_3ujKmpHnLByCt-aG_wE

## Logo
Documents reference `/Top_Shape_Fitness_Logo_Final_RGB.jpg` in public/. This file does not exist yet — needs to be uploaded to `artifacts/top-shape-fitness/public/`.

**Why:** Drive upload failure must never block the signing flow — signature is always saved to DB first.
