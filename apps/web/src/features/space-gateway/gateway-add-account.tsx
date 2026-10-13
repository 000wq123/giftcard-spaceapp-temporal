import { useCallback, useEffect, useState } from "react";
import { writeClipboardText } from "../clipboard-dock/clipboard-events.js";
import { Check, Copy } from "../ui-theme/app-icons.js";
import { errorText, type SpaceGatewayClient } from "./gateway-client.js";

/** Sign-in flows that add accounts to Space Gateway: ChatGPT (Codex), Claude, Antigravity profiles and OpenAI API keys. */
/** Copies a sign-in link or code; the icon turns into a check for a moment. */
export function CopyButton({ text, label }: { text: string; label: string }) {
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

const apiKeyProviders = {
  OPENAI_API: { title: "Add an OpenAI API key", placeholder: "sk-…",
    note: "OpenAI API keys serve embeddings (Space memory) and the OpenAI key pool. The key is checked with a free request and stored encrypted; it is never shown again." },
  OPENROUTER: { title: "Add an OpenRouter API key", placeholder: "sk-or-…",
    note: "OpenRouter keys form a key pool at /pools/openrouter/v1: each request uses one key and moves to another when a key is out of credit, rate limited or rejected. The key is checked with a free request and stored encrypted." },
  DEEPSEEK: { title: "Add a DeepSeek API key", placeholder: "sk-…",
    note: "DeepSeek keys form a key pool at /pools/deepseek/v1, rotated per request with failover. The key is checked with a free balance request and stored encrypted." }
} as const;

function AddOpenAiApiKey({ client, onConnected, provider = "OPENAI_API" }: { client: SpaceGatewayClient; onConnected: (label: string) => void;
  provider?: keyof typeof apiKeyProviders }) {
  const text = apiKeyProviders[provider];
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function add(input: { apiKey?: string; useSpaceKey?: boolean }) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await client.addOpenAiApiKey({ provider, ...input });
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
    <section className="space-gateway-add" aria-label={text.title}>
      <h3>{text.title}</h3>
      <p className="space-gateway-note">{text.note}</p>
      <form className="space-gateway-signin" onSubmit={(event) => { event.preventDefault(); void add({ apiKey: apiKey.trim() }); }}>
        <label className="space-gateway-field">API key
          <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={text.placeholder} autoComplete="off" spellCheck={false} />
        </label>
        <div className="space-gateway-toolbar">
          <button type="submit" className="space-gateway-button primary" disabled={busy || apiKey.trim().length < 20}>Add key</button>
          {provider === "OPENAI_API"
            ? <button type="button" className="space-gateway-button" disabled={busy} onClick={() => void add({ useSpaceKey: true })}>Use this server's OpenAI key</button>
            : null}
        </div>
      </form>
      {message ? <p className={message.tone === "ok" ? "space-gateway-success" : "space-gateway-alert"} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</p> : null}
    </section>
  );
}

export function AddAccount({ client, onConnected }: { client: SpaceGatewayClient; onConnected: (label: string) => void }) {
  const [provider, setProvider] = useState<"CODEX" | "CLAUDE" | "ANTIGRAVITY" | "OPENAI_API" | "OPENROUTER" | "DEEPSEEK">("CODEX");
  return (
    <>
      <div className="filter-tabs" role="tablist" aria-label="Provider to add">
        {([["CODEX", "ChatGPT (Codex)"], ["CLAUDE", "Claude"], ["ANTIGRAVITY", "Antigravity"], ["OPENAI_API", "OpenAI API"], ["OPENROUTER", "OpenRouter"],
          ["DEEPSEEK", "DeepSeek"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={provider === id} className={`filter-tab${provider === id ? " active" : ""}`}
            onClick={() => setProvider(id)}>{label}</button>
        ))}
      </div>
      {provider === "CODEX" ? <AddCodexAccount client={client} onConnected={onConnected} />
        : provider === "CLAUDE" ? <AddClaudeAccount client={client} onConnected={onConnected} />
          : provider === "ANTIGRAVITY" ? <AddAntigravityAccount client={client} onConnected={onConnected} />
            : <AddOpenAiApiKey key={provider} client={client} onConnected={onConnected} provider={provider} />}
    </>
  );
}
