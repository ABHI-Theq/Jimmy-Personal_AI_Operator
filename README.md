# Jerob — Personal AI Agent CLI

A terminal-first AI agent that runs in your terminal. Five modes: autonomous code agent, structured planner, browser automation, conversational Q&A, and a serverless scheduler that runs 24/7 in Supabase — even when your machine is off.

---

## Video Demo

[Watch the demo on LinkedIn](https://www.linkedin.com/posts/abhishek-sharma-one_buildinpublic-aiagents-agenticai-ugcPost-7468770330895896576-4Rcf/?utm_source=share&utm_medium=member_desktop&rcm=ACoAAEPD8bwBiNXjv2quMd_V_U85lj38fK4tiIw)

---

## Modes

| Mode | What it does |
|------|-------------|
| 🤖 Agent | Autonomous file/code operations with diff review and approval |
| 🧭 Plan | AI-generated multi-step plan — review, edit, execute |
| 🌐 Browser Agent | Playwright browser automation driven by Gemini |
| ❓ Ask | Chat with AI — workspace, web search, and Gmail access |
| ⏰ Scheduler | Serverless recurring tasks running in Supabase Edge Functions |

### 🤖 Agent Mode
Describe a goal in plain English. The agent plans each step, stages all file changes, shows you a diff, and waits for your approval before writing anything. Nothing touches your codebase without your sign-off.

### 🧭 Plan Mode
Generates a structured multi-step plan for any goal. You can review and toggle individual steps, then hand the plan off to Agent Mode for execution — or just use the plan as a reference.

### 🌐 Browser Agent Mode
Runs Playwright-based browser automation using Gemini for DOM understanding. Uses your existing Brave/Chrome profile so you're already signed into sites — no credentials needed in the automation. Iteratively refines its actions until the goal is complete.

### ❓ Ask Mode
Conversational AI with access to your workspace files, web search (via Firecrawl), and Gmail. Read-only — it never modifies files. Session history is maintained within a run.

### ⏰ Scheduler Mode
Define recurring tasks in plain English. Jerob's AI breaks them into steps (web search, web crawl, email send), you set a time, and they run every minute in Supabase Edge Functions — no local machine needed, 24/7.

---

## Installation

**Via npm (recommended):**

```bash
# 1. Install Bun first (required runtime)
# Windows:
powershell -c "irm bun.sh/install.ps1 | iex"
# macOS/Linux:
curl -fsSL https://bun.sh/install | bash

# 2. Install jerob globally
npm install -g jerob

# 3. Launch — setup wizard runs on first use
jerob jet
```

**Via Git (for contributors / latest source):**

```bash
git clone https://github.com/ABHI-Theq/Jerob-Personal_AI_Operator
cd Jerob-Personal_AI_Operator
bun install
bun link
jerob jet
```

No `.env` file needed — the setup wizard encrypts your keys and creates it automatically.
```

No `.env` needed. The setup wizard encrypts your keys and creates it automatically.

---

## What You Need

**Minimum (to use Agent / Plan / Ask):**
- [OpenRouter](https://openrouter.ai/keys) API key — free tier available
- [Groq](https://console.groq.com) API key — completely free

**For Gmail / email features:**
- Google Cloud project with Gmail API + OAuth credentials ([setup guide](SETUP.md#8-gmail--email-setup))

**For Scheduler (24/7 serverless tasks):**
- [Supabase](https://supabase.com) project — free tier works
- Supabase personal access token (for one-time auto-setup)
- Supabase CLI: `npm i -g supabase`

**For Browser Agent:**
- Google Gemini API key ([aistudio.google.com](https://aistudio.google.com))
- Brave or Chrome browser

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `jerob jet` | Launch Jerob |
| `jerob set-key` | Update any API key |
| `jerob switch-model` | Change the active model for any provider |
| `jerob reset-auth` | Wipe credentials and start fresh |
| `jerob sync-credentials` | Push keys to Supabase for the scheduler |
| `jerob setup-db` | Re-run Supabase schema + Edge Function deploy |
| `jerob scheduler-debug` | Diagnose scheduler issues |

---

## AI Providers

| Provider | Default model | Used for |
|----------|--------------|---------|
| OpenRouter (free) | `openrouter/free` | Agent, Plan, Ask |
| OpenRouter (paid) | `anthropic/claude-3.5-sonnet` | Agent, Plan, Ask |
| Google Gemini | `gemini-2.5-flash` | Browser Agent, fallback |
| Anthropic Claude | `claude-3-5-sonnet-20241022` | Agent, Plan, Ask |
| OpenAI | `gpt-4o-mini` | Agent, Plan, Ask |
| Groq | `llama-3.3-70b-versatile` | Scheduler, fast fallback |

During setup you pick a primary provider and optional fallbacks. Groq is always the last-resort fallback.

---

## Scheduler

Define tasks in plain English. Jerob's AI plans the steps, you set a time, and they run in Supabase every minute — no local process needed.

```
Every morning at 9am, search for top AI news and email me a summary
Every Monday, crawl my competitor's pricing page and send me the changes
```

First-time setup is fully automated when you provide Supabase credentials during `jerob jet`. The wizard creates the tables, deploys the Edge Function, and schedules the cron job automatically.

---

## Security

- All API keys encrypted with AES-256 using your password
- Password verified with bcrypt — never stored
- `.env` regenerated on each login, never committed to git
- Gmail refresh token stored in `~/.cccontrol/googleAuth/`
- Supabase `user_config` table RLS-protected (service role only)

---

## Full Setup Guide

See **[SETUP.md](SETUP.md)** for complete step-by-step instructions for every mode.

---

## License

MIT
