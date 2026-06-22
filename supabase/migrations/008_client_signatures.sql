-- Migration 008: Client signatures table for waiver and training agreement
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.client_signatures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('waiver', 'training_agreement')),
  signed_at timestamp with time zone DEFAULT now(),
  signature_data text NOT NULL,
  client_package_id uuid REFERENCES public.client_packages(id),
  full_name text NOT NULL,
  google_drive_file_id text,
  google_drive_url text,

  -- Training agreement specific fields
  session_type text,
  amount_paid integer,       -- stored in cents
  beginning_date date,
  ending_date date,
  sessions_purchased integer,
  address text,
  city_state_zip text,
  home_phone text,
  work_phone text,
  emergency_contact text
);

ALTER TABLE public.client_signatures ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage all signatures"
  ON public.client_signatures
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Clients can read their own signatures
CREATE POLICY "Clients can read own signatures"
  ON public.client_signatures
  FOR SELECT TO authenticated
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  );

-- Clients can insert their own signatures
CREATE POLICY "Clients can insert own signatures"
  ON public.client_signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  );
