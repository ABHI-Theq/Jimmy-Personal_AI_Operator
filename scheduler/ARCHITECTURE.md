# Scheduler Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR MACHINE                             │
│  ┌──────────────┐          ┌────────────────────────────────┐  │
│  │   Jimmy CLI  │          │   Local Storage                │  │
│  │              │          │   ~/.cccontrol/googleAuth/     │  │
│  │  • Add tasks │◄────────►│   google_config.json           │  │
│  │  • Manage    │          │   (refresh_token)              │  │
│  │  • Debug     │          └────────────────────────────────┘  │
│  └──────┬───────┘                                               │
│         │ Writes tasks                                          │
│         │ Syncs credentials                                     │
└─────────┼───────────────────────────────────────────────────────┘
          │
          │ HTTPS (Supabase Client)
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE CLOUD                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    PostgreSQL Database                     │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌─────────────┐ │  │
│  │  │scheduler_tasks │  │scheduler_runs  │  │user_config  │ │  │
│  │  │                │  │                │  │             │ │  │
│  │  │ • name         │  │ • task_id      │  │ • API keys  │ │  │
│  │  │ • cron         │  │ • status       │  │ • tokens    │ │  │
│  │  │ • steps        │  │ • output       │  │ • secrets   │ │  │
│  │  │ • enabled      │  │ • error        │  │             │ │  │
│  │  │ • next_run_at  │  │ • step_results │  │             │ │  │
│  │  └────────────────┘  └────────────────┘  └─────────────┘ │  │
│  └───────────┬───────────────┬───────────────────┬───────────┘  │
│              │               │                   │              │
│  ┌───────────┴───────────────┴───────────────────┴───────────┐  │
│  │                      pg_cron Extension                     │  │
│  │                                                             │  │
│  │  Job: jimmy-scheduler-tick                                 │  │
│  │  Schedule: * * * * * (every minute)                        │  │
│  │  Action: HTTP POST to Edge Function                        │  │
│  └───────────┬─────────────────────────────────────────────────┤  │
│              │ Every minute                                    │  │
│              ▼                                                 │  │
│  ┌─────────────────────────────────────────────────────────┐  │  │
│  │              Edge Function: scheduler-tick               │  │  │
│  │              (Deno runtime in Supabase)                  │  │  │
│  │                                                           │  │  │
│  │  1. Load credentials from user_config                    │  │  │
│  │  2. Query tasks WHERE enabled=true AND next_run_at <= now│  │  │
│  │  3. For each due task:                                   │  │  │
│  │     a. Create run record (status: running)               │  │  │
│  │     b. Execute each step in order:                       │  │  │
│  │        • web_search  → Firecrawl API                     │  │  │
│  │        • web_crawl   → Firecrawl API                     │  │  │
│  │        • custom      → OpenRouter/Groq LLM               │  │  │
│  │        • email_send  → Gmail API                         │  │  │
│  │        • browser     → Skip (local only)                 │  │  │
│  │     c. Update run record (status: success/failed)        │  │  │
│  │     d. Update task (last_run_at, next_run_at, count)     │  │  │
│  │     e. Send summary email if configured                  │  │  │
│  │  4. Return results                                       │  │  │
│  └─────────────────────────────────────────────────────────┘  │  │
│              │                                                 │  │
│              │ Makes API calls                                 │  │
│              ▼                                                 │  │
└──────────────┼──────────────────────────────────────────────────┘
               │
               │ HTTPS
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL APIS                               │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐ │
│  │ Firecrawl  │  │ OpenRouter │  │   Groq     │  │  Gmail   │ │
│  │   API      │  │    API     │  │    API     │  │   API    │ │
│  │            │  │            │  │            │  │          │ │
│  │ • Search   │  │ • LLM      │  │ • LLM      │  │ • Send   │ │
│  │ • Scrape   │  │ • Summary  │  │ • Fallback │  │ • OAuth  │ │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────────┘
               │
               │ Email sent
               ▼
         📧 YOUR INBOX
