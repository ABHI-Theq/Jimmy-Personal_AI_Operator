import {select} from  "@clack/prompts"
import chalk from "chalk"
import { runAgentMode } from "../agent/orchestrator"
import { runAskMode } from "../ask/orchestrator"
import { runPlanMode } from "../plan"
import { runBrowserAgentMode } from "../plan/browser-agent"
import { runSchedulerMode } from "../scheduler/orchestrator"

export const runCLIMode=async()=>{

    while(true){
            const subMode=await select({
        message:"Choose CLI SubMode",
        options:[
            {value:"Agent",label:"Agent Mode"},
            {value:"Plan",label:"Plan Mode"},
            {value:"BrowserAgent",label:"Browser Agent Mode"},
            {value:"Ask",label:"Ask Mode" },
            {value:"Scheduler",label:"Scheduler Mode ⏰"},
            {value:"Back",label:"Back"}
        ]
    })

    if(subMode=='Agent'){
        await runAgentMode()
    }else if(subMode=='Plan'){
        await runPlanMode()
    }else if(subMode=='BrowserAgent'){
        await runBrowserAgentMode()
    }else if(subMode=='Ask'){
        await runAskMode()
    }else if(subMode=='Scheduler'){
        await runSchedulerMode()
    }else if(subMode=='Back'){ 

            return
    }else{
        console.log(chalk.green.bold("GoodBye!!!"))  
        return; 
    }
    }
}
