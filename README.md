# Jimmy — Personal AI Assistant CLI

A complete, terminal-first AI agent framework with autonomous task execution, browser automation, email operations, and scheduled workflows.

---

## Quick Start

```bash
# Install dependencies
bun install

# First run — will prompt for username, password, and OpenRouter API key
jimmy jet
```

After setup, `jimmy jet` takes you straight to the mode selector.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `jimmy jet` | Launch the assistant (main interface) |
| `jimmy set-key` | Update your stored OpenRouter API key |
| `jimmy reset-auth` | Wipe stored credentials and config |
| `jimmy sync-credentials` | Sync API keys to Supabase for serverless scheduler |
| `jimmy scheduler-debug` | Debug scheduler status and test Edge Function |

---

## Modes

### 🤖 Agent Mode
Full agentic loop with file system access. Give it a goal and it autonomously plans, writes, modifies, and deletes files with approval workflow.

**Features:**
- Up to 30 tool steps per task
- File CRUD operations (create, read, modify, delete)
- Directory operations (list, create)
- Shell command scaffolding (`bun create vite`, `npx create-next-app`, etc.)
- Visual diff viewer before applying changes
- Follow-up pass for newly scaffolded projects
- Codebase search capabilities

**Tools Available:**
- `read_file` - Read file contents
- `create_file` - Create new files
- `modify_file` - Edit existing files
- `delete_file` - Remove files
- `list_directory` - List directory contents
- `create_folder` - Create new directories
- `run_shell_command` - Execute shell commands
- `grep_search` - Search codebase
- `file_search` - Fuzzy file search

### 📋 Plan Mode
LLM generates a structured multi-step plan. Review, toggle steps, then optionally execute via Agent Mode.

**Features:**
- Natural language goal → structured plan
- Optional workspace scan for context
- Step-by-step breakdown
- Toggle individual steps on/off
- Execute selected steps with Agent Mode
- Save plan to `.md` file
- Per-step agent execution

### 🌐 Browser Agent Mode
Autonomous browser automation using Stagehand with iterative Plan → Execute → Evaluate loop.

**Features:**
- Uses Brave browser with persistent profile (stays logged in)
- DOM-mode Stagehand agent for navigation
- Iterative refinement (up to 5 cycles)
- LLM-based evaluation (0–100 score)
- Automatic retry with feedback until threshold met (80/100)
- Screenshot capture at each step
- JSON + Markdown report generation
- Auto-download support for file downloads

**Use Cases:**
- LinkedIn automation (job applications, connections)
- Web scraping with JavaScript rendering
- Form filling and submissions
- Multi-step workflows requiring authentication
- Data extraction from dynamic sites

See [`plan/browser-agent/README.md`](plan/browser-agent/README.md) for detailed documentation.

### 💬 Ask Mode
Conversational Q&A with workspace access and web search capabilities. Read-only mode with optional session summary export.

**Features:**
- Multi-turn conversation with history
- Read workspace files
- List directories
- Search codebase
- Web search via Firecrawl
- Web scraping via Firecrawl
- Session summary export to `.md`
- **Email integration** - send answers via email

**Tools Available:**
- File reading (read-only)
- Directory listing
- Codebase grep search
- File fuzzy search
- Web search
- Web page scraping
- All 16 email operations (see Email Operations section)

### 📧 Email Operations
Complete Gmail integration with 16 AI-powered email functions accessible from Ask Mode and Browser Agent Mode.

**Available Functions:**
- `email_send` - Send emails with attachments
- `email_read` - Read specific email by ID
- `email_search` - Search with Gmail query syntax
- `email_summarize` - AI-powered email summaries
- `email_reply` - Reply while keeping thread
- `email_draft` - Save as draft without sending
- `email_delete` - Permanently delete emails
- `email_archive` - Move to archive
- `email_label` - Add/remove labels
- `email_classify` - Auto-categorize (work, personal, newsletter, etc.)
- `email_extract_tasks` - Extract action items via AI
- `email_bulk_action` - Batch operations on multiple emails
- `email_digest` - Generate digest of recent/filtered emails
- `email_schedule_send` - Schedule for later
- `email_send_draft` - Send previously saved draft
- `email_thread` - Get all messages in a thread

