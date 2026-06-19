-- Migration 003: RLS policies for trainer-owned data
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).

-- Trainers can read their own trainer record
create policy "Trainers can read own trainer record"
  on public.trainers
  for select
  using (user_id = auth.uid());

-- Trainers can insert their own availability blocks
create policy "Trainers can insert own availability"
  on public.availability
  for insert
  with check (
    trainer_id = (select id from public.trainers where user_id = auth.uid())
  );

-- Trainers can update their own availability blocks
create policy "Trainers can update own availability"
  on public.availability
  for update
  using (
    trainer_id = (select id from public.trainers where user_id = auth.uid())
  );

-- Trainers can delete (deactivate) their own availability blocks
create policy "Trainers can delete own availability"
  on public.availability
  for delete
  using (
    trainer_id = (select id from public.trainers where user_id = auth.uid())
  );

-- Trainers can read their own appointments
create policy "Trainers can read own appointments"
  on public.appointments
  for select
  using (
    trainer_id = (select id from public.trainers where user_id = auth.uid())
  );

-- Trainers can read their own payroll sessions
create policy "Trainers can read own payroll_sessions"
  on public.payroll_sessions
  for select
  using (
    trainer_id = (select id from public.trainers where user_id = auth.uid())
  );
