import {
  Output,
  extractJsonMiddleware,
  generateText,
  stepCountIs,
  tool,
  wrapLanguageModel,
} from 'ai';
import { z } from 'zod';
import chalk from 'chalk';
import { ActionTracker } from '../agent/action-tracker.ts';
import { ToolExecutor } from '../agent/tool-executor.ts';
import { defaultAgentConfig } from '../agent/types.ts';
import { createWebTools } from './web-tools.ts';
import type { Plan, PlanStep } from './index.ts';
import { getAgentModel } from '../config/ai.config.ts';

const planSchema = z.object({
  researchSummary: z.string().optional(),
  steps: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        hints: z.array(z.string()).optional(),
        complexity: z.enum(['low', 'medium', 'high']).optional(),
      }),
    )
    .min(1)
    .max(15),
});

function readOnlyTools(executor: ToolExecutor) {
  return {
    read_file: tool({
      description: 'Read a workspace file (relative path).',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path: p }) => executor.readFile(p),
    }),
    list_files: tool({
      description: 'List files/dirs at a path.',
      inputSchema: z.object({
        path: z.string(),
        recursive: z.boolean().optional().default(false),
      }),
      execute: async ({ path: p, recursive }) => executor.listFiles(p, recursive),
    }),
    search_files: tool({
      description: 'Glob-search file names; optional content filter.',
      inputSchema: z.object({
        root: z.string(),
        pattern: z.string(),
        content_contains: z.string().optional(),
      }),
      execute: async ({ root, pattern, content_contains }) =>
        executor.searchFiles(root, pattern, content_contains),
    }),
    analyze_codebase: tool({
      description: 'Summarize codebase structure.',
      inputSchema: z.object({ path: z.string().default('.') }),
      execute: async ({ path: p }) => executor.analyzeCodebase(p),
    }),
    list_skills: tool({
      description: 'List paths to bundled SKILL.md files.',
      inputSchema: z.object({}),
      execute: async () => executor.listSkills(),
    }),
    read_skill: tool({
      description: 'Read a SKILL.md by absolute path.',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path: p }) => executor.readSkill(p),
    }),
  };
}

const PLAN_INSTRUCTIONS = (codebase: string | undefined, hasWeb: boolean) => {
  const parts: string[] = [
    'You are a Plan-Mode planner. You DO NOT modify files.',
  ];
  if (codebase)
    parts.push(
      `Workspace: ${codebase}`,
      'Use read-only tools for codebase/skills research.',
      'If the repository already contains an existing plan or roadmap, continue and extend it rather than replacing it. Otherwise generate a fresh, standalone roadmap as requested by the user.',
    );
  parts.push(
    hasWeb
      ? 'Web tools are available (web_search/web_crawl/fetch_url). Use only when needed.'
      : 'Web tools are unavailable (no FIRECRAWL_API_KEY).',
    'Output must match the provided JSON schema.',
    'Keep it short: 1–10 steps.',
  );
  return parts.join('\n');
};

