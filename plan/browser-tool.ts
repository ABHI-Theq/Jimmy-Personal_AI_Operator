import { Stagehand } from "@browserbasehq/stagehand";
import { config } from "dotenv";
config({ path: "../.env" });

let globalstageHand: InstanceType<typeof Stagehand> | null = null;

function getExtractResults(messages: any[]) {
  const extracts = [];

  for (const msg of messages) {
    if (msg.role !== "tool") continue;

    for (const item of msg.content ?? []) {
      if (item.toolName === "extract" && item.output?.value?.success) {
        extracts.push(item.output.value.result.extraction);
      }
    }
  }

  return extracts;
}

const getStagehandClient = () => {
  if (!globalstageHand) {
    globalstageHand = new Stagehand({
      env: "LOCAL",
          localBrowserLaunchOptions: {
    headless: false, // Show browser window
    devtools: false, // Open developer tools
    port: 9222, // Fixed CDP debugging port
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-running-insecure-content',
    ],
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
  return globalstageHand;
};
export const browserSearch = async (query: string) => {
  //   const stagehand = new Stagehand({
  //     env: "LOCAL",
  //     localBrowserLaunchOptions: {
  //       headless: false,
  //       devtools: false,
  //     },
  //     model: {
  //       modelName: "google/gemini-3.1-flash-lite-preview",
  //       apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  //     },
  //   });
  const stagehand = getStagehandClient();
  await stagehand.init();

  const agent = stagehand.agent({
    mode: "dom",

    systemPrompt: `
You are a browser automation agent.

Rules:
- Search efficiently.
- Avoid unnecessary navigation.
- Extract structured data.
- Stop when task is complete.


Before calling done:

1. Re-read the original user request.

2. Create a checklist.

3. Verify every item is satisfied.

4. If any requested information is missing,
   DO NOT call done.

5. Explicitly count collected results.

Example:

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
`,
  });

  const res = await agent.execute({
    instruction: query,
    maxSteps: 10,
    highlightCursor: true,
  });

  res.messages?.forEach((e) => {
    console.log(e.role);
    console.log(JSON.stringify(e.content));
  });
  const output = getExtractResults(res.messages ?? []);
  console.log("\n\n\n\n output " + output);
  await stagehand.close();
};

browserSearch(
  `go and find rag youtube video fo piyush garg get its link then go to youtube transcript site and get me its complete transcript`,
);
