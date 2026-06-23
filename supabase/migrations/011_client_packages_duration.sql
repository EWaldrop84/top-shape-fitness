-- Add duration_minutes to client_packages so each package can store its session length.
-- Run this in the Supabase SQL Editor.

ALTER TABLE client_packages
  ADD COLUMN IF NOT EXISTS duration_minutes integer CHECK (duration_minutes IN (30, 45, 60));
