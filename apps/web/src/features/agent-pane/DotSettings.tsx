import { useState, type FormEvent } from "react";
import type { DotProfile } from "@space/contracts";
import { api } from "../../api.js";
import { Settings2, X } from "../ui-theme/app-icons.js";
import { DotEvaluationSection } from "./DotEvaluation.js";

/** Name, voice and work limit of one Dot. Permissions always follow the user's own. */
export function DotSettingsDialog({ dot, roomId, onClose, onSaved, update = api.updateDot }: {
  dot: DotProfile; roomId?: string; onClose: () => void; onSaved: (dot: DotProfile) => void;
  update?: typeof api.updateDot;
}) {
  const [name, setName] = useState(dot.name);
  const [style, setStyle] = useState(dot.preferences.communicationStyle ?? "");
  const [language, setLanguage] = useState(dot.preferences.language ?? "");
  const [maxTasks, setMaxTasks] = useState(dot.workLimits.maxConcurrentTasks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedLanguage = language.trim();
  const valid = name.trim().length >= 1 && name.trim().length <= 80 && style.length <= 2000
    && (trimmedLanguage.length === 0 || (trimmedLanguage.length >= 2 && trimmedLanguage.length <= 80));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || pending) return;
    setPending(true); setError(null);
    try {
      // Empty values clear a preference; the server merges preferences field by field.
      const preferences = { communicationStyle: style.trim(), language: trimmedLanguage };
      const { dot: saved } = await update(dot.dotId, { name: name.trim(), preferences,
        workLimits: { ...dot.workLimits, maxConcurrentTasks: maxTasks } });
      if (saved.dotId !== dot.dotId) throw Error("Dot identity mismatch.");
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The settings could not be saved.");
    } finally { setPending(false); }
  }
  return <div className="attachment-modal codex-resume-modal" onClick={() => { if (!pending) onClose(); }}>
    <section className="attachment-modal-body codex-resume-modal-body dots-settings-dialog" role="dialog" aria-modal="true" aria-label={`${dot.name} settings`}
      onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape" && !pending) onClose(); }}>
      <button type="button" className="terminal-upload-modal-close codex-resume-modal-close" aria-label="Close Dot settings" disabled={pending} onClick={onClose}>
        <X aria-hidden="true" />
      </button>
      <div className="codex-resume-modal-header">
        <span className="terminal-upload-modal-label codex-resume-modal-label"><Settings2 aria-hidden="true" />Dot</span>
        <strong>{dot.name} settings</strong>
        <small>{dot.name} always acts with your own permissions. These settings change how it talks and how much work it runs at once.</small>
      </div>
      <form className="codex-goal-editor dots-settings-form" onSubmit={(event) => void submit(event)}>
        <label><span>Name</span>
          <input aria-label="Dot name" autoFocus value={name} maxLength={80} disabled={pending} onChange={(event) => setName(event.currentTarget.value)} /></label>
        <label><span>Communication style (optional)</span>
          <textarea aria-label="Communication style" rows={3} value={style} maxLength={2000} disabled={pending}
            placeholder="For example: brief, direct, with a summary first" onChange={(event) => setStyle(event.currentTarget.value)} /></label>
        <label><span>Reply language (optional)</span>
          <input aria-label="Reply language" value={language} maxLength={80} disabled={pending} placeholder="Same as my messages"
            onChange={(event) => setLanguage(event.currentTarget.value)} /></label>
        <div className="dots-settings-limit" role="group" aria-label="Tasks at once">
          <span>Tasks at once</span>
          <div className="dots-settings-limit-options">
            {[1, 2, 3, 4, 5, 6].map((value) => <button key={value} type="button" aria-pressed={maxTasks === value} disabled={pending}
              onClick={() => setMaxTasks(value)}>{value}</button>)}
          </div>
          <small>Goals and schedules wait for a free slot. Your own messages are never refused.</small>
        </div>
        {trimmedLanguage.length === 1 ? <p role="alert">Use at least two characters for the language.</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <div>
          <button type="button" disabled={pending} onClick={onClose}>Cancel</button>
          <button type="submit" disabled={pending || !valid}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
      {roomId ? <DotEvaluationSection dot={dot} roomId={roomId} /> : null}
    </section>
  </div>;
}
