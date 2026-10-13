import { useEffect, useState } from "react";
import { CLI_PANE_TYPES, nativeToolRoutingRuntimeIds, type EffectiveToolPlanV1, type ModelCapabilityProfileV1, type ToolRoutingStateV1, type ToolRoutingOverride } from "@space/contracts";
import { api } from "../../api.js";
import { SpaceToggle } from "../ui-controls/SpaceToggle.js";

const modes: Array<[ToolRoutingOverride["mode"], string]> = [
  ["AUTOMATIC", "Automatic"], ["NATIVE_ONLY", "Native only"],
  ["ALLOW_FALLBACK", "Allow fallback"], ["DISABLED", "Disabled"]
];
export function ToolRoutingSettings() {
  const [state, setState] = useState<ToolRoutingStateV1 | null>(null);
  const [profiles, setProfiles] = useState<ModelCapabilityProfileV1[]>([]);
  const [runtimeId, setRuntimeId] = useState("cli:codex");
  const [modelId, setModelId] = useState("*");
  const [plan, setPlan] = useState<EffectiveToolPlanV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const nativeRuntime = (nativeToolRoutingRuntimeIds as readonly string[]).includes(runtimeId);
  useEffect(() => {
    let active = true;
    api.modelCapabilities().then((result) => {
      if (active) { setState(result.state); setProfiles(result.profiles); }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    api.effectiveToolRouting(runtimeId, modelId).then((result) => { if (active) setPlan(result); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [runtimeId, modelId, state?.revision]);
  function choose(toolId: string, mode: ToolRoutingOverride["mode"]) {
    setState((current) => current ? {
      ...current,
      overrides: [...current.overrides.filter((entry) => !(entry.toolId === toolId && entry.runtimeId === runtimeId && entry.modelId === modelId)),
        { toolId, runtimeId, modelId, mode }]
    } : current);
    setDirty(true);
  }
  async function save() {
    if (!state) return;
    setBusy(true); setError(null);
    try {
      const updated = await api.saveToolRouting({
        expectedRevision: state.revision, enabledRuntimeIds: state.enabledRuntimeIds, overrides: state.overrides
      });
      setState(updated); setDirty(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Routing update failed."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Tool routing" className="agent-tools-routing">
    <h3>Tool routing</h3>
    <p>Use capable native tools first. Start Space backends only when needed.</p>
    {error && <p role="alert">{error}</p>}
    <label>Runtime
      <select value={runtimeId} onChange={(event) => { setRuntimeId(event.target.value); setModelId("*"); }}>
        <option value="*">All runtimes</option>
        {CLI_PANE_TYPES.map((type) => <option key={type.id} value={type.id}>{type.shortLabel}</option>)}
      </select>
    </label>
    <label>Model
      <input value={modelId} list="routing-models" onChange={(event) => setModelId(event.target.value || "*")} aria-label="Routing model" />
      <datalist id="routing-models">
        <option value="*">All models</option>
        {profiles.filter((entry) => entry.runtimeId === runtimeId).map((entry) => <option key={entry.modelId} value={entry.modelId} />)}
      </datalist>
    </label>
    {state && nativeRuntime && (
      <SpaceToggle
        className="tool-routing-toggle"
        label="Enable capability routing for new sessions"
        checked={state.enabledRuntimeIds.includes(runtimeId)}
        onChange={(checked) => {
          setState({ ...state, enabledRuntimeIds: checked ? [...new Set([...state.enabledRuntimeIds, runtimeId])] : state.enabledRuntimeIds.filter((id) => id !== runtimeId) });
          setDirty(true);
        }}
      />
    )}
    <p>Saved startup policy: {plan?.registration ?? "Loading"}. Existing sessions keep their current configuration.</p>
    {!nativeRuntime && <p>Startup migration is currently available for Codex and Claude Code. Other runtimes keep their existing configuration.</p>}
    {dirty && <p>Unsaved changes. Route explanations show the last saved policy.</p>}
    <ul>{plan?.routes.map((route) => {
      const mode = state?.overrides.find((entry) => entry.toolId === route.toolId && entry.runtimeId === runtimeId && entry.modelId === modelId)?.mode ?? route.mode;
      return <li key={route.toolId}>
        <label>{route.toolId.replace("mcp:", "")}
          <select aria-label={route.toolId + " routing"} value={mode} onChange={(event) => choose(route.toolId, event.target.value as ToolRoutingOverride["mode"])}>
            {modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <details><summary>Why this route?</summary><p>{route.reason}</p><p>{plan.managed ? "Saved route" : "Policy preview"}: {route.route}</p></details>
      </li>;
    })}</ul>
    <button type="button" disabled={!state || !dirty || busy} onClick={() => void save()}>{busy ? "Saving..." : "Save routing"}</button>
  </section>;
}
