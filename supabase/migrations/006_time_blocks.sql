-- Migration 006: Time blocks (vacation, personal time, admin hold)
-- Run in Supabase SQL Editor

-- 1. Series table (tracks recurring block rules)
CREATE TABLE IF NOT EXISTS public.time_block_series (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id       uuid NOT NULL REFERENCES public.trainers(id),
  days_of_week     integer[] NOT NULL,
  start_time       time NOT NULL,
  end_time         time NOT NULL,
  reason           text NOT NULL DEFAULT 'time_off',
  notes            text,
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES public.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. Individual time block instances
CREATE TABLE IF NOT EXISTS public.time_blocks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id            uuid NOT NULL REFERENCES public.trainers(id),
  date                  date NOT NULL,
  start_time            time NOT NULL,
  end_time              time NOT NULL,
  reason                text NOT NULL DEFAULT 'time_off',
  notes                 text,
  is_recurring          boolean NOT NULL DEFAULT false,
  recurring_days        integer[],
  recurring_series_id   uuid REFERENCES public.time_block_series(id) ON DELETE SET NULL,
  is_cancelled          boolean NOT NULL DEFAULT false,
  created_by            uuid REFERENCES public.users(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes for common queries
CREATE INDEX IF NOT EXISTS time_blocks_trainer_date_idx ON public.time_blocks (trainer_id, date);
CREATE INDEX IF NOT EXISTS time_blocks_series_idx ON public.time_blocks (recurring_series_id);

-- 4. RLS
ALTER TABLE public.time_block_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Authenticated read time_block_series"
  ON public.time_block_series FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "Authenticated read time_blocks"
  ON public.time_blocks FOR SELECT TO authenticated USING (true);
