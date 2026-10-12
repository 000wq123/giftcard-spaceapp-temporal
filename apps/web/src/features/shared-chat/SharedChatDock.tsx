import { Keyboard, MessageSquare, MessageSquareX, Send, X } from "../ui-theme/app-icons.js";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { SharedChatMessage } from "@space/contracts";
import {
  convertTextRange,
  createGreekInputState,
  detectKeyboardLayoutMismatch,
  handleEnglishKeyInput,
  handleGreekKeyInput,
  insertTextAtCursor,
  type LayoutMismatchDetection
} from "../agent-pane/greek-layout-converter.js";
import {
  isComposerLayoutIconVisible,
  isComposerSuggestionBarVisible,
  playLayoutSuggestionBeep,
  useKeyboardAutocorrectSettings
} from "../keyboard-autocorrect/keyboard-autocorrect-settings.js";
import { api } from "../../api.js";
import { getSpaceRuntime } from "../../runtime/SpaceRuntime.js";
import { cliRuntimePresentation } from "../../cli-runtime-presentation.js";
import { useIsDockActive } from "../docks/dock-active-context.js";
import {
  DockButton,
  DockIconButton,
  DockNotice,
  DockState,
  DockToolbar,
  useDockConfirm
} from "../dock-kit/DockKit.js";
import "./shared-chat.css";

/** Messages kept in memory; the server keeps the full history in the audit file. */
const MESSAGE_LIMIT = 500;
/** Reconnect delays double from 1 s and stop growing at 30 s. */
export const SHARED_CHAT_RECONNECT_BASE_MS = 1_000;
export const SHARED_CHAT_RECONNECT_MAX_MS = 30_000;
const LAYOUT_CHECK_DELAY_MS = 150;
/** How close to the bottom (px) still counts as "following" the conversation. */
const STICK_TO_BOTTOM_PX = 72;

function messageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
}

function runtimePresentationFor(message: SharedChatMessage) {
  const runtimeId = message.metadata?.runtimeId;
  if (!runtimeId || typeof runtimeId !== "string") return undefined;
  return cliRuntimePresentation(runtimeId);
}

function senderLabelFor(message: SharedChatMessage): string {
  if (message.senderType === "user") return "You";
  if (message.senderType === "system") return "System";
  return message.senderLabel;
}

const senderRank: Record<SharedChatMessage["senderType"], number> = { user: 0, agent: 1, system: 2 };

function messageTimeValue(message: SharedChatMessage): number {
  const value = Date.parse(message.createdAt);
  return Number.isNaN(value) ? 0 : value;
}

function compareMessages(left: SharedChatMessage, right: SharedChatMessage): number {
  const timeDifference = messageTimeValue(left) - messageTimeValue(right);
  if (timeDifference !== 0) return timeDifference;
  const rankDifference = senderRank[left.senderType] - senderRank[right.senderType];
  if (rankDifference !== 0) return rankDifference;
  return left.id.localeCompare(right.id);
}

/**
 * Oldest first, one entry per message id. The send response and the live
 * broadcast both deliver the sender's own message, so every path merges here.
 */
export function mergeSharedChatMessages(
  current: readonly SharedChatMessage[],
  incoming: readonly SharedChatMessage[]
): SharedChatMessage[] {
  const byId = new Map<string, SharedChatMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  const merged = Array.from(byId.values()).sort(compareMessages);
  return merged.length > MESSAGE_LIMIT ? merged.slice(merged.length - MESSAGE_LIMIT) : merged;
}


/** null until the first load finishes, so a remount knows whether to show loading. */
let cachedSharedChatMessages: SharedChatMessage[] | null = null;
let cachedSharedChatDraft = "";

