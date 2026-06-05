import chalk from "chalk";
import { password, text, isCancel } from "@clack/prompts";
import { hashPassword, verifyPassword, encrypt, decrypt } from "./crypto";
import { loadConfig, saveConfig, isConfigured, removeConfig } from "./config-store";
import type { StoredConfig } from "./config-store";

export interface AuthResult {
  config: StoredConfig;
  password: string;
}

/**
 * First-time setup: create account and set API key
 */
export async function setupAuth(): Promise<AuthResult> {
  console.log(chalk.bold("\n🔐 Initial Setup\n"));

  const username = await text({
    message: "Create username",
    placeholder: "your-username",
    validate: (v) => {
      if (!v?.trim()) return "Username required";
      if (v.length < 3) return "Min 3 characters";
      if (!/^[a-zA-Z0-9_-]+$/.test(v)) return "Alphanumeric + - _ only";
    },
  });
  if (isCancel(username)) throw new Error("Setup cancelled");

  const pwd = await password({
    message: "Create password",
    validate: (v) => {
      if (!v || v.length < 6) return "Min 6 characters";
    },
  });
  if (isCancel(pwd)) throw new Error("Setup cancelled");

  const pwdConfirm = await password({
    message: "Confirm password",
  });
  if (isCancel(pwdConfirm)) throw new Error("Setup cancelled");

  if (pwd !== pwdConfirm) {
    console.log(chalk.red("❌ Passwords don't match\n"));
    return setupAuth();
  }

  const apiKey = await text({
    message: "OpenRouter API Key (from openrouter.ai)",
    placeholder: "sk-or-v1-...",
    validate: (v) => {
      if (!v?.trim()) return "API key is required";
      if (!v.includes("sk-")) return "Invalid OpenRouter key format";
    },
  });
  if (isCancel(apiKey)) throw new Error("Setup cancelled");

  const apiKeyGemini = await text({
    message: "Google Gemini API key (from Google AI Studio)",
    placeholder: "AIza...",
    validate: (v) => { if (!v?.trim()) return "API key is required"; },
  });
  if (isCancel(apiKeyGemini)) throw new Error("Setup cancelled");

  const groqKey = await text({
    message: "Groq API key (groq.com) — press Enter to skip",
    placeholder: "gsk_...",
  });
  if (isCancel(groqKey)) throw new Error("Setup cancelled");

  const telegramBotToken = await text({
    message: "Telegram Bot Token — press Enter to skip",
    placeholder: "123456:ABC-...",
  });
  if (isCancel(telegramBotToken)) throw new Error("Setup cancelled");

  const telegramOwnerId = await text({
    message: "Telegram Owner Chat ID — press Enter to skip",
    placeholder: "123456789",
  });
  if (isCancel(telegramOwnerId)) throw new Error("Setup cancelled");

  const supabaseUrl = await text({
    message: "Supabase project URL — press Enter to skip",
    placeholder: "https://xxxx.supabase.co",
  });
  if (isCancel(supabaseUrl)) throw new Error("Setup cancelled");

  const supabaseServiceRoleKey = await text({
    message: "Supabase service role key — press Enter to skip",
    placeholder: "eyJ...",
  });
  if (isCancel(supabaseServiceRoleKey)) throw new Error("Setup cancelled");

  const googleClientId = await text({
    message: "Google OAuth Client ID — press Enter to skip",
    placeholder: "xxxx.apps.googleusercontent.com",
  });
  if (isCancel(googleClientId)) throw new Error("Setup cancelled");

  const googleClientSecret = await text({
    message: "Google OAuth Client Secret — press Enter to skip",
    placeholder: "GOCSPX-...",
  });
  if (isCancel(googleClientSecret)) throw new Error("Setup cancelled");

  const firecrawlKey = await text({
    message: "Firecrawl API key — press Enter to skip",
    placeholder: "fc-...",
  });
  if (isCancel(firecrawlKey)) throw new Error("Setup cancelled");

  const apifyKey = await text({
    message: "Apify API key — press Enter to skip",
    placeholder: "apify_api_...",
  });
  if (isCancel(apifyKey)) throw new Error("Setup cancelled");

  const browserbaseApiKey = await text({
    message: "Browserbase API key — press Enter to skip",
    placeholder: "bb_live_...",
  });
  if (isCancel(browserbaseApiKey)) throw new Error("Setup cancelled");

  const browserbaseProjectId = await text({
    message: "Browserbase Project ID — press Enter to skip",
    placeholder: "xxxxxxxx-...",
  });
  if (isCancel(browserbaseProjectId)) throw new Error("Setup cancelled");

  const passwordHash = hashPassword(pwd as string);
  const enc = (v: unknown) => (v && String(v).trim()) ? encrypt(String(v), pwd as string) : undefined;

  const config: StoredConfig = {
    username: username as string,
    passwordHash,
    apiKey: encrypt(apiKey as string, pwd as string),
    apiKeyGemini: encrypt(apiKeyGemini as string, pwd as string),
    groqKey: enc(groqKey),
    telegramBotToken: enc(telegramBotToken),
    telegramOwnerId: enc(telegramOwnerId),
    supabaseUrl: enc(supabaseUrl),
    supabaseServiceRoleKey: enc(supabaseServiceRoleKey),
    googleClientId: enc(googleClientId),
    googleClientSecret: enc(googleClientSecret),
    firecrawlKey: enc(firecrawlKey),
    apifyKey: enc(apifyKey),
    browserbaseApiKey: enc(browserbaseApiKey),
    browserbaseProjectId: enc(browserbaseProjectId),
    lastLogin: Date.now(),
  };

  saveConfig(config);
  console.log(chalk.green("\n✓ Setup complete!\n"));
  return { config, password: pwd as string };
}

