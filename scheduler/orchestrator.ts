import chalk from "chalk";
import { select, text, confirm, isCancel } from "@clack/prompts";
import { withSpinner } from "../tui/spinner";
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getRunsForTask,
} from "./db";
import { planScheduledTask, computeNextRun } from "./planner";
import { loadConfig } from "../email_ops/email_pass_store";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Accepts either:
 *  - A plain time like "11:06" or "11.06" → converts to daily cron in UTC
 *  - A full 5-field cron expression → used as-is (assumed UTC)
 */
function parseCronInput(input: string): string {
  const trimmed = input.trim();

  // Match HH:MM or HH.MM (12 or 24 hour, with optional AM/PM)
  const timeMatch = trimmed.match(/^(\d{1,2})[:.h](\d{2})\s*(am|pm)?$/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]!, 10);
    const minutes = parseInt(timeMatch[2]!, 10);
    const meridiem = timeMatch[3]?.toLowerCase();

    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;

    // Convert local time → UTC
    const localOffsetMinutes = new Date().getTimezoneOffset(); // e.g. -330 for IST
    const totalLocalMinutes = hours * 60 + minutes;
    const totalUtcMinutes = totalLocalMinutes + localOffsetMinutes; // getTimezoneOffset is negated

    // Wrap around 24 hours
    const utcMinutes = ((totalUtcMinutes % 1440) + 1440) % 1440;
    const utcHour = Math.floor(utcMinutes / 60);
    const utcMin = utcMinutes % 60;

    const cron = `${utcMin} ${utcHour} * * *`;
    console.log(chalk.dim(`  → Converted to UTC cron: ${cron} (runs daily at ${trimmed} local time)`));
    return cron;
  }

  // Otherwise treat as raw cron expression
  return trimmed;
}

function fmtDate(iso: string | null) {
  if (!iso) return chalk.dim("never");
  return new Date(iso).toLocaleString();
}

function fmtCron(cron: string) {
  // Show UTC cron + local time equivalent if it's a daily schedule
  const daily = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (daily) {
    const utcMin = parseInt(daily[1]!, 10);
    const utcHour = parseInt(daily[2]!, 10);
    const localDate = new Date();
    localDate.setUTCHours(utcHour, utcMin, 0, 0);
    return `${cron} ${chalk.dim(`(daily ${localDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} local)`)}`;
  }
  return cron;
}

function fmtEnabled(v: boolean) {
  return v ? chalk.green("enabled") : chalk.red("disabled");
}

// ── Sub-screens ───────────────────────────────────────────────────────────────

async function listTasks() {
  const tasks = await getAllTasks();
  if (tasks.length === 0) {
    console.log(chalk.yellow("\nNo scheduled tasks yet.\n"));
    return;
  }
  console.log(chalk.bold(`\n${"#".padEnd(4)} ${"Name".padEnd(28)} ${"Cron".padEnd(16)} ${"Status".padEnd(10)} ${"Runs".padEnd(6)} Last Run`));
  console.log("─".repeat(90));
  tasks.forEach((t, i) => {
    console.log(
      `${String(i + 1).padEnd(4)} ${t.name.slice(0, 27).padEnd(28)} ${t.cron.padEnd(16)} ${fmtEnabled(t.enabled).padEnd(18)} ${String(t.run_count).padEnd(6)} ${fmtDate(t.last_run_at)}`
    );  });
  console.log();
}