**Gmail Authentication:**
```bash
# First time only - will open browser for OAuth
jimmy jet → Ask Mode → [Use any email function]
```

Credentials stored securely in `~/.cccontrol/googleAuth/`. Refresh token auto-syncs to Supabase for serverless scheduler.

### ⏰ Scheduler Mode
AI-powered task scheduler that runs autonomously in Supabase (serverless) - **no local process needed**.

**Features:**
- Natural language → AI plans task into steps + cron schedule
- Runs in Supabase Edge Functions via pg_cron
- Your machine can be off - tasks still execute
- **Auto-credential sync** - Gmail re-auth automatically updates Supabase
- Full CRUD for tasks via CLI
- Execution history with detailed logs
- Optional email summaries after each run
- Manual task triggers for testing

**Step Types (all run serverless in Supabase):**
- `web_search` - Search web via Firecrawl
- `web_crawl` - Scrape specific URLs via Firecrawl
- `custom` - Any AI-driven task (LLM)
- `email_send` - Send emails via Gmail API

**Example Tasks:**
- "Every morning at 9am, search for top AI news and email me a summary"
- "Every Monday at 10am, scrape IndieHackers for AI posts and send digest"
- "Every 6 hours, check my Gmail for unread emails and summarize them"

**Setup:**
```bash
# 1. Deploy Edge Function once
supabase login
supabase link --project-ref YOUR_PROJECT_REF
./supabase/deploy.ps1

# 2. Run setup SQL in Supabase SQL Editor
# (opens scheduler/SETUP-READY.sql - copy/paste and run)

# 3. Done! Scheduler runs every minute in Supabase
```

**Managing Tasks:**
```bash
jimmy jet → Scheduler
# Options:
# - List all tasks (status, next run, history)
# - Add new task (AI plans it for you)
# - Manage (enable/disable, edit cron, view history, run now, delete)
```

**Debugging:**
```bash
# Check scheduler status
jimmy scheduler-debug

# View in Supabase
# Dashboard → Functions → scheduler-tick → Logs
# Dashboard → Table Editor → scheduler_runs (execution history)
# SQL Editor → scheduler/check-status.sql (diagnostic queries)
```

**Auto-Sync on Re-auth:**
When you re-authenticate Gmail, the refresh token automatically syncs to Supabase. No manual `supabase secrets set` needed!

See [`scheduler/README.md`](scheduler/README.md) for complete documentation.

### 📱 Telegram Mode
Full bot interface for Agent, Ask, Plan, and Email capabilities over Telegram - owner-only, authenticated by chat ID.

**Commands:**
- `/start` - Welcome message
- `/agent <goal>` - Run Agent Mode
- `/ask <question>` - Run Ask Mode  
- `/plan <goal>` - Generate plan with inline keyboard
- `/email <operation>` - Email operations

**Features:**
- Inline approval flow (accept/reject/diff) via buttons
- Step toggle keyboard for plans
- File uploads/downloads
- Progress updates
- Owner authentication via chat ID

**Setup:**
```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_OWNER_ID=your_chat_id
```

---

## Project Structure

