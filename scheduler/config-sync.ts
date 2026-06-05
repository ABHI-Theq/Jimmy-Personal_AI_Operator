/**
 * Syncs local credentials to Supabase user_config table.
 * The Edge Function reads from here instead of static secrets,
 * so re-auth is fully automatic — no manual `supabase secrets set` needed.
 *
 * Required SQL (run once in Supabase SQL editor):
 *   create table user_config (
 *     key text primary key,
 *     value text not null,
 *     updated_at timestamptz default now()
 *   );
 */

import { createClient } from "@supabase/supabase-js";

function getDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Upsert a single key-value pair into user_config */
async function upsertConfig(key: string, value: string): Promise<void> {
  const db = getDb();
  if (!db) return; // Supabase not configured yet, skip silently
  const { error } = await db.from("user_config").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) {
    // Non-fatal — log but don't crash the auth flow
    console.warn(`[config-sync] Failed to sync "${key}": ${error.message}`);
  }
}

/** Read a value from user_config */
export async function readRemoteConfig(key: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db
    .from("user_config")
    .select("value")
    .eq("key", key)
    .single();
  if (error || !data) return null;
  return (data as any).value as string;
}

/**
 * Called after Gmail OAuth completes.
 * Pushes the new refresh token to Supabase so the Edge Function picks it up automatically.
 */
export async function syncGoogleRefreshToken(refreshToken: string): Promise<void> {
  await upsertConfig("google_refresh_token", refreshToken);
}

/**
 * Sync all relevant env vars to Supabase user_config.
 * Call this on first deploy or when API keys change.
 * Keys stored: openrouter_key, groq_api_key, firecrawl_key,
 *              google_client_id, google_client_secret, google_refresh_token
 */
export async function syncAllSecrets(): Promise<void> {
  const pairs: [string, string | undefined][] = [
    ["openrouter_key", process.env.OPENROUTER_KEY],
    ["openrouter_model", process.env.OPENROUTER_MODEL],
    ["groq_api_key", process.env.GROQ_API_KEY],
    ["firecrawl_key", process.env.FIRECRAWL_KEY],
    ["google_client_id", process.env.GOOGLE_CLIENT_ID],
    ["google_client_secret", process.env.GOOGLE_CLIENT_SECRET],
  ];

  // Also sync Google refresh token from local file if it exists
  try {
    const { loadConfig } = await import("../email_ops/email_pass_store");
    const googleConfig = loadConfig();
    if (googleConfig?.refresh_token) {
      pairs.push(["google_refresh_token", googleConfig.refresh_token]);
    }
  } catch (e) {
    console.warn("[config-sync] Could not load Google refresh token from local file");
  }

  await Promise.allSettled(
    pairs
      .filter(([, v]) => v)
      .map(([k, v]) => upsertConfig(k, v!))
  );
}