async function addTask() {
  const desc = await text({
    message: "Describe the repetitive task (what should happen and how often):",
    placeholder: "e.g. Every morning search top AI news and email me a summary",
  });
  if (isCancel(desc) || !desc?.trim()) return;

  const plan = await withSpinner("Planning task with AI…", () =>
    planScheduledTask(desc.trim())
  );

  console.log(chalk.bold(`\nTask name:  ${plan.name}`));
  console.log(chalk.bold(`Cron:       ${plan.cron}`));
  console.log(chalk.bold(`Steps (${plan.steps.length}):`));
  plan.steps.forEach((s:any) => console.log(`  ${s.order}. [${s.type}] ${s.instruction}`));


  // Only ask for email if there's an email_send step AND no email already in the instructions
  const hasEmailStep = plan.steps.some((s: any) => s.type === "email_send");
  const emailAlreadyInSteps = plan.steps.some(
    (s: any) => s.type === "email_send" && /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(s.instruction)
  );
  let recipientEmail: string | null = null;

  if (hasEmailStep && !emailAlreadyInSteps) {
    const emailPrompt = await text({
      message: "📧 This task sends emails. Enter recipient email address:",
      placeholder: "your@email.com",
      validate: (v) => {
        if (!v || !v.trim()) return "Email is required for email_send steps";
        if (!v.includes("@")) return "Please enter a valid email";
        return undefined;
      },
    });
    if (isCancel(emailPrompt)) return;
    recipientEmail = emailPrompt?.trim() || null;
  }

  const editCron = await text({
    message: "Schedule — enter time like '11:06' (daily, your local time) or a full cron e.g. '0 9 * * 1':",
    initialValue: plan.cron,
  });
  if (isCancel(editCron)) return;
  const finalCron = parseCronInput(editCron?.trim() || plan.cron);

  const emailInput = await text({
    message: "Send summary email after each run? (leave blank to skip):",
    placeholder: "you@example.com",
  });
  if (isCancel(emailInput)) return;
  const summaryEmail = emailInput?.trim() || null;

  // Replace USER_EMAIL placeholder AND update any email_send step instructions to include the actual email
  const finalSteps = plan.steps.map((step:any) => {
    if (step.type === "email_send" && recipientEmail) {
      // If instruction has USER_EMAIL, replace it
      if (step.instruction.includes("USER_EMAIL")) {
        return {
          ...step,
          instruction: step.instruction.replace(/USER_EMAIL/g, recipientEmail),
        };
      }
      // Otherwise, append the email to the instruction
      return {
        ...step,
        instruction: `${step.instruction} to ${recipientEmail}`,
      };
    }
    return step;
  });

  const ok = await confirm({ message: "Create this task?" });
  if (isCancel(ok) || !ok) return;

  const task = await createTask({
    name: plan.name,
    description: desc.trim(),
    cron: finalCron,
    enabled: true,
    steps: finalSteps,
    summary_email: summaryEmail,
    next_run_at: computeNextRun(finalCron),
  });

  console.log(chalk.green(`\n✓ Task created: ${task.id}\n`));
}

async function manageTask() {
  const tasks = await getAllTasks();
  if (tasks.length === 0) {
    console.log(chalk.yellow("\nNo tasks to manage.\n"));
    return;
  }

  const choice = await select({
    message: "Select a task:",
    options: tasks.map((t) => ({
      value: t.id,
      label: `${t.name} [${fmtEnabled(t.enabled)}] — ${t.cron}`,
    })),
  });
  if (isCancel(choice)) return;

  const task = await getTaskById(choice as string);
  if (!task) return;

  while (true) {
    console.log(chalk.bold(`\n── ${task.name} ──`));
    console.log(`  ID:          ${task.id}`);
    console.log(`  Cron:        ${fmtCron(task.cron)}`);
    console.log(`  Status:      ${fmtEnabled(task.enabled)}`);
    console.log(`  Runs:        ${task.run_count}`);
    console.log(`  Last run:    ${fmtDate(task.last_run_at)}`);
    console.log(`  Next run:    ${fmtDate(task.next_run_at)}`);
    console.log(`  Summary to:  ${task.summary_email ?? chalk.dim("(none)")}`);
    console.log(`  Steps:`);
    task.steps.forEach((s) => console.log(`    ${s.order}. [${s.type}] ${s.instruction}`));
    console.log();

    const action = await select({
      message: "Action:",
      options: [
        { value: "toggle", label: task.enabled ? "Disable task" : "Enable task" },
        { value: "edit_cron", label: "Edit cron schedule" },
        { value: "edit_email", label: "Edit summary email" },
        { value: "run_now", label: "Run now (manual trigger)" },
        { value: "history", label: "View run history" },
        { value: "delete", label: chalk.red("Delete task") },
        { value: "back", label: "Back" },
      ],
    });
    if (isCancel(action) || action === "back") break;

    if (action === "toggle") {
      await updateTask(task.id, { enabled: !task.enabled });
      task.enabled = !task.enabled;
      console.log(chalk.green(`✓ Task ${task.enabled ? "enabled" : "disabled"}\n`));
    }

    if (action === "edit_cron") {
      const newCron = await text({ message: "New schedule — time like '11:06' (daily, local) or full cron:", initialValue: task.cron });
      if (!isCancel(newCron) && newCron?.trim()) {
        const parsed = parseCronInput(newCron.trim());
        await updateTask(task.id, { cron: parsed, next_run_at: computeNextRun(parsed) });
        task.cron = parsed;
        console.log(chalk.green(`✓ Schedule updated to: ${parsed}\n`));
      }
    }

    if (action === "edit_email") {
      const newEmail = await text({ message: "Summary email (blank to remove):", initialValue: task.summary_email ?? "" });
      if (!isCancel(newEmail)) {
        const val = newEmail?.trim() || null;
        await updateTask(task.id, { summary_email: val });
        task.summary_email = val;
        console.log(chalk.green("✓ Email updated\n"));
      }
    }

    if (action === "run_now") {
      const confirmed = await confirm({ message: "Run this task now?" });
      if (!isCancel(confirmed) && confirmed) {
        let error: string | null = null;
        let ranCount = 0;
        let taskStatus = "unknown";

        await withSpinner(`Running ${task.name}…`, async () => {
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

          if (!url || !key) {
            error = "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env";
            return;
          }

          // Set next_run_at far in the past so it's definitely "due"
          await updateTask(task.id, {
            next_run_at: new Date(Date.now() - 60000).toISOString(),
          });

          // Small delay to ensure DB write is committed
          await new Promise((r) => setTimeout(r, 500));

          const res = await fetch(`${url}/functions/v1/scheduler-tick`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({}),
          });

          const body = await res.text();

          if (!res.ok) {
            error = `Edge Function returned ${res.status}: ${body}`;
            return;
          }

          try {
            const data = JSON.parse(body);
            ranCount = data?.ran ?? 0;
            const match = (data?.results ?? []).find((r: any) => r.taskId === task.id);
            taskStatus = match?.status ?? (ranCount > 0 ? "success" : "not_picked_up");
          } catch {
            error = `Invalid response: ${body.slice(0, 100)}`;
          }
        });

        if (error) {
          console.log(chalk.red(`\n✖ ${error}\n`));
        } else if (taskStatus === "not_picked_up") {
          console.log(chalk.yellow("\n⚠ Edge Function ran but did not pick up this task."));
          console.log(chalk.dim("This can happen if next_run_at wasn't updated in time. Try again.\n"));
        } else {
          const icon = taskStatus === "success" ? chalk.green("✓")
            : taskStatus === "partial" ? chalk.yellow("⚠")
            : chalk.red("✖");
          console.log(`\n${icon} Done — status: ${chalk.bold(taskStatus)}`);
          console.log(chalk.dim("View full results: Manage → View run history\n"));
        }
      }
    }

    if (action === "history") {
      const runs = await getRunsForTask(task.id, 10);
      if (runs.length === 0) {
        console.log(chalk.yellow("\nNo runs yet.\n"));
      } else {
        console.log(chalk.bold("\nRun History (last 10):\n"));
        runs.forEach((r, i) => {
          const icon = r.status === "success" ? chalk.green("✓") : r.status === "failed" ? chalk.red("✖") : chalk.yellow("⟳");
          console.log(`${i + 1}. ${icon} ${fmtDate(r.started_at)} — ${r.status}`);
          if (r.output) console.log(chalk.dim(`   ${r.output.slice(0, 200)}`));
          if (r.error) console.log(chalk.red(`   Error: ${r.error.slice(0, 200)}`));
        });
        console.log();
      }
    }

    if (action === "delete") {
      const sure = await confirm({ message: chalk.red(`Delete "${task.name}"? This cannot be undone.`) });
      if (!isCancel(sure) && sure) {
        await deleteTask(task.id);
        console.log(chalk.green("✓ Task deleted\n"));
        break;
      }
    }
  }
}

