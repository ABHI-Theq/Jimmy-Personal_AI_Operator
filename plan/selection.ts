import { multiselect, isCancel } from '@clack/prompts';
import chalk from 'chalk';
import type { Plan, PlanStep } from './index.ts';
import { renderHTMLMarkdown } from '../tui/terminal-render.ts';

const COMPLEXITY_COLOR: Record<NonNullable<PlanStep['complexity']>, string> = {
  low: chalk.green('low'),
  medium: chalk.yellow('medium'),
  high: chalk.red('high'),
};

export function printPlan(plan: Plan): void {
  if (plan.researchSummary?.trim()) {
    console.log(chalk.bold('\n🔍 Research summary'));
    console.log(renderHTMLMarkdown(plan.researchSummary));
  }
  console.log(chalk.bold('\n📋 Generated Plan\n'));
  for (const [i, s] of plan.steps.entries()) {
    const tag = s.complexity ? `[${COMPLEXITY_COLOR[s.complexity]}]` : '';
    console.log(`  ${chalk.cyan(`Step ${String(i + 1).padStart(2)}`)}. ${chalk.bold(s.title)} ${tag}`);
  }
  console.log();
}

export async function selectSteps(plan: Plan): Promise<PlanStep[]> {
  const options = plan.steps.map((s: any) => ({
    value: s.id,
    label: s.title,
    hint: s.complexity ?? '',
    disabled: false,
  }));

  let picked: string[] | null = null;
  try {
    picked = await multiselect<string>({
      message: 'Select steps to execute (space toggles, enter confirms)',
      options,
      initialValues: plan.steps.map((s: any) => s.id),
      required: false,
    }) as string[];
  } catch (err) {
    // If the multiselect UI throws (some terminals or environments), fall back to selecting all steps
    console.warn('multiselect failed, defaulting to all steps');
    picked = plan.steps.map((s: any) => s.id);
  }

  if (isCancel(picked)) return [];
  const set = new Set<string>(picked);
  return plan.steps.filter((s:any) => set.has(s.id));
}