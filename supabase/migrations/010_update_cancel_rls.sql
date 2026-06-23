-- Migration 010: Expand client cancellation to all trainers (not just Eric)
--
-- Drops the Eric-only cancel policy and replaces it with one that lets
-- clients cancel any of their own upcoming scheduled appointments.
--
-- Run in Supabase SQL Editor.

DROP POLICY IF EXISTS "clients_can_cancel_eric_appointments" ON public.appointments;

CREATE POLICY "clients_can_cancel_own_appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  -- Client owns this appointment
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  -- Only upcoming or today
  AND appointment_date >= CURRENT_DATE
  -- Only if currently scheduled
  AND status = 'scheduled'
)
WITH CHECK (
  -- Client still owns this appointment
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  -- Date still valid
  AND appointment_date >= CURRENT_DATE
  -- Can only set status to 'cancelled'
  AND status = 'cancelled'
);
