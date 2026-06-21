-- Migration 007: Admin RLS policies
-- Adds SELECT + INSERT + UPDATE + DELETE policies for admin users on tables
-- that the admin dashboard reads/writes directly via the Supabase client.
-- Run in: Supabase Dashboard → SQL Editor → New query

-- Helper: true when the calling user has role='admin' in public.users
-- (reused across all policies below)

-- ── payroll_sessions ──────────────────────────────────────────────────────────

-- Admins can read ALL payroll_sessions (across all trainers)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payroll_sessions' AND policyname = 'Admins can read payroll_sessions'
  ) THEN
    CREATE POLICY "Admins can read payroll_sessions"
      ON public.payroll_sessions FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- Admins can insert payroll_sessions (sync operation)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payroll_sessions' AND policyname = 'Admins can insert payroll_sessions'
  ) THEN
    CREATE POLICY "Admins can insert payroll_sessions"
      ON public.payroll_sessions FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- Admins can update payroll_sessions (e.g. color_code, notes)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payroll_sessions' AND policyname = 'Admins can update payroll_sessions'
  ) THEN
    CREATE POLICY "Admins can update payroll_sessions"
      ON public.payroll_sessions FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- Admins can delete payroll_sessions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payroll_sessions' AND policyname = 'Admins can delete payroll_sessions'
  ) THEN
    CREATE POLICY "Admins can delete payroll_sessions"
      ON public.payroll_sessions FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ── appointments ──────────────────────────────────────────────────────────────
-- Admins need full read access to all appointments (payroll sync, calendar, revenue)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'appointments' AND policyname = 'Admins can read appointments'
  ) THEN
    CREATE POLICY "Admins can read appointments"
      ON public.appointments FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'appointments' AND policyname = 'Admins can insert appointments'
  ) THEN
    CREATE POLICY "Admins can insert appointments"
      ON public.appointments FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'appointments' AND policyname = 'Admins can update appointments'
  ) THEN
    CREATE POLICY "Admins can update appointments"
      ON public.appointments FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'appointments' AND policyname = 'Admins can delete appointments'
  ) THEN
    CREATE POLICY "Admins can delete appointments"
      ON public.appointments FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ── clients ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients' AND policyname = 'Admins can insert clients'
  ) THEN
    CREATE POLICY "Admins can insert clients"
      ON public.clients FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients' AND policyname = 'Admins can update clients'
  ) THEN
    CREATE POLICY "Admins can update clients"
      ON public.clients FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ── users ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Admins can insert users'
  ) THEN
    CREATE POLICY "Admins can insert users"
      ON public.users FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Admins can update users'
  ) THEN
    CREATE POLICY "Admins can update users"
      ON public.users FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ── trainers ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trainers' AND policyname = 'Admins can insert trainers'
  ) THEN
    CREATE POLICY "Admins can insert trainers"
      ON public.trainers FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trainers' AND policyname = 'Admins can update trainers'
  ) THEN
    CREATE POLICY "Admins can update trainers"
      ON public.trainers FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ── client_packages ───────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'client_packages' AND policyname = 'Admins can insert client_packages'
  ) THEN
    CREATE POLICY "Admins can insert client_packages"
      ON public.client_packages FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'client_packages' AND policyname = 'Admins can update client_packages'
  ) THEN
    CREATE POLICY "Admins can update client_packages"
      ON public.client_packages FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;