// ── Main entry ────────────────────────────────────────────────────────────────

function showDeployInstructions() {
  const config = loadConfig();
  const refreshToken = config?.refresh_token ?? "<run gmail auth first>";
  console.log(chalk.bold("\n🚀 Serverless Deploy (Supabase Edge Function)\n"));
  console.log("1. Install Supabase CLI:  npm i -g supabase");
  console.log("2. Login:                 supabase login");
  console.log("3. Link project:          supabase link --project-ref <YOUR_PROJECT_REF>");
  console.log("4. Deploy function:       .\\supabase\\deploy.ps1");
  console.log("5. Set service role key:");
  console.log(chalk.cyan("   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>"));
  console.log("6. Set Gmail refresh token:");
  console.log(chalk.cyan(`   supabase secrets set GOOGLE_REFRESH_TOKEN=${refreshToken}`));
  console.log("7. Run the SQL in:        supabase/functions/scheduler-tick/setup.sql");
  console.log(chalk.green("\nAfter deploy, tasks run every minute in Supabase — no local process needed.\n"));
}

export async function runSchedulerMode() {
  console.log(chalk.bold("\n⏰ Scheduler Mode\n"));
  console.log(chalk.dim("Tip: run 'jimmy daemon' in a separate terminal to execute tasks autonomously.\n"));

  while (true) {
    const option = await select({
      message: "Scheduler:",
      options: [
        { value: "list", label: "List all tasks" },
        { value: "add", label: "Add new task (AI plans it)" },
        { value: "manage", label: "Manage / edit / delete a task" },
        { value: "deploy", label: "Show serverless deploy instructions" },
        { value: "back", label: "Back" },
      ],
    });

    if (isCancel(option) || option === "back") break;

    try {
      if (option === "list") await listTasks();
      if (option === "add") await addTask();
      if (option === "manage") await manageTask();
      if (option === "deploy") showDeployInstructions();
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}\n`));
    }
  }
}
