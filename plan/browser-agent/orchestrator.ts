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
  console.log(
    chalk.dim(
      "Plan → Execute → Evaluate → Iterate (max 5 times for optimal results)\n"
    )
  );

  const queryInput = await text({
    message: "What would you like the browser agent to do?",
    placeholder: "e.g., Find top 5 AI jobs and get their descriptions...",
  });

  const query = typeof queryInput === "string" ? queryInput : "";

  if (!query || query.trim() === "") {
    console.log(chalk.yellow("\nOperation cancelled.\n"));
    return;
  }

  const config = { ...DEFAULT_CONFIG };
  const iterations: IterationResult[] = [];
  let iteration = 0;
  let previousFeedback: string | undefined;
  let finalData: unknown = null;
  let lastEvaluation = null;

  try {
    while (iteration < config.maxIterations) {
      iteration++;
      console.log(chalk.bold(`\n📋 Iteration ${iteration}/${config.maxIterations}`));

      // PLAN PHASE
      console.log(chalk.cyan("Planning..."));
      let plan;
      try {
        plan = await withSpinner("Generating browser automation plan...", () =>
          generateBrowserPlan(query, previousFeedback)
        );
      } catch (error) {
        console.log(
          chalk.red(
            `Plan generation failed: ${error instanceof Error ? error.message : String(error)}`
          )
        );
        throw error;
      }

      console.log(chalk.green(`✓ Plan created with ${plan.steps.length} steps`));
      console.log(chalk.dim(`Goal: ${plan.goal}`));
      console.log(chalk.dim(`Reasoning: ${plan.reasoning}`));

      // Display plan steps
      console.log(chalk.cyan("\nPlan Steps:"));
      plan.steps.forEach((step: any) => {
        console.log(
          chalk.dim(`  ${step.id}. ${step.action}: ${step.description}`)
        );
      });

      // EXECUTE PHASE
      console.log(chalk.cyan("\n\nExecuting plan..."));
      let execution;
      try {
        execution = await withSpinner("Running browser automation...", () =>
          executeBrowserPlan(plan)
        );
      } catch (error) {
        console.log(
          chalk.red(
            `Execution failed: ${error instanceof Error ? error.message : String(error)}`
          )
        );
        throw error;
      }

      const successCount = execution.filter((r: any) => r.success).length;
      console.log(chalk.green(`✓ Executed: ${successCount}/${execution.length} steps succeeded`));

      // Collect extracted data
      execution.forEach((result: any) => {
        if (result.data) {
          finalData = result.data;
        }
      });

      // EVALUATE PHASE
      console.log(chalk.cyan("\nEvaluating results..."));
      let evaluation;
      try {
        evaluation = await withSpinner("Evaluating execution quality...", () =>
          evaluateExecutionResults(
            query,
            plan,
            execution,
            config.evaluationThreshold
          )
        );
      } catch (error) {
        console.log(
          chalk.red(
            `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`
          )
        );
        throw error;
      }

      console.log(chalk.cyan(`\nEvaluation Score: ${evaluation.score}/100`));
      console.log(chalk.dim(`Feedback: ${evaluation.feedback}`));
      console.log(chalk.dim(`Completeness: ${evaluation.completeness}%`));
      console.log(chalk.dim(`Accuracy: ${evaluation.accuracy}%`));

      if (evaluation.issues.length > 0) {
        console.log(chalk.yellow(`Issues found:`));
        evaluation.issues.forEach((issue: string) => {
          console.log(chalk.yellow(`  • ${issue}`));
        });
      }

      lastEvaluation = evaluation;

      // Store iteration result
      iterations.push({
        iteration,
        plan,
        execution,
        evaluation,
        shouldContinue: shouldContinueIteratingLocal(
          evaluation,
          iteration,
          config.maxIterations
        ),
      });

      // CHECK IF SHOULD CONTINUE
      if (evaluation.satisfied) {
        console.log(chalk.green.bold(`\n✓ Task completed successfully!\n`));
        break;
      }

      if (iteration >= config.maxIterations) {
        console.log(
          chalk.yellow(
            `\n⚠ Max iterations (${config.maxIterations}) reached. Returning best result.\n`
          )
        );
        break;
      }

      // Prepare feedback for next iteration
      previousFeedback = extractFeedbackForNextIteration(evaluation);
      console.log(chalk.yellow(`\nRetrying with feedback for next iteration...`));
    }

    // FINAL RESULT
    const result: BrowserAgentResult = {
      success: lastEvaluation?.satisfied || false,
      query,
      finalData,
      iterations,
      totalIterations: iteration,
      completedAt: new Date().toISOString(),
      error: lastEvaluation?.satisfied ? undefined : "Max iterations reached",
    };

    console.log(chalk.bold("\n═════════════════════════════════════════"));
    console.log(chalk.bold("📊 Browser Agent Execution Summary"));
    console.log(chalk.bold("═════════════════════════════════════════\n"));

    console.log(`Query: ${chalk.cyan(query)}`);
    console.log(`Status: ${result.success ? chalk.green("✓ Succeeded") : chalk.red("✗ Incomplete")}`);
    console.log(`Total Iterations: ${iteration}/${config.maxIterations}`);

    if (lastEvaluation) {
      console.log(`Final Score: ${chalk.cyan(`${lastEvaluation.score}/100`)}`);
      console.log(`Completeness: ${chalk.cyan(`${lastEvaluation.completeness}%`)}`);
      console.log(`Accuracy: ${chalk.cyan(`${lastEvaluation.accuracy}%`)}`);
    }

    if (finalData) {
      console.log(chalk.bold("\n📦 Extracted Data:"));
      console.log(chalk.dim(JSON.stringify(finalData, null, 2)));
    }

    console.log(chalk.bold("\n═════════════════════════════════════════\n"));

    const reportMarkdown = buildBrowserAgentMarkdownReport(result);

    console.log(chalk.bold("\n📄 Browser Agent Markdown Report\n"));
    console.log(renderHTMLMarkdown(reportMarkdown));

    console.log(chalk.bold("\n═════════════════════════════════════════\n"));

    const shouldSaveJson = await confirm({
      message: "Save execution results to JSON file?",
      initialValue: false,
    });

    if (shouldSaveJson) {
      const fs = await import("fs");
      const path = await import("path");
      const filename = `browser-agent-result-${Date.now()}.json`;
      const filepath = path.resolve(process.cwd(), filename);
      fs.writeFileSync(filepath, JSON.stringify(result, null, 2), "utf8");
      console.log(chalk.green(`\n✓ JSON results saved to ${filename}\n`));
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
      console.log(chalk.green(`\n✓ Markdown report saved to ${filename}\n`));
    }
  } catch (error) {
    console.log(chalk.red("\n❌ Browser Agent Error:"));
    console.log(
      chalk.red(error instanceof Error ? error.message : String(error))
    );
  } finally {
    try {
      await closeStagehand();
    } catch (error) {
      console.error("Error closing browser:", error);
    }
  }
}

