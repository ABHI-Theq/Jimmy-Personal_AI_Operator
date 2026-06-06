#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Check Bun is available
try {
  const check = spawnSync("bun", ["--version"], { stdio: "ignore" });
  if (check.error) throw check.error;
} catch {
  console.error(
    "\n[jerob] Bun is required but not installed.\n" +
    "Install it from https://bun.sh and try again.\n" +
    "  Windows: powershell -c \"irm bun.sh/install.ps1 | iex\"\n" +
    "  macOS/Linux: curl -fsSL https://bun.sh/install | bash\n"
  );
  process.exit(1);
}

const entry = join(__dirname, "..", "index.ts");

// Use spawnSync instead of execFileSync so non-zero exit codes
// (e.g. Commander printing help) don't throw an exception
const result = spawnSync("bun", [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd(),
});

if (result.error) {
  console.error("[jerob] Failed to start:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
