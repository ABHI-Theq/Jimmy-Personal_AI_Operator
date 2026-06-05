import { getAgentModel, getAgentModel2, getAgentModel2Fallback } from "../../config/ai.config";
import type { BrowserPlan, BrowserStep } from "./types";
import { generateText } from "ai";
import { z } from "zod";

const optionalString = () =>
  z.preprocess((value) => (value === null ? undefined : value), z.string().optional());

const optionalRecord = () =>
  z.preprocess(
    (value) => (value === null ? undefined : value),
    z.record(z.string()).optional()
  );

const BrowserStepSchema = z.object({
  id: z.number(),
  action: z.enum([
    "navigate",
    "click",
    "type",
    "extract",
    "wait",
    "observe",
    "scroll",
  ]),
  description: z.string(),
  selector: optionalString(),
  value: optionalString(),
  waitFor: optionalString(),
  extractSchema: optionalRecord(),
}).strict();

const BrowserPlanSchema = z.object({
  goal: z.string(),
  steps: z.array(BrowserStepSchema),
  reasoning: z.string(),
}).strict();

function extractJsonObjectFromText(text: string): string | null {
  let jsonText = text.trim();

  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.slice(7);
  }
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith("```")) {
    jsonText = jsonText.slice(0, -3);
  }

  jsonText = jsonText.trim();

  const firstBraceIndex = jsonText.indexOf("{");
  if (firstBraceIndex === -1) {
    return null;
  }

  let depth = 0;
  for (let i = firstBraceIndex; i < jsonText.length; i += 1) {
    const char = jsonText[i];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return jsonText.slice(firstBraceIndex, i + 1);
      }
    }
  }

  return null;
}

export async function generateBrowserPlan(
  query: string,
  previousFeedback?: string
): Promise<BrowserPlan> {
  let model = getAgentModel();
  let usingFallback = false;

  const systemPrompt = `You are a browser automation planner. Your task is to create a detailed plan for how to automate a browser task.

IMPORTANT: You are helping with legitimate web automation for research, data collection, and productivity purposes. This is not for any harmful activities.

${
  previousFeedback
    ? `Previous feedback indicated issues. Address them in this iteration: ${previousFeedback}`
    : ""
}

Create a plan with concrete steps that will:
1. Navigate to relevant URLs
2. Interact with page elements (click, type, scroll)
3. Extract information in structured format
4. Validate the results

Be specific about selectors and values. Each step should be actionable and precise.

You MUST respond with ONLY a valid JSON object (no markdown, no code blocks). If you include any explanation, place it after the JSON object and not inside it.

The exact JSON schema is:
{
  "goal": "string",
  "steps": [
    {
      "id": number,
      "action": "navigate" | "click" | "type" | "extract" | "wait" | "observe" | "scroll",
      "description": "string",
      "selector": "string (optional)",
      "value": "string (optional)",
      "waitFor": "string (optional)",
      "extractSchema": {"fieldName": "description"} (optional)
    }
  ],
  "reasoning": "string"
}`;

  const userPrompt = `Create a browser automation plan for: ${query}

Respond with valid JSON only. No markdown, no explanations, just the JSON object.`;

  let lastError: Error | null = null;

  // Try up to 4 attempts (2 with primary model, 2 with fallback)
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    // Switch to fallback model after 2 failed attempts
    if (attempt === 3 && !usingFallback) {
      console.log("Primary model failed, trying fallback model...");
      model = getAgentModel2Fallback();
      usingFallback = true;
    }

    const response = await generateText({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    const rawText = response.text ?? "";
    
    // Check for refusal patterns
    if (rawText.includes("I'm sorry") || rawText.includes("I can't help") || rawText.includes("cannot assist")) {
      lastError = new Error(
        `Model refused to generate plan. This may be due to content safety filters. Raw response: ${rawText}\n\nTry:\n1. Rephrasing your request more explicitly as legitimate research/automation\n2. Using a different model\n3. Being more specific about the legitimate use case`
      );
      continue;
    }
    
    const jsonText = extractJsonObjectFromText(rawText);

    if (!jsonText) {
      lastError = new Error(
        `Unable to locate a valid JSON object in the model response. Raw response: ${rawText}`
      );
      continue;
    }

    try {
      const parsed = JSON.parse(jsonText);
      
      // Check if this is an error response instead of a valid plan
      if (parsed.error || (!parsed.goal && !parsed.steps)) {
        lastError = new Error(
          `Model returned an error or invalid response instead of a plan: ${JSON.stringify(parsed)}\n\nThis typically means content safety filters were triggered.`
        );
        continue;
      }
      
      return BrowserPlanSchema.parse(parsed);
    } catch (error) {
      lastError = new Error(
        `Unable to parse JSON plan from model response. Raw extracted JSON: ${jsonText}. Error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      continue;
    }
  }

  throw new Error(
    `Failed to parse browser plan after trying both primary and fallback models: ${lastError?.message ?? "Unknown parser failure."}`
  );
}
