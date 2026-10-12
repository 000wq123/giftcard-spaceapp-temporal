import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type {
  GatewayAccount, GatewayApiKey, GatewayApiKeyCreateRequest, GatewayApiKeyCreatedResponse, GatewayApiKeyUpdateRequest,
  GatewayCompressionMode, GatewayCompressionProfile, GatewayCompressionStats, GatewayReport, GatewayReportRow, GatewayRequestLog, GatewayRequestLogList, GatewayRoutingStrategy,
  GatewaySettings, GatewaySettingsUpdateRequest, GatewayStatus, GatewayTrafficClass
} from "@space/contracts";
import { api } from "../../api.js";
import { writeClipboardText } from "../clipboard-dock/clipboard-events.js";
import { Check, Copy, Network, X } from "../ui-theme/app-icons.js";
import { SpaceToggle } from "../ui-controls/SpaceToggle.js";
import {
  compressionModeOptions, formatCost, formatPercent, formatTokens, providerLabel, routingStrategyOptions, serviceStateLabel,
  statusTone, trafficClassOptions
} from "./space-gateway-model.js";
import "./space-gateway.css";

export type SpaceGatewayTab = "overview" | "accounts" | "keys" | "logs" | "reports" | "routing" | "compression" | "settings";

export interface SpaceGatewayClient {
  status(): Promise<GatewayStatus>;
  accounts(): Promise<{ data: GatewayAccount[] }>;
  setAccountPaused(accountId: string, paused: boolean): Promise<GatewayAccount>;
  keys(): Promise<{ data: GatewayApiKey[] }>;
  createKey(input: Partial<GatewayApiKeyCreateRequest> & { name: string }): Promise<GatewayApiKeyCreatedResponse>;
  updateKey(keyId: string, patch: GatewayApiKeyUpdateRequest): Promise<GatewayApiKey>;
  deleteKey(keyId: string): Promise<{ id: string; deleted: true }>;
  logs(query: { limit?: number; cursor?: string | null }): Promise<GatewayRequestLogList>;
  updateSettings(patch: GatewaySettingsUpdateRequest): Promise<GatewaySettings>;
  startDeviceSignIn(): Promise<{ flowId: string; verificationUrl: string; userCode: string; intervalSeconds: number; expiresInSeconds: number }>;
  pollDeviceSignIn(flowId: string): Promise<{ status: "PENDING" | "EXPIRED" | "CONNECTED"; account?: { id: string; label: string } }>;
  startBrowserSignIn(): Promise<{ flowId: string; authorizationUrl: string }>;
  completeBrowserSignIn(flowId: string, callbackUrl: string): Promise<{ status: "CONNECTED"; account: { id: string; label: string } }>;
  importAuthJson(authJson: string): Promise<{ status: "CONNECTED"; account: { id: string; label: string } }>;
  startClaudeSignIn(): Promise<{ flowId: string; authorizationUrl: string }>;
  antigravityProfiles(): Promise<{ data: Array<{ profileId: string; email: string | null; inGateway: boolean }> }>;
  addOpenAiApiKey(input: { apiKey?: string; useSpaceKey?: boolean; label?: string }): Promise<{ status: "CONNECTED"; account: { id: string; label: string } }>;
  importAntigravityProfile(profileId: string): Promise<{ status: "CONNECTED"; account: { id: string; label: string } }>;
  completeClaudeSignIn(flowId: string, code: string): Promise<{ status: "CONNECTED"; account: { id: string; label: string } }>;
  refreshUsage(accountId: string): Promise<{ status: string }>;
  testAccount(accountId: string): Promise<{ ok: boolean; model: string | null; status: number; latencyMs: number; error: string | null }>;
  deleteAccount(accountId: string): Promise<{ id: string; deleted: true }>;
  useResetCredit(accountId: string, idempotencyKey: string): Promise<{ outcome: string; windowsReset: number }>;
  report(from: string, to: string): Promise<GatewayReport>;
  compressionStats(hours: number): Promise<GatewayCompressionStats>;
}

const defaultClient: SpaceGatewayClient = {
  status: () => api.gatewayStatus(),
  accounts: () => api.gatewayAccounts(),
  setAccountPaused: (accountId, paused) => api.setGatewayAccountPaused(accountId, paused),
  keys: () => api.gatewayApiKeys(),
  createKey: (input) => api.createGatewayApiKey(input),
  updateKey: (keyId, patch) => api.updateGatewayApiKey(keyId, patch),
  deleteKey: (keyId) => api.deleteGatewayApiKey(keyId),
  logs: (query) => api.gatewayRequestLogs(query),
  updateSettings: (patch) => api.updateGatewaySettings(patch),
  startDeviceSignIn: () => api.startGatewayCodexDeviceSignIn(),
  pollDeviceSignIn: (flowId) => api.pollGatewayCodexDeviceSignIn(flowId),
  startBrowserSignIn: () => api.startGatewayCodexBrowserSignIn(),
  completeBrowserSignIn: (flowId, callbackUrl) => api.completeGatewayCodexBrowserSignIn(flowId, callbackUrl),
  importAuthJson: (authJson) => api.importGatewayCodexAuthJson(authJson),
  startClaudeSignIn: () => api.startGatewayClaudeSignIn(),
  antigravityProfiles: () => api.gatewayAntigravityProfiles(),
  addOpenAiApiKey: (input) => api.addGatewayOpenAiApiKey(input),
  importAntigravityProfile: (profileId) => api.importGatewayAntigravityProfile(profileId),
  completeClaudeSignIn: (flowId, code) => api.completeGatewayClaudeSignIn(flowId, code),
  refreshUsage: (accountId) => api.refreshGatewayAccountUsage(accountId),
  testAccount: (accountId) => api.testGatewayAccount(accountId),
  deleteAccount: (accountId) => api.deleteGatewayAccount(accountId),
  useResetCredit: (accountId, idempotencyKey) => api.useGatewayResetCredit(accountId, idempotencyKey),
  report: (from, to) => api.gatewayReport(from, to),
  compressionStats: (hours) => api.gatewayCompressionStats(hours)
};

const tabs: { id: SpaceGatewayTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "keys", label: "API keys" },
  { id: "logs", label: "Request logs" },
  { id: "reports", label: "Reports" },
  { id: "routing", label: "Routing" },
  { id: "compression", label: "Compression" },
  { id: "settings", label: "Settings" }
];