```
jimmy/
├── index.ts                  # CLI entry point (commander)
├── CLI/cli.ts                # Mode selector loop
│
├── agent/                    # Agent Mode
│   ├── orchestrator.ts       # Agent loop + approval flow
│   ├── agent-tools.ts        # File/folder/shell tools
│   ├── tool-executor.ts      # Executes staged actions
│   ├── action-tracker.ts     # Tracks pending mutations
│   ├── approval.ts           # CLI approval prompt
│   ├── diff-view.ts          # Diff renderer
│   └── types.ts              # Types
│
├── ask/                      # Ask Mode
│   └── orchestrator.ts       # Ask loop with web + file + email tools
│
├── plan/                     # Plan Mode & Browser Agent
│   ├── orchestrator.ts       # Plan mode loop
│   ├── planner.ts            # LLM plan generation
│   ├── selection.ts          # Step selection UI
│   ├── web-tools.ts          # Firecrawl + HTTP tools
│   ├── browser-tool.ts       # Standalone Stagehand runner
│   ├── types.ts              # Plan types
│   └── browser-agent/        # Browser Agent Mode
│       ├── orchestrator.ts   # Iteration loop
│       ├── planner.ts        # Browser plan generation
│       ├── executor.ts       # Stagehand execution
│       ├── evaluator.ts      # LLM scoring + feedback
│       └── types.ts          # Browser types
│
├── email_ops/                # Email Operations
│   ├── email_functions.ts    # 16 Gmail functions
│   ├── email-tools.ts        # AI SDK tool wrappers
│   ├── email_init.ts         # OAuth flow
│   ├── email_server.ts       # Express OAuth server
│   ├── email_pass_store.ts   # Credential storage
│   └── types.ts              # Email types
│
├── scheduler/                # Scheduler Mode
│   ├── orchestrator.ts       # CLI interface
│   ├── planner.ts            # AI task planning
│   ├── db.ts                 # Supabase client + helpers
│   ├── config-sync.ts        # Auto credential sync
│   ├── debug.ts              # Debug tool (`jimmy scheduler-debug`)
│   ├── update-task-email.ts  # Update email on existing tasks
│   ├── check-status.sql      # Diagnostic SQL queries
│   ├── SETUP-READY.sql       # pg_cron setup (run once in Supabase)
│   ├── ARCHITECTURE.md       # System architecture
│   ├── TROUBLESHOOTING.md    # Debug guide
│   └── README.md             # Complete docs
│
├── supabase/                 # Supabase Edge Functions
│   ├── functions/
│   │   └── scheduler-tick/   # Edge Function for scheduler
│   │       ├── index.ts      # Serverless executor
│   │       └── setup.sql     # Database setup
│   └── deploy.ps1            # Deployment script
│
├── Telegram/                 # Telegram Bot
│   ├── index.ts              # Bot setup + launch
│   ├── handlers.ts           # Command + callback handlers
│   ├── agent-run.ts          # Telegram-adapted runners
│   ├── approval-session.ts   # Inline keyboard approval
│   ├── plan-session.ts       # Inline keyboard plans
│   ├── auth.ts               # Owner ID check
│   └── constants.ts          # Messages
│
├── auth/                     # Authentication
│   ├── auth.ts               # Login/setup/update flows
│   ├── config-store.ts       # Persist config
│   └── crypto.ts             # Password hash + AES encrypt
│
├── config/                   # AI Configuration
│   └── ai.config.ts          # Model providers
│
└── tui/                      # Terminal UI
    ├── spinner.ts            # withSpinner helper
    ├── spinup.ts             # Mode selector
    └── terminal-render.ts    # Markdown renderer
```

---

## Authentication & Security

**On first run**, `jimmy jet` prompts for:
- Username (for identification)
- Password (for encryption)
- OpenRouter API key (for LLM access)

**Security:**
- API key AES-encrypted with your password
- Password stored as hash only (never plaintext)
- Gmail refresh token stored in `~/.cccontrol/googleAuth/` (600 permissions)
- Supabase credentials auto-synced (not in git)
- All credentials excluded from version control

**To update:**
```bash
jimmy set-key      # Update OpenRouter key
jimmy reset-auth   # Wipe everything and start fresh
```

---

## Models

| Model | Used For |
|-------|----------|
| OpenRouter (configurable) | Agent, Plan, Ask, Email AI functions |
| Groq `llama-3.3-70b-versatile` | Browser Agent planner + evaluator, Scheduler planner |
| `google/gemini-3.1-flash-lite-preview` | Stagehand browser execution |
| OpenRouter (fallback) | Browser Agent + Scheduler fallback if primary fails |

**Set your preferred model:**
```env
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
# or
OPENROUTER_MODEL=openai/gpt-4o
```

---

## Environment Variables

Create a `.env` in the project root:

