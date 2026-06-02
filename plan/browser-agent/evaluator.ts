import { getAgentModel2 } from "../../config/ai.config";
import type { EvaluationResult, ExecutionResult, BrowserPlan } from "./types";
import { generateText } from "ai";
import { z } from "zod";

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

function parseNumberLike(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  const numeric = Number(normalized.replace(/,/g, ""));
  if (!Number.isNaN(numeric)) {
    return numeric;
  }

  const parts = normalized.replace(/-/g, " ").split(/\s+/);
  let total = 0;
  let valid = false;

  for (const part of parts) {
    if (NUMBER_WORDS[part] === undefined) {
      return null;
    }

    const value = NUMBER_WORDS[part];
    if (value === 100 && total !== 0) {
      total *= value;
    } else {
      total += value;
    }
    valid = true;
  }

  return valid ? total : null;
}

const booleanLike = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "n"].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

const percentageLike = z.preprocess((value) => {
  const num = parseNumberLike(value);
  return num;
}, z.number().min(0).max(100));

const issuesLike = z.preprocess((value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return [];
    }
    return [trimmed];
  }
  return value;
}, z.array(z.string()));

const EvaluationSchema = z.object({
  satisfied: booleanLike,
  score: percentageLike,
  feedback: z.string(),
  completeness: percentageLike,
  accuracy: percentageLike,
  issues: issuesLike,
}).strict();

export async function evaluateExecutionResults(
  query: string,
  plan: BrowserPlan,
  results: ExecutionResult[],
  evaluationThreshold: number = 80
): Promise<EvaluationResult> {
  const model = getAgentModel2();

  const successfulResults = results.filter((r) => r.success);
  const failedSteps = results
    .filter((r) => !r.success)
    .map((r) => `Step ${r.stepNumber} (${r.action}): ${r.error}`);

  const executionSummary = `
Plan Goal: ${plan.goal}
Query: ${query}
Executed Steps: ${results.length}
Successful Steps: ${successfulResults.length}
Failed Steps: ${failedSteps.length}

${failedSteps.length > 0 ? `Failures:\n${failedSteps.join("\n")}` : ""}

Execution Details:
${results.map((r) => `- Step ${r.stepNumber} (${r.action}): ${r.message}`).join("\n")}
`;

  const systemPrompt = `You are an evaluator for browser automation tasks. Assess whether the execution successfully completed the requested task.

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "satisfied": boolean,
  "score": number (0-100),
  "feedback": "string",
  "completeness": number (0-100),
  "accuracy": number (0-100),
  "issues": ["issue1", "issue2"]
}`;

    const userPrompt = `Evaluate this browser automation execution:

  ${executionSummary}

  Original Query: "${query}"`;

  const response = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.3,
  });

  const extractJsonObjectFromText = (text: string): string | null => {
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
  };

  const normalizeLooseString = (value: string): string => {
    let normalized = value.trim();
    if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
      normalized = normalized.slice(1, -1);
    }
    return normalized.replace(/\s+/g, " ").trim();
  };

  const normalizeLooseBoolean = (value: string): boolean | null => {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "n"].includes(normalized)) {
      return false;
    }
    return null;
  };

  const normalizeLooseValue = (value: string): unknown => {
    const normalized = value.trim();
    const bool = normalizeLooseBoolean(normalized);
    if (bool !== null) {
      return bool;
    }

    const num = parseNumberLike(normalized);
    if (num !== null) {
      return num;
    }

    try {
      if (normalized.startsWith("[") || normalized.startsWith("{")) {
        const sanitized = normalized.replace(/'/g, '"');
        return JSON.parse(sanitized);
      }
    } catch {
      // fallback to string
    }

    return normalizeLooseString(normalized);
  };

  const parseLooseEvaluationResponse = (rawText: string): unknown => {
    const jsonText = extractJsonObjectFromText(rawText);
    if (!jsonText) {
      throw new Error(
        `Unable to locate a valid JSON object in the model response. Raw response: ${rawText}`
      );
    }

    try {
      return JSON.parse(jsonText);
    } catch {
      const result: Record<string, unknown> = {};
      const pairs: Array<[string, string]> = [];
      const pattern = /["']?(satisfied|score|feedback|completeness|accuracy|issues)["']?\s*:\s*([^,}\n]+|\[[^\]]*\]|\{[^}]*\})/gi;
      let match: RegExpExecArray | null;
      while (true) {
        match = pattern.exec(jsonText);
        if (!match) {
          break;
        }
        pairs.push([match[1]!.toLowerCase(), match[2]!.trim()]);
      }

      for (const [key, rawValue] of pairs) {
        if (key === "issues") {
          const trimmed = rawValue.trim();
          if (trimmed.startsWith("[")) {
            try {
              result.issues = JSON.parse(trimmed.replace(/'/g, '"'));
              continue;
            } catch {
              // fallback
            }
          }
          result.issues = [normalizeLooseString(trimmed)];
          continue;
        }

        if (key === "feedback") {
          result.feedback = normalizeLooseString(rawValue);
          continue;
        }

        result[key] = normalizeLooseValue(rawValue);
      }

      return result;
    }
  };

  try {
    const rawText = response.text?.trim() ?? "";
    const parsed = parseLooseEvaluationResponse(rawText);
    const evaluation = EvaluationSchema.parse(parsed);

    if (evaluation.score < evaluationThreshold) {
      evaluation.satisfied = false;
    }

    return evaluation;
  } catch (error) {
    throw new Error(
      `Failed to parse evaluation result: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function shouldContinueIterating(
  evaluation: EvaluationResult,
  iteration: number,
  maxIterations: number
): boolean {
  // Stop if satisfied
  if (evaluation.satisfied) {
    return false;
  }

  // Stop if max iterations reached
  if (iteration >= maxIterations) {
    return false;
  }

  // Continue if score is improvable and iterations remain
  return true;
}

export function extractFeedbackForNextIteration(
  evaluation: EvaluationResult
): string {
  const issues = evaluation.issues.slice(0, 3).join("; ");
  return `Previous iteration score: ${evaluation.score}/100. Issues to fix: ${issues}. Completeness: ${evaluation.completeness}%, Accuracy: ${evaluation.accuracy}%.`;
}