function errorText(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function formatTime(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="space-gateway-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

function OverviewTab({ status }: { status: GatewayStatus }) {
  const { service } = status;
  return (
    <div className="space-gateway-panel">
      <div className={`space-gateway-service tone-${statusTone(service.state)}`} role="status">
        <strong>{serviceStateLabel(service.state)}</strong>
        <span>
          {service.state === "RUNNING" || service.state === "DRAINING"
            ? `Version ${service.version ?? "unknown"} · ${service.listen ?? "unknown address"} · ${service.inFlightRequests ?? 0} in flight`
            : service.error ?? "The gateway service did not report its state."}
        </span>
      </div>
      <dl className="space-gateway-stats" aria-label="Space Gateway totals">
        <Stat label="Active accounts" value={`${status.accounts.active} / ${status.accounts.total}`} />
        <Stat label="Active API keys" value={`${status.apiKeys.active} / ${status.apiKeys.total}`} />
        <Stat label="Requests (24h)" value={formatTokens(status.last24h.requests)} detail={`${status.last24h.errors} errors`} />
        <Stat label="Tokens (24h)" value={formatTokens(status.last24h.inputTokens + status.last24h.outputTokens)}
          detail={`${formatTokens(status.last24h.inputTokens)} in · ${formatTokens(status.last24h.outputTokens)} out`} />
        <Stat label="Cost (24h)" value={formatCost(status.last24h.costUsd)} />
        <Stat label="Saved by compression (24h)" value={`${formatTokens(status.last24h.compressionTokensSaved)} tokens`} />
      </dl>
      <section aria-label="Accounts by provider">
        <h3>Accounts by provider</h3>
        {status.accounts.byProvider.length === 0
          ? <p className="space-gateway-empty">No accounts connected yet.</p>
          : <ul className="space-gateway-provider-list">
            {status.accounts.byProvider.map((entry) => (
              <li key={entry.provider}><span>{providerLabel(entry.provider)}</span><span>{entry.active} active of {entry.total}</span></li>
            ))}
          </ul>}
      </section>
      <p className="space-gateway-note">
        Routing: {routingStrategyOptions.find((option) => option.value === status.settings.routingStrategy)?.label ?? status.settings.routingStrategy}
        {" · "}Compression: {compressionModeOptions.find((option) => option.value === status.settings.compressionMode)?.label}
        {" · "}Checked {formatTime(status.checkedAt)}
      </p>
    </div>
  );
}

/** Copies a sign-in link or code; the icon turns into a check for a moment. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return undefined;
    const timer = window.setTimeout(() => setState("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [state]);
  const title = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label;
  return (
    <button type="button" className={`space-gateway-copy${state === "copied" ? " copied" : ""}`} aria-label={label} title={title}
      onClick={() => { writeClipboardText(text).then(() => setState("copied"), () => setState("failed")); }}>
      {state === "copied" ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
    </button>
  );
}

const quotaGroupLabels: Record<string, string> = { gemini: "Gemini", claude: "Claude and GPT" };
const quotaGroupLabel = (key: string) => quotaGroupLabels[key] ?? key;

function UsageMeter({ label, used }: { label: string; used: number | null }) {
  const remaining = used === null ? null : Math.max(0, 100 - used);
  return (
    <span className="space-gateway-meter" title={`${label}: ${remaining === null ? "unknown" : `${formatPercent(remaining)} left`}`}>
      <span className="space-gateway-meter-label">{label}</span>
      <span className="space-gateway-meter-track"><span style={{ width: `${remaining ?? 0}%` }} /></span>
      <span className="space-gateway-meter-value">{remaining === null ? "—" : formatPercent(remaining)}</span>
    </span>
  );
}

type SignInMethod = "device" | "browser" | "import";

function AddCodexAccount({ client, onConnected }: { client: SpaceGatewayClient; onConnected: (label: string) => void }) {
  const [method, setMethod] = useState<SignInMethod>("device");
  const [device, setDevice] = useState<{ flowId: string; verificationUrl: string; userCode: string; intervalSeconds: number } | null>(null);
  const [browser, setBrowser] = useState<{ flowId: string; authorizationUrl: string } | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [authJson, setAuthJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!device) return undefined;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void client.pollDeviceSignIn(device.flowId).then((result) => {
        if (cancelled) return;
        if (result.status === "CONNECTED") {
          setDevice(null);
          setMessage({ tone: "ok", text: `Connected ${result.account?.label ?? "the account"}.` });
          onConnected(result.account?.label ?? "");
        } else if (result.status === "EXPIRED") {
          setDevice(null);
          setMessage({ tone: "error", text: "The code expired. Start again." });
        }
      }).catch((reason) => { if (!cancelled) { setDevice(null); setMessage({ tone: "error", text: errorText(reason, "Sign-in failed.") }); } });
    }, Math.max(3, device.intervalSeconds) * 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [client, device, onConnected]);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setMessage(null);
    try { await action(); } catch (reason) { setMessage({ tone: "error", text: errorText(reason, failure) }); } finally { setBusy(false); }
  }

  return (
    <section className="space-gateway-add" aria-label="Add a Codex account">
      <h3>Add a ChatGPT (Codex) account</h3>
      <div className="filter-tabs" role="tablist" aria-label="Sign-in method">
        {([["device", "Sign in with a code"], ["browser", "Sign in with the browser"], ["import", "Import auth.json"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={method === id} className={`filter-tab${method === id ? " active" : ""}`}
            onClick={() => { setMethod(id); setMessage(null); }}>{label}</button>
        ))}
      </div>
      {method === "device" ? (device ? (
        <div className="space-gateway-signin" role="status">
          <span>Open <a href={device.verificationUrl} target="_blank" rel="noreferrer">{device.verificationUrl}</a>
            <CopyButton text={device.verificationUrl} label="Copy link" />, sign in with the ChatGPT account and enter this code:</span>
          <span className="space-gateway-copy-row">
            <code className="space-gateway-user-code">{device.userCode}</code>
            <CopyButton text={device.userCode} label="Copy code" />
          </span>
          <span>Waiting for sign-in…</span>
          <button type="button" className="space-gateway-button" onClick={() => setDevice(null)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="space-gateway-button primary" disabled={busy}
          onClick={() => void run(async () => setDevice(await client.startDeviceSignIn()), "Could not start sign-in.")}>Get a sign-in code</button>
      )) : null}
      {method === "browser" ? (browser ? (
        <form className="space-gateway-signin" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const result = await client.completeBrowserSignIn(browser.flowId, callbackUrl.trim());
            setBrowser(null); setCallbackUrl("");
            setMessage({ tone: "ok", text: `Connected ${result.account.label}.` });
            onConnected(result.account.label);
          }, "Could not finish sign-in.");
        }}>
          <span>1. <a href={browser.authorizationUrl} target="_blank" rel="noreferrer">Open the ChatGPT sign-in page</a>
            <CopyButton text={browser.authorizationUrl} label="Copy link" /> and sign in.</span>
          <span>2. The browser then opens a localhost page that does not load. Copy its full address and paste it here.</span>
          <label className="space-gateway-field">Address after sign-in
            <input value={callbackUrl} onChange={(event) => setCallbackUrl(event.target.value)} placeholder="http://localhost:1455/auth/callback?code=…" />
          </label>
          <button type="submit" className="space-gateway-button primary" disabled={busy || !callbackUrl.trim()}>Finish sign-in</button>
        </form>
      ) : (
        <button type="button" className="space-gateway-button primary" disabled={busy}
          onClick={() => void run(async () => setBrowser(await client.startBrowserSignIn()), "Could not start sign-in.")}>Start browser sign-in</button>
      )) : null}
      {method === "import" ? (
        <form className="space-gateway-signin" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const result = await client.importAuthJson(authJson);
            setAuthJson("");
            setMessage({ tone: "ok", text: `Imported ${result.account.label}.` });
            onConnected(result.account.label);
          }, "Could not import the file.");
        }}>
          <label className="space-gateway-field">Contents of a Codex auth.json
            <textarea rows={4} value={authJson} spellCheck={false} onChange={(event) => setAuthJson(event.target.value)} placeholder='{"tokens": {…}}' />
            <span>Space Gateway takes over this sign-in. Sign the Codex CLI out of this account afterwards: two programs refreshing the same sign-in log each other out.</span>
          </label>
          <button type="submit" className="space-gateway-button primary" disabled={busy || authJson.trim().length < 2}>Import</button>
        </form>
      ) : null}
      {message ? <p className={message.tone === "ok" ? "space-gateway-success" : "space-gateway-alert"} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</p> : null}
    </section>
  );
}

function AddClaudeAccount({ client, onConnected }: { client: SpaceGatewayClient; onConnected: (label: string) => void }) {
  const [flow, setFlow] = useState<{ flowId: string; authorizationUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setMessage(null);
    try { await action(); } catch (reason) { setMessage({ tone: "error", text: errorText(reason, failure) }); } finally { setBusy(false); }
  }

  return (
    <section className="space-gateway-add" aria-label="Add a Claude account">
      <h3>Add a Claude account</h3>
      {flow ? (
        <form className="space-gateway-signin" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const result = await client.completeClaudeSignIn(flow.flowId, code.trim());
            setFlow(null); setCode("");
            setMessage({ tone: "ok", text: `Connected ${result.account.label}.` });
            onConnected(result.account.label);
          }, "Could not finish sign-in.");
        }}>
          <span>1. <a href={flow.authorizationUrl} target="_blank" rel="noreferrer">Open the Claude sign-in page</a>
            <CopyButton text={flow.authorizationUrl} label="Copy link" /> and sign in with the Claude account.</span>
          <span>2. Copy the code shown after you authorize and paste it here.</span>
          <label className="space-gateway-field">Authorization code
            <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="code#state" spellCheck={false} autoComplete="off" />
            <span>This is a separate sign-in for Space Gateway. Claude profiles on this server keep their own sign-in.</span>
          </label>
          <div className="space-gateway-toolbar">
            <button type="submit" className="space-gateway-button primary" disabled={busy || !code.trim()}>Finish sign-in</button>
            <button type="button" className="space-gateway-button" disabled={busy} onClick={() => { setFlow(null); setCode(""); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="space-gateway-button primary" disabled={busy}
          onClick={() => void run(async () => setFlow(await client.startClaudeSignIn()), "Could not start sign-in.")}>Start Claude sign-in</button>
      )}
      {message ? <p className={message.tone === "ok" ? "space-gateway-success" : "space-gateway-alert"} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</p> : null}
    </section>
  );
}

function AddAntigravityAccount({ client, onConnected }: { client: SpaceGatewayClient; onConnected: (label: string) => void }) {
  const [profiles, setProfiles] = useState<Array<{ profileId: string; email: string | null; inGateway: boolean }> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const load = useCallback(async () => {
    try { setProfiles((await client.antigravityProfiles()).data); }
    catch (reason) { setMessage({ tone: "error", text: errorText(reason, "Could not list Antigravity profiles.") }); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);

  async function add(profileId: string) {
    setBusy(profileId);
    setMessage(null);
    try {
      const result = await client.importAntigravityProfile(profileId);
      setMessage({ tone: "ok", text: `Connected ${result.account.label}.` });
      onConnected(result.account.label);
      await load();
    } catch (reason) {
      setMessage({ tone: "error", text: errorText(reason, "Could not add the account.") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-gateway-add" aria-label="Add an Antigravity account">
      <h3>Add an Antigravity account</h3>
      <p className="space-gateway-note">Antigravity accounts come from the Antigravity profiles signed in on this server. The profile keeps working: Google sign-ins can be shared.</p>
      {profiles === null ? <p className="space-gateway-empty">Loading profiles…</p>
        : profiles.length === 0 ? <p className="space-gateway-empty">No Antigravity profile is signed in. Sign one in from CLI accounts first.</p>
          : <ul className="space-gateway-profile-list">
            {profiles.map((profile) => (
              <li key={profile.profileId}>
                <span>{profile.email ?? profile.profileId}</span>
                <span className="space-gateway-chip">{profile.profileId}</span>
                {profile.inGateway
                  ? <span className="space-gateway-chip tone-ok">In Space Gateway</span>
                  : <button type="button" className="space-gateway-button" disabled={busy !== null}
                    onClick={() => void add(profile.profileId)}>{busy === profile.profileId ? "Adding…" : "Add to Space Gateway"}</button>}
              </li>
            ))}
          </ul>}
      {message ? <p className={message.tone === "ok" ? "space-gateway-success" : "space-gateway-alert"} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</p> : null}
    </section>
  );
}

function AddOpenAiApiKey({ client, onConnected }: { client: SpaceGatewayClient; onConnected: (label: string) => void }) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function add(input: { apiKey?: string; useSpaceKey?: boolean }) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await client.addOpenAiApiKey(input);
      setApiKey("");
      setMessage({ tone: "ok", text: `Connected ${result.account.label}.` });
      onConnected(result.account.label);
    } catch (reason) {
      setMessage({ tone: "error", text: errorText(reason, "Could not add the key.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-gateway-add" aria-label="Add an OpenAI API key">
      <h3>Add an OpenAI API key</h3>
      <p className="space-gateway-note">OpenAI API keys serve embeddings (Space memory). The key is checked with a free request and stored encrypted; it is never shown again.</p>
      <form className="space-gateway-signin" onSubmit={(event) => { event.preventDefault(); void add({ apiKey: apiKey.trim() }); }}>
        <label className="space-gateway-field">API key
          <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" autoComplete="off" spellCheck={false} />
        </label>
        <div className="space-gateway-toolbar">
          <button type="submit" className="space-gateway-button primary" disabled={busy || apiKey.trim().length < 20}>Add key</button>
          <button type="button" className="space-gateway-button" disabled={busy} onClick={() => void add({ useSpaceKey: true })}>Use this server's OpenAI key</button>
        </div>
      </form>
      {message ? <p className={message.tone === "ok" ? "space-gateway-success" : "space-gateway-alert"} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</p> : null}
    </section>
  );
}

function AddAccount({ client, onConnected }: { client: SpaceGatewayClient; onConnected: (label: string) => void }) {
  const [provider, setProvider] = useState<"CODEX" | "CLAUDE" | "ANTIGRAVITY" | "OPENAI_API">("CODEX");
  return (
    <>
      <div className="filter-tabs" role="tablist" aria-label="Provider to add">
        {([["CODEX", "ChatGPT (Codex)"], ["CLAUDE", "Claude"], ["ANTIGRAVITY", "Antigravity"], ["OPENAI_API", "OpenAI API"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={provider === id} className={`filter-tab${provider === id ? " active" : ""}`}
            onClick={() => setProvider(id)}>{label}</button>
        ))}
      </div>
      {provider === "CODEX" ? <AddCodexAccount client={client} onConnected={onConnected} />
        : provider === "CLAUDE" ? <AddClaudeAccount client={client} onConnected={onConnected} />
          : provider === "ANTIGRAVITY" ? <AddAntigravityAccount client={client} onConnected={onConnected} />
            : <AddOpenAiApiKey client={client} onConnected={onConnected} />}
    </>
  );
}

function AccountsTab({ client, onChanged }: { client: SpaceGatewayClient; onChanged: () => void }) {
  const [accounts, setAccounts] = useState<GatewayAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hideEmails, setHideEmails] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setAccounts((await client.accounts()).data); setError(null); }
    catch (reason) { setError(errorText(reason, "Could not load accounts.")); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);

  const resetOutcomes: Record<string, string> = {
    RESET: "Weekly limit reset.", NOTHING_TO_RESET: "Nothing to reset: the limits are not used up.", NO_CREDIT: "No reset credit is available.",
    ALREADY_REDEEMED: "This reset was already applied."
  };

  async function act(account: GatewayAccount, action: "test" | "usage" | "remove" | "reset") {
    setPending(account.id);
    setNotice(null);
    try {
      if (action === "test") {
        const result = await client.testAccount(account.id);
        if (result.ok) setNotice(result.model ? `${account.label} answered with ${result.model} in ${result.latencyMs} ms.`
          : `${account.label} is signed in and reachable (${result.latencyMs} ms).`);
        else setError(`${account.label} test failed: ${result.error ?? `HTTP ${result.status}`}`);
      } else if (action === "reset") {
        const result = await client.useResetCredit(account.id, crypto.randomUUID());
        setConfirmReset(null);
        setNotice(`${account.label}: ${resetOutcomes[result.outcome] ?? result.outcome}`);
      } else if (action === "usage") {
        await client.refreshUsage(account.id);
        setNotice(`Usage refreshed for ${account.label}.`);
      } else {
        await client.deleteAccount(account.id);
        setConfirmRemove(null);
        setNotice(`${account.label} removed from Space Gateway.`);
      }
      await load();
      onChanged();
    } catch (reason) {
      setError(errorText(reason, "The account action failed."));
    } finally {
      setPending(null);
    }
  }

  async function toggle(account: GatewayAccount) {
    setPending(account.id);
    try {
      await client.setAccountPaused(account.id, account.status !== "PAUSED");
      await load();
      onChanged();
    } catch (reason) {
      setError(errorText(reason, "Could not update the account."));
    } finally {
      setPending(null);
    }
  }

  if (error && !accounts) return <p className="space-gateway-alert" role="alert">{error}</p>;
  if (!accounts) return <p className="space-gateway-empty">Loading accounts…</p>;
  return (
    <div className="space-gateway-panel">
      <AddAccount client={client} onConnected={() => { void load(); onChanged(); }} />
      <div className="space-gateway-toolbar">
        <SpaceToggle checked={hideEmails} label="Hide emails" onChange={setHideEmails} />
      </div>
      {error ? <p className="space-gateway-alert" role="alert">{error}</p> : null}
      {notice ? <p className="space-gateway-success" role="status">{notice}</p> : null}
      {accounts.length === 0
        ? <p className="space-gateway-empty">No accounts connected yet. Accounts appear here once a provider is signed in through Space Gateway.</p>
        : <ul className="space-gateway-accounts">
          {accounts.map((account) => (
            <li key={account.id} className={`space-gateway-account status-${account.status.toLowerCase()}`}>
              <div className="space-gateway-account-head">
                <strong>{account.label}</strong>
                <span className="space-gateway-chip">{providerLabel(account.provider)}</span>
                {account.planType ? <span className="space-gateway-chip">{account.planType}</span> : null}
                <span className={`space-gateway-chip tone-${account.status === "ACTIVE" ? "ok" : account.status === "PAUSED" ? "muted" : "warn"}`}>
                  {account.status.replace("_", " ").toLowerCase()}
                </span>
              </div>
              <span className="space-gateway-account-email">{account.email ? (hideEmails ? "Email hidden" : account.email) : "No email"}</span>
              <div className="space-gateway-account-meters">
                {account.quotaGroups && account.quotaGroups.length > 0
                  ? account.quotaGroups.map((group) => (
                    <span key={group.key} className="space-gateway-quota-group">
                      <span className="space-gateway-quota-group-name">{quotaGroupLabel(group.key)}</span>
                      <UsageMeter label="5h" used={group.primaryWindow.usedPercent} />
                      <UsageMeter label="Weekly" used={group.secondaryWindow.usedPercent} />
                    </span>
                  ))
                  : <>
                    <UsageMeter label="5h" used={account.primaryWindow.usedPercent} />
                    <UsageMeter label="Weekly" used={account.secondaryWindow.usedPercent} />
                  </>}
              </div>
              {account.statusReason ? <span className="space-gateway-account-reason">{account.statusReason}</span> : null}
              <div className="space-gateway-account-actions">
                <button type="button" className="space-gateway-button" disabled={pending === account.id || account.status === "DEACTIVATED"}
                  title={account.status === "DEACTIVATED" ? "Sign the account in again to reactivate it" : undefined}
                  onClick={() => void toggle(account)}>
                  {account.status === "PAUSED" ? "Resume" : "Pause"}
                </button>
                <button type="button" className="space-gateway-button" disabled={pending === account.id}
                  title="Send one tiny request with this account" onClick={() => void act(account, "test")}>Test</button>
                <button type="button" className="space-gateway-button" disabled={pending === account.id}
                  title="Read the current 5h and weekly usage from the provider" onClick={() => void act(account, "usage")}>Refresh usage</button>
                {account.resetCreditsAvailable ? (confirmReset === account.id
                  ? <button type="button" className="space-gateway-button danger" disabled={pending === account.id} onClick={() => void act(account, "reset")}>Confirm reset</button>
                  : <button type="button" className="space-gateway-button" disabled={pending === account.id}
                    title="Spend one weekly limit reset credit on this account" onClick={() => setConfirmReset(account.id)}>
                    Use reset credit ({account.resetCreditsAvailable})</button>) : null}
                {confirmRemove === account.id
                  ? <button type="button" className="space-gateway-button danger" disabled={pending === account.id} onClick={() => void act(account, "remove")}>Confirm remove</button>
                  : <button type="button" className="space-gateway-button" disabled={pending === account.id} onClick={() => setConfirmRemove(account.id)}>Remove</button>}
              </div>
            </li>
          ))}
        </ul>}
    </div>
  );
}

function KeysTab({ client, onChanged }: { client: SpaceGatewayClient; onChanged: () => void }) {
  const [keys, setKeys] = useState<GatewayApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [trafficClass, setTrafficClass] = useState<GatewayTrafficClass>("INTERACTIVE");
  const [allowedModels, setAllowedModels] = useState("");
  const [dailyTokenLimit, setDailyTokenLimit] = useState("");
  const [created, setCreated] = useState<GatewayApiKeyCreatedResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setKeys((await client.keys()).data); setError(null); }
    catch (reason) { setError(errorText(reason, "Could not load API keys.")); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const limit = dailyTokenLimit.trim() ? Number(dailyTokenLimit) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      setError("The daily token limit must be a whole number above zero.");
      return;
    }
    setBusy(true);
    try {
      const result = await client.createKey({
        name: name.trim(),
        trafficClass,
        allowedModels: allowedModels.split(",").map((model) => model.trim()).filter(Boolean),
        limits: limit ? [{ limitType: "TOTAL_TOKENS", limitWindow: "DAILY", maxValue: limit, modelFilter: null }] : []
      });
      setCreated(result);
      setCopied(false);
      setName(""); setAllowedModels(""); setDailyTokenLimit("");
      setError(null);
      await load();
      onChanged();
    } catch (reason) {
      setError(errorText(reason, "Could not create the API key."));
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try { await action(); await load(); onChanged(); setError(null); }
    catch (reason) { setError(errorText(reason, failure)); }
    finally { setBusy(false); setConfirmDelete(null); }
  }

  async function copyKey() {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.plainKey); setCopied(true); }
    catch { setError("Copy failed. Select the key and copy it manually."); }
  }

  return (
    <div className="space-gateway-panel">
      <form className="space-gateway-form" onSubmit={(event) => void create(event)} aria-label="Create API key">
        <label>Name<input value={name} maxLength={120} required placeholder="Codex CLI" onChange={(event) => setName(event.target.value)} /></label>
        <label>Traffic class
          <select value={trafficClass} onChange={(event) => setTrafficClass(event.target.value as GatewayTrafficClass)}>
            {trafficClassOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>Allowed models<input value={allowedModels} placeholder="All models" onChange={(event) => setAllowedModels(event.target.value)} /></label>
        <label>Daily token limit<input value={dailyTokenLimit} inputMode="numeric" placeholder="No limit" onChange={(event) => setDailyTokenLimit(event.target.value)} /></label>
        <button type="submit" className="space-gateway-button primary" disabled={busy || !name.trim()}>Create key</button>
      </form>
      {created ? (
        <div className="space-gateway-created" role="status">
          <strong>Copy this key now. It is shown only once.</strong>
          <code>{created.plainKey}</code>
          <div className="space-gateway-toolbar">
            <button type="button" className="space-gateway-button" onClick={() => void copyKey()}>{copied ? "Copied" : "Copy key"}</button>
            <button type="button" className="space-gateway-button" onClick={() => setCreated(null)}>Done</button>
          </div>
        </div>
      ) : null}
      {error ? <p className="space-gateway-alert" role="alert">{error}</p> : null}
      {!keys ? <p className="space-gateway-empty">Loading API keys…</p> : keys.length === 0
        ? <p className="space-gateway-empty">No API keys yet. Every client that uses Space Gateway needs its own key.</p>
        : <div className="space-gateway-table-wrap"><table className="space-gateway-table">
          <thead><tr><th>Name</th><th>Key</th><th>Class</th><th>Scope</th><th>Limits</th><th>Last used</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td><code>{key.keyPrefix}…</code></td>
                <td>{trafficClassOptions.find((option) => option.value === key.trafficClass)?.label}</td>
                <td>{key.accountScopeEnabled ? `${key.accountIds.length} account${key.accountIds.length === 1 ? "" : "s"}` : "All accounts"}
                  {key.allowedModels.length ? ` · ${key.allowedModels.length} model${key.allowedModels.length === 1 ? "" : "s"}` : ""}</td>
                <td>{key.limits.length === 0 ? "None" : key.limits.map((limit) => {
                  const used = Date.parse(limit.resetAt) <= Date.now() ? 0 : limit.currentValue;
                  const format = (value: number) => (limit.limitType === "COST_USD" ? formatCost(value / 1e6) : formatTokens(value));
                  return `${format(used)} / ${format(limit.maxValue)} ${limit.limitWindow.toLowerCase()}`;
                }).join(" · ")}</td>
                <td>{formatTime(key.lastUsedAt)}</td>
                <td>{key.isActive ? "Enabled" : "Disabled"}{key.expiresAt ? ` · expires ${formatTime(key.expiresAt)}` : ""}</td>
                <td className="space-gateway-row-actions">
                  <button type="button" className="space-gateway-button" disabled={busy}
                    onClick={() => void run(() => client.updateKey(key.id, { isActive: !key.isActive }), "Could not update the API key.")}>
                    {key.isActive ? "Disable" : "Enable"}
                  </button>
                  {confirmDelete === key.id
                    ? <button type="button" className="space-gateway-button danger" disabled={busy}
                      onClick={() => void run(() => client.deleteKey(key.id), "Could not delete the API key.")}>Confirm delete</button>
                    : <button type="button" className="space-gateway-button" disabled={busy} onClick={() => setConfirmDelete(key.id)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>}
    </div>
  );
}

function LogsTab({ client }: { client: SpaceGatewayClient }) {
  const [rows, setRows] = useState<GatewayRequestLog[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (next: string | null) => {
    setLoading(true);
    try {
      const page = await client.logs({ limit: 50, cursor: next });
      setRows((current) => (next && current ? [...current, ...page.data] : page.data));
      setCursor(page.nextCursor);
      setError(null);
    } catch (reason) {
      setError(errorText(reason, "Could not load request logs."));
    } finally {
      setLoading(false);
    }
  }, [client]);
  useEffect(() => { void load(null); }, [load]);

  return (
    <div className="space-gateway-panel">
      <div className="space-gateway-toolbar">
        <button type="button" className="space-gateway-button" disabled={loading} onClick={() => void load(null)}>Refresh</button>
      </div>
      {error ? <p className="space-gateway-alert" role="alert">{error}</p> : null}
      {!rows ? <p className="space-gateway-empty">Loading request logs…</p> : rows.length === 0
        ? <p className="space-gateway-empty">No requests yet. Requests appear here as soon as clients use Space Gateway.</p>
        : <div className="space-gateway-table-wrap"><table className="space-gateway-table">
          <thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>Status</th><th>Latency</th><th>Tokens in / out</th><th>Cost</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatTime(row.requestedAt)}</td>
                <td>{providerLabel(row.provider)}</td>
                <td>{row.model}{row.reasoningEffort ? ` · ${row.reasoningEffort}` : ""}</td>
                <td className={row.status === "success" ? "tone-ok" : "tone-warn"}>{row.errorCode ?? row.status}</td>
                <td>{row.latencyMs === null ? "—" : `${row.latencyMs} ms`}</td>
                <td>{row.inputTokens === null ? "—" : formatTokens(row.inputTokens)} / {row.outputTokens === null ? "—" : formatTokens(row.outputTokens)}</td>
                <td>{row.costUsd === null ? "—" : formatCost(row.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>}
      {cursor ? <button type="button" className="space-gateway-button" disabled={loading} onClick={() => void load(cursor)}>Load more</button> : null}
    </div>
  );
}

const reportRanges = [{ days: 7, label: "7 days" }, { days: 28, label: "28 days" }, { days: 90, label: "90 days" }] as const;

function isoDay(date: Date) { return date.toISOString().slice(0, 10); }

function reportCsv(report: GatewayReport): string {
  const header = ["day", "requests", "errors", "input_tokens", "cached_input_tokens", "output_tokens", "reasoning_tokens", "reasoning_reported", "cost_usd", "compression_tokens_saved"];
  const lines = report.days.map((row) => [row.key, row.requests, row.errors, row.inputTokens, row.cachedInputTokens, row.outputTokens,
    row.reasoningTokens, row.reasoningReported, row.costUsd.toFixed(6), row.compressionTokensSaved].join(","));
  return [header.join(","), ...lines].join("\n") + "\n";
}

function ReportTable({ rows, label, keyLabel }: { rows: GatewayReportRow[]; label: string; keyLabel: (key: string) => string }) {
  return (
    <div className="space-gateway-table-wrap"><table className="space-gateway-table" aria-label={label}>
      <thead><tr><th>{label}</th><th>Requests</th><th>Errors</th><th>Input</th><th>Cached</th><th>Output</th><th>Reasoning</th><th>Cost</th></tr></thead>
      <tbody>{rows.map((row) => (
        <tr key={row.key}>
          <td>{keyLabel(row.key)}</td><td>{formatTokens(row.requests)}</td><td>{row.errors}</td><td>{formatTokens(row.inputTokens)}</td>
          <td>{formatTokens(row.cachedInputTokens)}</td><td>{formatTokens(row.outputTokens)}</td>
          <td title={`${row.reasoningReported} of ${row.requests} requests reported reasoning`}>{row.reasoningReported ? formatTokens(row.reasoningTokens) : "—"}</td>
          <td>{formatCost(row.costUsd)}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function ReportsTab({ client }: { client: SpaceGatewayClient }) {
  const [days, setDays] = useState<number>(7);
  const [report, setReport] = useState<GatewayReport | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    setReport(null);
    void Promise.all([client.report(isoDay(from), isoDay(to)), client.accounts().catch(() => ({ data: [] as GatewayAccount[] }))])
      .then(([result, accounts]) => {
        if (cancelled) return;
        setReport(result);
        setLabels(Object.fromEntries(accounts.data.map((account) => [account.id, account.label])));
        setError(null);
      })
      .catch((reason) => { if (!cancelled) setError(errorText(reason, "Could not load the report.")); });
    return () => { cancelled = true; };
  }, [client, days]);

  function exportCsv() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([reportCsv(report)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `space-gateway-${report.from}-to-${report.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const peak = Math.max(1, ...(report?.days.map((row) => row.requests) ?? [1]));
  return (
    <div className="space-gateway-panel">
      <div className="space-gateway-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Report range">
          {reportRanges.map((range) => (
            <button key={range.days} type="button" role="tab" aria-selected={days === range.days} className={`filter-tab${days === range.days ? " active" : ""}`}
              onClick={() => setDays(range.days)}>{range.label}</button>
          ))}
        </div>
        <button type="button" className="space-gateway-button" disabled={!report || report.days.length === 0} onClick={exportCsv}>Export CSV</button>
      </div>
      {error ? <p className="space-gateway-alert" role="alert">{error}</p> : null}
      {!report ? (error ? null : <p className="space-gateway-empty">Loading report…</p>) : report.days.length === 0
        ? <p className="space-gateway-empty">No requests in this period.</p>
        : <>
          <dl className="space-gateway-stats" aria-label="Report totals">
            <Stat label="Requests" value={formatTokens(report.totals.requests)} detail={`${report.totals.errors} errors`} />
            <Stat label="Input tokens" value={formatTokens(report.totals.inputTokens)} detail={`${formatTokens(report.totals.cachedInputTokens)} cached`} />
            <Stat label="Output tokens" value={formatTokens(report.totals.outputTokens)} />
            <Stat label="Cost (API equivalent)" value={formatCost(report.totals.costUsd)} />
          </dl>
          <div className="space-gateway-bars" role="img" aria-label="Requests per day">
            {report.days.map((row) => (
              <span key={row.key} title={`${row.key}: ${row.requests} requests`} style={{ height: `${Math.max(4, (row.requests / peak) * 100)}%` }} />
            ))}
          </div>
          <ReportTable rows={[...report.days].reverse()} label="Day" keyLabel={(key) => key} />
          <ReportTable rows={report.models} label="Model" keyLabel={(key) => key} />
          <ReportTable rows={report.accounts} label="Account" keyLabel={(key) => labels[key] ?? (key ? "Removed account" : "No account")} />
        </>}
    </div>
  );
}

function useSettingsSaver(client: SpaceGatewayClient, onSaved: (settings: GatewaySettings) => void) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const save = useCallback(async (patch: GatewaySettingsUpdateRequest) => {
    setSaving(true);
    try { onSaved(await client.updateSettings(patch)); setMessage({ tone: "ok", text: "Settings saved." }); }
    catch (reason) { setMessage({ tone: "error", text: errorText(reason, "Could not save settings.") }); }
    finally { setSaving(false); }
  }, [client, onSaved]);
  return { saving, message, save };
}

function SaveMessage({ message }: { message: { tone: "ok" | "error"; text: string } | null }) {
  if (!message) return null;
  return <p className={message.tone === "ok" ? "space-gateway-success" : "space-gateway-alert"} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</p>;
}

function RoutingTab({ settings, client, onSaved }: { settings: GatewaySettings; client: SpaceGatewayClient; onSaved: (settings: GatewaySettings) => void }) {
  const [strategy, setStrategy] = useState<GatewayRoutingStrategy>(settings.routingStrategy);
  const [sticky, setSticky] = useState(settings.stickyThreadsEnabled);
  const [earlierReset, setEarlierReset] = useState(settings.preferEarlierReset);
  const [planPriority, setPlanPriority] = useState(settings.planPriority.join(", "));
  const [floor, setFloor] = useState(String(settings.exhaustionFloorPercent));
  const [threshold, setThreshold] = useState(String(settings.stickyReallocationBudgetThresholdPercent));
  const { saving, message, save } = useSettingsSaver(client, onSaved);
  const selected = routingStrategyOptions.find((option) => option.value === strategy);

  return (
    <form className="space-gateway-panel" onSubmit={(event) => {
      event.preventDefault();
      void save({
        routingStrategy: strategy, stickyThreadsEnabled: sticky, preferEarlierReset: earlierReset,
        planPriority: planPriority.split(",").map((plan) => plan.trim()).filter(Boolean),
        exhaustionFloorPercent: Number(floor), stickyReallocationBudgetThresholdPercent: Number(threshold)
      });
    }}>
      <label className="space-gateway-field">Routing strategy
        <select value={strategy} onChange={(event) => setStrategy(event.target.value as GatewayRoutingStrategy)}>
          {routingStrategyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <span>{selected?.description}</span>
      </label>
      <SpaceToggle checked={sticky} label="Sticky threads" detail="Keep a conversation on the same account to reuse its prompt cache." onChange={setSticky} />
      <SpaceToggle checked={earlierReset} label="Prefer earlier reset" detail="Among eligible accounts, use the one whose quota resets soonest." onChange={setEarlierReset} />
      <label className="space-gateway-field">Plan priority
        <input value={planPriority} onChange={(event) => setPlanPriority(event.target.value)} placeholder="plus, prolite, pro" />
        <span>Plans are used in this order; each plan is drained before the next.</span>
      </label>
      <div className="space-gateway-field-row">
        <label className="space-gateway-field">Exhaustion floor (%)
          <input type="number" min={0} max={50} step={0.5} value={floor} onChange={(event) => setFloor(event.target.value)} />
        </label>
        <label className="space-gateway-field">Sticky move threshold (%)
          <input type="number" min={0} max={100} step={1} value={threshold} onChange={(event) => setThreshold(event.target.value)} />
        </label>
      </div>
      <SaveMessage message={message} />
      <button type="submit" className="space-gateway-button primary" disabled={saving}>Save routing</button>
    </form>
  );
}

const strategyLabels: Record<string, string> = {
  smart_crusher: "JSON (SmartCrusher)", log_compressor: "Logs", search_compressor: "Search results", diff_compressor: "Diffs"
};

function CompressionStatsPanel({ client }: { client: SpaceGatewayClient }) {
  const [hours, setHours] = useState(24);
  const [stats, setStats] = useState<GatewayCompressionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setStats(null);
    client.compressionStats(hours).then((result) => { if (!cancelled) { setStats(result); setError(null); } })
      .catch((reason) => { if (!cancelled) setError(errorText(reason, "Could not load compression statistics.")); });
    return () => { cancelled = true; };
  }, [client, hours]);
  const peak = Math.max(1, ...(stats?.history.map((row) => row.appliedSaved + row.shadowSaved) ?? [1]));
  return (
    <section className="space-gateway-panel" aria-label="Compression statistics">
      <div className="space-gateway-toolbar">
        <h3>Statistics</h3>
        <div className="filter-tabs" role="tablist" aria-label="Statistics range">
          {[24, 24 * 7, 24 * 28].map((value) => (
            <button key={value} type="button" role="tab" aria-selected={hours === value} className={`filter-tab${hours === value ? " active" : ""}`}
              onClick={() => setHours(value)}>{value === 24 ? "24 hours" : `${value / 24} days`}</button>
          ))}
        </div>
      </div>
      {error ? <p className="space-gateway-alert" role="alert">{error}</p> : null}
      {!stats ? (error ? null : <p className="space-gateway-empty">Loading statistics…</p>) : stats.applied.requests + stats.shadow.requests === 0
        ? <p className="space-gateway-empty">No requests were compressed or measured in this period.</p>
        : <>
          <dl className="space-gateway-stats">
            <Stat label="Tokens saved" value={formatTokens(stats.applied.tokensSaved)} detail={`${formatPercent(stats.applied.savingsPercent)} of compressed tool output`} />
            <Stat label="Would save (Shadow)" value={formatTokens(stats.shadow.tokensSaved)} detail={`${formatPercent(stats.shadow.savingsPercent)} of measured tool output`} />
            <Stat label="Requests compressed" value={`${formatTokens(stats.applied.modifiedRequests)} / ${formatTokens(stats.applied.requests)}`}
              detail={`${formatTokens(stats.shadow.modifiedRequests)} / ${formatTokens(stats.shadow.requests)} in Shadow`} />
            <Stat label="Overhead per request" value={`${(stats.applied.requests ? stats.applied.averageOverheadMs : stats.shadow.averageOverheadMs).toFixed(1)} ms`}
              detail={`max ${Math.max(stats.applied.maxOverheadMs, stats.shadow.maxOverheadMs).toFixed(1)} ms · ${stats.applied.timedOut + stats.shadow.timedOut} over budget`} />
          </dl>
          <div className="space-gateway-bars" role="img" aria-label="Tokens saved per hour">
            {stats.history.map((row) => (
              <span key={row.hour} title={`${new Date(row.hour).toLocaleString()}: ${row.appliedSaved} saved, ${row.shadowSaved} in Shadow`}
                style={{ height: `${Math.max(4, ((row.appliedSaved + row.shadowSaved) / peak) * 100)}%` }} />
            ))}
          </div>
          {stats.byStrategy.length ? <div className="space-gateway-table-wrap"><table className="space-gateway-table" aria-label="Savings by strategy">
            <thead><tr><th>Strategy</th><th>Mode</th><th>Blocks</th><th>Tokens saved</th><th>Savings</th><th>Not smaller</th><th>Errors</th></tr></thead>
            <tbody>{stats.byStrategy.map((row) => (
              <tr key={`${row.mode}:${row.strategy}`}><td>{strategyLabels[row.strategy] ?? row.strategy}</td><td>{row.mode === "ON" ? "On" : "Shadow"}</td>
                <td>{formatTokens(row.blocks)}</td><td>{formatTokens(row.tokensSaved)}</td><td>{formatPercent(row.savingsPercent)}</td>
                <td>{row.rejectedBlocks}</td><td>{row.errorBlocks}</td></tr>
            ))}</tbody>
          </table></div> : null}
        </>}
    </section>
  );
}

function CompressionTab({ settings, client, onSaved }: { settings: GatewaySettings; client: SpaceGatewayClient; onSaved: (settings: GatewaySettings) => void }) {
  const [mode, setMode] = useState<GatewayCompressionMode>(settings.compressionMode);
  const [profile, setProfile] = useState<GatewayCompressionProfile>(settings.compressionProfile);
  const [budget, setBudget] = useState(String(settings.compressionTimeBudgetMs));
  const { saving, message, save } = useSettingsSaver(client, onSaved);

  return (
    <form className="space-gateway-panel" onSubmit={(event) => {
      event.preventDefault();
      void save({ compressionMode: mode, compressionProfile: profile, compressionTimeBudgetMs: Number(budget) });
    }}>
      <fieldset className="space-gateway-segmented">
        <legend>Context compression</legend>
        {compressionModeOptions.map((option) => (
          <label key={option.value} className={mode === option.value ? "active" : undefined} title={option.description}>
            <input type="radio" name="compression-mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} />
            {option.label}
          </label>
        ))}
      </fieldset>
      <p className="space-gateway-note">{compressionModeOptions.find((option) => option.value === mode)?.description}</p>
      <label className="space-gateway-field">Profile
        <select value={profile} onChange={(event) => setProfile(event.target.value as GatewayCompressionProfile)}>
          <option value="CACHE">Cache-safe: keep the provider prompt cache intact</option>
          <option value="TOKEN">Token: compress more aggressively</option>
        </select>
      </label>
      <label className="space-gateway-field">Time budget per request (ms)
        <input type="number" min={10} max={5000} value={budget} onChange={(event) => setBudget(event.target.value)} />
        <span>When compression takes longer, the original request is sent unchanged.</span>
      </label>
      <SaveMessage message={message} />
      <button type="submit" className="space-gateway-button primary" disabled={saving}>Save compression</button>
      <CompressionStatsPanel client={client} />
    </form>
  );
}

function SettingsTab({ settings, client, onSaved }: { settings: GatewaySettings; client: SpaceGatewayClient; onSaved: (settings: GatewaySettings) => void }) {
  const [retention, setRetention] = useState(String(settings.requestLogRetentionDays));
  const { saving, message, save } = useSettingsSaver(client, onSaved);
  return (
    <form className="space-gateway-panel" onSubmit={(event) => { event.preventDefault(); void save({ requestLogRetentionDays: Number(retention) }); }}>
      <label className="space-gateway-field">Request log retention (days)
        <input type="number" min={1} max={365} value={retention} onChange={(event) => setRetention(event.target.value)} />
        <span>Older request logs are deleted every hour. Daily usage totals are kept.</span>
      </label>
      <SaveMessage message={message} />
      <button type="submit" className="space-gateway-button primary" disabled={saving}>Save settings</button>
    </form>
  );
}

export function SpaceGatewayDialog({ client = defaultClient, embedded = false, initialTab = "overview", onClose }: {
  client?: SpaceGatewayClient;
  embedded?: boolean;
  initialTab?: SpaceGatewayTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SpaceGatewayTab>(initialTab);
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    try { setStatus(await client.status()); setError(null); }
    catch (reason) { setError(errorText(reason, "Could not load Space Gateway status.")); }
  }, [client]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const onSettingsSaved = useCallback((settings: GatewaySettings) => {
    setStatus((current) => (current ? { ...current, settings } : current));
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !embedded) { event.stopPropagation(); onClose(); }
  }

  const content = useMemo(() => {
    if (tab === "accounts") return <AccountsTab client={client} onChanged={() => void refresh()} />;
    if (tab === "keys") return <KeysTab client={client} onChanged={() => void refresh()} />;
    if (tab === "logs") return <LogsTab client={client} />;
    if (tab === "reports") return <ReportsTab client={client} />;
    if (!status) return error ? null : <p className="space-gateway-empty">Loading Space Gateway…</p>;
    if (tab === "routing") return <RoutingTab key={status.settings.updatedAt} settings={status.settings} client={client} onSaved={onSettingsSaved} />;
    if (tab === "compression") return <CompressionTab key={status.settings.updatedAt} settings={status.settings} client={client} onSaved={onSettingsSaved} />;
    if (tab === "settings") return <SettingsTab key={status.settings.updatedAt} settings={status.settings} client={client} onSaved={onSettingsSaved} />;
    return <OverviewTab status={status} />;
  }, [tab, status, error, client, refresh, onSettingsSaved]);

  return (
    <div className={`space-gateway-backdrop${embedded ? " manage-embedded" : ""}`} onMouseDown={(event) => {
      if (!embedded && event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="space-gateway-dialog" role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : true}
        aria-label="Space Gateway" onKeyDown={handleKeyDown}>
        <header className="space-gateway-header">
          <span className="space-gateway-icon"><Network aria-hidden="true" /></span>
          <div>
            <h2>Space Gateway</h2>
            <p>Account load balancing and context compression for every AI provider in Space.</p>
          </div>
          <button type="button" aria-label="Close Space Gateway" onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <div className="filter-tabs space-gateway-tabs" role="tablist" aria-label="Space Gateway sections">
          {tabs.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`filter-tab${tab === item.id ? " active" : ""}`}
              onClick={() => setTab(item.id)}>{item.label}</button>
          ))}
        </div>
        {error ? <p className="space-gateway-alert" role="alert">{error}</p> : null}
        {content}
      </section>
    </div>
  );
}
