import { tool } from "ai";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl-js";
import type { ActionTracker } from "../agent/action-tracker.ts";

function getKey(): string | undefined {
  const v = process.env.FIRECRAWL_KEY;
  return v?.replace(/^['"]|['"]$/g, "").trim() || undefined;
}

let client: Firecrawl | null = null;
function getClient(): Firecrawl {
  if (client) return client;
  const apiKey = getKey();
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");
  client = new Firecrawl({ apiKey });
  return client;
}

function clip(s: string, n = 8000): string {
  return s.length > n ? s.slice(0, n) + "\n…[truncated]" : s;
}

export function createWebTools(tracker: ActionTracker) {
  return {
    web_search: tool({
      description: "Search the web. Returns title/url/snippet list.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, limit }) => {
        const res = await getClient().search(query, {
          limit,
          sources: ["web"],
        });
        const items = (res.web ?? []).slice(0, limit);
        const out =
          items
            .map((d, i) => {
              const title = ("title" in d && d.title) || "(untitled)";
              const url = ("url" in d && d.url) || "";
              const snip = ("snippet" in d && d.snippet) || "";
              return `${i + 1}. ${title}\n   ${url}\n   ${snip}`;
            })
            .join("\n\n") || "(no results)";
        tracker.log({
          type: "code_analysis",
          path: `web_search:${query}`,
          details: { after: out, toolName: "web_search" },
          status: "executed",
        });
        return clip(out);
      },
    }),

    web_crawl: tool({
      description: "Scrape a URL into markdown text.",
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url }) => {
        const doc = await getClient().scrape(url, { formats: ["markdown"] });
        const md = (doc as { markdown?: string }).markdown ?? "";
        tracker.log({
          type: "code_analysis",
          path: `web_crawl:${url}`,
          details: { after: clip(md), toolName: "web_crawl" },
          status: "executed",
        });
        return clip(md) || "(empty)";
      },
    }),

    fetch_url: tool({
      description: "HTTP GET for a URL. Returns response body.",
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url }) => {
        const r = await fetch(url, { redirect: "follow" });
        const body = await r.text();
        const out = clip(body, 16_000);
        tracker.log({
          type: "code_analysis",
          path: `fetch:${url}`,
          details: {
            after: `HTTP ${r.status}\n\n${out}`,
            toolName: "fetch_url",
          },
          status: "executed",
        });
        return `HTTP ${r.status}\n\n${out}`;
      },
    }),

    wikipedia_search: tool({
      description: "Search Wikipedia for detailed information",
      inputSchema: z.object({
        query: z.string().describe("The topic to search about"),
      }),
      execute: async ({ query }) => {
        const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json`;
        const response = await fetch(url);

        if (!response.ok) {
          return {
            success: false,
            message: "Article not found",
          };
        }

        const data = await response.json();

        return {
          title: data.title,
          summary: data.extract,
          url: data.content_urls?.desktop?.page,
        };
      },
    }),
  };
}
