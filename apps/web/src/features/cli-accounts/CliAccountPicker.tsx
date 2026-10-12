import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { CliAccountProfile } from "@space/contracts";
import { shouldPreserveForSnipTool } from "../snip-tool/snip-guard.js";
import {
  antigravityModelGroup,
  cliAccountAvailability,
  cliAccountPlan,
  type CliAccountAvailability,
  type CliAccountRuntimeId,
} from "./cli-account-availability.js";
import { accountColorStyle, CliAccountAvatar, CliAccountColorLegend, CliAccountMeter } from "./CliAccountVisuals.js";
import { useCliAccountSignals } from "./use-cli-account-signals.js";

interface CliAccountPickerProps {
  runtimeId: CliAccountRuntimeId;
  // "Google", "Claude", "GitHub" or "Cursor": names the trigger and the menu.
  providerLabel: string;
  icon: ReactNode;
  paneTitle: string;
  profiles: CliAccountProfile[];
  selectedProfileId: string;
  disabled?: boolean;
  onSelect: (profileId: string) => void;
  // The pane's active model; Antigravity judges each account by that model group's quota.
  modelId?: string | null;
}

const minimumMenuHeightPx = 150;

// One click on the trigger lists every account of this CLI with its availability; one
// more click switches the pane. The active account is marked in the list and named in the tooltip.
export function CliAccountPicker({
  runtimeId,
  providerLabel,
  icon,
  paneTitle,
  profiles,
  selectedProfileId,
  disabled = false,
  onSelect,
  modelId = null,
}: CliAccountPickerProps) {
  const [open, setOpen] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { quota, identities, load } = useCliAccountSignals();
  const menuId = useId();
  const label = `${providerLabel} account for ${paneTitle}`;

  const clock = open ? Date.now() : Math.floor(Date.now() / 60_000) * 60_000;
  const modelGroup = runtimeId === "cli:gemini" ? antigravityModelGroup(modelId) : null;
  const rows = useMemo(() => profiles.map((profile) => {
    const identity = identities?.find((candidate) => candidate.runtimeId === runtimeId && candidate.profileId === profile.profileId) ?? null;
    return {
      profile,
      email: identity?.email ?? null,
      login: identity?.login ?? null,
      plan: cliAccountPlan(runtimeId, profile.profileId, quota),
      availability: cliAccountAvailability({ runtimeId, profileId: profile.profileId, quota, identity, clock, modelGroup }),
    };
  }), [clock, identities, modelGroup, profiles, quota, runtimeId]);
  const activeIndex = Math.max(0, rows.findIndex((row) => row.profile.profileId === selectedProfileId));
  const active = rows[activeIndex];
  const readyCount = rows.filter((row) => row.availability.tone === "ready" || row.availability.tone === "neutral").length;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (shouldPreserveForSnipTool(event)) return;
      const target = event.target;
      if (target instanceof Node && pickerRef.current?.contains(target)) return;
      setOpen(false);
    };
    // Escape closes this menu before any pane or app shortcut sees it.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => itemRefs.current[activeIndex]?.focus());
    return () => window.cancelAnimationFrame(frame);
    // Focus moves to the active account only when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function openMenu() {
    const missingIdentity = profiles.some((profile) => !identities?.some((candidate) =>
      candidate.runtimeId === runtimeId && candidate.profileId === profile.profileId));
    load({ forceIdentities: missingIdentity });
    // The list may use the pane's height below the trigger, never less than a few rows.
    const container = pickerRef.current?.offsetParent;
    const trigger = triggerRef.current;
    if (container instanceof HTMLElement && trigger) {
      const available = container.getBoundingClientRect().bottom - trigger.getBoundingClientRect().bottom - 14;
      setMenuMaxHeight(Number.isFinite(available) && available > 0 ? Math.max(minimumMenuHeightPx, Math.round(available)) : null);
    }
    setOpen(true);
  }

  function closeMenu(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function choose(profileId: string) {
    closeMenu(true);
    if (profileId !== selectedProfileId) onSelect(profileId);
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const focusedIndex = itemRefs.current.findIndex((item) => item === document.activeElement);
    const move = (index: number) => {
      event.preventDefault();
      itemRefs.current[(index + rows.length) % rows.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown": move(focusedIndex < 0 ? activeIndex : focusedIndex + 1); break;
      case "ArrowUp": move(focusedIndex < 0 ? activeIndex : focusedIndex - 1); break;
      case "Home": move(0); break;
      case "End": move(rows.length - 1); break;
      case "Tab":
        closeMenu(false);
        break;
      default:
        break;
    }
  }

  const triggerAvailability: CliAccountAvailability | undefined = active?.availability;
  const activeName = active?.profile.displayName ?? "Select account";

  return (
    <div ref={pickerRef} className="terminal-gemini-account-picker cli-account-picker" data-runtime-id={runtimeId}>
      <button
        ref={triggerRef}
        type="button"
        className={`terminal-gemini-account-trigger${open ? " is-open" : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={`${providerLabel} account: ${activeName}${triggerAvailability ? ` · ${triggerAvailability.description}` : ""}`}
        disabled={disabled}
        onPointerEnter={() => load()}
        onFocus={() => load()}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !open) {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        {icon}
      </button>
      {open ? (
        <div
          id={menuId}
          className="terminal-gemini-account-popover cli-account-menu"
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="cli-account-menu-head">
            <span className="cli-account-menu-icon" aria-hidden="true">{icon}</span>
            <span className="cli-account-menu-title">
              <strong>{providerLabel} account</strong>
              <small>
                {readyCount} of {rows.length} available now
                {modelGroup ? ` · ${modelGroup === "gemini" ? "Gemini" : "Claude · GPT"} quota` : ""}
              </small>
            </span>
          </div>
          <div className="cli-account-menu-list" style={menuMaxHeight ? { maxHeight: `${menuMaxHeight - 82}px` } : undefined}>
            {rows.map((row, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={row.profile.profileId}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  className={`cli-account-menu-item${isActive ? " is-active" : ""}`}
                  data-tone={row.availability.tone}
                  style={accountColorStyle(row.availability)}
                  title={`${row.profile.displayName}${row.email ? ` · ${row.email}` : row.login ? ` · @${row.login}` : ""} · ${row.availability.description}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => choose(row.profile.profileId)}
                >
                  <CliAccountAvatar name={row.profile.displayName} availability={row.availability} active={isActive} />
                  <span className="cli-account-menu-item-main">
                    <span className="cli-account-menu-item-name">
                      <strong>{row.profile.displayName}</strong>
                      {row.plan ? <span className="cli-account-plan-badge" title={`Plan: ${row.plan}`}>{row.plan}</span> : null}
                      {isActive ? <span className="cli-account-active-pill">Active</span> : null}
                    </span>
                    <small className="cli-account-menu-item-detail" data-sensitive-masked={row.email || row.login ? "manual" : undefined}>
                      {row.email ?? (row.login ? `@${row.login}` : row.availability.description)}
                    </small>
                    <CliAccountMeter availability={row.availability} />
                  </span>
                  <span className="cli-account-menu-item-status">{row.availability.label}</span>
                </button>
              );
            })}
          </div>
          <div className="cli-account-menu-foot">
            <CliAccountColorLegend />
          </div>
        </div>
      ) : null}
    </div>
  );
}
