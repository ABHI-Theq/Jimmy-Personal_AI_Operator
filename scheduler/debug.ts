/**
 * Scheduler Debug Helper
 * Run: bun run scheduler/debug.ts
 */

import { db, getAllTasks, getRunsForTask } from "./db";
import chalk from "chalk";

async function checkCredentials() {
  console.log(chalk.bold("\n🔑 Checking Credentials in user_config...\n"));
  
  const { data, error } = await db.from("user_config").select("key,updated_at");
  
  if (error) {
    console.log(chalk.red(`❌ Error: ${error.message}`));
    return;
  }
  
  if (!data || data.length === 0) {
    console.log(chalk.red("❌ No credentials found in user_config table!"));
    console.log(chalk.yellow("\nRun this to sync: bun run index.ts sync-credentials\n"));
    return;
  }
  
  const keys = [
    "openrouter_key",
    "groq_api_key",
    "firecrawl_key",
    "google_client_id",
    "google_client_secret",
    "google_refresh_token",
  ];
  
  console.log("Credential Status:");
  for (const key of keys) {
    const found = data.find((r: any) => r.key === key);
    if (found) {
      console.log(`  ${chalk.green("✓")} ${key} (updated: ${new Date((found as any).updated_at).toLocaleString()})`);
    } else {
      console.log(`  ${chalk.red("✖")} ${key} ${chalk.dim("(missing)")}`);
    }
  }
  console.log();
}

async function checkTasks() {
  console.log(chalk.bold("📋 Tasks:\n"));
  
  const tasks = await getAllTasks();
  
  if (tasks.length === 0) {
    console.log(chalk.yellow("No tasks found.\n"));
    return;
  }
  
  for (const t of tasks) {
    console.log(chalk.bold(`${t.name}`));
    console.log(`  ID:         ${t.id}`);
    console.log(`  Status:     ${t.enabled ? chalk.green("enabled") : chalk.red("disabled")}`);
    console.log(`  Cron:       ${t.cron}`);
    console.log(`  Next run:   ${t.next_run_at ? new Date(t.next_run_at).toLocaleString() : chalk.dim("not scheduled")}`);
    console.log(`  Last run:   ${t.last_run_at ? new Date(t.last_run_at).toLocaleString() : chalk.dim("never")}`);
    console.log(`  Run count:  ${t.run_count}`);
    console.log(`  Steps:      ${t.steps.length}`);
    t.steps.forEach((s) => console.log(`    ${s.order}. [${s.type}] ${s.instruction}`));
    
    // Check last 3 runs
    const runs = await getRunsForTask(t.id, 3);
    if (runs.length > 0) {
      console.log(chalk.dim(`  Recent runs (${runs.length}):`));
      runs.forEach((r, i) => {
        const icon = r.status === "success" ? chalk.green("✓") : r.status === "failed" ? chalk.red("✖") : chalk.yellow("⟳");
        console.log(`    ${icon} ${new Date(r.started_at).toLocaleString()} — ${r.status}`);
        if (r.error) console.log(chalk.red(`       Error: ${r.error.slice(0, 100)}`));
        if (r.output) console.log(chalk.dim(`       ${r.output.slice(0, 100)}`));
      });
    } else {
      console.log(chalk.dim("  No runs yet"));
    }
    console.log();
  }
}

async function checkCronStatus() {
  console.log(chalk.bold("⏰ Checking pg_cron Status...\n"));
  
  try {
    // Check if cron job exists
    const { data: cronJobs, error: cronError } = await db.rpc("pg_cron_job_status" as any);
    
    if (cronError && cronError.message.includes("does not exist")) {
      console.log(chalk.yellow("⚠️  Cannot check pg_cron status via RPC (normal for some Supabase setups)"));
      console.log(chalk.dim("Run this SQL in Supabase SQL Editor to check:"));
      console.log(chalk.cyan("  select * from cron.job;"));
      console.log(chalk.cyan("  select * from cron.job_run_details where jobname = 'jimmy-scheduler-tick' order by start_time desc limit 5;"));
      console.log();
      return;
    }
    
    if (cronError) {
      console.log(chalk.red(`❌ Error: ${cronError.message}`));
      return;
    }
    
    console.log("Cron jobs:", cronJobs);
  } catch (e) {
    console.log(chalk.yellow("⚠️  Could not check cron status directly"));
    console.log(chalk.dim("This is normal — check manually in Supabase SQL Editor"));
  }
  console.log();
}

async function testEdgeFunctionManually() {
  console.log(chalk.bold("🧪 Manual Edge Function Trigger...\n"));
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  
  if (!url || !key) {
    console.log(chalk.red("❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env"));
    return;
  }
  
  const functionUrl = `${url}/functions/v1/scheduler-tick`;
  console.log(`Calling: ${functionUrl}\n`);
  
  try {
    const res = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({}),
    });
    
    const text = await res.text();
    
    if (res.ok) {
      console.log(chalk.green(`✓ Success (${res.status})`));
      try {
        const data = JSON.parse(text);
        console.log(chalk.bold("\nResponse:"));
        console.log(JSON.stringify(data, null, 2));
      } catch {
        console.log(text);
      }
    } else {
      console.log(chalk.red(`✖ Failed (${res.status}): ${text}`));
    }
  } catch (err) {
    console.log(chalk.red(`✖ Error: ${err instanceof Error ? err.message : String(err)}`));
  }
  console.log();
}

async function main() {
  console.log(chalk.bold.cyan("\n════════════════════════════════════════════════"));
  console.log(chalk.bold.cyan("  Jimmy Scheduler Debug Tool"));
  console.log(chalk.bold.cyan("════════════════════════════════════════════════"));
  
  await checkCredentials();
  await checkTasks();
  await checkCronStatus();
  
  console.log(chalk.bold("────────────────────────────────────────────────"));
  console.log(chalk.bold("Manual Test (optional)"));
  console.log(chalk.bold("────────────────────────────────────────────────\n"));
  console.log("This will manually trigger the Edge Function to test if it works:");
  console.log(chalk.dim("(Press Ctrl+C to skip, or wait 3 seconds...)\n"));
  
  await new Promise((r) => setTimeout(r, 3000));
  
  await testEdgeFunctionManually();
  
  console.log(chalk.bold.green("✓ Debug complete\n"));
  console.log(chalk.dim("Next steps:"));
  console.log("  • Check Edge Function logs: supabase functions logs scheduler-tick");
  console.log("  • View runs in Supabase: select * from scheduler_runs order by started_at desc;");
  console.log("  • Check cron job: select * from cron.job_run_details where jobname = 'jimmy-scheduler-tick';");
  console.log();
}

main().catch(console.error);
