import chalk from 'chalk';
import { confirm, isCancel, text } from '@clack/prompts';
import fs from 'node:fs';
import path from 'node:path';
import { ToolLoopAgent, stepCountIs } from 'ai';
import { ActionTracker } from '../agent/action-tracker.ts';
import { ToolExecutor } from '../agent/tool-executor.ts';
import { createAgentTools } from '../agent/agent-tools.ts';
import { defaultAgentConfig } from '../agent/types.ts';
import { runApprovalFlow } from '../agent/approval.ts';
import { generatePlan } from './planner';
import { printPlan, selectSteps } from './selection';
import { createWebTools } from './web-tools';
import type { PlanStep } from './types';
import { renderHTMLMarkdown } from '../tui/terminal-render.ts';
import { getAgentModel } from '../config/ai.config.ts';
import { withSpinner } from '../tui/spinner';

function stepPrompt(goal: string, step: PlanStep): string {
  return [`Goal: ${goal}`, `Step: ${step.title}`, step.description].join('\n');
}

export async function runPlanMode(): Promise<void> {
  console.log(chalk.bold('\n🧭 Plan Mode\n'));

  const goal = await text({ message: 'What is your goal?' });
  if (isCancel(goal) || !goal.trim()) return;
  const includeWorkspace = await confirm({
    message: 'Include workspace research (scan repository)?',
    initialValue: true,
  });

  const spinnerLabel = includeWorkspace ? 'Researching & drafting a plan…' : 'Drafting plan…';
  const plan = await withSpinner(spinnerLabel, async () =>
    generatePlan(goal.trim(), { useWorkspace: includeWorkspace as boolean }),
  );
  printPlan(plan);

  const wantsSave = await confirm({
    message: 'Save this plan to a .md file?',
    initialValue: true,
  });

  let savedPath: string | undefined;
  if (wantsSave) {
    const filename = await text({ message: 'Filename', initialValue: 'plan.md', validate: (v) => {
      const s = (v ?? '').trim();
      if (!s) return 'Required';
      if (s.includes('..') || s.includes('/') || s.includes('\\')) return 'No paths';
      if (!s.toLowerCase().endsWith('.md')) return 'Must end with .md';
    } });
    if (!isCancel(filename)) {
      const outPath = path.resolve(process.cwd(), filename.trim());
      const md = [`# Plan: ${plan.goal}`, '', '```json', JSON.stringify({ goal: plan.goal, researchSummary: plan.researchSummary, steps: plan.steps }, null, 2), '```', ''].join('\n');
      fs.writeFileSync(outPath, md, 'utf8');
      savedPath = outPath;
      console.log(chalk.green(`Saved plan to ${outPath}`));
    }
  }

  const selected = await selectSteps(plan);
  if (selected.length === 0) return;

  const executeNow = await confirm({ message: `Execute ${selected.length} step(s) via Agent Mode?`, initialValue: false });
  if (!isCancel(executeNow) && executeNow) {
    // Ensure plan is stored in an .md file to drive execution
    if (!savedPath) {
      const mustSave = await confirm({ message: 'Execution requires a saved plan .md file. Save now?', initialValue: true });
      if (isCancel(mustSave) || !mustSave) {
        console.log(chalk.yellow('Execution cancelled (plan not saved).'));
        return;
      }
      const filename = await text({ message: 'Filename', initialValue: 'plan.md', validate: (v) => {
        const s = (v ?? '').trim();
        if (!s) return 'Required';
        if (s.includes('..') || s.includes('/') || s.includes('\\')) return 'No paths';
        if (!s.toLowerCase().endsWith('.md')) return 'Must end with .md';
      } });
      if (isCancel(filename)) return;
      const outPath = path.resolve(process.cwd(), filename.trim());
      const md = [`# Plan: ${plan.goal}`, '', '```json', JSON.stringify({ goal: plan.goal, researchSummary: plan.researchSummary, steps: plan.steps }, null, 2), '```', ''].join('\n');
      fs.writeFileSync(outPath, md, 'utf8');
      savedPath = outPath;
      console.log(chalk.green(`Saved plan to ${outPath}`));
    }

    // Read plan from savedPath and parse JSON block
    let planObj: { goal: string; researchSummary?: string; steps: PlanStep[] } | null= null;
    try {
      const raw = fs.readFileSync(savedPath!, 'utf8');
      const m = raw.match(/```json\s*([\s\S]*?)\s*```/i);
      if (m && m[1]) {
        planObj = JSON.parse(m[1]);
      } else {
        throw new Error('No JSON block found in plan file');
      }
    } catch (err) {
      console.log(chalk.red('Failed to parse saved plan .md; aborting execution.')); 
      console.error(err);
      return;
    }

    const config = defaultAgentConfig();
    const tracker = new ActionTracker();
    const executor = new ToolExecutor(tracker, config);

    const tools = {
      ...createAgentTools(executor),
      ...(process.env.FIRECRAWL_API_KEY ? createWebTools(tracker) : {}),
    };

    for (const step of planObj!.steps) {
      console.log(chalk.bold(`\n🔧 ${step.title}\n`));
      const agent = new ToolLoopAgent({ model: getAgentModel(), stopWhen: stepCountIs(30), tools });
      const r = await agent.generate({ prompt: stepPrompt(planObj!.goal, step), onStepFinish: ({ toolCalls }) => {
        for (const tc of toolCalls) {
          const preview = JSON.stringify(tc?.input).slice(0, 160);
          console.log(chalk.green('  ✓'), chalk.bold(String(tc?.toolName)), chalk.dim(preview + (preview.length >= 160 ? '...' : '')));
        }
      } });
      if (r.text?.trim()) console.log(renderHTMLMarkdown(r.text));
    }

    const ok = await runApprovalFlow(tracker);
    if (!ok) return executor.clearStaging();

    const { errors, newFiles } = executor.applyApprovedFromTracker();
    if (errors.length) {
      console.log(chalk.red('\nSome operations reported errors:\n'));
      for (const e of errors) console.log(chalk.red(`  • ${e}`));
    } else {
      console.log(chalk.green('\n✓ Applied.\n'));
    }
    executor.clearStaging();
  }
}