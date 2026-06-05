import { homedir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const GOOGLE_CONFIG_DIR = path.join(homedir(), ".cccontrol","/googleAuth");
const GOOGLE_CONFIG_FILE = path.join(GOOGLE_CONFIG_DIR, "google_config.json");

const ALGORITHM = "aes-256-cbc";
const ITERATIONS = 100000;
const KEY_LENGTH = 32;

export type GoogleConfig={
    // access_token:string;
    refresh_token:string;
    scope:string;
    token_type:string;
    refresh_token_expires_in:number;
    createdAt:number
}

export function ensureConfigDir(): void {
  if (!fs.existsSync(GOOGLE_CONFIG_DIR)) {
    fs.mkdirSync(GOOGLE_CONFIG_DIR, { recursive: true });
  }
}




export function saveConfig(config: GoogleConfig): void {
  ensureConfigDir();
  fs.writeFileSync(GOOGLE_CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  fs.chmodSync(GOOGLE_CONFIG_FILE, 0o600);
}

export function loadConfig(): GoogleConfig | null {
  ensureConfigDir();
  if (!fs.existsSync(GOOGLE_CONFIG_FILE)) return null;
  try {
    const raw = fs.readFileSync(GOOGLE_CONFIG_FILE, "utf8");
    return JSON.parse(raw) as GoogleConfig;
  } catch {
    return null;
  }
}

export const isAuth = () => {
    const config = loadConfig();

    if (!config) {
        return null;
    }

    if (
        !config.refresh_token ||
        !config.refresh_token_expires_in
    ) {
        return null;
    }

    const expiry =
        config.createdAt +
        config.refresh_token_expires_in * 1000;

    return expiry > Date.now()?config.refresh_token:null;
};

export function removeConfig(): void {
  if (fs.existsSync(GOOGLE_CONFIG_FILE)) {
    fs.unlinkSync(GOOGLE_CONFIG_FILE);
  }
}
