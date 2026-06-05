import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!url || !key) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
}

export const db = createClient(url, key);

// ── Types mirroring the DB schema ─────────────────────────────────────────────

export interface SchedulerTask {
  id: string;
  name: string;
  description: string;
  cron: string;
  enabled: boolean;
  steps: TaskStep[];
  summary_email: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
}

export interface TaskStep {
  order: number;
  type: "web_search" | "web_crawl" | "email_send" | "custom";
  instruction: string;
}

export interface SchedulerRun {
  id: string;
  task_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  output: string | null;
  error: string | null;
  step_results: StepResult[];
}

export interface StepResult {
  order: number;
  instruction: string;
  output: string;
  success: boolean;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

export async function createTask(
  data: Omit<SchedulerTask, "id" | "created_at" | "updated_at" | "last_run_at" | "run_count">
): Promise<SchedulerTask> {
  const { data: row, error } = await db
    .from("scheduler_tasks")
    .insert({ ...data, next_run_at: data.next_run_at ?? null })
    .select()
    .single();
  if (error) throw new Error(`createTask: ${error.message}`);
  return row as SchedulerTask;
}

export async function getAllTasks(): Promise<SchedulerTask[]> {
  const { data, error } = await db
    .from("scheduler_tasks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getAllTasks: ${error.message}`);
  return (data ?? []) as SchedulerTask[];
}

export async function getTaskById(id: string): Promise<SchedulerTask | null> {
  const { data, error } = await db
    .from("scheduler_tasks")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as SchedulerTask;
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<SchedulerTask, "id" | "created_at">>
): Promise<SchedulerTask> {
  const { data, error } = await db
    .from("scheduler_tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateTask: ${error.message}`);
  return data as SchedulerTask;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await db.from("scheduler_tasks").delete().eq("id", id);
  if (error) throw new Error(`deleteTask: ${error.message}`);
}

export async function getEnabledDueTasks(): Promise<SchedulerTask[]> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("scheduler_tasks")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", now);
  if (error) throw new Error(`getEnabledDueTasks: ${error.message}`);
  return (data ?? []) as SchedulerTask[];
}

export async function createRun(taskId: string): Promise<SchedulerRun> {
  const { data, error } = await db
    .from("scheduler_runs")
    .insert({
      task_id: taskId,
      status: "running",
      step_results: [],
    })
    .select()
    .single();
  if (error) throw new Error(`createRun: ${error.message}`);
  return data as SchedulerRun;
}

export async function finishRun(
  runId: string,
  status: "success" | "failed",
  output: string,
  stepResults: StepResult[],
  errorMsg?: string
): Promise<void> {
  const { error } = await db
    .from("scheduler_runs")
    .update({
      status,
      output,
      error: errorMsg ?? null,
      step_results: stepResults,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw new Error(`finishRun: ${error.message}`);
}

export async function getRunsForTask(taskId: string, limit = 10): Promise<SchedulerRun[]> {
  const { data, error } = await db
    .from("scheduler_runs")
    .select("*")
    .eq("task_id", taskId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRunsForTask: ${error.message}`);
  return (data ?? []) as SchedulerRun[];
}
