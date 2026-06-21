-- Migration 005: Consultation sessions, recurring bookings, client custom pricing
-- Run in Supabase SQL Editor

-- 1. Add session_type to appointments (training or consultation)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'training'
  CHECK (session_type IN ('training', 'consultation'));

-- 2. Make client_package_id nullable (consultations have no package)
ALTER TABLE public.appointments
  ALTER COLUMN client_package_id DROP NOT NULL;

-- 3. Add recurring fields to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS recurring_days integer[];

-- 4. Recurring series table (tracks active recurrence rules)
CREATE TABLE IF NOT EXISTS public.recurring_series (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id        uuid NOT NULL REFERENCES public.trainers(id),
  client_id         uuid NOT NULL REFERENCES public.clients(id),
  client_package_id uuid REFERENCES public.client_packages(id),
  days_of_week      integer[] NOT NULL,
  start_time        time NOT NULL,
  duration_minutes  integer NOT NULL CHECK (duration_minutes IN (30,45,60)),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS recurring_series_id uuid
  REFERENCES public.recurring_series(id) ON DELETE SET NULL;

-- 5. Client custom pricing table
CREATE TABLE IF NOT EXISTS public.client_custom_pricing (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  package_name        text NOT NULL,
  session_count       integer NOT NULL,
  custom_price_cents  integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 6. Grandfathered flag on clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_grandfathered boolean NOT NULL DEFAULT false;

-- 7. Price paid on client_packages (for grandfathered/custom pricing records)
ALTER TABLE public.client_packages
  ADD COLUMN IF NOT EXISTS price_paid_cents integer;

-- 8. RLS for new tables
ALTER TABLE public.recurring_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_custom_pricing ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recurring_series' AND policyname = 'Authenticated read recurring_series') THEN
    CREATE POLICY "Authenticated read recurring_series" ON public.recurring_series FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_custom_pricing' AND policyname = 'Authenticated read client_custom_pricing') THEN
    CREATE POLICY "Authenticated read client_custom_pricing" ON public.client_custom_pricing FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
