-- Migration 004: Add pricing fields to packages and hourly rate to trainers
-- Run in Supabase SQL Editor

-- Package price (in cents, e.g. 50000 = $500.00)
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0;

-- Trainer hourly pay rate (in cents, e.g. 4500 = $45.00/hr)
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS hourly_rate_cents integer NOT NULL DEFAULT 0;