function buildBrowserAgentMarkdownReport(result: BrowserAgentResult): string {
  const lines: string[] = [];

  lines.push("# Browser Agent Report\n");
  lines.push(`**Query:** ${result.query}`);
  lines.push(`**Status:** ${result.success ? "✅ Succeeded" : "❌ Incomplete"}`);
  lines.push(`**Total Iterations:** ${result.totalIterations}`);
  lines.push(`**Completed At:** ${result.completedAt}`);
  if (result.error) {
    lines.push(`**Error:** ${result.error}`);
  }
  lines.push("");

  for (const iteration of result.iterations) {
    lines.push(`## Iteration ${iteration.iteration}\n`);
    lines.push("### Plan");
    lines.push(`- **Goal:** ${iteration.plan.goal}`);
    lines.push(`- **Reasoning:** ${iteration.plan.reasoning}`);
    lines.push("- **Steps:**");
    iteration.plan.steps.forEach((step) => {
      const details = [];
      if (step.selector) details.push(`selector=${step.selector}`);
      if (step.value) details.push(`value=${step.value}`);
      if (step.waitFor) details.push(`waitFor=${step.waitFor}`);
      lines.push(
        `  1. **${step.action}** — ${step.description}${
          details.length > 0 ? ` (${details.join(", ")})` : ""
        }`
      );
      if (step.extractSchema) {
        lines.push("     - extractSchema:");
        lines.push("       ```json");
        lines.push(JSON.stringify(step.extractSchema, null, 4).split("\n").map(l => "       " + l).join("\n"));
        lines.push("       ```");
      }
    });
    lines.push("");

    lines.push("### Execution");
    iteration.execution.forEach((res) => {
      lines.push(`- **Step ${res.stepNumber}** (${res.action}) — ${res.success ? "✅ Success" : "❌ Failure"}`);
      lines.push(`  - Message: ${res.message}`);
      if (res.error) {
        lines.push(`  - Error: ${res.error}`);
      }
      if (res.data) {
        lines.push("  - Data:");
        lines.push("    ```json");
        lines.push(JSON.stringify(res.data, null, 4).split("\n").map(l => "    " + l).join("\n"));
        lines.push("    ```");
      }
    });
    lines.push("");

    lines.push("### Evaluation");
    lines.push(`- **Satisfied:** ${iteration.evaluation.satisfied ? "Yes" : "No"}`);
    lines.push(`- **Score:** ${iteration.evaluation.score}/100`);
    lines.push(`- **Completeness:** ${iteration.evaluation.completeness}%`);
    lines.push(`- **Accuracy:** ${iteration.evaluation.accuracy}%`);
    lines.push(`- **Feedback:** ${iteration.evaluation.feedback}`);
    if (iteration.evaluation.issues.length > 0) {
      lines.push("- **Issues:**");
      iteration.evaluation.issues.forEach((issue) => {
        lines.push(`  - ${issue}`);
      });
    }
    lines.push("");
  }

  lines.push("## Final Data\n");
  lines.push("```json");
  lines.push(JSON.stringify(result.finalData ?? {}, null, 2));
  lines.push("```\n");
  lines.push("*Generated by Browser Agent*");

  return lines.join("\n");
}

function shouldContinueIteratingLocal(
  evaluation: any,
  iteration: number,
  maxIterations: number
): boolean {
  return !evaluation.satisfied && iteration < maxIterations;
}
