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
import { useCliAccountBalance } from "./cli-account-balance.js";
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
  // Session-level balancing: Auto starts the pane on the account with the most room and moves it on when that
  // account runs out. Present for CLIs Space balances.
  auto?: { active: boolean; onSelect: () => void };
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
  auto,
}: CliAccountPickerProps) {
  const [open, setOpen] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { quota, identities, load: loadSignals } = useCliAccountSignals();
  // CLIs Space balances (those offering Auto) report each account's quota and Auto's next pick through the balance.
  const { balance, load: loadBalance } = useCliAccountBalance(auto ? runtimeId : null);
  const load = (options?: Parameters<typeof loadSignals>[0]) => {
    loadSignals(options);
    loadBalance();
  };
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
      plan: cliAccountPlan(runtimeId, profile.profileId, quota, balance),
      availability: cliAccountAvailability({ runtimeId, profileId: profile.profileId, quota, identity, clock, modelGroup, balance }),
    };
  }), [balance, clock, identities, modelGroup, profiles, quota, runtimeId]);
  const activeRow = Math.max(0, rows.findIndex((row) => row.profile.profileId === selectedProfileId));
  const active = rows[activeRow];
  // The Auto entry, when offered, comes first in the menu; item refs and keyboard moves count it.
  const offset = auto ? 1 : 0;
  const itemCount = rows.length + offset;
  const activeIndex = auto?.active ? 0 : activeRow + offset;
  const readyCount = rows.filter((row) => row.availability.tone === "ready" || row.availability.tone === "neutral").length;
  const autoNext = auto && balance?.runtimeId === runtimeId ? rows.find((row) => row.profile.profileId === balance.next) ?? null : null;

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
      itemRefs.current[(index + itemCount) % itemCount]?.focus();
    };
    switch (event.key) {
      case "ArrowDown": move(focusedIndex < 0 ? activeIndex : focusedIndex + 1); break;
      case "ArrowUp": move(focusedIndex < 0 ? activeIndex : focusedIndex - 1); break;
      case "Home": move(0); break;
      case "End": move(itemCount - 1); break;
      case "Tab":
        closeMenu(false);
        break;
      default:
        break;
    }
  }

  const triggerAvailability: CliAccountAvailability | undefined = active?.availability;
  const activeName = `${auto?.active ? "Auto, now " : ""}${active?.profile.displayName ?? "Select account"}`;

  function chooseAuto() {
    closeMenu(true);
    if (!auto?.active) auto?.onSelect();
  }

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
            {auto ? (
              <button
                ref={(element) => {
                  itemRefs.current[0] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={auto.active}
                className={`cli-account-menu-item cli-account-auto-item${auto.active ? " is-active" : ""}`}
                data-tone="neutral"
                title="Space starts this pane on the account with the most room and moves it to another account when this one runs out"
                tabIndex={auto.active ? 0 : -1}
                onClick={chooseAuto}
              >
                <span className="cli-account-auto-mark" aria-hidden="true">A</span>
                <span className="cli-account-menu-item-main">
                  <span className="cli-account-menu-item-name">
                    <strong>Auto (Space Gateway)</strong>
                    {auto.active ? <span className="cli-account-active-pill">Active</span> : null}
                  </span>
                  <small className="cli-account-menu-item-detail">
                    {auto.active && active
                      ? `Now on ${active.profile.displayName}; moves on when it runs out`
                      : autoNext
                        ? `Would start on ${autoNext.profile.displayName}, the most room; moves on when it runs out`
                        : "Most room first; moves on when an account runs out"}
                  </small>
                </span>
              </button>
            ) : null}
            {rows.map((row, rowIndex) => {
              const index = rowIndex + offset;
              const isActive = index === activeIndex;
              const inUse = Boolean(auto?.active) && rowIndex === activeRow;
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
                      {inUse ? <span className="cli-account-active-pill">In use</span> : null}
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
