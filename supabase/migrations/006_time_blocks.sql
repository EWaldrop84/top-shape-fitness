-- Migration 006: Time blocks (vacation, personal time, admin hold)
-- Run in Supabase SQL Editor at https://supabase.com/dashboard/project/nhaescbzxxgowflgrgll/sql

-- 1. Series table — one row per recurring rule
CREATE TABLE IF NOT EXISTS public.time_block_series (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id       text NOT NULL,
  recurring_days   integer[],
  start_time       time NOT NULL,
  end_time         time NOT NULL,
  reason           text DEFAULT 'time_off',
  notes            text,
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. Individual time block instances
CREATE TABLE IF NOT EXISTS public.time_blocks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id            text NOT NULL,
  date                  date NOT NULL,
  start_time            time NOT NULL,
  end_time              time NOT NULL,
  reason                text DEFAULT 'time_off',
  notes                 text,
  is_recurring          boolean NOT NULL DEFAULT false,
  recurring_days        integer[],
  recurring_series_id   uuid REFERENCES public.time_block_series(id) ON DELETE CASCADE,
  is_cancelled          boolean NOT NULL DEFAULT false,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes for common calendar queries
CREATE INDEX IF NOT EXISTS time_blocks_trainer_date_idx ON public.time_blocks (trainer_id, date);
CREATE INDEX IF NOT EXISTS time_blocks_series_idx       ON public.time_blocks (recurring_series_id);
CREATE INDEX IF NOT EXISTS time_blocks_cancelled_idx    ON public.time_blocks (is_cancelled, date);

-- 4. RLS — service role bypasses automatically; authenticated users can read
ALTER TABLE public.time_block_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_blocks       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'time_block_series' AND policyname = 'Authenticated read time_block_series'
  ) THEN
    CREATE POLICY "Authenticated read time_block_series"
      ON public.time_block_series FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'time_blocks' AND policyname = 'Authenticated read time_blocks'
  ) THEN
    CREATE POLICY "Authenticated read time_blocks"
      ON public.time_blocks FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
