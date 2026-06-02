# CCControl

## Project Overview
CCControl is a CLI‑powered agent orchestration framework designed to facilitate rapid prototyping and execution of complex workflows. It provides a modular architecture that allows you to plug in different **modes** (e.g., Telegram, web, etc.), **tools** (AI, diff, approval, web‑tool, browser‑agent), and **plans** for orchestrating tasks.

The code is organized into a few key domains:

| Directory | Purpose |
|-----------|---------|
| `CLI/` | The command line interface entry point and command registration. |
| `agent/` | Core orchestration engine‑handling actions, tool execution, approval flow, and diff view. |
| `ask/` | A lightweight generic orchestrator that queries an LLM for high‑level steps. |
| `auth/` | Authentication utilities and cryptographic helpers. |
| `config/` | JSON/TS configuration and AI provider settings. |
| `plan/` | Planning utilities, type definitions, and the new **web‑tools** and **browser‑agent** sub‑plans. |
| `tui/` | Terminal UI helpers – spinner and terminal rendering. |
| `Telegram/` | Concrete implementation of a *mode* for Telegram bot interaction. |
| `plan/browser-agent/` | Full browser automation agent leveraging Playwright for web interactions. |

## Features

- **Modular Design** – Add or replace modes and tools without touching core.
- **LLM Orchestration** – Agents can break down tasks into actions and route them to the appropriate tool.
- **Approval Workflow** – Interactive approval before executing potentially destructive actions.
- **Diff Viewer** – Visual comparison of text changes before commit.
- **Terminal UI** – Rich terminal feedback via spinners and real‑time rendering.
- **Configurable AI** – Switch between providers (OpenAI, Anthropic, etc.) by editing `config/ai.config.ts`.
- **Web Tools Integration** – New `plan/web-tools.ts` provides utilities for interacting with web APIs and performing HTTP actions directly from plans.
- **Browser Agent** – The `plan/browser-agent/` package adds a headless browser mode using Playwright, enabling tasks such as form filling, navigation, and screenshot capture.
- **Telegram Mode Enhancements** – Updated Telegram handlers now support rich messages, inline keyboards, and session‑based approvals.

## Architecture

```
[CLI] → [Orchestrator] → [Agent] → [Action Tracker]
   │                    │              │
   │                    └─► [Tool‑Executor] → {Tools}
   │                                            │
   └─► [Mode] ────────────────────────────────┘
```

* **CLI** parses command line options and dispatches to the correct mode.
* **Orchestrator** manages high‑level flow: reading input, generating plans, and executing actions.
* **Agent** decides which tool to call for each action.
* **Tool‑Executor** dispatches to concrete implementations such as AI calls, diff generation, approvals, web‑tool calls, or browser automation.
* **Modes** are plug‑in modules that provide a user experience layer (e.g., Telegram bot, web UI). Each mode implements a `run()` function that receives an orchestrator instance.

## Workflow

1. **Start**: `npx cccontrol run` (or the equivalent binary).
2. **Input**: Provide a task prompt via CLI or mode interface.
3. **Planning**: The orchestrator generates a step‑by‑step plan (via LLM or heuristic). New plans can now include `web-tool` or `browser-agent` actions.
4. **Execution**: Each step is sent to the agent, which routes it to the appropriate tool.
5. **Approval**: If a step requires approval (e.g., file changes or browser actions), the approval tool prompts the user.
6. **Diff**: For text changes, a diff viewer shows the before/after.
7. **Result**: Final output is displayed to the user and logged.

## Getting Started

```bash
# Install dependencies
yarn install

# Run the default mode (e.g., Telegram)
node dist/index.js telegram --prompt "Fix README"
```

Replace `telegram` with another mode name if you have a custom one. To use the new browser agent:

```bash
node dist/index.js browser-agent --prompt "Search product prices on example.com"
```

## Contributing

Feel free to open PRs to add new modes, tools, or improve the core. Ensure tests pass and documentation is updated.

---

*Author: Your Name*