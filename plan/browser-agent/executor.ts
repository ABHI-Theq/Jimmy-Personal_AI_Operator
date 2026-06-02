import { Stagehand } from "@browserbasehq/stagehand";
import type { BrowserPlan, ExecutionResult } from "./types";
import { z } from "zod";

let globalStagehand: InstanceType<typeof Stagehand> | null = null;

function getStagehandClient(): InstanceType<typeof Stagehand> {
  if (!globalStagehand) {
    globalStagehand = new Stagehand({
      env: "LOCAL",
      localBrowserLaunchOptions: {
        headless: false,
      },
      model: {
        modelName: "google/gemini-3.1-flash-lite-preview",
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      },
    });
  }
  return globalStagehand;
}

export async function executeBrowserPlan(
  plan: BrowserPlan
): Promise<ExecutionResult[]> {
  const stagehand = getStagehandClient();

  if (!stagehand || !globalStagehand) {
    throw new Error("Stagehand not initialized");
  }

  await stagehand.init();

  const results: ExecutionResult[] = [];
  let extractedData: Record<string, unknown> = {};

  try {
    for (const step of plan.steps) {
      let result: ExecutionResult;

      try {
        switch (step.action) {
          case "navigate": {
            if (!step.value) {
              throw new Error("Navigate requires URL in value field");
            }
            const page = stagehand.context.pages()[0];
            if (!page) throw new Error("No page available");
            await page.goto(step.value, { waitUntil: "networkidle" });
            result = {
              success: true,
              message: `Navigated to ${step.value}`,
              stepNumber: step.id,
              action: "navigate",
            };
            break;
          }

          case "click": {
            if (!step.value) {
              throw new Error("Click requires selector or instruction");
            }
            await stagehand.act(step.value);
            result = {
              success: true,
              message: `Clicked: ${step.value}`,
              stepNumber: step.id,
              action: "click",
            };
            break;
          }

          case "type": {
            if (!step.value) {
              throw new Error("Type requires value");
            }
            await stagehand.act(`Type: ${step.value}`);
            result = {
              success: true,
              message: `Typed: ${step.value}`,
              stepNumber: step.id,
              action: "type",
            };
            break;
          }

          case "extract": {
            if (!step.extractSchema) {
              throw new Error("Extract requires extractSchema");
            }

            // Create Zod schema from description
            const schemaObject: Record<string, z.ZodTypeAny> = {};
            for (const [key, desc] of Object.entries(step.extractSchema)) {
              schemaObject[key] = z.string().describe(desc);
            }
            const schema = z.object(schemaObject);

            const extracted = await stagehand.extract(step.description, schema);
            extractedData = { ...extractedData, ...extracted };

            result = {
              success: true,
              data: extracted,
              message: `Extracted data: ${JSON.stringify(extracted)}`,
              stepNumber: step.id,
              action: "extract",
            };
            break;
          }

          case "wait": {
            const waitTime = parseInt(step.value || "1000", 10);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            result = {
              success: true,
              message: `Waited ${waitTime}ms`,
              stepNumber: step.id,
              action: "wait",
            };
            break;
          }

          case "observe": {
            const actions = await stagehand.observe(
              step.description || "Analyze the page"
            );
            result = {
              success: true,
              data: actions,
              message: `Observed ${actions.length} possible actions`,
              stepNumber: step.id,
              action: "observe",
            };
            break;
          }

          case "scroll": {
            const direction = step.value || "down";
            await stagehand.act(`Scroll ${direction}`);
            result = {
              success: true,
              message: `Scrolled ${direction}`,
              stepNumber: step.id,
              action: "scroll",
            };
            break;
          }

          default:
            throw new Error(`Unknown action: ${step.action}`);
        }
      } catch (error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Step ${step.id} failed`,
          stepNumber: step.id,
          action: step.action,
        };
      }

      results.push(result);

      // Stop on critical errors
      if (!result.success && step.action === "navigate") {
        break;
      }
    }

    return results;
  } finally {
    // Keep browser open for user inspection
    // await stagehand.close();
  }
}

export async function closeStagehand(): Promise<void> {
  if (globalStagehand) {
    await globalStagehand.close();
    globalStagehand = null;
  }
}
