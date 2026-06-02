import { createGroq } from "@ai-sdk/groq"
import {createOpenRouter} from "@openrouter/ai-sdk-provider"
export const getAgentModel=()=>{
    const provider=createOpenRouter({
    apiKey:process.env.OPENROUTER_KEY
})
const modelId=process.env.OPENROUTER_MODEL


    return provider(modelId!)
}
