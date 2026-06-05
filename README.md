# Jimmy — Personal AI Assistant CLI

A terminal-first AI agent framework with autonomous task execution, browser automation, email operations, and serverless scheduled workflows.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Full Setup Guide](#full-setup-guide)
- [CLI Commands](#cli-commands)
- [Modes](#modes)
  - [Agent Mode](#-agent-mode)
  - [Plan Mode](#-plan-mode)
  - [Browser Agent Mode](#-browser-agent-mode)
  - [Ask Mode](#-ask-mode)
  - [Scheduler Mode](#-scheduler-mode)
- [Email Operations](#-email-operations)
- [Supabase Setup](#supabase-setup-scheduler--serverless)
- [Environment Variables](#environment-variables)
- [Models](#models)
- [Project Structure](#project-structure)
- [Dependencies](#dependencies)

---

## Quick Start

```bash
# Prerequisites: Bun runtime (https://bun.sh)
bun install

# First run — prompts for username, password, and OpenRouter API key
jimmy jet
```

---

## Full Setup Guide

### 1. Install Bun

```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

### 2. Clone and install dependencies

```bash
git clone <repo-url>
cd jimmy
bun install
```

### 3. Create your `.env` file

Copy the template below into a `.env` file at the project root. Fill in the keys you need — only `OPENROUTER_KEY` is required to start.

```env
# ── REQUIRED ─────────────────────────────────────────────────────
OPENROUTER_KEY=sk-or-v1-...
OPENROUTER_MODEL=openrouter/free        # or any model slug

# ── REQUIRED for Browser Agent and Scheduler ─────────────────────
GROQ_API_KEY=gsk_...
GOOGLE_GENERATIVE_AI_API_KEY=...        # Google AI Studio key

# ── REQUIRED for Scheduler (Supabase) ────────────────────────────
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# ── OPTIONAL — Web search and scraping ───────────────────────────
FIRECRAWL_KEY=fc-...

# ── OPTIONAL — Gmail integration ─────────────────────────────────
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
PORT=8787                               # OAuth callback port (default 8787)

# ── OPTIONAL — Telegram bot ──────────────────────────────────────
TELEGRAM_BOT_TOKEN=...
TELEGRAM_OWNER_ID=...                   # Your Telegram chat ID

# ── OPTIONAL — Browserbase (cloud browser alternative) ───────────
BROWSERBASE_API_KEY=...
```

### 4. First run

```bash
jimmy jet
```

On first launch, Jimmy prompts you to create a username and password, then your OpenRouter and Gemini API keys. These are AES-encrypted and stored in `~/.cccontrol/config.json` — never in plaintext.

After that, `jimmy jet` goes straight to the mode selector every time.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `jimmy jet` | Launch Jimmy (main mode selector) |
| `jimmy set-key` | Update your stored OpenRouter or Gemini API key |
| `jimmy reset-auth` | Wipe stored credentials and start fresh |
| `jimmy sync-credentials` | Push local API keys to Supabase `user_config` table |
| `jimmy scheduler-debug` | Debug scheduler status and test the Edge Function |

---

## Modes

### 🤖 Agent Mode

Full agentic loop with filesystem access. Give it any goal in plain English; Jimmy plans and executes file operations with a diff-based approval flow before writing anything.

**How it works:**
1. You describe a goal
2. The agent calls file/shell tools autonomously (up to 30 steps)
3. All changes are staged — nothing is written yet
4. You review a diff and approve or reject
5. If a new project folder was scaffolded, Jimmy offers to run a follow-up coding pass inside it

**Available tools:**
- `read_file` / `list_files` / `search_files` — read-only workspace access
- `create_file` / `modify_file` / `delete_file` — staged mutations
- `create_folder` — directory creation
- `execute_shell` — run shell commands (scaffolding, installs, etc.)
- `grep_search` / `file_search` — codebase search

**Example goals:**
```
Build a REST API with Express and TypeScript
Refactor all my components to use React hooks
Add input validation to every form in this project
Create a new Next.js app with Tailwind and set up routing
```

**Required env:** `OPENROUTER_KEY`

---

### 🧭 Plan Mode

Generates a structured multi-step plan for your goal. Optionally scans your workspace for context before planning. You can toggle individual steps on/off, save the plan as a `.md` file, then optionally hand off selected steps to Agent Mode for execution.

**How it works:**
1. Enter your goal
2. Choose whether to include a workspace scan
3. Jimmy generates a step-by-step plan with titles and descriptions
4. Toggle which steps you want to execute
5. Optionally save to a `.md` file
6. Optionally execute selected steps through the agent

**Good for:**
- Breaking down large features before coding
- Getting a roadmap before committing to a direction
- Reviewing AI's interpretation of your goal before execution

**Required env:** `OPENROUTER_KEY`

---

### 🌐 Browser Agent Mode

Autonomous browser automation using Stagehand. Runs an iterative Plan → Execute → Evaluate loop, refining until it hits a quality threshold (score ≥ 80/100) or exhausts 5 iterations.

**How it works:**
1. You enter a query (what to do in the browser)
2. **Planner** — LLM generates a browser automation plan
3. **Executor** — Stagehand's `agent()` runs the goal in DOM mode
4. **Evaluator** — LLM scores the result 0–100 for completeness and accuracy
5. If score < 80, it feeds back issues and retries with a refined plan
6. Stops when satisfied or after 5 iterations, returns the best result

**Output:** Console summary + optional JSON and Markdown report saved to disk

**Browser setup (for authenticated sites):**

To access sites you're already logged into (LinkedIn, Twitter, etc.), point Stagehand at your Brave browser profile:

```ts
// plan/browser-agent/executor.ts
localBrowserLaunchOptions: {
  executablePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  args: [
    '--user-data-dir=C:\\Users\\YOUR_USERNAME\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data',
    '--profile-directory=Default',
  ],
  headless: false,
}
```

**Example queries:**
```
Find top 5 AI jobs on LinkedIn with full job descriptions
Get the transcript of this YouTube video: https://...
Extract all product names and prices from this page
Search flights NYC to LA under $300 for next Friday
```

**Required env:** `GOOGLE_GENERATIVE_AI_API_KEY`

**Configuration** (in `plan/browser-agent/orchestrator.ts`):
```ts
maxIterations: 5        // max retries
timeout: 120000         // 2 min per execution
evaluationThreshold: 80 // score out of 100 to accept
```

---

### ❓ Ask Mode

Conversational Q&A with workspace access, web search, and email integration. Read-only by default — it cannot modify files. Multi-turn with session history. At the end you can email the answer or save the session as a `.md` summary.

**Available tools:**
- `read_file` / `list_files` / `search_files` / `analyze_codebase` — read your workspace
- `web_search` / `web_scrape` — search or scrape via Firecrawl
- All 16 email operations (see Email Operations section)

**Flow:**
1. Ask any question — about your code, the web, or anything
2. Jimmy answers using tools as needed (file reads, web searches, email lookups)
3. After each answer: ask another, send the answer to your email, or save a summary
4. Session summary is generated by LLM and saved to a `.md` file on exit

**Required env:** `OPENROUTER_KEY`
**Optional:** `FIRECRAWL_KEY` (for web search/scrape), Gmail credentials (for email tools)

---

### ⏰ Scheduler Mode

AI-powered task scheduler that runs entirely serverless in Supabase. You create tasks in plain English; Jimmy plans them into steps with a cron schedule. They execute in Supabase Edge Functions every minute — your machine can be completely off.

**How it works:**
1. Describe a repetitive task (e.g. "Every morning search top AI news and email me")
2. Jimmy uses AI to break it into steps (`web_search`, `web_crawl`, `email_send`, `custom`) and pick a cron schedule
3. Task is saved to Supabase `scheduler_tasks` table
4. `pg_cron` triggers the `scheduler-tick` Edge Function every minute
5. The Edge Function runs all due tasks, writes results to `scheduler_runs`

**Step types:**
| Type | What it does |
|------|-------------|
| `web_search` | Searches via Firecrawl, summarizes results with LLM |
| `web_crawl` | Scrapes a URL via Firecrawl, extracts relevant info |
| `custom` | Any LLM-driven task |
| `email_send` | Sends email via Gmail API using OAuth refresh token |

**Managing tasks (inside Jimmy → Scheduler):**
- List all tasks with status, next run time, run count
- Add new task — AI plans it for you
- Edit cron schedule (accepts plain time like `9:00am` or full cron)
- Toggle enable/disable
- View run history with output and errors
- Run now (manual trigger via Edge Function)
- Delete task

**Credentials auto-sync:** When you re-authenticate Gmail, the refresh token automatically syncs to Supabase `user_config`. The Edge Function picks it up on the next run — no manual `supabase secrets set` needed.

**Required env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `OPENROUTER_KEY`
**Optional:** `FIRECRAWL_KEY` (for web steps), Gmail credentials (for email steps)

See [Supabase Setup](#supabase-setup-scheduler--serverless) for deployment instructions.

---

## 📧 Email Operations

16 Gmail functions available from Ask Mode and Scheduler Mode. First use triggers an OAuth browser flow — after that, the refresh token is stored locally and auto-synced to Supabase.

| Function | Description |
|----------|-------------|
| `email_send` | Send with optional CC/BCC |
| `email_read` | Read a specific email by ID |
| `email_search` | Search with Gmail query syntax (`is:unread`, `from:x`, etc.) |
| `email_summarize` | AI-generated 2-3 sentence summary |
| `email_reply` | Reply while preserving thread |
| `email_draft` | Save as draft without sending |
| `email_delete` | Permanently delete |
| `email_archive` | Move to archive (removes INBOX label) |
| `email_label` | Add or remove labels |
| `email_classify` | Auto-categorize: work / personal / newsletter / spam / etc. |
| `email_extract_tasks` | Extract action items with LLM |
| `email_bulk_action` | Batch delete / archive / label / mark read |
| `email_digest` | LLM digest of recent or filtered emails |
| `email_schedule_send` | Save draft + return scheduled time |
| `email_send_draft` | Send a previously saved draft by ID |
| `email_thread` | Get all messages in a thread |

**Gmail auth setup:**

1. Go to [Google Cloud Console](https://console.cloud.google.com) → Create a project
2. Enable Gmail API
3. Create OAuth 2.0 credentials (Desktop app) → copy Client ID and Secret to `.env`
4. Set `PORT=8787` in `.env`
5. On first email use, Jimmy opens a browser for Google login
6. Credentials stored in `~/.cccontrol/googleAuth/` with `600` permissions

---

## Supabase Setup (Scheduler + Serverless)

### Step 1 — Create a Supabase project

Go to [supabase.com](https://supabase.com) → New project. From Settings → API, copy:
- **Project URL** → `SUPABASE_URL` in `.env`
- **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY` in `.env`

### Step 2 — Create all tables (run once)

1. Open Supabase Dashboard → SQL Editor
2. Open `scheduler/SETUP-READY.sql` from this project
3. At the bottom of the file, replace:
   - `YOUR_PROJECT_REF` with your project reference ID (from the URL: `https://YOUR_PROJECT_REF.supabase.co`)
   - `YOUR_SERVICE_ROLE_KEY` with your service_role key
4. Paste the entire file into SQL Editor and click **RUN**

This creates:
- `scheduler_tasks` — task definitions
- `scheduler_runs` — execution history
- `user_config` — API keys synced from your machine
- RLS policies (service role only)
- `pg_cron` job that triggers the Edge Function every minute

### Step 3 — Install Supabase CLI and link project

```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### Step 4 — Deploy the Edge Function

```powershell
.\supabase\deploy.ps1
```

This deploys `scheduler-tick`, sets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Edge Function secrets, then runs `jimmy sync-credentials` to push all your API keys to `user_config`.

### Step 5 — Verify

```bash
jimmy scheduler-debug
```

Should show the pg_cron job active and Edge Function reachable.

### Re-sync after key changes

```bash
jimmy sync-credentials
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_KEY` | Yes | OpenRouter API key |
| `OPENROUTER_MODEL` | No | Model slug (default: `openrouter/free`) |
| `GROQ_API_KEY` | For Scheduler/Browser | Groq API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | For Browser Agent | Google AI Studio key |
| `SUPABASE_URL` | For Scheduler | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For Scheduler | Supabase service role key |
| `FIRECRAWL_KEY` | Optional | Firecrawl key for web search/scrape |
| `GOOGLE_CLIENT_ID` | For Gmail | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Gmail | OAuth client secret |
| `PORT` | For Gmail | OAuth callback port (default: 8787) |
| `TELEGRAM_BOT_TOKEN` | For Telegram | Bot token from @BotFather |
| `TELEGRAM_OWNER_ID` | For Telegram | Your Telegram chat ID |
| `BROWSERBASE_API_KEY` | Optional | Cloud browser alternative |

---

## Models

| Model | Used for |
|-------|----------|
| OpenRouter (configurable) | Agent, Plan, Ask, email AI functions |
| Groq `llama-3.3-70b-versatile` | Scheduler planner + Browser Agent planner/evaluator |
| `google/gemini-3.1-flash-lite-preview` | Stagehand browser execution |
| OpenRouter (fallback) | Browser Agent + Scheduler fallback if primary fails |

Set your preferred model in `.env`:
```env
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
# or
OPENROUTER_MODEL=openai/gpt-4o
```

---

## Project Structure

```
jimmy/
├── index.ts                  # CLI entry (commander)
├── CLI/cli.ts                # Mode selector loop
│
├── agent/                    # Agent Mode
│   ├── orchestrator.ts       # Agent loop + approval flow
│   ├── agent-tools.ts        # File/folder/shell tools
│   ├── tool-executor.ts      # Executes staged actions
│   ├── action-tracker.ts     # Tracks pending mutations
│   ├── approval.ts           # CLI approval prompt
│   ├── diff-view.ts          # Diff renderer
│   └── types.ts
│
├── ask/
│   └── orchestrator.ts       # Ask loop with web + file + email tools
│
├── plan/
│   ├── orchestrator.ts       # Plan mode loop
│   ├── planner.ts            # LLM plan generation
│   ├── selection.ts          # Step toggle UI
│   ├── web-tools.ts          # Firecrawl tools
│   ├── browser-tool.ts       # Standalone Stagehand runner
│   ├── types.ts
│   └── browser-agent/        # Browser Agent Mode
│       ├── orchestrator.ts   # Iteration loop
│       ├── planner.ts        # Browser plan generation
│       ├── executor.ts       # Stagehand execution
│       ├── evaluator.ts      # LLM scoring + feedback
│       └── types.ts
│
├── email_ops/
│   ├── email_functions.ts    # 16 Gmail functions
│   ├── email-tools.ts        # AI SDK tool wrappers
│   ├── email_init.ts         # OAuth flow
│   ├── email_server.ts       # Express OAuth server
│   ├── email_pass_store.ts   # Credential storage
│   └── types.ts
│
├── scheduler/
│   ├── orchestrator.ts       # CLI interface
│   ├── planner.ts            # AI task planning
│   ├── db.ts                 # Supabase client + helpers
│   ├── config-sync.ts        # Auto credential sync
│   ├── debug.ts              # jimmy scheduler-debug tool
│   ├── update-task-email.ts  # Update email on existing tasks
│   ├── SETUP-READY.sql       # Run once in Supabase SQL Editor
│   ├── check-status.sql      # Diagnostic queries
│   ├── ARCHITECTURE.md       # System design
│   └── README.md
│
├── supabase/
│   ├── functions/
│   │   └── scheduler-tick/   # Edge Function (Deno)
│   │       └── index.ts
│   └── deploy.ps1            # Deploy + secrets + sync
│
├── auth/
│   ├── auth.ts               # Login / setup / update flows
│   ├── config-store.ts       # Persist config to ~/.cccontrol
│   └── crypto.ts             # AES encrypt + password hash
│
├── config/
│   └── ai.config.ts          # Model providers
│
└── tui/
    ├── spinner.ts
    ├── spinup.ts             # Mode selector UI
    └── terminal-render.ts    # Markdown renderer
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@browserbasehq/stagehand` | Browser automation |
| `ai` + `@openrouter/ai-sdk-provider` | LLM calls via AI SDK |
| `@ai-sdk/groq` | Groq model provider |
| `@supabase/supabase-js` | Supabase client |
| `telegraf` | Telegram bot |
| `@clack/prompts` | Interactive CLI prompts |
| `@mendable/firecrawl-js` | Web scraping / search |
| `googleapis` | Gmail API |
| `commander` | CLI command parsing |
| `chalk` | Terminal colors |
| `zod` | Schema validation |
| `marked` + `marked-terminal` | Markdown rendering |
| `express` | OAuth callback server for Gmail |
| `diff` | Diff generation |
| `dotenv` | Env var loading |
| `open` | Open browser for OAuth |

---

## Security

- API keys are AES-encrypted with your password before storage
- Password is stored as a hash only — never plaintext
- Gmail refresh token stored in `~/.cccontrol/googleAuth/` with `600` permissions
- Supabase credentials auto-sync to `user_config` (not in git)
- All credential files excluded from version control via `.gitignore`

---

## Runtime

Requires [Bun](https://bun.sh).

```bash
bun install
jimmy jet
```
