/**
 * Jimmy Scheduler – Supabase Edge Function
 * Runs every minute via pg_cron, executes due tasks, writes results.
 * Credentials loaded from user_config table (auto-synced on re-auth).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Credentials {
  openrouter_key: string;
  openrouter_model: string;
  groq_api_key: string;
  firecrawl_key: string;
  google_client_id: string;
  google_client_secret: string;
  google_refresh_token: string;
}

interface TaskStep {
  order: number;
  type: "web_search" | "web_crawl" | "email_send" | "custom";
  instruction: string;
}

interface SchedulerTask {
  id: string;
  name: string;
  description: string;
  cron: string;
  steps: TaskStep[];
  summary_email: string | null;
  run_count: number;
}

interface StepResult {
  order: number;
  instruction: string;
  output: string;
  success: boolean;
}

async function loadCredentials(): Promise<Credentials> {
  const { data, error } = await db.from("user_config").select("key,value");
  if (error) throw new Error(`Credential load failed: ${error.message}`);
  const m: Record<string, string> = {};
  for (const r of data ?? []) m[(r as any).key] = (r as any).value;
  return {
    openrouter_key: m["openrouter_key"] ?? "",
    openrouter_model: m["openrouter_model"] ?? "openai/gpt-4o-mini",
    groq_api_key: m["groq_api_key"] ?? "",
    firecrawl_key: m["firecrawl_key"] ?? "",
    google_client_id: m["google_client_id"] ?? "",
    google_client_secret: m["google_client_secret"] ?? "",
    google_refresh_token: m["google_refresh_token"] ?? "",
  };
}

function computeNextRun(cron: string): string {
  const now = new Date();
  now.setSeconds(0, 0);
  const [min, hour, dom, month, dow] = cron.trim().split(/\s+/);

  const match = (v: number, f: string) => {
    if (f === "*") return true;
    if (f.includes("/")) {
      const [base, step] = f.split("/");
      const start = base === "*" ? 0 : parseInt(base, 10);
      return (v - start) % parseInt(step!, 10) === 0 && v >= start;
    }
    if (f.includes(",")) return f.split(",").map(Number).includes(v);
    if (f.includes("-")) {
      const [lo, hi] = f.split("-").map(Number);
      return v >= lo! && v <= hi!;
    }
    return parseInt(f, 10) === v;
  };

  // Use UTC methods — Supabase Edge Functions run in UTC, pg_cron is UTC
  for (let offset = 1; offset <= 10080; offset++) {
    const c = new Date(now.getTime() + offset * 60000);
    if (
      match(c.getUTCMinutes(), min!) &&
      match(c.getUTCHours(), hour!) &&
      match(c.getUTCDate(), dom!) &&
      match(c.getUTCMonth() + 1, month!) &&
      match(c.getUTCDay(), dow!)
    ) return c.toISOString();
  }
  return new Date(now.getTime() + 3600000).toISOString();
}

async function llm(prompt: string, sys: string, creds: Credentials): Promise<string> {
  if (creds.openrouter_key) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.openrouter_key}`,
      },
      body: JSON.stringify({
        model: creds.openrouter_model,
        messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      const refusal = (s: string) =>
        s.toLowerCase().startsWith("user safety") || s.includes("i'm sorry") || s.includes("i cannot");
      if (text && !refusal(text)) return text;
    }
  }
  if (creds.groq_api_key) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.groq_api_key}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.choices?.[0]?.message?.content?.trim() ?? "";
    }
  }
  throw new Error("All LLM providers failed");
}

async function webSearch(query: string, creds: Credentials): Promise<string> {
  if (!creds.firecrawl_key) return "(web search unavailable)";
  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.firecrawl_key}` },
    body: JSON.stringify({ query, limit: 5 }),
  });
  if (!res.ok) return `Search failed: ${res.status}`;
  const data = await res.json();
  const items: any[] = data?.data ?? data?.results ?? data?.web ?? [];
  return items
    .slice(0, 5)
    .map((d: any, i: number) => `${i + 1}. ${d.title ?? ""}\n   ${d.url ?? ""}\n   ${d.description ?? d.snippet ?? ""}`)
    .join("\n\n") || "(no results)";
}

async function webCrawl(url: string, creds: Credentials): Promise<string> {
  if (!creds.firecrawl_key) {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const text = await res.text();
    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 6000);
  }
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.firecrawl_key}` },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });
  if (!res.ok) return `Crawl failed: ${res.status}`;
  const data = await res.json();
  return (data?.data?.markdown ?? data?.markdown ?? "").slice(0, 6000) || "(empty)";
}

async function getGmailToken(creds: Credentials): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.google_client_id,
      client_secret: creds.google_client_secret,
      refresh_token: creds.google_refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

function encodeEmail(to: string, subject: string, body: string): string {
  const raw = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join("\n");
  return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendEmail(to: string, subject: string, body: string, creds: Credentials): Promise<void> {
  const token = await getGmailToken(creds);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ raw: encodeEmail(to, subject, body) }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`);
}

async function executeStep(step: TaskStep, prevOutputs: string[], creds: Credentials): Promise<StepResult> {
  const ctx = prevOutputs.length > 0 ? `\n\nPrevious results:\n${prevOutputs.join("\n---\n")}` : "";
  try {
    if (step.type === "web_search") {
      const query = await llm(`Extract a concise search query (max 10 words) for: "${step.instruction}"${ctx}`, "You extract search queries.", creds);
      const raw = await webSearch(query.trim(), creds);
      const output = await llm(`Summarize these search results in 3-5 bullets for: "${step.instruction}"\n\n${raw}`, "You are a research assistant.", creds);
      return { order: step.order, instruction: step.instruction, output, success: true };
    }
    if (step.type === "web_crawl") {
      const urlMatch = step.instruction.match(/https?:\/\/[^\s]+/);
      let content: string;
      if (urlMatch) {
        content = await webCrawl(urlMatch[0], creds);
      } else {
        const url = await llm(`What URL should I crawl for: "${step.instruction}"? Respond with only the URL.`, "You extract URLs.", creds);
        content = await webCrawl(url.trim(), creds);
      }
      const output = await llm(`Extract key info from this page for: "${step.instruction}"\n\n${content.slice(0, 4000)}`, "You are a research assistant.", creds);
      return { order: step.order, instruction: step.instruction, output, success: true };
    }
    if (step.type === "custom") {
      const output = await llm(`${step.instruction}${ctx}`, "You are a helpful automation assistant.", creds);
      return { order: step.order, instruction: step.instruction, output, success: true };
    }
    if (step.type === "email_send") {
      // Use LLM to extract email params from the instruction + previous context
      const paramsJson = await llm(
        `Extract email parameters from this instruction and return ONLY valid JSON with these fields:
- "to": array of email addresses (extract ALL emails you find in the instruction)
- "subject": email subject line
- "body": email body using the previous step results as content

Instruction: ${step.instruction}${ctx}

Rules:
- "to" MUST be an array of strings, e.g. ["a@b.com", "c@d.com"]
- Extract every email address you see in the instruction
- If no email found, set "to" to []
- Make "body" a nicely formatted summary of the previous results`,
        "You extract email parameters as JSON. Always return valid JSON.",
        creds
      );

      const match = paramsJson.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Could not parse email params from LLM");
      const params = JSON.parse(match[0]);

      // Normalise: accept both string and array for "to"
      let recipients: string[] = [];
      if (Array.isArray(params.to)) {
        recipients = params.to.map((e: string) => e.trim()).filter((e: string) => e.includes("@"));
      } else if (typeof params.to === "string") {
        // Split on comma/semicolon/space
        recipients = params.to.split(/[,;\s]+/).map((e: string) => e.trim()).filter((e: string) => e.includes("@"));
      }

      // Filter out placeholders
      recipients = recipients.filter(
        (e) => !e.includes("example.com") && e !== "USER_EMAIL" && e.includes("@") && e.includes(".")
      );

      if (recipients.length === 0) {
        return { order: step.order, instruction: step.instruction, output: "Email step skipped: no valid recipient found in instruction", success: false };
      }

      // Send to all recipients
      const sent: string[] = [];
      for (const to of recipients) {
        await sendEmail(to, params.subject, params.body, creds);
        sent.push(to);
      }
      return { order: step.order, instruction: step.instruction, output: `Email sent to: ${sent.join(", ")}`, success: true };
    }
    throw new Error(`Unknown step type: ${(step as any).type}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { order: step.order, instruction: step.instruction, output: `ERROR: ${msg}`, success: false };
  }
}

async function runTask(task: SchedulerTask, creds: Credentials): Promise<{ stepResults: StepResult[]; summary: string; success: boolean }> {
  const outputs: string[] = [];
  const stepResults: StepResult[] = [];
  for (const step of task.steps.sort((a, b) => a.order - b.order)) {
    const result = await executeStep(step, outputs, creds);
    stepResults.push(result);
    outputs.push(`Step ${step.order} [${step.type}]: ${result.output}`);
  }
  const allSuccess = stepResults.every((s) => s.success);
  const summary = await llm(`Summarize results in 3-5 bullets.\n\nTask: ${task.description}\n\nResults:\n${outputs.join("\n")}`, "You are a concise summarizer.", creds);
  if (task.summary_email) {
    try {
      await sendEmail(
        task.summary_email,
        `[Jimmy Scheduler] ${task.name} - ${allSuccess ? "Done" : "Partial"}`,
        `Task: ${task.description}\nRan at: ${new Date().toISOString()}\n\n${summary}\n\n---\n${outputs.join("\n")}`,
        creds
      );
    } catch (e) {
      console.error(`[email error] ${e}`);
    }
  }
  return { stepResults, summary, success: allSuccess };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let creds: Credentials;
  try {
    creds = await loadCredentials();
  } catch (e) {
    return new Response(JSON.stringify({ error: `Creds load failed: ${e}` }), { status: 500 });
  }

  const now = new Date().toISOString();
  const { data: dueTasks, error } = await db.from("scheduler_tasks").select("*").eq("enabled", true).lte("next_run_at", now);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const tasks: SchedulerTask[] = dueTasks ?? [];
  if (tasks.length === 0) return new Response(JSON.stringify({ ran: 0 }), { status: 200 });

  const results: { taskId: string; status: string }[] = [];

  await Promise.allSettled(
    tasks.map(async (task) => {
      await db.from("scheduler_tasks").update({ next_run_at: computeNextRun(task.cron), updated_at: now }).eq("id", task.id);
      const { data: runRow } = await db.from("scheduler_runs").insert({ task_id: task.id, status: "running", step_results: [] }).select().single();
      const runId: string = (runRow as any)?.id;

      try {
        const { stepResults, summary, success } = await runTask(task, creds);
        await db.from("scheduler_runs").update({ status: success ? "success" : "failed", output: summary, step_results: stepResults, finished_at: now }).eq("id", runId);
        await db.from("scheduler_tasks").update({ last_run_at: now, run_count: task.run_count + 1, next_run_at: computeNextRun(task.cron), updated_at: now }).eq("id", task.id);
        results.push({ taskId: task.id, status: success ? "success" : "partial" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (runId) await db.from("scheduler_runs").update({ status: "failed", error: msg, output: "", step_results: [], finished_at: now }).eq("id", runId);
        await db.from("scheduler_tasks").update({ last_run_at: now, next_run_at: computeNextRun(task.cron), updated_at: now }).eq("id", task.id);
        results.push({ taskId: task.id, status: "failed" });
      }
    })
  );

  return new Response(JSON.stringify({ ran: results.length, results }), { status: 200, headers: { "Content-Type": "application/json" } });
});
