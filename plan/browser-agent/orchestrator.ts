import chalk from "chalk";
import { text, confirm } from "@clack/prompts";
import { withSpinner } from "../../tui/spinner";
import { renderHTMLMarkdown } from "../../tui/terminal-render.ts";
import { generateBrowserPlan } from "./planner";
import { executeBrowserPlan, closeStagehand } from "./executor";
import {
  evaluateExecutionResults,
  extractFeedbackForNextIteration,
} from "./evaluator";
import { sendMail } from "../../email_ops/email_functions";
import type {
  BrowserAgentResult,
  IterationResult,
  BrowserAgentConfig,
} from "./types";

const DEFAULT_CONFIG: BrowserAgentConfig = {
  maxIterations: 5,
  timeout: 120000,
  model: "google/gemini-3.1-flash-lite-preview",
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  evaluationThreshold: 80,
};

export async function runBrowserAgentMode(): Promise<void> {
  console.log(chalk.bold("\n🌐 Browser Agent Mode\n"));

  const queryInput = await text({
    message: "What would you like the browser agent to do?",
    placeholder: "e.g., Find top 5 AI jobs and get their descriptions...",
  });

  const query = typeof queryInput === "string" ? queryInput : "";

  if (!query || query.trim() === "") {
    console.log(chalk.yellow("\nOperation cancelled.\n"));
    return;
  }

  const liveOutput = await confirm({
    message: "Show live iteration output?",
    initialValue: false,
  });

  const maybeLog = (...args: any[]) => {
    if (liveOutput) console.log(...args);
  };

  const config = { ...DEFAULT_CONFIG };
  const iterations: IterationResult[] = [];
  let iteration = 0;
  let previousFeedback: string | undefined;
  let finalData: unknown = null;
  let lastEvaluation = null;

  try {
    while (iteration < config.maxIterations) {
      iteration++;
      maybeLog(chalk.bold(`\n📋 Iteration ${iteration}/${config.maxIterations}`));

      // PLAN PHASE
      let plan;
      try {
        plan = await withSpinner(
          `[${iteration}/${config.maxIterations}] Planning...`,
          () => generateBrowserPlan(query, previousFeedback)
        );
      } catch (error) {
        console.log(
          chalk.red(`Plan failed: ${error instanceof Error ? error.message : String(error)}`)
        );
        throw error;
      }

      maybeLog(chalk.dim(`Goal: ${plan.goal}`));
      maybeLog(chalk.dim(`Reasoning: ${plan.reasoning}`));

      // EXECUTE PHASE — Stagehand agent() runs the task autonomously
      let execution;
      try {
        execution = await withSpinner(
          `[${iteration}/${config.maxIterations}] Browser agent running...`,
          () => executeBrowserPlan(plan, previousFeedback)
        );
      } catch (error) {
        console.log(
          chalk.red(`Execution failed: ${error instanceof Error ? error.message : String(error)}`)
        );
        throw error;
      }

      // Collect extracted data from agent
      for (const result of execution) {
        if (result.data != null) {
          finalData = result.data;
        }
      }

      const agentResult = execution[0];
      maybeLog(
        agentResult?.success
          ? chalk.green(`✓ Agent completed task`)
          : chalk.red(`✗ Agent did not complete task`)
      );
      if (agentResult?.agentOutput) {
        maybeLog(chalk.dim(`Output: ${agentResult.agentOutput}`));
      }

      // EVALUATE PHASE
      let evaluation;
      try {
        evaluation = await withSpinner(
          `[${iteration}/${config.maxIterations}] Evaluating...`,
          () => evaluateExecutionResults(query, plan, execution, config.evaluationThreshold)
        );
      } catch (error) {
        console.log(
          chalk.red(`Evaluation failed: ${error instanceof Error ? error.message : String(error)}`)
        );
        throw error;
      }

      maybeLog(chalk.cyan(`Score: ${evaluation.score}/100 | Completeness: ${evaluation.completeness}% | Accuracy: ${evaluation.accuracy}%`));
      maybeLog(chalk.dim(`Feedback: ${evaluation.feedback}`));

      lastEvaluation = evaluation;

      iterations.push({
        iteration,
        plan,
        execution,
        evaluation,
        shouldContinue: !evaluation.satisfied && iteration < config.maxIterations,
      });

      if (evaluation.satisfied) {
        maybeLog(chalk.green.bold(`\n✓ Task satisfied!\n`));
        break;
      }

      if (iteration >= config.maxIterations) {
        maybeLog(chalk.yellow(`\n⚠ Max iterations reached.\n`));
        break;
      }

      previousFeedback = extractFeedbackForNextIteration(evaluation);
      maybeLog(chalk.yellow(`Retrying with feedback...`));
    }

    // BUILD CONSOLIDATED RESULT
    const result: BrowserAgentResult = {
      success: lastEvaluation?.satisfied || false,
      query,
      finalData,
      iterations,
      totalIterations: iteration,
      completedAt: new Date().toISOString(),
      error: lastEvaluation?.satisfied ? undefined : "Max iterations reached without full satisfaction",
    };

    // CONSOLIDATED OUTPUT
    console.log(chalk.bold("\n═══════════════════════════════════════════"));
    console.log(chalk.bold("📊 Browser Agent Result"));
    console.log(chalk.bold("═══════════════════════════════════════════\n"));

    console.log(`Query:      ${chalk.cyan(query)}`);
    console.log(`Status:     ${result.success ? chalk.green("✓ Succeeded") : chalk.yellow("⚠ Partial")}`);
    console.log(`Iterations: ${iteration}/${config.maxIterations}`);

    if (lastEvaluation) {
      console.log(`Score:      ${chalk.cyan(`${lastEvaluation.score}/100`)}`);
      console.log(`Complete:   ${chalk.cyan(`${lastEvaluation.completeness}%`)}`);
    }

    // Show final agent output if available
    const lastExecution = iterations[iterations.length - 1]?.execution[0];
    if (lastExecution?.agentOutput) {
      console.log(chalk.bold("\n🤖 Agent Output:"));
      console.log(chalk.white(lastExecution.agentOutput));
    }

    if (finalData) {
      console.log(chalk.bold("\n📦 Extracted Data:"));
      console.log(chalk.dim(JSON.stringify(finalData, null, 2)));
    }

    if (lastEvaluation?.feedback) {
      console.log(chalk.bold("\n💬 Final Feedback:"));
      console.log(chalk.dim(lastEvaluation.feedback));
    }

    console.log(chalk.bold("\n═══════════════════════════════════════════\n"));

    // Render markdown report
    const reportMarkdown = buildBrowserAgentMarkdownReport(result);
    console.log(chalk.bold("📄 Report\n"));
    console.log(renderHTMLMarkdown(reportMarkdown));
    console.log(chalk.bold("\n═══════════════════════════════════════════\n"));

    // Save options
    const shouldSaveJson = await confirm({
      message: "Save results to JSON file?",
      initialValue: false,
    });

    if (shouldSaveJson) {
      const fs = await import("fs");
      const path = await import("path");
      const filename = `browser-agent-result-${Date.now()}.json`;
      const filepath = path.resolve(process.cwd(), filename);
      fs.writeFileSync(filepath, JSON.stringify(result, null, 2), "utf8");
      console.log(chalk.green(`✓ Saved to ${filename}\n`));
    }

    const shouldSaveMd = await confirm({
      message: "Save Markdown report to file?",
      initialValue: false,
    });

    if (shouldSaveMd) {
      const fs = await import("fs");
      const path = await import("path");
      const filename = `browser-agent-report-${Date.now()}.md`;
      const filepath = path.resolve(process.cwd(), filename);
      fs.writeFileSync(filepath, reportMarkdown, "utf8");
      console.log(chalk.green(`✓ Saved to ${filename}\n`));
    }

    // ── Email option ──────────────────────────────────────────────────
    const shouldEmail = await confirm({
      message: "Send a summary to your email?",
      initialValue: false,
    });

    if (shouldEmail) {
      const emailTo = await text({ message: "Send to (email address)?" });
      if (typeof emailTo === "string" && emailTo.trim()) {
        // Build a concise email body from the agent output + score
        const agentOut = lastExecution?.agentOutput ?? "";
        const scoreInfo = lastEvaluation
          ? `Score: ${lastEvaluation.score}/100 | Completeness: ${lastEvaluation.completeness}%`
          : "";
        const emailBody = [
          `Query: ${query}`,
          scoreInfo,
          "",
          agentOut || JSON.stringify(finalData, null, 2) || "(no output)",
        ]
          .filter(Boolean)
          .join("\n");

        await withSpinner("Sending email…", () =>
          sendMail({
            to: emailTo.trim(),
            subject: `Browser Agent: ${query.slice(0, 60)}`,
            body: emailBody,
          })
        );
        console.log(chalk.green("✓ Email sent\n"));
      }
    }
  } catch (error) {
    console.log(chalk.red("\n❌ Browser Agent Error:"));
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
  } finally {
    try {
      await closeStagehand();
    } catch (err) {
      console.error("Error closing browser:", err);
    }
  }
}

