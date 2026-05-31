#!/usr/bin/env bun
import chalk from "chalk";
import {program} from "commander";
import { startArena } from "./tui/spinup";
import { authenticate, getApiKey } from "./auth/auth";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

program.name("jimmy").description(" Your personal Assistant sits in your computer").version("0.1.0")

program.command("jet")
.description("agent spin up command")
.action(
    async()=>{
        try {
            const { config, password } = await authenticate();
            const apiKey = getApiKey(config, password);
            process.env.OPENROUTER_KEY = apiKey;
            process.env.OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
            await startArena()
        } catch (error) {
            if (error instanceof Error && error.message.includes("cancelled")) {
                console.log(chalk.yellow("\n✓ Exited cleanly\n"));
            } else {
                console.log(chalk.red("Authentication failed"));
                console.log(chalk.red(error instanceof Error ? error.message : String(error)));
            }
            process.exit(0);
        }
    }
)

await program.parseAsync(process.argv)
