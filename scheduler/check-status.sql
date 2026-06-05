-- ════════════════════════════════════════════════════════════════════════════════
-- Jimmy Scheduler Status Check
-- Copy and paste each section into Supabase SQL Editor to debug your scheduler
-- ════════════════════════════════════════════════════════════════════════════════

-- 1. CHECK IF PG_CRON JOB EXISTS
-- Should show: jimmy-scheduler-tick job running every minute
select 
  jobid,
  jobname,
  schedule,
  active,
  database
from cron.job;

-- 2. CHECK RECENT CRON JOB RUNS
-- Should show executions every minute with status and return messages
select 
  jobname,
  runid,
  status,
  return_message,
  start_time,
  end_time
from cron.job_run_details 
where jobname = 'jimmy-scheduler-tick' 
order by start_time desc 
limit 10;

-- 3. CHECK YOUR TASKS
-- Shows all tasks, when they should run next, and run counts
select 
  id,
  name,
  enabled,
  cron,
  next_run_at,
  last_run_at,
  run_count,
  summary_email,
  jsonb_array_length(steps::jsonb) as step_count
from scheduler_tasks
order by created_at desc;

-- 4. CHECK TASK RUNS (EXECUTION HISTORY)
-- Shows actual task executions with results
select 
  r.id,
  t.name as task_name,
  r.status,
  r.started_at,
  r.finished_at,
  r.output,
  r.error,
  jsonb_array_length(r.step_results::jsonb) as steps_executed
from scheduler_runs r
left join scheduler_tasks t on r.task_id = t.id
order by r.started_at desc
limit 20;

-- 5. CHECK CREDENTIALS IN USER_CONFIG
-- Should show all your API keys (values hidden for security)
select 
  key,
  case 
    when key like '%token%' or key like '%secret%' or key like '%key%' 
    then '***HIDDEN***'
    else left(value, 20) || '...'
  end as value_preview,
  updated_at
from user_config
order by key;

-- 6. CHECK IF TASKS ARE DUE NOW
-- Shows tasks that should run in the next execution
select 
  id,
  name,
  cron,
  next_run_at,
  now() as current_time,
  next_run_at <= now() as is_due
from scheduler_tasks
where enabled = true;

-- ════════════════════════════════════════════════════════════════════════════════
-- TROUBLESHOOTING TIPS:
-- ════════════════════════════════════════════════════════════════════════════════
--
-- ❌ No rows in cron.job?
--    → You haven't run the setup SQL yet. Run: supabase/functions/scheduler-tick/setup.sql
--
-- ❌ cron.job exists but no runs in job_run_details?
--    → Check if pg_cron is enabled: CREATE EXTENSION IF NOT EXISTS pg_cron;
--    → Check Edge Function logs: supabase functions logs scheduler-tick
--
-- ❌ Cron runs but scheduler_runs table is empty?
--    → Edge Function might be failing. Check logs with: supabase functions logs scheduler-tick
--    → Verify secrets are set: supabase secrets list
--
-- ❌ scheduler_runs shows "failed" status?
--    → Check the error column in scheduler_runs
--    → Check if credentials are in user_config (query #5 above)
--    → Run: jimmy sync-credentials
--
-- ❌ Task says "completed" but no email sent?
--    → Check if summary_email is set on the task
--    → Verify google_refresh_token is in user_config
--    → Check step_results in scheduler_runs for email step errors
--
-- ════════════════════════════════════════════════════════════════════════════════

-- MANUAL EDGE FUNCTION TRIGGER (for testing):
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> with your actual values
/*
select net.http_post(
  url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduler-tick',
  headers := jsonb_build_object(
    'Content-Type',   'application/json',
    'Authorization',  'Bearer <SERVICE_ROLE_KEY>'
  ),
  body    := '{}'::jsonb
) as response;
*/
