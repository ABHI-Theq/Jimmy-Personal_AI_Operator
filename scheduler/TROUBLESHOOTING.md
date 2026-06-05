# Scheduler Troubleshooting Guide

## Quick Diagnosis

Run this first:
```powershell
jimmy scheduler-debug
```

This automatically checks:
- ✅ All credentials synced
- 📋 Tasks status and history
- 🧪 Edge Function connectivity

---

## Issue: "Tasks not running"

### Symptom
- Tasks show `run_count: 0`
- `last_run_at: never`
- No entries in `scheduler_runs` table

### Diagnosis Steps

**1. Check if pg_cron job exists:**
```sql
SELECT * FROM cron.job WHERE jobname = 'jimmy-scheduler-tick';
```

**Expected:** 1 row with `schedule = '* * * * *'` and `active = true`

**If empty:**
→ You haven't run the setup SQL yet
→ **Fix:** Run `scheduler/SETUP-READY.sql` in Supabase SQL Editor

---

**2. Check if pg_cron is executing:**
```sql
SELECT * FROM cron.job_run_details 
WHERE jobname = 'jimmy-scheduler-tick' 
ORDER BY start_time DESC 
LIMIT 10;
```

**Expected:** New rows every minute with `status = 'succeeded'`

**If empty:**
→ pg_cron extension not enabled
→ **Fix:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;
```

**If status = 'failed':**
→ Check `return_message` column for error details
→ Common issues:
  - Invalid Edge Function URL
  - Invalid auth token
  - Network connectivity

---

**3. Check Edge Function logs:**
```powershell
supabase functions logs scheduler-tick --limit 50
```

**Look for:**
- "Unauthorized" → Wrong service role key
- "Credential load failed" → Missing entries in `user_config`
- "LLM did not return valid JSON" → LLM provider issue
- "Gmail token refresh failed" → Invalid refresh token

---

**4. Check if tasks are due:**
```sql
SELECT id, name, enabled, next_run_at, now() as current_time
FROM scheduler_tasks
WHERE enabled = true AND next_run_at <= now();
```

**Expected:** 1+ rows if tasks should be running now

**If empty:**
→ No tasks are due yet
→ Check `next_run_at` value — might be scheduled for future
→ **Fix:** Manually trigger via `jimmy jet → Scheduler → Manage → Run now`

---

**5. Verify credentials in Supabase:**
```sql
SELECT key FROM user_config ORDER BY key;
```

**Expected keys:**
- `firecrawl_key`
- `google_client_id`
- `google_client_secret`
- `google_refresh_token` ← **CRITICAL for email steps**
- `groq_api_key`
- `openrouter_key`
- `openrouter_model`

**If any missing:**
→ **Fix:** Run `jimmy sync-credentials`

---

## Issue: "Email not sending"

### Symptom
- Task completes successfully
- But no email received
- Or `scheduler_runs` shows email step failed

### Diagnosis Steps

**1. Check if `google_refresh_token` is in Supabase:**
```powershell
jimmy scheduler-debug
```

Look for: `✓ google_refresh_token (updated: ...)`

**If ✖:**
→ **Fix:** Run `jimmy sync-credentials`

---

**2. Check step results:**
```sql
SELECT id, task_id, status, step_results 
FROM scheduler_runs 
WHERE status = 'failed' OR output LIKE '%email%'
ORDER BY started_at DESC 
LIMIT 5;
```

Look at the `step_results` JSON for email_send step:
```json
{
  "order": 2,
  "instruction": "Send email...",
  "output": "ERROR: Gmail token refresh failed",
  "success": false
}
```

**Common errors:**
- "Invalid To header" → Email address format wrong
- "Gmail token refresh failed" → Refresh token expired or invalid
- "Could not parse email params" → LLM didn't return valid JSON

**Fixes:**
- Invalid token → Re-authenticate Gmail via `jimmy jet`
- Email format → Check task step instruction
- LLM parsing → Try manual trigger to see LLM output

---

**3. Test Gmail auth locally:**
```powershell
jimmy jet → Email
```

Try sending a test email. If this works, Gmail auth is fine.

---

**4. Check if Gmail refresh token is valid:**
```powershell
# Check local file
cat ~\.cccontrol\googleAuth\google_config.json
```

If `refresh_token` exists and recent:
→ Re-sync: `jimmy sync-credentials`

If missing or expired:
→ Re-authenticate: `jimmy jet` → authenticate Gmail

---

## Issue: "LLM errors"

### Symptom
- Step results show: "ERROR: All LLM providers failed"
- Or: "LLM did not return valid JSON"

### Diagnosis Steps

**1. Check API keys:**
```powershell
jimmy scheduler-debug
```

Verify:
- ✓ `openrouter_key`
- ✓ `groq_api_key`

**If missing:**
→ Update `.env` file
→ Run `jimmy sync-credentials`

---

**2. Check OpenRouter account:**
- Go to https://openrouter.ai/
- Check credit balance
- Check if model `openai/gpt-4o-mini` is available

---

**3. Check Groq account:**
- Go to https://console.groq.com/
- Check API key is valid
- Check rate limits

---

**4. View actual LLM responses:**
```powershell
supabase functions logs scheduler-tick --limit 50
```

Look for LLM response in logs.

**Common issues:**
- "User Safety: safe" → Model refused due to content policy
- Rate limit errors → Too many requests
- Invalid JSON → Model returned prose instead of JSON

**Fixes:**
- Content policy → Rephrase task instruction
- Rate limits → Add delays or upgrade plan
- Invalid JSON → Add more explicit JSON instructions in step

---

## Issue: "Web search/crawl not working"

### Symptom
- Step shows: "(web search unavailable)"
- Or: "Search failed: 401"

### Diagnosis Steps

**1. Check Firecrawl key:**
```powershell
jimmy scheduler-debug
```

Verify: `✓ firecrawl_key`

**If missing:**
→ Get API key from https://firecrawl.dev/
→ Add to `.env`: `FIRECRAWL_KEY=your-key`
→ Run `jimmy sync-credentials`

---

**2. Check Firecrawl account:**
- Go to https://firecrawl.dev/dashboard
- Check credit balance (500 free credits)
- Check API key is active

---

**3. Test manually:**
```powershell
jimmy jet → Ask
```

Then ask: "Search for latest AI news"

If this works, Firecrawl is configured correctly.

---

## Issue: "401 Unauthorized"

### Symptom
- Edge Function returns 401
- Or cron job shows "Unauthorized"

### Diagnosis Steps

**1. Check service role key in setup SQL:**

Open `scheduler/SETUP-READY.sql` and verify the Bearer token matches your actual service role key.

Get the correct key:
- Supabase Dashboard → Settings → API → service_role (secret)

**2. Update pg_cron job:**
```sql
-- Delete old job
SELECT cron.unschedule('jimmy-scheduler-tick');