```

## Data Flow

### 1. Task Creation
```
User (CLI) → scheduler_tasks table
          → Sets next_run_at based on cron
```

### 2. Credential Sync
```
Local file: ~/.cccontrol/googleAuth/google_config.json
          ↓ jimmy sync-credentials
Supabase: user_config table (key-value pairs)
          ↓ Edge Function reads on every run
External APIs (authenticated)
```

### 3. Scheduled Execution
```
pg_cron (every minute)
    ↓
Edge Function triggered
    ↓
1. Load credentials from user_config
2. Query due tasks
3. For each task:
   ├─ Create run record
   ├─ Execute steps sequentially
   ├─ Store results
   ├─ Update task counters
   ├─ Calculate next_run_at
   └─ Send email summary
    ↓
Results in scheduler_runs table
```

### 4. Manual Execution
```
User (CLI: "Run now")
    ↓
createRun() → scheduler_runs
    ↓
runTask() → executes steps locally (Node)
    ↓
finishRun() → updates scheduler_runs
    ↓
updateTask() → updates counters
```

## Step Execution Details

### Step Type: `web_search`
```
Input: Natural language instruction
    ↓
LLM extracts search query
    ↓
Firecrawl API search
    ↓
LLM summarizes results
    ↓
Output: Summary text
```

### Step Type: `web_crawl`
```
Input: URL or instruction
    ↓
LLM extracts URL (if needed)
    ↓
Firecrawl API scrape
    ↓
LLM extracts relevant info
    ↓
Output: Extracted content
```

### Step Type: `custom`
```
Input: Natural language instruction
    ↓
LLM processes with context
    ↓
Output: LLM response
```

### Step Type: `email_send`
```
Input: Instruction (who, what, subject)
    ↓
LLM generates email params (to, subject, body)
    ↓
Gmail API: refresh token → access token
    ↓
Send email via Gmail API
    ↓
Output: "Email sent to X"
```

### Step Type: `browser` (local only)
```
Input: Instruction
    ↓
Stagehand + Playwright
    ↓
Browser automation
    ↓
Output: Extracted data
```

## Key Design Decisions

### Why Supabase?
- ✅ Always-on execution (no local process needed)
- ✅ Built-in PostgreSQL + pg_cron
- ✅ Edge Functions (Deno) for serverless execution
- ✅ Real-time database for monitoring
- ✅ Free tier supports most use cases

### Why `user_config` Table?
- ✅ No manual secret updates on re-auth
- ✅ Dynamic credential loading
- ✅ Edge Function reads fresh values every run
- ✅ Multi-user support (if needed)

### Why Two Execution Modes?
- **Serverless (Edge Function):** Most step types
- **Local (daemon):** Browser automation only (Playwright can't run in Edge Functions)

### Why LLM Fallback Chain?
```
OpenRouter (primary)
    ↓ if fails or refuses
Groq (fallback)
    ↓ if both fail
Error logged
```

This ensures reliability even if one provider is down.

## Security

- ✅ Credentials stored in Supabase (service role access only)
- ✅ Edge Function validates auth header (Bearer token)
- ✅ Gmail refresh token auto-rotates (OAuth2)
- ✅ Local config files have 0600 permissions
- ✅ No secrets in code or git

## Monitoring

**Real-time:**
- `jimmy scheduler-debug` — CLI tool

**Historical:**
- `scheduler_runs` table — all executions
- `cron.job_run_details` — pg_cron logs
- Edge Function logs — Supabase dashboard

**Manual:**
- SQL queries in `scheduler/check-status.sql`

## Scalability

Current setup handles:
- **Tasks:** Unlimited (Postgres capacity)
- **Executions:** 1/minute per task
- **Concurrency:** All due tasks execute in parallel (Promise.allSettled)
- **Free tier limits:**
  - Supabase: 500MB DB, 2GB bandwidth/month
  - OpenRouter: Pay-per-use
  - Firecrawl: 500 credits/month free

To scale beyond free tier:
- Upgrade Supabase plan
- Add rate limiting
- Batch tasks into groups
