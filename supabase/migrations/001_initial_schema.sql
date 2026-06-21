-- Top Shape Fitness — Initial Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- users
CREATE TABLE IF NOT EXISTS public.users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text UNIQUE NOT NULL,
  first_name      text,
  last_name       text,
  phone           text,
  role            text NOT NULL CHECK (role IN ('admin','trainer','client')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_active       boolean NOT NULL DEFAULT true
);

-- trainers
CREATE TABLE IF NOT EXISTS public.trainers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_color   text CHECK (display_color IN ('cyan','banana','grape','basil')),
  bio             text,
  is_active       boolean NOT NULL DEFAULT true
);

-- clients
CREATE TABLE IF NOT EXISTS public.clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notes           text,
  waiver_signed   boolean NOT NULL DEFAULT false,
  waiver_date     timestamptz,
  created_by      uuid REFERENCES public.users(id)
);

-- packages
CREATE TABLE IF NOT EXISTS public.packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  session_count   integer NOT NULL,
  duration_days   integer NOT NULL DEFAULT 180,
  is_active       boolean NOT NULL DEFAULT true
);

-- client_packages
CREATE TABLE IF NOT EXISTS public.client_packages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id            uuid NOT NULL REFERENCES public.packages(id),
  owner_client_id       uuid NOT NULL REFERENCES public.clients(id),
  sessions_total        integer NOT NULL,
  sessions_remaining    integer NOT NULL,
  sessions_used         integer NOT NULL DEFAULT 0,
  purchase_date         timestamptz,
  expiration_date       timestamptz,
  expiration_waived     boolean NOT NULL DEFAULT false,
  is_active             boolean NOT NULL DEFAULT true,
  is_shared             boolean NOT NULL DEFAULT false,
  shared_with_client_id uuid REFERENCES public.clients(id)
);

-- availability
CREATE TABLE IF NOT EXISTS public.availability (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id      uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  day_of_week     text NOT NULL CHECK (day_of_week IN ('sun','mon','tue','wed','thu','fri','sat')),
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  is_recurring    boolean NOT NULL DEFAULT true,
  specific_date   date,
  is_active       boolean NOT NULL DEFAULT true
);

-- appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                 uuid NOT NULL REFERENCES public.clients(id),
  trainer_id                uuid NOT NULL REFERENCES public.trainers(id),
  client_package_id         uuid NOT NULL REFERENCES public.client_packages(id),
  appointment_date          date NOT NULL,
  start_time                time NOT NULL,
  end_time                  time NOT NULL,
  duration_minutes          integer NOT NULL CHECK (duration_minutes IN (30,45,60)),
  status                    text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show','forfeited')),
  session_deducted          boolean NOT NULL DEFAULT false,
  deducted_at               timestamptz,
  cancelled_at              timestamptz,
  cancelled_by              uuid REFERENCES public.users(id),
  cancellation_within_24hr  boolean NOT NULL DEFAULT false,
  forfeiture_waived         boolean NOT NULL DEFAULT false,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- waitlist
CREATE TABLE IF NOT EXISTS public.waitlist (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES public.clients(id),
  trainer_id            uuid REFERENCES public.trainers(id),
  requested_date        date NOT NULL,
  requested_start_time  time NOT NULL,
  duration_minutes      integer NOT NULL,
  status                text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','notified','booked','expired')),
  notified_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- payroll_sessions
CREATE TABLE IF NOT EXISTS public.payroll_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES public.appointments(id),
  trainer_id      uuid NOT NULL REFERENCES public.trainers(id),
  session_date    date NOT NULL,
  duration_minutes integer NOT NULL,
  hours           numeric(5,2) NOT NULL,
  pay_period_start date NOT NULL,
  pay_period_end  date NOT NULL,
  color_code      text CHECK (color_code IN ('tomato','charcoal')),
  notes           text
);

-- sms_log
CREATE TABLE IF NOT EXISTS public.sms_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   uuid NOT NULL REFERENCES public.users(id),
  phone_number        text NOT NULL,
  trigger_type        text NOT NULL CHECK (trigger_type IN (
                        'booking_confirmation','reminder_24hr','cancellation',
                        'forfeiture','low_package','renewal','expiration_warning','waitlist_opened'
                      )),
  message_body        text NOT NULL,
  status              text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','delivered','failed')),
  twilio_sid          text,
  sent_at             timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security (enable but allow service role full access)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own user record
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can read own record') THEN
    CREATE POLICY "Users can read own record" ON public.users FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

-- Allow authenticated users to read all tables (app-level enforcement handles restrictions)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Authenticated read users') THEN
    CREATE POLICY "Authenticated read users" ON public.users FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trainers' AND policyname = 'Authenticated read trainers') THEN
    CREATE POLICY "Authenticated read trainers" ON public.trainers FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'Authenticated read clients') THEN
    CREATE POLICY "Authenticated read clients" ON public.clients FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'packages' AND policyname = 'Authenticated read packages') THEN
    CREATE POLICY "Authenticated read packages" ON public.packages FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_packages' AND policyname = 'Authenticated read client_packages') THEN
    CREATE POLICY "Authenticated read client_packages" ON public.client_packages FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'availability' AND policyname = 'Authenticated read availability') THEN
    CREATE POLICY "Authenticated read availability" ON public.availability FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'appointments' AND policyname = 'Authenticated read appointments') THEN
    CREATE POLICY "Authenticated read appointments" ON public.appointments FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'waitlist' AND policyname = 'Authenticated read waitlist') THEN
    CREATE POLICY "Authenticated read waitlist" ON public.waitlist FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payroll_sessions' AND policyname = 'Authenticated read payroll_sessions') THEN
    CREATE POLICY "Authenticated read payroll_sessions" ON public.payroll_sessions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sms_log' AND policyname = 'Authenticated read sms_log') THEN
    CREATE POLICY "Authenticated read sms_log" ON public.sms_log FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
