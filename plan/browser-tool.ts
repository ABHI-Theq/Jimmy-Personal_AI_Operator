import { Stagehand } from "@browserbasehq/stagehand";
import { config } from "dotenv";
config({ path: "../.env" });

export const browserSearch = async (query: string) => {
  const stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      headless: false,
      devtools: false,
    },
    model: {
      modelName: "google/gemini-3.1-flash-lite-preview",
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    },
  });
  await stagehand.init();

  const agent = stagehand.agent({
    mode: "dom",
  });

  const res = await agent.execute("find top 5 AI jobs on wellfound and indeed");

  res.messages?.forEach((e)=>{
    console.log(e.role)
    console.log(JSON.stringify(e.content))
  })
  await stagehand.close();
};

browserSearch("dummy");