function buildBrowserAgentMarkdownReport(result: BrowserAgentResult): string {
  const lines: string[] = [];

  lines.push("# Browser Agent Report\n");
  lines.push(`**Query:** ${result.query}`);
  lines.push(`**Status:** ${result.success ? "✅ Succeeded" : "⚠️ Partial"}`);
  lines.push(`**Total Iterations:** ${result.totalIterations}`);
  lines.push(`**Completed At:** ${result.completedAt}`);
  if (result.error) {
    lines.push(`**Note:** ${result.error}`);
  }
  lines.push("");

  // Only show the last (best) iteration's detail in consolidated mode
  const lastIteration = result.iterations[result.iterations.length - 1];
  if (lastIteration) {
    lines.push("## Final Iteration Result\n");

    const agentResult = lastIteration.execution[0];
    if (agentResult?.agentOutput) {
      lines.push("### Agent Output");
      lines.push(agentResult.agentOutput);
      lines.push("");
    }

    lines.push("### Evaluation");
    lines.push(`- **Score:** ${lastIteration.evaluation.score}/100`);
    lines.push(`- **Completeness:** ${lastIteration.evaluation.completeness}%`);
    lines.push(`- **Accuracy:** ${lastIteration.evaluation.accuracy}%`);
    lines.push(`- **Feedback:** ${lastIteration.evaluation.feedback}`);
    if (lastIteration.evaluation.issues.length > 0) {
      lines.push("- **Issues:**");
      lastIteration.evaluation.issues.forEach((issue) => {
        lines.push(`  - ${issue}`);
      });
    }
    lines.push("");
  }

  lines.push("## Extracted Data\n");
  lines.push("```json");
  lines.push(JSON.stringify(result.finalData ?? {}, null, 2));
  lines.push("```\n");

  if (result.iterations.length > 1) {
    lines.push("## Iteration Summary\n");
    result.iterations.forEach((it) => {
      lines.push(`- Iteration ${it.iteration}: Score ${it.evaluation.score}/100 — ${it.evaluation.satisfied ? "✅ Satisfied" : "🔄 Continued"}`);
    });
    lines.push("");
  }

  lines.push("*Generated by Browser Agent*");
  return lines.join("\n");
}
