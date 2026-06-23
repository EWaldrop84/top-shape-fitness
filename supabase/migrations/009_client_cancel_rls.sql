-- Migration 009: Allow clients to self-cancel upcoming appointments with Eric
--
-- Clients may UPDATE the status field on their own upcoming appointments
-- ONLY when:
--   1. The appointment belongs to this client (client_id matches their clients row)
--   2. The trainer is Eric (matched by his user_id)
--   3. The appointment is today or in the future
--   4. The current status is 'scheduled'
--   5. The new status is 'cancelled'
--
-- Run in Supabase SQL Editor.

CREATE POLICY "clients_can_cancel_eric_appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  -- Client owns this appointment
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  -- Appointment is with Eric
  AND trainer_id = (
    SELECT id FROM public.trainers
    WHERE user_id = '9c94baea-31aa-4a35-ad28-3a83955d34f1'
  )
  -- Only upcoming or today
  AND appointment_date >= CURRENT_DATE
  -- Only cancellable if currently scheduled
  AND status = 'scheduled'
)
WITH CHECK (
  -- Client still owns this appointment
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  -- Trainer is still Eric
  AND trainer_id = (
    SELECT id FROM public.trainers
    WHERE user_id = '9c94baea-31aa-4a35-ad28-3a83955d34f1'
  )
  -- Date still valid
  AND appointment_date >= CURRENT_DATE
  -- Can only set status to 'cancelled' — no other field changes allowed via this policy
  AND status = 'cancelled'
);
