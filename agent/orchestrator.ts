import { isCancel, text, confirm, select } from "@clack/prompts";
import chalk from "chalk";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./action-tracker";
import { ToolExecutor } from "./tool-executor";
import path from "node:path";
import { stepCountIs, ToolLoopAgent } from "ai";
import { getAgentModel } from "../config/ai.config";
import { createAgentTools } from "./agent-tools";
import { renderHTMLMarkdown } from "../tui/terminal-render";
import { withSpinner } from "../tui/spinner";
import { runApprovalFlow } from "./approval";

async function withRetries<T>(operation: () => Promise<T>, retries = 2, delayMs = 1200): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      const message = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`\nAI request failed (${attempt + 1}/${retries + 1}): ${message}. Retrying...`));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

export async function runAgentMode() {
  console.log(chalk.bold("\n🤖 Agent Mode\n"));

  const config = defaultAgentConfig();

  while (true) {
    const tracker = new ActionTracker();
    const executor = new ToolExecutor(tracker, config);
    const tools = createAgentTools(executor);
    const agent = new ToolLoopAgent({
      model: getAgentModel(),
      instructions: `
    WorkDir: ${config.codebasePath}
    You are a helpful AI assistant to perform different tasks based on the query.
    Use the provided file tools to stage real workspace changes before asking for approval.
    If the user asks for a landing page or file creation, do not only describe the file in prose. Use create_file with the exact relative path and content.
    If the user asks to modify existing code, use modify_file with the full new file contents.
    If the user asks to delete a file or folder, use delete_file or create_folder as appropriate.
    Keep all changes staged until the user approves them. Do not finalize or write anything before approval.
    For project scaffolding (React, Vite, Next, create-react-app, etc.) prefer using execute_shell to run package managers and scaffolding commands (e.g., "npx create-react-app my-app", "pnpm create vite my-app", "bun create vite my-app"," npx create-next-app@latest ").
    When using execute_shell for scaffolding, run the command in a new subfolder and also stage any resulting important files (index.html, package.json, src/) using read_file/list_files or create_file as appropriate so the user can review them.
    If the user asks for a new project scaffold or a brand-new standalone app, create it inside a new subfolder under the current workspace. If they are asking to enhance or fix the existing codebase, keep changes in the current workspace root or appropriate existing folders.
    Do not create a new top-level folder unless the user explicitly requests a new project or new application scaffold.
    Always show the file path(s) as tool calls, not only in plain text.
    `,
      tools,
      stopWhen: stepCountIs(30),
    });

    const goal = await text({
      message: "What would you like the agent to do?",
      placeholder: "Concrete task for this codebase…",
    });

    if (isCancel(goal) || !goal.trim()) break;

    let result;
    try {
      result = await withSpinner("Running agent…", async () =>
        withRetries(() =>
          agent.generate({
            prompt: goal.trim(),
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
        ),
      );
    } catch (error) {
      console.log(chalk.red("\nAgent request failed after retries."));
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
      continue;
    }

    const pending = tracker.getPendingMutations();
    const pendingCount = pending.length;
    if (pendingCount === 0) {
      console.log(chalk.yellow("\nNo staged file or folder changes detected. The agent may have described a change without staging it."));
    } else {
      console.log(chalk.dim(`\nStaged changes: ${pendingCount}`));
      for (const p of pending) {
        const kind = p.type;
        const pathLabel = p.path || "(no path)";
        if (kind === "tool_execute") {
          console.log(chalk.cyan(`  • Shell queued: ${p.details.command ?? "(unknown)"}`));
        } else if (kind === "folder_create") {
          console.log(chalk.cyan(`  • Folder: ${pathLabel}`));
        } else if (kind === "file_create") {
          console.log(chalk.cyan(`  • New file staged: ${pathLabel}`));
        } else if (kind === "file_modify") {
          console.log(chalk.cyan(`  • Modify staged: ${pathLabel}`));
        } else if (kind === "file_delete") {
          console.log(chalk.cyan(`  • Delete staged: ${pathLabel}`));
        } else {
          console.log(chalk.cyan(`  • ${kind}: ${pathLabel}`));
        }
      }
    }

    if (result.text?.trim()) console.log("\n" + renderHTMLMarkdown(result.text) + "\n");

    const approved = await runApprovalFlow(tracker);
    if (!approved) {
      executor.clearStaging();
      console.log(chalk.yellow("No changes were applied.\n"));
    } else {
      const { errors, newFiles } = executor.applyApprovedFromTracker();
      executor.clearStaging();
      if (errors.length) {
        console.log(chalk.red("\nSome operations reported errors:\n"));
        for (const e of errors) console.log(chalk.red(`  • ${e}`));
      } else {
        console.log(chalk.green("\n✓ Applied.\n"));
      }
      // If scaffolding created new files, offer to run a follow-up coding pass
      if (newFiles && newFiles.length) {
        // identify top-level new folders
        const roots = new Set<string>();
        for (const f of newFiles) {
          const seg = f.split(/\//)[0];
          roots.add(seg || f);
        }
        if (roots.size === 1) {
          const folder = Array.from(roots)[0];
          const cont = await confirm({
            message: `Scaffold created folder '${folder}'. Run follow-up to implement: ${goal.trim()} ?`,
            initialValue: true,
          });
          if (!isCancel(cont) && cont) {
            // run follow-up coding inside the new folder
            const followGoal = `Implement the user's requested task: ${goal.trim()} inside this project. Write runnable code, use the project's conventions, and stage files with create_file or modify_file for approval.`;
            const followTracker = new ActionTracker();
            const followConfig = { ...config, codebasePath: path.join(config.codebasePath, folder as string) };
            const followExecutor = new ToolExecutor(followTracker, followConfig);
            const followTools = createAgentTools(followExecutor);
            const followAgent = new ToolLoopAgent({ model: getAgentModel(), instructions: `WorkDir: ${followConfig.codebasePath}
Use file tools to stage changes. Implement the feature fully.`, tools: followTools, stopWhen: stepCountIs(60) });

            let followResult;
            try {
              followResult = await withSpinner("Running follow-up agent…", async () =>
                withRetries(() =>
                  followAgent.generate({ prompt: followGoal }),
                ),
              );
            } catch (err) {
              console.log(chalk.red("\nFollow-up agent failed."));
              console.log(chalk.red(err instanceof Error ? err.message : String(err)));
              continue;
            }

            if (followResult?.text?.trim()) console.log("\n" + renderHTMLMarkdown(followResult.text) + "\n");
            const ok2 = await runApprovalFlow(followTracker);
            if (ok2) {
              const { errors: e2 } = followExecutor.applyApprovedFromTracker();
              followExecutor.clearStaging();
              if (e2.length) {
                console.log(chalk.red("\nFollow-up reported errors:\n"));
                for (const ee of e2) console.log(chalk.red(`  • ${ee}`));
              } else {
                console.log(chalk.green("\n✓ Follow-up applied.\n"));
              }
            } else {
              followExecutor.clearStaging();
              console.log(chalk.yellow("Follow-up canceled.\n"));
            }
          }
        }
      }
    }

    const next = await select({
      message: "What next?",
      options: [
        { value: "continue", label: "Ask next task" },
        { value: "exit", label: "Exit Agent Mode" },
      ],
    });

    if (isCancel(next) || next === "exit") break;
  }
}