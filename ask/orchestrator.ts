import chalk from "chalk";
import { confirm, isCancel, select, text } from "@clack/prompts";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";
import { ActionTracker } from "../agent/action-tracker.ts";
import { ToolExecutor } from "../agent/tool-executor.ts";
import { defaultAgentConfig } from "../agent/types.ts";
import { runApprovalFlow } from "../agent/approval.ts";
// import { createWebTools } from "../plan/web-tools.ts";
import { renderHTMLMarkdown } from "../tui/terminal-render.ts";
import { getAgentModel } from "../config/ai.config.ts";
import { createWebTools } from "../plan/web-tools.ts";
import { withSpinner } from "../tui/spinner";
import { createEmailTools } from "../email_ops/email-tools";
import { sendMail } from "../email_ops/email_functions";

function createAskTools(executor: ToolExecutor) {
  return {
    read_file: tool({
      description:
        "Read a text file from the workspace. Use a path relative to the project root.",
      inputSchema: z.object({
        path: z.string().describe("Relative file path"),
      }),
      execute: async ({ path: p }) => executor.readFile(p),
    }),

    list_files: tool({
      description: "List files and directories under a path.",
      inputSchema: z.object({
        path: z.string(),
        recursive: z.boolean().optional().default(false),
      }),
      execute: async ({ path: p, recursive }) =>
        executor.listFiles(p, recursive),
    }),

    search_files: tool({
      description:
        'Find files matching a glob pattern (e.g. "*.ts", "**/*.md"). Optional content substring filter.',
      inputSchema: z.object({
        root: z.string().describe("Directory to search, relative to root"),
        pattern: z
          .string()
          .describe("Glob-like pattern using * and ** (forward slashes)"),
        content_contains: z.string().optional(),
      }),
      execute: async ({ root, pattern, content_contains }) =>
        executor.searchFiles(root, pattern, content_contains),
    }),

    analyze_codebase: tool({
      description:
        "Summarize structure: file counts, size, extensions. Read-only.",
      inputSchema: z.object({
        path: z.string().default("."),
      }),
      execute: async ({ path: p }) => executor.analyzeCodebase(p),
    }),

    list_skills: tool({
      description:
        "List absolute paths to SKILL.md files under configured skill directories (Cursor / Claude).",
      inputSchema: z.object({}),
      execute: async () => executor.listSkills(),
    }),

    read_skill: tool({
      description:
        "Read a SKILL.md file. Path must be absolute and under skill roots, or use a path returned by list_skills.",
      inputSchema: z.object({
        path: z.string(),
      }),
      execute: async ({ path: p }) => executor.readSkill(p),
    }),
  };
}

function asMd(question: string, answer: string): string {
  return `# Ask Mode\n\n## Question\n\n${question.trim()}\n\n## Answer\n\n${answer.trim()}\n`;
}

export async function runAskMode() {
  console.log(chalk.bold("\n❓ Ask Mode\n"));

  const config = defaultAgentConfig();
  config.tools.allowFileCreation = true;
  config.tools.allowFileModification = false;
  config.tools.allowFolderCreation = false;
  config.tools.allowShellExecution = false;

  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);

  const tools = {
    ...createAskTools(executor),
    ...createWebTools(tracker),
    ...createEmailTools(),
  };

  const agent = new ToolLoopAgent({
    model: getAgentModel(),
    stopWhen: stepCountIs(20),
    tools,
  });

  const history: { question: string; answer: string }[] = [];
  let shouldSaveSummary = false;

  while (true) {
    const question = await text({ message: "What do you want to ask?" });
    if (isCancel(question) || !question.trim()) break;

    const context = history
      .map((item) => `User: ${item.question}\nAssistant: ${item.answer}`)
      .join("\n\n");

    const prompt = context
      ? `Conversation so far:\n${context}\n\nNew question:\n${question.trim()}`
      : question.trim();

    const result = await withSpinner("Thinking…", async () =>
      agent.generate({
        prompt,
        onStepFinish: ({ toolCalls }) => {
          for (const tc of toolCalls) {
            const preview = JSON.stringify(tc.input).slice(0, 160);
            console.log(
              chalk.green("  ✓"),
              chalk.bold(String(tc.toolName)),
              chalk.dim(preview + (preview.length >= 160 ? "..." : "")),
            );
          }
        },
      }),
    );

    const answer = result.text?.trim() || "(no answer)";
    history.push({ question: question.trim(), answer });
    console.log("\n" + renderHTMLMarkdown(answer) + "\n");

    const actions = tracker.getActions();
    if (actions.length) {
      console.log(chalk.bold('\nTool usage summary:'));
      for (const a of actions) {
        const details = a.details && (a.details.after ?? a.details.before ?? JSON.stringify(a.details));
        const preview = typeof details === 'string' ? details.slice(0, 200) : String(details);
        console.log(
          ` - ${a.type} ${a.path ?? ''} (${a.status}) ${preview ? '- ' + preview.replace(/\n/g, ' ') : ''}`,
        );
      }
      console.log();
    }

    const next = await select({
      message: 'What next?',
      options: [
        { value: 'continue', label: 'Ask another question' },
        { value: 'email', label: 'Send this answer to my email' },
        { value: 'save', label: 'Save important summary and exit' },
        { value: 'exit', label: 'Exit without saving' },
      ],
    });

    if (isCancel(next) || next === 'exit') break;
    if (next === 'email') {
      const emailTo = await text({ message: 'Send to (email address)?' });
      if (!isCancel(emailTo) && emailTo?.trim()) {
        await withSpinner('Sending email…', async () =>
          sendMail({
            to: emailTo.trim(),
            subject: `Ask Mode: ${(question as string).trim().slice(0, 60)}`,
            body: answer,
          })
        );
        console.log(chalk.green('✓ Email sent\n'));
      }
      continue;
    }
    if (next === 'save') {
      shouldSaveSummary = true;
      break;
    }
  }

  if (history.length === 0 || !shouldSaveSummary) return;

  const summaryPrompt = `Summarize the most important points from this conversation. Keep it concise and save only the key facts or actions. Conversation:\n\n${history
    .map((item) => `User: ${item.question}\nAssistant: ${item.answer}`)
    .join("\n\n")}`;

  const summaryResult = await withSpinner('Summarizing…', async () =>
    agent.generate({ prompt: summaryPrompt }),
  );
  const summary = summaryResult.text?.trim() || history.map((item) => `- ${item.answer}`).join('\n');

  const filename = await text({
    message: 'Filename',
    initialValue: 'ask-summary.md',
    validate: (v) => {
      const s = (v ?? '').trim();
      if (!s) return 'Required';
      if (s.includes('..') || s.includes('/') || s.includes('\\')) return 'No paths';
      if (!s.toLowerCase().endsWith('.md')) return 'Must end with .md';
    },
  });
  if (isCancel(filename)) return;

  const content = `# Ask Mode Summary\n\n## Important Information\n\n${summary}\n`;
  executor.createFile(filename, content);

  const ok = await runApprovalFlow(tracker);
  if (!ok) return executor.clearStaging();

  const { errors, newFiles } = executor.applyApprovedFromTracker();
  if (errors && errors.length) {
    console.log(chalk.red('\nSome operations reported errors:\n'));
    for (const e of errors) console.log(chalk.red(`  • ${e}`));
  }
  executor.clearStaging();
}