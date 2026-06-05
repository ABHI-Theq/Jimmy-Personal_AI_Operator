/**
 * Update an existing task's email_send steps with correct recipient
 * Usage: bun run scheduler/update-task-email.ts "task-id" "your@email.com"
 */

import { getTaskById, updateTask } from "./db";
import chalk from "chalk";

const taskId = process.argv[2];
const email = process.argv[3];

if (!taskId || !email) {
  console.log(chalk.red("\n❌ Usage:\n"));
  console.log(chalk.cyan('bun run scheduler/update-task-email.ts "task-id" "your@email.com"\n'));
  console.log(chalk.dim("To find task IDs, run: jimmy jet → Scheduler → List all tasks\n"));
  process.exit(1);
}

if (!email.includes("@")) {
  console.log(chalk.red("\n❌ Invalid email address\n"));
  process.exit(1);
}

async function updateTaskEmail() {
  const task = await getTaskById(taskId as string);
  
  if (!task) {
    console.log(chalk.red(`\n❌ Task not found: ${taskId}\n`));
    process.exit(1);
  }

  console.log(chalk.bold(`\nUpdating task: ${task.name}`));
  console.log(chalk.dim(`Current steps:`));
  task.steps.forEach((s) => console.log(`  ${s.order}. [${s.type}] ${s.instruction}`));

  // Update all email_send steps
  const updatedSteps = task.steps.map((step) => {
    if (step.type === "email_send") {
      // Replace any existing email or USER_EMAIL with the new one
      let newInstruction = step.instruction
        .replace(/USER_EMAIL/g, email as string)
        .replace(/recipient@example\.com/g, email as string)
        .replace(/to [^\s@]+@[^\s@]+/g, `to ${email}`);
      
      // If no "to X" pattern found, append it
      if (!newInstruction.includes("to ") || !newInstruction.includes("@")) {
        newInstruction = `${newInstruction} to ${email}`;
      }
      
      return { ...step, instruction: newInstruction };
    }
    return step;
  });

  await updateTask(taskId as string, { steps: updatedSteps });

  console.log(chalk.green(`\n✓ Updated email steps to send to: ${email}\n`));
  console.log(chalk.dim("Updated steps:"));
  updatedSteps.forEach((s) => {
    if (s.type === "email_send") {
      console.log(chalk.cyan(`  ${s.order}. [${s.type}] ${s.instruction}`));
    }
  });
  console.log();
}

updateTaskEmail().catch(console.error);