/**
 * Login with username and password
 */
export async function loginAuth(): Promise<AuthResult> {
  const config = loadConfig();
  if (!config) return setupAuth();

  console.log(chalk.bold(`\n🔑 Login\n`));

  const enteredUsername = await text({
    message: "Username",
    placeholder: config.username,
  });
  if (isCancel(enteredUsername)) throw new Error("Login cancelled");

  if (enteredUsername !== config.username) {
    console.log(chalk.red("❌ Username mismatch\n"));
    return loginAuth();
  }

  const enteredPassword = await password({
    message: "Password",
  });
  if (isCancel(enteredPassword)) throw new Error("Login cancelled");

  if (!verifyPassword(enteredPassword as string, config.passwordHash)) {
    console.log(chalk.red("❌ Wrong password\n"));
    return loginAuth();
  }

  config.lastLogin = Date.now();
  saveConfig(config);
  console.log(chalk.green(`\n✓ Welcome back, ${config.username}!\n`));
  return { config, password: enteredPassword as string };
}

/**
 * Get all decrypted keys from config
 */
export function getAllKeys(config: StoredConfig, password: string): Record<string, string> {
  const dec = (v: string | undefined) => (v ? decrypt(v, password) : "");
  try {
    return {
      OPENROUTER_KEY: dec(config.apiKey),
      GOOGLE_GENERATIVE_AI_API_KEY: dec(config.apiKeyGemini),
      GROQ_API_KEY: dec(config.groqKey),
      TELEGRAM_BOT_TOKEN: dec(config.telegramBotToken),
      TELEGRAM_OWNER_ID: dec(config.telegramOwnerId),
      SUPABASE_URL: dec(config.supabaseUrl),
      SUPABASE_SERVICE_ROLE_KEY: dec(config.supabaseServiceRoleKey),
      GOOGLE_CLIENT_ID: dec(config.googleClientId),
      GOOGLE_CLIENT_SECRET: dec(config.googleClientSecret),
      FIRECRAWL_KEY: dec(config.firecrawlKey),
      APIFY_API_KEY: dec(config.apifyKey),
      BROWSERBASE_API_KEY: dec(config.browserbaseApiKey),
      BROWSERBASE_PRODUCT_ID: dec(config.browserbaseProjectId),
    };
  } catch {
    throw new Error("Failed to decrypt keys — wrong password?");
  }
}

/**
 * @deprecated use getAllKeys instead
 */
export function getApiKey(config: StoredConfig, password: string): string[] {
  const keys = getAllKeys(config, password);
  return [keys.OPENROUTER_KEY as string, keys.GOOGLE_GENERATIVE_AI_API_KEY as string];
}

export async function updateApiKey(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log(chalk.yellow("No existing auth config found. Starting initial setup."));
    await setupAuth();
    return;
  }

  console.log(chalk.bold("\n🔄 Update OpenRouter API Key\n"));

  const enteredUsername = await text({
    message: "Username",
    placeholder: config.username,
  });
  if (isCancel(enteredUsername)) throw new Error("Update cancelled");

  if (enteredUsername !== config.username) {
    console.log(chalk.red("❌ Username mismatch\n"));
    return updateApiKey();
  }

  const enteredPassword = await password({ message: "Password" });
  if (isCancel(enteredPassword)) throw new Error("Update cancelled");

  if (!verifyPassword(enteredPassword as string, config.passwordHash)) {
    console.log(chalk.red("❌ Wrong password\n"));
    return updateApiKey();
  }

  const newApiKey = await text({
    message: "New OpenRouter API Key",
    placeholder: "sk-or-v1-...",
    validate: (v) => {
      if (!v?.trim()) return "API key required";
      if (!v.includes("sk-")) return "Invalid OpenRouter key format";
    },
  });
  if (isCancel(newApiKey)) throw new Error("Update cancelled");

  config.apiKey = encrypt(newApiKey as string, enteredPassword as string);
  config.lastLogin = Date.now();
  saveConfig(config);
  console.log(chalk.green("\n✓ OpenRouter API key updated successfully!\n"));
}

export function resetAuth(): void {
  removeConfig();
}

/**
 * Run auth flow: login or setup
 */
export async function authenticate(): Promise<AuthResult> {
  return isConfigured() ? await loginAuth() : await setupAuth();
}
