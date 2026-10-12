import { runRoomPlaybackCommand } from "./room-playback-control.js";
import { Bot, CircleStop, Keyboard, MessageSquareX, Pause, Play, Send, X } from "../ui-theme/app-icons.js";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Room, RoomAgentMissionSummary, RoomAgentSession, RoomAgentStatus } from "@space/contracts";
import { api } from "../../api.js";
import { useOptionalVoiceInput } from "../voice-input/VoiceInputProvider.js";
import { VoiceInputButton } from "../voice-input/VoiceInputButton.js";
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
import { useIsDockActive } from "../docks/dock-active-context.js";
import {
  DockButton,
  DockIconButton,
  DockNotice,
  DockState,
  DockToolbar,
  useDockConfirm
} from "../dock-kit/DockKit.js";
import "./room-agent-dock.css";


interface RoomAgentDockProps {
  activeRoom: Room | null;
  /** Kept for App compatibility; the Room Agent works whether or not the Codex CLI is enabled. */
  isCodexEnabled?: boolean;
  selectedBrowserPaneId?: string;
  refreshKey?: string | null;
}

function clientRequestId(): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `room-agent-web:${suffix}`;
}

function messageTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function durationLabel(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : null, minutes || hours ? `${minutes}m` : null, `${seconds}s`].filter(Boolean).join(" ");
}

