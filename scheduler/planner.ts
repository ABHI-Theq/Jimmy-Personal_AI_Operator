import { generateText } from "ai";
import { getAgentModel, getAgentModel2, getAgentModel2Fallback } from "../config/ai.config";
import type { TaskStep } from "./db";

interface ParsedPlan {
  steps: TaskStep[];
  cron: string;
  name: string;
}

function extractJson(text: string): string | null {
  let s = text.trim();
  if (s.startsWith("```json")) s = s.slice(7);
  if (s.startsWith("```")) s = s.slice(3);
  if (s.endsWith("```")) s = s.slice(0, -3);
  s = s.trim();
  const i = s.indexOf("{");
  if (i === -1) return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}") {
      depth--;
      if (depth === 0) return s.slice(i, j + 1);
    }
  }
  return null;
}

const SYSTEM_PROMPT = `You are a task automation planner. Given a user description of a repetitive task, produce a structured execution plan.

Step types:
- "web_search": search the web for information
- "web_crawl": scrape a specific URL for content
- "email_send": send an email with accumulated results
- "custom": any other AI-driven text/data task

IMPORTANT for email_send steps:
- If the user includes one or more email addresses in their description, embed them directly in the instruction, e.g. "send summary to alice@gmail.com, bob@work.com with subject 'Daily Report'"
- If the user says "email me" without specifying an address, use the placeholder USER_EMAIL so the system can ask for it
- NEVER invent or guess email addresses

You MUST respond with ONLY valid JSON — no markdown, no explanation, just the JSON object:
{
  "name": "short descriptive task name",
  "cron": "standard 5-field cron expression e.g. 0 9 * * *",
  "steps": [
    { "order": 1, "type": "web_search", "instruction": "exact instruction for this step" },
    { "order": 2, "type": "email_send", "instruction": "send results to alice@gmail.com with subject 'Results'" }
  ]
}`;

const models = [
  () => getAgentModel2(),          // Groq llama — most reliable for structured output
  () => getAgentModel2Fallback(),  // OpenRouter fallback
  () => getAgentModel(),           // Primary (may be filtered)
];

export async function planScheduledTask(description: string): Promise<ParsedPlan> {
  let lastError: Error | null = null;

  for (const getModel of models) {
    let model;
    try { model = getModel(); } catch { continue; }

    for (let attempt = 0; attempt < 2; attempt++) {
      let text = "";
      try {
        const res = await generateText({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Plan this task: ${description}` },
          ],
          temperature: attempt === 0 ? 0.3 : 0.1, // lower temp on retry
        });
        text = res.text?.trim() ?? "";
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        break; // try next model
      }

      // Detect safety refusals
      const lower = text.toLowerCase();
      if (
        lower.includes("i'm sorry") ||
        lower.includes("i cannot") ||
        lower.includes("i can't") ||
        lower.startsWith("user safety") ||
        lower.includes("content policy") ||
        text.length < 20
      ) {
        lastError = new Error(`Model refused: ${text.slice(0, 100)}`);
        break; // try next model
      }

      const jsonStr = extractJson(text);
      if (!jsonStr) {
        lastError = new Error(`No JSON found in response: ${text.slice(0, 200)}`);
        continue; // retry same model with lower temp
      }

      try {
        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
          lastError = new Error("Plan missing steps");
          continue;
        }
        return {
          name: parsed.name ?? "Unnamed Task",
          cron: parsed.cron ?? "0 9 * * *",
          steps: parsed.steps as TaskStep[],
        };
      } catch (e) {
        lastError = new Error(`JSON parse failed: ${e}`);
        continue;
      }
    }
  }

  throw new Error(
    `Failed to plan task after trying all models. Last error: ${lastError?.message ?? "unknown"}`
  );
}

export function computeNextRun(cronExpr: string): string {
  // Parse the 5-field cron expression and find the next matching UTC time
  const [min, hour, dom, month, dow] = cronExpr.trim().split(/\s+/);

  const matchField = (value: number, field: string): boolean => {
    if (field === "*") return true;
    if (field.includes("/")) {
      const [base, step] = field.split("/");
      const start = base === "*" ? 0 : parseInt(base as string, 10);
      return (value - start) % parseInt(step!, 10) === 0 && value >= start;
    }
    if (field.includes(",")) return field.split(",").map(Number).includes(value);
    if (field.includes("-")) {
      const [lo, hi] = field.split("-").map(Number);
      return value >= lo! && value <= hi!;
    }
    return parseInt(field, 10) === value;
  };

  // Scan forward from next minute in UTC (Supabase pg_cron runs in UTC)
  const now = new Date();
  now.setSeconds(0, 0);

  for (let offset = 1; offset <= 60 * 24 * 7; offset++) {
    const c = new Date(now.getTime() + offset * 60_000);
    if (
      matchField(c.getUTCMinutes(), min!) &&
      matchField(c.getUTCHours(), hour!) &&
      matchField(c.getUTCDate(), dom!) &&
      matchField(c.getUTCMonth() + 1, month!) &&
      matchField(c.getUTCDay(), dow!)
    ) {
      return c.toISOString();
    }
  }

  // Fallback: 1 hour from now
  return new Date(now.getTime() + 3_600_000).toISOString();
}
