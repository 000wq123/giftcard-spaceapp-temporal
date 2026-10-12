import { promises as fs } from "node:fs";
import path from "node:path";
import { readActiveFreeOpenCodeModel } from "./room-mini-router.js";

export interface AdvancedMissionModelSelection {
  providerId: string | null;
  modelId: string;
  reasoningEffort: string | null;
  providerName: string | null;
  modelName: string;
  tier: "CODEX" | "GEMINI" | "OPENCODE";
}

export interface ResolveAdvancedMissionModelOptions {
  codexLbBaseUrl?: string | null;
  codexLbKeyFile?: string | null;
  fetchImpl?: typeof fetch;
  geminiTokenRoot?: string;
  openCodeStateFile?: string;
}

/** The service root of a Codex-compatible base URL, which is usually configured with its `/v1` suffix. */
export function codexServiceRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}

export async function checkCodexSolAvailability(
  baseUrl?: string | null,
  fetchImpl: typeof fetch = fetch,
  apiKey?: string | null
): Promise<boolean> {
  if (!baseUrl) return false;
  try {
    // The pooled weekly quota needs the service's API key (codex-lb and Space Gateway alike).
    const url = `${codexServiceRoot(baseUrl)}/api/codex/weekly-remaining`;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(2000), ...(apiKey ? { headers: { authorization: `Bearer ${apiKey}` } } : {}) });
    if (!response.ok) return false;
    const data = (await response.json()) as Record<string, unknown>;
    const remaining = typeof data.remaining_percent === "number" ? data.remaining_percent : 0;
    const activeAccounts = typeof data.active_accounts_count === "number" ? data.active_accounts_count : 0;
    return activeAccounts > 0 && remaining > 0;
  } catch {
    return false;
  }
}

export async function checkGeminiAvailability(
  geminiRoot = "/var/lib/spaceapp-user/.codex/space-gemini"
): Promise<boolean> {
  const mainToken = path.join(geminiRoot, "home/.gemini/antigravity-cli/antigravity-oauth-token");
  try {
    const stats = await fs.stat(mainToken);
    if (stats.size > 0) return true;
  } catch {}
  try {
    const profilesDir = path.join(geminiRoot, "profiles");
    const entries = await fs.readdir(profilesDir);
    for (const entry of entries) {
      const pToken = path.join(profilesDir, entry, "home/.gemini/antigravity-cli/antigravity-oauth-token");
      try {
        const stats = await fs.stat(pToken);
        if (stats.size > 0) return true;
      } catch {}
    }
  } catch {}
  return false;
}

export async function resolveAdvancedMissionModel(
  options: ResolveAdvancedMissionModelOptions = {}
): Promise<AdvancedMissionModelSelection> {
  // Tier 1: Check Codex OpenAI Sol access & remaining quota
  const apiKey = options.codexLbKeyFile ? await fs.readFile(options.codexLbKeyFile, "utf8").then((text) => text.trim() || null, () => null) : null;
  const hasCodex = await checkCodexSolAvailability(options.codexLbBaseUrl, options.fetchImpl, apiKey);
  if (hasCodex) {
    return {
      providerId: null,
      modelId: "gpt-5.6-sol",
      reasoningEffort: "high",
      providerName: null,
      modelName: "GPT-5.6 Sol",
      tier: "CODEX"
    };
  }

  // Tier 2: Check Gemini Flash access & credentials
  const hasGemini = await checkGeminiAvailability(options.geminiTokenRoot);
  if (hasGemini) {
    return {
      providerId: "cli:gemini",
      modelId: "gemini-3.8-flash",
      reasoningEffort: "high",
      providerName: "Gemini",
      modelName: "Gemini 3.8 Flash",
      tier: "GEMINI"
    };
  }

  // Tier 3: Fall back to daily selected free OpenCode model
  const freeModel = readActiveFreeOpenCodeModel(options.openCodeStateFile);
  return {
    providerId: "cli:opencode",
    modelId: freeModel,
    reasoningEffort: null,
    providerName: "OpenCode",
    modelName: freeModel,
    tier: "OPENCODE"
  };
}