```env
# ============================================================
# REQUIRED - Core LLM Access
# ============================================================
OPENROUTER_KEY=sk-or-v1-...
OPENROUTER_MODEL=openrouter/free

# ============================================================
# REQUIRED - Browser Agent & Scheduler
# ============================================================
GROQ_API_KEY=gsk_...
GOOGLE_GENERATIVE_AI_API_KEY=...

# ============================================================
# REQUIRED - Scheduler (Supabase)
# ============================================================
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# ============================================================
# OPTIONAL - Enhanced Features
# ============================================================
# Web scraping & search
FIRECRAWL_KEY=fc-...

# Gmail operations
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Telegram bot
TELEGRAM_BOT_TOKEN=...
TELEGRAM_OWNER_ID=...

# Browserbase (alternative to local browser)
BROWSERBASE_API_KEY=...
```

---

## Browser Agent — Brave Profile Setup

To use authenticated sites (LinkedIn, Twitter, etc.), point Stagehand at your Brave profile:

```ts
// in plan/browser-agent/executor.ts
localBrowserLaunchOptions: {
  executablePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  args: [
    '--user-data-dir=C:\\Users\\YOUR_USERNAME\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data',
    '--profile-directory=Default',
  ],
  headless: false,
}
```

No credentials needed — reuses your browser's existing cookies.

---

## Scheduler Setup (One-Time)

The scheduler runs **serverless in Supabase** via Edge Functions + pg_cron.

**1. Install Supabase CLI:**
```bash
npm i -g supabase
```

**2. Login and Link:**
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

**3. Deploy:**
```bash
./supabase/deploy.ps1
```

This:
- Deploys the `scheduler-tick` Edge Function
- Sets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as secrets
- Calls `jimmy sync-credentials` to push API keys to `user_config` table

**4. Run Setup SQL:**
- Open `scheduler/SETUP-READY.sql`
- Copy entire contents
- Paste into Supabase SQL Editor
- Click RUN

**Done!** Scheduler runs every minute. Your machine can be off.

**Monitor:**
```bash
jimmy scheduler-debug                      # CLI debug tool
supabase functions logs scheduler-tick     # Edge Function logs
```

**Re-sync credentials after changes:**
```bash
jimmy sync-credentials
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
| `express` | OAuth server for Gmail |
| `node-cron` | (Optional) Cron for local daemon |
| `diff` | Diff generation |

---

## Runtime

Requires [Bun](https://bun.sh). Uses `bun.lock` for reproducible installs.

```bash
bun install
jimmy jet
```

---

## Features Summary

✅ **5 Modes**: Agent, Plan, Browser Agent, Ask, Scheduler
✅ **16 Email Functions**: Send, read, search, AI summaries, classify, extract tasks, etc.
✅ **Browser Automation**: Authenticated sessions, iterative refinement, visual feedback
✅ **Serverless Scheduler**: Runs 100% in Supabase — machine can be off, auto-syncs credentials
✅ **Telegram Bot**: Full agent capabilities over Telegram
✅ **File Operations**: Create, read, modify, delete with approval workflow  
✅ **Web Tools**: Search, scrape via Firecrawl  
✅ **Codebase Search**: Grep and fuzzy file search  
✅ **Shell Integration**: Run commands, scaffold projects  
✅ **Security**: Encrypted API keys, password-protected, OAuth for Gmail  
✅ **Multi-Model**: OpenRouter, Groq, Google Gemini support  

---

## Documentation

- [`plan/browser-agent/README.md`](plan/browser-agent/README.md) - Browser Agent complete guide
- [`plan/browser-agent/USAGE.md`](plan/browser-agent/USAGE.md) - Browser Agent examples
- [`scheduler/README.md`](scheduler/README.md) - Scheduler complete documentation
- [`scheduler/ARCHITECTURE.md`](scheduler/ARCHITECTURE.md) - Scheduler system design
- [`scheduler/TROUBLESHOOTING.md`](scheduler/TROUBLESHOOTING.md) - Scheduler debugging guide

---

## License

MIT
