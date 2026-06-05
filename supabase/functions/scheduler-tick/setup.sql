-- Jimmy Scheduler — One-time setup SQL
-- Run this in your Supabase SQL Editor after deploying the Edge Function.
-- Replace <PROJECT_REF> with your actual Supabase project reference ID.
-- Replace <SERVICE_ROLE_KEY> with your actual service role key.

-- 1. Enable pg_cron extension (if not already enabled)
create extension if not exists pg_cron;
grant usage on schema cron to postgres;

-- 2. Create user_config table for dynamic credential storage
--    (allows automatic re-auth without manual secrets updates)
create table if not exists user_config (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- 3. Enable Row Level Security (optional but recommended for multi-user setups)
alter table user_config enable row level security;

-- Allow service role to read/write
create policy "Service role full access" on user_config
  for all using (auth.role() = 'service_role');

-- 4. Schedule the Edge Function to fire every minute
--    IMPORTANT: Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> below with your actual values!
--    Get your service role key from: Supabase Dashboard → Settings → API → service_role (secret)
select cron.schedule(
  'jimmy-scheduler-tick',          -- job name (unique)
  '* * * * *',                      -- every minute
  $$
  select net.http_post(
    url     := 'https://zbgjrdlggpifbdbblbxa.supabase.co/functions/v1/scheduler-tick',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZ2pyZGxnZ3BpZmJkYmJsYnhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU5MjI0MywiZXhwIjoyMDk2MTY4MjQzfQ.hL4_0oarUBHpHeEQOsNt_Z_7Fa7a11oRouizB9AeKrM'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ══════════════════════════════════════════════════════════════════════════════
-- DONE! Your scheduler will now run every minute.
--
-- To verify the cron job was created:
-- select * from cron.job;
--
-- To manually trigger the function (for testing):
-- select net.http_post(
--   url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduler-tick',
--   headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
--   body    := '{}'::jsonb
-- );
--
-- To view the last run:
-- select jobid, last_run_status, run_count from cron.job_run_details where jobname = 'jimmy-scheduler-tick' order by start_time desc limit 5;
--
-- To remove the cron job later:
-- select cron.unschedule('jimmy-scheduler-tick');
