import { Stagehand } from "@browserbasehq/stagehand";
import { existsSync, mkdirSync } from "fs";
import path, { resolve } from "path";
import type { BrowserPlan, ExecutionResult } from "./types";

const DOWNLOADS_PATH = resolve("C:/Users/SWEETY/Downloads");

let globalStagehand: InstanceType<typeof Stagehand> | null = null;

function getStagehandClient(): InstanceType<typeof Stagehand> {
  if (!globalStagehand) {
    globalStagehand = new Stagehand({
      env: "LOCAL",
       localBrowserLaunchOptions: {
    headless: false, // Show browser window
    // devtools: true, // Open developer tools
    port: 9222, // Fixed CDP debugging port
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-running-insecure-content',
    ],
    chromiumSandbox: false, // Disable sandbox (adds --no-sandbox)
    ignoreHTTPSErrors: true, // Ignore certificate errors
    locale: 'en-US', // Set browser language
    deviceScaleFactor: 1.0, // Display scaling
    downloadsPath: './downloads', // Download directory
    acceptDownloads: true, // Allow downloads
    connectTimeoutMs: 30000, // Connection timeout
    executablePath:"C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
  },
      model: {
        modelName: "google/gemini-3.1-flash-lite-preview",
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      },
    });
  }
  return globalStagehand;
}

// Tools whose output is giant DOM/accessibility blobs — skip entirely
const SKIP_TOOL_OUTPUT = new Set(["ariaTree", "screenshot", "cdpSnapshot"]);

/**
 * Parses stagehand agent messages into a compact, evaluator-friendly transcript.
 *
 * Stagehand message shapes (confirmed from live logs):
 *
 * assistant: { role:"assistant", content: [
 *   { type:"tool-call", toolName, input, ... }   <- agent action intent
 *   { type:"text",      text: "..."           }   <- agent's SUMMARY / reasoning text
 * ]}
 *
 * tool: { role:"tool", content: [
 *   { type:"tool-result", toolName, output: { type:"json"|"content", value:... } }
 * ]}
 *
 * Strategy:
 *  - assistant[type=text]       → the agent's written summary/reasoning — MOST VALUABLE
 *  - done[input.reasoning]      → agent's stated reason for finishing
 *  - extract[output]            → structured data
 *  - navigate/act/wait/goto     → one-line confirmation (success + brief detail)
 *  - ariaTree/screenshot        → SKIPPED (too large, no signal for evaluator)
 */
function parseAgentMessages(messages: unknown[]): {
  transcript: string;
  extractedData: unknown;
} {
  if (!Array.isArray(messages)) return { transcript: "", extractedData: null };

  const summaryTexts: string[] = [];   // agent's written text — highest priority
  const actionLines: string[] = [];    // tool confirmations — supporting context
  const allExtracts: unknown[] = [];

  for (const msg of messages) {
    if (typeof msg !== "object" || msg === null) continue;
    const role: string = (msg as any).role ?? "";
    const content: unknown = (msg as any).content;
    const items: unknown[] = Array.isArray(content) ? content : [];

    // ── assistant messages ────────────────────────────────────────────
    if (role === "assistant") {
      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const type: string = (item as any).type ?? "";

        // {type:"text"} — this is the agent's written summary/answer
        if (type === "text") {
          const text = String((item as any).text ?? "").trim();
          if (text) summaryTexts.push(text);
        }

        // {type:"tool-call", toolName:"done"} — capture reasoning from input
        if (type === "tool-call" && (item as any).toolName === "done") {
          const reasoning = (item as any).input?.reasoning;
          if (typeof reasoning === "string" && reasoning.trim()) {
            summaryTexts.push(`[DONE REASON] ${reasoning.trim()}`);
          }
        }
      }
      continue;
    }

    // ── tool result messages ──────────────────────────────────────────
    if (role === "tool") {
      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const toolName: string = (item as any).toolName ?? (item as any).name ?? "tool";
        const output: unknown = (item as any).output;

        // Skip large DOM blobs — useless to evaluator
        if (SKIP_TOOL_OUTPUT.has(toolName)) continue;

        // extract — capture structured data
        if (toolName === "extract") {
          const structured = extractStructured(output);
          if (structured != null) allExtracts.push(structured);
          actionLines.push(`[EXTRACT] ${JSON.stringify(structured ?? output)}`);
          continue;
        }

        // done tool result — just note success
        if (toolName === "done") {
          const val = getOutputValue(output);
          const ok = (val as any)?.success ?? (val as any)?.taskComplete ?? true;
          actionLines.push(`[DONE] taskComplete=${ok}`);
          continue;
        }

        // navigate / goto / act / wait / scroll / click / type
        // Pull only the minimal success+detail line — not the whole DOM
        const val = getOutputValue(output);
        if (val != null) {
          const success = (val as any)?.success;
          const url = (val as any)?.url;
          const action = (val as any)?.action;
          const waited = (val as any)?.waited;
          const detail = url ?? action ?? waited ?? "";
          const line = [
            `success=${success ?? "?"}`,
            detail ? String(detail) : "",
          ]
            .filter(Boolean)
            .join(" ");
          actionLines.push(`[${toolName.toUpperCase()}] ${line}`);
        }
      }
    }
  }

  const extractedData =
    allExtracts.length === 1
      ? allExtracts[0]
      : allExtracts.length > 1
        ? allExtracts
        : null;

  // Build compact transcript: summaries first (most signal), then action log
  const parts: string[] = [];
  if (summaryTexts.length > 0) {
    parts.push("=== AGENT OUTPUT ===");
    parts.push(summaryTexts.join("\n\n"));
  }
  if (actionLines.length > 0) {
    parts.push("=== ACTION LOG ===");
    parts.push(actionLines.join("\n"));
  }

  return { transcript: parts.join("\n"), extractedData };
}