export async function generatePlan(goal: string, options?: { useWorkspace?: boolean }): Promise<Plan> {
  const config = defaultAgentConfig();
  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);
  const hasWeb = !!process.env.FIRECRAWL_API_KEY?.trim();
  const model = wrapLanguageModel({
    model: getAgentModel(),
    middleware: extractJsonMiddleware(),
  });

  const useWorkspace = options?.useWorkspace ?? true;
  const tools = useWorkspace
    ? { ...readOnlyTools(executor), ...(hasWeb ? createWebTools(tracker) : {}) }
    : { ...(hasWeb ? createWebTools(tracker) : {}) };

  // Try robust generation with retries; if provider aborts, fall back to
  // a plain-text generation and best-effort parsing so Plan mode still returns something.
  const systemPrompt = PLAN_INSTRUCTIONS(useWorkspace ? config.codebasePath : undefined, hasWeb);
  const prompt = `User goal:\n${goal}`;

  async function tryGenerateStructured(maxRetries = 2) {
    let attempt = 0;
    while (true) {
      try {
        return await generateText({
          model,
          tools,
          stopWhen: stepCountIs(20),
          system: systemPrompt,
          prompt,
          output: Output.object({ schema: planSchema }),
        });
      } catch (err: any) {
        // Surface rate-limit style errors immediately so callers can show them
        const msg = String(err?.message ?? err ?? '');
        if (/rate limit|free-models-per-day|RateLimit|Rate limit/i.test(msg)) {
          console.error('\nModel rate limit error detected: ' + msg + '\n');
          console.log(chalk.green.bold("\nGoodBye!!!\n"))
          process.exit(0)
        }
        attempt++;
        const isAbort = err?.vercel?.ai?.error?.AI_APICallError || err?.name === 'AI_APICallError' || /aborted|timeout|504/i.test(String(err));
        if (!isAbort || attempt > maxRetries) throw err;
        const backoff = 500 * attempt;
        console.warn(`generatePlan: transient API error, retrying in ${backoff}ms (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  let result: any;
  try {
    result = await tryGenerateStructured(2);
  } catch (err) {
    // If this was a rate-limit style error, rethrow so the caller can handle/display it
    const msg = String((err as any)?.message ?? err ?? '');
    if (/rate limit|free-models-per-day|RateLimit|Rate limit/i.test(msg)) {
      console.error('\nPlan generation aborted due to model rate limits: ' + msg + '\n');
      throw err;
    }
    // Fallback: generate freeform text and try to parse into steps
    //@ts-ignore
    console.warn('Structured generation failed, falling back to plain text generation:', err?.message ?? err);
    const free = await generateText({
      model,
      tools,
      stopWhen: stepCountIs(20),
      system: systemPrompt,
      prompt: `Produce a concise numbered roadmap for the following goal.\n\nGoal:\n${goal}`,
    });
    const text = free.text ?? String(free.output ?? '');
    // Heuristic parse: find numbered lines or lines starting with "Step"
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items: string[] = [];
    for (const ln of lines) {
      if (/^\d+\.|^Step\b|^\-\s+/.test(ln)) items.push(ln.replace(/^\d+\.|^Step\s*\d*[:\.]?\s*/i, '').trim());
      else if (items.length > 0) {
        // append to last item if it's a continuation
        items[items.length - 1] = items[items.length - 1] + ' ' + ln;
      }
    }
    const steps: PlanStep[] = items.map((d, i) => ({ id: `step-${i + 1}`, title: `Step ${i + 1}`, description: d }));
    return { goal, researchSummary: '', steps };
  }
  // Normalize model output: support both `{ steps: [...] }` and `{ plan: [...] }`,
  // and tolerate items that use `step`/`description` shape instead of `title`.
  const rawOut = result.output ?? {};
  let normOut: any = { ...rawOut };

  if (!normOut.steps && Array.isArray(normOut.plan)) {
    normOut.steps = normOut.plan;
  }

  if (Array.isArray(normOut.steps)) {
    const normalizedItems = normOut.steps.map((it: any) => {
      const title = it.title ?? (it.step !== undefined ? `Step ${it.step}` : undefined);
      const description = it.description ?? it.desc ?? it.text ?? '';
      const hints = Array.isArray(it.hints) ? it.hints : it.hint ? [it.hint] : undefined;
      const complexity = it.complexity;
      return { title, description, hints, complexity };
    });
    normOut.steps = normalizedItems;
  }

  // Try strict validation, but fall back to a best-effort mapping if validation fails.
  try {
    const validated = planSchema.parse(normOut);
    const steps: PlanStep[] = validated.steps.map((s, i) => ({
      id: `step-${i + 1}`,
      title: s.title,
      description: s.description,
      hints: s.hints,
      complexity: s.complexity,
    }));
    return { goal, researchSummary: validated.researchSummary, steps };
  } catch (err) {
    // Best-effort fallback: use whatever we can extract from normOut.steps
    if (Array.isArray(normOut.steps)) {
      const steps: PlanStep[] = normOut.steps.map((s: any, i: number) => ({
        id: `step-${i + 1}`,
        title: s.title ?? `Step ${i + 1}`,
        description: s.description ?? '',
        hints: Array.isArray(s.hints) ? s.hints : undefined,
        complexity: s.complexity,
      }));
      return { goal, researchSummary: normOut.researchSummary ?? normOut.summary, steps };
    }
    throw err;
  }
}