-- Re-run the setup SQL with correct token
```

---

## Issue: "Task stuck in 'running' status"

### Symptom
- `scheduler_runs` shows `status = 'running'`
- But task never completes

### Diagnosis

Edge Function likely crashed mid-execution.

**Fix:**
```sql
-- Manually mark as failed
UPDATE scheduler_runs 
SET status = 'failed', 
    error = 'Timeout',
    finished_at = NOW()
WHERE status = 'running';
```

Then check Edge Function logs to see what caused the crash.

---

## Issue: "Next run time not updating"

### Symptom
- Task runs but `next_run_at` stays the same
- Task doesn't run again

### Diagnosis

**Check the cron expression:**
```sql
SELECT id, name, cron, next_run_at FROM scheduler_tasks;
```

**Verify it's valid:** https://crontab.guru/

**Common mistakes:**
- `20 9 * * *` → 9:20 AM (correct)
- `9 20 * * *` → 8:20 PM (wrong - hour comes before minute)

**Fix:**
```powershell
jimmy jet → Scheduler → Manage → [task] → Edit cron schedule
```

---

## Issue: "Can't connect to Supabase"

### Symptom
- CLI shows: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set"
- Or: Connection timeout

### Diagnosis Steps

**1. Check `.env` file:**
```
SUPABASE_URL=https://zbgjrdlggpifbdbblbxa.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

Both must be present and correct.

---

**2. Test connection:**
```powershell
jimmy scheduler-debug
```

If credentials section loads, connection works.

---

**3. Check Supabase project status:**
- Go to https://supabase.com/dashboard
- Ensure project is active (not paused)

---

## Prevention Tips

1. **Always use `jimmy scheduler-debug` first** — saves 90% of debugging time

2. **After any auth changes:**
   ```powershell
   jimmy sync-credentials
   ```

3. **Monitor regularly:**
   - Check `scheduler_runs` table weekly
   - Review Edge Function logs for errors

4. **Test tasks manually before scheduling:**
   ```powershell
   jimmy jet → Scheduler → Manage → Run now
   ```

5. **Use clear task instructions:**
   - ✅ "Search for AI news from last 24 hours"
   - ❌ "Get news" (too vague)

6. **Start with longer intervals:**
   - Test with `*/10 * * * *` (every 10 min)
   - Then reduce to desired frequency

---

## Getting Help

**Logs to collect:**
```powershell
# 1. Debug output
jimmy scheduler-debug > debug.txt

# 2. Edge Function logs
supabase functions logs scheduler-tick --limit 100 > function-logs.txt

# 3. Recent runs
# (Run in Supabase SQL Editor, copy results)
SELECT * FROM scheduler_runs ORDER BY started_at DESC LIMIT 20;

# 4. Cron status
SELECT * FROM cron.job_run_details 
WHERE jobname = 'jimmy-scheduler-tick' 
ORDER BY start_time DESC LIMIT 20;
```

Share these when asking for help!


---

## Issue: "Browser steps not working"

### Symptom
- Task has `browser` step type
- Step result shows: "Browser steps require local daemon"
- No browser automation happening

### Solution

Browser steps cannot run in Supabase Edge Functions (Playwright requires Node.js/Bun, not Deno).

**Start the local daemon:**
```powershell
jimmy daemon
```

Keep it running in a separate terminal, or use pm2:
```powershell
npm i -g pm2
pm2 start "bun run index.ts daemon" --name jimmy-daemon
pm2 logs jimmy-daemon
```

**Alternative: Use web_crawl instead**

For most web scraping tasks, `web_crawl` works better than `browser` because:
- Runs serverless (no daemon needed)
- Uses Firecrawl which handles JavaScript rendering
- More reliable for scheduled tasks

Only use `browser` steps when you need:
- Complex multi-step interactions
- Form submissions requiring authentication
- Tasks that require a real browser session

**Check which step type to use:**
- Static content or API → `web_search` or `web_crawl`
- AI-powered tasks → `custom`
- Sending results → `email_send`
- Complex browser automation → `browser` (requires daemon)

---