function getOutputValue(output: unknown): unknown {
  if (typeof output !== "object" || output === null) return output;
  const o = output as Record<string, unknown>;
  // { type: "json", value: {...} } or { type: "content", value: [...] }
  if ("value" in o) {
    const v = o.value;
    // content arrays: [{type:"text", text:"..."}]
    if (Array.isArray(v)) {
      const texts = v
        .filter((c: any) => c?.type === "text" && typeof c?.text === "string")
        .map((c: any) => c.text)
        .join(" ");
      return texts || v;
    }
    return v;
  }
  return o;
}

/** Pull structured data out of an extract tool output */
function extractStructured(output: unknown): unknown {
  if (output == null) return null;
  const val = getOutputValue(output);
  if (typeof val !== "object" || val === null) return val;
  const v = val as Record<string, unknown>;
  if (v.success && v.result != null) {
    const r = v.result as Record<string, unknown>;
    return r.extraction ?? r;
  }
  if (v.extraction != null) return v.extraction;
  if (v.result != null) return v.result;
  return val;
}

/**
 * Executes a browser task using Stagehand's agent() function.
 * The agent autonomously navigates, clicks, types, and extracts data
 * based on the plan's goal — no manual step-by-step execution.
 */
export async function executeBrowserPlan(
  plan: BrowserPlan,
  previousFeedback?: string
): Promise<ExecutionResult[]> {
  const stagehand = getStagehandClient();
  await stagehand.init();

  // Build the instruction from the plan goal + feedback context
  const instruction = previousFeedback
    ? `${plan.goal}\n\nPrevious attempt feedback to address: ${previousFeedback}`
    : plan.goal;

  const systemPrompt = `You are a browser automation agent.

Rules:
- Execute the task efficiently and completely.
- Avoid unnecessary navigation.
- Extract all requested structured data.
- Stop only when the task is fully complete.
- Extract details in deep provide complete comprehensive details about the topic then call it done

Before calling done:
1. Re-read the original user request.
2. Verify every requested piece of information is collected.
3. If anything is missing, continue browsing.
4. Only call done when all requirements are satisfied.

User asks:
"Get top 5 jobs and detailed descriptions."

Required:
✓ 5 jobs found
✓ description for job 1
✓ description for job 2
✓ description for job 3
✓ description for job 4
✓ description for job 5

Only call done when all 6 checks pass.
`;

  // Ensure downloads folder exists
 if(!existsSync(DOWNLOADS_PATH)) mkdirSync(DOWNLOADS_PATH, { recursive: true });

  // Use CDP directly to intercept downloads — stagehand.context.conn is a CdpConnection.
  const conn = (stagehand.context as any).conn;
  const downloadedFiles: string[] = [];

  // Tell the browser to save all downloads to our path automatically
  await conn.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOADS_PATH,
    eventsEnabled: true,
  });

  // Track filenames as downloads begin
  const pendingDownloads = new Map<string, string>(); // guid → filename
  conn.on("Browser.downloadWillBegin", (params: any) => {
    const filename = params.suggestedFilename || `download-${params.guid}`;
    const savePath = resolve(DOWNLOADS_PATH, filename);
    pendingDownloads.set(params.guid, savePath);
    console.log(`[download] starting → ${savePath}`);
  });

  conn.on("Browser.downloadProgress", (params: any) => {
    if (params.state === "completed") {
      const savePath = pendingDownloads.get(params.guid);
      if (savePath) {
        downloadedFiles.push(savePath);
        pendingDownloads.delete(params.guid);
        console.log(`[download] saved → ${savePath}`);
      }
    } else if (params.state === "canceled") {
      pendingDownloads.delete(params.guid);
      console.warn(`[download] canceled guid=${params.guid}`);
    }
  });

  try {
    const agent = stagehand.agent({
      mode: "dom",
      systemPrompt,
    });

    const res = await agent.execute({
      instruction,
      maxSteps: 10,
      highlightCursor: true,
    });

    const messages = res.messages ?? [];
    const { transcript, extractedData } = parseAgentMessages(messages);
    const completed = res.completed ?? false;

    // Capture any top-level text stagehand puts on the response object
    const topLevelText = [
      (res as any).output,
      (res as any).result,
      (res as any).message,
      (res as any).text,
    ]
      .filter((v) => typeof v === "string" && v.trim().length > 0)
      .join("\n");

    const agentOutput = transcript || topLevelText;

    return [
      {
        success: completed,
        message: completed
          ? "Agent completed the task successfully"
          : "Agent did not complete the task",
        stepNumber: 1,
        action: "agent",
        agentOutput,
        agentMessages: messages,
        data:
          extractedData ??
          (topLevelText ? { output: topLevelText } : undefined),
        ...(downloadedFiles.length > 0 && { downloadedFiles }),
      },
    ];
  } catch (error) {
    return [
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: "Agent execution failed",
        stepNumber: 1,
        action: "agent",
      },
    ];
  }
}

export async function closeStagehand(): Promise<void> {
  if (globalStagehand) {
    await globalStagehand.close();
    globalStagehand = null;
  }
}
