import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = path.join(homedir(), ".cccontrol");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface StoredConfig {
  username: string;
  passwordHash: string;
  apiKey: string;
  apiKeyGemini:string;
  lastLogin: number;
}

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): StoredConfig | null {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as StoredConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: StoredConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  fs.chmodSync(CONFIG_FILE, 0o600);
}

export function isConfigured(): boolean {
  return loadConfig() !== null;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function removeConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}
