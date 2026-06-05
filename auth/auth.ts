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
  const apiKeyGemini=await text({
    message:"Google Gemini API key (from Google AI Studio)",
    placeholder:"xxxxx...",
    validate:(v)=>{
      if(!v?.trim()) return "API key is required"
    }
  })
  if (isCancel(apiKey) || isCancel(apiKeyGemini)) throw new Error("Setup cancelled");

  const passwordHash = hashPassword(pwd as string);
  const encryptedApiKey = encrypt(apiKey as string, pwd as string);
  const encryptgoogleKey=encrypt(apiKeyGemini as string,pwd as string);

  const config: StoredConfig = {
    username: username as string,
    passwordHash,
    apiKey: encryptedApiKey,
    apiKeyGemini:encryptgoogleKey,
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
 * Get decrypted API key from config
 */
export function getApiKey(config: StoredConfig, password: string):string[] {
  try {
    return [decrypt(config.apiKey, password),decrypt(config.apiKeyGemini,password)]
  } catch {
    throw new Error("Failed to decrypt API key");
  }
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