function shortDurationLabel(value: number): string {
  return value < 1_000 ? "under 1s" : durationLabel(value);
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const statusLabels: Record<RoomAgentStatus, string> = {
  IDLE: "Ready",
  QUEUED: "Queued",
  RUNNING: "Running",
  PAUSED: "Paused",
  RECOVERING: "Recovering",
  BLOCKED: "Blocked"
};

const statusTones: Record<RoomAgentStatus, string> = {
  IDLE: "is-success",
  QUEUED: "is-accent",
  RUNNING: "is-accent",
  PAUSED: "is-warning",
  RECOVERING: "is-warning",
  BLOCKED: "is-danger"
};

function statusLabel(status: string): string {
  if (status in statusLabels) return statusLabels[status as RoomAgentStatus];
  const words = status.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function MissionReport({ summary }: { summary: RoomAgentMissionSummary }) {
  const successRate = Math.round(summary.successRate);
  const successTone = summary.totalTasks === 0 ? "" : successRate >= 80 ? " is-success" : successRate > 0 ? " is-warning" : " is-danger";
  const averageQuality = summary.averageQuality === null ? null : Math.round(summary.averageQuality);
  const minQuality = summary.minQuality === null ? null : Math.round(summary.minQuality);
  const maxQuality = summary.maxQuality === null ? null : Math.round(summary.maxQuality);
  const qualityRange = minQuality !== null && maxQuality !== null && minQuality !== maxQuality
    ? ` (lowest ${minQuality}, highest ${maxQuality})`
    : "";
  // Success counts only verified work; low-quality and unevaluated tasks are named, never counted as success.
  const needsReview = [
    summary.lowQualityTasks ? `${summary.lowQualityTasks} low quality` : null,
    summary.unevaluatedTasks ? `${summary.unevaluatedTasks} not evaluated` : null
  ].filter(Boolean).join(" · ");
  const rows: Array<[string, string]> = [
    ["Tasks done", `${summary.completedTasks}/${summary.totalTasks} completed`],
    ...(needsReview ? [["Needs review", needsReview] as [string, string]] : []),
    ["Total time", durationLabel(summary.totalMs)],
    ["Quality score", averageQuality === null ? "Not available yet" : `${averageQuality} / 100 on average${qualityRange}`],
    ["First reply", summary.averageFirstResponseMs === null ? "Not available yet" : `${shortDurationLabel(summary.averageFirstResponseMs)} on average`],
    ["Most at once", plural(summary.peakConcurrency, "task")],
    ["Retries", String(summary.retries)],
    ["Stalled", plural(summary.stalls, "time")],
    ["Blocked", plural(summary.blockedTasks, "task")]
  ];
  return (
    <section className="room-agent-report dock-kit-card is-accent" aria-label="Room Agent mission report">
      <div className="dock-kit-meta">
        <span className="dock-kit-card-title">Mission report</span>
        <span className={`dock-kit-badge${successTone}`}>{successRate}% verified</span>
      </div>
      <dl className="room-agent-report-stats">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const roomAgentSessionCache = new Map<string, RoomAgentSession>();

interface OptimisticTurn {
  clientRequestId: string;
  roomId: string;
  userMessage: {
    id: string;
    role: "user";
    content: string;
    status: "READY";
    createdAt: string;
  };
}

export function RoomAgentDock({
  activeRoom,
  selectedBrowserPaneId,
  refreshKey = null
}: RoomAgentDockProps) {
  const voiceInput = useOptionalVoiceInput();
  const voiceOwnerId = `room-agent:${activeRoom?.id ?? "none"}`;
  const isDockActive = useIsDockActive();
  const { confirm, confirmDialog } = useDockConfirm();
  const [session, setSession] = useState<RoomAgentSession | null>(() =>
    activeRoom?.id ? roomAgentSessionCache.get(activeRoom.id) ?? null : null
  );
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [optimisticTurns, setOptimisticTurns] = useState<OptimisticTurn[]>([]);
  const [stopping, setStopping] = useState(false);
  const [controlling, setControlling] = useState<"PAUSE" | "RESUME" | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layoutSuggestion, setLayoutSuggestion] = useState<LayoutMismatchDetection | null>(null);
  const layoutCheckTimerRef = useRef<number | null>(null);
  const [typingLayoutMode, setTypingLayoutMode] = useState<"el" | "en" | null>(null);
  const greekTypingMode = typingLayoutMode === "el";
  const greekInputStateRef = useRef(createGreekInputState(false));

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
  const { settings: autocorrectSettings } = useKeyboardAutocorrectSettings();
  const prevLayoutSuggestionRef = useRef(false);

  useEffect(() => {
    if (layoutSuggestion && !prevLayoutSuggestionRef.current) {
      if (autocorrectSettings.enabled && autocorrectSettings.soundEnabled) {
        playLayoutSuggestionBeep();
      }
    }
    prevLayoutSuggestionRef.current = Boolean(layoutSuggestion);
  }, [layoutSuggestion, autocorrectSettings.enabled, autocorrectSettings.soundEnabled]);

  useEffect(() => {
    if (!autocorrectSettings.enabled) {
      setLayoutSuggestion(null);
    }
  }, [autocorrectSettings.enabled]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const activeRoomIdRef = useRef<string | null>(activeRoom?.id ?? null);
  const loadSequenceRef = useRef(0);
  const sendSequenceRef = useRef(0);
  const latestAppliedSendRef = useRef(0);
  const stopSequenceRef = useRef(0);
  const controlSequenceRef = useRef(0);
  const clearSequenceRef = useRef(0);
  const pendingRequestsRef = useRef(new Map<string, { roomId: string; content: string; clientRequestId: string; selectedBrowserPaneId?: string; inFlight: boolean }>());
  const roomGenerationRef = useRef(0);
  activeRoomIdRef.current = activeRoom?.id ?? null;
  const voiceOwned = voiceInput?.ownerId === voiceOwnerId;
  const voiceDisabled = !activeRoom || session?.capabilities.canSend === false || !voiceInput?.settings.enabled ||
    !voiceInput.serverSettings?.enabled || voiceInput.settingsLoading ||
    Boolean(voiceInput.ownerId && !voiceOwned) ||
    Boolean(voiceOwned && voiceInput.status !== "recording");

  useEffect(() => () => voiceInput?.cancel(voiceOwnerId), [voiceInput?.cancel, voiceOwnerId]);
  useEffect(() => {
    if (!activeRoom) voiceInput?.cancel(voiceOwnerId);
  }, [activeRoom?.id, voiceInput?.cancel, voiceOwnerId]);
  const visibleMessages = useMemo(() => {
    const rawDbMessages = session?.messages.filter((message) => message.role === "user" || message.role === "assistant") ?? [];
    const currentOptMessages = optimisticTurns
      .filter((turn) => turn.roomId === activeRoom?.id)
      .map((turn) => turn.userMessage)
      .filter((opt) => !rawDbMessages.some((db) => db.role === "user" && db.content === opt.content && Boolean(db.createdAt) && Math.abs(new Date(db.createdAt!).getTime() - new Date(opt.createdAt).getTime()) < 10_000));

    const combined = [...rawDbMessages, ...currentOptMessages];

    return combined.sort((a, b) => {
      const parseTime = (val: string | null | undefined) => {
        if (!val) return 0;
        const t = Date.parse(val);
        return Number.isNaN(t) ? 0 : t;
      };
      const timeA = parseTime(a.createdAt);
      const timeB = parseTime(b.createdAt);
      if (timeA !== timeB) return timeA - timeB;
      const roleRank = (role: string) => (role === "user" ? 1 : role === "assistant" ? 2 : 3);
      const rankDiff = roleRank(a.role) - roleRank(b.role);
      if (rankDiff !== 0) return rankDiff;
      return a.id.localeCompare(b.id);
    });
  }, [session?.messages, optimisticTurns, activeRoom?.id]);


  const loadSession = useCallback(async (roomId: string, showLoading = false) => {
    const sequence = ++loadSequenceRef.current;
    if (showLoading) setLoading(true);
    try {
      const next = await api.roomAgent(roomId);
      if (activeRoomIdRef.current !== roomId || loadSequenceRef.current !== sequence) return;
      roomAgentSessionCache.set(roomId, next);
      setSession(next);
      setError(null);
    } catch (loadError) {
      if (activeRoomIdRef.current !== roomId || loadSequenceRef.current !== sequence) return;
      setError(loadError instanceof Error ? loadError.message : "Room Agent is unavailable.");
    } finally {
      if (activeRoomIdRef.current === roomId && loadSequenceRef.current === sequence) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDraft("");
    setError(null);
    setOptimisticTurns([]);
    sendSequenceRef.current += 1;
    stopSequenceRef.current += 1;
    controlSequenceRef.current += 1;
    clearSequenceRef.current += 1;
    roomGenerationRef.current += 1;
    setPendingCount(0);
    setStopping(false);
    setControlling(null);
    setClearing(false);

    if (!activeRoom) {
      loadSequenceRef.current += 1;
      setSession(null);
      return;
    }
    const cached = roomAgentSessionCache.get(activeRoom.id);
    if (cached) {
      setSession(cached);
    } else {
      setSession(null);
    }
    void loadSession(activeRoom.id, !cached);
  }, [activeRoom?.id, loadSession]);

  useEffect(() => {
    if (activeRoom && refreshKey) void loadSession(activeRoom.id);
  }, [activeRoom?.id, refreshKey, loadSession]);

  useEffect(() => {
    if (!activeRoom || !isDockActive) return;
    const active = ["RUNNING", "PAUSED", "RECOVERING", "QUEUED"].includes(session?.status ?? "IDLE");
    const timer = window.setInterval(() => void loadSession(activeRoom.id), active ? 1_500 : 3_000);
    return () => window.clearInterval(timer);
  }, [activeRoom?.id, loadSession, session?.status, isDockActive]);

  useEffect(() => {
    return () => {
      if (layoutCheckTimerRef.current !== null) {
        window.clearTimeout(layoutCheckTimerRef.current);
        layoutCheckTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [visibleMessages.length, pendingCount, optimisticTurns.length, session?.statusReason]);

  async function submit(event?: FormEvent, contentOverride?: string): Promise<boolean> {
    event?.preventDefault();
    let rawContent = (contentOverride ?? draft).trim();
    const layoutCheck = detectKeyboardLayoutMismatch(rawContent);
    if (layoutCheck.hasMismatch && layoutCheck.confidence >= 0.90 && layoutCheck.direction === "toGreek") {
      rawContent = layoutCheck.convertedText.trim();
    }
    const content = rawContent;
    if (!activeRoom || session?.capabilities.canSend === false || !content) return false;
    const roomId = activeRoom.id;
    const generation = roomGenerationRef.current;
    const sequence = ++sendSequenceRef.current;
    const key = JSON.stringify([roomId, content, selectedBrowserPaneId]);
    const pending = pendingRequestsRef.current.get(key);
    if (pending?.inFlight) return false;
    const request = pending ?? { roomId, content, clientRequestId: clientRequestId(), selectedBrowserPaneId, inFlight: false };
    request.inFlight = true;
    pendingRequestsRef.current.set(key, request);
    const isCurrentRoom = () => activeRoomIdRef.current === roomId && roomGenerationRef.current === generation;
    setPendingCount(count => count + 1);
    if (event) voiceInput?.cancel(voiceOwnerId);
    setDraft(current => current.trim() === content ? "" : current);
    setError(null);
    const optimisticTurn: OptimisticTurn = {
      clientRequestId: request.clientRequestId,
      roomId,
      userMessage: {
        id: `optimistic:${request.clientRequestId}`,
        role: "user",
        content,
        status: "READY",
        createdAt: new Date().toISOString()
      }
    };
    setOptimisticTurns((prev) => [...prev, optimisticTurn]);
    try {
      let next = await api.sendRoomAgentMessage(roomId, content, request.clientRequestId, request.selectedBrowserPaneId);
      // Every command receipt is handled, even if a later independent request finished first.
      if (!isCurrentRoom()) {
        if (next.directCommand?.music) await api.acknowledgeRoomAgentCommand(roomId, request.clientRequestId, false);
        pendingRequestsRef.current.delete(key);
        return false;
      }
      if (next.directCommand?.music) {
        const ok = await runRoomPlaybackCommand(roomId, request.clientRequestId, { type: "MUSIC", ...next.directCommand.music });
        const receipt = next.directCommand;
        next = await api.acknowledgeRoomAgentCommand(roomId, request.clientRequestId, ok);
        next.directCommand = { ...receipt, status: ok ? "COMPLETED" : "FAILED", music: undefined };
        if (!isCurrentRoom()) { pendingRequestsRef.current.delete(key); return false; }
      }
      pendingRequestsRef.current.delete(key);
      if (sequence >= latestAppliedSendRef.current) {
        latestAppliedSendRef.current = sequence;
        setSession(next);
      } else {
        // A slow older response may contain an older snapshot; fetch current durable state.
        void loadSession(roomId);
      }
      if (next.directCommand?.status === "FAILED") {
        setError(next.messages.filter(message => message.role === "assistant").at(-1)?.content ?? "The command could not be completed.");
        setDraft(current => current || content);
        return false;
      }
      return true;
    } catch (sendError) {
      if (!isCurrentRoom()) return false;
      setError(sendError instanceof Error ? sendError.message : "The prompt could not be queued.");
      setDraft(current => current || content);
      return false;
    } finally {
      request.inFlight = false;
      setOptimisticTurns((prev) => prev.filter((turn) => turn.clientRequestId !== request.clientRequestId));
      if (isCurrentRoom()) setPendingCount(count => Math.max(0, count - 1));
    }
  }

  function toggleVoiceCapture() {
    if (!voiceInput || !activeRoom) return;
    if (voiceOwned && voiceInput.status === "recording") {
      voiceInput.stop(voiceOwnerId);
      return;
    }
    const roomId = activeRoom.id;
    const base = draft;
    const insertMode = voiceInput.settings.insertMode;
    const compose = (text: string) => insertMode === "replace" ? text : [base.trim(), text.trim()].filter(Boolean).join("\n");
    void voiceInput.start({
      id: voiceOwnerId,
      onTranscriptDelta: (text) => {
        if (activeRoomIdRef.current === roomId) setDraft(compose(text));
      },
      onTranscriptComplete: async (text) => {
        if (activeRoomIdRef.current !== roomId) return;
        const content = compose(text);
        setDraft(content);
        if (!(await submit(undefined, content))) throw new Error("Voice transcript could not be sent to the Room Agent.");
      },
      onError: (message) => {
        if (activeRoomIdRef.current === roomId) setError(message);
      }
    });
  }

  async function stop() {
    if (!activeRoom || stopping || !session?.capabilities.canStop) return;
    const roomId = activeRoom.id;
    const sequence = ++stopSequenceRef.current;
    setStopping(true);
    setError(null);
    try {
      const next = await api.stopRoomAgent(roomId, "Stopped from the Room Agent dock.");
      if (activeRoomIdRef.current !== roomId || stopSequenceRef.current !== sequence) return;
      setSession(next);
    } catch (stopError) {
      if (activeRoomIdRef.current !== roomId || stopSequenceRef.current !== sequence) return;
      setError(stopError instanceof Error ? stopError.message : "The Room Agent could not be stopped.");
    } finally {
      if (stopSequenceRef.current === sequence) setStopping(false);
    }
  }

  async function control(action: "PAUSE" | "RESUME") {
    if (!activeRoom || controlling || stopping) return;
    if (action === "PAUSE" && !session?.capabilities.canPause) return;
    if (action === "RESUME" && !session?.capabilities.canResume) return;
    const roomId = activeRoom.id;
    const sequence = ++controlSequenceRef.current;
    setControlling(action);
    setError(null);
    try {
      const next = await api.controlRoomAgent(
        roomId,
        action === "PAUSE" ? { action, reason: "Paused from the Room Agent dock." } : { action }
      );
      if (activeRoomIdRef.current !== roomId || controlSequenceRef.current !== sequence) return;
      setSession(next);
    } catch (controlError) {
      if (activeRoomIdRef.current !== roomId || controlSequenceRef.current !== sequence) return;
      setError(controlError instanceof Error ? controlError.message : `The Room Agent could not ${action.toLowerCase()}.`);
    } finally {
      if (controlSequenceRef.current === sequence) setControlling(null);
    }
  }

  async function clearConversation() {
    if (!activeRoom || clearing || session?.capabilities.canClear === false) return;
    const roomId = activeRoom.id;
    const accepted = await confirm({
      title: "Clear Room Agent history?",
      message: "The visible conversation is cleared. The active goal and its saved evidence are kept.",
      confirmLabel: "Clear history"
    });
    if (!accepted || activeRoomIdRef.current !== roomId) return;
    const sequence = ++clearSequenceRef.current;
    setClearing(true);
    setError(null);
    try {
      const next = await api.clearRoomAgentTranscript(roomId);
      if (activeRoomIdRef.current !== roomId || clearSequenceRef.current !== sequence) return;
      setOptimisticTurns([]);
      setSession(next);
    } catch (clearError) {
      if (activeRoomIdRef.current !== roomId || clearSequenceRef.current !== sequence) return;
      setError(clearError instanceof Error ? clearError.message : "The Room Agent conversation could not be cleared.");
    } finally {
      if (clearSequenceRef.current === sequence) setClearing(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const isGKey = event.code === "KeyG" || event.key.toLowerCase() === "g" || event.key === "γ" || event.key === "Γ" || event.key === "©";
    if (autocorrectSettings.enabled && (event.altKey || (event.ctrlKey && event.shiftKey)) && isGKey) {
      event.preventDefault();
      const textarea = composerRef.current;
      if (textarea && (layoutSuggestion || draft.trim())) {
        const selStart = textarea.selectionStart ?? 0;
        const selEnd = textarea.selectionEnd ?? 0;
        const converted = layoutSuggestion
          ? layoutSuggestion.convertedText
          : convertTextRange(draft, selStart, selEnd, "toggle").newText;
        const changed = converted !== draft;
        setDraft(converted);
        setLayoutSuggestion(null);
        if (changed) {
          const isGreekTarget = /[\u0370-\u03FF]/.test(converted);
          setTypingMode(isGreekTarget ? "el" : "en");
        } else {
          const nextMode = typingLayoutMode === "el" ? "en" : "el";
          setTypingMode(nextMode);
        }
      } else {
        const nextMode = typingLayoutMode === "el" ? "en" : "el";
        setTypingMode(nextMode);
      }
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      if (typingLayoutMode === "el" && greekInputStateRef.current.enabled && composerRef.current) {
        const textarea = composerRef.current;
        const handled = handleGreekKeyInput(event, greekInputStateRef.current, (char) => {
          insertTextAtCursor(textarea, char);
          setDraft(textarea.value);
        });
        if (handled) return;
      } else if (typingLayoutMode === "en" && composerRef.current) {
        const textarea = composerRef.current;
        const handled = handleEnglishKeyInput(event, (char) => {
          insertTextAtCursor(textarea, char);
          setDraft(textarea.value);
        });
        if (handled) return;
      }
      return;
    }
    event.preventDefault();
    voiceInput?.cancel(voiceOwnerId);
    void submit();
  }


  const sessionStatus = session?.status ?? "IDLE";
  const statusText = loading ? "Connecting…" : statusLabel(sessionStatus);
  const statusTone = loading ? "" : ` ${statusTones[sessionStatus as RoomAgentStatus] ?? ""}`;
  const hasConversation = visibleMessages.length > 0 || pendingCount > 0 || optimisticTurns.length > 0;
  const firstLoadFailed = Boolean(activeRoom && !session && error && !hasConversation);
  const awaitingFirstLoad = Boolean(activeRoom && !session && !error && !hasConversation);

  return (
    <section className="dock-panel room-agent-dock" aria-label="Room Agent chat">
      <DockToolbar
        className="room-agent-head"
        summary={activeRoom ? (
          <>
            <span className={`dock-kit-badge room-agent-status${statusTone}`} data-status={loading ? "CONNECTING" : sessionStatus} role="status">
              {statusText}
            </span>
            <span className="room-agent-room-name" title={activeRoom.name}>{activeRoom.name}</span>
          </>
        ) : (
          <span className="room-agent-room-name">No room selected</span>
        )}
      >
        <DockIconButton
          label="Clear Room Agent history"
          icon={MessageSquareX}
          tone="danger"
          onClick={() => void clearConversation()}
          disabled={!activeRoom || clearing || !visibleMessages.length || session?.capabilities.canClear === false}
          busy={clearing}
        />
      </DockToolbar>

      {pendingCount > 0 ? (
        <DockNotice tone="info" className="room-agent-pending">{pendingCount} request{pendingCount === 1 ? "" : "s"} pending</DockNotice>
      ) : null}

      {activeRoom && session && (session.activeMission || session.status !== "IDLE" || session.roomInventory) ? (
        <div className="room-agent-goal-card dock-kit-card">
          {session.activeMission || session.status !== "IDLE" ? (
            <p className="room-agent-goal-text" role="status">{session.statusReason ?? "Working on your request…"}</p>
          ) : null}
          {session.activeMission ? (
            <div className="dock-kit-meta room-agent-goal-stats" aria-label="Room Agent goal statistics">
              <span className="dock-kit-badge is-accent">{session.progress?.completedSteps ?? 0} / {session.progress?.totalSteps ?? 0} complete</span>
              <span className="dock-kit-badge">{plural(session.activePaneIds?.length ?? 0, "active pane")}</span>
              <span className="dock-kit-badge">{durationLabel(session.progress?.elapsedMs ?? 0)} elapsed</span>
              <span className="dock-kit-badge">Up to {session.progress?.peakConcurrency ?? 0} at once</span>
            </div>
          ) : (
            <div className="dock-kit-meta room-agent-goal-stats" aria-label="Room plan statistics">
              <span className="dock-kit-badge">{plural(session.roomInventory?.totalPanes ?? 0, "pane")}</span>
              {(session.roomInventory?.pendingPlans ?? 0) > 0 ? <span className="dock-kit-badge is-accent">{session.roomInventory!.pendingPlans} pending</span> : null}
              {(session.roomInventory?.pausedPlans ?? 0) > 0 ? <span className="dock-kit-badge is-warning">{session.roomInventory!.pausedPlans} paused</span> : null}
              {(session.roomInventory?.runningPlans ?? 0) > 0 ? <span className="dock-kit-badge is-success">{session.roomInventory!.runningPlans} running</span> : null}
            </div>
          )}
          {(session.queuedMissionCount ?? 0) > 0 ? <span className="dock-kit-meta-text">{session.queuedMissionCount} more queued</span> : null}
        </div>
      ) : null}

      <div className="room-agent-transcript" ref={transcriptRef} aria-label="Room Agent transcript">
        {!activeRoom ? (
          <DockState kind="empty" icon={Bot} title="Select a room to supervise it." detail="The Room Agent works inside the room you have open." />
        ) : awaitingFirstLoad ? (
          <DockState kind="loading" title="Connecting to the Room Agent…" />
        ) : firstLoadFailed ? (
          <DockState
            kind="error"
            title="The Room Agent could not be reached"
            detail={error}
            action={{ label: "Try again", onClick: () => { setError(null); void loadSession(activeRoom.id, true); } }}
          />
        ) : hasConversation ? (
          <>
            {visibleMessages.map((message) => (
              <article key={message.id} className={`room-agent-message is-${message.role}`}>
                <header>
                  <strong>{message.role === "user" ? "You" : "Room Agent"}</strong>
                  <time dateTime={message.createdAt ?? undefined}>{messageTime(message.createdAt)}</time>
                </header>
                <p>{message.content}</p>
              </article>
            ))}
            {pendingCount > 0 || optimisticTurns.length > 0 ? (
              <article className="room-agent-message is-assistant is-thinking" aria-live="polite">
                <header>
                  <strong>Room Agent</strong>
                </header>
                <p className="room-agent-thinking">
                  <span className="room-agent-thinking-dots" aria-hidden="true">
                    <span>.</span><span>.</span><span>.</span>
                  </span>
                  <span>Room Agent is thinking…</span>
                </p>
              </article>
            ) : null}
          </>
        ) : (
          <div className="room-agent-start">
            <DockState kind="empty" icon={Bot} title="What needs doing?" detail="Give the Room Agent a task for this room." />
            <div className="room-agent-suggestions" role="group" aria-label="Suggested requests">
              {[
                ["Check progress", "Check the progress of this room's tasks and tell me what needs attention."],
                ["Continue pending work", "Continue the pending plans in this room and report what you complete."]
              ].map(([label, prompt]) => (
                <button key={label} type="button" className="dock-kit-chip" disabled={session?.capabilities.canSend === false}
                  onClick={() => { setDraft(prompt!); composerRef.current?.focus(); }}>{label}</button>
              ))}
            </div>
          </div>
        )}
        {session?.missionSummary ? <MissionReport summary={session.missionSummary} /> : null}
      </div>

      {session && (session.capabilities.canPause || session.capabilities.canResume || session.capabilities.canStop) ? (
        <div className="room-agent-controls" role="group" aria-label="Task controls">
          {session.capabilities.canPause ? (
            <DockButton
              icon={Pause}
              onClick={() => void control("PAUSE")}
              disabled={!activeRoom || controlling !== null || stopping}
              busy={controlling === "PAUSE"}
              aria-label="Pause Room Agent"
            >
              {controlling === "PAUSE" ? "Pausing" : "Pause"}
            </DockButton>
          ) : null}
          {session.capabilities.canResume ? (
            <DockButton
              icon={Play}
              onClick={() => void control("RESUME")}
              disabled={!activeRoom || controlling !== null || stopping}
              busy={controlling === "RESUME"}
              aria-label="Resume Room Agent"
            >
              {controlling === "RESUME" ? "Resuming" : "Resume"}
            </DockButton>
          ) : null}
          {session.capabilities.canStop ? (
            <DockButton
              icon={CircleStop}
              className="room-agent-stop-button"
              onClick={() => void stop()}
              disabled={!activeRoom || stopping || controlling !== null || !session.capabilities.canStop}
              busy={stopping}
              aria-label="Stop Room Agent"
            >
              {stopping ? "Stopping" : "Stop"}
            </DockButton>
          ) : null}
        </div>
      ) : null}

      {error && !firstLoadFailed ? (
        <DockNotice className="room-agent-error" onDismiss={() => setError(null)}>{error}</DockNotice>
      ) : null}
      {voiceOwned && voiceInput && voiceInput.status !== "idle" ? (
        <DockNotice tone="info" className="room-agent-voice-status">
          {voiceInput.preview || (voiceInput.status === "recording" ? "Listening" : voiceInput.status === "connecting" ? "Connecting microphone" : "Transcribing")}
        </DockNotice>
      ) : null}
      <form className="room-agent-composer" onSubmit={(event) => void submit(event)}>
        <label className="room-agent-composer-label" htmlFor="room-agent-message">Message Room Agent</label>
        {layoutSuggestion && isComposerSuggestionBarVisible(autocorrectSettings) ? (
          <div className="codex-layout-suggestion" role="status" aria-live="polite" style={{ marginBottom: 6 }}>
            <Keyboard aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span className="codex-layout-suggestion-label">
              Wrong layout? Convert to: <strong>{layoutSuggestion.convertedText.length > 36 ? layoutSuggestion.convertedText.slice(0, 36) + "…" : layoutSuggestion.convertedText}</strong>
            </span>
            <button
              type="button"
              className="codex-layout-apply-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setDraft(layoutSuggestion.convertedText);
                setLayoutSuggestion(null);
                const isGreekTarget = /[\u0370-\u03FF]/.test(layoutSuggestion.convertedText);
                setTypingMode(isGreekTarget ? "el" : "en");
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
            >
              <X aria-hidden="true" style={{ width: 14, height: 14 }} />
            </button>
          </div>
        ) : null}
        <textarea
          id="room-agent-message"
          ref={composerRef}
          value={draft}
          onChange={(event) => {
            const val = event.target.value;
            setDraft(val);
            if (layoutCheckTimerRef.current !== null) {
              window.clearTimeout(layoutCheckTimerRef.current);
              layoutCheckTimerRef.current = null;
            }
            if (!autocorrectSettings.enabled || !val.trim()) {
              setLayoutSuggestion(null);
              return;
            }
            layoutCheckTimerRef.current = window.setTimeout(() => {
              layoutCheckTimerRef.current = null;
              const detection = detectKeyboardLayoutMismatch(val);
              const isLangSupported = (detection.direction === "toGreek" && autocorrectSettings.supportedLanguages.includes("el")) ||
                (detection.direction === "toQwerty" && autocorrectSettings.supportedLanguages.includes("en"));
              if (detection.hasMismatch && detection.confidence >= 0.85 && isLangSupported) {
                setLayoutSuggestion(detection);
              } else {
                setLayoutSuggestion(null);
              }
            }, 150);
          }}
          onKeyDown={handleComposerKeyDown}
          placeholder={activeRoom ? "What would you like to do?" : "Select a room first"}
          disabled={!activeRoom}
          rows={2}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
          data-gramm="false"
          data-enable-grammarly="false"
        />
        <div className="room-agent-composer-actions">
          {voiceInput ? <VoiceInputButton label="Room Agent" active={Boolean(voiceOwned && voiceInput.status === "recording")} disabled={Boolean(voiceDisabled)} onClick={toggleVoiceCapture} onPrewarm={voiceInput.prewarm} /> : null}
          {isComposerLayoutIconVisible(autocorrectSettings) ? (
            <button
              type="button"
              className={`codex-layout-toggle ${layoutSuggestion ? "has-suggestion" : ""} ${typingLayoutMode === "el" ? "is-greek-active" : ""} ${typingLayoutMode === "en" ? "is-english-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const textarea = composerRef.current;
                const selStart = textarea?.selectionStart ?? 0;
                const selEnd = textarea?.selectionEnd ?? 0;
                if (layoutSuggestion || draft.trim()) {
                  const converted = layoutSuggestion
                    ? layoutSuggestion.convertedText
                    : convertTextRange(draft, selStart, selEnd, "toggle").newText;
                  const changed = converted !== draft;
                  setDraft(converted);
                  setLayoutSuggestion(null);
                  if (changed) {
                    const isGreekTarget = /[\u0370-\u03FF]/.test(converted);
                    setTypingMode(isGreekTarget ? "el" : "en");
                  } else {
                    const nextMode = typingLayoutMode === "el" ? "en" : "el";
                    setTypingMode(nextMode);
                  }
                } else {
                  const nextMode = typingLayoutMode === "el" ? "en" : "el";
                  setTypingMode(nextMode);
                }
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
          <span className="room-agent-composer-hint">Enter to send</span>
          <DockButton
            type="submit"
            tone="primary"
            icon={Send}
            className="room-agent-submit"
            disabled={!activeRoom || !draft.trim() || session?.capabilities.canSend === false}
            aria-label="Send to Room Agent"
          >
            Send
          </DockButton>
        </div>
      </form>
      {confirmDialog}
    </section>
  );
}
