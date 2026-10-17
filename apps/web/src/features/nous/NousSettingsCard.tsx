import { useEffect, useState } from "react";
import type { NousSettings } from "@space/contracts";
import { api } from "../../api.js";
import { DockNotice } from "../dock-kit/DockKit.js";
import { readNousFocusEnabled, writeNousFocusEnabled } from "../nous-focus/nous-focus-events.js";
import { SpaceToggle } from "../ui-controls/SpaceToggle.js";

/** Nous's switches, shared by the Nous dock and Settings → Assistants & AI → Nous; the last one is kept on this device. */
export function NousSettingsToggles({ settings, onChange, compact = false, className }: {
  settings: NousSettings | null; onChange(patch: Partial<NousSettings>): void; compact?: boolean; className?: string;
}) {
  const [focusEnabled, setFocusEnabled] = useState(readNousFocusEnabled);
  return (
    <>
      <SpaceToggle compact={compact} className={className} label="Work on my behalf" ariaLabel="Nous works on my behalf"
        detail="Nous answers panes and copilots in every room, moves the plans on and holds your notifications. Releases, irreversible actions and anything to third parties still come to you."
        checked={Boolean(settings?.enabled)} disabled={!settings} onChange={(enabled) => onChange({ enabled })} />
      <SpaceToggle compact={compact} className={className} label="May promote dev to stable" ariaLabel="Nous may promote dev to stable"
        detail="Nous batches finished work and promotes dev to stable without asking you. Hotfixes, npm releases and queue control stay yours."
        checked={Boolean(settings?.mayPromote)} disabled={!settings} onChange={(mayPromote) => onChange({ mayPromote })} />
      <SpaceToggle compact={compact} className={className} label="May approve Warm changes" ariaLabel="Nous may approve Warm changes"
        detail="Nous approves changes to the protected Warm code after reading them; the tests and the real-browser performance check stay required."
        checked={Boolean(settings?.mayApproveWarm)} disabled={!settings} onChange={(mayApproveWarm) => onChange({ mayApproveWarm })} />
      <SpaceToggle compact={compact} className={className} label="Bring me to panes that need me" ariaLabel="Nous brings me to panes that need me"
        detail="When a pane needs your hands, Nous offers to switch to it, maximizes it and brings you back when it is done. On this device."
        checked={focusEnabled} onChange={(enabled) => { writeNousFocusEnabled(enabled); setFocusEnabled(enabled); }} />
    </>
  );
}

/** Settings → Assistants & AI → Nous: the same switches as the dock, saved to the signed-in operator's Nous settings. */
export function NousSettingsCard() {
  const [settings, setSettings] = useState<NousSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.nous().then(({ state }) => { if (!cancelled) setSettings(state.settings); })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Nous settings could not be loaded."); });
    return () => { cancelled = true; };
  }, []);

  const save = (patch: Partial<NousSettings>) => {
    setError(null);
    void api.updateNousSettings(patch).then((result) => setSettings(result.settings))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "The setting could not be saved."));
  };

  return (
    <section className="agent-settings-card settings-flat-card" aria-label="Nous settings" aria-busy={!settings && !error}>
      <NousSettingsToggles settings={settings} onChange={save} className="settings-flat-row settings-flat-toggle-row" />
      {error ? <DockNotice onDismiss={() => setError(null)}>{error}</DockNotice> : null}
    </section>
  );
}
