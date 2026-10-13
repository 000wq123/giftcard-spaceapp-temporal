import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "../ui-theme/app-icons.js";
import "./settings-disclosure.css";

/** Opens the section with this key; a new nonce opens it again (for example from a Dot pane). */
export interface SettingsSectionRequest { key: string; nonce: number }
// Each request opens its section once: Settings remounts every time it opens, and an old request must not replay.
const handledRequests = new Map<string, number>();
/** True the first time this request is seen for `key`. */
export function claimSettingsRequest(key: string, nonce: number): boolean {
  if (handledRequests.get(key) === nonce) return false;
  handledRequests.set(key, nonce);
  return true;
}
const SectionsContext = createContext<{
  active: string | null | undefined;
  setActive: (id: string | null) => void;
  request: SettingsSectionRequest | null;
} | null>(null);

export function SettingsSections({ children, request = null }: { children: ReactNode; request?: SettingsSectionRequest | null }) {
  // `undefined` means no section has been interacted with yet; `null` means
  // the user explicitly closed the initially open section.
  const [active, setActive] = useState<string | null | undefined>(undefined);
  return <SectionsContext.Provider value={{ active, setActive, request }}>{children}</SectionsContext.Provider>;
}

/** Mount on first use; retain drafts when another section opens. */
export function SettingsDisclosure({ title, description, scope, icon: Icon, children, hidden = false, initialOpen = false, sectionKey }: {
  /** Lets a request (SettingsSections `request`) open this section. */
  sectionKey?: string;
  hidden?: boolean;
  initialOpen?: boolean;
  title: string;
  description: string;
  scope: "Your account" | "This browser" | "Selected pane" | "Installation" | "New sessions";
  icon: LucideIcon;
  children: ReactNode;
}) {
  const id = useId();
  const sections = useContext(SectionsContext);
  const [localOpen, setLocalOpen] = useState(initialOpen);
  const [visited, setVisited] = useState(initialOpen);
  const open = sections ? (sections.active === undefined ? initialOpen : sections.active === id) : localOpen;
  const sectionRef = useRef<HTMLElement>(null);
  const requestNonce = sections?.request?.key === sectionKey ? sections?.request?.nonce : undefined;
  useEffect(() => {
    if (!sectionKey || requestNonce === undefined || !claimSettingsRequest(`section:${sectionKey}`, requestNonce)) return;
    setVisited(true);
    if (sections) sections.setActive(id); else setLocalOpen(true);
    sectionRef.current?.scrollIntoView?.({ block: "start" });
  }, [requestNonce]);
  return (
    <section ref={sectionRef} className="settings-disclosure" data-open={open} data-section={sectionKey} hidden={hidden}>
      <h3>
        <button type="button" aria-label={title} aria-describedby={`${id}-description`} aria-expanded={open} aria-controls={id} onClick={() => {
          setVisited(true);
          if (sections) sections.setActive(open ? null : id);
          else setLocalOpen(!open);
        }}>
          <Icon aria-hidden="true" />
          <span><strong>{title}</strong><small id={`${id}-description`}>{description}</small></span>
          <ChevronRight aria-hidden="true" />
        </button>
      </h3>
      <div id={id} hidden={!open} className="settings-disclosure-content">
        {visited ? <><p className="settings-scope">Applies to: {scope}</p>{children}</> : null}
      </div>
    </section>
  );
}
