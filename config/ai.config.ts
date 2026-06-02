import { createGroq } from "@ai-sdk/groq"
import {createOpenRouter} from "@openrouter/ai-sdk-provider"
export const getAgentModel=()=>{
    const provider=createOpenRouter({
    apiKey:process.env.OPENROUTER_KEY
})
const modelId=process.env.OPENROUTER_MODEL


    return provider(modelId!)
}
export const getAgentModel2=()=>{
    const provider=createGroq({
        apiKey:process.env.GROQ_API_KEY
    })
    return provider("openai/gpt-oss-120b")
}
