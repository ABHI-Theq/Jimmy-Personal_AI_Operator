-- ════════════════════════════════════════════════════════════════════════════════
-- Jimmy Scheduler — One-Time Setup SQL (READY TO RUN)
-- Copy this entire file and paste it into your Supabase SQL Editor, then click RUN.
-- ════════════════════════════════════════════════════════════════════════════════

-- 1. Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- 2. Create user_config table for dynamic credential storage
--    (already exists, but this ensures it's there)
CREATE TABLE IF NOT EXISTS user_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row Level Security (optional but recommended)
ALTER TABLE user_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Service role full access" ON user_config;

-- Allow service role to read/write
CREATE POLICY "Service role full access" ON user_config
  FOR ALL USING (auth.role() = 'service_role');

-- 4. Schedule the Edge Function to fire every minute
--    YOUR credentials are already filled in below!

SELECT cron.schedule(
  'jimmy-scheduler-tick',          -- job name (unique)
  '* * * * *',                      -- every minute
  $$
  SELECT net.http_post(
    url     := 'https://zbgjrdlggpifbdbblbxa.supabase.co/functions/v1/scheduler-tick',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZ2pyZGxnZ3BpZmJkYmJsYnhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU5MjI0MywiZXhwIjoyMDk2MTY4MjQzfQ.hL4_0oarUBHpHeEQOsNt_Z_7Fa7a11oRouizB9AeKrM'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ════════════════════════════════════════════════════════════════════════════════
-- ✅ DONE! Your scheduler will now run every minute.
-- ════════════════════════════════════════════════════════════════════════════════

-- Verify the cron job was created:
SELECT jobid, jobname, schedule, active FROM cron.job;

-- Check if it's running (wait 1-2 minutes after setup, then run this):
-- SELECT jobname, runid, status, return_message, start_time 
-- FROM cron.job_run_details 
-- WHERE jobname = 'jimmy-scheduler-tick' 
-- ORDER BY start_time DESC 
-- LIMIT 10;

