#!/usr/bin/env bun
import chalk from "chalk";
import {program} from "commander";
import { startArena } from "./tui/spinup";
import { authenticate, getAllKeys, updateApiKey, resetAuth } from "./auth/auth";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

program.name("jimmy").description(" Your personal Assistant sits in your computer").version("0.1.0")

program.command("jet")
.description("agent spin up command")
.action(
    async()=>{
        try {
            const { config, password } = await authenticate();
            const keys = getAllKeys(config, password);
            // Apply all stored keys to process.env (skip empty values)
            for (const [k, v] of Object.entries(keys)) {
                if (v) process.env[k] = v;
            }
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

program.command("set-key")
.description("Change the stored OpenRouter API key")
.action(async () => {
    try {
        await updateApiKey();
    } catch (error) {
        if (error instanceof Error && error.message.includes("cancelled")) {
            console.log(chalk.yellow("\n✓ Update cancelled\n"));
        } else {
            console.log(chalk.red("Failed to update API key"));
            console.log(chalk.red(error instanceof Error ? error.message : String(error)));
        }
        process.exit(0);
    }
});

program.command("reset-auth")
.description("Remove stored auth config and API key")
.action(async () => {
    try {
        resetAuth();
        console.log(chalk.green("\n✓ Auth reset complete. Stored login and key removed.\n"));
    } catch (error) {
        console.log(chalk.red("Failed to reset auth"));
        console.log(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(0);
    }
});

program.command("sync-credentials")
.description("Sync API keys and credentials to Supabase user_config table")
.action(async () => {
    try {
        const { syncAllSecrets } = await import("./scheduler/config-sync");
        await syncAllSecrets();
        console.log(chalk.green("\n✓ Credentials synced to Supabase user_config table\n"));
    } catch (error) {
        console.log(chalk.red("Sync failed"));
        console.log(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
    }
});

program.command("scheduler-debug")
.description("Debug scheduler: check tasks, credentials, and test Edge Function")
.action(async () => {
    await import("./scheduler/debug");
});

await program.parseAsync(process.argv)
