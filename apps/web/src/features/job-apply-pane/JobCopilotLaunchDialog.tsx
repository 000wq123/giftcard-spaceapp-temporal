import { useEffect, useMemo, useState } from "react";
import type { AgentRuntimeRegistry, CliAccountProfile } from "@space/contracts";
import { api } from "../../api.js";
import { cliRuntimePresentation } from "../../cli-runtime-presentation.js";
import { Bot, Check, Terminal, X } from "../ui-theme/app-icons.js";
import { defaultJobCopilotRuntimeId, jobCopilotRuntimeOptions, readLastClaudeAccountProfileId, writeLastClaudeAccountProfileId, JOB_COPILOT_PREFERRED_RUNTIME_ID } from "./agent-runtimes.js";
import "./job-copilot-pane.css";

export interface JobCopilotLaunchChoice {
  terminalRuntimeId: string;
  /** Claude Code account profile ("main" or a named profile); only for Claude Code. */
  accountProfileId: string | null;
}

/** Runtime chooser shown before a Job Copilot pane opens: ready CLIs in catalog order, Claude Code recommended. */
export function JobCopilotLaunchDialog({ onClose, onCreate }: { onClose(): void; onCreate(choice: JobCopilotLaunchChoice): Promise<void> }) {
  const [registry, setRegistry] = useState<AgentRuntimeRegistry | null>(() => api.cliRuntimesSnapshot());
  const [profiles, setProfiles] = useState<CliAccountProfile[]>([]);
  const [runtimeId, setRuntimeId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState(readLastClaudeAccountProfileId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(() => jobCopilotRuntimeOptions(registry), [registry]);
  const selectedId = runtimeId ?? defaultJobCopilotRuntimeId(options);
  const selected = options.find((option) => option.runtime.id === selectedId) ?? null;
  const claudeSelected = selectedId === JOB_COPILOT_PREFERRED_RUNTIME_ID;

  useEffect(() => {
    let cancelled = false;
    api.cliRuntimes().then((next) => { if (!cancelled) setRegistry(next); }).catch((caught: unknown) => {
      if (!cancelled && !registry) setError(caught instanceof Error ? caught.message : "CLI runtimes could not be loaded.");
    });
    api.listCliAccountProfiles(JOB_COPILOT_PREFERRED_RUNTIME_ID).then((response) => { if (!cancelled) setProfiles(response.profiles); }).catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function create() {
    if (!selected || !selected.ready || pending) return;
    setPending(true);
    setError(null);
    try {
      if (claudeSelected) writeLastClaudeAccountProfileId(profileId);
      await onCreate({ terminalRuntimeId: selected.runtime.id, accountProfileId: claudeSelected ? profileId : null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Job Copilot pane could not be created.");
      setPending(false);
    }
  }

  return (
    <div className="attachment-modal jc-launch-modal" onClick={onClose}>
      <section className="attachment-modal-body jc-launch" role="dialog" aria-modal="true" aria-label="New Job Copilot" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="terminal-upload-modal-close jc-launch-close" aria-label="Close" onClick={onClose}><X aria-hidden="true" /></button>
        <header className="jc-launch-head">
          <span className="jc-launch-eyebrow"><Bot aria-hidden="true" /> Job Copilot</span>
          <strong>Choose the agent that applies for you</strong>
          <small>The copilot runs long, tool-heavy application loops in this pane's own CLI. Claude Code is recommended; any ready CLI works.</small>
        </header>
        {options.length === 0 ? (
          <p className="jc-launch-state" role="status">{error ?? "Loading CLI runtimes…"}</p>
        ) : (
          <div className="jc-launch-options" role="radiogroup" aria-label="Copilot agent">
            {options.map(({ runtime, ready, recommended }) => {
              const presentation = cliRuntimePresentation(runtime.id);
              const active = runtime.id === selectedId;
              return (
                <button key={runtime.id} type="button" role="radio" aria-checked={active} className={`jc-launch-option${active ? " selected" : ""}`}
                  disabled={!ready || pending} title={ready ? undefined : runtime.statusReason} onClick={() => setRuntimeId(runtime.id)}>
                  {presentation ? <img src={presentation.iconSrc} alt="" aria-hidden="true" /> : <Terminal aria-hidden="true" />}
                  <span className="jc-launch-option-copy">
                    <strong>{runtime.displayName}</strong>
                    <small>{ready ? (recommended ? "Recommended: native MCP, skills, account profiles" : "Ready") : runtime.statusReason}</small>
                  </span>
                  {recommended && ready ? <span className="jc-tag accent">Recommended</span> : null}
                  {active ? <Check className="jc-launch-check" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        )}
        {claudeSelected && profiles.length > 1 ? (
          <label className="jc-field jc-launch-profile">
            <span>Claude account</span>
            <select value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={pending}>
              {profiles.map((profile) => <option key={profile.profileId} value={profile.profileId}>{profile.displayName}</option>)}
            </select>
          </label>
        ) : null}
        {error && options.length > 0 ? <p className="jc-launch-state error" role="alert">{error}</p> : null}
        <footer className="jc-launch-actions">
          <button type="button" className="jc-button" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="button" className="jc-button primary" onClick={() => void create()} disabled={!selected?.ready || pending}>
            {pending ? "Opening…" : `Open with ${selected?.runtime.displayName ?? "…"}`}
          </button>
        </footer>
      </section>
    </div>
  );
}
