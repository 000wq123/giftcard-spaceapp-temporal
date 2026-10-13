import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Activation signal for public installations (plan 1.4): one anonymous event the
 * first time an agent in the installation finishes an answer, sent only when the
 * owner answered Yes to telemetry. It carries the event name, the SpaceApp
 * version, the CPU architecture and the date; a fresh random id per event, so it
 * cannot be linked to the install ping or to anything in the installation. No
 * prompt, answer, model, account or path is ever included.
 */
export const FIRST_ANSWER_ENDPOINT = "https://spaceapp.dev/install-ping.php";
const TELEMETRY_ON = new Set(["1", "true", "yes", "on"]);
const RETRY_AFTER_MS = 10 * 60 * 1000;
const SEND_TIMEOUT_MS = 5_000;

export interface FirstAnswerPing {
  app: "spaceapp";
  event: "first_answer";
  uid: string;
  os: "unknown";
  arch: string;
  version: string;
  runtime: string;
  install_date: string;
}

/** On only in the public images, and only after the owner's telemetry Yes (SPACEAPP_TELEMETRY in compose). */
export function firstAnswerTelemetryEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.SPACE_PUBLIC_DISTRIBUTION === "true"
    && TELEMETRY_ON.has(String(env.SPACE_TELEMETRY_ENABLED ?? "").trim().toLowerCase());
}

export function buildFirstAnswerPing(version: string, arch: string, now = new Date()): FirstAnswerPing | null {
  const clean = version.trim().replace(/^v/, "");
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]{1,32})?$/.test(clean)) return null;
  return {
    app: "spaceapp",
    event: "first_answer",
    uid: randomUUID(),
    os: "unknown",
    arch: /^[a-z0-9_]{1,16}$/.test(arch) ? arch : "unknown",
    version: clean,
    runtime: clean,
    install_date: now.toISOString().slice(0, 10)
  };
}

async function postPing(payload: FirstAnswerPing): Promise<boolean> {
  const response = await fetch(FIRST_ANSWER_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": `spaceapp-core/${payload.version}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
  });
  return response.ok;
}

/**
 * Sends the event once per installation. A marker file in the data volume records
 * success; a failed send is retried at most every ten minutes. observe() never
 * throws and never waits.
 */
export function createFirstAnswerReporter(options: {
  enabled: boolean;
  markerFile: string;
  version: string;
  arch?: string;
  send?: (payload: FirstAnswerPing) => Promise<boolean>;
  now?: () => number;
}) {
  const send = options.send ?? postPing;
  const now = options.now ?? Date.now;
  let state: "unknown" | "pending" | "sending" | "done" = options.enabled ? "unknown" : "done";
  let lastAttemptAt = -Infinity;

  async function run() {
    if (state === "unknown") state = existsSync(options.markerFile) ? "done" : "pending";
    if (state !== "pending" || now() - lastAttemptAt < RETRY_AFTER_MS) return;
    const payload = buildFirstAnswerPing(options.version, options.arch ?? process.arch);
    if (!payload) {
      state = "done";
      return;
    }
    state = "sending";
    lastAttemptAt = now();
    try {
      if (await send(payload)) {
        await mkdir(dirname(options.markerFile), { recursive: true, mode: 0o700 });
        await writeFile(options.markerFile, `${JSON.stringify({ sentAt: new Date(now()).toISOString() })}\n`, { mode: 0o600 });
        state = "done";
        return;
      }
    } catch {
      // Offline or blocked: try again later.
    }
    state = "pending";
  }

  return {
    observe(): void {
      if (state === "done" || state === "sending") return;
      void run().catch(() => { state = "pending"; });
    },
    state: () => state
  };
}
