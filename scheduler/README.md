# Jimmy Scheduler

Fully automated task scheduler with AI planning. Tasks run either locally (`jimmy daemon`) or serverless (Supabase Edge Functions + pg_cron).

## Features

- **AI Task Planning** — describe a task in plain English, LLM breaks it into steps + cron schedule
- **Step Types** — web_search, web_crawl, custom (pure LLM), email_send, browser (local only)
- **Auto Re-auth** — Gmail refresh token auto-syncs to Supabase on re-auth, zero manual updates
- **Run History** — all runs logged to Supabase with full step results
- **Email Summaries** — optional email digest after each run

---

## Setup (One Time)

### 1. Create Supabase tables

Already done if you ran the main setup SQL. Verify these exist:
```sql
scheduler_tasks
scheduler_runs
user_config
```

### 2. Deploy Edge Function (serverless mode)

```powershell
# Install Supabase CLI
npm i -g supabase

# Login
supabase login

# Link your project
supabase link --project-ref <YOUR_PROJECT_REF>

# Deploy + sync credentials
.\supabase\deploy.ps1
```

The script:
- Deploys the `scheduler-tick` Edge Function
- Sets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as secrets
- Syncs all API keys (OpenRouter, Groq, Firecrawl, Google) to `user_config` table

### 3. Register pg_cron job

Run the SQL in `supabase/functions/scheduler-tick/setup.sql` in your Supabase SQL editor.

Replace `<PROJECT_REF>` with your actual project ref, and set your service role key in the last line.

---

## Usage

### Add a Task

```
jimmy jet → CLI → Scheduler → Add new task
```

Describe it naturally:
> "Every morning at 9am, search for top AI news from the last 24 hours and email me a summary"

The LLM plans:
```json
{
  "name": "Daily AI News Digest",
  "cron": "0 9 * * *",
  "steps": [
    { "order": 1, "type": "web_search", "instruction": "Find top AI news from last 24 hours" },
    { "order": 2, "type": "email_send", "instruction": "Send summary to user" }
  ]
}
```

You can edit the cron expression before saving.

### Task Management

- **List** — see all tasks, their status, run count, next run time
- **Manage** — enable/disable, edit cron/email, view run history, run now (manual trigger), delete

### Execution Modes

**Serverless (Default)** — Tasks run in Supabase Edge Function every minute via pg_cron. Your machine can be off.

**Supported Step Types:**
- `web_search` - Search via Firecrawl API
- `web_crawl` - Scrape URLs via Firecrawl API  
- `custom` - LLM-powered tasks (OpenRouter → Groq fallback)
- `email_send` - Gmail API (auto-refresh token)

---

## How Auto Re-auth Works

When you re-authenticate Gmail via `jimmy jet`:

1. New refresh token saved to `~/.cccontrol/googleAuth/google_config.json`
2. **Automatically synced to Supabase `user_config` table**
3. Edge Function reads from `user_config` on every run
4. No manual `supabase secrets set` needed ever again

Same applies to all API keys — update `.env` and run `jimmy sync-credentials` to push changes.

---

## Cron Expression Examples

| Expression | Meaning |
|---|---|
| `* * * * *` | Every minute |
| `0 * * * *` | Every hour on the hour |
| `0 9 * * *` | Every day at 9:00 AM |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `*/15 * * * *` | Every 15 minutes |
| `0 0 1 * *` | First day of every month at midnight |

---

## Troubleshooting

### Quick Debug

Run the built-in debug tool:
```powershell
jimmy scheduler-debug
```

This checks:
- ✓ Credentials synced to Supabase
- ✓ Tasks and their run history
- ✓ Manually triggers Edge Function for testing

### Check in Supabase Dashboard

**View Task Runs:**
```sql
select * from scheduler_runs order by started_at desc limit 20;
```

**Check Cron Job Status:**
```sql
-- See if cron job is registered
select * from cron.job;

-- View recent cron executions
select * from cron.job_run_details 
where jobname = 'jimmy-scheduler-tick' 
order by start_time desc 
limit 10;
```

**View Tasks:**
```sql
select id, name, enabled, cron, next_run_at, last_run_at, run_count 
from scheduler_tasks;
```

**Complete Status Check:**
Open `scheduler/check-status.sql` and copy-paste sections into Supabase SQL Editor.

### Common Issues

**Tasks not running?**

1. Check `supabase secrets list` — ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
2. Query `user_config` table — verify credentials are present
3. Check `scheduler_runs` table — look for error messages
4. View Edge Function logs: `supabase functions logs scheduler-tick`
5. Verify pg_cron job: `select * from cron.job;`

**Gmail sends failing?**

Run `jimmy sync-credentials` to push the latest refresh token to Supabase.

**Task says "completed" but I see no output?**

Check the `scheduler_runs` table for detailed `step_results` and `output` fields.

**Cron job not registered?**

You need to run the setup SQL once: `supabase/functions/scheduler-tick/setup.sql`

---

## Architecture

All tasks run **100% serverless in Supabase** via Edge Functions + pg_cron. Your machine can be completely off.

**Step Types (all serverless):**

| Type | What it does |
|------|-------------|
| `web_search` | Search via Firecrawl API |
| `web_crawl` | Scrape URLs via Firecrawl API |
| `custom` | LLM-powered tasks (OpenRouter → Groq fallback) |
| `email_send` | Send via Gmail API (auto-refresh token) |