export function SharedChatDock() {
  const runtime = getSpaceRuntime();
  const isDockActive = useIsDockActive();
  const { confirm, confirmDialog } = useDockConfirm();
  const [messages, setMessages] = useState<SharedChatMessage[]>(() => cachedSharedChatMessages ?? []);
  const [hasLoaded, setHasLoaded] = useState(() => cachedSharedChatMessages !== null);
  const [draft, setDraft] = useState(() => cachedSharedChatDraft);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [layoutSuggestion, setLayoutSuggestion] = useState<LayoutMismatchDetection | null>(null);
  const [typingLayoutMode, setTypingLayoutMode] = useState<"el" | "en" | null>(null);
  const greekInputStateRef = useRef(createGreekInputState(false));
  const layoutCheckTimerRef = useRef<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const followBottomRef = useRef(true);
  const { settings: autocorrectSettings } = useKeyboardAutocorrectSettings();
  const prevLayoutSuggestionRef = useRef(false);
  // Messages that arrived live (send response or broadcast), numbered in arrival
  // order, so a refresh that started earlier does not drop them.
  const arrivalSequenceRef = useRef(0);
  const arrivalsRef = useRef(new Map<string, number>());

  const receiveLive = useCallback((message: SharedChatMessage) => {
    arrivalsRef.current.set(message.id, ++arrivalSequenceRef.current);
    if (arrivalsRef.current.size > MESSAGE_LIMIT) {
      const oldest = arrivalsRef.current.keys().next().value;
      if (oldest !== undefined) arrivalsRef.current.delete(oldest);
    }
    setMessages((current) => mergeSharedChatMessages(current, [message]));
  }, []);

  const forgetMessages = useCallback(() => {
    arrivalsRef.current.clear();
    cachedSharedChatMessages = [];
    setMessages([]);
  }, []);

  /** Every draft change goes through here so a remount restores the same text. */
  const updateDraft = useCallback((value: string) => {
    cachedSharedChatDraft = value;
    setDraft(value);
  }, []);

  useEffect(() => {
    if (hasLoaded) cachedSharedChatMessages = messages;
  }, [hasLoaded, messages]);

  const setTypingMode = useCallback((mode: "el" | "en" | null) => {
    setTypingLayoutMode(mode);
    greekInputStateRef.current.enabled = mode === "el";
    if (mode) {
      try {
        const desktop = (window as any).spaceDesktop;
        if (typeof desktop?.switchKeyboardLayout === "function") {
          desktop.switchKeyboardLayout(mode).catch(() => {});
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (layoutSuggestion && !prevLayoutSuggestionRef.current) {
      if (autocorrectSettings.enabled && autocorrectSettings.soundEnabled) {
        playLayoutSuggestionBeep();
      }
    }
    prevLayoutSuggestionRef.current = Boolean(layoutSuggestion);
  }, [layoutSuggestion, autocorrectSettings.enabled, autocorrectSettings.soundEnabled]);

  useEffect(() => {
    if (!autocorrectSettings.enabled) setLayoutSuggestion(null);
  }, [autocorrectSettings.enabled]);

  const cancelLayoutCheck = useCallback(() => {
    if (layoutCheckTimerRef.current !== null) {
      window.clearTimeout(layoutCheckTimerRef.current);
      layoutCheckTimerRef.current = null;
    }
  }, []);

  useEffect(() => cancelLayoutCheck, [cancelLayoutCheck]);

  const refresh = useCallback(async () => {
    const startedAfter = arrivalSequenceRef.current;
    try {
      const result = await api.sharedChatMessages({ limit: 100 });
      const pageIds = new Set(result.data.map((message) => message.id));
      // The server page is the truth; keep only live messages that arrived while it was read.
      setMessages((current) => mergeSharedChatMessages(result.data, current.filter((message) =>
        !pageIds.has(message.id) && (arrivalsRef.current.get(message.id) ?? 0) > startedAfter)));
      setLoadError(null);
      setHasLoaded(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "The shared chat could not be loaded.");
      setHasLoaded(true);
    }
  }, []);

  // Live updates only while the dock is visible. Becoming visible again
  // refetches what was missed; an unexpected close reconnects with backoff.
  useEffect(() => {
    if (!isDockActive) return;
    void refresh();
    if (runtime.kind !== "live") return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      reconnectTimer = null;
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
      const next = new WebSocket(`${protocol}${window.location.host}/api/shared-chat/live`);
      socket = next;
      next.onopen = () => {
        if (disposed || socket !== next) return;
        if (attempt > 0) void refresh();
        attempt = 0;
      };
      next.onmessage = (event) => {
        if (disposed || socket !== next) return;
        try {
          const parsed = JSON.parse(String(event.data)) as { type: string; message?: SharedChatMessage };
          if (parsed.type === "message" && parsed.message) {
            receiveLive(parsed.message);
          } else if (parsed.type === "clear") {
            forgetMessages();
            void refresh();
          }
        } catch {
          // Ignore malformed frames.
        }
      };
      next.onclose = () => {
        if (disposed || socket !== next) return;
        socket = null;
        const delay = Math.min(SHARED_CHAT_RECONNECT_MAX_MS, SHARED_CHAT_RECONNECT_BASE_MS * 2 ** attempt);
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      const current = socket;
      socket = null;
      current?.close();
    };
  }, [isDockActive, runtime.kind, refresh, receiveLive, forgetMessages]);

  const lastMessageId = messages.at(-1)?.id ?? null;
  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || !followBottomRef.current) return;
    transcript.scrollTop = transcript.scrollHeight;
  }, [lastMessageId, messages.length, isDockActive]);

  function scheduleLayoutCheck(value: string) {
    cancelLayoutCheck();
    if (!autocorrectSettings.enabled || !value.trim()) {
      setLayoutSuggestion(null);
      return;
    }
    layoutCheckTimerRef.current = window.setTimeout(() => {
      layoutCheckTimerRef.current = null;
      const detection = detectKeyboardLayoutMismatch(value);
      const isLangSupported = (detection.direction === "toGreek" && autocorrectSettings.supportedLanguages.includes("el")) ||
        (detection.direction === "toQwerty" && autocorrectSettings.supportedLanguages.includes("en"));
      setLayoutSuggestion(detection.hasMismatch && detection.confidence >= 0.85 && isLangSupported ? detection : null);
    }, LAYOUT_CHECK_DELAY_MS);
  }

  function convertDraftLayout(textarea: HTMLTextAreaElement | null) {
    cancelLayoutCheck();
    if (layoutSuggestion || draft.trim()) {
      const converted = layoutSuggestion
        ? layoutSuggestion.convertedText
        : convertTextRange(draft, textarea?.selectionStart ?? 0, textarea?.selectionEnd ?? 0, "toggle").newText;
      const changed = converted !== draft;
      updateDraft(converted);
      setLayoutSuggestion(null);
      if (changed) {
        setTypingMode(/[\u0370-\u03FF]/.test(converted) ? "el" : "en");
      } else {
        setTypingMode(typingLayoutMode === "el" ? "en" : "el");
      }
    } else {
      setTypingMode(typingLayoutMode === "el" ? "en" : "el");
    }
  }

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    let content = draft.trim();
    const layoutCheck = detectKeyboardLayoutMismatch(content);
    if (layoutCheck.hasMismatch && layoutCheck.confidence >= 0.90 && layoutCheck.direction === "toGreek") {
      content = layoutCheck.convertedText.trim();
    }
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await api.sendSharedChatMessage({ senderLabel: "operator", content, kind: "message", metadata: {} });
      cancelLayoutCheck();
      updateDraft("");
      setLayoutSuggestion(null);
      followBottomRef.current = true;
      receiveLive(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const clearRoom = async () => {
    const accepted = await confirm({
      title: "Clear the Shared Chat?",
      message: "The conversation is cleared for everyone in the room. The audit file keeps the full history.",
      confirmLabel: "Clear chat"
    });
    if (!accepted) return;
    setClearing(true);
    setError(null);
    try {
      await api.clearSharedChat();
      forgetMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The shared chat could not be cleared.");
    } finally {
      setClearing(false);
    }
  };

  const messageCount = messages.length;

  return (
    <section className="dock-panel shared-chat-dock" aria-label="Shared chat">
      <DockToolbar
        className="shared-chat-toolbar"
        summary={<>You and every AI in the room{hasLoaded ? <> · <strong>{messageCount.toLocaleString()}</strong> message{messageCount === 1 ? "" : "s"}</> : null}</>}
      >
        <DockIconButton
          label="Clear Shared Chat"
          icon={MessageSquareX}
          tone="danger"
          onClick={() => void clearRoom()}
          disabled={clearing || messageCount === 0}
          busy={clearing}
        />
      </DockToolbar>

      {loadError && messageCount ? <DockNotice onDismiss={() => setLoadError(null)}>{loadError}</DockNotice> : null}

      <div
        className="shared-chat-transcript"
        ref={transcriptRef}
        role="log"
        aria-label="Shared Chat transcript"
        onScroll={(event) => {
          const element = event.currentTarget;
          followBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= STICK_TO_BOTTOM_PX;
        }}
      >
        {messageCount === 0 ? (
          !hasLoaded ? (
            <DockState kind="loading" title="Loading the shared chat…" />
          ) : loadError ? (
            <DockState kind="error" title="The shared chat could not be loaded" detail={loadError}
              action={{ label: "Try again", onClick: () => void refresh() }} />
          ) : (
            <DockState
              kind="empty"
              icon={MessageSquare}
              title="No messages yet"
              detail="Write below and every agent in the room wakes up and replies. Deepseek joins only when you mention @deepseek."
            />
          )
        ) : (
          messages.map((message) => {
            const presentation = message.senderType === "agent" ? runtimePresentationFor(message) : undefined;
            return message.kind === "reaction" ? (
              <article key={message.id} className="shared-chat-message is-system">
                <header>
                  <strong>
                    {senderLabelFor(message)} {message.content}
                  </strong>
                  <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                </header>
              </article>
            ) : (
              <article key={message.id} className={`shared-chat-message is-${message.senderType}`}>
                <header>
                  <span className="shared-chat-sender">
                    {presentation ? (
                      <img
                        className="shared-chat-agent-icon"
                        src={presentation.iconSrc}
                        alt={presentation.shortLabel}
                        title={presentation.displayName}
                      />
                    ) : null}
                    <strong>{senderLabelFor(message)}</strong>
                    {presentation ? <small className="shared-chat-runtime-tag">{presentation.shortLabel}</small> : null}
                  </span>
                  <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                </header>
                <p>{message.content}</p>
              </article>
            );
          })
        )}
      </div>

      {error ? <DockNotice className="shared-chat-error" onDismiss={() => setError(null)}>{error}</DockNotice> : null}

      <form className="shared-chat-composer" onSubmit={(event) => void send(event)}>
        <label htmlFor="shared-chat-message">Message the room</label>
        {layoutSuggestion && isComposerSuggestionBarVisible(autocorrectSettings) ? (
          <div className="codex-layout-suggestion" role="status" aria-live="polite">
            <Keyboard aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span className="codex-layout-suggestion-label">
              Wrong layout? Convert to: <strong>{layoutSuggestion.convertedText.length > 40 ? layoutSuggestion.convertedText.slice(0, 40) + "…" : layoutSuggestion.convertedText}</strong>
            </span>
            <button
              type="button"
              className="codex-layout-apply-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                updateDraft(layoutSuggestion.convertedText);
                setLayoutSuggestion(null);
                setTypingMode(/[\u0370-\u03FF]/.test(layoutSuggestion.convertedText) ? "el" : "en");
                composerRef.current?.focus();
              }}
              title="Apply layout conversion (Alt+G)"
            >
              Fix (Alt+G)
            </button>
            <button
              type="button"
              className="codex-layout-dismiss-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setLayoutSuggestion(null)}
              aria-label="Dismiss layout suggestion"
              title="Dismiss"
            >
              <X aria-hidden="true" style={{ width: 14, height: 14 }} />
            </button>
          </div>
        ) : null}
        <textarea
          id="shared-chat-message"
          ref={composerRef}
          value={draft}
          onChange={(event) => {
            const value = event.target.value;
            updateDraft(value);
            scheduleLayoutCheck(value);
          }}
          onKeyDown={(event) => {
            const isGKey = event.code === "KeyG" || event.key.toLowerCase() === "g" || event.key === "γ" || event.key === "Γ" || event.key === "©";
            if (autocorrectSettings.enabled && (event.altKey || (event.ctrlKey && event.shiftKey)) && isGKey) {
              event.preventDefault();
              convertDraftLayout(event.currentTarget);
              return;
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send(event);
              return;
            }
            if (typingLayoutMode === "el" && greekInputStateRef.current.enabled && composerRef.current) {
              const textarea = composerRef.current;
              const handled = handleGreekKeyInput(event, greekInputStateRef.current, (char) => {
                insertTextAtCursor(textarea, char);
                updateDraft(textarea.value);
              });
              if (handled) return;
            } else if (typingLayoutMode === "en" && composerRef.current) {
              const textarea = composerRef.current;
              const handled = handleEnglishKeyInput(event, (char) => {
                insertTextAtCursor(textarea, char);
                updateDraft(textarea.value);
              });
              if (handled) return;
            }
          }}
          placeholder="Message every agent in the room… Mention @deepseek to include Deepseek."
          rows={3}
          maxLength={20_000}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
          data-gramm="false"
          data-enable-grammarly="false"
        />
        <div className="shared-chat-composer-actions">
          {isComposerLayoutIconVisible(autocorrectSettings) ? (
            <button
              type="button"
              className={`codex-layout-toggle ${layoutSuggestion ? "has-suggestion" : ""} ${typingLayoutMode === "el" ? "is-greek-active" : ""} ${typingLayoutMode === "en" ? "is-english-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const textarea = composerRef.current;
                convertDraftLayout(textarea);
                textarea?.focus();
              }}
              title={
                layoutSuggestion
                  ? `Fix layout: "${layoutSuggestion.convertedText}" (Alt+G)`
                  : typingLayoutMode === "el"
                    ? "Keyboard layout: Greek (EL) active · Press Alt+G to switch to English"
                    : typingLayoutMode === "en"
                      ? "Keyboard layout: English (EN) active · Press Alt+G to switch to Greek"
                      : "Fix keyboard layout (Alt+G) · Convert EN ⇄ EL"
              }
              aria-label="Fix keyboard layout (Alt+G)"
            >
              <Keyboard aria-hidden="true" />
              {typingLayoutMode === "el" ? (
                <span className="codex-layout-badge" aria-label="Greek layout active">EL</span>
              ) : typingLayoutMode === "en" ? (
                <span className="codex-layout-badge is-en" aria-label="English layout active">EN</span>
              ) : null}
            </button>
          ) : null}
          <small>Every message is kept in the audit file.</small>
          <DockButton type="submit" tone="primary" icon={Send} busy={sending} className="shared-chat-send" disabled={sending || !draft.trim()}>
            Send
          </DockButton>
        </div>
      </form>
      {confirmDialog}
    </section>
  );
}
