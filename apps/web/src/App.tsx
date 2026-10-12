import { bridgePlanExecutionEvent } from "./features/terminal-pane/plan-execution-events.js";
import { PANE_TOOLBAR_ACTION_ORDER_STORAGE_KEY_PREFIX, PANE_TOOLBAR_HIDDEN_ACTIONS_STORAGE_KEY_PREFIX, PaneCard, PaneModeIcon, SHARED_CODEX_TOOLBAR_HIDDEN_STORAGE_KEY, SHARED_CODEX_TOOLBAR_ORDER_STORAGE_KEY, dispatchAgentPaneAction, dispatchTerminalPaneAction, displayPaneTitle } from "./features/pane-card/PaneCard.js";
export { formatTerminalSessionDebugInfo, formatTerminalSessionClipboardText } from "./features/pane-card/PaneCard.js";
import { MovePaneDialog, TaskHistoryDialog, type TaskHistoryDialogItem } from "./features/pane-dialogs/PaneDialogs.js";
import { type AppView, isRecord, isTransientUpstreamErrorMessage, isTransientUpstreamRuntimeError, parseStreamEvent, readAppView, streamEventTypes } from "./app-shell-utils.js";
import {
  MAX_PANE_COLUMN_SPAN,
  calculatePaneGridBaseRows,
  canPaneGrowAtCurrentPlacement,
  clampPaneColumnSpan,
  computePaneGridPlacements,
  detectPaneGridColumnCount,
  measureSingleLineTitleWidth,
  paneGridDensityMetrics,
  paneHeaderNeedsSecondRow,
  remToPx,
  resolvePaneGridColumnCount,
  resolvePaneGridPlacements,
  roomToolbarNeedsSecondRow,
  sortPanesForGrid,
  type PaneColumnAnchor,
  type PaneColumnAnchorMap,
  type PaneDensity,
  type PaneGridPlacement,
  type PaneGridPlacementSeed,
  type ShellMode
} from "./features/pane-grid/pane-grid-layout.js";
export { roomToolbarNeedsSecondRow, paneHeaderNeedsSecondRow, resolvePaneGridPlacements, calculatePaneGridBaseRows } from "./features/pane-grid/pane-grid-layout.js";
export type { PaneColumnAnchor, PaneColumnAnchorMap } from "./features/pane-grid/pane-grid-layout.js";
import { MobileActionSheet } from "./features/action-surfaces/MobileActionSheet.js";
import { DesktopActionManager } from "./features/action-surfaces/DesktopActionManager.js";
import type { PaneOverflowCommand } from "./features/action-surfaces/action-surface-shared.js";
import { LoginScreen } from "./features/auth/LoginScreen.js";
import { VoiceSettingsCard } from "./features/voice-input/VoiceSettingsCard.js";
import { clearLegacyCliShortcutUsage } from "./features/terminal-pane/CliShortcutsMenu.js";
import { openManage, consolidatedResourceActions, consolidatedManageActions } from "./features/server-actions/manage-navigation.js";
import { useSpaceControlClient } from "./features/room-agent/space-control-client.js";
import { useRailOrder } from "./features/ui-theme/use-rail-order.js";
import { syncRailScale } from "./features/ui-theme/rail-dynamic-scaling.js";
import { useTouchContextMenu } from "./features/ui-theme/use-touch-context-menu.js";
import { RailVisibilityMenu } from "./features/ui-theme/RailVisibilityMenu.js";
import { LiveSessionProvider } from "./features/live-pane/LiveSessionProvider.js";
import { LiveRailSession } from "./features/live-pane/LiveRailSession.js";
import { LiveRailContextMenu } from "./features/live-pane/LiveRailContextMenu.js";
import {
  DEFAULT_LOWER_RAIL_ITEMS,
  LOWER_RAIL_HIDDEN_KEY,
  LOWER_RAIL_LABELS,
  LOWER_RAIL_NON_HIDEABLE,
  LOWER_RAIL_VISIBILITY_IDS,
  railVisibilityItems,
  useRailVisibility,
  type RailVisibilityMenuState,
} from "./features/ui-theme/use-rail-visibility.js";
import { bindSpaceMediaVolume } from './space-audio.js';
import { AsteroidsGate } from "./features/asteroids/AsteroidsGate.js";
import { canPlayAsteroids } from "./features/asteroids/eligibility.js";
import { TaskTitleDetails } from "./features/task-titles/TaskTitleDetails.js";
import { TaskTitleSettings } from "./features/task-titles/TaskTitleSettings.js";
import { WorktreeBadge } from "./features/worktrees/WorktreeBadge.js";
import { PaneWorkingTimeBadge } from "./features/pane-working-time/index.js";
import { createWorktree } from "./features/worktrees/worktree-client.js";
import { RecoverableSurface } from "./features/SurfaceErrorBoundary.js";
import { readDockSession, writeDockSession } from "./features/workspace-session.js";
import { SystemHealth, useResourceIndicators } from "./features/system-health/SystemHealth.js";
import { openSystemHealth, openSystemResources } from "./features/system-health/health-model.js";
import type { OskCliCommand } from "./features/osk-keyboard/cli-shortcuts.js";
import {
  AppIconProvider,
  Activity,
  GitMerge,
  ALargeSmall,
  ArrowRightLeft,
  Archive,
  Bookmark,
  Bot,
  Boxes,
  Camera,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Chrome,
  CircleHelp,
  CircleStop,
  Clipboard,
  ClipboardList,
  Clock3,
  CodeXml,
  Columns2,
  Columns3,
  Copy,
  Cpu,
  Crosshair,
  Crop,
  Database,
  SlidersHorizontal,
  Dumbbell,
  Eraser,
  Eye,
  EyeOff,
  FileInput,
  Folder,
  FolderOpen,
  FolderPlus,
  Gauge,
  GitCompare,
  Globe,
  Grid2X2,
  GripVertical,
  HardDrive,
  Hash,
  History,
  Images,
  Keyboard,
  LayoutDashboard,
  Link as LinkIcon,
  ListFilter,
  ListTodo,
  Loader2,
  Lock,
  LogOut,
  Maximize2,
  MessageSquare,
  Mic,
  Minimize2,
  Minus,
  Monitor,
  MoreHorizontal,
  MoveHorizontal,
  Music2,
  Network,
  Paperclip,
  Palette,
  PanelLeft,
  PanelRight,
  PanelsTopLeft,
  PanelTopOpen,
  Pencil,
  PictureInPicture2,
  Plus,
  Radio,
  RefreshCw,
  Rocket,
  Save,
  Send,
  Search,
  ServerCog,
  Settings2,
  Bell,
  Bug,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  StickyNote,
  Shrink,
  Terminal,
  Timer,
  Trash2,
  Upload,
  Undo2,
  UserCheck,
  Users,
  Wrench,
  X,
  Youtube
} from "./features/ui-theme/app-icons.js";
import type { LucideIcon } from "./features/ui-theme/app-icons.js";
import { SensitiveDataMask } from "./features/sensitive-data/SensitiveDataMask.js";
import { SpaceToggle } from "./features/ui-controls/SpaceToggle.js";
import type { AgentPaneIdentity } from "./features/agent-pane/AgentPane.js";
import { connectorResultMessage } from "./features/agent-pane/connector-result.js";
import { cloneElement, lazy, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useAutoDismiss } from "./use-auto-dismiss.js";
import type {
  Artifact,
  AgentPaneSession,
  AgentRuntime,
  AuditEvent,
  AuthMe,
  BrowserEvidenceViewport,
  ClipboardItem,
  CliEgressRouteId,
  CliTaskHistoryItem,
  CliVpnRoutingStatus,
  CodexEnvironment,
  CodexHistoryItem,
  CodexAppServerHandshakeCheck,
  CodexAppServerStatus,
  CodexAppServerTurnSmokeCheck,
  TaskItem,
  CreateProviderInput,
  CreateRoomPanesRequest,
  Event as SpaceEvent,
  ImportCandidate,
  ImportSourceKind,
  ImportTargetKind,
  LaunchReadiness,
  McpDiscoverySmokeCheck,
  McpToolExecutionResult,
  MemoryEmbeddingSmokeCheck,
  MemoryEntry,
  MemorySearchMode,
  MemorySearchStatus,
  MemoryVectorReadiness,
  Model,
  ObservabilitySnapshot,
  Pane,
  PaneCliSessionResponse,
  PaneCapabilityMatrix,
  Provider,
  ProviderSettings,
  ProviderValidationResult,
  ReviewCheck,
  ReviewDecision,
  ReviewDiffSummary,
  ReviewRoomState,
  Room,
  SetupClaimInput,
  SetupStatus,
  Skill,
  StorageReadiness,
  SwarmLock,
  SwarmReconcileDecision,
  SwarmState,
  SwarmTask,
  SwarmTaskRole,
  SwarmTaskStatus,
  Turn,
  UpdateProviderInput,
  UpdateProviderSettingsInput,
  WorkerReadiness,
  UserLink,
  CliRuntimeSettingsResponse,
  AgentSessionHistoryItem,
  AdminUserItem,
  OpenProjectResult,
  UserSettings
} from "@space/contracts";
import {
  saveUserSettingDebounced,
  seedInitialLocalSettingsToServer,
  syncFromServer
} from "./features/user-settings/user-settings-manager.js";
import { MAX_ROOMS, LIVE_AUDIO_PROVIDERS, type LiveAudioProviderId, paneCategoryColors, type PaneCategoryColor } from "@space/contracts";
import {
  nextCategoryColor,
  readStoredCategoryFilter,
  roomCategoryColors,
  writeStoredCategoryFilter
} from "./features/pane-category-color/room-filter.js";
import { SpaceApiError, api, type McpPayload, type ReadyzPayload } from "./api.js";
import {
  acknowledgePaneCompletion,
  applyPaneCompletionEvents,
  createPaneCompletionLifecycleState,
  hydratePaneCompletionRoom,
  hydratePaneCompletionReplay,
  pendingPaneCompletionEventId,
  type PaneCompletionLifecycleState
} from "./pane-completion-lifecycle.js";
import { type AgentDashboardSummary } from "./features/agents-dashboard/dashboard-model.js";
import {
  PANE_RUN_LIFECYCLE_EVENT,
  type PaneRunLifecycleDetail
} from "./pane-run-lifecycle-events.js";
import { nextGeneratedRoomName } from "./room-naming.js";
import {
  cliRuntimeLabel,
  cliRuntimePresentation,
  isCliRuntimeTerminalLaunchable
} from "./cli-runtime-presentation.js";
import {
  CLI_RUNTIME_VISIBILITY_EVENT,
  dispatchCliRuntimeVisibilityChange,
  readCliRuntimeVisibilityChange
} from "./cli-runtime-visibility-events.js";
import {
  CLI_VPN_ROUTING_STATUS_EVENT,
  harnessPaneVpnRoutingPresentation,
  loadCliVpnRoutingStatus,
  paneVpnRoutingPresentation,
  publishCliVpnRoutingStatus,
  refreshCliVpnRoutingStatus
} from "./cli-vpn-routing.js";
import {
  CLI_RECOVERY_OPENED_EVENT,
  parseCliRecoveryOpenedDetail
} from "./cli-recovery-events.js";
import { GlobalApiErrorAlert, reportCoreApiFailure, reportCoreApiSuccess } from "./core-api-availability.js";
import { DEMO_LOCAL_REPLY, eventGateway, getSpaceRuntime, getSpaceRuntimeKind } from "./runtime/SpaceRuntime.js";
import { dispatchArtifactsUpdated } from "./artifact-events.js";
import { SpaceBrand } from "./SpaceBrand.js";
import {
  CLI_IMAGE_PREVIEW_LIMIT_STORAGE_KEY,
  MAX_CLI_IMAGE_PREVIEW_LIMIT,
  MIN_CLI_IMAGE_PREVIEW_LIMIT,
  normalizeCliImagePreviewLimit,
  readStoredCliImagePreviewLimit,
  writeStoredCliImagePreviewLimit,
  applyServerCliImagePreviewLimit
} from "./cli-upload-settings.js";
import {
  dispatchAgentPaneActionEvent,
  dispatchAgentPaneAttachmentsEvent
} from "./features/agent-pane/events.js";
import type { AdminCodexTool } from "./features/admin-codex-tools/AdminCodexToolsDialog.js";
import type { AdminOperationTool } from "./features/admin-operations/AdminOperationsDialog.js";
import { AuthenticationBootstrap } from "./features/auth/AuthenticationBootstrap.js";
import { OwnerSetupScreen } from "./features/auth/OwnerSetupScreen.js";
import {
  BROWSER_PANE_ACTION_EVENT,
  dispatchBrowserPaneActionEvent,
  parseBrowserPaneActionDetail,
  type BrowserPaneAction
} from "./features/browser-pane/events.js";
import { AppVersionMeta, DemoVersionMeta } from "./features/app-version/AppVersionMeta.js";
import { HealthDock } from "./features/health/HealthDock.js";
import { statusTone } from "./features/status-tone.js";
import {
  AppDiagnosticsGlobalIndicators,
  useDiagnosticsState
} from "./features/app-diagnostics/AppDiagnosticsIndicators.js";
import { emitAppDiagnosticsPerformance } from "./app-diagnostics/app-diagnostics-performance.js";
import {
  applyAppDiagnosticsStatus,
  startAppDiagnosticsBootstrap
} from "./app-diagnostics/app-diagnostics-bootstrap.js";
import { SettingsActionMenu } from "./features/settings/SettingsActionMenu.js";
import { GitBranch } from "./features/ui-theme/app-icons.js";
import { Plug, ArrowUpDown } from "./features/ui-theme/app-icons.js";
import { SOURCE_CONTROL_CONNECTION_EVENT, sourceControlClient } from "./features/source-control/client.js";
import { applyServerKeyboardAutocorrectSettings } from "./features/keyboard-autocorrect/keyboard-autocorrect-settings.js";
import { applyServerDateTimeSettings } from "./features/date-time-settings/date-time-settings.js";
import { SettingsDisclosure, SettingsSections } from "./features/settings/SettingsDisclosure.js";
import { DOCK_DEFINITIONS, useDocksVisibility } from "./features/docks/use-docks-visibility.js";
import { DockNotice, useDockConfirm } from "./features/dock-kit/DockKit.js";
import { DockKeepAliveHost } from "./features/docks/DockKeepAliveHost.js";
import { preloadDockModules } from "./features/docks/dock-preloader.js";
import { usePanesVisibility } from "./features/pane-visibility/use-panes-visibility.js";
import { DesktopNavigation } from "./features/ui-theme/DesktopNavigation.js";
import { WorkspaceRoomSettings } from "./features/ui-theme/WorkspaceRoomSettings.js";
import { WorkspacePortalMount } from "./features/ui-theme/WorkspaceSurface.js";
import "./features/ui-theme/workspace-chrome.css";
import { workspaceRoomActivity, workspaceRoomMatches, type WorkspaceRoomFilter } from "./features/ui-theme/workspace-room-filter.js";
import { desktopActionDescriptions } from "./features/ui-theme/desktop-navigation.js";
import {
  SPACE_CLIPBOARD_NOTICE_EVENT,
  useSpaceClipboardCapture,
  writeClipboardText
} from "./features/clipboard-dock/clipboard-events.js";
import {
  StreamingOverlay,
  StreamingOverlayProvider
} from "./features/streaming/StreamingOverlay.js";
import { reorderPanesByTarget, setPaneDragData, type PaneDropPosition } from "./features/pane-drag/pane-drag.js";
import { LinksPanel, QuickLinksPopover } from "./features/user-links/UserLinks.js";
import {
  ROOM_THEME_MENU_ID,
  RoomThemeMenu,
  roomThemes,
  type RoomTheme
} from "./features/room-theme/RoomThemeMenu.js";
import {
  groupModernRoomActions,
  modernPanePrimaryActionCapacity,
  modernPanePrimaryActionCount
} from "./features/ui-theme/modern-toolbar.js";
import {
  migrateModernToolbarPreference,
  modernPaneToolbarStorageKeys,
  modernRoomToolbarStorageKeys,
  readModernAppearance,
  readModernIconPack,
  readUiBackground,
  readUiTheme,
  resolveModernColorMode,
  shouldMeasureToolbarLayout,
  writeModernAppearance,
  writeModernIconPack,
  writeUiBackground,
  writeUiTheme,
  type ModernAppearance,
  type ModernIconPack,
  type UiBackground,
  type UiTheme
} from "./ui-theme.js";
import { RoomPaneComposer } from "./features/room-pane-composer/RoomPaneComposer.js";
import { MemoryWorkspaceErrorBoundary } from "./features/memory-workspace/MemoryWorkspaceErrorBoundary.js";
import type { ServerActionCommand } from "./features/server-actions/ServerActionsMenu.js";
import {
  CHAT_LAUNCHER_MENU_ID,
  CLI_LAUNCHER_MENU_ID,
  PANE_LAYOUT_MENU_ID,
  PANE_SPAN_ALL_MENU_ID,
  SERVER_ACTIONS_MENU_ID
} from "./features/toolbar-menu-ids.js";
import { CliLauncherMenu } from "./features/cli-launcher/CliLauncherMenu.js";
import { PaneLayoutMenu } from "./features/pane-layout/PaneLayoutMenu.js";
import { useRootRemSize } from "./features/pane-layout/use-root-rem-size.js";
import {
  createTerminalBootstrapBarrier,
  TerminalPane,
  type TerminalBootstrapBarrier,
  type TerminalSessionMetadata
} from "./features/terminal-pane/index.js";
import { registerYouTubeBrowseIntent } from "./features/browser-pane/youtube-browse-intent.js";
import { registerCliResumeIntent } from "./features/terminal-pane/cli-resume-intent.js";
import { paneRuntimeBlockedReason, roomPaneLimit } from "./pane-runtime-availability.js";
import type { OnScreenKeyboardInput } from "./features/osk-keyboard/OnScreenKeyboard.js";
import { VIBE_MUSIC_PANEL_ID, useVibeMusicMount } from "./features/vibe-music/vibe-music-session.js";
import { StickyNoteLayer, StickyNoteWindow, useStickyNoteWindows } from "./features/clipboard-dock/StickyNoteWindow.js";
import {
  DEFAULT_PUSHUP_CONFIG,
  DesktopWidgetsLayer,
  loadWidgetConfig,
  saveWidgetConfig,
  useDesktopWidgets,
  useWidgetsVisibility
} from "./features/desktop-widgets/index.js";
import { useRailMenuDodge } from "./features/rail-popover.js";
import {
  ToolbarMetrics,
  ToolbarMetricsSummary,
  type ToolbarMetricsHandle
} from "./features/toolbar-metrics/ToolbarMetrics.js";
import type { SystemAnalyticsTab } from "./features/system-analytics/SystemAnalyticsWorkspace.js";
import { SystemAnalyticsErrorBoundary } from "./features/system-analytics/SystemAnalyticsErrorBoundary.js";
import { shouldLoadHarnessPane } from "./features/harness-pane/harness-load-policy.js";
import {
  MAX_WORKSPACE_TEXT_SIZE,
  MIN_WORKSPACE_TEXT_SIZE,
  WORKSPACE_TEXT_SIZE_PICKER_ID,
  WorkspaceTextSizePicker
} from "./features/workspace-text-size-picker/WorkspaceTextSizePicker.js";
import {
  MINIMIZED_PANE_BAR_ID,
  MINIMIZED_PANE_BAR_TOGGLE_ID,
  MinimizedPaneBarToggle
} from "./features/pane-float/MinimizedPaneBarToggle.js";
import { MinimizedPaneChip, MinimizedPanePreviewCard } from "./features/pane-float/MinimizedPanePreview.js";
import { DesktopDisplayControls } from "./features/desktop-screens/DesktopDisplayControls.js";
import { isDocumentFullscreen, toggleBrowserFullscreen } from "./features/desktop-titlebar/fullscreen.js";
import { DesktopWindowTitlebar } from "./features/desktop-titlebar/DesktopWindowTitlebar.js";
import {
  useDismissibleToolbarLayer,
  usePersistentIconToolbar,
  type IconToolbarAction
} from "./icon-toolbar.js";
import {
  clearLifecycleDebugEvents,
  classifyRoomSwitchTemperature,
  recordLifecycleDebugEvent,
  recordRoomSwitchMeasurementPhase,
  startRoomSwitchMeasurement,
  type LifecycleDebugEvent,
  type LifecycleDebugSnapshot
} from "./lifecycle-debug.js";
import {
  applyServerVoiceSettings
} from "./voice-settings.js";
import { applyServerLivePaneSettings } from "./features/live-pane/live-pane-config.js";
import { useVoiceInput } from "./features/voice-input/VoiceInputProvider.js";
import {
  connectedPaneCount,
  selectRoomRuntimePollIds,
  selectWarmRoomIds,
  warmRoomLimits,
  WARM_ROOM_RUNTIME_POLL_INTERVAL_MS
} from "./room-runtime-cache.js";
import {
  classifyRoomWarmPresentation,
  hydrateWarmRoomsWithinWindow,
  readRoomMru,
  recordRoomMru,
  runWithConcurrency,
  selectWarmHydrationRoomIds,
  WARM_ROOM_STARTUP_HYDRATION_CONCURRENCY
} from "./warm-room-startup.js";
import { reuseVersionedItems, useStableCallback } from "./render-performance.js";
import { lazyWithPreload } from "./lazy-with-preload.js";
import {
  readStoredWarmRoomConnectedPaneLimit,
  readStoredWarmRoomEnabled,
  writeStoredWarmRoomConnectedPaneLimit,
  writeStoredWarmRoomEnabled,
  applyServerWarmRoomConnectedPaneLimit,
  applyServerWarmRoomEnabled
} from "./warm-room-settings.js";
import {
  readStoredSuppressNotifications,
  writeStoredSuppressNotifications,
  applyServerSuppressNotifications
} from "./notifications-settings.js";
import { scheduleT3BundlePrefetch } from "./features/t3code-pane/t3code-prefetch.js";

const ROOM_PRESENTATION_FAILURE_TIMEOUT_MS = 8_000;

const DEFAULT_PROJECT_PRESETS: { label: string; path: string }[] = [
  { label: "space", path: "/opt/spaceapp" },
  { label: "space1", path: "/opt/spaceapp/projects/space1" },
  { label: "space2", path: "/opt/spaceapp/projects/space2" }
];

type SideSurface = "rooms" | "room-agent" | "shared-chat" | "media" | "streaming" | "source-control" | "agent-files" | "clipboard" | "tasks" | "links" | "settings" | "health" | "cli" | "agent-sessions";
type EventStreamStatus = "idle" | "connecting" | "connected" | "reconnecting" | "unavailable";
type ActiveRoomEventStreamStatus = "idle" | "connecting" | "connected" | "disconnected" | "unavailable";
type RoomRefreshCategory = "panes" | "turns" | "swarm" | "events";
type RoomRuntimeSnapshot = {
  roomId: string;
  panes: Pane[];
  turns: Turn[];
  events: SpaceEvent[];
  swarm: SwarmState | null;
  selectedPaneId: string | null;
  bootstrappedPaneIds: string[];
  prefillReadyPaneIds: string[];
  lastAccessedAt: number;
};
type RoomPaneLoadState = "loading" | "loaded" | "error";

export function shellVisiblePaneIds(
  panes: ReadonlyArray<Pick<Pane, "id" | "isMaximized" | "isMinimized">>,
  selectedPaneId: string | null,
  shellMode: ShellMode,
  fullscreenLayout = false
): string[] {
  const visiblePanes = shellMode === "mobile" ? panes : panes.filter((pane) => !pane.isMinimized);
  if (shellMode === "mobile" || fullscreenLayout) {
    const selectedPane =
      shellMode === "mobile"
        ? (selectedPaneId ? visiblePanes.find((pane) => pane.id === selectedPaneId) : null) ?? visiblePanes[0]
        : visiblePanes.find((pane) => pane.id === selectedPaneId && !pane.isMinimized)
          ?? visiblePanes.find((p) => !p.isMinimized)
          ?? visiblePanes.find((pane) => pane.id === selectedPaneId)
          ?? visiblePanes[0];
    return selectedPane ? [selectedPane.id] : [];
  }
  const maximizedPanes = visiblePanes.filter((pane) => pane.isMaximized);
  return (maximizedPanes.length > 0 ? maximizedPanes : visiblePanes).map((pane) => pane.id);
}

interface CoalescedRefreshEntry {
  started: boolean;
  trailing: boolean;
  operation: () => Promise<void>;
  promise: Promise<void>;
}

export function createCoalescedRefreshQueue() {
  const entries = new Map<string, CoalescedRefreshEntry>();

  return {
    request(key: string, operation: () => Promise<void>): Promise<void> {
      const active = entries.get(key);
      if (active) {
        active.operation = operation;
        if (active.started) active.trailing = true;
        return active.promise;
      }

      let entry!: CoalescedRefreshEntry;
      const promise = Promise.resolve()
        .then(async () => {
          entry.started = true;
          do {
            entry.trailing = false;
            const nextOperation = entry.operation;
            await nextOperation();
          } while (entry.trailing);
        })
        .finally(() => {
          if (entries.get(key) === entry) entries.delete(key);
        });
      entry = { started: false, trailing: false, operation, promise };
      entries.set(key, entry);
      return promise;
    }
  };
}

export function roomRefreshCategoriesForEvent(type: SpaceEvent["type"]): RoomRefreshCategory[] {
  if (type === "PANE_CREATED" || type === "PANE_UPDATED" || type === "PANE_CLOSED") return ["panes"];
  if (type === "TURN_STARTED" || type === "TURN_DELTA" || type === "TURN_COMPLETED" || type === "TURN_FAILED") {
    return ["turns"];
  }
  if (type.startsWith("SWARM_")) return ["swarm"];
  return [];
}

export function shouldUseEventStreamFallback(status: ActiveRoomEventStreamStatus): boolean {
  return status === "disconnected" || status === "unavailable";
}

export function shouldOpenAppEventStreams(input: {
  authenticated: boolean;
  terminalsConnected: boolean;
  eventSourceSupported: boolean;
  cliLauncherOpen: boolean;
}): boolean {
  return input.authenticated && input.terminalsConnected && input.eventSourceSupported && !input.cliLauncherOpen;
}

function TerminalBootstrapBoundary({
  paneIds,
  children
}: {
  paneIds: readonly string[];
  children: (barriers: ReadonlyMap<string, TerminalBootstrapBarrier>) => ReactNode;
}) {
  const barrierByPaneIdRef = useRef(new Map<string, TerminalBootstrapBarrier>());
  const validPaneIds = paneIds.filter((paneId) => !paneId.startsWith("pane:optimistic-"));
  const newPaneIds = validPaneIds.filter((paneId) => !barrierByPaneIdRef.current.has(paneId));
  if (newPaneIds.length > 0) {
    const barrier = createTerminalBootstrapBarrier(newPaneIds);
    for (const paneId of newPaneIds) barrierByPaneIdRef.current.set(paneId, barrier);
  }
  return children(barrierByPaneIdRef.current);
}

const LazyMemoryWorkspace = lazyWithPreload(() =>
  import("./features/memory-workspace/MemoryWorkspace.js").then((module) => ({ default: module.MemoryWorkspace })),
  { idle: true }
);
const LazySystemAnalyticsWorkspace = lazy(() =>
  import("./features/system-analytics/SystemAnalyticsWorkspace.js")
    .then((module) => ({ default: module.SystemAnalyticsWorkspace }))
);
const LazyAdminOperationsDialog = lazy(() =>
  import("./features/admin-operations/AdminOperationsDialog.js")
    .then((module) => ({ default: module.AdminOperationsDialog }))
);
const LazyMaintenanceHub = lazy(() =>
  import("./features/admin-operations/MaintenanceHub.js")
    .then((module) => ({ default: module.MaintenanceHub }))
);
const LazyAdminCodexToolsDialog = lazy(() =>
  import("./features/admin-codex-tools/AdminCodexToolsDialog.js")
    .then((module) => ({ default: module.AdminCodexToolsDialog }))
);
const LazyUserManagementDialog = lazy(() =>
  import("./features/user-management/UserManagementDialog.js")
    .then((module) => ({ default: module.UserManagementDialog }))
);
const LazySpaceGatewayDialog = lazy(() =>
  import("./features/space-gateway/SpaceGatewayDialog.js")
    .then((module) => ({ default: module.SpaceGatewayDialog }))
);
const LazySetupConnectionsWizard = lazy(() =>
  import("./features/setup-connections/SetupConnectionsWizard.js")
    .then((module) => ({ default: module.SetupConnectionsWizard }))
);
const LazyEmbeddedDashboardDialog = lazy(() =>
  import("./features/embedded-dashboard/EmbeddedDashboardDialog.js")
    .then((module) => ({ default: module.EmbeddedDashboardDialog }))
);
const LazySystemServicesDialog = lazy(() =>
  import("./features/service-control/SystemServicesDialog.js")
    .then((module) => ({ default: module.SystemServicesDialog }))
);
const LazyHelpPage = lazy(() =>
  import("./features/help/HelpPage.js").then((module) => ({ default: module.HelpPage }))
);
const LazyBenchmarkPage = lazy(() =>
  import("./features/benchmark/BenchmarkPage.js").then((module) => ({ default: module.BenchmarkPage }))
);
const LazyDemoModeOverlay = lazy(() =>
  import("./features/demo-mode/DemoModeOverlay.js").then((module) => ({ default: module.DemoModeOverlay }))
);
const LazyRoomAgentDock = lazyWithPreload(() =>
  import("./features/room-agent/RoomAgentDock.js").then((module) => ({ default: module.RoomAgentDock })),
  { idle: true }
);
const LazyMediaDock = lazyWithPreload(() =>
  import("./features/media-dock/MediaDock.js").then((module) => ({ default: module.MediaDock })),
  { idle: true }
);
const LazyStreamingDock = lazyWithPreload(() =>
  import("./features/streaming/StreamingDock.js").then((module) => ({ default: module.StreamingDock })),
  { idle: true }
);
const LazyCliDock = lazyWithPreload(() =>
  import("./features/cli-dock/CliDock.js").then((module) => ({ default: module.CliDock })),
  { idle: true }
);
const LazyAgentsDashboard = lazy(() => import("./features/agents-dashboard/AgentsDashboard.js").then(module => ({ default: module.AgentsDashboard })));

const LazyAgentSessionsDock = lazyWithPreload(() =>
  import("./features/agent-sessions/AgentSessionsDock.js").then((module) => ({ default: module.AgentSessionsDock })),
  { idle: true }
);
const LazyAgentFilesDock = lazyWithPreload(() =>
  import("./features/agent-files/AgentFilesDock.js").then((module) => ({ default: module.AgentFilesDock })),
  { idle: true }
);
const LazySharedChatDock = lazyWithPreload(() =>
  import("./features/shared-chat/SharedChatDock.js").then((module) => ({ default: module.SharedChatDock })),
  { idle: true }
);
const LazyClipboardDock = lazyWithPreload(() =>
  import("./features/clipboard-dock/ClipboardDock.js").then((module) => ({ default: module.ClipboardDock })),
  { idle: true }
);
const LazyTaskDock = lazyWithPreload(() =>
  import("./features/task-dock/TaskDock.js").then((module) => ({ default: module.TaskDock })),
  { idle: true }
);
const LazyUiThemeSettingsCard = lazyWithPreload(() =>
  import("./features/ui-theme/UiThemeSettingsCard.js").then((module) => ({ default: module.UiThemeSettingsCard })),
  { idle: true }
);
const LazySourceControlPublishingCard = lazyWithPreload(() =>
  import("./features/source-control-publishing/SourceControlPublishingCard.js")
    .then((module) => ({ default: module.SourceControlPublishingCard })),
  { idle: true }
);
const LazySourceControlDock = lazyWithPreload(() => import("./features/source-control/SourceControlDock.js").then(module => ({ default: module.SourceControlDock })), { idle: true });
// Opened only from a room's Project Directory, so it is not preloaded at idle.
const LazyProjectSourcePicker = lazyWithPreload(() => import("./features/source-control/ProjectSourcePicker.js").then(module => ({ default: module.ProjectSourcePicker })));
const LazyCodexCliDefaultsCard = lazyWithPreload(() =>
  import("./features/codex-cli-defaults/CodexCliDefaultsCard.js")
    .then((module) => ({ default: module.CodexCliDefaultsCard })),
  { idle: true }
);
const LazyTelegramIntegrationCard = lazyWithPreload(() =>
  import("./features/telegram-integration/TelegramIntegrationCard.js")
    .then((module) => ({ default: module.TelegramIntegrationCard })),
  { idle: true }
);
const LazyConfigurationMigrationCard = lazyWithPreload(() =>
  import("./features/settings/ConfigurationMigrationCard.js")
    .then((module) => ({ default: module.ConfigurationMigrationCard })),
  { idle: true }
);
const LazyOnScreenKeyboard = lazy(() =>
  import("./features/osk-keyboard/OnScreenKeyboard.js").then((module) => ({ default: module.OnScreenKeyboard }))
);
const LazyCliLauncherMenu = CliLauncherMenu;
const LazyChatLauncherMenu = lazyWithPreload(() =>
  import("./features/chat-launcher/ChatLauncherMenu.js").then((module) => ({ default: module.ChatLauncherMenu })),
  { idle: true }
);
const LazyServerActionsMenu = lazyWithPreload(() =>
  import("./features/server-actions/ServerActionsMenu.js").then((module) => ({ default: module.ServerActionsMenu })),
  { idle: true }
);
const LazyPaneLayoutMenu = PaneLayoutMenu;
const LazyPaneSpanAllMenu = lazyWithPreload(() =>
  import("./features/pane-layout/PaneSpanAllMenu.js").then((module) => ({ default: module.PaneSpanAllMenu })),
  { idle: true }
);
const LazyVibeMusicPlayer = lazyWithPreload(() =>
  import("./features/vibe-music/VibeMusicPlayer.js").then((module) => ({ default: module.VibeMusicPlayer })),
  { idle: true }
);
const LazySnipToolOverlay = lazyWithPreload(() =>
  import("./features/snip-tool/SnipToolOverlay.js").then((module) => ({ default: module.SnipToolOverlay })),
  { idle: true }
);
const LazyEnvironmentPresetCard = lazyWithPreload(() =>
  import("./features/settings/EnvironmentPresetCard.js").then((module) => ({ default: module.EnvironmentPresetCard })),
  { idle: true }
);
const LazyGoogleAccountSettingsCard = lazyWithPreload(() =>
  import("./features/auth/GoogleAccountSettingsCard.js").then((module) => ({ default: module.GoogleAccountSettingsCard })),
  { idle: true }
);
const LazyDocksSettingsCard = lazyWithPreload(() =>
  import("./features/settings/DocksSettingsCard.js").then((module) => ({ default: module.DocksSettingsCard })),
  { idle: true }
);
const LazyPanesSettingsCard = lazyWithPreload(() =>
  import("./features/settings/PanesSettingsCard.js").then((module) => ({ default: module.PanesSettingsCard })),
  { idle: true }
);
const LazyWidgetsSettingsCard = lazyWithPreload(() =>
  import("./features/settings/WidgetsSettingsCard.js").then((module) => ({ default: module.WidgetsSettingsCard })),
  { idle: true }
);
const LazyDateTimeSettingsCard = lazyWithPreload(() =>
  import("./features/date-time-settings/DateTimeSettingsCard.js").then((module) => ({ default: module.DateTimeSettingsCard })),
  { idle: true }
);
const LazyAppDiagnosticsSettingsCard = lazyWithPreload(() =>
  import("./features/app-diagnostics/AppDiagnosticsSettingsCard.js")
    .then((module) => ({ default: module.AppDiagnosticsSettingsCard })),
  { idle: true }
);
const LazyDeployQueueSettingsCard = lazyWithPreload(() =>
  import("./features/deploy-queue/DeployQueueSettingsCard.js")
    .then((module) => ({ default: module.DeployQueueSettingsCard })),
  { idle: true }
);
const LazyPluginsSettingsCard = lazyWithPreload(() =>
  import("./features/plugins/PluginsSettingsCard.js").then((module) => ({ default: module.PluginsSettingsCard })),
  { idle: true }
);
const LazyKeyboardAutocorrectSettingsCard = lazyWithPreload(() =>
  import("./features/keyboard-autocorrect/KeyboardAutocorrectSettingsCard.js")
    .then((module) => ({ default: module.KeyboardAutocorrectSettingsCard })),
  { idle: true }
);
const LazyPromptVariablesSettingsCard = lazyWithPreload(() =>
  import("./features/prompt-variables/PromptVariablesSettingsCard.js")
    .then((module) => ({ default: module.PromptVariablesSettingsCard })),
  { idle: true }
);
const sideSurfaceLoadingFallback = <div className="dock-muted-text" role="status">Loading panel…</div>;
const settingsCardLoadingFallback = <div className="empty-mini" role="status">Loading settings…</div>;

const toolbarMenuLoadingFallback = <span className="sr-only" role="status">Loading menu…</span>;

const roomEventLimit = 50;
const MIN_TERMINAL_FONT_SIZE = MIN_WORKSPACE_TEXT_SIZE;
const MAX_TERMINAL_FONT_SIZE = MAX_WORKSPACE_TEXT_SIZE;
const DEFAULT_TERMINAL_FONT_SIZE = 12;
const TERMINAL_FONT_SIZE_STORAGE_KEY = "space.terminal.fontSize";
const SESSION_DEBUG_IDS_STORAGE_KEY = "space.showSessionDebugIds";
const CLI_DEBUG_MODE_STORAGE_KEY = "space.cliDebugMode";
const CLI_FLOATS_HIDDEN_STORAGE_KEY = "space.cliFloatsHidden";
const SPACE_SENSITIVE_DATA_MASKED_STORAGE_KEY = "space.sensitiveDataMasked";
const SIDE_SURFACE_HIDDEN_STORAGE_KEY = "space.roomsRailHidden";
const ROOM_FOCUS_MODE_STORAGE_KEY = "space.roomFocusMode";
const ROOM_TOOLBAR_HIDDEN_STORAGE_KEY = "space.roomToolbar.hidden.v1";
const ROOM_THEME_STORAGE_KEY = "space.room.theme";
const ADMIN_MODE_REQUESTED_STORAGE_KEY = "space.adminModeRequested";
const OSK_PANEL_ID = "space-osk-keyboard";
const ROOM_TOOLBAR_HIDDEN_ACTIONS_STORAGE_KEY = "space.roomToolbar.hiddenActionIds.v3";
const ROOM_TOOLBAR_ACTION_ORDER_STORAGE_KEY = "space.roomToolbar.actionOrder.v3";
const SELECTED_ROOM_ID_STORAGE_KEY = "space.selectedRoomId";
const SELECTED_PANE_ID_STORAGE_KEY = "space.selectedPaneId";
const DISMISSED_STORAGE_WARNING_STORAGE_KEY = "space.dismissedStorageWarning";
const MOBILE_SHELL_MAX_WIDTH = 767;
const TABLET_SHELL_MAX_WIDTH = 1100;
const ROOM_CLI_ACTIVITY_POLL_INTERVAL_MS = 5_000;
const SUPPORTED_CLIP_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type ClipImageTarget = {
  roomId: string;
  paneId: string | null;
  paneMode: Pane["mode"] | null;
};

const sideSurfaceMeta: Record<SideSurface, { icon: LucideIcon; label: string; surfaceLabel: string }> = {
  rooms: { icon: PanelLeft, label: "rooms", surfaceLabel: "Rooms" },
  "room-agent": { icon: Bot, label: "room agent", surfaceLabel: "Room Agent" },
  "shared-chat": { icon: MessageSquare, label: "shared chat", surfaceLabel: "Shared Chat" },
  media: { icon: Images, label: "media dock", surfaceLabel: "Media dock" },
  streaming: { icon: Radio, label: "streaming dock", surfaceLabel: "Streaming dock" },
  "source-control": { icon: GitBranch, label: "source control", surfaceLabel: "Source Control" },
  "agent-files": { icon: FolderOpen, label: "Agent Files", surfaceLabel: "Agent Files" },
  clipboard: { icon: Clipboard, label: "clipboard", surfaceLabel: "Clipboard" },
  tasks: { icon: ListTodo, label: "tasks", surfaceLabel: "Tasks" },
  links: { icon: LinkIcon, label: "links", surfaceLabel: "Links" },
  settings: { icon: Settings2, label: "settings dock", surfaceLabel: "Settings dock" },
  health: { icon: Activity, label: "health dock", surfaceLabel: "Health dock" },
  cli: { icon: Terminal, label: "cli dock", surfaceLabel: "CLI dock" },
  "agent-sessions": { icon: Archive, label: "agent session history", surfaceLabel: "Agent Session History" }
};

type BlueprintStatus = "LIVE" | "GATED" | "NEXT";

interface BlueprintProgressItem {
  label: string;
  status: BlueprintStatus;
  detail: string;
}

type LaunchBlockerSeverity = "hard" | "gate" | "next";

interface LaunchBlocker {
  label: string;
  detail: string;
  severity: LaunchBlockerSeverity;
}

interface BlueprintProgressProps {
  readiness: ReadyzPayload | null;
  mcp: McpPayload | null;
  latestSmoke: McpDiscoverySmokeCheck | null;
  latestMemoryEmbeddingSmoke: MemoryEmbeddingSmokeCheck | null;
  latestMemoryVectorReadiness: MemoryVectorReadiness | null;
  providers: Provider[];
  skills: Skill[];
  importCandidates: ImportCandidate[];
  swarmState: SwarmState | null;
  rooms: Room[];
  panes: Pane[];
  codexAppServer: CodexAppServerStatus | null;
  observability: ObservabilitySnapshot | null;
  workerReadiness: WorkerReadiness | null;
  storageReadiness: StorageReadiness | null;
  storageWarning: string;
}


function readViewportWidth() {
  return typeof window === "undefined" ? 1440 : window.innerWidth;
}

function readStoredSessionString(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = getSpaceRuntime().platform.sessionStorage.getItem(key);
    return value || null;
  } catch {
    return null;
  }
}

function writeStoredSessionString(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      getSpaceRuntime().platform.sessionStorage.setItem(key, value);
    } else {
      getSpaceRuntime().platform.sessionStorage.removeItem(key);
    }
  } catch {
    // Session-only preference when storage is blocked.
  }
}

function detectShellMode(width: number, mobileMaxWidth = MOBILE_SHELL_MAX_WIDTH): ShellMode {
  if (width <= mobileMaxWidth) return "mobile";
  if (width <= TABLET_SHELL_MAX_WIDTH) return "tablet";
  return "desktop";
}

function detectUiThemeShellMode(width: number, uiTheme: UiTheme): ShellMode {
  if (typeof window !== "undefined") {
    const mobileHint = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
    const userAgent = navigator.userAgent;
    const phoneUserAgent = /iPhone|iPod/i.test(userAgent) || (/Android/i.test(userAgent) && /\bMobile\b/i.test(userAgent));
    const tabletUserAgent = /iPad/i.test(userAgent) || (/Android/i.test(userAgent) && mobileHint !== true && !/\bMobile\b/i.test(userAgent));
    const screenShortSide = Math.min(window.screen.width, window.screen.height);
    const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    if (mobileHint === true || phoneUserAgent || (!tabletUserAgent && coarsePointer && screenShortSide > 0 && screenShortSide <= MOBILE_SHELL_MAX_WIDTH)) {
      return "mobile";
    }
    if ((tabletUserAgent || (coarsePointer && screenShortSide >= 768)) && width <= TABLET_SHELL_MAX_WIDTH) {
      return "tablet";
    }
  }
  return detectShellMode(width, MOBILE_SHELL_MAX_WIDTH);
}

function paneDensityFor(shellMode: ShellMode, paneCount: number): PaneDensity {
  if (shellMode === "desktop") {
    if (paneCount >= 12) return "tight";
    if (paneCount >= 8) return "dense";
    return "regular";
  }
  if (shellMode === "tablet") {
    return paneCount >= 6 ? "dense" : "regular";
  }
  return paneCount >= 6 ? "dense" : "regular";
}

const paneModeLabels: Record<Pane["mode"], string> = {
  CHAT: "Chat",
  CODE: "Code",
  BROWSER: "Browser",
  REVIEW: "Review",
  SWARM: "Swarm",
  DESIGN: "Design",
  TERMINAL: "CLI",
  YOUTUBE: "YouTube",
  VNC: "VNC",
  HARNESS: "Harness",
  LIVE: "Live",
  FILES: "Files",
  DATABASES: "Databases",
  DEMOS: "Demo Projects",
  T3CODE: "T3 Code"
};

function paneModeLabel(mode: Pane["mode"]): string {
  return paneModeLabels[mode];
}

function paneTitleForMode(mode: Pane["mode"], index: number): string {
  return `${paneModeLabel(mode)} ${index}`;
}

function formatPaneFullTitle(pane: Pick<Pane, "mode" | "title"> & { paneName?: string | null }): string {
  const baseTitle = pane.mode === "TERMINAL" ? pane.title.replace(/^Terminal\b/i, "CLI") : pane.title;
  if (!pane.paneName) return baseTitle;
  if (!baseTitle || baseTitle.trim().toLowerCase() === pane.paneName.trim().toLowerCase()) return pane.paneName;
  return `${pane.paneName} · ${baseTitle}`;
}

/** Second line of a minimized pane card: the task title, or the CLI / pane type when there is none. */
function minimizedPaneSubtitle(pane: Pick<Pane, "mode" | "title" | "terminalRuntimeId"> & { paneName?: string | null }): string {
  const baseTitle = pane.mode === "TERMINAL" ? pane.title.replace(/^Terminal\b/i, "CLI") : pane.title;
  if (pane.paneName && baseTitle && baseTitle.trim().toLowerCase() !== pane.paneName.trim().toLowerCase()) return baseTitle;
  if (pane.mode === "TERMINAL") return cliRuntimeLabel(pane.terminalRuntimeId) ?? "CLI";
  return paneModeLabel(pane.mode);
}

function sortRoomsByOrder(rooms: Room[]): Room[] {
  return [...rooms].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    const leftCreatedAt = Date.parse(left.createdAt);
    const rightCreatedAt = Date.parse(right.createdAt);
    if (!Number.isNaN(leftCreatedAt) && !Number.isNaN(rightCreatedAt) && leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }
    return left.id.localeCompare(right.id);
  });
}

const ROOM_CATALOG_PAGE_SIZE = 100;
const ROOM_CATALOG_MAX_PAGES = 20;

async function loadBoundedRoomCatalog(): Promise<Room[]> {
  const firstPage = await api.rooms({ page: 1, pageSize: ROOM_CATALOG_PAGE_SIZE, all: true });
  const reportedPageCount = firstPage.pagination.totalPages;
  const pageCount = Number.isSafeInteger(reportedPageCount) && reportedPageCount > 1
    ? Math.min(reportedPageCount, ROOM_CATALOG_MAX_PAGES)
    : 1;
  if (pageCount === 1) return firstPage.data;

  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      api.rooms({ page: index + 2, pageSize: ROOM_CATALOG_PAGE_SIZE, all: true })
    )
  );
  return [firstPage, ...remainingPages].flatMap((page) => page.data);
}

function reorderRoomsById(rooms: Room[], draggedRoomId: string, targetRoomId: string): Room[] {
  if (draggedRoomId === targetRoomId) return rooms;
  const draggedIndex = rooms.findIndex((room) => room.id === draggedRoomId);
  const targetIndex = rooms.findIndex((room) => room.id === targetRoomId);
  if (draggedIndex === -1 || targetIndex === -1) return rooms;
  const next = [...rooms];
  const [draggedRoom] = next.splice(draggedIndex, 1);
  if (!draggedRoom) return rooms;
  const insertionIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
  next.splice(insertionIndex, 0, draggedRoom);
  return next.map((room, index) => (room.order === index ? room : { ...room, order: index }));
}



function readStoredTerminalFontSize(): number {
  if (typeof window === "undefined") return DEFAULT_TERMINAL_FONT_SIZE;
  const storedValue = getSpaceRuntime().platform.localStorage.getItem(TERMINAL_FONT_SIZE_STORAGE_KEY);
  if (!storedValue) return DEFAULT_TERMINAL_FONT_SIZE;
  const stored = Number(storedValue);
  if (!Number.isFinite(stored)) return DEFAULT_TERMINAL_FONT_SIZE;
  return Math.min(MAX_TERMINAL_FONT_SIZE, Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(stored)));
}

function readStoredBoolean(key: string): boolean {
  if (typeof window === "undefined") return false;
  return getSpaceRuntime().platform.localStorage.getItem(key) === "true";
}

function readStoredBooleanDefaultTrue(key: string): boolean {
  if (typeof window === "undefined") return true;
  const stored = getSpaceRuntime().platform.localStorage.getItem(key);
  return stored === null ? true : stored === "true";
}

function readStoredRoomTheme(): RoomTheme {
  if (typeof window === "undefined") return "graphite";
  const stored = getSpaceRuntime().platform.localStorage.getItem(ROOM_THEME_STORAGE_KEY);
  return roomThemes.some((theme) => theme.id === stored) ? (stored as RoomTheme) : "graphite";
}

const LIVE_RAIL_GRAPHIC_DISABLED_STORAGE_KEY = "space.liveRail.graphicDisabled.v1";

const ROOM_EXTRA_EMPTY_SLOTS_STORAGE_KEY = "space:room-extra-empty-slots.v1";

function readStoredRoomExtraEmptySlots(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = getSpaceRuntime().platform.localStorage.getItem(ROOM_EXTRA_EMPTY_SLOTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") {
      const clamped: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "number" && Number.isFinite(v)) {
          clamped[k] = Math.max(0, Math.min(6, Math.round(v)));
        }
      }
      return clamped;
    }
    return {};
  } catch {
    return {};
  }
}

const migratedCliToolbarStorages = new WeakSet<Storage>();

function migrateLegacyCliToolbarPreferences(storage: Storage): void {
  if (migratedCliToolbarStorages.has(storage)) return;
  migratedCliToolbarStorages.add(storage);
  const pairs: Array<readonly [string, string]> = [
    [`${PANE_TOOLBAR_HIDDEN_ACTIONS_STORAGE_KEY_PREFIX}.TERMINAL`, SHARED_CODEX_TOOLBAR_HIDDEN_STORAGE_KEY],
    [`${PANE_TOOLBAR_ACTION_ORDER_STORAGE_KEY_PREFIX}.TERMINAL`, SHARED_CODEX_TOOLBAR_ORDER_STORAGE_KEY]
  ];
  try {
    for (const [legacyKey, sharedKey] of pairs) {
      if (storage.getItem(sharedKey) !== null) continue;
      const legacyValue = storage.getItem(legacyKey);
      if (legacyValue !== null) storage.setItem(sharedKey, legacyValue);
    }
  } catch {
    // The toolbar still works with in-memory defaults when browser storage is unavailable.
  }
}

function pickCliMemorySaveModelId(models: Model[]): string {
  const exactMatch = models.find((model) => model.id === "gpt-5-mini");
  if (exactMatch) return exactMatch.id;
  const miniCodexModel = models.find((model) => model.providerId === "codex" && /mini/i.test(model.id));
  if (miniCodexModel) return miniCodexModel.id;
  const genericMiniModel = models.find((model) => /mini/i.test(model.id));
  return genericMiniModel?.id ?? "gpt-5-mini";
}

function dispatchAgentPaneAttachments(paneId: string, artifacts: Artifact[]) {
  dispatchAgentPaneAttachmentsEvent({ paneId, artifacts });
}

function dispatchBrowserPaneAction(paneId: string, action: BrowserPaneAction) {
  dispatchBrowserPaneActionEvent({ paneId, action });
}

function isRoomNotFoundError(error: unknown, roomId: string): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("NOT_FOUND") && error.message.includes(`Room ${roomId} was not found`);
}











function applyServerUserSettings(
  storage: Storage,
  settings: UserSettings,
  currentUiTheme: UiTheme,
  currentModernAppearance: ModernAppearance,
  currentModernIconPack: ModernIconPack,
  currentUiBackground: UiBackground = "spaceapp",
  userId?: string
): { themeChanged: boolean } {
  let { themeChanged } = syncFromServer(settings, storage, userId);
  if (settings.uiTheme && settings.uiTheme !== currentUiTheme) themeChanged = true;
  if (settings.modernAppearance && settings.modernAppearance !== currentModernAppearance) themeChanged = true;
  if (settings.modernIconPack && settings.modernIconPack !== currentModernIconPack) themeChanged = true;
  if (settings.uiBackground && settings.uiBackground !== currentUiBackground) themeChanged = true;
  return { themeChanged };
}

export function App() {
  useEffect(() => bindSpaceMediaVolume(), []);
  useEffect(() => clearLegacyCliShortcutUsage(), []);
  const runtime = getSpaceRuntime();
  const runtimeKind = getSpaceRuntimeKind();
  const { ensureServerSettings } = useVoiceInput();
  const {
    windows: stickyWindows,
    openNew: openStickyNote,
    closeWindow: closeStickyWindow,
    updateWindow: updateStickyWindow,
    bringToFront: bringStickyWindowToFront
  } = useStickyNoteWindows();
  const desktopWidgets = useDesktopWidgets();

  useEffect(() => {
    const handler = (e: Event) => {
      const item = (e as CustomEvent<ClipboardItem | null>).detail;
      openStickyNote(item);
    };
    window.addEventListener("space:sticky-note:open", handler);
    return () => window.removeEventListener("space:sticky-note:open", handler);
  }, [openStickyNote]);
  migrateLegacyCliToolbarPreferences(runtime.platform.localStorage);
  const [uiTheme] = useState<UiTheme>(() => readUiTheme(runtime.platform.localStorage));
  const [roomToolbarStorageKeys] = useState(() => {
    const storageKeys = uiTheme !== "classic"
      ? modernRoomToolbarStorageKeys()
      : {
          hidden: ROOM_TOOLBAR_HIDDEN_ACTIONS_STORAGE_KEY,
          order: ROOM_TOOLBAR_ACTION_ORDER_STORAGE_KEY
        };
    if (uiTheme !== "classic") {
      migrateModernToolbarPreference(
        runtime.platform.localStorage,
        ROOM_TOOLBAR_HIDDEN_ACTIONS_STORAGE_KEY,
        storageKeys.hidden
      );
      migrateModernToolbarPreference(
        runtime.platform.localStorage,
        ROOM_TOOLBAR_ACTION_ORDER_STORAGE_KEY,
        storageKeys.order
      );
    }
    return storageKeys;
  });
  const [modernAppearance] = useState<ModernAppearance>(() => readModernAppearance(runtime.platform.localStorage));
  const [modernIconPack] = useState<ModernIconPack>(() => readModernIconPack(runtime.platform.localStorage));
  const [uiBackground] = useState<UiBackground>(() => readUiBackground(runtime.platform.localStorage));
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const modernColorMode = uiTheme === "codex" || uiTheme === "motion" ? "dark" : resolveModernColorMode(modernAppearance, systemPrefersDark);
  useEffect(() => {
    document.documentElement.dataset.interfaceTheme = uiTheme;
    document.documentElement.dataset.uiBackground = uiBackground;
    return () => {
      delete document.documentElement.dataset.interfaceTheme;
      delete document.documentElement.dataset.uiBackground;
    };
  }, [uiTheme, uiBackground]);
  const [toolbarVpnRoute, setToolbarVpnRoute] = useState<CliEgressRouteId | null>(null);
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    body.setAttribute("data-ui-background", uiBackground);
    html.setAttribute("data-ui-background", uiBackground);
    if (uiTheme === "classic") {
      body.removeAttribute("data-ui-theme");
      body.removeAttribute("data-color-mode");
      body.removeAttribute("data-icon-pack");
      html.removeAttribute("data-color-mode");
      html.style.colorScheme = "dark";
      return () => {
        body.removeAttribute("data-ui-background");
        html.removeAttribute("data-ui-background");
      };
    }
    body.setAttribute("data-ui-theme", "modern");
    body.setAttribute("data-color-mode", modernColorMode);
    body.setAttribute("data-icon-pack", modernIconPack);
    html.setAttribute("data-color-mode", modernColorMode);
    html.style.colorScheme = modernColorMode;
    return () => {
      if (body.getAttribute("data-ui-theme") === "modern") body.removeAttribute("data-ui-theme");
      if (body.getAttribute("data-color-mode") === modernColorMode) body.removeAttribute("data-color-mode");
      if (body.getAttribute("data-icon-pack") === modernIconPack) body.removeAttribute("data-icon-pack");
      if (html.getAttribute("data-color-mode") === modernColorMode) html.removeAttribute("data-color-mode");
      body.removeAttribute("data-ui-background");
      html.removeAttribute("data-ui-background");
    };
  }, [modernColorMode, modernIconPack, uiTheme, uiBackground]);
  const [auth, setAuth] = useState<AuthMe | null>(null);
  const [adminModeRequested, setAdminModeRequestedState] = useState(() => readStoredBoolean(ADMIN_MODE_REQUESTED_STORAGE_KEY));
  const setAdminModeRequested = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    setAdminModeRequestedState((current) => {
      const value = typeof next === "function" ? next(current) : next;
      try {
        runtime.platform.localStorage.setItem(ADMIN_MODE_REQUESTED_STORAGE_KEY, String(value));
      } catch {
        // storage unavailable
      }
      return value;
    });
  }, [runtime.platform.localStorage]);
  const isAdminMode = auth?.user?.role === "ADMIN" && adminModeRequested;
  const [roomExtraEmptySlots, setRoomExtraEmptySlots] = useState<Record<string, number>>(() => readStoredRoomExtraEmptySlots());
  const updateRoomExtraEmptySlots = useCallback((roomId: string, targetOrDelta: number, isAbsolute = false) => {
    setRoomExtraEmptySlots((prev) => {
      const current = prev[roomId] ?? 0;
      const nextVal = Math.max(0, Math.min(6, isAbsolute ? targetOrDelta : current + targetOrDelta));
      const next = { ...prev, [roomId]: nextVal };
      try {
        runtime.platform.localStorage.setItem(ROOM_EXTRA_EMPTY_SLOTS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      if (auth?.isAuthenticated) {
        saveUserSettingDebounced("roomExtraEmptySlots", next);
      }
      return next;
    });
  }, [runtime.platform.localStorage, auth?.isAuthenticated]);
  const [isDemoModeActive, setIsDemoModeActive] = useState(false);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const voiceSettingsAuthUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!auth?.isAuthenticated) return;
    const interval = window.setInterval(() => {
      void refreshCliVpnRoutingStatus().catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [auth?.isAuthenticated]);

  useEffect(() => {
    if (!auth?.isAuthenticated) {
      setToolbarVpnRoute(null);
      return;
    }
    let active = true;
    const refresh = () => {
      void api
        .cliVpnRoutingStatus()
        .then((status) => {
          if (active) setToolbarVpnRoute(status.selectedRoute);
        })
        .catch(() => {
          if (active) setToolbarVpnRoute(null);
        });
      void api
        .cliRuntimeSettings()
        .then((settings) => {
          if (active) setCliRuntimeSettings(settings);
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener(CLI_VPN_ROUTING_STATUS_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(CLI_VPN_ROUTING_STATUS_EVENT, refresh);
    };
  }, [auth?.isAuthenticated]);

  useEffect(() => {
    const authenticatedUserId = auth?.isAuthenticated ? auth.user?.id ?? "authenticated" : null;
    if (!authenticatedUserId) {
      voiceSettingsAuthUserIdRef.current = null;
      return;
    }
    if (voiceSettingsAuthUserIdRef.current === authenticatedUserId) return;
    voiceSettingsAuthUserIdRef.current = authenticatedUserId;
    void ensureServerSettings();
  }, [auth?.isAuthenticated, auth?.user?.id, ensureServerSettings]);
  const [authBootstrapError, setAuthBootstrapError] = useState<string | null>(null);
  const [appView, setAppView] = useState<AppView>(readAppView);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomSearch, setRoomSearch] = useState("");
  const [adminRoomFilterMode, setAdminRoomFilterMode] = useState<"mine" | "all" | "user">("mine");
  const [adminSelectedUserId, setAdminSelectedUserId] = useState<string>("");
  const [adminUsersList, setAdminUsersList] = useState<AdminUserItem[]>([]);

  // T3 Code is the owner's: warm its client bundle once the page is idle.
  useEffect(() => {
    if (auth?.user?.role === "ADMIN") scheduleT3BundlePrefetch();
  }, [auth?.user?.role]);

  useEffect(() => {
    if (auth?.user?.role === "ADMIN") {
      api.listAdminUsers()
        .then((res) => {
          if (Array.isArray(res?.users)) {
            setAdminUsersList(res.users);
          }
        })
        .catch(() => {});
    }
  }, [auth?.user?.role]);

  const userEmailById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of adminUsersList) {
      map.set(u.id, u.email || u.id);
    }
    return map;
  }, [adminUsersList]);

  // Compute live room counts per user from the current rooms state
  // (overrides the DB snapshot count from listAdminUsers which may be stale)
  const liveRoomCountByUserId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rooms) {
      if (r.ownerUserId) {
        map.set(r.ownerUserId, (map.get(r.ownerUserId) ?? 0) + 1);
      }
    }
    return map;
  }, [rooms]);

  // Merge adminUsersList with live room counts
  const adminUsersListWithLiveCounts = useMemo(() => {
    return adminUsersList.map((u) => ({
      ...u,
      roomCount: liveRoomCountByUserId.get(u.id) ?? u.roomCount,
    }));
  }, [adminUsersList, liveRoomCountByUserId]);

  const roomsPanelRef = useRef<HTMLDivElement | null>(null);
  const [showDownloadBanner, setShowDownloadBanner] = useState(true);
  const [roomListOverflow, setRoomListOverflow] = useState(false);
  const [roomListMaxHeight, setRoomListMaxHeight] = useState<number | null>(null);
  const [roomPaneCounts, setRoomPaneCounts] = useState<Record<string, number>>({});
  const [roomCliActivityCounts, setRoomCliActivityCounts] = useState<Record<string, number>>({});
  const [roomCliRuntimeIds, setRoomCliRuntimeIds] = useState<Record<string, string[]>>({});
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(() => readStoredSessionString(SELECTED_ROOM_ID_STORAGE_KEY));
  const [roomRuntimes, setRoomRuntimes] = useState<Record<string, RoomRuntimeSnapshot>>({});
  const [roomPaneLoadStates, setRoomPaneLoadStates] = useState<Record<string, RoomPaneLoadState>>({});
  const [displayedRoomId, setDisplayedRoomId] = useState<string | null>(selectedRoomId);
  const [preparingRoomId, setPreparingRoomId] = useState<string | null>(null);
  const [panes, setPanes] = useState<Pane[]>([]);
  const [liveRailStatus, setLiveRailStatus] = useState<"idle" | "connecting" | "active" | "listening" | "thinking" | "speaking" | "error">("idle");
  const [liveRailContextMenu, setLiveRailContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [liveDebugToast, setLiveDebugToast] = useState<{ id: number; message: string; type: "info" | "success" | "error" } | null>(null);
  const liveDebugTimerRef = useRef<number | null>(null);

  const showLiveDebug = useCallback((message: string, type: "info" | "success" | "error" = "info") => {
    console.log(`[AI-Live-Debug][${type.toUpperCase()}] ${message}`);
    if (liveDebugTimerRef.current !== null) window.clearTimeout(liveDebugTimerRef.current);
    setLiveDebugToast({ id: Date.now(), message, type });
    liveDebugTimerRef.current = window.setTimeout(() => {
      setLiveDebugToast(null);
      liveDebugTimerRef.current = null;
    }, 4500);
  }, []);

  useEffect(() => {
    const handleDebug = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; type?: "info" | "success" | "error" }>).detail;
      if (detail?.message) showLiveDebug(detail.message, detail.type || "info");
    };
    window.addEventListener("space-live-debug", handleDebug);
    return () => window.removeEventListener("space-live-debug", handleDebug);
  }, [showLiveDebug]);

  const [isLiveRailGraphicDisabled, setIsLiveRailGraphicDisabled] = useState<boolean>(() => readStoredBoolean(LIVE_RAIL_GRAPHIC_DISABLED_STORAGE_KEY));
  const [activeCategoryColorByRoom, setActiveCategoryColorByRoom] = useState<Record<string, PaneCategoryColor>>({});
  const [selectedPaneId, setSelectedPaneId] = useState<string | null>(() => readStoredSessionString(SELECTED_PANE_ID_STORAGE_KEY));
  const [shellMode, setShellMode] = useState<ShellMode>(() => detectUiThemeShellMode(readViewportWidth(), uiTheme));
  const [roomNamePreview, setRoomNamePreview] = useState<string | null>(null);
  const roomNameHoldTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (roomNameHoldTimerRef.current !== null) window.clearTimeout(roomNameHoldTimerRef.current);
  }, []);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [roomEvents, setRoomEvents] = useState<SpaceEvent[]>([]);
  const bridgedPlanEventsRef = useRef(new Set<string>());
  useEffect(() => {
    // Presentation invalidation from the shared persisted room feed, including replay/fallback.
    for (const event of roomEvents) {
      if (event.type !== "PLAN_EXECUTION_UPDATED" || bridgedPlanEventsRef.current.has(event.id)) continue;
      bridgedPlanEventsRef.current.add(event.id);
      bridgePlanExecutionEvent(event);
    }
    if (bridgedPlanEventsRef.current.size > 256) {
      bridgedPlanEventsRef.current = new Set([...bridgedPlanEventsRef.current].slice(-256));
    }
  }, [roomEvents]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[]>([]);
  const [swarmState, setSwarmState] = useState<SwarmState | null>(null);
  const [readiness, setReadiness] = useState<ReadyzPayload | null>(null);
  const [mcp, setMcp] = useState<McpPayload | null>(null);
  const [latestMcpSmoke, setLatestMcpSmoke] = useState<McpDiscoverySmokeCheck | null>(null);
  const [latestMemoryEmbeddingSmoke, setLatestMemoryEmbeddingSmoke] = useState<MemoryEmbeddingSmokeCheck | null>(null);
  const [latestMemoryVectorReadiness, setLatestMemoryVectorReadiness] = useState<MemoryVectorReadiness | null>(null);
  const [codexAppServer, setCodexAppServer] = useState<CodexAppServerStatus | null>(null);
  const [latestCodexHandshake, setLatestCodexHandshake] = useState<CodexAppServerHandshakeCheck | null>(null);
  const [latestCodexTurnSmoke, setLatestCodexTurnSmoke] = useState<CodexAppServerTurnSmokeCheck | null>(null);
  const [observability, setObservability] = useState<ObservabilitySnapshot | null>(null);
  const [workerReadiness, setWorkerReadiness] = useState<WorkerReadiness | null>(null);
  const [storageReadiness, setStorageReadiness] = useState<StorageReadiness | null>(null);
  const [storageWarning, setStorageWarning] = useState<string>("");
  const [dismissedStorageWarning, setDismissedStorageWarning] = useState<string | null>(() =>
    readStoredSessionString(DISMISSED_STORAGE_WARNING_STORAGE_KEY)
  );
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const [clipToolNotice, setClipToolNotice] = useState<string | null>(null);
  useAutoDismiss(clipToolNotice, setClipToolNotice);
  const [watchdogAlerts, setWatchdogAlerts] = useState<Array<{ id: string; message: string; timestamp: string }>>([]);

  useEffect(() => {
    const handleWatchdogCustomEvent = (customEvent: globalThis.Event) => {
      const detail = (customEvent as CustomEvent<{ id?: string; message: string; timestamp?: string }>).detail;
      if (!detail?.message) return;
      const id = detail.id ?? `watchdog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setWatchdogAlerts((current) => {
        if (current.some((item) => item.id === id)) return current;
        return [...current, { id, message: detail.message, timestamp: detail.timestamp ?? new Date().toISOString() }];
      });
    };
    window.addEventListener("space:room-watchdog-alert", handleWatchdogCustomEvent as EventListener);
    return () => {
      window.removeEventListener("space:room-watchdog-alert", handleWatchdogCustomEvent as EventListener);
    };
  }, []);
  const [codexEnvironmentSummary, setCodexEnvironmentSummary] = useState<CodexEnvironment | null>(null);
  // Panes only read isCodexEnabled; keep their prop stable across the 30 s
  // environment poll so cached rooms do not re-render on every check.
  const paneCodexEnabled = codexEnvironmentSummary ? codexEnvironmentSummary.isCodexEnabled : null;
  const paneCodexEnvironment = useMemo(
    () => (paneCodexEnabled === null ? null : { isCodexEnabled: paneCodexEnabled }),
    [paneCodexEnabled]
  );
  const isCodexEnabled = codexEnvironmentSummary?.isCodexEnabled ?? true;
  const [cliRuntimeSettings, setCliRuntimeSettings] = useState<CliRuntimeSettingsResponse | null>(null);
  const anyCliEnabled = cliRuntimeSettings?.settings.some((setting) => setting.enabled) ?? true;
  const isHarnessEnabled = cliRuntimeSettings?.harness?.enabled ?? true;
  const [restoredDock] = useState(() => readDockSession(runtime.platform.sessionStorage, Object.keys(sideSurfaceMeta)));
  const [activeSideSurface, setActiveSideSurface] = useState<SideSurface>(() => (restoredDock?.surface as SideSurface | undefined) ?? "rooms");
  const [sourceControlEnabled, setSourceControlEnabled] = useState(false);
  const { hiddenDockIds, isDockHidden } = useDocksVisibility();
  const { hiddenPaneIds, isPaneHidden } = usePanesVisibility();
  const { hiddenWidgetIds, isWidgetHidden } = useWidgetsVisibility();
  const [isRoomFocusMode, setIsRoomFocusMode] = useState(() => readStoredBoolean(ROOM_FOCUS_MODE_STORAGE_KEY));
  const [isRoomToolbarHidden, setIsRoomToolbarHidden] = useState(() => readStoredBoolean(ROOM_TOOLBAR_HIDDEN_STORAGE_KEY));
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(() => isDocumentFullscreen());

  useEffect(() => {
    preloadDockModules();
  }, []);

  useEffect(() => {
    const bridge = (window as any).spaceDesktop;
    let disposed = false;
    const handleFullscreenChange = () => {
      if (typeof bridge?.isFullscreen === "function") {
        void bridge.isFullscreen().then((fullscreen: boolean) => {
          if (!disposed) setIsBrowserFullscreen(fullscreen || isDocumentFullscreen());
        }).catch(() => {});
      } else {
        setIsBrowserFullscreen(isDocumentFullscreen());
      }
    };
    const unsubscribe = bridge?.onFullscreenChange?.((fullscreen: boolean) => {
      if (!disposed) setIsBrowserFullscreen(fullscreen);
    });
    if (typeof bridge?.isFullscreen === "function") {
      void bridge.isFullscreen().then((fullscreen: boolean) => {
        if (!disposed) setIsBrowserFullscreen(fullscreen);
      }).catch(() => {});
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F11") {
        event.preventDefault();
        void toggleBrowserFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      disposed = true;
      if (typeof unsubscribe === "function") unsubscribe();
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  const [isMobilePaneFocusMode, setIsMobilePaneFocusMode] = useState(false);
  const [isDesktopSideSurfaceOpen, setIsDesktopSideSurfaceOpen] = useState(() => restoredDock?.desktopOpen ?? !readStoredBoolean(SIDE_SURFACE_HIDDEN_STORAGE_KEY));
  const [isCompactSideSurfaceOpen, setIsCompactSideSurfaceOpen] = useState(() => restoredDock?.compactOpen ?? false);
  const compactSideSurfaceRef = useRef<HTMLElement>(null);
  const compactSideSurfaceTriggerRef = useRef<HTMLElement | null>(null);
  const [terminalFontSize, setTerminalFontSize] = useState(readStoredTerminalFontSize);
  const [cliImagePreviewLimit, setCliImagePreviewLimit] = useState(readStoredCliImagePreviewLimit);
  const [warmRoomEnabled, setWarmRoomEnabled] = useState(readStoredWarmRoomEnabled);
  const [warmConnectedPaneLimit, setWarmConnectedPaneLimit] = useState(readStoredWarmRoomConnectedPaneLimit);
  const [suppressNotifications, setSuppressNotifications] = useState(readStoredSuppressNotifications);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-suppress-notifications", String(suppressNotifications));
    if (document.body) {
      document.body.setAttribute("data-suppress-notifications", String(suppressNotifications));
    }
  }, [suppressNotifications]);
  const [showSessionDebugIds, setShowSessionDebugIds] = useState(() => readStoredBooleanDefaultTrue(SESSION_DEBUG_IDS_STORAGE_KEY));
  const [cliDebugModeEnabled, setCliDebugModeEnabled] = useState(() => readStoredBoolean(CLI_DEBUG_MODE_STORAGE_KEY));
  const appDiagnosticsState = useDiagnosticsState();
  const [debugModePending, setDebugModePending] = useState(false);
  const canManageDiagnostics = auth?.user?.role === "ADMIN";
  const isAppDiagnosticsEnabled = Boolean(appDiagnosticsState.status?.isEnabled);
  const isDebugModeActive = canManageDiagnostics ? isAppDiagnosticsEnabled : cliDebugModeEnabled;

  const toggleDebugMode = useCallback(async () => {
    if (debugModePending) return;
    const nextEnabled = !isDebugModeActive;
    setDebugModePending(true);
    try {
      try {
        const updated = await api.updateAppDiagnosticsStatus(nextEnabled);
        await applyAppDiagnosticsStatus(updated);
      } catch (diagError) {
        console.warn("App diagnostics update error:", diagError);
      }
      setCliDebugModeEnabled(nextEnabled);
    } catch (error) {
      console.error("Failed to toggle debug mode", error);
    } finally {
      setDebugModePending(false);
    }
  }, [debugModePending, isDebugModeActive]);
  const [cliFloatsHidden, setCliFloatsHidden] = useState(() => readStoredBoolean(CLI_FLOATS_HIDDEN_STORAGE_KEY));
  const [maskSensitiveData, setMaskSensitiveData] = useState(() =>
    readStoredBoolean(SPACE_SENSITIVE_DATA_MASKED_STORAGE_KEY)
  );
  const [roomTheme, setRoomTheme] = useState<RoomTheme>(readStoredRoomTheme);
  useEffect(() => {
    const body = document.body;
    if (uiTheme === "classic") {
      body.removeAttribute("data-room-theme");
      return;
    }
    body.setAttribute("data-room-theme", roomTheme);
    return () => {
      if (body.getAttribute("data-room-theme") === roomTheme) {
        body.removeAttribute("data-room-theme");
      }
    };
  }, [roomTheme, uiTheme]);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isPaneLayoutMenuOpen, setIsPaneLayoutMenuOpen] = useState(false);
  const [isCollapsedPaneLayoutMenuOpen, setIsCollapsedPaneLayoutMenuOpen] = useState(false);
  const [paneLayoutPending, setPaneLayoutPending] = useState(false);
  const paneLayoutSequenceRef = useRef(0);
  const [vpnCityNotice, setVpnCityNotice] = useState<string | null>(null);
  const [vpnCityPending, setVpnCityPending] = useState(false);
  useAutoDismiss(vpnCityNotice, setVpnCityNotice);
  const [paneLayoutError, setPaneLayoutError] = useState<string | null>(null);
  const [isPaneSpanAllMenuOpen, setIsPaneSpanAllMenuOpen] = useState(false);
  const [paneSpanAllPending, setPaneSpanAllPending] = useState(false);
  const paneSpanSequenceRef = useRef(0);
  const [paneSpanAllError, setPaneSpanAllError] = useState<string | null>(null);
  const [isWorkspaceTextSizePickerOpen, setIsWorkspaceTextSizePickerOpen] = useState(false);
  const [isCliLauncherOpen, setIsCliLauncherOpen] = useState(false);
  const [isChatLauncherOpen, setIsChatLauncherOpen] = useState(false);
  const [cliPaneCreationPending, setCliPaneCreationPending] = useState(false);
  const [isVibeMusicOpen, setIsVibeMusicOpen] = useState(false);
  const [isSnipToolOpen, setIsSnipToolOpen] = useState(false);
  useEffect(() => {
    if (isSnipToolOpen) {
      document.body.setAttribute("data-snip-tool-active", "true");
    } else {
      document.body.removeAttribute("data-snip-tool-active");
    }
  }, [isSnipToolOpen]);
  const [isOskKeyboardOpen, setIsOskKeyboardOpen] = useState(false);
  const oskKeyboardMountedRef = useRef(false);
  const [isServerActionsMenuOpen, setIsServerActionsMenuOpen] = useState(false);
  const [manageLoginPending, setManageLoginPending] = useState(false);
  const manageLoginPendingRef = useRef(false);
  const [manageInitialAction, setManageInitialAction] = useState<string | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      if (auth?.user?.role !== "ADMIN") return;
      manageLoginPendingRef.current = false;
      setManageLoginPending(false);
      setManageInitialAction((event as CustomEvent<{action?: string}>).detail?.action ?? null);
      setIsServerActionsMenuOpen(true);
    };
    window.addEventListener("space:manage", open);
    return () => window.removeEventListener("space:manage", open);
  }, [auth?.user?.role]);

  const [isSetupConnectionsOpen, setIsSetupConnectionsOpen] = useState(false);
  const [workspaceSetupHost, setWorkspaceSetupHost] = useState<HTMLDivElement | null>(null);
  const workspaceSetupBack = useRef<(() => void) | null>(null);
  const setupFromWorkspace = useRef(false);
  const setupConnectionsMounted = useRef(false);
  if (workspaceSetupHost) setupFromWorkspace.current = true;
  if (isSetupConnectionsOpen || workspaceSetupHost) setupConnectionsMounted.current = true;
  const [isServerRestartDialogOpen, setIsServerRestartDialogOpen] = useState(false);
  const [adminCodexTool, setAdminCodexTool] = useState<AdminCodexTool | null>(null);
  const [adminOperationTool, setAdminOperationTool] = useState<AdminOperationTool | null>(null);
  const [isSystemServicesDialogOpen, setIsSystemServicesDialogOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const userManagementTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [serverRestartPending, setServerRestartPending] = useState(false);
  const [serverRestartMessage, setServerRestartMessage] = useState<string | null>(null);
  const [serverRestartError, setServerRestartError] = useState<string | null>(null);
  useAutoDismiss(serverRestartMessage, setServerRestartMessage);
  useAutoDismiss(serverRestartError, setServerRestartError);
  const [isCliRuntimeRestartAllDialogOpen, setIsCliRuntimeRestartAllDialogOpen] = useState(false);
  const [cliRuntimeRestartAllPending, setCliRuntimeRestartAllPending] = useState(false);
  const [cliRuntimeRestartAllMessage, setCliRuntimeRestartAllMessage] = useState<string | null>(null);
  const [cliRuntimeRestartAllError, setCliRuntimeRestartAllError] = useState<string | null>(null);
  useAutoDismiss(cliRuntimeRestartAllMessage, setCliRuntimeRestartAllMessage);
  useAutoDismiss(cliRuntimeRestartAllError, setCliRuntimeRestartAllError);
  const [restoreAllPending, setRestoreAllPending] = useState(false);
  const [minimizeAllPending, setMinimizeAllPending] = useState(false);
  const [isRoomRenameOpen, setIsRoomRenameOpen] = useState(false);
  const [isAgentsDashboardOpen, setIsAgentsDashboardOpen] = useState(false);
  const [agentsDashboardSummary, setAgentsDashboardSummary] = useState<AgentDashboardSummary | null>(null);
  const [isMemoryWorkspaceOpen, setIsMemoryWorkspaceOpen] = useState(false);
  const [workspaceNavigationDetail, setWorkspaceNavigationDetail] = useState<string | null>(null);
  const [workspaceUserLink, setWorkspaceUserLink] = useState<UserLink | null>(null);
  const [workspaceStickyItem, setWorkspaceStickyItem] = useState<ClipboardItem | null>(null);
  const roomDeleteConfirm = useDockConfirm();
  useEffect(() => {
    if (workspaceNavigationDetail !== "link-preview") setWorkspaceUserLink(null);
  }, [workspaceNavigationDetail]);
  const [workspaceMusicHost, setWorkspaceMusicHost] = useState<HTMLDivElement | null>(null);
  const workspaceMusicBack = useRef<(() => void) | null>(null);
  const [workspaceKeyboardHost, setWorkspaceKeyboardHost] = useState<HTMLDivElement | null>(null);
  const workspaceKeyboardBack = useRef<(() => void) | null>(null);
  const [resourceIndicatorsVisible, toggleResourceIndicators] = useResourceIndicators(auth?.user?.id);
  const [systemAnalyticsTab, setSystemAnalyticsTab] = useState<SystemAnalyticsTab | null>(null);
  useEffect(() => {
    if (systemAnalyticsTab) {
      openSystemHealth("analytics", systemAnalyticsTab);
      setSystemAnalyticsTab(null);
    }
  }, [systemAnalyticsTab]);


  const [activeUserLink, setActiveUserLink] = useState<UserLink | null>(null);
  const [isQuickLinksOpen, setIsQuickLinksOpen] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState("");
  const [roomProjectPathDraft, setRoomProjectPathDraft] = useState("");
  const [roomRenamePending, setRoomRenamePending] = useState(false);
  const [roomRenameError, setRoomRenameError] = useState<string | null>(null);
  useAutoDismiss(roomRenameError, setRoomRenameError);
  const [dockExpandedRoomId, setDockExpandedRoomId] = useState<string | null>(null);
  const [dockProjectPathDrafts, setDockProjectPathDrafts] = useState<Record<string, string>>({});
  const [dockProjectSavingRoomId, setDockProjectSavingRoomId] = useState<string | null>(null);
  const [defaultWorktreeEnabled, setDefaultWorktreeEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("space.worktree.defaultEnabled");
      if (stored !== null) return stored === "true";
    } catch {}
    return true; // Default true
  });
  const [roomWorktreeOverrides, setRoomWorktreeOverrides] = useState<Record<string, boolean>>(() => {
    try {
      const stored: Record<string, boolean> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("space.room.") && key.endsWith(".isolatedWorktree")) {
          const roomId = key.slice("space.room.".length, -".isolatedWorktree".length);
          stored[roomId] = localStorage.getItem(key) === "true";
        }
      }
      return stored;
    } catch {
      return {};
    }
  });

  function isRoomWorktreeEnabled(roomId: string): boolean {
    if (typeof roomWorktreeOverrides[roomId] === "boolean") {
      return roomWorktreeOverrides[roomId];
    }
    try {
      const stored = localStorage.getItem(`space.room.${roomId}.isolatedWorktree`);
      if (stored !== null) return stored === "true";
    } catch {}
    return defaultWorktreeEnabled;
  }

  function setRoomWorktreeEnabled(roomId: string, enabled: boolean) {
    try {
      localStorage.setItem(`space.room.${roomId}.isolatedWorktree`, String(enabled));
    } catch {}
    setRoomWorktreeOverrides((prev) => {
      const next = { ...prev, [roomId]: enabled };
      if (auth?.isAuthenticated) {
        saveUserSettingDebounced("roomWorktreeOverrides", next);
      }
      return next;
    });
  }
  const [projectPresets, setProjectPresets] = useState<{ label: string; path: string }[]>(() => {
    try {
      const saved = localStorage.getItem("space:project_presets");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = parsed.filter(
            (p) =>
              p.label !== "olla" &&
              p.label !== "workspace" &&
              !p.path?.includes("/olla") &&
              !p.path?.includes("/workspace")
          );
          localStorage.setItem("space:project_presets", JSON.stringify(filtered));
          return filtered.length > 0 ? filtered : DEFAULT_PROJECT_PRESETS;
        }
      }
    } catch {}
    return DEFAULT_PROJECT_PRESETS;
  });
  const [isAddingPresetRoomId, setIsAddingPresetRoomId] = useState<string | null>(null);
  const [newPresetDraft, setNewPresetDraft] = useState("");
  // Shared project picker: a room assignment is bound to the room that opened the picker.
  const [projectPickerRoom, setProjectPickerRoom] = useState<{ id: string; name: string } | null>(null);
  const [roomProjectSources, setRoomProjectSources] = useState<Record<string, string>>({});
  const latestRoomsRef = useRef(rooms);
  latestRoomsRef.current = rooms;

  function addOpenedProjectPreset(project: { label: string; path: string }) {
    setProjectPresets((prev) => {
      if (prev.some((p) => p.path === project.path)) return prev;
      let label = project.label;
      for (let index = 2; prev.some((p) => p.label.toLowerCase() === label.toLowerCase()); index++) label = `${project.label} (${index})`;
      const next = [...prev, { label, path: project.path }];
      try {
        localStorage.setItem("space:project_presets", JSON.stringify(next));
      } catch {}
      if (auth?.isAuthenticated) {
        saveUserSettingDebounced("projectPresets", next);
      }
      return next;
    });
  }

  async function assignPickedProjectToRoom(roomId: string, result: OpenProjectResult) {
    const targetRoom = latestRoomsRef.current.find((r) => r.id === roomId);
    if (!targetRoom) throw new Error("The room was removed. The project is ready; choose it again from another room.");
    const updated = await api.updateRoom(roomId, { name: targetRoom.name, projectPath: result.projectPath });
    setRooms((current) => current.map((r) => (r.id === roomId ? updated : r)));
    setDockProjectPathDrafts((prev) => ({ ...prev, [roomId]: result.projectPath }));
    setRoomProjectSources((prev) => ({ ...prev, [roomId]: `${result.source.label}${result.source.detail ? ` · ${result.source.detail}` : ""}` }));
  }

  async function ensureProjectFolder(targetPath: string) {
    if (!targetPath || !targetPath.trim()) return;
    try {
      // The shared client attaches the CSRF token that this mutation requires.
      await api.ensureProject({ path: targetPath.trim() });
    } catch {}
  }

  async function handleAddNewPreset(roomId: string) {
    const name = newPresetDraft.trim();
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) return;
    const projectPath = `/opt/spaceapp/projects/${name}`;
    await ensureProjectFolder(projectPath);
    setProjectPresets((prev) => {
      if (prev.some((p) => p.label.toLowerCase() === name.toLowerCase())) return prev;
      const next = [...prev, { label: name, path: projectPath }];
      try {
        localStorage.setItem("space:project_presets", JSON.stringify(next));
      } catch {}
      if (auth?.isAuthenticated) {
        saveUserSettingDebounced("projectPresets", next);
      }
      return next;
    });
    setDockProjectPathDrafts((prev) => ({ ...prev, [roomId]: projectPath }));
    setIsAddingPresetRoomId(null);
    setNewPresetDraft("");
    const targetRoom = rooms.find((r) => r.id === roomId);
    if (targetRoom) {
      try {
        const updated = await api.updateRoom(roomId, {
          name: targetRoom.name,
          projectPath
        });
        setRooms((current) => current.map((r) => (r.id === roomId ? updated : r)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save project");
      }
    }
  }

  async function saveDockProject(roomId: string) {
    if (dockProjectSavingRoomId) return;
    const targetRoom = rooms.find((r) => r.id === roomId);
    if (!targetRoom) return;
    setDockProjectSavingRoomId(roomId);
    const draft = dockProjectPathDrafts[roomId]?.trim() || null;
    try {
      if (draft) {
        await ensureProjectFolder(draft);
      }
      const updated = await api.updateRoom(roomId, {
        name: targetRoom.name,
        projectPath: draft
      });
      setRooms((current) => current.map((r) => (r.id === roomId ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project path");
    } finally {
      setDockProjectSavingRoomId(null);
    }
  }
  const [isRoomToolbarStacked, setIsRoomToolbarStacked] = useState(false);
  const [paneMoveDialog, setPaneMoveDialog] = useState<{
    pane: Pane;
    targetRoomId: string;
    pending: boolean;
    error: string | null;
  } | null>(null);
  const [paneMoveNotice, setPaneMoveNotice] = useState<string | null>(null);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  useAutoDismiss(accountNotice, setAccountNotice);
  useAutoDismiss(accountError, setAccountError);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const googleLinked = params.get("googleLinked");
      const googleLinkError = params.get("googleLinkError");
      const connectorResult = connectorResultMessage(params.get("connector"));
      if (connectorResult) {
        if (connectorResult.tone === "notice") setAccountNotice(connectorResult.text);
        else setAccountError(connectorResult.text);
        params.delete("connector");
        const query = params.toString();
        window.history.replaceState({}, document.title, `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      } else if (googleLinked === "true") {
        setAccountNotice("Google account linked. To save its browser sign-in, select it in a Browser or YouTube pane and choose “Sign in to selected account” once.");
        const nextUrl = window.location.pathname;
        window.history.replaceState({}, document.title, nextUrl);
      } else if (googleLinkError) {
        setAccountError(decodeURIComponent(googleLinkError));
        const nextUrl = window.location.pathname;
        window.history.replaceState({}, document.title, nextUrl);
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, []);
  const [roomReorderPending, setRoomReorderPending] = useState(false);
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
  const [dragOverRoomId, setDragOverRoomId] = useState<string | null>(null);
  const dragOverRoomIdRef = useRef<string | null>(null);
  const roomPointerDragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => roomPointerDragCleanupRef.current?.(), []);
  const [paneReorderPending, setPaneReorderPending] = useState(false);
  const [draggedPaneId, setDraggedPaneId] = useState<string | null>(null);
  const [paneDragOverId, setPaneDragOverId] = useState<string | null>(null);
  const [paneDragOverPosition, setPaneDragOverPosition] = useState<PaneDropPosition>("before");
  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paneCreationPendingMode, setPaneCreationPendingMode] = useState<Pane["mode"] | null>(null);
  const [roomCreationPending, setRoomCreationPending] = useState(false);
  const [deletePendingRoomId, setDeletePendingRoomId] = useState<string | null>(null);
  const [paneCompletionLifecycle, setPaneCompletionLifecycle] = useState<PaneCompletionLifecycleState>(
    createPaneCompletionLifecycleState
  );
  const rootRemSize = useRootRemSize();
  const [paneGridWidth, setPaneGridWidth] = useState(() => readViewportWidth());
  const [paneGridHeight, setPaneGridHeight] = useState(0);
  const [pendingBrowserHandoffPaneId, setPendingBrowserHandoffPaneId] = useState<string | null>(null);
  const [activeRoomEventStreamStatus, setActiveRoomEventStreamStatus] = useState<ActiveRoomEventStreamStatus>("idle");
  const cliMemorySaveModelId = useMemo(() => pickCliMemorySaveModelId(models), [models]);
  const previousShellModeRef = useRef<ShellMode | null>(null);
  const mobilePaneFocusRoomIdRef = useRef(selectedRoomId);
  const previousSelectedRoomIdRef = useRef<string | null>(null);
  const previousSelectedPaneIdRef = useRef<string | null>(null);
  const selectedRoomIdRef = useRef(selectedRoomId);
  const selectedPaneIdRef = useRef(selectedPaneId);
  const panesRef = useRef(panes);
  const turnsRef = useRef(turns);
  const roomEventsRef = useRef(roomEvents);
  const paneCompletionLifecycleRef = useRef(paneCompletionLifecycle);
  const swarmStateRef = useRef(swarmState);
  const roomRuntimesRef = useRef(roomRuntimes);
  const activeRuntimeRoomIdRef = useRef(selectedRoomId);
  const previousWarmRoomIdRef = useRef<string | null>(null);
  const displayedRoomIdRef = useRef<string | null>(displayedRoomId);
  const preparingRoomIdRef = useRef<string | null>(null);
  const roomPresentationGenerationRef = useRef(0);
  const scheduledRoomRevealRef = useRef<{ roomId: string; generation: number } | null>(null);
  const roomPresentationFailureTimeoutRef = useRef<number | null>(null);
  const roomPresentationMetricRef = useRef<{
    roomId: string;
    generation: number;
    startedAt: number;
    readyReported: boolean;
  } | null>(null);
  const roomRevealReadyPaneIdsRef = useRef(new Map<string, Set<string>>());
  const roomPresentedGeometryRef = useRef(new Map<string, string>());
  const roomRevealDebugLastMissingRef = useRef(new Map<string, string>());
  const roomTerminalBarrierWaitersRef = useRef(new Map<string, Set<() => void>>());
  const roomTerminalPrefillBarrierWaitersRef = useRef(new Map<string, Set<() => void>>());
  const roomRuntimeHydrationIdsRef = useRef(new Set<string>());
  const paneCompletionInitialReplayRoomIdsRef = useRef(new Set<string>());
  const roomPaneRequestSequenceRef = useRef(new Map<string, number>());
  const roomTurnsRequestSequenceRef = useRef(new Map<string, number>());
  const roomSwarmRequestSequenceRef = useRef(new Map<string, number>());
  const roomEventsRequestSequenceRef = useRef(new Map<string, number>());
  const roomPaneLoadPromisesRef = useRef(new Map<string, Promise<void>>());
  const roomTurnsLoadPromisesRef = useRef(new Map<string, Promise<void>>());
  const roomSwarmLoadPromisesRef = useRef(new Map<string, Promise<void>>());
  const roomEventsLoadPromisesRef = useRef(new Map<string, Promise<void>>());
  const settingsSurfaceDataPromiseRef = useRef<Promise<void> | null>(null);
  const healthSurfaceDataPromiseRef = useRef<Promise<void> | null>(null);
  const settingsSurfaceDataLoadedRef = useRef(false);
  const healthSurfaceDataLoadedRef = useRef(false);
  const [healthSurfaceError, setHealthSurfaceError] = useState<string | null>(null);
  const roomRuntimeLastPolledAtRef = useRef(new Map<string, number>());
  const roomRefreshQueueRef = useRef(createCoalescedRefreshQueue());
  const roomCatalogRefreshQueueRef = useRef(createCoalescedRefreshQueue());
  const requestRoomCatalogRefreshRef = useRef<() => Promise<void>>(async () => undefined);
  const warmRoomIdsRef = useRef<string[]>([]);
  const appMountedRef = useRef(true);
  const roomPaneLoadStatesRef = useRef(roomPaneLoadStates);
  const clipImageInputRef = useRef<HTMLInputElement | null>(null);
  const pendingClipImageTargetRef = useRef<ClipImageTarget | null>(null);
  const isCapturingScreenRef = useRef(false);
  const boardToolbarRef = useRef<HTMLDivElement | null>(null);
  const roomToolbarActionsRef = useRef<HTMLDivElement | null>(null);
  const roomToolbarScrollRef = useRef<HTMLDivElement | null>(null);
  const roomOverflowTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cliLauncherButtonRef = useRef<HTMLButtonElement | null>(null);
  const chatLauncherButtonRef = useRef<HTMLButtonElement | null>(null);
  const cliLauncherReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const cliPaneCreationPendingRef = useRef(false);
  const paneCreationPendingRef = useRef(false);
  const roomCreationPendingRef = useRef(false);
  const workspaceTextSizeButtonRef = useRef<HTMLButtonElement | null>(null);
  const vibeMusicButtonRef = useRef<HTMLButtonElement | null>(null);
  const quickLinksButtonRef = useRef<HTMLButtonElement | null>(null);
  const paneLayoutButtonRef = useRef<HTMLButtonElement | null>(null);
  const paneLayoutCollapsedButtonRef = useRef<HTMLButtonElement | null>(null);
  const collapsedToolbarRef = useRef<HTMLDivElement | null>(null);
  const [lowerRailVisibilityMenu, setLowerRailVisibilityMenu] = useState<RailVisibilityMenuState>(null);
  const lowerRailTouchContext = useTouchContextMenu(
    (source) => source instanceof Element && !source.closest(".room-live-rail-button, .touch-context-menu-trigger")
      ? source.closest<HTMLElement>(".room-toolbar-collapsed > button, .room-toolbar-collapsed > .toolbar-overflow > button")
      : null,
    ({ x, y }) => setLowerRailVisibilityMenu((current) => current ? null : { x, y })
  );
  const lowerRailVisibility = useRailVisibility(LOWER_RAIL_HIDDEN_KEY, LOWER_RAIL_VISIBILITY_IDS, LOWER_RAIL_NON_HIDEABLE);
  const vpnCityNoticeRef = useRef<HTMLDivElement | null>(null);
  const paneSpanAllButtonRef = useRef<HTMLButtonElement | null>(null);
  const roomThemeButtonRef = useRef<HTMLButtonElement | null>(null);
  const serverActionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const toolbarMetricsRef = useRef<ToolbarMetricsHandle | null>(null);
  const adminCodexToolTriggerRef = useRef<HTMLButtonElement | null>(null);
  const adminOperationToolTriggerRef = useRef<HTMLButtonElement | null>(null);
  const paneGridRef = useRef<HTMLDivElement | null>(null);
  const minimizedPaneRestoreRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingPaneHeaderFocusIdRef = useRef<string | null>(null);
  const paneColumnAnchorStartsRef = useRef<PaneColumnAnchorMap>(new Map());
  const previousPaneGridColumnCountRef = useRef<number | null>(null);
  const handledBrowserHandoffEventIdsRef = useRef(new Set<string>());
  const loadRoomRuntimeRef = useRef<(
    roomId: string,
    onPanesLoaded?: () => void,
    options?: { loadMetadata?: boolean }
  ) => Promise<void>>(async () => undefined);
  const refreshHiddenRoomRuntimeRef = useRef<(roomId: string) => Promise<void>>(async () => undefined);
  const loadRoomPanesRef = useRef<(roomId: string) => Promise<void>>(async () => undefined);
  const loadRoomTurnsRef = useRef<(roomId: string) => Promise<void>>(async () => undefined);
  const loadRoomSwarmRef = useRef<(roomId: string) => Promise<void>>(async () => undefined);
  const loadRoomEventsRef = useRef<(roomId: string) => Promise<void>>(async () => undefined);
  const requestRoomRefreshRef = useRef<(
    roomId: string,
    category: RoomRefreshCategory,
    reason: string
  ) => Promise<void>>(async () => undefined);

  selectedRoomIdRef.current = selectedRoomId;
  selectedPaneIdRef.current = selectedPaneId;
  panesRef.current = panes;
  turnsRef.current = turns;
  roomEventsRef.current = roomEvents;
  swarmStateRef.current = swarmState;
  roomRuntimesRef.current = roomRuntimes;
  roomPaneLoadStatesRef.current = roomPaneLoadStates;
  displayedRoomIdRef.current = displayedRoomId;
  preparingRoomIdRef.current = preparingRoomId;
  requestRoomCatalogRefreshRef.current = () =>
    roomCatalogRefreshQueueRef.current.request("rooms", async () => {
      const roomCatalog = await loadBoundedRoomCatalog();
      if (!appMountedRef.current) return;
      const nextRooms = sortRoomsByOrder(roomCatalog);
      setRooms((current) => reuseVersionedItems(current, nextRooms, (room) => room.updatedAt));
      const missingRoomId = selectedRoomIdRef.current;
      if (!missingRoomId || nextRooms.some((room) => room.id === missingRoomId)) return;

      const nextRoom = nextRooms[0] ?? null;
      activateRoom(nextRoom?.id ?? null);
      removeRoomRuntime(missingRoomId);
      if (nextRoom) {
        await loadRoomRuntimeRef.current(nextRoom.id);
        if (!appMountedRef.current) return;
        setError(`Room ${missingRoomId} no longer exists; switched to ${nextRoom.name}.`);
        return;
      }
      setError(`Room ${missingRoomId} no longer exists.`);
    });

  useSpaceClipboardCapture(Boolean(auth?.isAuthenticated));

  useEffect(() => {
    appMountedRef.current = true;
    return () => {
      appMountedRef.current = false;
      if (roomPresentationFailureTimeoutRef.current !== null) {
        window.clearTimeout(roomPresentationFailureTimeoutRef.current);
        roomPresentationFailureTimeoutRef.current = null;
      }
    };
  }, []);

  function closeAdminCodexTool() {
    setAdminCodexTool(null);
    window.requestAnimationFrame(() => adminCodexToolTriggerRef.current?.focus());
  }

  function closeAdminOperationTool() {
    setAdminOperationTool(null);
    window.requestAnimationFrame(() => adminOperationToolTriggerRef.current?.focus());
  }

  function closeUserManagement() {
    setIsUserManagementOpen(false);
    window.requestAnimationFrame(() => userManagementTriggerRef.current?.focus());
  }

  useLayoutEffect(() => {
    const paneId = pendingPaneHeaderFocusIdRef.current;
    const pane = panes.find((candidate) => candidate.id === paneId);
    if (!paneId || !pane || pane.isMinimized) return;
    const paneElement = Array.from(document.querySelectorAll<HTMLElement>("[data-space-pane-id]")).find(
      (element) => element.dataset.spacePaneId === paneId
    );
    if (!paneElement || paneElement.getAttribute("aria-hidden") === "true") return;
    const paneHeader = paneElement.querySelector<HTMLElement>("header");
    if (!paneHeader) return;
    paneHeader.focus();
    if (document.activeElement === paneHeader) pendingPaneHeaderFocusIdRef.current = null;
  }, [panes]);

  useEffect(() => {
    const syncViewFromLocation = () => {
      const nextView = readAppView();
      if (nextView === "help" || nextView === "benchmark") setIsVibeMusicOpen(false);
      setAppView(nextView);
    };
    window.addEventListener("popstate", syncViewFromLocation);
    return () => window.removeEventListener("popstate", syncViewFromLocation);
  }, []);

  useEffect(() => {
    document.title = appView === "help" ? "Space Help" : appView === "benchmark" ? "Space Benchmark" : "Space";
  }, [appView]);

  useEffect(() => {
    let dismissTimer: number | null = null;
    const handleClipboardNotice = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: unknown }>).detail;
      if (typeof detail?.message !== "string" || !detail.message.trim()) return;
      setClipboardNotice(detail.message);
      if (dismissTimer !== null) window.clearTimeout(dismissTimer);
      dismissTimer = window.setTimeout(() => setClipboardNotice(null), 5_000);
    };
    window.addEventListener(SPACE_CLIPBOARD_NOTICE_EVENT, handleClipboardNotice);
    return () => {
      if (dismissTimer !== null) window.clearTimeout(dismissTimer);
      window.removeEventListener(SPACE_CLIPBOARD_NOTICE_EVENT, handleClipboardNotice);
    };
  }, []);

  function roomRuntimeSnapshotsEqual(left: RoomRuntimeSnapshot | undefined, right: RoomRuntimeSnapshot): boolean {
    if (!left) return false;
    return left.roomId === right.roomId &&
      left.panes === right.panes &&
      left.turns === right.turns &&
      left.events === right.events &&
      left.swarm === right.swarm &&
      left.selectedPaneId === right.selectedPaneId &&
      left.bootstrappedPaneIds === right.bootstrappedPaneIds &&
      left.prefillReadyPaneIds === right.prefillReadyPaneIds &&
      left.lastAccessedAt === right.lastAccessedAt;
  }

  function replaceRoomRuntime(snapshot: RoomRuntimeSnapshot) {
    if (roomRuntimeSnapshotsEqual(roomRuntimesRef.current[snapshot.roomId], snapshot)) return;
    const next = { ...roomRuntimesRef.current, [snapshot.roomId]: snapshot };
    roomRuntimesRef.current = next;
    setRoomRuntimes((current) => {
      if (roomRuntimeSnapshotsEqual(current[snapshot.roomId], snapshot)) return current;
      return { ...current, [snapshot.roomId]: snapshot };
    });
  }

  function setRoomPaneLoadState(roomId: string, state: RoomPaneLoadState | null) {
    const current = roomPaneLoadStatesRef.current;
    if (state === null) {
      if (!current[roomId]) return;
      const next = { ...current };
      delete next[roomId];
      roomPaneLoadStatesRef.current = next;
      setRoomPaneLoadStates(next);
      return;
    }
    if (current[roomId] === state) return;
    const next = { ...current, [roomId]: state };
    roomPaneLoadStatesRef.current = next;
    setRoomPaneLoadStates(next);
  }

  function removeRoomRuntime(roomId: string) {
    roomPresentedGeometryRef.current.delete(roomId);
    roomRuntimeLastPolledAtRef.current.delete(roomId);
    warmRoomIdsRef.current = warmRoomIdsRef.current.filter((candidate) => candidate !== roomId);
    roomRevealReadyPaneIdsRef.current.delete(roomId);
    const barrierWaiters = roomTerminalBarrierWaitersRef.current.get(roomId);
    roomTerminalBarrierWaitersRef.current.delete(roomId);
    for (const resolve of barrierWaiters ?? []) resolve();
    const prefillBarrierWaiters = roomTerminalPrefillBarrierWaitersRef.current.get(roomId);
    roomTerminalPrefillBarrierWaitersRef.current.delete(roomId);
    for (const resolve of prefillBarrierWaiters ?? []) resolve();
    if (scheduledRoomRevealRef.current?.roomId === roomId) {
      scheduledRoomRevealRef.current = null;
    }
    roomPaneRequestSequenceRef.current.set(roomId, (roomPaneRequestSequenceRef.current.get(roomId) ?? 0) + 1);
    roomTurnsRequestSequenceRef.current.set(roomId, (roomTurnsRequestSequenceRef.current.get(roomId) ?? 0) + 1);
    roomSwarmRequestSequenceRef.current.set(roomId, (roomSwarmRequestSequenceRef.current.get(roomId) ?? 0) + 1);
    roomEventsRequestSequenceRef.current.set(roomId, (roomEventsRequestSequenceRef.current.get(roomId) ?? 0) + 1);
    roomPaneLoadPromisesRef.current.delete(roomId);
    roomTurnsLoadPromisesRef.current.delete(roomId);
    roomSwarmLoadPromisesRef.current.delete(roomId);
    roomEventsLoadPromisesRef.current.delete(roomId);
    setRoomPaneLoadState(roomId, null);
    if (!roomRuntimesRef.current[roomId]) return;
    const next = { ...roomRuntimesRef.current };
    delete next[roomId];
    roomRuntimesRef.current = next;
    setRoomRuntimes((current) => {
      if (!current[roomId]) return current;
      const retained = { ...current };
      delete retained[roomId];
      return retained;
    });
  }

  function snapshotActiveRoom(roomId: string, lastAccessedAt?: number): RoomRuntimeSnapshot {
    const existing = roomRuntimesRef.current[roomId];
    return {
      roomId,
      panes: panesRef.current,
      turns: turnsRef.current,
      events: roomEventsRef.current,
      swarm: swarmStateRef.current,
      selectedPaneId: selectedPaneIdRef.current,
      bootstrappedPaneIds: existing?.bootstrappedPaneIds ?? [],
      prefillReadyPaneIds: existing?.prefillReadyPaneIds ?? [],
      lastAccessedAt: lastAccessedAt ?? existing?.lastAccessedAt ?? Date.now()
    };
  }

  function applyRoomRuntime(snapshot: RoomRuntimeSnapshot) {
    panesRef.current = snapshot.panes;
    turnsRef.current = snapshot.turns;
    roomEventsRef.current = snapshot.events;
    swarmStateRef.current = snapshot.swarm;
    selectedPaneIdRef.current = snapshot.selectedPaneId;
    setPanes(snapshot.panes);
    setTurns(snapshot.turns);
    setRoomEvents(snapshot.events);
    setSwarmState(snapshot.swarm);
    setSelectedPaneId(snapshot.selectedPaneId);
  }

  function clearActiveRoomRuntime() {
    panesRef.current = [];
    turnsRef.current = [];
    roomEventsRef.current = [];
    swarmStateRef.current = null;
    selectedPaneIdRef.current = null;
    setPanes([]);
    setTurns([]);
    setRoomEvents([]);
    setSwarmState(null);
    setSelectedPaneId(null);
  }

  function visibleTerminalPaneIds(snapshot: RoomRuntimeSnapshot): string[] {
    const fullscreenLayout = rooms.find((room) => room.id === snapshot.roomId)?.paneLayoutColumns === 0;
    const shellVisibleIds = new Set(
      shellVisiblePaneIds(snapshot.panes, snapshot.selectedPaneId, shellMode, fullscreenLayout)
    );
    return snapshot.panes
      .filter((pane) => pane.mode === "TERMINAL" && shellVisibleIds.has(pane.id))
      .map((pane) => pane.id);
  }

  function roomTerminalBarrierReady(roomId: string): boolean {
    const snapshot = roomRuntimesRef.current[roomId];
    if (!snapshot) return false;
    const bootstrapped = new Set(snapshot.bootstrappedPaneIds);
    return visibleTerminalPaneIds(snapshot).every((paneId) => bootstrapped.has(paneId));
  }

  function notifyRoomTerminalBarrier(roomId: string) {
    if (!roomTerminalBarrierReady(roomId)) return;
    const waiters = roomTerminalBarrierWaitersRef.current.get(roomId);
    roomTerminalBarrierWaitersRef.current.delete(roomId);
    for (const resolve of waiters ?? []) resolve();
  }

  async function waitForRoomTerminalBarrier(roomId: string, timeoutMs = 5_000): Promise<void> {
    if (getSpaceRuntimeKind() === "demo" || roomTerminalBarrierReady(roomId)) return;
    await new Promise<void>((resolve) => {
      let timer = 0;
      const finish = () => {
        window.clearTimeout(timer);
        roomTerminalBarrierWaitersRef.current.get(roomId)?.delete(finish);
        resolve();
      };
      const waiters = roomTerminalBarrierWaitersRef.current.get(roomId) ?? new Set<() => void>();
      waiters.add(finish);
      roomTerminalBarrierWaitersRef.current.set(roomId, waiters);
      timer = window.setTimeout(finish, timeoutMs);
    });
  }

  function roomTerminalPrefillBarrierReady(roomId: string): boolean {
    const snapshot = roomRuntimesRef.current[roomId];
    if (!snapshot) return false;
    const readyPaneIds = new Set(snapshot.prefillReadyPaneIds);
    return snapshot.panes
      .filter((pane) => pane.mode === "TERMINAL" && !pane.isMinimized)
      .every((pane) => readyPaneIds.has(pane.id));
  }

  function notifyRoomTerminalPrefillBarrier(roomId: string) {
    if (!roomTerminalPrefillBarrierReady(roomId)) return;
    const waiters = roomTerminalPrefillBarrierWaitersRef.current.get(roomId);
    roomTerminalPrefillBarrierWaitersRef.current.delete(roomId);
    for (const resolve of waiters ?? []) resolve();
  }

  async function waitForRoomTerminalPrefillBarrier(roomId: string, timeoutMs = 2_000): Promise<boolean> {
    if (getSpaceRuntimeKind() === "demo" || roomTerminalPrefillBarrierReady(roomId)) return true;
    return new Promise<boolean>((resolve) => {
      let timer = 0;
      const finish = () => {
        window.clearTimeout(timer);
        roomTerminalPrefillBarrierWaitersRef.current.get(roomId)?.delete(finishReady);
        resolve(roomTerminalPrefillBarrierReady(roomId));
      };
      const finishReady = () => {
        window.clearTimeout(timer);
        roomTerminalPrefillBarrierWaitersRef.current.get(roomId)?.delete(finishReady);
        resolve(true);
      };
      const waiters = roomTerminalPrefillBarrierWaitersRef.current.get(roomId) ?? new Set<() => void>();
      waiters.add(finishReady);
      roomTerminalPrefillBarrierWaitersRef.current.set(roomId, waiters);
      timer = window.setTimeout(finish, timeoutMs);
    });
  }

  function clearRoomPresentationFailureTimeout() {
    if (roomPresentationFailureTimeoutRef.current === null) return;
    window.clearTimeout(roomPresentationFailureTimeoutRef.current);
    roomPresentationFailureTimeoutRef.current = null;
  }

  function recordRoomPresentationMetric(
    roomId: string,
    generation: number,
    phase: "START" | "READY" | "COMPLETE" | "ERROR"
  ) {
    const metric = roomPresentationMetricRef.current;
    if (!metric || metric.roomId !== roomId || metric.generation !== generation) return;
    if (phase === "READY") {
      if (metric.readyReported) return;
      metric.readyReported = true;
    }
    emitAppDiagnosticsPerformance({
      category: "PERFORMANCE",
      metric: "ROOM_PRESENTATION",
      roomId,
      phase,
      durationMs: Math.max(0, Date.now() - metric.startedAt),
      value: generation
    });
    if (phase === "COMPLETE" || phase === "ERROR") {
      roomPresentationMetricRef.current = null;
    }
  }

  function schedulePreparedRoomReveal(roomId: string, generation: number) {
    if (
      scheduledRoomRevealRef.current?.roomId === roomId &&
      scheduledRoomRevealRef.current.generation === generation
    ) return;
    scheduledRoomRevealRef.current = { roomId, generation };
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (
          roomPresentationGenerationRef.current !== generation ||
          preparingRoomIdRef.current !== roomId ||
          selectedRoomIdRef.current !== roomId
        ) return;
        scheduledRoomRevealRef.current = null;
        clearRoomPresentationFailureTimeout();
        recordRoomPresentationMetric(roomId, generation, "COMPLETE");
        displayedRoomIdRef.current = roomId;
        preparingRoomIdRef.current = null;
        setDisplayedRoomId(roomId);
        setPreparingRoomId(null);
      });
    });
  }

  function finishPreparingRoomWhenReady(roomId: string) {
    if (preparingRoomIdRef.current !== roomId || selectedRoomIdRef.current !== roomId) return;
    const snapshot = roomRuntimesRef.current[roomId];
    if (!snapshot || roomPaneLoadStatesRef.current[roomId] !== "loaded") return;
    // User-approved 2026-08-14: reveal as soon as pane data is loaded — panes
    // fill in afterwards. The old per-pane reveal barrier deadlocked when
    // session-less orphan panes existed (Room 6: 12/16 ready, the 4 orphans
    // never reported, 8s timeout on every open).
    recordRoomPresentationMetric(roomId, roomPresentationGenerationRef.current, "READY");
    schedulePreparedRoomReveal(roomId, roomPresentationGenerationRef.current);
  }

  function recordTerminalRevealReady(roomId: string, paneId: string, generation: number) {
    if (
      generation !== roomPresentationGenerationRef.current ||
      preparingRoomIdRef.current !== roomId ||
      selectedRoomIdRef.current !== roomId
    ) return;
    const readyPaneIds = roomRevealReadyPaneIdsRef.current.get(roomId) ?? new Set<string>();
    if (readyPaneIds.has(paneId)) return;
    readyPaneIds.add(paneId);
    roomRevealReadyPaneIdsRef.current.set(roomId, readyPaneIds);
    // DEBUG (user-requested 2026-08-14): which panes report ready.
    emitAppDiagnosticsPerformance({
      category: "PERFORMANCE",
      metric: "ROOM_REVEAL_PROGRESS",
      roomId,
      paneId,
      phase: "PANE_READY",
      durationMs: 0
    });
    finishPreparingRoomWhenReady(roomId);
  }

  function roomPresentationGeometryKey(roomId: string): string {
    const room = rooms.find(candidate => candidate.id === roomId);
    const snapshot = roomRuntimesRef.current[roomId];
    // State and viewport numbers only: no synchronous layout measurement.
    return JSON.stringify([
      window.innerWidth, window.innerHeight, window.devicePixelRatio,
      shellMode, paneGridWidth, paneGridHeight, rootRemSize, terminalFontSize,
      room?.updatedAt, room?.paneLayoutColumns, room?.paneLayoutHeight,
      snapshot?.panes.map(pane => [pane.id, pane.updatedAt])
    ]);
  }

  function canImmediatelyPresentWarmCliRoom(roomId: string): boolean {
    if (document.visibilityState === "hidden" ||
        roomPresentedGeometryRef.current.get(roomId) !== roomPresentationGeometryKey(roomId)) return false;
    if (!warmRoomEnabled || !warmRoomIdsRef.current.includes(roomId) ||
        roomPaneLoadStatesRef.current[roomId] !== "loaded" ||
        !roomTerminalBarrierReady(roomId) || !roomTerminalPrefillBarrierReady(roomId)) return false;
    const snapshot = roomRuntimesRef.current[roomId];
    if (!snapshot) return false;
    const visibleIds = visibleTerminalPaneIds(snapshot);
    // Keep mixed/browser rooms and empty rooms on the existing reveal path.
    if (!visibleIds.length || snapshot.panes.some(pane => !pane.isMinimized && pane.mode !== "TERMINAL")) return false;
    const layer = Array.from(document.querySelectorAll<HTMLElement>(".room-runtime-layer"))
      .find(element => element.dataset.roomRuntimeId === roomId);
    if (!layer || layer.dataset.presentationState !== "hidden") return false;
    const paneElements = Array.from(layer.querySelectorAll<HTMLElement>("[data-space-pane-id]"));
    return visibleIds.every(paneId => {
      const pane = paneElements.find(element => element.dataset.spacePaneId === paneId);
      const terminal = pane?.querySelector<HTMLElement>(".terminal-pane");
      const host = terminal?.querySelector<HTMLElement>(".terminal-xterm");
      return terminal?.dataset.terminalStatus === "attached" &&
        terminal.dataset.terminalPrefillReady === "true" &&
        terminal.dataset.terminalLoading === "false" &&
        terminal.dataset.terminalActionPending === "false" &&
        terminal.dataset.terminalHasError === "false" &&
        host?.dataset.terminalPendingPrefillEvents === "0" &&
        host.dataset.terminalPendingPrefillBytes === "0" &&
        host.dataset.terminalInitialGeometry !== "pending" &&
        host.dataset.terminalSocketParked !== "true" &&
        Boolean(host.querySelector(".xterm-screen")) &&
        !host.querySelector("[data-terminal-resize-frame]");
    });
  }

  function activateRoom(
    roomId: string | null,
    options: { preserveOutgoing?: boolean } = {}
  ) {
    const preserveOutgoing = options.preserveOutgoing ?? true;
    const currentRoomId = selectedRoomIdRef.current;
    const outgoingDisplayedRoomId = preserveOutgoing ? displayedRoomIdRef.current : null;
    if (preserveOutgoing && currentRoomId && activeRuntimeRoomIdRef.current === currentRoomId) {
      replaceRoomRuntime(snapshotActiveRoom(currentRoomId));
      if (displayedRoomIdRef.current === currentRoomId && !preparingRoomIdRef.current) {
        roomPresentedGeometryRef.current.set(currentRoomId, roomPresentationGeometryKey(currentRoomId));
      }
    }
    if (currentRoomId !== roomId) previousWarmRoomIdRef.current = currentRoomId;
    const supersededMetric = roomPresentationMetricRef.current;
    if (supersededMetric && supersededMetric.roomId !== roomId) {
      recordRoomPresentationMetric(
        supersededMetric.roomId,
        supersededMetric.generation,
        "ERROR"
      );
    }
    roomPresentationGenerationRef.current += 1;
    scheduledRoomRevealRef.current = null;
    clearRoomPresentationFailureTimeout();
    selectedRoomIdRef.current = roomId;
    activeRuntimeRoomIdRef.current = roomId;
    setSelectedRoomId(roomId);
    if (!roomId) {
      displayedRoomIdRef.current = null;
      preparingRoomIdRef.current = null;
      setDisplayedRoomId(null);
      setPreparingRoomId(null);
      clearActiveRoomRuntime();
      return;
    }
    recordRoomMru(runtime.platform.sessionStorage, roomId);
    const generation = roomPresentationGenerationRef.current;
    roomPresentationMetricRef.current = {
      roomId,
      generation,
      startedAt: Date.now(),
      readyReported: false
    };
    recordRoomPresentationMetric(roomId, generation, "START");
    const cached = roomRuntimesRef.current[roomId];
    const shouldHoldOutgoingRoom = Boolean(
      !canImmediatelyPresentWarmCliRoom(roomId) &&
      outgoingDisplayedRoomId &&
      outgoingDisplayedRoomId !== roomId &&
      roomRuntimesRef.current[outgoingDisplayedRoomId]
    );
    roomRevealReadyPaneIdsRef.current.set(roomId, new Set());
    if (shouldHoldOutgoingRoom) {
      preparingRoomIdRef.current = roomId;
      setPreparingRoomId(roomId);
      roomPresentationFailureTimeoutRef.current = window.setTimeout(() => {
        if (
          roomPresentationGenerationRef.current !== generation ||
          preparingRoomIdRef.current !== roomId ||
          selectedRoomIdRef.current !== roomId
        ) return;
        roomPresentationFailureTimeoutRef.current = null;
        // DEBUG (user-requested 2026-08-14): which panes blocked the reveal.
        {
          const snapshot = roomRuntimesRef.current[roomId];
          const readyPaneIds = roomRevealReadyPaneIdsRef.current.get(roomId) ?? new Set<string>();
          const visibleIds = snapshot ? visibleTerminalPaneIds(snapshot) : [];
          const missing = visibleIds.filter((paneId) => !readyPaneIds.has(paneId));
          emitAppDiagnosticsPerformance({
            category: "PERFORMANCE",
            metric: "ROOM_REVEAL_PROGRESS",
            roomId,
            phase: "TIMEOUT",
            readyCount: visibleIds.length - missing.length,
            totalCount: visibleIds.length,
            missingPaneIds: missing.join(","),
            durationMs: ROOM_PRESENTATION_FAILURE_TIMEOUT_MS
          });
        }
        // User-approved 2026-08-14: reveal the target room once the grace
        // window elapses instead of bouncing back to the previous room —
        // slow panes keep filling in after the reveal.
        recordRoomPresentationMetric(roomId, generation, "ERROR");
        displayedRoomIdRef.current = roomId;
        preparingRoomIdRef.current = null;
        setDisplayedRoomId(roomId);
        setPreparingRoomId(null);
      }, ROOM_PRESENTATION_FAILURE_TIMEOUT_MS);
    } else {
      displayedRoomIdRef.current = roomId;
      preparingRoomIdRef.current = null;
      setDisplayedRoomId(roomId);
      setPreparingRoomId(null);
      recordRoomPresentationMetric(roomId, generation, "COMPLETE");
    }
    if (cached) {
      const accessed = { ...cached, lastAccessedAt: Date.now() };
      replaceRoomRuntime(accessed);
      applyRoomRuntime(accessed);
      finishPreparingRoomWhenReady(roomId);
    } else {
      clearActiveRoomRuntime();
    }
  }

  async function loadRoomPanes(roomId: string) {
    const activeRequest = roomPaneLoadPromisesRef.current.get(roomId);
    if (activeRequest) return activeRequest;

    const request = (async () => {
      const isFirstPaneLoad = roomPaneLoadStatesRef.current[roomId] !== "loaded";
      if (isFirstPaneLoad) {
        setRoomPaneLoadState(roomId, "loading");
      }
      const sequence = (roomPaneRequestSequenceRef.current.get(roomId) ?? 0) + 1;
      roomPaneRequestSequenceRef.current.set(roomId, sequence);
      let panePayload: Awaited<ReturnType<typeof api.panes>>;
      try {
        panePayload = await api.panes(roomId);
      } catch (error) {
        if (!appMountedRef.current) return;
        if (roomPaneRequestSequenceRef.current.get(roomId) !== sequence) return;
        if (isFirstPaneLoad) {
          setRoomPaneLoadState(roomId, "error");
          if (preparingRoomIdRef.current === roomId && selectedRoomIdRef.current === roomId) {
            schedulePreparedRoomReveal(roomId, roomPresentationGenerationRef.current);
          }
        }
        throw error;
      }
      if (!appMountedRef.current) return;
      if (roomPaneRequestSequenceRef.current.get(roomId) !== sequence) return;
      const existing = roomRuntimesRef.current[roomId];
      const nextPanes = reuseVersionedItems(existing?.panes, panePayload.data, (pane) => pane.updatedAt);
      const visiblePanes = nextPanes.filter((pane) => !pane.isMinimized);
      const currentSelectedPaneId = selectedRoomIdRef.current === roomId
        ? selectedPaneIdRef.current
        : existing?.selectedPaneId ?? null;
      const nextSelectedPaneId = visiblePanes.some((pane) => pane.id === currentSelectedPaneId)
        ? currentSelectedPaneId
        : visiblePanes[0]?.id ?? null;
      const paneIds = new Set(nextPanes.map((pane) => pane.id));
      const nextBootstrappedPaneIds = (existing?.bootstrappedPaneIds ?? []).filter((paneId) => paneIds.has(paneId));
      const stableBootstrappedPaneIds = existing?.bootstrappedPaneIds &&
        nextBootstrappedPaneIds.length === existing.bootstrappedPaneIds.length
          ? existing.bootstrappedPaneIds
          : nextBootstrappedPaneIds;
      const nextPrefillReadyPaneIds = (existing?.prefillReadyPaneIds ?? []).filter((paneId) => paneIds.has(paneId));
      const stablePrefillReadyPaneIds = existing?.prefillReadyPaneIds &&
        nextPrefillReadyPaneIds.length === existing.prefillReadyPaneIds.length
          ? existing.prefillReadyPaneIds
          : nextPrefillReadyPaneIds;
      const snapshot: RoomRuntimeSnapshot = {
        roomId,
        panes: nextPanes,
        turns: existing?.turns ?? [],
        events: existing?.events ?? [],
        swarm: existing?.swarm ?? null,
        selectedPaneId: nextSelectedPaneId,
        bootstrappedPaneIds: stableBootstrappedPaneIds,
        prefillReadyPaneIds: stablePrefillReadyPaneIds,
        lastAccessedAt: selectedRoomIdRef.current === roomId ? Date.now() : existing?.lastAccessedAt ?? Date.now()
      };
      replaceRoomRuntime(snapshot);
      setRoomPaneLoadState(roomId, "loaded");
      if (selectedRoomIdRef.current !== roomId) return;
      activeRuntimeRoomIdRef.current = roomId;
      applyRoomRuntime(snapshot);
      finishPreparingRoomWhenReady(roomId);
      setError((current) => (isTransientUpstreamErrorMessage(current) ? null : current));
    })();

    roomPaneLoadPromisesRef.current.set(roomId, request);
    try {
      await request;
    } finally {
      if (roomPaneLoadPromisesRef.current.get(roomId) === request) {
        roomPaneLoadPromisesRef.current.delete(roomId);
      }
    }
  }

  async function loadRoomTurns(roomId: string) {
    const activeRequest = roomTurnsLoadPromisesRef.current.get(roomId);
    if (activeRequest) return activeRequest;

    const request = (async () => {
      const sequence = (roomTurnsRequestSequenceRef.current.get(roomId) ?? 0) + 1;
      roomTurnsRequestSequenceRef.current.set(roomId, sequence);
      const turnPayload = await api.turns({ roomId });
      if (!appMountedRef.current || roomTurnsRequestSequenceRef.current.get(roomId) !== sequence) return;
      const existing = roomRuntimesRef.current[roomId];
      if (!existing) return;
      const nextTurns = reuseVersionedItems(existing.turns, turnPayload.data, (turn) => turn.updatedAt);
      replaceRoomRuntime({
        ...existing,
        panes: selectedRoomIdRef.current === roomId ? panesRef.current : existing.panes,
        turns: nextTurns,
        selectedPaneId: selectedRoomIdRef.current === roomId ? selectedPaneIdRef.current : existing.selectedPaneId,
        lastAccessedAt: selectedRoomIdRef.current === roomId ? Date.now() : existing.lastAccessedAt
      });
      if (selectedRoomIdRef.current !== roomId) return;
      activeRuntimeRoomIdRef.current = roomId;
      turnsRef.current = nextTurns;
      setTurns(nextTurns);
      setError((current) => (isTransientUpstreamErrorMessage(current) ? null : current));
    })();

    roomTurnsLoadPromisesRef.current.set(roomId, request);
    try {
      await request;
    } finally {
      if (roomTurnsLoadPromisesRef.current.get(roomId) === request) roomTurnsLoadPromisesRef.current.delete(roomId);
    }
  }

  async function loadRoomSwarm(roomId: string) {
    const activeRequest = roomSwarmLoadPromisesRef.current.get(roomId);
    if (activeRequest) return activeRequest;

    const request = (async () => {
      const sequence = (roomSwarmRequestSequenceRef.current.get(roomId) ?? 0) + 1;
      roomSwarmRequestSequenceRef.current.set(roomId, sequence);
      const swarmPayload = await api.swarm(roomId);
      if (!appMountedRef.current || roomSwarmRequestSequenceRef.current.get(roomId) !== sequence) return;
      const existing = roomRuntimesRef.current[roomId];
      if (!existing) return;
      replaceRoomRuntime({
        ...existing,
        panes: selectedRoomIdRef.current === roomId ? panesRef.current : existing.panes,
        swarm: swarmPayload,
        selectedPaneId: selectedRoomIdRef.current === roomId ? selectedPaneIdRef.current : existing.selectedPaneId,
        lastAccessedAt: selectedRoomIdRef.current === roomId ? Date.now() : existing.lastAccessedAt
      });
      if (selectedRoomIdRef.current !== roomId) return;
      activeRuntimeRoomIdRef.current = roomId;
      swarmStateRef.current = swarmPayload;
      setSwarmState(swarmPayload);
      setError((current) => (isTransientUpstreamErrorMessage(current) ? null : current));
    })();

    roomSwarmLoadPromisesRef.current.set(roomId, request);
    try {
      await request;
    } finally {
      if (roomSwarmLoadPromisesRef.current.get(roomId) === request) roomSwarmLoadPromisesRef.current.delete(roomId);
    }
  }

  function commitPaneCompletionLifecycle(next: PaneCompletionLifecycleState) {
    if (next === paneCompletionLifecycleRef.current) return;
    paneCompletionLifecycleRef.current = next;
    setPaneCompletionLifecycle(next);
  }

  function hydratePaneCompletionEvents(roomId: string, events: readonly SpaceEvent[]) {
    commitPaneCompletionLifecycle(
      hydratePaneCompletionRoom(paneCompletionLifecycleRef.current, roomId, events)
    );
  }

  async function loadRoomEvents(roomId: string) {
    const activeRequest = roomEventsLoadPromisesRef.current.get(roomId);
    if (activeRequest) return activeRequest;

    const request = (async () => {
      const sequence = (roomEventsRequestSequenceRef.current.get(roomId) ?? 0) + 1;
      roomEventsRequestSequenceRef.current.set(roomId, sequence);
      const eventPayload = await api.events({ roomId, pageSize: 50, sortOrder: "desc" });
      if (!appMountedRef.current || roomEventsRequestSequenceRef.current.get(roomId) !== sequence) return;
      const existing = roomRuntimesRef.current[roomId];
      if (!existing) return;
      const nextEvents = reuseVersionedItems(existing.events, eventPayload.data, (event) => event.createdAt);
      hydratePaneCompletionEvents(roomId, nextEvents);
      replaceRoomRuntime({
        ...existing,
        panes: selectedRoomIdRef.current === roomId ? panesRef.current : existing.panes,
        events: nextEvents,
        selectedPaneId: selectedRoomIdRef.current === roomId ? selectedPaneIdRef.current : existing.selectedPaneId,
        lastAccessedAt: selectedRoomIdRef.current === roomId ? Date.now() : existing.lastAccessedAt
      });
      if (selectedRoomIdRef.current !== roomId) return;
      activeRuntimeRoomIdRef.current = roomId;
      roomEventsRef.current = nextEvents;
      setRoomEvents(nextEvents);
      setError((current) => (isTransientUpstreamErrorMessage(current) ? null : current));
    })();

    roomEventsLoadPromisesRef.current.set(roomId, request);
    try {
      await request;
    } finally {
      if (roomEventsLoadPromisesRef.current.get(roomId) === request) roomEventsLoadPromisesRef.current.delete(roomId);
    }
  }

  async function loadRoomMetadata(roomId: string) {
    await Promise.all([loadRoomSwarm(roomId), loadRoomTurns(roomId), loadRoomEvents(roomId)]);
  }

  async function loadRoomRuntime(
    roomId: string,
    onPanesLoaded?: () => void,
    options: { loadMetadata?: boolean } = {}
  ) {
    const startedAt = performance.now();
    const durationMs = () => Math.min(120_000, Math.max(0, performance.now() - startedAt));
    emitAppDiagnosticsPerformance({
      category: "PERFORMANCE",
      metric: "ROOM_HYDRATION",
      roomId,
      phase: "START",
      durationMs: 0
    });
    roomRuntimeHydrationIdsRef.current.add(roomId);
    try {
      roomRuntimeLastPolledAtRef.current.set(roomId, Date.now());
      await loadRoomPanes(roomId);
      emitAppDiagnosticsPerformance({
        category: "PERFORMANCE",
        metric: "ROOM_HYDRATION",
        roomId,
        phase: "PANES_READY",
        durationMs: durationMs()
      });
      if (!appMountedRef.current) return;
      onPanesLoaded?.();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (!appMountedRef.current) return;
      const hiddenHydration =
        roomId !== selectedRoomIdRef.current &&
        roomId !== displayedRoomIdRef.current &&
        roomId !== preparingRoomIdRef.current;
      if (hiddenHydration) {
        const runtimeSnapshot = roomRuntimesRef.current[roomId];
        if (!runtimeSnapshot || runtimeSnapshot.panes.length === 0) {
          // Empty rooms need no prefill or metadata; finish immediately so the
          // warm pass cannot stall on them (user-reported stall, 2026-08-14).
          emitAppDiagnosticsPerformance({
            category: "PERFORMANCE",
            metric: "ROOM_HYDRATION",
            roomId,
            phase: "COMPLETE",
            durationMs: durationMs()
          });
          return;
        }
        const terminalPrefillReady = await waitForRoomTerminalPrefillBarrier(roomId, 2_000);
        if (!appMountedRef.current) return;
        emitAppDiagnosticsPerformance({
          category: "PERFORMANCE",
          metric: "ROOM_HYDRATION",
          roomId,
          phase: terminalPrefillReady ? "READY" : "ERROR",
          durationMs: durationMs()
        });
      }
      // Active/presented rooms become interactive as soon as panes (and cold terminals) are ready.
      // Metadata (swarm/turns/events) continues in the background so cold switches stay snappy.
      if (options.loadMetadata !== false) {
        if (hiddenHydration) {
          await loadRoomMetadata(roomId);
        } else {
          void loadRoomMetadata(roomId).catch(() => {
            // Metadata is best-effort after interactive readiness.
          });
        }
      }
      emitAppDiagnosticsPerformance({
        category: "PERFORMANCE",
        metric: "ROOM_HYDRATION",
        roomId,
        phase: "COMPLETE",
        durationMs: durationMs()
      });
    } catch (error) {
      emitAppDiagnosticsPerformance({
        category: "PERFORMANCE",
        metric: "ROOM_HYDRATION",
        roomId,
        phase: "ERROR",
        durationMs: durationMs()
      });
      throw error;
    } finally {
      roomRuntimeHydrationIdsRef.current.delete(roomId);
    }
  }

  async function refreshHiddenRoomRuntime(roomId: string) {
    roomRuntimeLastPolledAtRef.current.set(roomId, Date.now());
    await loadRoomPanes(roomId);
  }
  loadRoomPanesRef.current = loadRoomPanes;
  loadRoomTurnsRef.current = loadRoomTurns;
  loadRoomSwarmRef.current = loadRoomSwarm;
  loadRoomEventsRef.current = loadRoomEvents;
  loadRoomRuntimeRef.current = loadRoomRuntime;
  refreshHiddenRoomRuntimeRef.current = refreshHiddenRoomRuntime;

  requestRoomRefreshRef.current = (roomId, category, reason) => {
    const key = `${roomId}:${category}`;
    return roomRefreshQueueRef.current.request(key, async () => {
      recordLifecycleDebugEvent({
        type: "room_refresh_started",
        scope: "App",
        detail: `room=${roomId} category=${category} reason=${reason}`,
        notify: false
      });
      try {
        if (category === "panes") await loadRoomPanesRef.current(roomId);
        else if (category === "turns") await loadRoomTurnsRef.current(roomId);
        else if (category === "swarm") await loadRoomSwarmRef.current(roomId);
        else await loadRoomEventsRef.current(roomId);
        recordLifecycleDebugEvent({
          type: "room_refresh_completed",
          scope: "App",
          detail: `room=${roomId} category=${category} reason=${reason}`,
          notify: false
        });
      } catch (refreshError) {
        recordLifecycleDebugEvent({
          type: "room_refresh_failed",
          scope: "App",
          detail: `room=${roomId} category=${category} reason=${reason}`,
          notify: false
        });
        throw refreshError;
      }
    });
  };

  useEffect(() => {
    if (!selectedRoomId || activeRuntimeRoomIdRef.current !== selectedRoomId) return;
    replaceRoomRuntime(snapshotActiveRoom(selectedRoomId));
    // State synchronization intentionally follows the active facade only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panes, roomEvents, selectedPaneId, selectedRoomId, swarmState, turns]);

  const warmRoomIds = useMemo(() => {
    if (!selectedRoomId) return [];
    const candidates = rooms.flatMap((room) => {
      const cached = roomRuntimes[room.id];
      if (room.id !== selectedRoomId && !cached) return [];
      const runtimePanes = room.id === selectedRoomId ? panes : cached?.panes ?? [];
      const bootstrappedPaneIds = cached?.bootstrappedPaneIds ?? [];
      return [{
        roomId: room.id,
        attachedPaneCount: connectedPaneCount(runtimePanes, bootstrappedPaneIds),
        lastAccessedAt: cached?.lastAccessedAt ?? Date.now()
      }];
    });
    const preferredRoomIds = readRoomMru(
      runtime.platform.sessionStorage,
      new Set(rooms.map((room) => room.id))
    );
    return selectWarmRoomIds({
      enabled: warmRoomEnabled,
      roomIds: rooms.map((room) => room.id),
      activeRoomId: selectedRoomId,
      preferredRoomIds,
      previousRoomId: previousWarmRoomIdRef.current,
      maxAttachedPanes: warmConnectedPaneLimit,
      candidates
    });
  }, [panes, roomRuntimes, rooms, selectedRoomId, warmConnectedPaneLimit, warmRoomEnabled]);
  warmRoomIdsRef.current = warmRoomIds;

  const warmRoomLimitsForDevice = useMemo(() => warmRoomLimits(
    warmConnectedPaneLimit
  ), [warmConnectedPaneLimit]);

  const warmConnectedPaneTotal = useMemo(() => {
    let total = 0;
    for (const roomId of warmRoomIds) {
      const runtime = roomRuntimes[roomId];
      const runtimePanes = roomId === selectedRoomId ? panes : runtime?.panes ?? [];
      total += connectedPaneCount(runtimePanes, runtime?.bootstrappedPaneIds ?? []);
    }
    return total;
  }, [panes, roomRuntimes, selectedRoomId, warmRoomIds]);

  useEffect(() => {
    if (warmRoomEnabled) return;
    for (const roomId of Object.keys(roomRuntimesRef.current)) {
      if (roomId !== selectedRoomId && roomId !== displayedRoomId) removeRoomRuntime(roomId);
    }
    // removeRoomRuntime is intentionally kept outside the dependency list; the policy reacts only
    // to the browser-local cache setting and the requested/presented room identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedRoomId, selectedRoomId, warmRoomEnabled]);

  useEffect(() => {
    const handlePaneRunLifecycle = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as Partial<PaneRunLifecycleDetail> | null;
      if (
        !detail ||
        typeof detail.roomId !== "string" ||
        typeof detail.paneId !== "string" ||
        typeof detail.runKey !== "string" ||
        typeof detail.occurredAt !== "string" ||
        (detail.status !== "STARTED" && detail.status !== "COMPLETED" && detail.status !== "FAILED")
      ) return;
      const lifecycleEvent: SpaceEvent = {
        id: `pane-run:${detail.paneId}:${detail.runKey}:${detail.status}`,
        roomId: detail.roomId,
        paneId: detail.paneId,
        turnId: null,
        workflowId: null,
        traceId: `pane-run:${detail.runKey}`,
        type: detail.status === "STARTED"
          ? "TURN_STARTED"
          : detail.status === "COMPLETED"
            ? "TURN_COMPLETED"
            : "TURN_FAILED",
        message: `Pane run ${detail.status.toLowerCase()}.`,
        payload: { clientTurnMarker: detail.runKey, sourceType: "PANE_RUNTIME" },
        createdAt: detail.occurredAt
      };
      commitPaneCompletionLifecycle(
        applyPaneCompletionEvents(paneCompletionLifecycleRef.current, [lifecycleEvent])
      );
    };
    window.addEventListener(PANE_RUN_LIFECYCLE_EVENT, handlePaneRunLifecycle);
    return () => window.removeEventListener(PANE_RUN_LIFECYCLE_EVENT, handlePaneRunLifecycle);
  }, []);

  function recordRoomPaneBootstrapped(roomId: string, paneId: string) {
    const runtime = roomRuntimesRef.current[roomId]
      ?? (selectedRoomIdRef.current === roomId ? snapshotActiveRoom(roomId) : null);
    if (!runtime || runtime.bootstrappedPaneIds.includes(paneId)) return;
    replaceRoomRuntime({
      ...runtime,
      bootstrappedPaneIds: [...runtime.bootstrappedPaneIds, paneId]
    });
    notifyRoomTerminalBarrier(roomId);
  }

  function recordRoomTerminalPrefillReady(roomId: string, paneId: string, ready: boolean) {
    const runtime = roomRuntimesRef.current[roomId]
      ?? (selectedRoomIdRef.current === roomId ? snapshotActiveRoom(roomId) : null);
    if (!runtime) return;
    const current = new Set(runtime.prefillReadyPaneIds);
    if (ready) current.add(paneId);
    else current.delete(paneId);
    if (current.size === runtime.prefillReadyPaneIds.length &&
      runtime.prefillReadyPaneIds.every((candidate) => current.has(candidate))) {
      if (ready) notifyRoomTerminalPrefillBarrier(roomId);
      return;
    }
    replaceRoomRuntime({
      ...runtime,
      prefillReadyPaneIds: [...current]
    });
    if (ready) notifyRoomTerminalPrefillBarrier(roomId);
  }

  async function recoverMissingRoom(missingRoomId: string) {
    const roomPayload = await api.rooms({ all: true });
    const nextRoomId = roomPayload.data[0]?.id ?? null;
    setRooms(sortRoomsByOrder(roomPayload.data));
    activateRoom(nextRoomId, { preserveOutgoing: false });
    if (nextRoomId) {
      await loadRoomRuntime(nextRoomId);
      setError(`Room ${missingRoomId} no longer exists; switched to ${roomPayload.data[0]?.name ?? "the next room"}.`);
      return;
    }
    setPanes([]);
    setSelectedPaneId(null);
    setTurns([]);
    setRoomEvents([]);
    setSwarmState(await api.swarm());
    setError(`Room ${missingRoomId} no longer exists.`);
  }

  async function refreshRoomEvents(roomId: string) {
    const eventPayload = await api.events({ roomId, pageSize: 50, sortOrder: "desc" });
    if (!appMountedRef.current) return;
    hydratePaneCompletionEvents(roomId, eventPayload.data);
    // A slow response must not overwrite another room's events after a switch.
    if (selectedRoomIdRef.current !== roomId) return;
    // Keep unchanged event objects so panes whose events did not change skip re-rendering.
    setRoomEvents((current) => reuseVersionedItems(current, eventPayload.data, (event) => event.createdAt));
  }

  const appendRoomEvent = useCallback((event: SpaceEvent, applyCompletion = true) => {
    if (applyCompletion) {
      commitPaneCompletionLifecycle(applyPaneCompletionEvents(paneCompletionLifecycleRef.current, [event]));
    }
    setRoomEvents((current) => mergeSpaceEvents(current, event));
  }, []);

  async function refresh() {
    try {
      const search = window.location.search;
      if (search) {
        const params = new URLSearchParams(search);
        if (
          params.has("login") ||
          params.has("logout") ||
          params.has("relogin") ||
          params.has("forceLogin") ||
          params.has("switch") ||
          params.has("new") ||
          params.get("prompt") === "login" ||
          params.get("action") === "logout"
        ) {
          await api.logout().catch(() => undefined);
          params.delete("login");
          params.delete("logout");
          params.delete("relogin");
          params.delete("forceLogin");
          params.delete("switch");
          params.delete("new");
          if (params.get("prompt") === "login") params.delete("prompt");
          if (params.get("action") === "logout") params.delete("action");
          const remaining = params.toString();
          const cleanUrl = window.location.pathname + (remaining ? `?${remaining}` : "");
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }
    } catch {
      // Ignore
    }

    const me = await api.me();
    if (me.settings) {
      if (me.isAuthenticated) {
        const seeded = await seedInitialLocalSettingsToServer(api, me.settings, runtime.platform.localStorage);
        if (seeded) me.settings = seeded;
      }
      if (typeof me.settings.suppressNotifications === "boolean") {
        setSuppressNotifications(me.settings.suppressNotifications);
      }
      if (typeof me.settings.warmRoomEnabled === "boolean") {
        setWarmRoomEnabled(me.settings.warmRoomEnabled);
      }
      if (typeof me.settings.warmRoomConnectedPaneLimit === "number") {
        setWarmConnectedPaneLimit(me.settings.warmRoomConnectedPaneLimit);
      }
      if (typeof me.settings.cliImagePreviewLimit === "number") {
        setCliImagePreviewLimit(me.settings.cliImagePreviewLimit);
      }
      if (typeof me.settings.roomTheme === "string" && roomThemes.some((t) => t.id === me.settings?.roomTheme)) {
        setRoomTheme(me.settings.roomTheme as RoomTheme);
      }
      if (typeof me.settings.terminalFontSize === "number") {
        setTerminalFontSize(me.settings.terminalFontSize);
      }
      if (typeof me.settings.showSessionDebugIds === "boolean") {
        setShowSessionDebugIds(me.settings.showSessionDebugIds);
      }
      if (typeof me.settings.cliDebugModeEnabled === "boolean") {
        setCliDebugModeEnabled(me.settings.cliDebugModeEnabled);
      }
      if (typeof me.settings.cliFloatsHidden === "boolean") {
        setCliFloatsHidden(me.settings.cliFloatsHidden);
      }
      if (typeof me.settings.sensitiveDataMasked === "boolean") {
        setMaskSensitiveData(me.settings.sensitiveDataMasked);
      }
      if (typeof me.settings.roomToolbarHidden === "boolean") {
        setIsRoomToolbarHidden(me.settings.roomToolbarHidden);
      }
      if (typeof me.settings.roomFocusMode === "boolean") {
        setIsRoomFocusMode(me.settings.roomFocusMode);
      }
      if (typeof me.settings.roomsRailHidden === "boolean") {
        setIsDesktopSideSurfaceOpen(!me.settings.roomsRailHidden);
      }
      if (typeof me.settings.worktreeDefaultEnabled === "boolean") {
        setDefaultWorktreeEnabled(me.settings.worktreeDefaultEnabled);
      }
      if (me.settings.roomWorktreeOverrides && typeof me.settings.roomWorktreeOverrides === "object") {
        setRoomWorktreeOverrides(me.settings.roomWorktreeOverrides as Record<string, boolean>);
      }
      if (Array.isArray(me.settings.projectPresets)) {
        setProjectPresets(me.settings.projectPresets as { label: string; path: string }[]);
      }
      if (me.settings.roomExtraEmptySlots && typeof me.settings.roomExtraEmptySlots === "object") {
        setRoomExtraEmptySlots(me.settings.roomExtraEmptySlots as Record<string, number>);
      }
      const { themeChanged } = applyServerUserSettings(
        runtime.platform.localStorage,
        me.settings,
        uiTheme,
        modernAppearance,
        modernIconPack,
        uiBackground,
        me.user?.id
      );
      if (themeChanged) {
        runtime.platform.reloadPage();
        return;
      }
    }
    const nextSetupStatus: SetupStatus =
      me.isAuthenticated && !me.isSetupRequired
        ? { setupRequired: false, expiresAt: null }
        : await api.setupStatus();
    setSetupStatus(nextSetupStatus);
    setAuth(me);
    setAuthBootstrapError(null);
    if (!me.isAuthenticated) return;
    // Prefetch only after authentication so the login surface never probes a
    // protected runtime endpoint. Multi-pane rooms still share one flight.
    api.warmCliRuntimes();
    if (me.user?.role === "ADMIN") api.warmCliRuntimeSettings();

    let roomPayload = await api.rooms({ all: true });
    const userStorageKey = me.user?.id ? `${SELECTED_ROOM_ID_STORAGE_KEY}.${me.user.id}` : SELECTED_ROOM_ID_STORAGE_KEY;
    const userSelectedRoomId = readStoredSessionString(userStorageKey) ?? (selectedRoomId && roomPayload.data.some((room) => room.id === selectedRoomId) ? selectedRoomId : null);
    if (
      userSelectedRoomId &&
      !roomPayload.data.some((room) => room.id === userSelectedRoomId) &&
      roomPayload.pagination.totalPages > 1
    ) {
      roomPayload = {
        ...roomPayload,
        data: await loadBoundedRoomCatalog()
      };
    }
    setRooms(sortRoomsByOrder(roomPayload.data));
    const myRooms = roomPayload.data.filter((room) => !room.ownerUserId || room.ownerUserId === me.user?.id);
    const selectedRoomIsMine = userSelectedRoomId ? myRooms.some((room) => room.id === userSelectedRoomId) : false;
    const selectedRoomStillExists = userSelectedRoomId ? roomPayload.data.some((room) => room.id === userSelectedRoomId) : false;
    const starterRoom = myRooms.find((room) => room.name.toLowerCase() === "getting started")
      ?? roomPayload.data.find((room) => room.name.toLowerCase() === "getting started");
    const defaultFirstRoom = starterRoom ?? myRooms[0] ?? roomPayload.data[0];
    const nextRoomId = (selectedRoomIsMine || adminModeRequested) && selectedRoomStillExists
      ? userSelectedRoomId
      : (defaultFirstRoom?.id ?? null);
    activateRoom(nextRoomId, { preserveOutgoing: selectedRoomStillExists });
    if (userSelectedRoomId && !selectedRoomStillExists && nextRoomId && roomPayload.data.length > 0) {
      setError(`Room ${userSelectedRoomId} no longer exists; switched to ${roomPayload.data[0]?.name ?? "the next room"}.`);
    }
    if (nextRoomId) {
      // User-approved 2026-08-14: background warm starts IMMEDIATELY (in
      // parallel with the active room load, after any service restart the
      // refresh is the trigger) and never blocks the bootstrap — the shell
      // becomes interactive without waiting for warm hydration.
      const startBackgroundWarm = () => {
        const activeRoom = roomPayload.data.find((room) => room.id === nextRoomId);
        if (activeRoom?.kind === "AGENT_PROOF") {
          return;
        }
        const candidateRooms = roomPayload.data.filter((room) => room.kind !== "AGENT_PROOF");
        const validRoomIds = new Set(candidateRooms.map((room) => room.id));
        const hydrationRoomIds = selectWarmHydrationRoomIds({
          roomIds: candidateRooms.map((room) => room.id),
          activeRoomId: nextRoomId,
          mruRoomIds: readRoomMru(runtime.platform.sessionStorage, validRoomIds),
          maxWarmRooms: warmRoomLimits(warmConnectedPaneLimit).maxRooms
        });
        const hydrateRoomIfNotEmpty = async (roomId: string) => {
          try {
            if (
              roomPaneLoadStatesRef.current[roomId] === "loaded" ||
              roomRuntimeHydrationIdsRef.current.has(roomId)
            ) {
              return; // already warm or warming — never re-hydrate (log spam: 4-5x per room)
            }
            const panePayload = await api.panes(roomId);
            if (!appMountedRef.current) return;
            if (panePayload.data.length === 0) return;
            await loadRoomRuntime(roomId, undefined, { loadMetadata: false });
          } catch {
            // Best-effort background hydration.
          }
        };
        void hydrateWarmRoomsWithinWindow(
          hydrationRoomIds,
          hydrateRoomIfNotEmpty,
          undefined,
          WARM_ROOM_STARTUP_HYDRATION_CONCURRENCY
        ).catch(() => undefined).finally(() => {
          if (!appMountedRef.current) return;
          const otherRoomIds = candidateRooms
            .map((room) => room.id)
            .filter((roomId) => roomId !== nextRoomId);
          void runWithConcurrency(
            otherRoomIds.map((roomId) => () => hydrateRoomIfNotEmpty(roomId)),
            4
          ).catch(() => undefined);
        });
      };
      startBackgroundWarm();
      await loadRoomRuntime(nextRoomId);
      if (!appMountedRef.current) return;
      await waitForRoomTerminalBarrier(nextRoomId);
      if (!appMountedRef.current) return;
    } else {
      setPanes([]);
      setSelectedPaneId(null);
      setTurns([]);
      setRoomEvents([]);
      setSwarmState(await api.swarm());
    }

    // Keep only shell-critical status reads in the startup path. Provider and
    // health catalogs load when their dock is opened.
    setError((current) => (isTransientUpstreamErrorMessage(current) ? null : current));

    void Promise.allSettled([api.readyz(), api.admin()]).then(([readyResult, adminResult]) => {
      if (!appMountedRef.current) return;
      if (readyResult.status === "fulfilled") setReadiness(readyResult.value);
      if (adminResult.status === "fulfilled") {
        setStorageWarning(adminResult.value.storageWarning);
        if (!adminResult.value.storageWarning) {
          setDismissedStorageWarning(null);
          writeStoredSessionString(DISMISSED_STORAGE_WARNING_STORAGE_KEY, null);
        }
      }
    });

    if (me.user?.role === "ADMIN") {
      void api.setupOverview()
        .then((overview) => {
          if (appMountedRef.current && !overview.isComplete) {
            setupFromWorkspace.current = false;
            setIsSetupConnectionsOpen(true);
          }
        })
        .catch(() => {
          // Onboarding discovery must not delay or block room hydration, but the
          // owner should know setup status is unknown rather than see nothing.
          if (appMountedRef.current) setError("Setup status could not be loaded. Open Setup wizard from the room toolbar to finish setup.");
        });
    }
  }

  async function loadSettingsSurfaceData() {
    if (settingsSurfaceDataLoadedRef.current) return;
    if (settingsSurfaceDataPromiseRef.current) return settingsSurfaceDataPromiseRef.current;
    const request = Promise.all([api.providers(), api.providerSettings()]).then(([providerPayload, settings]) => {
      if (!appMountedRef.current) return;
      setProviders(providerPayload.data);
      setProviderSettings(settings);
      settingsSurfaceDataLoadedRef.current = true;
    });
    settingsSurfaceDataPromiseRef.current = request;
    try {
      await request;
    } finally {
      if (settingsSurfaceDataPromiseRef.current === request) settingsSurfaceDataPromiseRef.current = null;
    }
  }

  async function loadHealthSurfaceData(force = false) {
    if (healthSurfaceDataLoadedRef.current && !force) return;
    if (healthSurfaceDataPromiseRef.current) return healthSurfaceDataPromiseRef.current;
    const request = Promise.allSettled([
      force ? api.readyz() : Promise.resolve(null),
      loadSettingsSurfaceData(),
      api.models(),
      api.mcp(),
      api.latestMcpDiscoverySmoke(),
      api.storage(),
      api.observability(),
      api.worker()
    ]).then((results) => {
      if (!appMountedRef.current) return;
      const [readyResult, , modelResult, mcpResult, smokeResult, storageResult, observabilityResult, workerResult] = results;
      if (readyResult.status === "fulfilled" && readyResult.value) setReadiness(readyResult.value);
      if (modelResult.status === "fulfilled") setModels(modelResult.value.data);
      if (mcpResult.status === "fulfilled") setMcp(mcpResult.value);
      if (smokeResult.status === "fulfilled") setLatestMcpSmoke(smokeResult.value.data);
      if (storageResult.status === "fulfilled") setStorageReadiness(storageResult.value);
      if (observabilityResult.status === "fulfilled") setObservability(observabilityResult.value);
      if (workerResult.status === "fulfilled") setWorkerReadiness(workerResult.value);
      healthSurfaceDataLoadedRef.current = results.every((result) => result.status === "fulfilled");
      setHealthSurfaceError(healthSurfaceDataLoadedRef.current ? null : "Some health checks could not be loaded. Refresh to try again.");
    });
    healthSurfaceDataPromiseRef.current = request;
    try {
      await request;
    } finally {
      if (healthSurfaceDataPromiseRef.current === request) healthSurfaceDataPromiseRef.current = null;
    }
  }

  useEffect(() => {
    refresh().catch((err: unknown) => {
      if (!appMountedRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to load Space";
      setAuthBootstrapError(message);
      if (!isTransientUpstreamRuntimeError(err)) setError(message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const navigationEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    recordLifecycleDebugEvent({
      type: "app_boot",
      scope: "App",
      detail: `nav=${navigationEntry?.type ?? "unknown"} width=${readViewportWidth()} url=${window.location.pathname}`,
      shellMode
    });
    const handlePageShow = (event: PageTransitionEvent) => {
      recordLifecycleDebugEvent({
        type: "window_pageshow",
        scope: "window",
        detail: `persisted=${String(event.persisted)}`,
        shellMode: detectUiThemeShellMode(readViewportWidth(), uiTheme)
      });
    };
    const handlePageHide = (event: PageTransitionEvent) => {
      recordLifecycleDebugEvent({
        type: "window_pagehide",
        scope: "window",
        detail: `persisted=${String(event.persisted)}`,
        shellMode: detectUiThemeShellMode(readViewportWidth(), uiTheme)
      });
    };
    const handleBeforeUnload = () => {
      recordLifecycleDebugEvent({
        type: "window_beforeunload",
        scope: "window",
        detail: `url=${window.location.pathname}`,
        shellMode: detectUiThemeShellMode(readViewportWidth(), uiTheme)
      });
    };
    const handleVisibilityChange = () => {
      recordLifecycleDebugEvent({
        type: "window_visibilitychange",
        scope: "document",
        detail: `state=${document.visibilityState}`,
        shellMode: detectUiThemeShellMode(readViewportWidth(), uiTheme)
      });
    };
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [uiTheme]);

  useEffect(() => {
    function handleResize() {
      setShellMode(detectUiThemeShellMode(readViewportWidth(), uiTheme));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [uiTheme]);

  useEffect(() => {
    const grid = paneGridRef.current;
    if (!grid) return;

    const updatePaneGridWidth = () => {
      const nextWidth = grid.clientWidth || grid.getBoundingClientRect().width || readViewportWidth();
      setPaneGridWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
      const nextHeight =
        grid.clientHeight ||
        (grid.parentElement ? grid.parentElement.clientHeight : 0) ||
        grid.getBoundingClientRect().height ||
        0;
      setPaneGridHeight((current) => (Math.abs(current - nextHeight) > 1 ? nextHeight : current));
    };

    // The observer delivers initial geometry before paint. Measuring during
    // every room effect forces styles/layout while sibling panes still update.
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver((entries) => {
      const entry = entries.find((entry) => entry.target === grid);
      if (!entry) {
        updatePaneGridWidth();
        return;
      }
      // The grid has no border/padding: contentRect matches its usable client
      // size, excluding scrollbar space. Retain geometry while hidden (0x0).
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width > 0) setPaneGridWidth((current) => (Math.abs(current - width) > 1 ? width : current));
      if (height > 0) setPaneGridHeight((current) => (Math.abs(current - height) > 1 ? height : current));
    }) : null;
    resizeObserver?.observe(grid);
    if (!resizeObserver) {
      updatePaneGridWidth();
      window.addEventListener("resize", updatePaneGridWidth);
    }
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePaneGridWidth);
    };
  }, [selectedRoomId, shellMode, panes.length, isDesktopSideSurfaceOpen, isCompactSideSurfaceOpen, isRoomFocusMode]);

  useEffect(() => {
    writeDockSession(runtime.platform.sessionStorage, { surface: activeSideSurface, desktopOpen: isDesktopSideSurfaceOpen, compactOpen: isCompactSideSurfaceOpen });
  }, [activeSideSurface, isDesktopSideSurfaceOpen, isCompactSideSurfaceOpen]);

  useEffect(() => {
    try {
      const storageKey = auth?.user?.id ? `${SELECTED_ROOM_ID_STORAGE_KEY}.${auth.user.id}` : SELECTED_ROOM_ID_STORAGE_KEY;
      if (selectedRoomId) {
        runtime.platform.sessionStorage.setItem(storageKey, selectedRoomId);
        runtime.platform.sessionStorage.setItem(SELECTED_ROOM_ID_STORAGE_KEY, selectedRoomId);
      } else {
        runtime.platform.sessionStorage.removeItem(storageKey);
        runtime.platform.sessionStorage.removeItem(SELECTED_ROOM_ID_STORAGE_KEY);
      }
    } catch {
      // Best effort only.
    }
  }, [selectedRoomId, auth?.user?.id]);

  useEffect(() => {
    if (!selectedRoomId) return;
    const stored = readStoredCategoryFilter(selectedRoomId);
    setActiveCategoryColorByRoom((current) =>
      (current[selectedRoomId] ?? null) === stored ? current : { ...current, [selectedRoomId]: stored }
    );
  }, [selectedRoomId]);

  useEffect(() => {
    try {
      if (selectedPaneId) runtime.platform.sessionStorage.setItem(SELECTED_PANE_ID_STORAGE_KEY, selectedPaneId);
      else runtime.platform.sessionStorage.removeItem(SELECTED_PANE_ID_STORAGE_KEY);
    } catch {
      // Best effort only.
    }
  }, [selectedPaneId]);

  useEffect(() => {
    function focusRequestedBrowserPane(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      const detail = parseBrowserPaneActionDetail(event.detail);
      if (detail?.action !== "handoff") return;
      if (panes.some((pane) => pane.id === detail.paneId && (pane.mode === "BROWSER" || pane.mode === "YOUTUBE") && !pane.isMinimized)) {
        setSelectedPaneId(detail.paneId);
      }
    }
    window.addEventListener(BROWSER_PANE_ACTION_EVENT, focusRequestedBrowserPane);
    return () => window.removeEventListener(BROWSER_PANE_ACTION_EVENT, focusRequestedBrowserPane);
  }, [panes]);

  useEffect(() => {
    runtime.platform.localStorage.setItem(TERMINAL_FONT_SIZE_STORAGE_KEY, String(terminalFontSize));
    if (auth?.isAuthenticated) {
      saveUserSettingDebounced("terminalFontSize", terminalFontSize);
    }
  }, [terminalFontSize, auth?.isAuthenticated]);

  useEffect(() => {
    runtime.platform.localStorage.setItem(SESSION_DEBUG_IDS_STORAGE_KEY, String(showSessionDebugIds));
    if (auth?.isAuthenticated) {
      saveUserSettingDebounced("showSessionDebugIds", showSessionDebugIds);
    }
  }, [showSessionDebugIds, auth?.isAuthenticated]);

  useEffect(() => {
    runtime.platform.localStorage.setItem(CLI_DEBUG_MODE_STORAGE_KEY, String(cliDebugModeEnabled));
    if (auth?.isAuthenticated) {
      saveUserSettingDebounced("cliDebugModeEnabled", cliDebugModeEnabled);
    }
  }, [cliDebugModeEnabled, auth?.isAuthenticated]);

  useEffect(() => {
    const hidden = !isDesktopSideSurfaceOpen;
    runtime.platform.localStorage.setItem(SIDE_SURFACE_HIDDEN_STORAGE_KEY, String(hidden));
    if (auth?.isAuthenticated) {
      saveUserSettingDebounced("roomsRailHidden", hidden);
    }
  }, [isDesktopSideSurfaceOpen, auth?.isAuthenticated]);

  useEffect(() => {
    runtime.platform.localStorage.setItem(ROOM_THEME_STORAGE_KEY, roomTheme);
    if (auth?.isAuthenticated) {
      void api.updateUserSettings({ roomTheme }).catch(() => {});
    }
  }, [roomTheme, auth?.isAuthenticated]);

  useEffect(() => {
    if (uiTheme === "classic" || modernAppearance !== "system" || typeof window.matchMedia !== "function") return;
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemPrefersDark(colorScheme.matches);
    update();
    colorScheme.addEventListener?.("change", update);
    return () => colorScheme.removeEventListener?.("change", update);
  }, [modernAppearance, uiTheme]);

  useEffect(() => {
    setIsWorkspaceTextSizePickerOpen(false);
    if (shellMode === "desktop") {
      setIsCompactSideSurfaceOpen(false);
      return;
    }
    setIsThemeMenuOpen(false);
  }, [shellMode]);

  useEffect(() => {
    if (!paneMoveNotice) return;
    const timeoutId = window.setTimeout(() => setPaneMoveNotice(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [paneMoveNotice]);

  useEffect(() => {
    setPaneMoveDialog((current) => (current?.pending ? current : null));
    setIsCliLauncherOpen(false);
  }, [selectedRoomId]);

  useEffect(() => {
    if (panes.length >= 16) setIsCliLauncherOpen(false);
  }, [panes.length]);

  useEffect(() => {
    if (!auth?.isAuthenticated) return;
    const interval = window.setInterval(() => {
      const roomIds = selectRoomRuntimePollIds({
        warmRoomIds: warmRoomIdsRef.current,
        activeRoomId: selectedRoomIdRef.current,
        lastPolledAtByRoomId: roomRuntimeLastPolledAtRef.current,
        now: Date.now()
      });
      for (const roomId of roomIds) {
        refreshHiddenRoomRuntimeRef.current(roomId).catch((err: unknown) => {
          if (!appMountedRef.current) return;
          if (isRoomNotFoundError(err, roomId)) {
            if (roomId === selectedRoomIdRef.current) {
              recoverMissingRoom(roomId).catch((recoveryError: unknown) =>
                setError(recoveryError instanceof Error ? recoveryError.message : "Room recovery failed")
              );
            } else {
              removeRoomRuntime(roomId);
            }
            return;
          }
          if (roomId !== selectedRoomIdRef.current) return;
          if (!isTransientUpstreamRuntimeError(err)) {
            setError(err instanceof Error ? err.message : "Room refresh failed");
          }
        });
      }
    }, WARM_ROOM_RUNTIME_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.isAuthenticated]);

  async function handleLogin(nextAuth: AuthMe) {
    if (nextAuth.isAuthenticated && nextAuth.settings) {
      const seeded = await seedInitialLocalSettingsToServer(api, nextAuth.settings, runtime.platform.localStorage);
      if (seeded) nextAuth.settings = seeded;

      if (typeof nextAuth.settings.suppressNotifications === "boolean") {
        setSuppressNotifications(nextAuth.settings.suppressNotifications);
      }
      if (typeof nextAuth.settings.warmRoomEnabled === "boolean") {
        setWarmRoomEnabled(nextAuth.settings.warmRoomEnabled);
      }
      if (typeof nextAuth.settings.warmRoomConnectedPaneLimit === "number") {
        setWarmConnectedPaneLimit(nextAuth.settings.warmRoomConnectedPaneLimit);
      }
      if (typeof nextAuth.settings.cliImagePreviewLimit === "number") {
        setCliImagePreviewLimit(nextAuth.settings.cliImagePreviewLimit);
      }
      if (typeof nextAuth.settings.roomTheme === "string" && roomThemes.some((t) => t.id === nextAuth.settings?.roomTheme)) {
        setRoomTheme(nextAuth.settings.roomTheme as RoomTheme);
      }
      if (typeof nextAuth.settings.terminalFontSize === "number") {
        setTerminalFontSize(nextAuth.settings.terminalFontSize);
      }
      if (typeof nextAuth.settings.showSessionDebugIds === "boolean") {
        setShowSessionDebugIds(nextAuth.settings.showSessionDebugIds);
      }
      if (typeof nextAuth.settings.cliDebugModeEnabled === "boolean") {
        setCliDebugModeEnabled(nextAuth.settings.cliDebugModeEnabled);
      }
      if (typeof nextAuth.settings.cliFloatsHidden === "boolean") {
        setCliFloatsHidden(nextAuth.settings.cliFloatsHidden);
      }
      if (typeof nextAuth.settings.sensitiveDataMasked === "boolean") {
        setMaskSensitiveData(nextAuth.settings.sensitiveDataMasked);
      }
      if (typeof nextAuth.settings.roomToolbarHidden === "boolean") {
        setIsRoomToolbarHidden(nextAuth.settings.roomToolbarHidden);
      }
      if (typeof nextAuth.settings.roomFocusMode === "boolean") {
        setIsRoomFocusMode(nextAuth.settings.roomFocusMode);
      }
      if (typeof nextAuth.settings.roomsRailHidden === "boolean") {
        setIsDesktopSideSurfaceOpen(!nextAuth.settings.roomsRailHidden);
      }
      if (typeof nextAuth.settings.worktreeDefaultEnabled === "boolean") {
        setDefaultWorktreeEnabled(nextAuth.settings.worktreeDefaultEnabled);
      }
      if (nextAuth.settings.roomWorktreeOverrides && typeof nextAuth.settings.roomWorktreeOverrides === "object") {
        setRoomWorktreeOverrides(nextAuth.settings.roomWorktreeOverrides as Record<string, boolean>);
      }
      if (Array.isArray(nextAuth.settings.projectPresets)) {
        setProjectPresets(nextAuth.settings.projectPresets as { label: string; path: string }[]);
      }
      if (nextAuth.settings.roomExtraEmptySlots && typeof nextAuth.settings.roomExtraEmptySlots === "object") {
        setRoomExtraEmptySlots(nextAuth.settings.roomExtraEmptySlots as Record<string, number>);
      }
      const { themeChanged } = applyServerUserSettings(
        runtime.platform.localStorage,
        nextAuth.settings,
        uiTheme,
        modernAppearance,
        modernIconPack,
        uiBackground,
        nextAuth.user?.id
      );
      if (themeChanged) {
        runtime.platform.reloadPage();
        return;
      }
    }
    setAuth(nextAuth);
    if (nextAuth.isAuthenticated) {
      if (runtimeKind !== "demo") {
        const diagnosticsStartup = startAppDiagnosticsBootstrap();
        await diagnosticsStartup.beforeMount;
      }
      await refresh();
    }
  }

  async function handleOwnerClaim(input: SetupClaimInput) {
    const nextAuth = await api.claimSetup(input);
    setSetupStatus({ setupRequired: false, expiresAt: null });
    if (!nextAuth.isOnboardingComplete) {
      setupFromWorkspace.current = false;
      setIsSetupConnectionsOpen(true);
    }
    await handleLogin(nextAuth);
  }

  async function signOut() {
    await api.logout();
    if (runtimeKind === "demo") {
      setAuth(await api.me());
      setAppView("workspace");
      return;
    }
    runtime.platform.reloadPage();
  }

  function openHelp() {
    window.history.pushState({ spaceView: "help" }, "", "/help");
    setAppView("help");
  }

  function closeHelp() {
    window.history.replaceState({ spaceView: "workspace" }, "", "/");
    setAppView("workspace");
  }

  function openBenchmark() {
    window.history.pushState({ spaceView: "benchmark" }, "", "/benchmark");
    setAppView("benchmark");
  }

  function closeBenchmark() {
    window.history.replaceState({ spaceView: "workspace" }, "", "/");
    setAppView("workspace");
  }

  async function createRoom() {
    if (roomCreationPendingRef.current) return;
    if (rooms.length >= MAX_ROOMS) {
      setError(`Maximum room limit (${MAX_ROOMS}) reached. Close or delete an existing room to create a new one.`);
      return;
    }
    roomCreationPendingRef.current = true;
    setRoomCreationPending(true);
    setError(null);
    try {
      let room: Room;
      try {
        room = await api.createRoom(
          nextGeneratedRoomName(rooms.map((room) => room.name)),
          0,
          undefined,
          "/opt/spaceapp"
        );
      } catch (err) {
        setError(`Room creation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        return;
      }
      setRooms((current) => sortRoomsByOrder([...current, room]));
      setRoomCliActivityCounts((current) => ({ ...current, [room.id]: 0 }));
      setRoomCliRuntimeIds((current) => ({ ...current, [room.id]: [] }));
      activateRoom(room.id);
      setActiveSideSurface("rooms");
      if (shellMode === "desktop") {
        setIsDesktopSideSurfaceOpen(true);
      } else {
        setIsCompactSideSurfaceOpen(true);
      }
      try {
        await loadRoomRuntime(room.id);
      } catch (err) {
        setError(`Room created, but failed to load: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    } finally {
      roomCreationPendingRef.current = false;
      setRoomCreationPending(false);
    }
  }

  async function addRoomPanes(roomId: string, input: CreateRoomPanesRequest) {
    const result = await api.createRoomPanes(roomId, input);
    const createdPane = result.data.at(-1);
    if (shellMode === "mobile" && selectedRoomIdRef.current === roomId && createdPane) {
      selectedPaneIdRef.current = createdPane.id;
      setSelectedPaneId(createdPane.id);
    }
    await loadRoomRuntime(roomId);
  }

  async function addRootAdminPane(targetRoomId?: string) {
    const roomId = targetRoomId || selectedRoomId;
    if (!roomId || panes.length >= 16) return;
    const targetRoom = rooms.find((r) => r.id === roomId);
    const targetCwd = targetRoom?.projectPath || "/opt/spaceapp";
    const created = await api.createPane(roomId, "CLI ROOT", "TERMINAL", {
      cwd: targetCwd,
      terminalRuntimeId: "cli:root"
    });
    setPanes((current) => [...current, created]);
    setSelectedPaneId(created.id);
    await loadRoomRuntime(roomId);
  }

  async function addWorktreePane(targetRoomId?: string) {
    const roomId = targetRoomId || selectedRoomId;
    if (!roomId || panes.length >= 16) return;
    await addRoomPanes(roomId, {
      panes: [{
        mode: "TERMINAL",
        terminalRuntimeId: "cli:gemini",
        useWorktree: true
      }]
    });
  }

  async function addFilesPane(count = 1, targetRoomId?: string) {
    const roomId = targetRoomId || selectedRoomId;
    if (!roomId || panes.length >= 16) return;
    const targetRoom = rooms.find((r) => r.id === roomId);
    if (targetRoom?.projectPath) {
      await ensureProjectFolder(targetRoom.projectPath);
    }
    const targetCount = Math.min(Math.max(1, count), 16 - panes.length);
    try {
      for (let i = 0; i < targetCount; i++) {
        const prior = (await api.panes(roomId, { includeClosed: true }).catch(() => null))?.data ?? [];
        const closedMatch = prior.find((candidate) => candidate.isClosed && candidate.mode === "FILES");
        let pane: Pane;
        if (closedMatch) {
          pane = await api.updatePane(closedMatch.id, {
            isClosed: false,
            status: "IDLE",
            cwd: targetRoom?.projectPath || "/opt/spaceapp"
          });
        } else {
          pane = await api.createPane(roomId, paneTitleForMode("FILES", panes.length + 1), "FILES", {
            cwd: targetRoom?.projectPath || "/opt/spaceapp"
          });
        }
        setPanes((current) => [...current.filter((candidate) => candidate.id !== pane.id), pane]);
        setSelectedPaneId(pane.id);
      }
      await refreshRoomEvents(roomId);
      await loadRoomRuntime(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Files pane failed to open");
    }
  }

  async function addDatabasesPane(count = 1, targetRoomId?: string) {
    const roomId = targetRoomId || selectedRoomId;
    if (!roomId || panes.length >= 16) return;
    const targetRoom = rooms.find((r) => r.id === roomId);
    if (targetRoom?.projectPath) {
      await ensureProjectFolder(targetRoom.projectPath);
    }
    const targetCount = Math.min(Math.max(1, count), 16 - panes.length);
    try {
      for (let i = 0; i < targetCount; i++) {
        const prior = (await api.panes(roomId, { includeClosed: true }).catch(() => null))?.data ?? [];
        const closedMatch = prior.find((candidate) => candidate.isClosed && candidate.mode === "DATABASES");
        let pane: Pane;
        if (closedMatch) {
          pane = await api.updatePane(closedMatch.id, {
            isClosed: false,
            status: "IDLE",
            cwd: targetRoom?.projectPath || "/opt/spaceapp"
          });
        } else {
          pane = await api.createPane(roomId, paneTitleForMode("DATABASES", panes.length + 1), "DATABASES", {
            cwd: targetRoom?.projectPath || "/opt/spaceapp"
          });
        }
        setPanes((current) => [...current.filter((candidate) => candidate.id !== pane.id), pane]);
        setSelectedPaneId(pane.id);
      }
      await refreshRoomEvents(roomId);
      await loadRoomRuntime(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Databases pane failed to open");
    }
  }

  async function addDemosPane(count = 1) {
    if (!selectedRoomId || panes.length >= 16) return;
    const targetCount = Math.min(Math.max(1, count), 16 - panes.length);
    const newPanes = Array.from({ length: targetCount }, () => ({ mode: "DEMOS" as const }));
    await addRoomPanes(selectedRoomId, { panes: newPanes });
  }

  async function addT3CodePane(count = 1) {
    if (!selectedRoomId || panes.length >= 16) return;
    const targetCount = Math.min(Math.max(1, count), 16 - panes.length);
    // Same room worktree isolation as CLI panes: each T3 pane gets its own worktree.
    const useWorktree = isRoomWorktreeEnabled(selectedRoomId);
    const newPanes = Array.from({ length: targetCount }, () => ({ mode: "T3CODE" as const, ...(useWorktree ? { useWorktree: true } : {}) }));
    await addRoomPanes(selectedRoomId, { panes: newPanes });
  }

  function toggleCliLauncher() {
    if (isCliLauncherOpen) {
      setIsCliLauncherOpen(false);
      return;
    }
    if (!selectedRoomId || cliPaneCreationPendingRef.current) return;
    cliLauncherReturnFocusRef.current = cliLauncherButtonRef.current?.isConnected
      ? cliLauncherButtonRef.current
      : roomOverflowTriggerRef.current;
    setIsQuickLinksOpen(false);
    setIsVibeMusicOpen(false);
    setIsChatLauncherOpen(false);
    setIsCliLauncherOpen(true);
  }

  function openCliLauncher() {
    if (!selectedRoomId || cliPaneCreationPendingRef.current) return;
    cliLauncherReturnFocusRef.current = cliLauncherButtonRef.current?.isConnected
      ? cliLauncherButtonRef.current
      : roomOverflowTriggerRef.current;
    setIsQuickLinksOpen(false);
    setIsVibeMusicOpen(false);
    setIsCliLauncherOpen(true);
  }

  function toggleChatLauncher() {
    if (isChatLauncherOpen) {
      setIsChatLauncherOpen(false);
      return;
    }
    if (!selectedRoomId || cliPaneCreationPendingRef.current) return;
    setIsQuickLinksOpen(false);
    setIsVibeMusicOpen(false);
    setIsCliLauncherOpen(false);
    setIsChatLauncherOpen(true);
  }

  function closeChatLauncher() {
    setIsChatLauncherOpen(false);
  }

  async function addCliRuntimePane(runtime: AgentRuntime, count = 1) {
    const roomId = selectedRoomIdRef.current;
    if (!roomId) throw new Error("Select a room before adding a CLI pane.");
    if (panesRef.current.length >= 16) throw new Error("This room already has the maximum of 16 panes.");
    if (cliPaneCreationPendingRef.current) throw new Error("A CLI pane is already being created.");
    if (runtime.id === "cli:root" || !runtime.capabilities.includes("CLI") || !isCliRuntimeTerminalLaunchable(runtime)) {
      throw new Error(runtime.statusReason || "This CLI runtime is unavailable.");
    }

    const targetRoom = rooms.find((r) => r.id === roomId);
    const effectiveProjectPath = targetRoom?.projectPath || dockProjectPathDrafts[roomId]?.trim() || "/opt/spaceapp";
    const roomCwd = effectiveProjectPath;
    cliPaneCreationPendingRef.current = true;
    setCliPaneCreationPending(true);
    const targetCount = Math.min(Math.max(1, count), 16 - panesRef.current.length);
    if (targetCount <= 0) return;
    try {
      const optimisticPanes: Pane[] = [];
      const currentPanes = panesRef.current;
      const baseOrder = currentPanes.reduce((max, p) => Math.max(max, p.order), -1) + 1;
      const nowIso = new Date().toISOString();
      const baseTimestamp = Date.now().toString(36);

      for (let i = 0; i < targetCount; i++) {
        const optimisticId = `pane:optimistic-${baseTimestamp}-${i}`;
        const optimisticTitle =
          runtime.id === "cli:codex"
            ? paneTitleForMode("TERMINAL", currentPanes.length + i + 1)
            : runtime.displayName;
        optimisticPanes.push({
          id: optimisticId,
          roomId,
          title: optimisticTitle,
          titleSource: "auto",
          mode: "TERMINAL",
          status: "IDLE",
          providerId: null,
          modelId: null,
          terminalRuntimeId: runtime.id === "cli:codex" ? null : runtime.id,
          reasoningEffort: "medium",
          cwd: effectiveProjectPath ? effectiveProjectPath : (runtime.id === "cli:codex" ? null : "/etc"),
          order: baseOrder + i,
          columnSpan: 1,
          isMaximized: false,
          isMinimized: false,
          isClosed: false,
          split: { parentId: null, direction: null, size: null },
          categoryColor: null,
          vncTarget: null,
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }

      // Show skeleton cards immediately
      if (selectedRoomIdRef.current === roomId) {
        setPanes((current) => [...current, ...optimisticPanes]);
      }

      // Create all panes concurrently
      const createPromises = optimisticPanes.map(async (optPane) => {
        let paneCwd = roomCwd;
        if (effectiveProjectPath && isRoomWorktreeEnabled(roomId)) {
          try {
            const wt = await createWorktree({
              repoPath: effectiveProjectPath,
              roomId,
              baseBranch: "main",
              linkModules: true
            });
            paneCwd = wt.worktreePath;
            if (!targetRoom?.projectPath && targetRoom) {
              void api.updateRoom(roomId, { name: targetRoom.name, projectPath: effectiveProjectPath }).then((updated) => {
                setRooms((current) => current.map((r) => (r.id === roomId ? updated : r)));
              });
            }
          } catch (err) {
            console.warn("Failed to provision worktree for CLI pane, falling back to project path:", err);
            paneCwd = effectiveProjectPath;
          }
        }
        const created = runtime.id === "cli:codex"
          ? await api.createPane(roomId, optPane.title, "TERMINAL", paneCwd ? { cwd: paneCwd } : undefined)
          : await api.createPane(roomId, runtime.displayName, "TERMINAL", {
              cwd: paneCwd,
              terminalRuntimeId: runtime.id
            });
        return { optimisticId: optPane.id, created };
      });

      const results = await Promise.allSettled(createPromises);
      const createdPanes: Pane[] = [];
      const failedOptimisticIds = new Set<string>();

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const optPane = optimisticPanes[i];
        if (!res || !optPane) continue;
        if (res.status === "fulfilled") {
          createdPanes.push(res.value.created);
        } else {
          failedOptimisticIds.add(optPane.id);
        }
      }

      if (selectedRoomIdRef.current === roomId) {
        setPanes((current) => {
          const optimisticIds = new Set(optimisticPanes.map((p) => p.id));
          const withoutOptimistic = current.filter((pane) => !optimisticIds.has(pane.id));
          const existingIds = new Set(withoutOptimistic.map((p) => p.id));
          const toAdd = createdPanes.filter((p) => !existingIds.has(p.id));
          return [...withoutOptimistic, ...toAdd];
        });
        const firstCreated = createdPanes[0];
        if (firstCreated) {
          setSelectedPaneId(firstCreated.id);
        }
      }
      if (failedOptimisticIds.size > 0 && createdPanes.length === 0) {
        const firstError = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
        throw firstError?.reason ?? new Error("Failed to create CLI panes.");
      }
      if (selectedRoomIdRef.current === roomId) {
        void refreshRoomEvents(roomId).catch(() => setError("CLI pane created, but room activity could not be refreshed."));
      }
    } finally {
      cliPaneCreationPendingRef.current = false;
      setCliPaneCreationPending(false);
    }
  }

  async function openCliRuntimeLogin(runtime: AgentRuntime) {
    const roomId = selectedRoomIdRef.current;
    if (!roomId) throw new Error("Select a room before opening CLI login.");
    const result = await api.cliLogin(roomId, runtime.id);
    if (selectedRoomIdRef.current === roomId) {
      pendingPaneHeaderFocusIdRef.current = result.pane.id;
      setPanes((current) => current.some((pane) => pane.id === result.pane.id) ? current : [...current, result.pane]);
      setSelectedPaneId(result.pane.id);
      void refreshRoomEvents(roomId).catch(() => setError("CLI login opened, but room activity could not be refreshed."));
    }
  }

  async function openSetupConnectionLogin(connectionId: string) {
    const registry = await api.cliRuntimes();
    const connectionRuntime = registry.data.find((candidate) => candidate.id === connectionId);
    if (!connectionRuntime) {
      throw new Error("This CLI connection is not available in the current Space runtime.");
    }

    if (!selectedRoomIdRef.current) {
      const { room } = await api.setupStarterRoom();
      setRooms((current) => sortRoomsByOrder(
        current.some((candidate) => candidate.id === room.id)
          ? current.map((candidate) => candidate.id === room.id ? room : candidate)
          : [...current, room]
      ));
      activateRoom(room.id);
      await loadRoomRuntime(room.id);
    }

    await openCliRuntimeLogin(connectionRuntime);
  }

  async function selectRoom(roomId: string, options: { keepCompactSurfaceOpen?: boolean } = {}) {
    const warmRuntimeReady = Boolean(
      warmRoomIdsRef.current.includes(roomId) &&
      roomRuntimesRef.current[roomId] &&
      roomPaneLoadStatesRef.current[roomId] === "loaded"
    );
    const measurement = startRoomSwitchMeasurement({
      fromRoomId: selectedRoomIdRef.current,
      toRoomId: roomId,
      temperature: classifyRoomSwitchTemperature(roomId, warmRoomIdsRef.current)
    });
    // Activate before starting any load. A document-wide View Transition defers
    // this callback until Chrome captures all visible pane surfaces, including
    // canvases/iframes, adding work even when the target runtime is already warm.
    activateRoom(roomId);
    recordRoomSwitchMeasurementPhase(measurement, "activated");
    if (!options.keepCompactSurfaceOpen) setIsCompactSideSurfaceOpen(false);
    if (warmRuntimeReady) {
      recordRoomSwitchMeasurementPhase(measurement, "loaded");
      return;
    }
    let panesLoaded = false;
    try {
      await loadRoomRuntime(roomId, () => {
        panesLoaded = true;
        recordRoomSwitchMeasurementPhase(measurement, "loaded");
      });
    } catch (error) {
      if (!panesLoaded) recordRoomSwitchMeasurementPhase(measurement, "failed");
      throw error;
    }
  }

  useEffect(() => {
    const openRecoveryRoom = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = parseCliRecoveryOpenedDetail(event.detail);
      if (!detail) return;
      void (async () => {
        const roomPayload = await api.rooms({ all: true });
        setRooms(sortRoomsByOrder(roomPayload.data));
        await selectRoom(detail.roomId);
        if (detail.paneId) setSelectedPaneId(detail.paneId);
      })().catch(() => setError("CLI Recovery opened, but the room could not be selected automatically."));
    };
    window.addEventListener(CLI_RECOVERY_OPENED_EVENT, openRecoveryRoom);
    return () => window.removeEventListener(CLI_RECOVERY_OPENED_EVENT, openRecoveryRoom);
  });

  useEffect(() => {
    if (!isAdminMode && selectedRoomId && rooms.length > 0) {
      const currentRoom = rooms.find((r) => r.id === selectedRoomId);
      if (currentRoom && currentRoom.ownerUserId && currentRoom.ownerUserId !== auth?.user?.id) {
        const myFirstRoom = rooms.find((r) => !r.ownerUserId || r.ownerUserId === auth?.user?.id);
        if (myFirstRoom) {
          void selectRoom(myFirstRoom.id);
        }
      }
    }
  }, [isAdminMode, selectedRoomId, rooms, auth?.user?.id]);

  // Every room delete is confirmed in the app; running CLI sessions are named in the question.
  async function requestRoomDelete(room: Room) {
    if (deletePendingRoomId) return;
    const activeCli = roomCliActivityCounts[room.id] ?? 0;
    const confirmed = await roomDeleteConfirm.confirm({
      title: `Delete ${room.name}?`,
      message: activeCli > 0
        ? `This room has ${activeCli} active CLI ${activeCli === 1 ? "session" : "sessions"} that will be terminated. The room and its panes will be removed.`
        : "The room and its panes will be removed.",
      confirmLabel: "Delete room"
    });
    if (confirmed) await deleteRoom(room.id);
  }

  async function deleteRoom(roomId: string) {
    if (deletePendingRoomId) return;
    const deletedRoom = rooms.find((room) => room.id === roomId);
    const nextRooms = rooms.filter((room) => room.id !== roomId);
    const candidateRooms = !isAdminMode ? nextRooms.filter((r) => !r.ownerUserId || r.ownerUserId === auth?.user?.id) : nextRooms;
    const nextSelectedRoomId = selectedRoomId === roomId ? candidateRooms[0]?.id ?? null : selectedRoomId;
    setDeletePendingRoomId(roomId);
    setError(null);
    setRooms(nextRooms);
    setRoomCliActivityCounts((current) => {
      if (!(roomId in current)) return current;
      const next = { ...current };
      delete next[roomId];
      return next;
    });
    setRoomCliRuntimeIds((current) => {
      if (!(roomId in current)) return current;
      const next = { ...current };
      delete next[roomId];
      return next;
    });
    if (selectedRoomId === roomId) {
      activateRoom(nextSelectedRoomId);
      removeRoomRuntime(roomId);
      if (nextSelectedRoomId) {
        await loadRoomRuntime(nextSelectedRoomId);
      } else {
        setPanes([]);
        setSelectedPaneId(null);
        setTurns([]);
        setRoomEvents([]);
        setSwarmState(await api.swarm());
      }
    } else {
      removeRoomRuntime(roomId);
    }
    try {
      await api.deleteRoom(roomId);
    } catch (err) {
      if (deletedRoom) setRooms(sortRoomsByOrder([...nextRooms, deletedRoom]));
      setError(err instanceof Error ? err.message : "Room delete failed");
    } finally {
      setDeletePendingRoomId(null);
    }
  }

  function openMovePaneDialog(pane: Pane) {
    const targetRooms = rooms.filter((room) => room.id !== pane.roomId);
    if (!targetRooms.length) return;
    setError(null);
    setPaneMoveNotice(null);
    setPaneMoveDialog({
      pane,
      targetRoomId: targetRooms[0]!.id,
      pending: false,
      error: null
    });
  }

  function closeMovePaneDialog() {
    setPaneMoveDialog((current) => (current?.pending ? current : null));
  }

  async function submitPaneMove() {
    if (!paneMoveDialog || paneMoveDialog.pending) return;
    const targetRoomName = rooms.find((room) => room.id === paneMoveDialog.targetRoomId)?.name ?? "the selected room";
    setPaneMoveDialog((current) => (current ? { ...current, pending: true, error: null } : current));
    try {
      const move = await api.movePane(paneMoveDialog.pane.id, paneMoveDialog.targetRoomId);
      if (selectedRoomId === move.sourceRoomId) {
        await loadRoomRuntime(move.sourceRoomId);
      }
      setPaneMoveDialog(null);
      setPaneMoveNotice(`Moved "${move.sourcePane.title}" to "${targetRoomName}".`);
    } catch (err) {
      setPaneMoveDialog((current) =>
        current
          ? {
              ...current,
              pending: false,
              error: err instanceof Error ? err.message : "Pane move failed"
            }
          : current
      );
    }
  }

  async function addPane(mode: Pane["mode"], youtubeUrl?: string, count = 1) {
    const roomId = selectedRoomIdRef.current;
    if (
      !roomId ||
      panesRef.current.length >= 16 ||
      paneCreationPendingRef.current ||
      cliPaneCreationPendingRef.current
    ) return;
    paneCreationPendingRef.current = true;
    setPaneCreationPendingMode(mode);
    setError(null);
    const targetCount = Math.min(Math.max(1, count), 16 - panesRef.current.length);
    try {
      for (let i = 0; i < targetCount; i++) {
        // The closed-pane lookup does not depend on the worktree: run both together.
        const priorRequest = api.panes(roomId, { includeClosed: true }).catch(() => null);
        let paneCwd: string | undefined;
        if (mode === "TERMINAL") {
          const targetRoom = rooms.find((r) => r.id === roomId);
          const effectiveProjectPath = targetRoom?.projectPath || dockProjectPathDrafts[roomId]?.trim() || "/opt/spaceapp";
          if (isRoomWorktreeEnabled(roomId)) {
            try {
              const wt = await createWorktree({
                repoPath: effectiveProjectPath,
                roomId,
                baseBranch: "main",
                linkModules: true
              });
              paneCwd = wt.worktreePath;
              if (!targetRoom?.projectPath && targetRoom) {
                void api.updateRoom(roomId, { name: targetRoom.name, projectPath: effectiveProjectPath }).then((updated) => {
                  setRooms((current) => current.map((r) => (r.id === roomId ? updated : r)));
                });
              }
            } catch (err) {
              console.warn("Failed to provision worktree for CLI pane in addPane:", err);
              paneCwd = effectiveProjectPath;
            }
          } else {
            paneCwd = effectiveProjectPath;
          }
        }
        const prior = (await priorRequest)?.data ?? [];
        const closedMatch = prior.find((candidate) => candidate.isClosed && candidate.mode === mode);
        let pane: Pane;
        if (closedMatch) {
          pane = await api.updatePane(closedMatch.id, {
            isClosed: false,
            status: "IDLE",
            ...(paneCwd ? { cwd: paneCwd } : {})
          });
        } else {
          pane = await api.createPane(
            roomId,
            paneTitleForMode(mode, panesRef.current.length + 1),
            mode,
            paneCwd ? { cwd: paneCwd } : undefined
          );
        }
        if (mode === "YOUTUBE" && youtubeUrl) {
          registerYouTubeBrowseIntent(pane.id, youtubeUrl);
        }
        if (selectedRoomIdRef.current === roomId) {
          setPanes((current) => [...current.filter((candidate) => candidate.id !== pane.id), pane]);
          setSelectedPaneId(pane.id);
          setIsMemoryWorkspaceOpen(false);
        }
      }
      await refreshRoomEvents(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pane failed to open");
    } finally {
      paneCreationPendingRef.current = false;
      setPaneCreationPendingMode(null);
    }
  }

  async function addHarnessPane(count = 1) {
    if (!selectedRoomId || panes.length >= 16) return;
    if (!isHarnessEnabled) {
      setError("DeepSeek Harness is disabled. Enable it in Settings to open a Harness pane.");
      return;
    }
    const targetCount = Math.min(Math.max(1, count), 16 - panes.length);
    try {
      for (let i = 0; i < targetCount; i++) {
        const pane = await api.createPane(selectedRoomId, paneTitleForMode("HARNESS", panes.length + 1), "HARNESS");
        setPanes((current) => [...current.filter((candidate) => candidate.id !== pane.id), pane]);
        setSelectedPaneId(pane.id);
        setIsMemoryWorkspaceOpen(false);
      }
      await refreshRoomEvents(selectedRoomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Harness pane failed to open");
    }
  }

  async function addLivePane(count = 1): Promise<Pane | null> {
    const targetRoomId = selectedRoomId || activeRoom?.id || rooms[0]?.id;
    if (!targetRoomId) {
      showLiveDebug("Cannot open AI Live: No active room found.", "error");
      return null;
    }
    if (panes.length >= 16) {
      showLiveDebug("Room pane limit reached (16 max).", "error");
      return null;
    }
    showLiveDebug("Opening AI Live audio pane...", "info");
    const targetCount = Math.min(Math.max(1, count), 16 - panes.length);
    let lastPane: Pane | null = null;
    try {
      for (let i = 0; i < targetCount; i++) {
        const pane = await api.createPane(targetRoomId, paneTitleForMode("LIVE", panes.length + 1), "LIVE");
        setPanes((current) => [...current.filter((candidate) => candidate.id !== pane.id), pane]);
        setSelectedPaneId(pane.id);
        lastPane = pane;
      }
      await refreshRoomEvents(targetRoomId);
      showLiveDebug("AI Live pane opened successfully.", "success");
      return lastPane;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Live audio pane failed to open";
      setError(msg);
      showLiveDebug(`AI Live pane error: ${msg}`, "error");
      return null;
    }
  }

  function activateLiveFromRail() {
    showLiveDebug("AI Live button tapped...", "info");
    const targetRoomId = selectedRoomId || activeRoom?.id || rooms[0]?.id;
    if (!targetRoomId) {
      showLiveDebug("No active room found for AI Live.", "error");
      return;
    }
    if (!selectedRoomId) {
      setSelectedRoomId(targetRoomId);
    }
    window.dispatchEvent(new CustomEvent("space-live-rail-toggle"));
  }

  const toggleLiveRailGraphic = useCallback(() => {
    setIsLiveRailGraphicDisabled((prev) => {
      const next = !prev;
      try {
        getSpaceRuntime().platform.localStorage.setItem(LIVE_RAIL_GRAPHIC_DISABLED_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const handleToggle = () => {
      toggleLiveRailGraphic();
    };
    window.addEventListener("space-live-rail-graphic-toggle", handleToggle);
    return () => {
      window.removeEventListener("space-live-rail-graphic-toggle", handleToggle);
    };
  }, [toggleLiveRailGraphic]);

  async function addLegacyHarnessPane() {
    if (!selectedRoomId || panes.length >= 16) return;
    let createdPaneId: string | null = null;
    try {
      const pane = await api.createPane(selectedRoomId, "DeepSeek Harness", "BROWSER");
      createdPaneId = pane.id;
      await api.startBrowserSession(pane.id, {
        targetUrl: "http://127.0.0.1:3080/"
      });
      setPanes((current) => [...current.filter((candidate) => candidate.id !== pane.id), pane]);
      setSelectedPaneId(pane.id);
      await refreshRoomEvents(selectedRoomId);
    } catch (err) {
      if (createdPaneId) await api.closePane(createdPaneId).catch(() => undefined);
      setError(err instanceof Error ? err.message : "DeepSeek Harness pane failed to open");
    }
  }

  async function splitPane(sourcePane: Pane, direction: "horizontal" | "vertical") {
    if (!selectedRoomId) return;
    const paneLimit = roomPaneLimit(rooms.find((room) => room.id === selectedRoomId));
    if (panes.length >= paneLimit) {
      setError(`This room already has the maximum of ${paneLimit} panes.`);
      return;
    }
    const sourceTerminalRuntimeId = sourcePane.mode === "TERMINAL"
      ? sourcePane.terminalRuntimeId ?? "cli:codex"
      : null;
    if (
      !isCodexEnabled &&
      (sourcePane.mode === "CHAT" || sourceTerminalRuntimeId === "cli:codex")
    ) return;

    let paneCwd = sourcePane.mode === "TERMINAL" ? null : sourcePane.cwd;
    if (sourcePane.mode === "TERMINAL") {
      const targetRoom = rooms.find((r) => r.id === selectedRoomId);
      const effectiveProjectPath = targetRoom?.projectPath || dockProjectPathDrafts[selectedRoomId]?.trim() || "/opt/spaceapp";
      const baseRepoPath = (sourcePane.cwd && !sourcePane.cwd.includes("/worktrees/") && !sourcePane.cwd.includes("/agent-workspace/"))
        ? sourcePane.cwd
        : effectiveProjectPath;
      if (isRoomWorktreeEnabled(selectedRoomId)) {
        try {
          const wt = await createWorktree({
            repoPath: baseRepoPath,
            roomId: selectedRoomId,
            baseBranch: "main",
            linkModules: true
          });
          paneCwd = wt.worktreePath;
          if (!targetRoom?.projectPath && targetRoom) {
            void api.updateRoom(selectedRoomId, { name: targetRoom.name, projectPath: effectiveProjectPath }).then((updated) => {
              setRooms((current) => current.map((r) => (r.id === selectedRoomId ? updated : r)));
            });
          }
        } catch (err) {
          console.warn("Failed to provision worktree for split CLI pane, falling back to project path:", err);
          paneCwd = effectiveProjectPath;
        }
      } else {
        paneCwd = effectiveProjectPath;
      }
    }

    let pane: Pane;
    try {
      pane = await api.createPane(selectedRoomId, paneTitleForMode(sourcePane.mode, panes.length + 1), sourcePane.mode, {
        providerId: sourcePane.providerId,
        modelId: sourcePane.modelId,
        terminalRuntimeId: sourceTerminalRuntimeId,
        cwd: paneCwd,
        vncTarget: sourcePane.mode === "VNC" ? sourcePane.vncTarget : null,
        split: { parentId: sourcePane.id, direction, size: 50 }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pane could not be added.");
      return;
    }
    setPanes((current) => [...current, pane]);
    setSelectedPaneId(pane.id);
    await refreshRoomEvents(selectedRoomId);
  }

  async function closePane(paneId: string) {
    // Remove the pane first so the click feels instant; the server stops the
    // pane's session meanwhile and a failure puts the pane back where it was.
    const closingIndex = panesRef.current.findIndex((pane) => pane.id === paneId);
    const closingPane = closingIndex >= 0 ? panesRef.current[closingIndex] : null;
    const wasSelected = selectedPaneIdRef.current === paneId;
    setPanes((current) => current.filter((pane) => pane.id !== paneId));
    setSelectedPaneId((current) => (current === paneId ? null : current));
    try {
      await api.closePane(paneId);
    } catch (err) {
      if (closingPane) {
        setPanes((current) => {
          if (current.some((pane) => pane.id === paneId) || current.some((pane) => pane.roomId !== closingPane.roomId)) return current;
          const restored = [...current];
          restored.splice(Math.min(closingIndex, restored.length), 0, closingPane);
          return restored;
        });
        if (wasSelected) setSelectedPaneId((current) => current ?? paneId);
      }
      setError(err instanceof Error ? err.message : "Pane close failed");
      return;
    }
    const roomId = closingPane?.roomId ?? selectedRoomIdRef.current;
    // Closing changes only this pane server-side; refresh room metadata in the
    // background instead of re-hydrating the whole room runtime.
    if (roomId) void loadRoomMetadata(roomId).catch(() => undefined);
  }

  async function toggleMaximize(pane: Pane) {
    const willBeMaximized = !pane.isMaximized;
    setSelectedPaneId(pane.id);
    setPanes((current) =>
      current.map((item) => {
        if (item.id === pane.id) return { ...item, isMaximized: willBeMaximized };
        if (willBeMaximized && item.isMaximized) return { ...item, isMaximized: false };
        return item;
      })
    );
    try {
      const updated = await api.updatePane(pane.id, { isMaximized: willBeMaximized });
      setPanes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      void refreshRoomEvents(pane.roomId);
    } catch (err) {
      setPanes((current) =>
        current.map((item) => (item.id === pane.id ? { ...item, isMaximized: !willBeMaximized } : item))
      );
      setError(err instanceof Error ? err.message : "Failed to toggle pane maximize");
    }
  }

  const cycleRoomCategoryColor = useStableCallback((roomId: string, deltaY: number) => {
    const colors = roomCategoryColors(panes.filter((pane) => pane.roomId === roomId));
    const current = activeCategoryColorByRoom[roomId] ?? null;
    const next = nextCategoryColor(current, colors, deltaY);
    setActiveCategoryColorByRoom((currentMap) => {
      if ((currentMap[roomId] ?? null) === next) return currentMap;
      return { ...currentMap, [roomId]: next };
    });
    writeStoredCategoryFilter(roomId, next);
    if (selectedRoomIdRef.current === roomId && next !== null) {
      const filteredVisiblePanes = panes.filter(
        (pane) => pane.roomId === roomId && !pane.isMinimized && pane.categoryColor === next
      );
      const currentSelectedPaneId = selectedPaneIdRef.current;
      if (currentSelectedPaneId && !filteredVisiblePanes.some((pane) => pane.id === currentSelectedPaneId)) {
        setSelectedPaneId(filteredVisiblePanes[0]?.id ?? null);
      }
    }
  });

  // Window flags change on screen first (as toggleMaximize does); the server
  // result then reconciles them. Returns the previous flags for rollback.
  function applyOptimisticPaneFlags(
    roomId: string,
    flagsFor: (pane: Pane) => Partial<Pick<Pane, "isMinimized" | "isMaximized">> | null
  ) {
    const previousFlags = new Map<string, Pick<Pane, "isMinimized" | "isMaximized">>();
    for (const pane of panesRef.current) {
      if (pane.roomId !== roomId) continue;
      const flags = flagsFor(pane);
      if (!flags) continue;
      if ((flags.isMinimized ?? pane.isMinimized) === pane.isMinimized && (flags.isMaximized ?? pane.isMaximized) === pane.isMaximized) continue;
      previousFlags.set(pane.id, { isMinimized: pane.isMinimized, isMaximized: pane.isMaximized });
    }
    if (previousFlags.size > 0) {
      setPanes((current) => current.map((item) => {
        if (!previousFlags.has(item.id)) return item;
        const flags = flagsFor(item);
        return flags ? { ...item, ...flags } : item;
      }));
    }
    return previousFlags;
  }

  function rollbackOptimisticPaneFlags(previousFlags: Map<string, Pick<Pane, "isMinimized" | "isMaximized">>) {
    if (previousFlags.size === 0) return;
    setPanes((current) => current.map((item) => {
      const flags = previousFlags.get(item.id);
      return flags ? { ...item, ...flags } : item;
    }));
  }

  function reconcileRoomPanes(roomId: string, serverPanes: readonly Pane[]) {
    if (selectedRoomIdRef.current !== roomId) return;
    // A failed PATCH leaves updatedAt unchanged, so the window flags are part
    // of the version: an optimistic object never survives a server mismatch.
    setPanes((current) => reuseVersionedItems(
      current,
      serverPanes,
      (pane) => `${pane.updatedAt}|${pane.isMinimized}|${pane.isMaximized}`
    ));
  }

  async function minimizePane(pane: Pane) {
    setError(null);
    const remainingVisible = sortPanesForGrid(panesRef.current.filter((candidate) => candidate.roomId === pane.roomId && candidate.id !== pane.id && !candidate.isMinimized));
    const nextPane = remainingVisible.find((candidate) => candidate.order > pane.order) ?? remainingVisible[0] ?? null;
    const previousSelectedPaneId = selectedPaneIdRef.current;
    const previousFlags = applyOptimisticPaneFlags(pane.roomId, (candidate) =>
      candidate.id === pane.id ? { isMinimized: true, isMaximized: false } : null
    );
    setSelectedPaneId(nextPane?.id ?? null);
    setIsMobilePaneFocusMode(false);
    // With the bar parked behind the float toggle, focus goes to whichever affordance is visible.
    window.requestAnimationFrame(() => {
      const restoreChip = minimizedPaneRestoreRefs.current.get(pane.id);
      if (restoreChip) restoreChip.focus();
      else document.getElementById(MINIMIZED_PANE_BAR_TOGGLE_ID)?.focus();
    });
    try {
      const updated = await api.updatePane(pane.id, { isMinimized: true });
      setPanes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      void refreshRoomEvents(pane.roomId).catch(() => undefined);
    } catch (err) {
      rollbackOptimisticPaneFlags(previousFlags);
      setSelectedPaneId((current) => (current === (nextPane?.id ?? null) ? previousSelectedPaneId : current));
      setError(err instanceof Error ? err.message : "Pane minimize failed");
    }
  }

  async function restorePane(pane: Pane) {
    setError(null);
    const otherMaximized = panesRef.current.filter(
      (candidate) => candidate.roomId === pane.roomId && candidate.id !== pane.id && candidate.isMaximized
    );
    const previousSelectedPaneId = selectedPaneIdRef.current;
    const previousFlags = applyOptimisticPaneFlags(pane.roomId, (candidate) => {
      if (candidate.id === pane.id) return { isMinimized: false, isMaximized: false };
      return candidate.isMaximized ? { isMaximized: false } : null;
    });
    pendingPaneHeaderFocusIdRef.current = pane.id;
    setSelectedPaneId(pane.id);
    setIsMobilePaneFocusMode(false);
    const results = await Promise.allSettled([
      api.updatePane(pane.id, { isMinimized: false, isMaximized: false }),
      ...otherMaximized.map((candidate) => api.updatePane(candidate.id, { isMaximized: false }))
    ]);
    try {
      const reconciled = await api.panes(pane.roomId);
      reconcileRoomPanes(pane.roomId, reconciled.data);
      const restored = reconciled.data.find((candidate) => candidate.id === pane.id && !candidate.isMinimized);
      if (!restored) {
        if (pendingPaneHeaderFocusIdRef.current === pane.id) pendingPaneHeaderFocusIdRef.current = null;
        setSelectedPaneId((current) => (current === pane.id ? previousSelectedPaneId : current));
      }
      if (results.some((result) => result.status === "rejected")) {
        setError("Pane restore was only partially applied. Room state was refreshed.");
      }
      void refreshRoomEvents(pane.roomId).catch(() => undefined);
    } catch (err) {
      if (results.every((result) => result.status === "rejected")) {
        rollbackOptimisticPaneFlags(previousFlags);
        setSelectedPaneId((current) => (current === pane.id ? previousSelectedPaneId : current));
      }
      setError(err instanceof Error ? err.message : "Pane restore failed");
    }
  }

  async function restoreAllPanes() {
    if (!selectedRoomId || restoreAllPending) return;
    const roomId = selectedRoomId;
    const roomPanes = panesRef.current.filter((pane) => pane.roomId === roomId);
    const allWereMinimized = roomPanes.length > 0 && roomPanes.every((pane) => pane.isMinimized);
    const candidates = roomPanes.filter((pane) => pane.isMinimized || pane.isMaximized).slice(0, 16);
    const candidateIds = new Set(candidates.map((pane) => pane.id));
    setRestoreAllPending(true);
    setError(null);
    const previousFlags = applyOptimisticPaneFlags(roomId, (pane) =>
      candidateIds.has(pane.id) ? { isMinimized: false, isMaximized: false } : null
    );
    const optimisticVisible = sortPanesForGrid(
      roomPanes.filter((pane) => candidateIds.has(pane.id) || !pane.isMinimized)
    );
    setSelectedPaneId((current) => {
      if (allWereMinimized) return optimisticVisible[0]?.id ?? null;
      return optimisticVisible.some((pane) => pane.id === current) ? current : optimisticVisible[0]?.id ?? null;
    });
    setIsMobilePaneFocusMode(false);
    const results = await Promise.allSettled(
      candidates.map((pane) => api.updatePane(pane.id, { isMinimized: false, isMaximized: false }))
    );
    try {
      const reconciled = await api.panes(roomId);
      reconcileRoomPanes(roomId, reconciled.data);
      const visiblePanes = reconciled.data.filter((pane) => !pane.isMinimized);
      if (selectedRoomIdRef.current === roomId) {
        setSelectedPaneId((current) => (
          visiblePanes.some((pane) => pane.id === current) ? current : visiblePanes[0]?.id ?? null
        ));
      }
      if (results.some((result) => result.status === "rejected")) {
        const failedCount = results.filter((result) => result.status === "rejected").length;
        setError(`Restore all partially failed for ${failedCount} pane${failedCount === 1 ? "" : "s"}. Room state was refreshed.`);
      }
      void refreshRoomEvents(roomId).catch(() => undefined);
    } catch (err) {
      if (results.length > 0 && results.every((result) => result.status === "rejected")) rollbackOptimisticPaneFlags(previousFlags);
      setError(err instanceof Error ? err.message : "Restore all failed");
    } finally {
      setRestoreAllPending(false);
    }
  }

  async function minimizeAllPanes() {
    if (!selectedRoomId || minimizeAllPending) return;
    const roomId = selectedRoomId;
    const candidates = panesRef.current.filter((pane) => pane.roomId === roomId && !pane.isMinimized).slice(0, 16);
    if (candidates.length === 0) return;
    const candidateIds = new Set(candidates.map((pane) => pane.id));
    const previousSelectedPaneId = selectedPaneIdRef.current;
    setMinimizeAllPending(true);
    setError(null);
    const previousFlags = applyOptimisticPaneFlags(roomId, (pane) =>
      candidateIds.has(pane.id) ? { isMinimized: true, isMaximized: false } : null
    );
    setSelectedPaneId(null);
    setIsMobilePaneFocusMode(false);
    const results = await Promise.allSettled(
      candidates.map((pane) => api.updatePane(pane.id, { isMinimized: true }))
    );
    try {
      const reconciled = await api.panes(roomId);
      reconcileRoomPanes(roomId, reconciled.data);
      if (results.some((result) => result.status === "rejected")) {
        const failedCount = results.filter((result) => result.status === "rejected").length;
        setError(`Minimize all partially failed for ${failedCount} pane${failedCount === 1 ? "" : "s"}. Room state was refreshed.`);
      }
      void refreshRoomEvents(roomId).catch(() => undefined);
    } catch (err) {
      if (results.every((result) => result.status === "rejected")) {
        rollbackOptimisticPaneFlags(previousFlags);
        setSelectedPaneId((current) => current ?? previousSelectedPaneId);
      }
      setError(err instanceof Error ? err.message : "Minimize all failed");
    } finally {
      setMinimizeAllPending(false);
    }
  }

  async function updatePaneColumnSpan(pane: Pane, columnSpan: number, anchorColumnStart?: number) {
    const nextColumnSpan = Math.max(1, Math.min(MAX_PANE_COLUMN_SPAN, columnSpan));
    if ((pane.columnSpan ?? 1) === nextColumnSpan) return;
    const previousColumnSpan = pane.columnSpan;
    const previousAnchorColumnStart = paneColumnAnchorStartsRef.current.get(pane.id);
    if (anchorColumnStart !== undefined) {
      paneColumnAnchorStartsRef.current.set(pane.id, anchorColumnStart);
    }
    setPanes((current) =>
      current.map((item) => (item.id === pane.id ? { ...item, columnSpan: nextColumnSpan } : item))
    );
    try {
      const updated = await api.updatePane(pane.id, { columnSpan: nextColumnSpan });
      setPanes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      void refreshRoomEvents(pane.roomId);
    } catch (error) {
      setPanes((current) =>
        current.map((item) => (item.id === pane.id ? { ...item, columnSpan: previousColumnSpan } : item))
      );
      if (anchorColumnStart !== undefined) {
        if (previousAnchorColumnStart === undefined) {
          paneColumnAnchorStartsRef.current.delete(pane.id);
        } else {
          paneColumnAnchorStartsRef.current.set(pane.id, previousAnchorColumnStart);
        }
      }
      // Every caller fires and forgets; report the rollback instead of leaving an unhandled rejection.
      setError(error instanceof Error ? error.message : "Pane width could not be changed.");
    }
  }

  function handlePaneUpdated(updatedPane: Pane) {
    setPanes((current) => current.map((pane) => (pane.id === updatedPane.id ? updatedPane : pane)));
    void refreshRoomEvents(updatedPane.roomId);
  }

  const activeRoom = useMemo(() => rooms.find((room) => room.id === selectedRoomId) ?? null, [rooms, selectedRoomId]);
  const controlLayouts = useSpaceControlClient(selectedRoomId, Boolean(auth?.isAuthenticated && auth.user?.role === "ADMIN" && !auth.user?.automationScope), selectRoom, setSelectedPaneId);
  const activeRoomCategoryFilter = useMemo(
    () => (selectedRoomId ? (activeCategoryColorByRoom[selectedRoomId] ?? null) : null),
    [selectedRoomId, activeCategoryColorByRoom]
  );
  const activeRoomCategoryColors = useMemo(
    () => (activeRoom ? roomCategoryColors(panes.filter((pane) => pane.roomId === activeRoom.id)) : []),
    [activeRoom, panes]
  );
  const [floatingYouTubePaneIds, setFloatingYouTubePaneIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("space.youtube.floating.panes.v1");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggleYouTubeFloating = useCallback((paneId: string) => {
    setFloatingYouTubePaneIds((prev) => {
      const next = new Set(prev);
      if (next.has(paneId)) {
        next.delete(paneId);
      } else {
        next.add(paneId);
      }
      try {
        localStorage.setItem("space.youtube.floating.panes.v1", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }, []);
  const visiblePanes = useMemo(() => {
    const unfiltered = panes.filter((pane) => (shellMode === "mobile" || !pane.isMinimized) && !floatingYouTubePaneIds.has(pane.id));
    return activeRoomCategoryFilter
      ? unfiltered.filter((pane) => pane.categoryColor === activeRoomCategoryFilter)
      : unfiltered;
  }, [panes, activeRoomCategoryFilter, floatingYouTubePaneIds, shellMode]);
  const minimizedPanes = useMemo(() => panes.filter((pane) => pane.isMinimized), [panes]);
  const minimizedPaneRunningCount = useMemo(
    () => minimizedPanes.filter((pane) => paneCompletionLifecycle.panes[pane.id]?.activeRunKey != null).length,
    [minimizedPanes, paneCompletionLifecycle]
  );
  const [minimizedBarExpanded, setMinimizedBarExpanded] = useState(false);
  const showMinimizedBar = shellMode !== "mobile" && minimizedPanes.length > 0 && minimizedBarExpanded;
  /** The bar hides behind one room toolbar button, so only render it where that button can live. */
  const showMinimizedBarToggle = minimizedPanes.length > 0 && shellMode !== "mobile";
  const [minimizedBarPreviewMode, setMinimizedBarPreviewMode] = useState(() => {
    try {
      return getSpaceRuntime().platform.localStorage.getItem("space.minimized.bar.preview.v1") === "true";
    } catch {
      return false;
    }
  });

  const toggleMinimizedBarPreviewMode = useCallback(() => {
    setMinimizedBarPreviewMode((prev) => {
      const next = !prev;
      try {
        getSpaceRuntime().platform.localStorage.setItem("space.minimized.bar.preview.v1", String(next));
      } catch {}
      return next;
    });
  }, []);

  const activePane = useMemo(
    () => {
      if (selectedPaneId) {
        const match = visiblePanes.find((pane) => pane.id === selectedPaneId && (shellMode === "mobile" || !pane.isMinimized));
        if (match) return match;
      }
      return (shellMode === "mobile" ? null : visiblePanes.find((pane) => !pane.isMinimized))
        ?? visiblePanes.find((pane) => pane.id === selectedPaneId)
        ?? visiblePanes[0]
        ?? null;
    },
    [selectedPaneId, visiblePanes, shellMode]
  );
  const presentationRoom = useMemo(
    () => rooms.find((room) => room.id === displayedRoomId) ?? activeRoom,
    [activeRoom, displayedRoomId, rooms]
  );
  const presentationRuntime =
    displayedRoomId && displayedRoomId !== selectedRoomId
      ? roomRuntimes[displayedRoomId] ?? null
      : null;
  const presentationPanes = presentationRuntime?.panes ?? panes;
  const presentationSelectedPaneId = presentationRuntime?.selectedPaneId ?? selectedPaneId;
  const presentationActivePane = useMemo(() => {
    const presentationVisiblePanes = presentationPanes.filter((pane) => shellMode === "mobile" || !pane.isMinimized);
    return presentationVisiblePanes.find((pane) => pane.id === presentationSelectedPaneId)
      ?? presentationVisiblePanes[0]
      ?? null;
  }, [presentationPanes, presentationSelectedPaneId, shellMode]);
  const activeTerminalPanesBootstrapped = useMemo(() => {
    if (!activeRoom) return true;
    const bootstrappedPaneIds = new Set(roomRuntimes[activeRoom.id]?.bootstrappedPaneIds ?? []);
    return panes.every(
      (pane) => pane.isMinimized || pane.mode !== "TERMINAL" || bootstrappedPaneIds.has(pane.id)
    );
  }, [activeRoom, panes, roomRuntimes]);

  function insertClipboardItem(item: ClipboardItem) {
    if (!activePane) return;
    if (activePane.mode === "CHAT") {
      dispatchAgentPaneAction(activePane.id, { action: "insert_text", text: item.text });
      return;
    }
    if (activePane.mode === "TERMINAL") {
      dispatchTerminalPaneAction(activePane.id, { action: "insert_clipboard_text", text: item.text });
    }
  }

  function insertTaskItem(item: TaskItem) {
    if (!activePane) return;
    if (activePane.mode === "CHAT") {
      dispatchAgentPaneAction(activePane.id, { action: "insert_text", text: item.objective });
      return;
    }
    if (activePane.mode === "TERMINAL") {
      dispatchTerminalPaneAction(activePane.id, { action: "start_task_item", objective: item.objective });
    }
  }

  function routeCliShortcut(command: OskCliCommand): boolean {
    if (activePane?.mode === "CHAT" && (command.id === "plan_progress" || command.id === "deploy" || command.id === "clean_worktree" || command.id === "scroll_top" || command.id === "scroll_bottom")) {
      setIsOskKeyboardOpen(false);
      dispatchAgentPaneActionEvent({ paneId: activePane.id, action: command.id });
      return true;
    }
    if (command.action) {
      if (activePane?.mode === "CHAT") {
        if (command.action === "permissions" || command.action === "scroll_top" || command.action === "scroll_bottom") setIsOskKeyboardOpen(false);
        dispatchAgentPaneActionEvent({ paneId: activePane.id, action: command.action === "plan" ? "toggle_plan" : command.action });
        return true;
      }
      if (activePane?.mode !== "TERMINAL") return true;
    }
    if (activePane?.mode !== "TERMINAL") return false;
    dispatchTerminalPaneAction(activePane.id, { action: "cli_shortcut", commandId: command.id });
    return true;
  }

  function routeOnScreenKeyboardInput(input: OnScreenKeyboardInput): boolean {
    if (!activePane) return false;
    if (activePane.mode === "TERMINAL") {
      dispatchTerminalPaneAction(activePane.id, { action: "keyboard_input", text: input.terminalData });
      return true;
    }
    if (activePane.mode === "CHAT" && input.text !== null) {
      dispatchAgentPaneAction(activePane.id, { action: "insert_text", text: input.text });
      return true;
    }
    return false;
  }

  useEffect(() => {
    if (
      !auth?.isAuthenticated ||
      auth?.user?.automationScope === "APP_DIAGNOSTICS"
    ) return;
    api.warmCliRuntimes();
  }, [auth?.isAuthenticated, auth?.user?.automationScope]);

  useEffect(() => {
    if (!activeRoom || !auth?.isAuthenticated || !activeTerminalPanesBootstrapped || isCliLauncherOpen) {
      setActiveRoomEventStreamStatus("idle");
      return;
    }
    if (!eventGateway.supported) {
      setActiveRoomEventStreamStatus("unavailable");
      recordLifecycleDebugEvent({
        type: "sse_state_changed",
        scope: "App",
        detail: `room=${activeRoom.id} state=unavailable`,
        notify: false
      });
      return;
    }
    if (!shouldOpenAppEventStreams({
      authenticated: auth.isAuthenticated,
      terminalsConnected: activeTerminalPanesBootstrapped,
      eventSourceSupported: eventGateway.supported,
      cliLauncherOpen: isCliLauncherOpen
    })) return;

    setActiveRoomEventStreamStatus("connecting");
    recordLifecycleDebugEvent({
      type: "sse_state_changed",
      scope: "App",
      detail: `room=${activeRoom.id} state=connecting`,
      notify: false
    });
    const source = eventGateway.open(api.eventStreamUrl({ roomId: activeRoom.id, replayLimit: 50 }), { withCredentials: true });
    let replaying = true;
    let baselineReplay = !paneCompletionInitialReplayRoomIdsRef.current.has(activeRoom.id);
    let replayCompletionEvents: SpaceEvent[] = [];
    const replayRefreshCategories = new Set<RoomRefreshCategory>();
    const markConnected = () => {
      setActiveRoomEventStreamStatus("connected");
      if (runtimeKind === "live") reportCoreApiSuccess();
      recordLifecycleDebugEvent({
        type: "sse_state_changed",
        scope: "App",
        detail: `room=${activeRoom.id} state=connected`,
        notify: false
      });
    };
    const markDisconnected = () => {
      setActiveRoomEventStreamStatus("disconnected");
      if (runtimeKind === "live") reportCoreApiFailure();
      recordLifecycleDebugEvent({
        type: "sse_state_changed",
        scope: "App",
        detail: `room=${activeRoom.id} state=disconnected`,
        notify: false
      });
    };
    const requestRefresh = (category: RoomRefreshCategory, reason: string) => {
      void requestRoomRefreshRef.current(activeRoom.id, category, reason).catch((refreshError: unknown) => {
        if (!appMountedRef.current || selectedRoomIdRef.current !== activeRoom.id) return;
        if (isRoomNotFoundError(refreshError, activeRoom.id)) {
          void recoverMissingRoom(activeRoom.id);
          return;
        }
        if (!isTransientUpstreamRuntimeError(refreshError)) {
          setError(refreshError instanceof Error ? refreshError.message : "Room refresh failed");
        }
      });
    };
    const handleSpaceEvent = (message: MessageEvent<string>) => {
      const event = parseStreamEvent(message.data, activeRoom.id);
      if (!event || selectedRoomIdRef.current !== activeRoom.id) return;
      if (replaying && baselineReplay) replayCompletionEvents.push(event);
      appendRoomEvent(event, !replaying || !baselineReplay);
      if (/^(PANE_|TASK_|ROOM_AGENT_|MISSION_|MODEL_)/.test(event.type)) window.dispatchEvent(new CustomEvent("space-live-context-invalidated", { detail: { roomId: activeRoom.id } }));
      if (event.type === "PANE_UPDATED" && event.payload.roomPaneLayoutChanged === true) {
        void requestRoomCatalogRefreshRef.current();
      }
      if (event.type === "ROOM_WATCHDOG_ALERT") {
        setWatchdogAlerts((current) => {
          if (current.some((item) => item.id === event.id)) return current;
          return [...current, { id: event.id, message: event.message, timestamp: event.createdAt }];
        });
      }
      for (const category of roomRefreshCategoriesForEvent(event.type)) {
        if (replaying) replayRefreshCategories.add(category);
        else requestRefresh(category, `sse:${event.type}`);
      }
    };
    const handleReplayStart = () => {
      replaying = true;
      baselineReplay = !paneCompletionInitialReplayRoomIdsRef.current.has(activeRoom.id);
      replayCompletionEvents = [];
      replayRefreshCategories.clear();
    };
    const handleReplayComplete = () => {
      if (baselineReplay) {
        commitPaneCompletionLifecycle(
          hydratePaneCompletionReplay(
            paneCompletionLifecycleRef.current,
            activeRoom.id,
            replayCompletionEvents
          )
        );
        paneCompletionInitialReplayRoomIdsRef.current.add(activeRoom.id);
      }
      replayCompletionEvents = [];
      replaying = false;
      for (const category of replayRefreshCategories) requestRefresh(category, "sse:replay-complete");
      replayRefreshCategories.clear();
    };

    source.onopen = markConnected;
    source.onerror = markDisconnected;
    source.onmessage = handleSpaceEvent;
    source.addEventListener("ready", markConnected);
    source.addEventListener("replay-start", handleReplayStart);
    source.addEventListener("replay-complete", handleReplayComplete);
    for (const eventType of streamEventTypes) {
      source.addEventListener(eventType, handleSpaceEvent as EventListener);
    }

    return () => {
      source.onopen = null;
      source.onerror = null;
      source.onmessage = null;
      source.removeEventListener("ready", markConnected);
      source.removeEventListener("replay-start", handleReplayStart);
      source.removeEventListener("replay-complete", handleReplayComplete);
      for (const eventType of streamEventTypes) {
        source.removeEventListener(eventType, handleSpaceEvent as EventListener);
      }
      source.close();
    };
  }, [activeRoom, activeTerminalPanesBootstrapped, appendRoomEvent, auth?.isAuthenticated, isCliLauncherOpen]);

  useEffect(() => {
    if (!activeRoom || !auth?.isAuthenticated || !shouldUseEventStreamFallback(activeRoomEventStreamStatus)) return;
    let disposed = false;
    const refreshFromFallback = async () => {
      try {
        await requestRoomRefreshRef.current(activeRoom.id, "panes", "sse:fallback");
        await requestRoomRefreshRef.current(activeRoom.id, "turns", "sse:fallback");
        await requestRoomRefreshRef.current(activeRoom.id, "swarm", "sse:fallback");
        await requestRoomRefreshRef.current(activeRoom.id, "events", "sse:fallback");
      } catch (refreshError) {
        if (disposed || !appMountedRef.current || selectedRoomIdRef.current !== activeRoom.id) return;
        if (isRoomNotFoundError(refreshError, activeRoom.id)) {
          void recoverMissingRoom(activeRoom.id);
          return;
        }
        if (!isTransientUpstreamRuntimeError(refreshError)) {
          setError(refreshError instanceof Error ? refreshError.message : "Room fallback refresh failed");
        }
      }
    };
    void refreshFromFallback();
    const interval = window.setInterval(() => void refreshFromFallback(), 30_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [activeRoom, activeRoomEventStreamStatus, auth?.isAuthenticated]);

  useEffect(() => {
    if (!auth?.isAuthenticated || !activeTerminalPanesBootstrapped || !eventGateway.supported) return;
    const source = eventGateway.open(api.eventStreamUrl({ replayLimit: 200 }), { withCredentials: true });
    let replaying = true;
    let replayCreatedRoom = false;
    let replayCapabilityStatusChanged = false;
    const refreshRoomCatalog = () => {
      void requestRoomCatalogRefreshRef.current().catch(() => {
        // The catalog remains usable from its last successful snapshot during temporary failures.
      });
    };
    const handleRoomCreated = (message: MessageEvent<string>) => {
      const event = parseStreamEvent(message.data);
      if (!event || event.type !== "ROOM_CREATED") return;
      if (replaying) {
        replayCreatedRoom = true;
        return;
      }
      refreshRoomCatalog();
    };
    const handleReplayStart = () => {
      replaying = true;
      replayCreatedRoom = false;
      replayCapabilityStatusChanged = false;
    };
    const handleReplayComplete = () => {
      replaying = false;
      if (replayCreatedRoom) refreshRoomCatalog();
      if (replayCapabilityStatusChanged) dispatchCliRuntimeVisibilityChange({ source: "server" });
      replayCreatedRoom = false;
      replayCapabilityStatusChanged = false;
    };
    const handleBrowserHandoff = (message: MessageEvent<string>) => {
      const event = parseStreamEvent(message.data);
      if (
        !event ||
        event.type !== "BROWSER_HANDOFF_REQUESTED" ||
        !event.paneId ||
        handledBrowserHandoffEventIdsRef.current.has(event.id)
      ) {
        return;
      }
      handledBrowserHandoffEventIdsRef.current.add(event.id);
      if (handledBrowserHandoffEventIdsRef.current.size > 500) handledBrowserHandoffEventIdsRef.current.clear();
      void api.browserHandoff(event.paneId)
        .then(async ({ handoff }) => {
          if (handoff.status !== "REQUESTED") return;
          activateRoom(handoff.roomId);
          await loadRoomRuntimeRef.current(handoff.roomId);
          setSelectedPaneId(handoff.paneId);
          setPendingBrowserHandoffPaneId(handoff.paneId);
        })
        .catch(() => {
          handledBrowserHandoffEventIdsRef.current.delete(event.id);
        });
    };
    const handleCapabilityStatusChanged = (message: MessageEvent<string>) => {
      const event = parseStreamEvent(message.data);
      if (!event || event.type !== "CAPABILITY_STATUS_CHANGED") return;
      if (replaying) {
        replayCapabilityStatusChanged = true;
        return;
      }
      dispatchCliRuntimeVisibilityChange({ source: "server" });
    };
    source.addEventListener("replay-start", handleReplayStart);
    source.addEventListener("replay-complete", handleReplayComplete);
    source.addEventListener("ROOM_CREATED", handleRoomCreated as EventListener);
    source.addEventListener("BROWSER_HANDOFF_REQUESTED", handleBrowserHandoff as EventListener);
    source.addEventListener("CAPABILITY_STATUS_CHANGED", handleCapabilityStatusChanged as EventListener);
    return () => {
      source.removeEventListener("replay-start", handleReplayStart);
      source.removeEventListener("replay-complete", handleReplayComplete);
      source.removeEventListener("ROOM_CREATED", handleRoomCreated as EventListener);
      source.removeEventListener("BROWSER_HANDOFF_REQUESTED", handleBrowserHandoff as EventListener);
      source.removeEventListener("CAPABILITY_STATUS_CHANGED", handleCapabilityStatusChanged as EventListener);
      source.close();
    };
  }, [activeTerminalPanesBootstrapped, auth?.isAuthenticated]);

  useEffect(() => {
    if (!auth?.isAuthenticated) return;
    const handleCliRuntimeVisibility = (event: Event) => {
      const change = readCliRuntimeVisibilityChange(event);
      api.invalidateCliRuntimes(change ?? undefined);
      api.invalidateCliRuntimeSettings();
      void api.cliRuntimes().catch(() => undefined);
      // Bypass the 15s environment cache: availability just changed.
      void api.codexEnvironment(true)
        .then((environment) => {
          if (appMountedRef.current) setCodexEnvironmentSummary(environment);
        })
        .catch(() => undefined);
      void api.cliRuntimeSettings()
        .then((settings) => {
          if (appMountedRef.current) setCliRuntimeSettings(settings);
        })
        .catch(() => undefined);
      const roomIds = new Set<string>([
        ...(selectedRoomIdRef.current ? [selectedRoomIdRef.current] : []),
        ...warmRoomIdsRef.current
      ]);
      for (const roomId of roomIds) {
        void requestRoomRefreshRef.current(roomId, "panes", "cli-runtime-visibility").catch(() => undefined);
      }
      void api.roomCliActivity()
        .then((payload) => {
          if (!appMountedRef.current) return;
          setRoomPaneCounts(Object.fromEntries(
            payload.data.flatMap((activity) => activity.paneCount === undefined ? [] : [[activity.roomId, activity.paneCount]])
          ));
          setRoomCliActivityCounts(Object.fromEntries(
            payload.data.map((activity) => [activity.roomId, activity.runningCliCount])
          ));
          setRoomCliRuntimeIds(Object.fromEntries(
            payload.data.map((activity) => [
              activity.roomId,
              (activity as typeof activity & { runtimeIds?: string[] }).runtimeIds ?? []
            ])
          ));
        })
        .catch(() => undefined);
    };
    window.addEventListener(CLI_RUNTIME_VISIBILITY_EVENT, handleCliRuntimeVisibility);
    return () => window.removeEventListener(CLI_RUNTIME_VISIBILITY_EVENT, handleCliRuntimeVisibility);
  }, [auth?.isAuthenticated]);

  useEffect(() => {
    if (!pendingBrowserHandoffPaneId) return;
    const pendingPane = panes.find((pane) => pane.id === pendingBrowserHandoffPaneId && (pane.mode === "BROWSER" || pane.mode === "YOUTUBE"));
    if (!pendingPane || pendingPane.isMinimized) {
      setPendingBrowserHandoffPaneId(null);
      return;
    }
    dispatchBrowserPaneAction(pendingBrowserHandoffPaneId, "handoff");
    setPendingBrowserHandoffPaneId(null);
  }, [panes, pendingBrowserHandoffPaneId]);
  const userNavigableRooms = useMemo(() => {
    if (!isAdminMode || adminRoomFilterMode === "mine") {
      return rooms.filter((r) => !r.ownerUserId || r.ownerUserId === auth?.user?.id);
    }
    if (adminRoomFilterMode === "user" && adminSelectedUserId) {
      return rooms.filter((r) => r.ownerUserId === adminSelectedUserId);
    }
    return rooms;
  }, [rooms, isAdminMode, adminRoomFilterMode, adminSelectedUserId, auth?.user?.id]);
  const activeRoomIndex = useMemo(
    () => (activeRoom ? userNavigableRooms.findIndex((room) => room.id === activeRoom.id) : -1),
    [activeRoom, userNavigableRooms]
  );
  const previousRoom = activeRoomIndex > 0 ? userNavigableRooms[activeRoomIndex - 1] ?? null : null;
  const nextRoom = activeRoomIndex >= 0 && activeRoomIndex < userNavigableRooms.length - 1 ? userNavigableRooms[activeRoomIndex + 1] ?? null : null;
  useEffect(() => {
    setIsRoomRenameOpen(false);
    setRoomRenamePending(false);
    setRoomRenameError(null);
    setRoomNameDraft(activeRoom?.name ?? "");
    setIsPaneLayoutMenuOpen(false);
    setPaneLayoutError(null);
    setIsPaneSpanAllMenuOpen(false);
    setPaneSpanAllError(null);
  }, [activeRoom?.id, activeRoom?.name]);
  useEffect(() => {
    if (workspaceNavigationDetail !== "rename-room") return;
    setRoomNameDraft(activeRoom?.name ?? "");
    setRoomRenameError(null);
  }, [workspaceNavigationDetail, activeRoom?.id, activeRoom?.name]);
  const activeRoomExtraSlots = activeRoom ? (roomExtraEmptySlots[activeRoom.id] ?? 0) : 0;
  const effectiveVisiblePaneCountForAuto = useMemo(() => {
    if (visiblePanes.length < 1) return 0;
    if (activeRoomExtraSlots <= 0) return visiblePanes.length;
    return Math.min(16, visiblePanes.length + activeRoomExtraSlots);
  }, [visiblePanes.length, activeRoomExtraSlots]);

  const paneDensity = useMemo(
    () => paneDensityFor(shellMode, effectiveVisiblePaneCountForAuto),
    [shellMode, effectiveVisiblePaneCountForAuto]
  );
  const automaticPaneGridColumnCount = useMemo(
    () =>
      resolvePaneGridColumnCount({
        shellMode,
        paneDensity,
        containerWidth: paneGridWidth,
        rootRemSize,
        paneLayoutColumns: null,
        visiblePaneCount: effectiveVisiblePaneCountForAuto,
        forceTabletTwoColumns: uiTheme !== "classic"
      }),
    [paneDensity, paneGridWidth, rootRemSize, shellMode, uiTheme, effectiveVisiblePaneCountForAuto]
  );
  const paneGridColumnCount = useMemo(
    () =>
      resolvePaneGridColumnCount({
        shellMode,
        paneDensity,
        containerWidth: paneGridWidth,
        rootRemSize,
        paneLayoutColumns: activeRoom?.paneLayoutColumns ?? null,
        visiblePaneCount: effectiveVisiblePaneCountForAuto,
        forceTabletTwoColumns: uiTheme !== "classic"
      }),
    [activeRoom?.paneLayoutColumns, paneDensity, paneGridWidth, rootRemSize, shellMode, uiTheme, effectiveVisiblePaneCountForAuto]
  );
  if (previousPaneGridColumnCountRef.current !== paneGridColumnCount) {
    previousPaneGridColumnCountRef.current = paneGridColumnCount;
    paneColumnAnchorStartsRef.current = new Map();
  } else {
    const paneIds = new Set(visiblePanes.map((pane) => pane.id));
    for (const paneId of Array.from(paneColumnAnchorStartsRef.current.keys())) {
      if (!paneIds.has(paneId)) {
        paneColumnAnchorStartsRef.current.delete(paneId);
      }
    }
  }
  const paneGridPlacements = useMemo(
    () => resolvePaneGridPlacements(visiblePanes, paneGridColumnCount, paneColumnAnchorStartsRef.current),
    [paneGridColumnCount, visiblePanes]
  );
  const activeRoomEmptySlotsMetrics = useMemo(() => {
    if (!activeRoom) return null;
    const { minCount, maxCount, targetEmptySlots } = calculatePaneGridBaseRows({
      placements: paneGridPlacements,
      visiblePaneCount: visiblePanes.length,
      columnCount: paneGridColumnCount,
      targetEmptySlots: roomExtraEmptySlots[activeRoom.id]
    });
    return {
      count: targetEmptySlots,
      min: minCount,
      max: maxCount,
      disabledReason: targetEmptySlots >= maxCount
        ? (targetEmptySlots >= 6 ? "Maximum empty slots reached (6)" : "Room is at maximum capacity (16)")
        : undefined,
      onIncrement: () => {
        if (targetEmptySlots < maxCount) {
          updateRoomExtraEmptySlots(activeRoom.id, targetEmptySlots + 1, true);
        }
      },
      onDecrement: () => {
        if (targetEmptySlots > minCount) {
          const nextVal = targetEmptySlots - 1;
          updateRoomExtraEmptySlots(activeRoom.id, nextVal, true);
          if (nextVal === 0) {
            for (const [paneId, anchor] of Array.from(paneColumnAnchorStartsRef.current.entries())) {
              if (typeof anchor === "object" && anchor.rowIndex !== undefined) {
                paneColumnAnchorStartsRef.current.delete(paneId);
              }
            }
          }
        }
      }
    };
  }, [activeRoom, paneGridColumnCount, paneGridPlacements, roomExtraEmptySlots, updateRoomExtraEmptySlots, visiblePanes.length]);
  const effectiveLayoutPaneCount = useMemo(() => {
    if (visiblePanes.length < 1) return 0;
    const emptyCount = activeRoomEmptySlotsMetrics?.count ?? 0;
    return Math.min(16, visiblePanes.length + emptyCount);
  }, [visiblePanes.length, activeRoomEmptySlotsMetrics?.count]);
  const layoutAutomaticPaneGridColumnCount = useMemo(
    () =>
      resolvePaneGridColumnCount({
        shellMode,
        paneDensity: paneDensityFor(shellMode, effectiveLayoutPaneCount),
        containerWidth: paneGridWidth,
        rootRemSize,
        paneLayoutColumns: null,
        visiblePaneCount: effectiveLayoutPaneCount,
        forceTabletTwoColumns: uiTheme !== "classic"
      }),
    [effectiveLayoutPaneCount, paneGridWidth, rootRemSize, shellMode, uiTheme]
  );
  const agentNumberByPaneId = useMemo(() => new Map(panes.map((pane, index) => [pane.id, index + 1])), [panes]);
  const isCompactShell = shellMode !== "desktop";
  const isSideSurfaceOpen = isCompactShell ? isCompactSideSurfaceOpen : isDesktopSideSurfaceOpen;
  const activeSideSurfaceLabel = sideSurfaceMeta[activeSideSurface].surfaceLabel;
  // The visible title uses the same short name as the dock button and Docks settings.
  const activeSideSurfaceDockTitle = useMemo(() => {
    const definition = DOCK_DEFINITIONS.find((dock) => dock.id === activeSideSurface);
    return definition?.label ?? (sideSurfaceMeta[activeSideSurface]?.surfaceLabel || activeSideSurface).replace(/ dock$/i, "");
  }, [activeSideSurface]);
  const activeSideSurfaceCloseLabel = `Close ${sideSurfaceMeta[activeSideSurface].label}`;
  const showInlineSideSurface = !isCompactShell && isDesktopSideSurfaceOpen;
  const showOverlaySideSurface = isCompactShell && isCompactSideSurfaceOpen;
  // Once opened, the desktop dock stays mounted (hidden) after closing so a
  // reopen keeps its cached docks, data, filters and scroll position. Compact
  // shells use the drawer instead, so the inline host is dropped there.
  const [inlineSideSurfaceRetained, setInlineSideSurfaceRetained] = useState(false);
  if (showInlineSideSurface && !inlineSideSurfaceRetained) setInlineSideSurfaceRetained(true);
  const mountInlineSideSurface = !isCompactShell && (showInlineSideSurface || inlineSideSurfaceRetained);
  useEffect(() => {
    const handleLiveStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ paneId?: string; rail?: boolean; status?: typeof liveRailStatus }>).detail;
      if (detail.rail && detail.status) {
        setLiveRailStatus(detail.status);
        return;
      }
      const livePane = panes.find((pane) => pane.id === detail?.paneId && pane.mode === "LIVE");
      if (livePane && detail.status) setLiveRailStatus(detail.status);
    };
    window.addEventListener("space-live-pane-status", handleLiveStatus);
    return () => window.removeEventListener("space-live-pane-status", handleLiveStatus);
  }, [panes]);

  useEffect(() => {
    const handlePaneControlAction = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        action: "minimize" | "maximize" | "restore" | "close" | "refresh";
        paneId?: string;
        paneIds?: string[];
        mode?: string;
      }>;
      const detail = customEvent.detail;
      if (!detail?.action) return;

      const currentPanes = panesRef.current || panes;
      let targetPanes: Pane[] = [];

      if (detail.paneId) {
        const found = currentPanes.find((p) => p.id === detail.paneId);
        if (found) targetPanes = [found];
      } else if (detail.paneIds && detail.paneIds.length > 0) {
        targetPanes = currentPanes.filter((p) => detail.paneIds!.includes(p.id));
      } else if (detail.mode) {
        targetPanes = currentPanes.filter(
          (p) => p.mode !== "LIVE" && String(p.mode).toUpperCase() === detail.mode!.toUpperCase()
        );
      } else {
        const nonLive = currentPanes.filter((p) => p.mode !== "LIVE");
        const last = nonLive[nonLive.length - 1];
        if (last) targetPanes = [last];
      }

      if (detail.action === "minimize") {
        for (const p of targetPanes) {
          await minimizePane(p);
        }
      } else if (detail.action === "maximize") {
        for (const p of targetPanes) {
          if (!p.isMaximized) {
            await toggleMaximize(p);
          }
        }
      } else if (detail.action === "restore") {
        if (targetPanes.length > 0) {
          for (const p of targetPanes) {
            await restorePane(p);
          }
        } else {
          await restoreAllPanes();
        }
      } else if (detail.action === "close") {
        for (const p of targetPanes) {
          await closePane(p.id);
        }
      } else if (detail.action === "refresh") {
        if (selectedRoomId) {
          try {
            const reconciled = await api.panes(selectedRoomId);
            setPanes([...reconciled.data]);
          } catch {}
        }
      }
    };

    window.addEventListener("space-pane-control-action", handlePaneControlAction);
    return () => window.removeEventListener("space-pane-control-action", handlePaneControlAction);
  }, [panes, selectedRoomId]);
  useRailOrder(collapsedToolbarRef, Boolean(auth?.isAuthenticated && setupStatus) && appView === "workspace" && !(shellMode === "mobile" && isMobilePaneFocusMode && activePane) && isRoomToolbarHidden && !showOverlaySideSurface && !systemAnalyticsTab);
  useLayoutEffect(() => {
    const element = collapsedToolbarRef.current;
    if (!element) return;
    const shell = element.closest<HTMLElement>(".space-shell");
    if (!shell) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.height > 0) {
        shell.style.setProperty("--room-toolbar-collapsed-height", `${rect.height}px`);
        shell.style.setProperty("--room-toolbar-collapsed-top", `${Math.round(rect.top)}px`);
      }
      syncRailScale(shell);
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      shell.style.removeProperty("--room-toolbar-collapsed-height");
      shell.style.removeProperty("--room-toolbar-collapsed-top");
      syncRailScale(shell);
    };
  }, [isRoomToolbarHidden, showOverlaySideSurface, isMemoryWorkspaceOpen]);
  useEffect(() => {
    if (!isRoomToolbarHidden) setLowerRailVisibilityMenu(null);
  }, [isRoomToolbarHidden]);
  // Settings also open as a Workspace menu page, which needs the same provider catalog.
  const isSettingsSurfaceVisible = (isSideSurfaceOpen && activeSideSurface === "settings")
    || workspaceNavigationDetail === "surface-settings"
    || workspaceNavigationDetail === "advanced-settings";
  const isHealthSideSurfaceVisible = isSideSurfaceOpen && activeSideSurface === "health";
  useEffect(() => {
    if (!auth?.isAuthenticated) return;
    if (isSettingsSurfaceVisible) {
      void loadSettingsSurfaceData().catch(() => undefined);
    } else if (isHealthSideSurfaceVisible) {
      // Health is a live view: reload the snapshots every time the dock opens.
      void loadHealthSurfaceData(true).catch(() => undefined);
    }
  }, [auth?.isAuthenticated, isHealthSideSurfaceVisible, isSettingsSurfaceVisible]);
  const isRoomsSurfaceVisible = Boolean(auth?.isAuthenticated)
    && appView === "workspace"
    && !isMemoryWorkspaceOpen
    && systemAnalyticsTab === null
    && activeSideSurface === "rooms"
    && isSideSurfaceOpen;

  useEffect(() => {
    if (!isRoomsSurfaceVisible) return;
    let disposed = false;
    let requestPending = false;

    void requestRoomCatalogRefreshRef.current().catch(() => {
      // Keep the last successful room catalog visible through temporary API failures.
    });

    async function refreshRoomCliActivity() {
      if (requestPending) return;
      requestPending = true;
      try {
        const payload = await api.roomCliActivity();
        if (disposed) return;
        setRoomPaneCounts(Object.fromEntries(
          payload.data.flatMap((activity) => activity.paneCount === undefined ? [] : [[activity.roomId, activity.paneCount]])
        ));
        setRoomCliActivityCounts(Object.fromEntries(
          payload.data.map((activity) => [activity.roomId, activity.runningCliCount])
        ));
        setRoomCliRuntimeIds(Object.fromEntries(
          payload.data.map((activity) => [
            activity.roomId,
            (activity as typeof activity & { runtimeIds?: string[] }).runtimeIds ?? []
          ])
        ));
      } catch {
        // Keep the last successful sample through temporary API failures.
      } finally {
        requestPending = false;
      }
    }

    void refreshRoomCliActivity();
    const interval = window.setInterval(() => {
      void refreshRoomCliActivity();
    }, ROOM_CLI_ACTIVITY_POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [isRoomsSurfaceVisible]);

  useEffect(() => {
    if (!showOverlaySideSurface) return;
    const trigger = compactSideSurfaceTriggerRef.current;
    const drawer = compactSideSurfaceRef.current;
    const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
    const isJSDOM = /\bjsdom\b/i.test(navigator.userAgent);
    const focusableElements = () => Array.from(drawer?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
      .filter((element) => isJSDOM || element.getClientRects().length > 0);
    window.requestAnimationFrame(() => focusableElements()[0]?.focus());
    function handleKeyDown(event: KeyboardEvent) {
      // A modal opened from inside the drawer (project picker, diff dialog) owns its own Escape and focus.
      const nestedModal = event.target instanceof Element ? event.target.closest('dialog[open], [aria-modal="true"]') : null;
      if (nestedModal && nestedModal !== drawer && drawer?.contains(nestedModal)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeCompactSideSurface();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements();
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || !drawer?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !drawer?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (trigger?.isConnected) window.requestAnimationFrame(() => trigger.focus());
    };
  }, [showOverlaySideSurface]);

  async function growPaneColumnSpan(pane: Pane) {
    if (shellMode === "mobile") return;
    const placement = paneGridPlacements.get(pane.id);
    if (!placement?.canGrow) return;
    await updatePaneColumnSpan(pane, (pane.columnSpan ?? 1) + 1, placement.columnStart);
  }

  async function resetPaneColumnSpan(pane: Pane) {
    if (shellMode === "mobile" || (pane.columnSpan ?? 1) <= 1) return;
    const placement = paneGridPlacements.get(pane.id);
    await updatePaneColumnSpan(pane, 1, placement?.columnStart);
  }

  async function togglePaneColumnSpan(pane: Pane) {
    if (shellMode === "mobile" || pane.isMaximized) return;
    if ((pane.columnSpan ?? 1) > 1) {
      const placement = paneGridPlacements.get(pane.id);
      await updatePaneColumnSpan(pane, 1, placement?.columnStart);
      return;
    }
    const placement = paneGridPlacements.get(pane.id);
    if (!placement?.canGrow) return;
    await updatePaneColumnSpan(pane, 2, placement.columnStart);
  }

  function sideSurfaceToggleLabel(surface: SideSurface) {
    const verb = isSideSurfaceOpen && activeSideSurface === surface
      ? (isCompactShell ? "Close" : "Hide")
      : (isCompactShell || surface === "agent-files" ? "Open" : "Show");
    return `${verb} ${sideSurfaceMeta[surface].label}`;
  }

  function closeCompactSideSurface() {
    setIsCompactSideSurfaceOpen(false);
  }

  useEffect(() => {
    if (auth?.user?.role === "ADMIN" && activeSideSurface === "health" && isSideSurfaceOpen) {
      setIsDesktopSideSurfaceOpen(false);
      setIsCompactSideSurfaceOpen(false);
      openSystemHealth();
    }
  }, [auth?.user?.role, activeSideSurface, isSideSurfaceOpen]);

  function toggleSideSurface(surface: SideSurface) {
    if (surface === "health" && auth?.user?.role === "ADMIN") { openSystemHealth(); return; }
    if (isCompactShell) {
      if (activeSideSurface === surface && isCompactSideSurfaceOpen) {
        setIsCompactSideSurfaceOpen(false);
        return;
      }
      if (document.activeElement instanceof HTMLElement) compactSideSurfaceTriggerRef.current = document.activeElement;
      setActiveSideSurface(surface);
      setIsCompactSideSurfaceOpen(true);
      return;
    }
    if (activeSideSurface !== surface) {
      setActiveSideSurface(surface);
      setIsDesktopSideSurfaceOpen(true);
      return;
    }
    setIsDesktopSideSurfaceOpen((current) => !current);
  }

  const dockOrder: SideSurface[] = ["rooms", "room-agent", "shared-chat", "media", "streaming", "agent-files", "clipboard", "tasks", "links", "settings", "cli", "agent-sessions"];
  useEffect(() => {
    if (runtimeKind !== "live" || !auth?.isAuthenticated) { setSourceControlEnabled(false); return; }
    const controller = new AbortController();
    const refreshConnections = async (event?: Event) => {
      try {
        const connections = await sourceControlClient.connections(controller.signal);
        if (controller.signal.aborted) return;
        const enabled = connections.some(connection => connection.status === "CONNECTED");
        setSourceControlEnabled(enabled);
        if (enabled && (event as CustomEvent | undefined)?.detail?.openDock) {
          setActiveSideSurface("source-control");
          if (isCompactShell) setIsCompactSideSurfaceOpen(true); else setIsDesktopSideSurfaceOpen(true);
        }
      } catch { if (!controller.signal.aborted) setSourceControlEnabled(false); }
    };
    void refreshConnections(); window.addEventListener(SOURCE_CONTROL_CONNECTION_EVENT, refreshConnections);
    return () => { controller.abort(); window.removeEventListener(SOURCE_CONTROL_CONNECTION_EVENT, refreshConnections); };
  }, [runtimeKind, auth?.isAuthenticated, auth?.user?.id, isCompactShell]);
  // Source Control works locally without a provider account; personal dock hiding still applies.
  const sourceControlAvailable = runtimeKind === "live" && Boolean(auth?.isAuthenticated);
  if (sourceControlAvailable && !isDockHidden("source-control")) dockOrder.splice(dockOrder.indexOf("settings"), 0, "source-control");
  const availableDocks = dockOrder.filter((surface) =>
    (surface !== "streaming" || auth?.user?.role === "ADMIN") && !isDockHidden(surface)
  );

  function navigateDock(direction: "prev" | "next") {
    // Previous/Next follow the dock buttons as the user arranged them.
    const launcherOrder = roomToolbar.orderedActions
      .map((action) => action.id.startsWith("surface-") ? action.id.slice("surface-".length) as SideSurface : null)
      .filter((surface): surface is SideSurface => surface !== null && availableDocks.includes(surface));
    const order = [...launcherOrder, ...availableDocks.filter((surface) => !launcherOrder.includes(surface))];
    const currentIndex = order.indexOf(activeSideSurface);
    const offset = direction === "next" ? 1 : -1;
    const nextIndex = (currentIndex + offset + order.length) % order.length;
    const nextSurface = order[nextIndex];
    if (!nextSurface) return;
    setActiveSideSurface(nextSurface);
    if (isCompactShell) {
      setIsCompactSideSurfaceOpen(true);
    } else {
      setIsDesktopSideSurfaceOpen(true);
    }
  }

  function openSettingsSurface() {
    setIsCliLauncherOpen(false);
    setActiveSideSurface("settings");
    if (isCompactShell) {
      setIsCompactSideSurfaceOpen(true);
    } else {
      setIsDesktopSideSurfaceOpen(true);
    }
  }

  function manageLinks() {
    setIsQuickLinksOpen(false);
    setActiveSideSurface("links");
    if (isCompactShell) setIsCompactSideSurfaceOpen(true);
    else setIsDesktopSideSurfaceOpen(true);
  }

  function isYouTubeUrl(url: string): boolean {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
    } catch {
      return false;
    }
  }

  function openUserLink(link: UserLink) {
    setIsQuickLinksOpen(false);
    // YouTube links: route to the YouTube pane (existing or new)
    if (isYouTubeUrl(link.url)) {
      const existingYouTubePane = panesRef.current.find(
        (pane) => pane.mode === "YOUTUBE" && !pane.isMinimized && !pane.isClosed,
      );
      if (existingYouTubePane) {
        window.dispatchEvent(
          new CustomEvent("space-play-youtube-url", {
            detail: { paneId: existingYouTubePane.id, url: link.url, title: link.title },
          }),
        );
        setSelectedPaneId(existingYouTubePane.id);
      } else {
        void addPane("YOUTUBE", link.url);
      }
      return;
    }
    if (link.openMode === "NEW_TAB") {
      const opened = runtime.platform.openLink(link.url, "_blank", "noopener,noreferrer");
      if (opened) opened.opener = null;
      return;
    }
    setActiveUserLink(link);
  }

  function toggleCliFloats() {
    setCliFloatsHidden((current) => {
      const next = !current;
      try {
        runtime.platform.localStorage.setItem(CLI_FLOATS_HIDDEN_STORAGE_KEY, String(next));
      } catch {
        // Best effort only.
      }
      if (auth?.isAuthenticated) {
        saveUserSettingDebounced("cliFloatsHidden", next);
      }
      return next;
    });
  }

  function toggleMaskSensitiveData() {
    setMaskSensitiveData((current) => {
      const next = !current;
      try {
        runtime.platform.localStorage.setItem(SPACE_SENSITIVE_DATA_MASKED_STORAGE_KEY, String(next));
      } catch {
        // Best effort only.
      }
      if (auth?.isAuthenticated) {
        saveUserSettingDebounced("sensitiveDataMasked", next);
      }
      return next;
    });
  }

  function openServerRestartDialog() {
    setServerRestartError(null);
    setServerRestartMessage(null);
    setIsServerRestartDialogOpen(true);
  }

  function openCliRuntimeRestartAllDialog() {
    setCliRuntimeRestartAllError(null);
    setCliRuntimeRestartAllMessage(null);
    setIsCliRuntimeRestartAllDialogOpen(true);
  }

  function closeCliRuntimeRestartAllDialog() {
    if (cliRuntimeRestartAllPending) return;
    setIsCliRuntimeRestartAllDialogOpen(false);
    window.requestAnimationFrame(() => serverActionsButtonRef.current?.focus());
  }

  async function confirmCliRuntimeRestartAll() {
    if (cliRuntimeRestartAllPending) return;
    setCliRuntimeRestartAllPending(true);
    setCliRuntimeRestartAllError(null);
    setCliRuntimeRestartAllMessage("Restarting every CLI runtime session...");
    try {
      const result = await api.cliRuntimeRestartAll();
      const restarted = result.restartedSessionIds.length;
      const failed = result.failedSessionIds.length;
      setCliRuntimeRestartAllMessage(
        failed > 0
          ? `Restart requested: ${restarted} sessions restarted across ${result.requestedRuntimes.length} runtimes, ${failed} failed.`
          : `Restart requested: ${restarted} sessions restarted across ${result.requestedRuntimes.length} runtimes.`
      );
    } catch (err) {
      setCliRuntimeRestartAllMessage(null);
      setCliRuntimeRestartAllError(err instanceof Error ? err.message : "CLI restart-all failed.");
    } finally {
      setCliRuntimeRestartAllPending(false);
    }
  }

  function closeServerRestartDialog() {
    if (serverRestartPending) return;
    setIsServerRestartDialogOpen(false);
    window.requestAnimationFrame(() => serverActionsButtonRef.current?.focus());
  }

  async function waitForServerRestart(previousApiStartedAt: string) {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        const nextReady = await api.readyz();
        setReadiness(nextReady);
        if (nextReady.ok && nextReady.apiStartedAt && nextReady.apiStartedAt !== previousApiStartedAt) return;
      } catch {
        // The API is expected to be briefly unavailable while the core services restart.
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    throw new Error("Timed out waiting for Space to become ready after restart.");
  }

  async function confirmServerRestart() {
    if (serverRestartPending) return;
    setServerRestartPending(true);
    setServerRestartError(null);
    setServerRestartMessage("Requesting server restart...");
    try {
      const accepted = await api.restartCoreServices();
      if (getSpaceRuntimeKind() === "demo") {
        setServerRestartMessage(DEMO_LOCAL_REPLY);
        return;
      }
      setServerRestartMessage("Restart request accepted. Waiting for Space to return...");
      await waitForServerRestart(accepted.apiStartedAt);
      try {
        setCodexEnvironmentSummary(await api.codexEnvironment());
      } catch {
        // Host metrics are refreshed by the existing environment poll if this immediate read races the restart.
      }
      setServerRestartMessage("Server restarted and ready.");
    } catch (restartError) {
      const message = restartError instanceof Error ? restartError.message : "Server restart failed.";
      setServerRestartError(message);
      setServerRestartMessage(null);
    } finally {
      setServerRestartPending(false);
    }
  }

  async function refreshToolbarSystemState() {
    const [environmentResult, providerSettingsResult, runtimeSettingsResult] = await Promise.allSettled([
      api.codexEnvironment(),
      api.providerSettings(),
      api.cliRuntimeSettings()
    ]);
    if (environmentResult.status === "fulfilled") setCodexEnvironmentSummary(environmentResult.value);
    if (providerSettingsResult.status === "fulfilled") setProviderSettings(providerSettingsResult.value);
    if (runtimeSettingsResult.status === "fulfilled") setCliRuntimeSettings(runtimeSettingsResult.value);
  }

  function closePaneLayoutMenu(restoreFocus = true) {
    setIsPaneLayoutMenuOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => paneLayoutButtonRef.current?.focus());
    }
  }

  async function applyPaneLayoutPreset(
    paneLayoutColumns?: Room["paneLayoutColumns"],
    paneLayoutHeight?: Room["paneLayoutHeight"],
    keepMenuOpen = false
  ) {
    if (!activeRoom) return;
    const sequence = ++paneLayoutSequenceRef.current;
    const previousRoom = activeRoom;
    const isPresetSelection = paneLayoutColumns !== undefined;
    const nextColumns = isPresetSelection ? paneLayoutColumns : activeRoom.paneLayoutColumns;
    const nextHeight = isPresetSelection ? 1 : (paneLayoutHeight !== undefined ? paneLayoutHeight : (activeRoom.paneLayoutHeight ?? 1));
    emitAppDiagnosticsPerformance({
      category: "PERFORMANCE",
      metric: "PANE_LAYOUT",
      phase: "LAYOUT_PRESET",
      roomId: activeRoom.id,
      value: nextColumns ?? -1
    });
    // Optimistic: apply the layout locally in 0ms so panes resize instantly
    setRooms((current) =>
      sortRoomsByOrder(
        current.map((room) =>
          room.id === activeRoom.id
            ? { ...room, paneLayoutColumns: nextColumns, paneLayoutHeight: nextHeight }
            : room
        )
      )
    );
    if (isPresetSelection) {
      setPanes((current) =>
        current.map((pane) =>
          pane.roomId === activeRoom.id && (pane.columnSpan !== 1 || pane.isMaximized)
            ? { ...pane, columnSpan: 1, isMaximized: false }
            : pane
        )
      );
    }
    if (!keepMenuOpen) {
      closePaneLayoutMenu();
      setIsCollapsedPaneLayoutMenuOpen(false);
    }
    setPaneLayoutError(null);
    try {
      const payload: { paneLayoutColumns?: Room["paneLayoutColumns"]; paneLayoutHeight?: Room["paneLayoutHeight"] } = {};
      if (paneLayoutColumns !== undefined) {
        payload.paneLayoutColumns = paneLayoutColumns;
        payload.paneLayoutHeight = 1;
      } else if (paneLayoutHeight !== undefined) {
        payload.paneLayoutHeight = paneLayoutHeight;
      }
      const result = await api.updateRoomPaneLayout(activeRoom.id, payload);
      if (sequence !== paneLayoutSequenceRef.current) return;
      paneColumnAnchorStartsRef.current = new Map();
      setRooms((current) =>
        sortRoomsByOrder(current.map((room) => (room.id === result.room.id ? result.room : room)))
      );
      setPanes([...result.panes]);
      setSelectedPaneId((current) =>
        result.panes.some((pane) => pane.id === current)
          ? current
          : result.panes.find((pane) => !pane.isMinimized)?.id ?? null
      );
      setPaneLayoutPending(false);
      emitAppDiagnosticsPerformance({
        category: "PERFORMANCE",
        metric: "PANE_LAYOUT",
        phase: "LAYOUT_APPLIED",
        roomId: activeRoom.id,
        value: nextColumns ?? -1
      });
      void refreshRoomEvents(activeRoom.id).catch(() => {});
    } catch (layoutError) {
      if (sequence !== paneLayoutSequenceRef.current) return;
      setRooms((current) =>
        sortRoomsByOrder(current.map((room) => (room.id === previousRoom.id ? previousRoom : room)))
      );
      setPaneLayoutError(layoutError instanceof Error ? layoutError.message : "Pane layout update failed");
      setPaneLayoutPending(false);
    }
  }

  async function rotateVpnCityFromToolbar() {
    if (vpnCityPending || !toolbarVpnRoute) return;
    setVpnCityPending(true);
    setVpnCityNotice(null);
    const providerLabel = toolbarVpnRoute === "nord" ? "NordVPN" : "Mullvad";
    try {
      const connection = toolbarVpnRoute === "nord"
        ? await api.rotateCliNordCity()
        : await api.rotateCliMullvadCity();
      setVpnCityNotice(connection.relay
        ? `${providerLabel} changed to ${connection.relay.cityName}, ${connection.relay.countryName} (${connection.egressIpv4 ?? "public IP verifying"}).`
        : `${providerLabel} city changed and the new egress was verified.`);
    } catch {
      setVpnCityNotice(`${providerLabel} city could not be changed.`);
    } finally {
      setVpnCityPending(false);
    }
  }

  async function applyPaneSpanToAll(columnSpan: number) {
    if (!activeRoom) return;
    const sequence = ++paneSpanSequenceRef.current;
    const targets = visiblePanes.filter((pane) => !activeRoom || pane.roomId === activeRoom.id || !pane.roomId);
    const resolvedTargets = targets.length > 0 ? targets : visiblePanes;
    if (resolvedTargets.length === 0) return;
    const nextColumnSpan = Math.max(1, Math.min(MAX_PANE_COLUMN_SPAN, columnSpan));
    const previousPanes = panes;
    paneColumnAnchorStartsRef.current = new Map();
    // Optimistic: update all pane widths locally in 0ms
    setPanes((current) =>
      current.map((pane) =>
        resolvedTargets.some((target) => target.id === pane.id)
          ? { ...pane, columnSpan: nextColumnSpan }
          : pane
      )
    );
    setPaneSpanAllError(null);
    try {
      const results = await Promise.allSettled(
        resolvedTargets.map((pane) => {
          if ((pane.columnSpan ?? 1) === nextColumnSpan) return Promise.resolve(pane);
          return api.updatePane(pane.id, { columnSpan: nextColumnSpan });
        })
      );
      if (sequence !== paneSpanSequenceRef.current) return;
      const updatedPanes: Pane[] = [];
      let failed = 0;
      results.forEach((result, index) => {
        const pane = resolvedTargets[index]!;
        if (result.status === "fulfilled") {
          updatedPanes.push(result.value);
        } else {
          failed += 1;
          updatedPanes.push(pane);
        }
      });
      setPanes((current) => current.map((item) => updatedPanes.find((pane) => pane.id === item.id) ?? item));
      if (failed > 0) {
        setPaneSpanAllError(`${failed} pane${failed === 1 ? "" : "s"} could not be updated.`);
      } else {
        closePaneSpanAllMenu();
      }
      void refreshRoomEvents(activeRoom.id).catch(() => {});
    } catch (spanError) {
      if (sequence !== paneSpanSequenceRef.current) return;
      setPanes(previousPanes);
      setPaneSpanAllError(spanError instanceof Error ? spanError.message : "Pane width update failed");
    } finally {
      if (sequence === paneSpanSequenceRef.current) {
        setPaneSpanAllPending(false);
      }
    }
  }

  function commonPaneColumnSpan(panes: Pane[]): number | null {
    const first = panes[0]?.columnSpan ?? 1;
    return panes.every((pane) => (pane.columnSpan ?? 1) === first) ? first : null;
  }

  function closePaneSpanAllMenu(restoreFocus = true) {
    setIsPaneSpanAllMenuOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => paneSpanAllButtonRef.current?.focus());
    }
  }

  const roomToolbarActions = useMemo<IconToolbarAction[]>(
    () => {
      const actions: IconToolbarAction[] = [
      ...(Object.entries(sideSurfaceMeta) as Array<[SideSurface, (typeof sideSurfaceMeta)[SideSurface]]>)
        .filter(([surface]) => surface !== "health" && (surface !== "streaming" || auth?.user?.role === "ADMIN") && (surface !== "source-control" || sourceControlAvailable) && !hiddenDockIds.includes(surface))
        .map(([surface, meta]) => {
          const label = sideSurfaceToggleLabel(surface);
          return {
            id: `surface-${surface}`,
            label,
            title: label,
            ariaLabel: label,
            icon: meta.icon,
            onClick: () => toggleSideSurface(surface),
            ariaPressed: isSideSurfaceOpen && activeSideSurface === surface,
            className: "toolbar-surface-toggle"
          };
        }),
      {
        id: "memory-workspace",
        label: "Open memory workspace",
        title: "Open memory workspace",
        ariaLabel: "Open memory workspace",
        icon: Network,
        onClick: () => {
          setSystemAnalyticsTab(null);
          setIsMemoryWorkspaceOpen(true);
        },
        ariaExpanded: isMemoryWorkspaceOpen
      },
      {
        id: "quick-links",
        label: "Quick Links",
        title: "Quick Links",
        ariaLabel: "Quick Links",
        icon: Star,
        onClick: () => {
          setIsVibeMusicOpen(false);
          setIsQuickLinksOpen((current) => !current);
        },
        ariaExpanded: isQuickLinksOpen,
        ariaHasPopup: "dialog"
      },
      {
        id: "sticky-note",
        label: "Sticky note",
        title: "Sticky note",
        ariaLabel: "Sticky note",
        icon: StickyNote,
        onClick: () => {
          setIsThemeMenuOpen(false);
          setIsPaneLayoutMenuOpen(false);
          setIsCollapsedPaneLayoutMenuOpen(false);
          setIsPaneSpanAllMenuOpen(false);
          setIsWorkspaceTextSizePickerOpen(false);
          setIsVibeMusicOpen(false);
          setLowerRailVisibilityMenu(null);
          openStickyNote();
        }
      },
      ...(!isWidgetHidden("clock")
        ? [
            {
              id: "widget-clock",
              label: "Clock widget",
              title: "Float Clock widget",
              ariaLabel: "Clock widget",
              icon: Clock3,
              ariaPressed: desktopWidgets.isWidgetEnabled("clock"),
              onClick: () => {
                desktopWidgets.toggleWidget("clock");
              }
            }
          ]
        : []),
      ...(!isWidgetHidden("countdown-timer")
        ? [
            {
              id: "widget-countdown-timer",
              label: "Countdown timer",
              title: "Float Countdown Timer widget",
              ariaLabel: "Countdown timer",
              icon: Timer,
              ariaPressed: desktopWidgets.isWidgetEnabled("countdown-timer"),
              onClick: () => {
                desktopWidgets.toggleWidget("countdown-timer");
              }
            }
          ]
        : []),
      ...(!isWidgetHidden("pushup-reminder")
        ? [
            {
              id: "widget-pushup-reminder",
              label: "Push-up reminder",
              title: "Float Push-up Reminder widget",
              ariaLabel: "Push-up reminder",
              icon: Dumbbell,
              ariaPressed: desktopWidgets.isWidgetEnabled("pushup-reminder"),
              onClick: () => {
                desktopWidgets.toggleWidget("pushup-reminder");
              }
            }
          ]
        : []),
      ...(!isWidgetHidden("spaceapp-promo")
        ? [
            {
              id: "widget-spaceapp-promo",
              label: "SpaceApp.dev promo",
              title: "Float SpaceApp.dev promo widget",
              ariaLabel: "SpaceApp.dev promo",
              icon: Rocket,
              ariaPressed: desktopWidgets.isWidgetEnabled("spaceapp-promo"),
              onClick: () => {
                desktopWidgets.toggleWidget("spaceapp-promo");
              }
            }
          ]
        : []),
      ...(!isWidgetHidden("streaming-metrics")
        ? [
            {
              id: "widget-streaming-metrics",
              label: "Streaming metrics",
              title: "Float Streaming Metrics widget",
              ariaLabel: "Streaming metrics widget",
              icon: Radio,
              ariaPressed: desktopWidgets.isWidgetEnabled("streaming-metrics"),
              onClick: () => {
                desktopWidgets.toggleWidget("streaming-metrics");
              }
            }
          ]
        : []),
      ...(!isWidgetHidden("ai-quota")
        ? [
            {
              id: "widget-ai-quota",
              label: "AI Quota & Usage",
              title: "Float AI Quota & Usage: account availability and reset alerts for Codex, Antigravity and Claude",
              ariaLabel: "AI Quota & Usage",
              icon: Gauge,
              ariaPressed: desktopWidgets.isWidgetEnabled("ai-quota"),
              onClick: () => {
                desktopWidgets.toggleWidget("ai-quota");
              }
            }
          ]
        : []),
      {
        id: "pane-layout",
        label: "Pane layout",
        title: "Pane layout",
        ariaLabel: "Pane layout",
        icon: PanelsTopLeft,
        onClick: () => {
          setPaneLayoutError(null);
          if (isRoomToolbarHidden) {
            setIsCollapsedPaneLayoutMenuOpen((current) => !current);
          } else {
            setIsPaneLayoutMenuOpen((current) => !current);
          }
        },
        ariaControls: PANE_LAYOUT_MENU_ID,
        ariaExpanded: isPaneLayoutMenuOpen,
        ariaHasPopup: "menu",
        disabled: !activeRoom || paneLayoutPending
      },
      {
        id: "theme",
        label: "Room theme",
        title: "Room theme",
        ariaLabel: "Room theme",
        icon: Palette,
        onClick: () => setIsThemeMenuOpen((current) => !current),
        ariaControls: ROOM_THEME_MENU_ID,
        ariaExpanded: isThemeMenuOpen,
        ariaHasPopup: "menu",
        disabled: !activeRoom
      },
      {
        id: "category-color-filter",
        label: activeRoomCategoryFilter
          ? `Filter panes by color: ${activeRoomCategoryFilter}`
          : "Filter panes by color",
        title: activeRoomCategoryFilter
          ? `Filter panes by color: ${activeRoomCategoryFilter}. Scroll over the icon to cycle colors.`
          : "Filter panes by color. Scroll over the icon to cycle colors.",
        ariaLabel: activeRoomCategoryFilter
          ? `Color filter: ${activeRoomCategoryFilter}`
          : "Color filter: off",
        icon: ListFilter,
        onClick: () => {
          if (activeRoom) cycleRoomCategoryColor(activeRoom.id, 1);
        },
        onWheel: (event) => {
          event.preventDefault();
          if (activeRoom) cycleRoomCategoryColor(activeRoom.id, event.deltaY);
        },
        ariaPressed: activeRoomCategoryFilter !== null,
        hideable: true,
        disabled: !activeRoom || activeRoomCategoryColors.length === 0,
        disabledReason: !activeRoom ? "Choose a room first" : "No pane colors assigned"
      },
      ...(auth?.user?.role === "ADMIN" ? [{
        id: "agents-dashboard",
        label: "Agents Dashboard",
        title: agentsDashboardSummary?.loaded
          ? `Agents Dashboard · ${agentsDashboardSummary.total} agents (${agentsDashboardSummary.working} working, ${agentsDashboardSummary.waiting} waiting, ${agentsDashboardSummary.done} done)`
          : "Agents Dashboard",
        ariaLabel: "Open agents dashboard",
        icon: LayoutDashboard,
        onClick: () => setIsAgentsDashboardOpen(true),
        hideable: true
      }, {
        id: "system-resources",
        label: "System resources",
        title: "Live system resources, CLI sessions, memory & CPU analysis",
        ariaLabel: "System resources",
        icon: Activity,
        onClick: () => openSystemResources(),
        hideable: true
      }, {
        id: "resources",
        label: "Resources",
        title: "Resources & account quotas",
        ariaLabel: "Resources",
        icon: Activity,
        onClick: () => openSystemResources(),
        hideable: true
      }] : []),
      ...(auth?.user ? [{
        id: "resource-indicators",
        label: resourceIndicatorsVisible ? "Hide resource indicators" : "Show resource indicators",
        title: "Live resource values at the top right",
        ariaLabel: resourceIndicatorsVisible ? "Hide resource indicators" : "Show resource indicators",
        icon: Cpu,
        onClick: toggleResourceIndicators,
        ariaPressed: resourceIndicatorsVisible
      }] : []),
      {
        id: "cli-floats",
        label: cliFloatsHidden ? "Show CLI floats" : "Hide CLI floats",
        title: cliFloatsHidden ? "Show CLI floats" : "Hide CLI floats",
        ariaLabel: cliFloatsHidden ? "Show CLI floats" : "Hide CLI floats",
        icon: cliFloatsHidden ? Eye : EyeOff,
        onClick: toggleCliFloats,
        ariaPressed: cliFloatsHidden
      },
      {
        id: "sensitive-data",
        label: maskSensitiveData ? "Show sensitive data" : "Hide sensitive data",
        title: maskSensitiveData ? "Show sensitive data" : "Hide sensitive data",
        ariaLabel: maskSensitiveData ? "Show sensitive data" : "Hide sensitive data",
        icon: maskSensitiveData ? EyeOff : Eye,
        onClick: toggleMaskSensitiveData,
        ariaPressed: maskSensitiveData,
        hideable: false,
        dataSensitiveIgnore: true
      },
      {
        id: "debug-mode",
        label: isDebugModeActive ? "Turn off Debug (App diagnostics)" : "Turn on Debug (App diagnostics)",
        title: isDebugModeActive ? "Turn off Debug (App diagnostics)" : "Turn on Debug (App diagnostics)",
        ariaLabel: isDebugModeActive ? "Turn off Debug (App diagnostics)" : "Turn on Debug (App diagnostics)",
        icon: Activity,
        onClick: () => void toggleDebugMode(),
        ariaPressed: isDebugModeActive,
        disabled: debugModePending,
        hideable: true
      },
      {
        id: "font-down",
        label: "Workspace text size",
        title: `Workspace text size: ${terminalFontSize} px`,
        ariaLabel: "Workspace text size",
        icon: ALargeSmall,
        onClick: () => setIsWorkspaceTextSizePickerOpen((current) => !current),
        ariaControls: WORKSPACE_TEXT_SIZE_PICKER_ID,
        ariaExpanded: isWorkspaceTextSizePickerOpen,
        ariaHasPopup: "listbox",
        disabled: !activeRoom || !panes.some((pane) => pane.mode === "TERMINAL" || pane.mode === "CHAT"),
        disabledReason: !activeRoom ? "Choose a room first" : "Open a terminal or chat pane"
      },
      ...(!isPaneHidden("chat")
        ? [{
            id: "add-chat",
            label: "Add chat pane",
            title: isCodexEnabled ? "Add chat pane" : "Enable Codex in Settings",
            ariaLabel: "Add chat pane",
            icon: MessageSquare,
            onClick: toggleChatLauncher,
            ariaControls: CHAT_LAUNCHER_MENU_ID,
            ariaExpanded: isChatLauncherOpen,
            ariaHasPopup: shellMode === "mobile" ? "dialog" as const : "menu" as const,
            disabled: !isCodexEnabled || !selectedRoomId || panes.length >= 16
          }]
        : []),
      {
        id: "add-cli",
        label: "Add CLI pane",
        title: "Add CLI pane",
        ariaLabel: "Add CLI pane",
        icon: Terminal,
        onClick: toggleCliLauncher,
        ariaControls: CLI_LAUNCHER_MENU_ID,
        ariaExpanded: isCliLauncherOpen,
        ariaHasPopup: shellMode === "mobile" ? "dialog" as const : "menu" as const,
        disabled: !selectedRoomId || cliPaneCreationPending
      },
      ...(auth?.user?.role === "ADMIN"
        ? [{
            id: "add-root-admin-cli",
            label: "Add CLI ROOT",
            title: "Add CLI ROOT",
            ariaLabel: "Add CLI ROOT",
            icon: ShieldCheck,
            onClick: () => void addRootAdminPane(),
            disabled: !selectedRoomId || panes.length >= 16
          },
          {
            id: "server-restart",
            label: "Manage",
            title: "Manage",
            ariaLabel: "Manage",
            icon: ServerCog,
            onClick: () => openManage(),
            ariaControls: SERVER_ACTIONS_MENU_ID,
            ariaExpanded: isServerActionsMenuOpen,
            ariaHasPopup: shellMode === "mobile" ? "dialog" as const : "menu" as const,
            hideable: false
          }]
        : []),
      ...(!isPaneHidden("browser")
        ? [{
            id: "add-browser",
            label: "Add browser pane",
            title: "Add browser pane",
            ariaLabel: "Add browser pane",
            icon: Eye,
            onClick: () => addPane("BROWSER"),
            disabled: !selectedRoomId || panes.length >= 16
          }]
        : []),
      ...(!isPaneHidden("files")
        ? [{
            id: "add-files",
            label: "File Manager",
            title: "Add File Manager pane",
            ariaLabel: "Add File Manager pane",
            icon: FolderPlus,
            onClick: () => {
              if (!activeRoom) return;
              void addFilesPane();
            },
            disabled: !activeRoom || panes.length >= 16
          }]
        : []),
      ...(!isPaneHidden("databases")
        ? [{
            id: "add-databases",
            label: "Databases",
            title: "Add Databases pane",
            ariaLabel: "Add Databases pane",
            icon: Database,
            onClick: () => {
              if (!activeRoom) return;
              void addDatabasesPane();
            },
            disabled: !activeRoom || panes.length >= 16
          }]
        : []),
      ...(!isPaneHidden("demos")
        ? [{
            id: "add-demos",
            label: "Demo Projects",
            title: "Add Demo Projects pane",
            ariaLabel: "Add Demo Projects pane",
            icon: Boxes,
            onClick: () => {
              if (!activeRoom) return;
              void addDemosPane();
            },
            disabled: !activeRoom || panes.length >= 16
          }]
        : []),
      ...(!isPaneHidden("t3code")
        ? [{
            id: "add-t3code",
            label: "T3 Code",
            title: "Add T3 Code pane",
            ariaLabel: "Add T3 Code pane",
            icon: Cpu,
            onClick: () => {
              if (!activeRoom) return;
              void addT3CodePane();
            },
            disabled: !activeRoom || panes.length >= 16
          }]
        : []),
      ...(!isPaneHidden("youtube")
        ? [{
            id: "add-youtube",
            label: "Add YouTube pane",
            title: "Add YouTube pane",
            ariaLabel: "Add YouTube pane",
            icon: Youtube,
            onClick: () => addPane("YOUTUBE"),
            disabled: !selectedRoomId || panes.length >= 16
          }]
        : []),
      ...(!isPaneHidden("vnc")
        ? [{
            id: "add-vnc",
            label: "Add VNC pane",
            title: "Add VNC pane",
            ariaLabel: "Add VNC pane",
            icon: Monitor,
            onClick: () => addPane("VNC"),
            disabled: !selectedRoomId || panes.length >= 16
          }]
        : []),
      ...(!isPaneHidden("live")
        ? [{
            id: "add-live",
            label: "Add Live audio pane",
            title: "Add Live audio pane",
            ariaLabel: "Add Live audio pane",
            icon: Mic,
            onClick: () => void addLivePane(),
            disabled: !selectedRoomId || panes.length >= 16
          }]
        : []),
      {
        id: "vpn-city",
        label: `Change ${toolbarVpnRoute === "nord" ? "NordVPN" : toolbarVpnRoute === "mullvad" ? "Mullvad" : "VPN"} city`,
        title: `Change ${toolbarVpnRoute === "nord" ? "NordVPN" : toolbarVpnRoute === "mullvad" ? "Mullvad" : "VPN"} city`,
        ariaLabel: `Change ${toolbarVpnRoute === "nord" ? "NordVPN" : toolbarVpnRoute === "mullvad" ? "Mullvad" : "VPN"} city`,
        icon: Globe,
        onClick: () => void rotateVpnCityFromToolbar(),
        disabled: vpnCityPending || !toolbarVpnRoute
      },
      {
        id: "reload-room",
        label: "Reload window",
        title: "Reload window",
        ariaLabel: "Reload window",
        icon: RefreshCw,
        onClick: () => void reloadRoomWindow(),
        disabled: false
      },
      {
        id: "browser-fullscreen",
        label: isBrowserFullscreen ? "Exit full screen" : "Full screen browser",
        title: isBrowserFullscreen ? "Exit full screen (F11)" : "Full screen browser (F11)",
        ariaLabel: isBrowserFullscreen ? "Exit full screen" : "Full screen browser",
        icon: isBrowserFullscreen ? Minimize2 : Maximize2,
        onClick: () => void toggleBrowserFullscreen(),
        ariaPressed: isBrowserFullscreen,
        disabled: false
      },
      {
        id: "snip-tool",
        label: "Snip Tool",
        title: "Snip Tool (Capture, edit and share)",
        ariaLabel: "Snip Tool",
        icon: Crop,
        onClick: () => {
          setIsSnipToolOpen((current) => !current);
        },
        ariaPressed: isSnipToolOpen,
        disabled: !activeRoom
      },
      {
        id: "clip-tool",
        label: "Clip Tool",
        title: "Clip Tool",
        ariaLabel: "Clip Tool",
        icon: Camera,
        onClick: () => void captureRoomScreen(),
        disabled: !activeRoom
      },
      {
        id: "osk-keyboard",
        label: "On-screen keyboard",
        title: "On-screen keyboard",
        ariaLabel: "On-screen keyboard",
        icon: Keyboard,
        onClick: () => setIsOskKeyboardOpen((current) => !current),
        ariaPressed: isOskKeyboardOpen,
        ariaControls: OSK_PANEL_ID,
        ariaExpanded: isOskKeyboardOpen,
        ariaHasPopup: "dialog"
      },
      {
        id: "help",
        label: "Help",
        title: "Help",
        ariaLabel: "Help",
        icon: CircleHelp,
        onClick: openHelp
      },
      ...(auth?.user?.role === "ADMIN" ? [{
        id: "demo-mode",
        label: "Demo mode",
        title: "Explore all Space App features with an interactive guided tour",
        ariaLabel: "Demo mode",
        icon: Sparkles,
        onClick: () => setIsDemoModeActive(true),
        ariaPressed: isDemoModeActive,
        hideable: false
      }, {
        id: "token-usage",
        label: "Token usage",
        title: "Token usage history by provider and model",
        ariaLabel: "Token usage",
        icon: Database,
        onClick: () => openSystemHealth("usage")
      }, {
        id: "advanced-settings",
        label: "Advanced settings",
        title: "All advanced settings in one place",
        ariaLabel: "Advanced settings",
        icon: Settings2,
        onClick: () => {
          setAdminModeRequested(true);
          toggleSideSurface("settings");
        }
      }, {
        id: "setup-connections",
        label: "Setup wizard",
        title: "Set up tools and connections",
        ariaLabel: "Setup wizard",
        icon: SlidersHorizontal,
        onClick: () => openManage("setup-connections")
      }, {
        id: "system-analytics",
        label: "System analytics",
        title: "Live system telemetry, model performance, CPU & RAM, and CLI sessions",
        ariaLabel: "System analytics",
        icon: Monitor,
        onClick: () => {
          setIsMemoryWorkspaceOpen(false);
          setSystemAnalyticsTab("overview");
        }
      }, {
        id: "system-services",
        label: "System services",
        title: "Inspect and control systemd services, background workers, and timers",
        ariaLabel: "System services",
        icon: ServerCog,
        onClick: () => openManage("system-services")
      }] : []),
      {
        id: "benchmark",
        label: "Games Benchmark",
        title: "Open the AI Games Benchmark: Asteroids and Chess",
        ariaLabel: "Games Benchmark",
        icon: Crosshair,
        onClick: openBenchmark
      },
      {
        id: "vibe-music",
        label: "Vibe music",
        title: "Vibe music with freeCodeCamp Code Radio",
        ariaLabel: "Music",
        icon: Music2,
        onClick: () => {
          setIsQuickLinksOpen(false);
          setIsThemeMenuOpen(false);
          setIsPaneLayoutMenuOpen(false);
          setIsPaneSpanAllMenuOpen(false);
          setIsWorkspaceTextSizePickerOpen(false);
          setIsServerActionsMenuOpen(false);
          setIsCliLauncherOpen(false);
          setIsVibeMusicOpen((current) => !current);
        },
        ariaControls: VIBE_MUSIC_PANEL_ID,
        ariaExpanded: isVibeMusicOpen,
        ariaPressed: isVibeMusicOpen,
        ariaHasPopup: "dialog",
        hideable: false
      },
      {
        id: "sign-out",
        label: "Sign out",
        title: "Sign out",
        ariaLabel: "Sign out",
        icon: LogOut,
        onClick: () => void signOut(),
        hideable: false
      },
      {
        id: "room-focus",
        label: isRoomFocusMode ? "Restore room" : "Maximize room",
        title: isRoomFocusMode ? "Restore room" : "Maximize room",
        ariaLabel: isRoomFocusMode ? "Restore room" : "Maximize room",
        icon: isRoomFocusMode ? Minimize2 : Maximize2,
        onClick: () => {
          setIsPaneLayoutMenuOpen(false);
          setIsCliLauncherOpen(false);
          toggleRoomFocusMode();
        },
        ariaPressed: isRoomFocusMode,
        hideable: false,
        disabled: !activeRoom
      },
      {
        id: "more-actions",
        label: "More room actions",
        title: "More room actions",
        ariaLabel: "More room actions",
        icon: MoreHorizontal,
        onClick: () => {},
        ariaControls: "room-actions-popup",
        ariaHasPopup: shellMode === "mobile" ? "dialog" : "menu",
        hideable: false
      }
      ];
      return actions.filter(action => !consolidatedResourceActions.has(action.id) && !consolidatedManageActions.has(action.id));
    },
    [
      activeRoom,
      isQuickLinksOpen,
      activeRoomCategoryColors,
      activeRoomCategoryFilter,
      auth?.user?.role,
      sourceControlAvailable,
      captureRoomScreen,
      cliPaneCreationPending,
      cliFloatsHidden, resourceIndicatorsVisible, toggleResourceIndicators,
      cycleRoomCategoryColor,
      isCompactShell,
      isCodexEnabled,
      isMemoryWorkspaceOpen,
      isCliLauncherOpen,
      isOskKeyboardOpen,
      isPaneLayoutMenuOpen,
      isPaneSpanAllMenuOpen,
      isSideSurfaceOpen,
      isCompactSideSurfaceOpen,
      isServerActionsMenuOpen,
      isRoomFocusMode,
      isBrowserFullscreen,
      isThemeMenuOpen,
      isVibeMusicOpen,
      isSnipToolOpen,
      isWorkspaceTextSizePickerOpen,
      panes,
      paneLayoutPending,
      reloadRoomWindow,
      rotateVpnCityFromToolbar,
      runtime,
      selectedRoomId,
      shellMode,
      terminalFontSize,
      toolbarVpnRoute,
      vpnCityPending,
      desktopWidgets,
      isDebugModeActive,
      debugModePending,
      toggleDebugMode,
      hiddenDockIds,
      hiddenPaneIds,
      hiddenWidgetIds
    ]
  );
  const serverActionCommands: ServerActionCommand[] = auth?.user?.role === "ADMIN"
    ? [
        {
          id: "user-management",
          categoryHeader: "Users & Security",
          label: "Users & permissions",
          description: "Manage Space users, modify user/admin roles, and inspect rooms and Google account links.",
          icon: Users,
          onSelect: () => {
            userManagementTriggerRef.current = serverActionsButtonRef.current;
            openManage("user-management");
          }
        },
        {
          id: "setup-connections",
          categoryHeader: "Setup & Release",
          label: "Setup & connections",
          description: "Inspect and verify live provider connections, test API credentials, and complete setup.",
          icon: LinkIcon,
          onSelect: () => openManage("setup-connections")
        },
        {
          id: "publish-space-release",
          label: "Publish Space release",
          description: "Preview git state, tag a release version, and publish commits to Gitea and GitHub.",
          icon: Rocket,
          onSelect: () => {
            adminOperationToolTriggerRef.current = serverActionsButtonRef.current;
            openManage("publish-space-release");
          }
        },
        {
          id: "restart-server",
          categoryHeader: "Services & Runtimes",
          label: "Restart server",
          description: "Restart Space web, API, and worker services while keeping active CLI and browser panes alive.",
          icon: ServerCog,
          disabled: serverRestartPending,
          onSelect: openServerRestartDialog
        },
        {
          id: "restart-all-cli-runtimes",
          label: "Restart all CLI runtimes",
          description: "Sequentially restart sessions for all CLI types (codex, claude, gemini, opencode, kimi).",
          icon: Terminal,
          disabled: cliRuntimeRestartAllPending,
          onSelect: openCliRuntimeRestartAllDialog
        },
        {
          id: "space-cli-maintenance",
          categoryHeader: "Maintenance & Speed",
          label: "Space & CLI maintenance",
          description: "Run Space health checks, doctor diagnostics, package repairs, and guarded updates with rollback.",
          icon: Wrench,
          onSelect: () => {
            adminOperationToolTriggerRef.current = serverActionsButtonRef.current;
            openManage("space-cli-maintenance");
          }
        },
        {
          id: "space-gateway",
          label: "Space Gateway",
          description: "Pool provider accounts, issue gateway API keys, and control routing and context compression.",
          icon: Network,
          onSelect: () => openManage("space-gateway")
        },
        {
          id: "codex-lb-speed-control",
          label: "Codex-LB speed control",
          description: isCodexEnabled
            ? "Configure global default speed tiers (Standard or Fast) for active AI provider models."
            : "OFF · Enable Codex in Settings.",
          icon: Gauge,
          disabled: !isCodexEnabled,
          title: !isCodexEnabled ? "Enable Codex in Settings" : undefined,
          onSelect: () => {
            adminCodexToolTriggerRef.current = serverActionsButtonRef.current;
            openManage("codex-lb-speed-control");
          }
        },
        {
          id: "cli-session-cleanup",
          categoryHeader: "Cleanup & Storage",
          label: "Clean CLI sessions & storage",
          description: anyCliEnabled
            ? "Safely remove empty tasks (0 turns/messages), orphaned pane homes, and temporary store files."
            : "OFF · Enable a CLI in Settings.",
          icon: Trash2,
          disabled: !anyCliEnabled,
          title: !anyCliEnabled ? "Enable a CLI in Settings" : undefined,
          onSelect: () => {
            adminCodexToolTriggerRef.current = serverActionsButtonRef.current;
            openManage("cli-session-cleanup");
          }
        },
        {
          id: "codex-history-purge",
          label: "Purge inactive history",
          description: anyCliEnabled
            ? "Permanently remove inactive task history across CLIs not currently open in an active pane."
            : "OFF · Enable a CLI in Settings.",
          icon: Eraser,
          disabled: !anyCliEnabled,
          title: !anyCliEnabled ? "Enable a CLI in Settings" : undefined,
          onSelect: () => {
            adminCodexToolTriggerRef.current = serverActionsButtonRef.current;
            openManage("codex-history-purge");
          }
        },
        {
          id: "reclaim-safe-memory",
          label: "Reclaim safe memory",
          description: "Free page cache and stop leftover CLIs of closed panes; CLIs of open panes keep running.",
          icon: RefreshCw,
          onSelect: () => toolbarMetricsRef.current?.openMemoryReclaim(serverActionsButtonRef.current)
        },
        {
          id: "system-analytics",
          categoryHeader: "Monitoring",
          label: "System analytics",
          description: "Live system telemetry, model performance, CPU & RAM, and CLI sessions.",
          icon: Activity,
          onSelect: () => {
            setIsMemoryWorkspaceOpen(false);
            setSystemAnalyticsTab("overview");
          }
        },
        {
          id: "system-services",
          label: "System services",
          description: "Inspect and control systemd services, background workers, and timers.",
          icon: Boxes,
          onSelect: () => openManage("system-services")
        },
        {
          id: "cli-update-all",
          label: "Update all CLIs",
          description: "Detect and apply available updates across all CLI runtimes.",
          icon: RefreshCw,
          onSelect: () => {
            adminOperationToolTriggerRef.current = serverActionsButtonRef.current;
            openManage("cli-update-all");
          }
        }
      ]
    : [];
  const roomToolbar = usePersistentIconToolbar({
    actions: roomToolbarActions,
    hiddenStorageKey: roomToolbarStorageKeys.hidden,
    orderStorageKey: roomToolbarStorageKeys.order
  });
  const roomToolbarRenderedActions = shellMode === "mobile"
    ? roomToolbar.visibleActions.filter((action) => action.id !== "pane-layout" && action.id !== "pane-span-all")
    : roomToolbar.visibleActions;
  const availableRoomActions = shellMode === "mobile"
    ? roomToolbar.orderedActions.filter((action) => action.id !== "pane-layout" && action.id !== "pane-span-all" && action.id !== "sticky-note" && !action.id.startsWith("widget-"))
    : roomToolbar.orderedActions;
  const roomToolbarTouchContext = useTouchContextMenu(
    (source) => source instanceof Element && !source.closest(".desktop-menu-drag-handle, .cli-launcher-drag-handle")
      ? source.closest<HTMLElement>("button[data-action-id]")
      : null,
    ({ target, x, y }) => {
      const action = availableRoomActions.find((item) => item.id === target.dataset.actionId);
      if (!action || action.id === "more-actions") return;
      roomToolbar.closeMenus();
      roomToolbar.setActionMenu({ actionId: action.id, actionLabel: action.ariaLabel, x, y });
    }
  );
  const desktopToolbarActions: IconToolbarAction[] = availableRoomActions.map(action => action.id === "add-chat" ? {
    ...action,
    onClick: () => void addPane("CHAT"),
    ariaExpanded: undefined,
    ariaControls: undefined,
    ariaHasPopup: undefined
  } : action).concat(
    roomToolbar.orderedActions.some(a => a.id === "resources") ? [] : [{
      id: "resources", label: "Resources", title: "Resources", ariaLabel: "Resources", icon: Activity,
      onClick: () => openSystemResources()
    }], {
    id: "rename-room", label: "Rename room", title: "Rename room", ariaLabel: "Rename room", icon: Pencil,
    disabled: !activeRoom, disabledReason: "Choose a room first", onClick: beginRoomRename
  }, {
    id: "previous-room", label: "Previous room", title: previousRoom?.name ?? "Previous room", ariaLabel: "Previous room", icon: ChevronLeft,
    disabled: !previousRoom, disabledReason: "This is the first room", onClick: () => { if (previousRoom) void selectRoom(previousRoom.id); }
  }, {
    id: "next-room", label: "Next room", title: nextRoom?.name ?? "Next room", ariaLabel: "Next room", icon: ChevronRight,
    disabled: !nextRoom, disabledReason: "This is the last room", onClick: () => { if (nextRoom) void selectRoom(nextRoom.id); }
  }, ...(isHarnessEnabled && !isPaneHidden("harness") ? [{
    id: "add-harness", label: "DeepSeek Harness", title: "Open DeepSeek Harness",
    ariaLabel: "Open DeepSeek Harness", icon: Network,
    onClick: () => void addHarnessPane(), disabled: !selectedRoomId || panes.length >= 16
  }] as IconToolbarAction[] : []), {
    id: "live-model",
    label: "Live voice model",
    title:
      liveRailStatus === "listening"
        ? "User speaking..."
        : liveRailStatus === "speaking"
        ? "Agent speaking..."
        : liveRailStatus === "active"
        ? "Live voice active (Listening)"
        : liveRailStatus === "connecting"
        ? "Connecting Live voice model..."
        : "Start Live voice conversation",
    ariaLabel: "Live voice model",
    icon: Mic,
    onClick: activateLiveFromRail,
    ariaPressed: liveRailStatus !== "idle" && liveRailStatus !== "error",
    disabled: !selectedRoomId
  }, {
    id: "create",
    label: "Create",
    title: "Create pane",
    ariaLabel: "Create",
    icon: Plus,
    onClick: () => {
      setIsChatLauncherOpen(true);
    },
    disabled: !selectedRoomId || panes.length >= 16
  }, {
    id: "docks",
    label: "Docks",
    title: "Docks",
    ariaLabel: "Docks",
    icon: Grid2X2,
    onClick: () => {
      toggleSideSurface("tasks");
    }
  }, ...(showMinimizedBarToggle && auth?.user?.role !== "ADMIN" ? [{
    id: "minimized-bar",
    label: "Minimized panes",
    title: showMinimizedBar ? "Hide minimized pane bar" : "Show minimized pane bar",
    ariaLabel: "Minimized panes",
    icon: Minus,
    onClick: () => setMinimizedBarExpanded((value) => !value),
    ariaPressed: showMinimizedBar
  }] as IconToolbarAction[] : []), ...(auth?.user?.role === "ADMIN" ? [{
    id: "toggle-admin-mode",
    label: isAdminMode ? "Switch to User mode" : "Switch to Admin mode",
    title: isAdminMode ? "Switch to User mode" : "Switch to Admin mode",
    ariaLabel: isAdminMode ? "Switch to User mode" : "Switch to Admin mode",
    icon: isAdminMode ? ShieldCheck : UserCheck,
    onClick: () => {
      setAdminModeRequested(!isAdminMode);
      setIsServerActionsMenuOpen(false);
      if (isAdminMode && ["health", "streaming"].includes(activeSideSurface)) setIsDesktopSideSurfaceOpen(false);
    }
  }] as IconToolbarAction[] : []));
  const workspaceNavigationActions: IconToolbarAction[] = [...desktopToolbarActions, {
    id: "workspace-room", label: "Room", title: "Room settings", ariaLabel: "Room", icon: PanelTopOpen,
    onClick: () => undefined
  }, {
    id: "desktop-displays", label: "Displays", title: "Multi-Screen Displays", ariaLabel: "Displays", icon: Monitor,
    onClick: () => window.dispatchEvent(new Event("space:desktop:open-displays"))
  }];
  const workspaceDetailActionIds = [
    ...Object.keys(sideSurfaceMeta).map(surface => `surface-${surface}`),
    "pane-layout", "pane-span-all", "font-down", "theme", "resources", "system-resources", "system-analytics",
    "server-restart", "advanced-settings", "setup-connections", "system-services", "help",
    "benchmark", "token-usage", "add-chat", "add-cli", "create", "desktop-displays", "sticky-note", "quick-links",
    "vibe-music", "clip-tool", "snip-tool", "agents-dashboard", "demo-mode", "rename-room", "workspace-room"
  ];
  useEffect(() => {
    const dismiss = () => {
      roomToolbar.closeMenus();
      setIsThemeMenuOpen(false);
      setIsPaneLayoutMenuOpen(false);
      setIsCollapsedPaneLayoutMenuOpen(false);
      setIsPaneSpanAllMenuOpen(false);
      setIsWorkspaceTextSizePickerOpen(false);
      setIsServerActionsMenuOpen(false);
      setIsCliLauncherOpen(false);
      setIsQuickLinksOpen(false);
      setIsVibeMusicOpen(false);
    };
    window.addEventListener("space:navigation-open", dismiss);
    return () => window.removeEventListener("space:navigation-open", dismiss);
  }, [roomToolbar.closeMenus]);
  function runDesktopAction(action: IconToolbarAction, anchor: HTMLButtonElement, count = 1) {
    // Submenus stay anchored to the persistent navigation trigger after the menu closes.
    const refs = {
      "server-restart": serverActionsButtonRef, "add-cli": cliLauncherButtonRef,
      "add-chat": chatLauncherButtonRef, "font-down": workspaceTextSizeButtonRef,
      theme: roomThemeButtonRef, "pane-layout": paneLayoutButtonRef,
      "pane-span-all": paneSpanAllButtonRef, "vibe-music": vibeMusicButtonRef
    };
    const targetRef = refs[action.id as keyof typeof refs];
    if (targetRef) targetRef.current = anchor;
    if (action.id === "pane-layout" && isRoomToolbarHidden) paneLayoutCollapsedButtonRef.current = anchor;
    roomToolbar.closeMenus();
    if (action.id !== "theme") setIsThemeMenuOpen(false);
    if (action.id !== "pane-layout") setIsPaneLayoutMenuOpen(false);
    if (action.id !== "pane-span-all") setIsPaneSpanAllMenuOpen(false);
    if (action.id !== "font-down") setIsWorkspaceTextSizePickerOpen(false);
    if (action.id !== "server-restart") setIsServerActionsMenuOpen(false);
    if (action.id !== "add-cli") setIsCliLauncherOpen(false);
    if (action.id !== "add-chat") setIsChatLauncherOpen(false);
    if (action.id === "system-resources") openSystemResources();
    else if (action.id === "resources") openSystemResources();
    else if (action.id === "server-restart") {
      serverActionsButtonRef.current = anchor;
      openManage();
    } else if (count > 1) {
      if (action.id === "add-browser") void addPane("BROWSER", undefined, count);
      else if (action.id === "add-chat") void addPane("CHAT", undefined, count);
      else if (action.id === "add-youtube") void addPane("YOUTUBE", undefined, count);
      else if (action.id === "add-vnc") void addPane("VNC", undefined, count);
      else if (action.id === "add-live") void addLivePane(count);
      else if (action.id === "add-files") void addFilesPane(count);
      else if (action.id === "add-databases") void addDatabasesPane(count);
      else if (action.id === "add-demos") void addDemosPane(count);
      else if (action.id === "add-t3code") void addT3CodePane(count);
      else if (action.id === "add-harness") void addHarnessPane(count);
      else action.onClick();
    }
    else action.onClick();
  }
  function renderDesktopCreateTools({
    query,
    onClose,
    triggerRef,
    paneCount,
    onPaneCountChange,
    onNavigate,
    availablePanes: passedAvailablePanes
  }: {
    query: string;
    onClose: () => void;
    triggerRef: RefObject<HTMLButtonElement | null>;
    paneCount?: number;
    onPaneCountChange?: (count: number | ((prev: number) => number)) => void;
    onNavigate?: (id: string) => void;
    availablePanes?: number;
  }) {
    const availablePanes = passedAvailablePanes ?? Math.max(0, 16 - panes.length);
    return (
      <RecoverableSurface fallback={toolbarMenuLoadingFallback}>
        <LazyCliLauncherMenu
          embedded
          query={query}
          mobile={false}
          refreshOnOpen={true}
          atPaneCap={panes.length >= 16 || availablePanes <= 0}
          availablePanes={availablePanes}
          isCodexEnabled={isCodexEnabled}
          onClose={onClose}
          onCreate={addCliRuntimePane}
          onLogin={openCliRuntimeLogin}
          onOpenSettings={() => { if (onNavigate) onNavigate("surface-settings"); else { onClose(); openSettingsSurface(); } }}
          triggerRef={triggerRef}
          paneCount={paneCount}
          onPaneCountChange={onPaneCountChange}
        />
      </RecoverableSurface>
    );
  }
  const renderRoomToolbarAction = (action: IconToolbarAction) => {
    const Icon = action.icon;
    return (
      <button
        key={action.id}
        ref={
          action.id === "server-restart"
            ? serverActionsButtonRef
            : action.id === "add-cli"
              ? cliLauncherButtonRef
              : action.id === "add-chat"
                ? chatLauncherButtonRef
                : action.id === "font-down"
                  ? workspaceTextSizeButtonRef
                : action.id === "theme"
                  ? roomThemeButtonRef
                : action.id === "pane-layout"
                  ? paneLayoutButtonRef
                : action.id === "pane-span-all"
                  ? paneSpanAllButtonRef
                : action.id === "vibe-music"
                  ? vibeMusicButtonRef
                  : action.id === "more-actions"
                    ? roomOverflowTriggerRef
                    : undefined
        }
        type="button"
        className={action.id === "category-color-filter"
          ? `category-color-filter${activeRoomCategoryFilter ? " is-active" : ""}`
          : action.className}
        onClick={() => {
          roomToolbar.closeMenus();
          if (action.id !== "theme") setIsThemeMenuOpen(false);
          if (action.id !== "pane-layout") setIsPaneLayoutMenuOpen(false);
          if (action.id !== "pane-span-all") setIsPaneSpanAllMenuOpen(false);
          if (action.id !== "font-down") setIsWorkspaceTextSizePickerOpen(false);
          if (action.id !== "server-restart") setIsServerActionsMenuOpen(false);
          if (action.id !== "add-cli") setIsCliLauncherOpen(false);
          if (action.id !== "add-chat") setIsChatLauncherOpen(false);
          if (action.id === "more-actions") {
            roomToolbar.setIsOverflowOpen((current) => !current);
            return;
          }
          action.onClick();
        }}
        disabled={action.disabled}
        title={action.title}
        aria-label={action.ariaLabel}
        aria-controls={action.ariaControls}
        aria-expanded={action.id === "more-actions" ? roomToolbar.isOverflowOpen : action.ariaExpanded}
        aria-haspopup={action.ariaHasPopup}
        aria-pressed={action.ariaPressed}
        onWheel={action.onWheel}
        data-action-id={action.id}
        data-category-color={action.id === "category-color-filter" ? (activeRoomCategoryFilter ?? undefined) : undefined}
        {...(action.dataSensitiveIgnore ? { "data-sensitive-ignore": "true" } : {})}
        onContextMenu={(event) => {
          event.preventDefault();
          roomToolbar.closeMenus();
          setIsThemeMenuOpen(false);
          setIsPaneLayoutMenuOpen(false);
          setIsPaneSpanAllMenuOpen(false);
          setIsWorkspaceTextSizePickerOpen(false);
          setIsServerActionsMenuOpen(false);
          setIsCliLauncherOpen(false);
          setIsChatLauncherOpen(false);
          roomToolbar.setActionMenu({
            actionId: action.id,
            actionLabel: action.ariaLabel,
            x: event.clientX,
            y: event.clientY
          });
        }}
        {...roomToolbar.getDragHandleProps(action)}
      >
        <Icon aria-hidden="true" />
        {action.id === "category-color-filter" ? (
          <span className="category-filter-dots" aria-hidden="true">
            {activeRoomCategoryColors.map((color) => (
              <i
                key={color}
                className={`category-swatch-dot ${color}${activeRoomCategoryFilter === color ? " active" : ""}`}
              />
            ))}
          </span>
        ) : null}
      </button>
    );
  };
  function updateRoomToolbarVisibility(hidden: boolean) {
    if (hidden) {
      roomToolbar.closeMenus();
      setIsQuickLinksOpen(false);
      setIsThemeMenuOpen(false);
      setIsPaneLayoutMenuOpen(false);
      setIsPaneSpanAllMenuOpen(false);
      setIsWorkspaceTextSizePickerOpen(false);
      setIsServerActionsMenuOpen(false);
      setIsCliLauncherOpen(false);
    }
    try {
      runtime.platform.localStorage.setItem(ROOM_TOOLBAR_HIDDEN_STORAGE_KEY, String(hidden));
    } catch {
      // Best effort only.
    }
    if (auth?.isAuthenticated) {
      saveUserSettingDebounced("roomToolbarHidden", hidden);
    }
    setIsRoomToolbarHidden(hidden);
  }
  useLayoutEffect(() => {
    const toolbar = boardToolbarRef.current;
    if (!toolbar || shellMode === "mobile" || !shouldMeasureToolbarLayout(uiTheme)) {
      setIsRoomToolbarStacked(false);
      return;
    }

    const measureChildrenWidth = (element: HTMLElement | null, fallbackWidthRem: number, fallbackGapRem: number) => {
      if (!element) return 0;
      const children = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      if (!children.length) return 0;
      const styles = window.getComputedStyle(element);
      const parsedGap = Number.parseFloat(styles.columnGap || styles.gap || "");
      const gap = Number.isFinite(parsedGap) ? parsedGap : remToPx(fallbackGapRem);
      const childrenWidth = children.reduce(
        (total, child) => total + (child.getBoundingClientRect().width || child.offsetWidth || remToPx(fallbackWidthRem)),
        0
      );
      return childrenWidth + Math.max(0, children.length - 1) * gap;
    };

    const measureToolbar = () => {
      const availableWidth = toolbar.clientWidth;
      if (availableWidth <= 0) return;
      const titleRow = toolbar.querySelector<HTMLElement>(".board-title-row");
      const titleElement = titleRow?.querySelector<HTMLElement>("h2") ?? null;
      const titleForm = titleRow?.querySelector<HTMLElement>(".room-title-form") ?? null;
      const titleControls = titleRow?.querySelector<HTMLElement>(".board-title-controls") ?? null;
      const titleStyles = titleRow ? window.getComputedStyle(titleRow) : null;
      const parsedTitleGap = Number.parseFloat(titleStyles?.columnGap || titleStyles?.gap || "");
      const titleGap = Number.isFinite(parsedTitleGap) ? parsedTitleGap : remToPx(0.5);
      const headingWidth = titleForm
        ? titleForm.scrollWidth || remToPx(16)
        : measureSingleLineTitleWidth(titleElement, 8);
      const titleControlsWidth = measureChildrenWidth(titleControls, 2.25, 0.25);
      const titleWidth = Math.max(remToPx(10), headingWidth + (titleControlsWidth ? titleGap + titleControlsWidth : 0));
      const lbWidth = measureChildrenWidth(toolbar.querySelector<HTMLElement>(".toolbar-lb-strip"), 2.25, 0.35);
      const actionsWidth = measureChildrenWidth(roomToolbarScrollRef.current, 2.25, 0.25);
      const toolbarStyles = window.getComputedStyle(toolbar);
      const parsedToolbarGap = Number.parseFloat(toolbarStyles.columnGap || toolbarStyles.gap || "");
      const columnGap = Number.isFinite(parsedToolbarGap) ? parsedToolbarGap : remToPx(0.75);
      setIsRoomToolbarStacked(
        roomToolbarNeedsSecondRow({ availableWidth, titleWidth, lbWidth, actionsWidth, columnGap })
      );
    };

    measureToolbar();
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureToolbar) : null;
    resizeObserver?.observe(toolbar);
    const titleRow = toolbar.querySelector<HTMLElement>(".board-title-row");
    const lbStrip = toolbar.querySelector<HTMLElement>(".toolbar-lb-strip");
    if (titleRow) resizeObserver?.observe(titleRow);
    if (lbStrip) resizeObserver?.observe(lbStrip);
    if (roomToolbarScrollRef.current) resizeObserver?.observe(roomToolbarScrollRef.current);
    window.addEventListener("resize", measureToolbar);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureToolbar);
    };
  }, [activeRoom?.name, isRoomRenameOpen, isRoomToolbarHidden, roomToolbarRenderedActions.length, shellMode, uiTheme]);
  function updateMobilePaneFocusMode(nextFocused: boolean) {
    if (shellMode !== "mobile") return;
    setIsCompactSideSurfaceOpen(false);
    setIsThemeMenuOpen(false);
    setIsPaneLayoutMenuOpen(false);
    setIsPaneSpanAllMenuOpen(false);
    setIsWorkspaceTextSizePickerOpen(false);
    roomToolbar.closeMenus();
    setIsMobilePaneFocusMode(nextFocused);
  }
  useDismissibleToolbarLayer({
    containerRef: boardToolbarRef,
    active: !isRoomToolbarHidden && (isThemeMenuOpen || isPaneLayoutMenuOpen || isPaneSpanAllMenuOpen || roomToolbar.isOverflowOpen || Boolean(roomToolbar.actionMenu)),
    onDismiss: () => {
      setIsThemeMenuOpen(false);
      closePaneLayoutMenu(isPaneLayoutMenuOpen);
      closePaneSpanAllMenu(isPaneSpanAllMenuOpen);
      setIsWorkspaceTextSizePickerOpen(false);
      roomToolbar.closeMenus();
    }
  });
  useDismissibleToolbarLayer({
    containerRef: collapsedToolbarRef,
    active: isRoomToolbarHidden && (isCollapsedPaneLayoutMenuOpen || isPaneSpanAllMenuOpen || Boolean(lowerRailVisibilityMenu)),
    onDismiss: () => {
      setIsCollapsedPaneLayoutMenuOpen(false);
      setIsPaneSpanAllMenuOpen(false);
      setLowerRailVisibilityMenu(null);
      window.requestAnimationFrame(() => (paneSpanAllButtonRef.current ?? paneLayoutCollapsedButtonRef.current)?.focus());
    }
  });
  useDismissibleToolbarLayer({
    containerRef: vpnCityNoticeRef,
    active: Boolean(vpnCityNotice),
    onDismiss: () => setVpnCityNotice(null)
  });
  const dockBrowserPane = useMemo(
    () => (activePane?.mode === "BROWSER" || activePane?.mode === "YOUTUBE" ? activePane : visiblePanes.find((pane) => pane.mode === "BROWSER" || pane.mode === "YOUTUBE") ?? null),
    [activePane, visiblePanes]
  );

  function runBrowserPaneAction(action: BrowserPaneAction) {
    if (!dockBrowserPane) return;
    setSelectedPaneId(dockBrowserPane.id);
    window.requestAnimationFrame(() => dispatchBrowserPaneAction(dockBrowserPane.id, action));
  }

  function beginRoomRename() {
    if (!activeRoom || roomRenamePending) return;
    setRoomNameDraft(activeRoom.name);
    setRoomProjectPathDraft(activeRoom.projectPath ?? "");
    setRoomRenameError(null);
    setIsThemeMenuOpen(false);
    setIsWorkspaceTextSizePickerOpen(false);
    roomToolbar.closeMenus();
    setIsRoomRenameOpen(true);
  }

  function cancelRoomRename() {
    setIsRoomRenameOpen(false);
    setRoomRenamePending(false);
    setRoomRenameError(null);
    setRoomNameDraft(activeRoom?.name ?? "");
    setRoomProjectPathDraft(activeRoom?.projectPath ?? "");
  }

  function toggleRoomFocusMode() {
    const nextValue = !isRoomFocusMode;
    try {
      runtime.platform.localStorage.setItem(ROOM_FOCUS_MODE_STORAGE_KEY, String(nextValue));
    } catch {
      // Best effort only.
    }
    if (auth?.isAuthenticated) {
      saveUserSettingDebounced("roomFocusMode", nextValue);
    }
    setIsRoomFocusMode(nextValue);
  }

  async function submitRoomRename(event: FormEvent<HTMLFormElement>, onComplete?: () => void) {
    event.preventDefault();
    if (!activeRoom || roomRenamePending) return;
    const nextName = roomNameDraft.trim();
    if (!nextName) {
      setRoomRenameError("Room name is required.");
      return;
    }
    if (nextName === activeRoom.name) {
      cancelRoomRename();
      onComplete?.();
      return;
    }
    setRoomRenamePending(true);
    setRoomRenameError(null);
    try {
      const updated = await api.updateRoom(activeRoom.id, {
        name: nextName
      });
      setRooms((current) => current.map((room) => (room.id === updated.id ? updated : room)));
      setRoomNameDraft(updated.name);
      setIsRoomRenameOpen(false);
      onComplete?.();
    } catch (err) {
      setRoomRenameError(err instanceof Error ? err.message : "Room rename failed");
    } finally {
      setRoomRenamePending(false);
    }
  }

  useEffect(() => {
    if (!selectedRoomId && isRoomFocusMode) setIsRoomFocusMode(false);
  }, [isRoomFocusMode, selectedRoomId]);
  useEffect(() => {
    const didRoomChange = mobilePaneFocusRoomIdRef.current !== selectedRoomId;
    mobilePaneFocusRoomIdRef.current = selectedRoomId;
    if ((didRoomChange || shellMode !== "mobile" || !activePane) && isMobilePaneFocusMode) {
      setIsMobilePaneFocusMode(false);
    }
  }, [activePane, isMobilePaneFocusMode, selectedRoomId, shellMode]);
  useEffect(() => {
    if (!auth?.isAuthenticated) {
      setCodexEnvironmentSummary(null);
      return;
    }
    let disposed = false;
    let requestPending = false;
    const loadCodexEnvironmentSummary = async () => {
      if (requestPending || document.visibilityState === "hidden") return;
      requestPending = true;
      try {
        const [environment, runtimeSettings] = await Promise.allSettled([
          api.codexEnvironment(),
          api.cliRuntimeSettings()
        ]);
        if (disposed) return;
        if (environment.status === "fulfilled") setCodexEnvironmentSummary(environment.value);
        if (runtimeSettings.status === "fulfilled") setCliRuntimeSettings(runtimeSettings.value);
      } catch {
        // Keep room-level stats best-effort so the main shell still renders if this endpoint is unavailable.
      } finally {
        requestPending = false;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadCodexEnvironmentSummary();
    };
    const handleAppResumed = () => {
      void loadCodexEnvironmentSummary();
    };
    void loadCodexEnvironmentSummary();
    const interval = window.setInterval(() => void loadCodexEnvironmentSummary(), 30000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("space:app-resumed", handleAppResumed);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("space:app-resumed", handleAppResumed);
    };
  }, [auth?.isAuthenticated]);
  useEffect(() => {
    if (previousShellModeRef.current === null) {
      previousShellModeRef.current = shellMode;
      return;
    }
    if (previousShellModeRef.current === shellMode) return;
    recordLifecycleDebugEvent({
      type: "shell_mode_changed",
      scope: "App",
      detail: `from=${previousShellModeRef.current} to=${shellMode} width=${readViewportWidth()}`,
      shellMode
    });
    previousShellModeRef.current = shellMode;
  }, [shellMode]);

  useEffect(() => {
    if (previousSelectedRoomIdRef.current === null) {
      previousSelectedRoomIdRef.current = selectedRoomId;
      return;
    }
    if (previousSelectedRoomIdRef.current === selectedRoomId) return;
    recordLifecycleDebugEvent({
      type: "room_selection_changed",
      scope: "App",
      detail: `from=${previousSelectedRoomIdRef.current ?? "none"} to=${selectedRoomId ?? "none"}`,
      shellMode,
      paneId: selectedPaneId
    });
    previousSelectedRoomIdRef.current = selectedRoomId;
  }, [selectedPaneId, selectedRoomId, shellMode]);

  useEffect(() => {
    if (previousSelectedPaneIdRef.current === null) {
      previousSelectedPaneIdRef.current = selectedPaneId;
      return;
    }
    if (previousSelectedPaneIdRef.current === selectedPaneId) return;
    recordLifecycleDebugEvent({
      type: "pane_selection_changed",
      scope: "App",
      detail: `from=${previousSelectedPaneIdRef.current ?? "none"} to=${selectedPaneId ?? "none"}`,
      shellMode,
      paneId: selectedPaneId
    });
    previousSelectedPaneIdRef.current = selectedPaneId;
  }, [selectedPaneId, shellMode]);
  const codexTurnsEnabled = readiness?.dependencies.codexTurns === "enabled";
  const latestArtifactEventId = useMemo(
    () => roomEvents.find((event) => event.type === "ARTIFACT_CREATED")?.id ?? null,
    [roomEvents]
  );
  const targetPaneFromUser = useCallback(
    (paneId: string) => {
      if (!panes.some((pane) => pane.id === paneId && !pane.isMinimized)) return;
      setSelectedPaneId(paneId);
      commitPaneCompletionLifecycle(
        acknowledgePaneCompletion(paneCompletionLifecycleRef.current, paneId)
      );
    },
    [panes]
  );
  const paneCardOnTarget = useStableCallback(targetPaneFromUser);
  const paneCardOnMove = useStableCallback(openMovePaneDialog);
  const paneCardOnPaneUpdated = useStableCallback(handlePaneUpdated);
  const paneCardOnOpenExisting = useStableCallback(async (pane: Pane) => {
    await selectRoom(pane.roomId);
    if (pane.isMinimized) {
      await restorePane(pane);
    } else {
      setSelectedPaneId(pane.id);
      setIsMobilePaneFocusMode(false);
      pendingPaneHeaderFocusIdRef.current = pane.id;
    }
  });
  const paneCardOnClose = useStableCallback(closePane);
  const paneCardOnMaximize = useStableCallback(toggleMaximize);
  const paneCardOnRestoreLayout = useStableCallback(() => {
    void applyPaneLayoutPreset(null);
  });
  const paneCardOnMinimize = useStableCallback(minimizePane);
  const paneCardOnMobilePaneFocusChange = useStableCallback(updateMobilePaneFocusMode);
  const paneCardOnGrowColumnSpan = useStableCallback(growPaneColumnSpan);
  const paneCardOnResetColumnSpan = useStableCallback(resetPaneColumnSpan);
  const paneCardOnToggleColumnSpan = useStableCallback(togglePaneColumnSpan);
  const paneCardOnSplit = useStableCallback(splitPane);
  const paneCardOnTerminalBootstrapped = useStableCallback(recordRoomPaneBootstrapped);
  const paneCardOnTerminalPrefillReadyChange = useStableCallback(recordRoomTerminalPrefillReady);
  const paneCardOnTerminalRevealReady = useStableCallback(recordTerminalRevealReady);
  const paneCardOnDragStart = useStableCallback(handlePaneDragStart);
  const paneCardOnDragEnd = useStableCallback(clearPaneReorderState);
  const paneCardOnDragOver = useStableCallback(handlePaneDragOver);
  const paneCardOnDragLeave = useStableCallback(handlePaneDragLeave);
  const paneCardOnDrop = useStableCallback(handlePaneDrop);

  const navigateFullscreenPane = useCallback(
    (direction: "previous" | "next", fromPaneId?: string) => {
      const visible = sortPanesForGrid(visiblePanes);
      if (visible.length < 2) return;
      const currentTargetId = fromPaneId ?? selectedPaneId;
      const currentIndex = Math.max(0, visible.findIndex((pane) => pane.id === currentTargetId));
      const step = direction === "next" ? 1 : -1;
      const nextPane = visible[(currentIndex + step + visible.length) % visible.length];
      if (nextPane) {
        setSelectedPaneId(nextPane.id);
        commitPaneCompletionLifecycle(
          acknowledgePaneCompletion(paneCompletionLifecycleRef.current, nextPane.id)
        );
      }
    },
    [visiblePanes, selectedPaneId]
  );
  const paneCardOnFullscreenNavigate = useStableCallback(navigateFullscreenPane);

  async function captureRoomScreen() {
    if (!activeRoom || isCapturingScreenRef.current) return;
    isCapturingScreenRef.current = true;
    try {
      const target: ClipImageTarget = {
        roomId: activeRoom.id,
        paneId: activePane?.id ?? null,
        paneMode: activePane?.mode ?? null
      };
      setError(null);
      setClipToolNotice(null);
      if (runtimeKind === "demo") {
        setClipToolNotice(DEMO_LOCAL_REPLY);
        return;
      }
      const desktopBridge = (window as any).spaceDesktop;
      if (typeof desktopBridge?.openSnippingTool === "function") {
        try {
          const opened = await desktopBridge.openSnippingTool();
          if (opened) return;
        } catch {}
      }
      if (shellMode !== "desktop") {
        openClipImagePicker(target);
        return;
      }
      if (!runtime.platform.displayMediaSupported) {
        openClipImagePicker(target);
        return;
      }
      try {
        let stream: MediaStream;
        try {
          stream = await runtime.platform.getDisplayMedia({
            video: { cursor: "always" } as MediaTrackConstraints,
            audio: false
          });
        } catch (err) {
          const name = err instanceof DOMException ? err.name : "";
          if (name === "AbortError" || name === "NotAllowedError") return;
          openClipImagePicker(target);
          return;
        }
        try {
          const video = document.createElement("video");
          video.srcObject = stream;
          video.muted = true;
          await video.play();
          await new Promise((resolve) => window.requestAnimationFrame(resolve));
          const track = stream.getVideoTracks()[0];
          const settings = track?.getSettings?.() ?? {};
          const width = settings.width ?? video.videoWidth ?? 1920;
          const height = settings.height ?? video.videoHeight ?? 1080;
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Screen capture canvas is unavailable.");
          context.drawImage(video, 0, 0, width, height);
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((nextBlob) => {
              if (nextBlob) resolve(nextBlob);
              else reject(new Error("Screen capture PNG export failed."));
            }, "image/png");
          });
          await routeClipImage(
            new File([blob], `space-screen-capture-${Date.now()}.png`, { type: "image/png" }),
            target
          );
        } finally {
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Screen capture failed");
      }
    } finally {
      setTimeout(() => {
        isCapturingScreenRef.current = false;
      }, 1200);
    }
  }

  const snipToolInitialModeRef = useRef<"float" | "capturing">("float");
  const lastPrintScreenRef = useRef({ keyDownAt: 0, triggeredAt: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    // A PrtScn open is one-shot: reopening from the rail shows the capsule again.
    if (!isSnipToolOpen) snipToolInitialModeRef.current = "float";

    const triggerSnipShortcut = () => {
      const now = Date.now();
      if (now - lastPrintScreenRef.current.triggeredAt < 350) return;
      lastPrintScreenRef.current.triggeredAt = now;

      console.log("[SpaceApp Web] Triggering Snip Tool shortcut (PrtScn)");
      if (isSnipToolOpen) {
        window.dispatchEvent(new CustomEvent("space:snip-tool:trigger"));
      } else {
        snipToolInitialModeRef.current = "capturing";
        setIsSnipToolOpen(true);
      }
    };

    const isPrintScreenEvent = (event: KeyboardEvent) => {
      return (
        event.key === "PrintScreen" ||
        event.code === "PrintScreen" ||
        (event as any).key === "Snapshot" ||
        (event as any).key === "Print" ||
        event.keyCode === 44 ||
        event.which === 44
      );
    };

    const handlePrintScreenKey = (event: KeyboardEvent) => {
      if (!isPrintScreenEvent(event)) return;

      console.log(`[SpaceApp] PrintScreen caught: type=${event.type}, key=${event.key}, code=${event.code}, keyCode=${event.keyCode}`);

      event.preventDefault();
      event.stopPropagation();

      // Most platforms send keydown + keyup; Windows sends only keyup. Act once per press,
      // otherwise a slower press opens the selection on keydown and cancels it on keyup.
      if (event.type === "keydown") {
        if (event.repeat) return;
        lastPrintScreenRef.current.keyDownAt = Date.now();
      } else if (Date.now() - lastPrintScreenRef.current.keyDownAt < 2000) {
        return;
      }

      // Clear any multi-monitor screenshot Windows may have placed on clipboard
      try {
        if (navigator?.clipboard?.writeText) {
          void navigator.clipboard.writeText("").catch(() => {});
        }
      } catch {}

      triggerSnipShortcut();
    };

    window.addEventListener("keydown", handlePrintScreenKey, true);
    window.addEventListener("keyup", handlePrintScreenKey, true);

    const desktopBridge = (window as any).spaceDesktop;
    let unsubscribePrintScreen: (() => void) | undefined;
    if (typeof desktopBridge?.onPrintScreen === "function") {
      const unsub = desktopBridge.onPrintScreen(() => {
        triggerSnipShortcut();
      });
      if (typeof unsub === "function") {
        unsubscribePrintScreen = unsub;
      }
    }

    return () => {
      window.removeEventListener("keydown", handlePrintScreenKey, true);
      window.removeEventListener("keyup", handlePrintScreenKey, true);
      unsubscribePrintScreen?.();
    };
  }, [isSnipToolOpen]);

  function openClipImagePicker(target: ClipImageTarget) {
    pendingClipImageTargetRef.current = target;
    const input = clipImageInputRef.current;
    if (!input) {
      setError("Image picker is unavailable.");
      return;
    }
    input.value = "";
    input.click();
  }

  async function routeClipImage(file: File, target: ClipImageTarget, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!SUPPORTED_CLIP_IMAGE_TYPES.has(file.type.toLowerCase())) {
      throw new Error("Choose a PNG, JPEG, or WebP image.");
    }
    if (target.paneMode === "TERMINAL" && target.paneId) {
      dispatchTerminalPaneAction(target.paneId, { action: "attach_clip_image", file });
      return;
    }
    const uploaded = await api.uploadPaneFiles({
      roomId: target.roomId,
      paneId: target.paneId,
      source: "SCREEN_CAPTURE",
      files: [file],
      signal
    });
    signal?.throwIfAborted();
    dispatchArtifactsUpdated(target.roomId, uploaded.artifacts);
    if (target.paneMode === "CHAT" && target.paneId) {
      dispatchAgentPaneAttachments(target.paneId, uploaded.artifacts);
    }
    if (target.roomId === selectedRoomId) await refreshRoomEvents(target.roomId);
  }

  function handleClipImageSelection(file: File | null) {
    const target = pendingClipImageTargetRef.current;
    pendingClipImageTargetRef.current = null;
    if (!file || !target) return;
    setError(null);
    void routeClipImage(file, target).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Clip image upload failed");
    });
  }

  async function reloadRoomWindow() {
    setError(null);
    recordLifecycleDebugEvent({
      type: "manual_room_refresh",
      scope: "App",
      detail: `room=${activeRoom?.id ?? "none"}`,
      shellMode,
      paneId: activePane?.id ?? null
    });
    runtime.platform.reloadPage();
  }

  function clearRoomReorderState() {
    roomPointerDragCleanupRef.current?.();
    roomPointerDragCleanupRef.current = null;
    dragOverRoomIdRef.current = null;
    setDraggedRoomId(null);
    setDragOverRoomId(null);
  }

  function handleRoomRightPointerDown(event: ReactPointerEvent<HTMLElement>, roomId: string) {
    if (event.button !== 2 || roomReorderPending) return;
    event.preventDefault();
    roomPointerDragCleanupRef.current?.();
    setDraggedRoomId(roomId);
    dragOverRoomIdRef.current = roomId;
    setDragOverRoomId(roomId);
    const pointerId = event.pointerId;
    const roomAtPoint = (clientX: number, clientY: number) =>
      document.elementFromPoint?.(clientX, clientY)?.closest<HTMLElement>(".room-item[data-room-id]")?.dataset.roomId ?? null;
    const roomFromEvent = (pointerEvent: PointerEvent) =>
      pointerEvent.target instanceof Element
        ? pointerEvent.target.closest<HTMLElement>(".room-item[data-room-id]")?.dataset.roomId ?? null
        : null;
    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId || (pointerEvent.buttons & 2) === 0) return;
      pointerEvent.preventDefault();
      const targetRoomId = roomFromEvent(pointerEvent) ?? roomAtPoint(pointerEvent.clientX, pointerEvent.clientY);
      if (!targetRoomId || targetRoomId === dragOverRoomIdRef.current) return;
      dragOverRoomIdRef.current = targetRoomId;
      setDragOverRoomId(targetRoomId);
    };
    const handlePointerUp = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId || pointerEvent.button !== 2) return;
      pointerEvent.preventDefault();
      const targetRoomId = roomFromEvent(pointerEvent) ?? roomAtPoint(pointerEvent.clientX, pointerEvent.clientY) ?? dragOverRoomIdRef.current ?? roomId;
      cleanup();
      roomPointerDragCleanupRef.current = null;
      void handleRoomDrop(targetRoomId, roomId);
    };
    const handlePointerCancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      roomPointerDragCleanupRef.current = null;
      clearRoomReorderState();
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerCancel);
    roomPointerDragCleanupRef.current = cleanup;
  }

  async function handleRoomDrop(roomId: string, sourceRoomId = draggedRoomId) {
    if (!sourceRoomId || sourceRoomId === roomId || roomReorderPending) {
      clearRoomReorderState();
      return;
    }
    const previousRooms = rooms;
    const nextRooms = reorderRoomsById(previousRooms, sourceRoomId, roomId);
    clearRoomReorderState();
    setRooms(nextRooms);
    setRoomReorderPending(true);
    setError(null);
    try {
      const reorderedRooms = await api.reorderRooms(nextRooms.map((room) => room.id));
      setRooms(sortRoomsByOrder(reorderedRooms));
    } catch (err) {
      setRooms(previousRooms);
      setError(err instanceof Error ? err.message : "Room reorder failed");
    } finally {
      setRoomReorderPending(false);
    }
  }

  function clearPaneReorderState() {
    setDraggedPaneId(null);
    setPaneDragOverId(null);
    setPaneDragOverPosition("before");
    setDragOverSlotKey(null);
  }

  function handlePaneDragStart(event: ReactDragEvent<HTMLElement>, pane: Pane) {
    if (paneReorderPending) return;
    if (typeof document !== "undefined") {
      document.querySelectorAll<HTMLDetailsElement>(".pane-title-details[open]").forEach((details) => {
        details.open = false;
      });
    }
    setPaneDragData(event, pane, activeRoom);
    setDraggedPaneId(pane.id);
  }

  function handlePaneDragOver(event: ReactDragEvent<HTMLElement>, paneId: string) {
    if (!draggedPaneId || draggedPaneId === paneId || paneReorderPending) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const isMultiColumn = paneGridColumnCount > 1;
    const clientX =
      typeof event.clientX === "number" && !Number.isNaN(event.clientX)
        ? event.clientX
        : typeof (event.nativeEvent as any)?.clientX === "number"
          ? (event.nativeEvent as any).clientX
          : 0;
    const clientY =
      typeof event.clientY === "number" && !Number.isNaN(event.clientY)
        ? event.clientY
        : typeof (event.nativeEvent as any)?.clientY === "number"
          ? (event.nativeEvent as any).clientY
          : 0;
    const isAfter = isMultiColumn
      ? (rect.width > 0 ? clientX > rect.left + rect.width / 2 : clientX > 0)
      : (rect.height > 0 ? clientY > rect.top + rect.height / 2 : clientY > 0);
    const nextPosition: PaneDropPosition = isAfter ? "after" : "before";
    setPaneDragOverId(paneId);
    setPaneDragOverPosition(nextPosition);
  }

  function handlePaneDragLeave(paneId: string) {
    if (paneDragOverId === paneId) {
      setPaneDragOverId(null);
    }
  }

  async function handlePaneDrop(targetPaneId: string, position: PaneDropPosition = paneDragOverPosition, anchorColumnStart?: number, targetRowIndex?: number) {
    if (!draggedPaneId || (draggedPaneId === targetPaneId && anchorColumnStart === undefined) || paneReorderPending) {
      clearPaneReorderState();
      return;
    }
    const movingPaneId = draggedPaneId;
    const previousPanes = panes;
    const nextPanes = targetPaneId && targetPaneId !== movingPaneId
      ? reorderPanesByTarget(previousPanes, movingPaneId, targetPaneId, position)
      : previousPanes;
    clearPaneReorderState();
    if (anchorColumnStart !== undefined) {
      paneColumnAnchorStartsRef.current.set(
        movingPaneId,
        targetRowIndex !== undefined ? { columnStart: anchorColumnStart, rowIndex: targetRowIndex } : anchorColumnStart
      );
    } else {
      paneColumnAnchorStartsRef.current.delete(movingPaneId);
    }
    setPanes([...nextPanes]);
    setPaneReorderPending(true);
    setError(null);
    try {
      const reorderedPanes = await api.reorderPanes(activeRoom?.id ?? nextPanes[0]?.roomId ?? "", nextPanes.map((pane) => pane.id));
      setPanes(reorderedPanes);
    } catch (err) {
      setPanes(previousPanes);
      setError(err instanceof Error ? err.message : "Pane reorder failed");
    } finally {
      setPaneReorderPending(false);
    }
  }

  const filteredRoomEntries = rooms.map(room => ({
    room,
    activity: workspaceRoomActivity(room.id === selectedRoomId ? panes : roomRuntimes[room.id]?.panes ?? [], paneCompletionLifecycle.panes, roomCliActivityCounts[room.id])
  })).filter(({ room }) => {
    if (!isAdminMode) {
      if (room.ownerUserId && room.ownerUserId !== auth?.user?.id) return false;
    } else {
      if (adminRoomFilterMode === "mine") {
        if (room.ownerUserId && room.ownerUserId !== auth?.user?.id) return false;
      } else if (adminRoomFilterMode === "user") {
        if (adminSelectedUserId && room.ownerUserId !== adminSelectedUserId) return false;
      }
    }
    if (roomSearch.trim()) {
      const q = roomSearch.trim().toLowerCase();
      const nameMatch = room.name.toLowerCase().includes(q);
      const ownerEmail = room.ownerUserId ? userEmailById.get(room.ownerUserId) ?? "" : "";
      return nameMatch || ownerEmail.toLowerCase().includes(q);
    }
    return true;
  });
  const isRoomListFiltered = Boolean(roomSearch.trim()) || (isAdminMode && adminRoomFilterMode !== "mine");
  const roomsSurfaceContent = (
    <div
      ref={roomsPanelRef}
      className="side-surface-panel side-surface-room-panel"
      data-show-banner={showDownloadBanner ? "true" : "false"}
    >
      <div className="rooms-controls">
      <div className="rail-actions">
        <button
          type="button"
          onClick={() => void createRoom()}
          disabled={roomCreationPending || rooms.length >= MAX_ROOMS}
          aria-busy={roomCreationPending}
          title={rooms.length >= MAX_ROOMS ? `Maximum room limit (${MAX_ROOMS}) reached` : "Create empty room"}
        >
          <Plus aria-hidden="true" />
          New room
        </button>
      </div>
      <label className="rooms-search">
        <Search aria-hidden="true" />
        <input type="search" name="room-search" aria-label="Find a room" placeholder="Find a room…" value={roomSearch} onChange={event => setRoomSearch(event.target.value)} />
      </label>
      {isAdminMode ? (
        <div className="rooms-admin-account-filter">
          <div className="rooms-filter" role="group" aria-label="Filter rooms by account">
            <button
              type="button"
              aria-pressed={adminRoomFilterMode === "mine"}
              title="Show only rooms owned by your account"
              onClick={() => setAdminRoomFilterMode("mine")}
            >
              My rooms
            </button>
            <button
              type="button"
              aria-pressed={adminRoomFilterMode === "all"}
              title="Show rooms from all accounts"
              onClick={() => setAdminRoomFilterMode("all")}
            >
              All accounts
            </button>
            <button
              type="button"
              aria-pressed={adminRoomFilterMode === "user"}
              title="Show rooms for a selected account"
              onClick={() => {
                setAdminRoomFilterMode("user");
                if (!adminSelectedUserId && adminUsersList.length > 0) {
                  const otherUser = adminUsersList.find((u) => u.id !== auth?.user?.id) ?? adminUsersList[0];
                  if (otherUser) setAdminSelectedUserId(otherUser.id);
                }
              }}
            >
              Selected account
            </button>
          </div>
          {adminRoomFilterMode === "user" ? (
            <div className="rooms-user-selector">
              <select
                className="rooms-account-select"
                aria-label="Select account to view rooms"
                value={adminSelectedUserId}
                onChange={(e) => setAdminSelectedUserId(e.target.value)}
              >
                <option value="" disabled>Choose account…</option>
                {adminUsersListWithLiveCounts.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email || u.id} ({u.role}) — {u.roomCount ?? 0} {u.roomCount === 1 ? "room" : "rooms"}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}
      {isRoomListFiltered ? <div className="rooms-filter-summary"><span role="status">{filteredRoomEntries.length} of {rooms.length} rooms</span>
        <button type="button" onClick={() => { setRoomSearch(""); if (isAdminMode) setAdminRoomFilterMode("mine"); }}>Clear filters</button></div> : null}
      </div>
      <div
        className={`room-list${draggedRoomId ? " is-room-dragging" : ""}`}
        data-room-count={filteredRoomEntries.length}
        data-room-overflow={roomListOverflow ? "true" : "false"}
        style={{
          "--room-count": filteredRoomEntries.length,
          ...(roomListMaxHeight !== null ? { "--room-list-max-height": `${roomListMaxHeight}px` } : {})
        } as React.CSSProperties}
      >
        {filteredRoomEntries.length === 0 ? <p className="rooms-empty" role="status">{rooms.length === 0 ? "Create a room to get started." : "No rooms match these filters."}</p> : null}
        {filteredRoomEntries.map(({ room, activity }) => {
          const isExpanded = dockExpandedRoomId === room.id;
          // "Warm" must mean truly ready: pane data loaded AND every visible
          // terminal pane bootstrapped (socket attached). Rooms whose data is
          // loaded but whose terminals are still attaching show "Warming".
          // User-approved 2026-08-14 (dock showed warm before it was true).
          const roomTerminalsBootstrapped = (roomId: string): boolean => {
            const runtime = roomRuntimes[roomId];
            if (!runtime) return false;
            const terminals = runtime.panes.filter(
              (pane) => pane.mode === "TERMINAL" && !pane.isMinimized
            );
            if (terminals.length === 0) return true;
            const bootstrapped = new Set(runtime.bootstrappedPaneIds ?? []);
            return terminals.every((pane) => bootstrapped.has(pane.id));
          };
          const warmPresentation = classifyRoomWarmPresentation({
            roomId: room.id,
            activeRoomId: selectedRoomId,
            warmRoomIds,
            hydratingRoomIds: new Set(
              Object.entries(roomPaneLoadStates)
                .filter(([roomId, state]) => (
                  state === "loading" ||
                  (state === "loaded" && !roomTerminalsBootstrapped(roomId))
                ))
                .map(([roomId]) => roomId)
            ),
            loadedRoomIds: new Set(
              Object.entries(roomPaneLoadStates)
                .filter(([roomId, state]) => (
                  state === "loaded" && roomTerminalsBootstrapped(roomId)
                ))
                .map(([roomId]) => roomId)
            )
          });
          const roomCliPresentations = [...new Set(roomCliRuntimeIds[room.id] ?? [])].flatMap((runtimeId) => {
            const presentation = cliRuntimePresentation(runtimeId);
            return presentation ? [presentation] : [];
          });
          return (
          <div
            key={room.id}
            className={[
              "room-item",
              room.id === selectedRoomId ? "selected" : "",
              isExpanded ? "is-expanded" : "",
              draggedRoomId === room.id ? "is-dragging" : "",
              dragOverRoomId === room.id && draggedRoomId !== room.id ? "is-drop-target" : ""
            ].filter(Boolean).join(" ")}
            data-room-id={room.id}
            data-warm-presentation={warmRoomEnabled ? warmPresentation : undefined}
            title={isRoomListFiltered ? room.name : `Hold the right mouse button to reorder ${room.name}`}
            onPointerDown={(event) => { if (!isRoomListFiltered) handleRoomRightPointerDown(event, room.id); }}
            onContextMenu={(event) => event.preventDefault()}
            onAnimationEnd={(event) => {
              if (event.animationName.includes("room-card-press-pop") || event.animationName.includes("shockwave")) {
                event.currentTarget.classList.remove("is-clicked");
              }
            }}
          >
            <div className="room-item-row">
              <button
                className="room-select"
                data-room-id={room.id}
                onClick={(event) => {
                  const item = event.currentTarget.closest<HTMLElement>(".room-item");
                  if (item) {
                    item.classList.remove("is-clicked");
                    void item.offsetWidth;
                    item.classList.add("is-clicked");
                  }
                  void selectRoom(room.id, { keepCompactSurfaceOpen: true });
                }}
                onPointerDown={(event) => {
                  if (event.button === 0) {
                    const rect = event.currentTarget.getBoundingClientRect();
                    event.currentTarget.style.setProperty("--room-press-x", `${event.clientX - rect.left}px`);
                    event.currentTarget.style.setProperty("--room-press-y", `${event.clientY - rect.top}px`);
                  }
                }}
                disabled={deletePendingRoomId === room.id || roomReorderPending}
                aria-label={`Open ${room.name}`}
                aria-current={room.id === selectedRoomId ? "true" : undefined}
              >
                <span className="room-title-row">
                  <span className="room-name">{room.name}</span>
                  {room.id === selectedRoomId ? (
                    <span className="room-active-badge" aria-label="Active room" title="Active room">
                      <span className="room-active-pulse" aria-hidden="true">
                        <span className="room-active-dot" />
                      </span>
                      <Radio className="room-active-icon" aria-hidden="true" />
                      <span className="room-active-label">Active</span>
                    </span>
                  ) : null}
                </span>
                <span className="room-badge-row">
                  {(() => {
                    const effectivePath = room.projectPath || "/opt/spaceapp";
                    const folderName = effectivePath.split("/").filter(Boolean).pop() || effectivePath;
                    return (
                      <span
                        className="room-project-tag"
                        title={`Project: ${effectivePath}`}
                        aria-label={`Project: ${effectivePath}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDockExpandedRoomId(current => current === room.id ? null : room.id);
                          if (!dockProjectPathDrafts[room.id]) {
                            setDockProjectPathDrafts(prev => ({ ...prev, [room.id]: effectivePath }));
                          }
                        }}
                      >
                        📁 {folderName}
                      </span>
                    );
                  })()}
                  <span className="room-cli-badge">
                    Panes {roomPaneCounts[room.id] ?? (room.id === selectedRoomId && roomPaneLoadStates[room.id] === "loaded"
                      ? panes.filter((pane) => !pane.isClosed).length
                      : roomRuntimes[room.id]?.panes.filter((pane) => !pane.isClosed).length ?? "—")}
                  </span>
                  {roomCliPresentations.length ? (
                    <span
                      className="room-cli-runtime-icons"
                      aria-label={`Active CLI types: ${roomCliPresentations.map((presentation) => presentation.shortLabel).join(", ")}`}
                    >
                      {roomCliPresentations.map((presentation) => (
                        <img
                          key={presentation.id}
                          className="room-cli-runtime-icon"
                          src={presentation.iconSrc}
                          alt=""
                          aria-hidden="true"
                          title={presentation.shortLabel}
                          data-terminal-runtime-brand={presentation.brand}
                          draggable={false}
                        />
                      ))}
                    </span>
                  ) : null}
                  {activity.attention ? <span className="room-attention-badge">Needs attention</span> : null}
                  {room.kind === "AGENT_PROOF" ? <span className="room-kind-badge">Agent Proof</span> : null}
                  {room.kind === "CLI_RECOVERY" ? <span className="room-kind-badge">CLI Recovery</span> : null}
                  {isAdminMode && adminRoomFilterMode !== "mine" ? (
                    <span
                      className={`room-owner-badge${room.ownerUserId === auth?.user?.id ? " is-mine" : ""}`}
                      title={`Owner: ${room.ownerUserId ? userEmailById.get(room.ownerUserId) ?? room.ownerUserId : "System"}`}
                    >
                      {room.ownerUserId === auth?.user?.id
                        ? "You"
                        : (room.ownerUserId ? userEmailById.get(room.ownerUserId) ?? room.ownerUserId : "System")}
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                className={`room-dock-expand-btn${isExpanded ? " is-expanded" : ""}`}
                title={isExpanded ? "Collapse room project details" : "Open room project settings"}
                aria-label={isExpanded ? `Collapse ${room.name}` : `Configure project for ${room.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDockExpandedRoomId(current => current === room.id ? null : room.id);
                  if (!dockProjectPathDrafts[room.id]) {
                    setDockProjectPathDrafts(prev => ({ ...prev, [room.id]: room.projectPath || "/opt/spaceapp" }));
                  }
                }}
              >
                <ChevronDown aria-hidden="true" />
              </button>
              <button
                className="room-delete"
                onClick={() => void requestRoomDelete(room)}
                disabled={deletePendingRoomId === room.id || roomReorderPending}
                title={`Delete ${room.name}`}
                aria-label={`Delete ${room.name}`}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
            {isExpanded && (
              <div className="room-dock-expansion" onClick={(e) => e.stopPropagation()}>
                <div className="room-dock-field-header">
                  <span className="room-dock-field-title">
                    <Folder aria-hidden="true" /> Project Directory:
                  </span>
                  {runtimeKind === "live" && auth?.isAuthenticated ? (
                    <button
                      type="button"
                      className="room-dock-choose-project-btn"
                      disabled={dockProjectSavingRoomId === room.id}
                      title="Choose a new project, local folder, Git URL or repository"
                      aria-label={`Choose project for ${room.name}`}
                      onClick={() => setProjectPickerRoom({ id: room.id, name: room.name })}
                    >
                      <FolderOpen aria-hidden="true" />
                      <span>Choose project</span>
                    </button>
                  ) : null}
                  {room.projectPath ? (
                    <button
                      type="button"
                      className="room-dock-clear-btn"
                      disabled={dockProjectSavingRoomId === room.id}
                      title="Clear project directory"
                      aria-label="Clear project directory"
                      onClick={async () => {
                        setDockProjectSavingRoomId(room.id);
                        try {
                          const updated = await api.updateRoom(room.id, { name: room.name, projectPath: null });
                          setRooms((current) => current.map((r) => (r.id === room.id ? updated : r)));
                          setDockProjectPathDrafts((prev) => ({ ...prev, [room.id]: "" }));
                        } catch (err) {
                          setError(err instanceof Error ? `The project directory could not be cleared: ${err.message}` : "The project directory could not be cleared.");
                        } finally {
                          setDockProjectSavingRoomId(null);
                        }
                      }}
                    >
                      <X aria-hidden="true" />
                      <span>Clear</span>
                    </button>
                  ) : null}
                </div>
                <div className="room-dock-input-row">
                  <input
                    type="text"
                    className="room-dock-project-input"
                    placeholder="e.g. /opt/spaceapp"
                    value={dockProjectPathDrafts[room.id] ?? (room.projectPath || "/opt/spaceapp")}
                    disabled={dockProjectSavingRoomId === room.id}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDockProjectPathDrafts((prev) => ({ ...prev, [room.id]: val }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveDockProject(room.id);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="room-dock-save-btn"
                    disabled={dockProjectSavingRoomId === room.id}
                    title="Save project directory"
                    onClick={() => void saveDockProject(room.id)}
                  >
                    <Save aria-hidden="true" />
                  </button>
                </div>
                {roomProjectSources[room.id] && room.projectPath ? (
                  <p className="room-dock-project-source" title={room.projectPath}>Source: {roomProjectSources[room.id]}</p>
                ) : null}
                <div className="room-dock-presets-row">
                  <span className="room-dock-presets-label">Presets:</span>
                  {projectPresets.map((preset) => {
                    const currentVal = dockProjectPathDrafts[room.id] ?? (room.projectPath || "/opt/spaceapp");
                    const isActive = currentVal === preset.path || (preset.label === "olla" && currentVal === "/srv/olla");
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        className={`room-dock-preset-chip ${isActive ? "active" : ""}`}
                        onClick={async () => {
                          setDockProjectPathDrafts((prev) => ({ ...prev, [room.id]: preset.path }));
                          await ensureProjectFolder(preset.path);
                          try {
                            const updated = await api.updateRoom(room.id, { name: room.name, projectPath: preset.path });
                            setRooms((current) => current.map((r) => (r.id === room.id ? updated : r)));
                          } catch (err) {
                            setError(err instanceof Error ? `The project preset could not be saved: ${err.message}` : "The project preset could not be saved.");
                          }
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="room-dock-preset-add-btn"
                    title="Add a project preset"
                    aria-label="Add a project preset"
                    onClick={() => {
                      setIsAddingPresetRoomId(isAddingPresetRoomId === room.id ? null : room.id);
                      setNewPresetDraft("");
                    }}
                  >
                    + New
                  </button>
                </div>
                {isAddingPresetRoomId === room.id ? (
                  <div className="room-dock-new-preset-box">
                    <input
                      type="text"
                      className="room-dock-new-preset-input"
                      placeholder="preset name (e.g. space3)"
                      value={newPresetDraft}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^a-zA-Z0-9_-]/g, "");
                        setNewPresetDraft(cleaned);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddNewPreset(room.id);
                        } else if (e.key === "Escape") {
                          setIsAddingPresetRoomId(null);
                          setNewPresetDraft("");
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="room-dock-new-preset-confirm-btn"
                      disabled={!newPresetDraft.trim()}
                      onClick={() => void handleAddNewPreset(room.id)}
                    >
                      Add & Create
                    </button>
                    <button
                      type="button"
                      className="room-dock-new-preset-cancel-btn"
                      onClick={() => {
                        setIsAddingPresetRoomId(null);
                        setNewPresetDraft("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
                <div
                  className="room-dock-worktree-setting"
                  style={{
                    margin: "10px 0 8px 0",
                    padding: "8px 10px",
                    background: "rgba(255, 255, 255, 0.03)",
                    borderRadius: "6px",
                    border: "1px solid rgba(255, 255, 255, 0.06)"
                  }}
                >
                  <SpaceToggle
                    className="room-dock-worktree-toggle"
                    label={
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <GitBranch size={13} aria-hidden="true" /> Isolated Worktrees (Git)
                      </span>
                    }
                    detail={`Dedicated Git branches for CLI tools in this room (${isRoomWorktreeEnabled(room.id) ? "Enabled" : "Disabled"})`}
                    checked={isRoomWorktreeEnabled(room.id)}
                    onChange={(enabled) => setRoomWorktreeEnabled(room.id, enabled)}
                  />
                </div>
                {room.projectPath || dockProjectPathDrafts[room.id] ? (
                  <div className="room-dock-actions-row">
                    <button
                      type="button"
                      className="room-dock-action-btn"
                      onClick={async () => {
                        await selectRoom(room.id);
                        const effective = room.projectPath || dockProjectPathDrafts[room.id];
                        if (effective) {
                          await ensureProjectFolder(effective);
                        }
                        const existingFiles = (room.id === selectedRoomId ? panes : roomRuntimes[room.id]?.panes ?? []).find((p) => !p.isClosed && p.mode === "FILES");
                        if (existingFiles) {
                          setSelectedPaneId(existingFiles.id);
                          if (effective) {
                            window.dispatchEvent(new CustomEvent("space:files:navigate", { detail: { path: effective } }));
                          }
                        } else {
                          await addFilesPane(1, room.id);
                        }
                      }}
                    >
                      <FolderOpen aria-hidden="true" /> Files
                    </button>
                    <button
                      type="button"
                      className="room-dock-action-btn"
                      onClick={async () => {
                        await selectRoom(room.id);
                        const effective = room.projectPath || dockProjectPathDrafts[room.id];
                        if (effective) {
                          await ensureProjectFolder(effective);
                        }
                        await addRootAdminPane(room.id);
                      }}
                    >
                      <Terminal aria-hidden="true" /> Terminal
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
          );
        })}
      </div>
      {projectPickerRoom ? (
        <RecoverableSurface fallback={null}>
          <LazyProjectSourcePicker
            context={{ kind: "room", roomId: projectPickerRoom.id, roomName: projectPickerRoom.name }}
            isAdmin={auth?.user?.role === "ADMIN" || auth?.user?.role === "OPERATOR"}
            defaultParent="/opt/spaceapp/projects"
            onOpened={(result) => assignPickedProjectToRoom(projectPickerRoom.id, result)}
            onClose={() => setProjectPickerRoom(null)}
          />
        </RecoverableSurface>
      ) : null}
      <div className="room-pane-composer-slot" inert={preparingRoomId ? true : undefined}>
        {showDownloadBanner ? (
          <a
            className="spaceapp-download-banner"
            href="https://spaceapp.dev"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download SpaceApp from SpaceApp.dev"
          >
            <img
              src={modernColorMode === "light" ? "/brand/spaceapp-open-source-banner-light.svg" : "/brand/spaceapp-open-source-banner.webp"}
              alt="SpaceApp is open source and free to download."
              decoding="async"
            />
          </a>
        ) : null}
        <RoomPaneComposer
          mobile={shellMode === "mobile"}
          activePaneCount={presentationPanes.length}
          onApply={addRoomPanes}
          onOpenSettings={openSettingsSurface}
          room={presentationRoom}
          isWorktreeEnabled={presentationRoom ? isRoomWorktreeEnabled(presentationRoom.id) : false}
          defaultCollapsed={true}
        />
      </div>
      {roomDeleteConfirm.confirmDialog}
    </div>
  );

  useLayoutEffect(() => {
    if (activeSideSurface !== "rooms") return;
    const panel = roomsPanelRef.current;
    if (!panel) return;

    const checkBannerFit = () => {
      const controls = panel.querySelector<HTMLElement>(".rooms-controls");
      const roomList = panel.querySelector<HTMLElement>(".room-list");
      const composer = panel.querySelector<HTMLElement>(".room-pane-composer");
      const mix = composer?.querySelector<HTMLElement>(".room-pane-mix");
      const banner = panel.querySelector<HTMLElement>(".spaceapp-download-banner");

      const availableHeight = panel.clientHeight;
      if (availableHeight <= 0) return;

      const controlsHeight = controls?.offsetHeight ?? 0;
      const roomChildren = roomList ? (Array.from(roomList.children) as HTMLElement[]) : [];
      let naturalRoomSpan = 0;
      if (roomChildren.length > 0) {
        const gapPx = 7.2; // 0.45rem gap in .room-list
        const sumOfCards = roomChildren.reduce((acc, el) => acc + (el.offsetHeight || 70), 0);
        naturalRoomSpan = Math.round(sumOfCards + Math.max(0, roomChildren.length - 1) * gapPx);
      }

      const isComposerCollapsed = composer?.getAttribute("data-collapsed") === "true";
      const composerNaturalHeight = isComposerCollapsed
        ? (composer?.offsetHeight ?? 44)
        : (mix && composer
            ? composer.scrollHeight - mix.clientHeight + mix.scrollHeight
            : (composer?.scrollHeight ?? 0));

      const bannerWidth = banner?.offsetWidth || (panel.clientWidth - 24);
      const bannerHeight = banner?.offsetHeight || (Math.round(bannerWidth * 34 / 121) + 2);
      const bannerTotalHeight = bannerHeight + 12;

      // Spacing: padding (0.75rem * 2 = 24px) + grid gaps (0.75rem * 2 = 24px) = 48px
      const panelSpacing = 48;
      const netAvailable = Math.max(0, availableHeight - controlsHeight - panelSpacing);

      // Check if everything fits with the download banner
      const totalNeededWithBanner = controlsHeight + naturalRoomSpan + composerNaturalHeight + bannerTotalHeight + panelSpacing;
      const bannerFits = totalNeededWithBanner <= availableHeight;

      // Available height allocated for the room list:
      const currentBannerHeight = bannerFits ? bannerTotalHeight : 0;
      const spaceForRooms = netAvailable - composerNaturalHeight - currentBannerHeight;

      // On smaller screens where composer is expanded, ensure rooms get at least minimum reasonable height
      const composerMinHeight = isComposerCollapsed ? (composer?.offsetHeight ?? 44) : 180;
      const effectiveAvailableForRooms = Math.max(
        spaceForRooms,
        Math.min(naturalRoomSpan, netAvailable - composerMinHeight)
      );
      const finalAvailableForRooms = Math.max(effectiveAvailableForRooms, 72);

      // Overflows only when natural height exceeds available space and more than 3 rooms
      const overflows = roomChildren.length > 3 && naturalRoomSpan > (finalAvailableForRooms + 2);

      setShowDownloadBanner((prev) => (prev !== bannerFits ? bannerFits : prev));
      setRoomListOverflow((prev) => (prev !== overflows ? overflows : prev));
      setRoomListMaxHeight((prev) => {
        const nextVal = overflows ? Math.round(finalAvailableForRooms) : null;
        return prev !== nextVal ? nextVal : prev;
      });

      // Synchronously set properties on roomList DOM element to avoid visual paint flicker
      if (roomList) {
        const overflowValue = overflows ? "true" : "false";
        if (roomList.getAttribute("data-room-overflow") !== overflowValue) {
          roomList.setAttribute("data-room-overflow", overflowValue);
        }
        if (overflows) {
          const height = `${Math.round(finalAvailableForRooms)}px`;
          if (roomList.style.getPropertyValue("--room-list-max-height") !== height) {
            roomList.style.setProperty("--room-list-max-height", height);
          }
        } else if (roomList.style.getPropertyValue("--room-list-max-height")) {
          roomList.style.removeProperty("--room-list-max-height");
        }
      }
    };

    checkBannerFit();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(checkBannerFit) : null;
    observer?.observe(panel);
    const roomList = panel.querySelector<HTMLElement>(".room-list");
    if (roomList) observer?.observe(roomList);
    const composer = panel.querySelector<HTMLElement>(".room-pane-composer");
    if (composer) observer?.observe(composer);
    const mix = panel.querySelector<HTMLElement>(".room-pane-mix");
    if (mix) observer?.observe(mix);

    window.addEventListener("resize", checkBannerFit);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", checkBannerFit);
    };
  }, [activeSideSurface, filteredRoomEntries.length, rooms.length, roomSearch, adminRoomFilterMode, adminSelectedUserId, presentationPanes.length]);

  function resumeAgentSessionCodexThread(threadId: string) {
    if (!activePane || !isCodexEnabled) return;
    dispatchAgentPaneAction(activePane.id, { action: "open_thread", threadId });
  }

  async function resumeAgentSession(item: AgentSessionHistoryItem): Promise<string | null> {
    if (!selectedRoomId) return "Open a room first to resume sessions.";
    if (panes.length >= 16) return "The room has reached its pane limit.";
    if (item.kind === "codex") {
      if (!item.threadId) return "This session cannot be resumed.";
      if (!isCodexEnabled) return "Codex is not enabled in this workspace.";
      try {
        const created = await api.createPane(
          selectedRoomId,
          paneTitleForMode("TERMINAL", panes.length + 1),
          "TERMINAL",
          { terminalRuntimeId: "cli:codex" }
        );
        registerCliResumeIntent(created.id, { threadId: item.threadId });
        setPanes((current) => [...current.filter((pane) => pane.id !== created.id), created]);
        setSelectedPaneId(created.id);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Codex CLI resume failed";
      }
    }
    const runtimeId = item.threadSource;
    if (!runtimeId) return "This session has no runtime to resume into.";
    if (!item.taskId) return "This session cannot be resumed.";
    try {
      const created = await api.createPane(
        selectedRoomId,
        paneTitleForMode("TERMINAL", panes.length + 1),
        "TERMINAL",
        { terminalRuntimeId: runtimeId }
      );
      registerCliResumeIntent(created.id, { taskId: item.taskId });
      setPanes((current) => [...current.filter((pane) => pane.id !== created.id), created]);
      setSelectedPaneId(created.id);
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "CLI resume failed";
      if (/take control/i.test(message)) {
        return "Open this CLI pane once, then press Resume again.";
      }
      return message;
    }
  }

  const cliDockContent = (
    <LazyCliDock
      canManage={auth?.user?.role === "ADMIN"}
      cliImagePreviewLimit={cliImagePreviewLimit}
      warmRoomEnabled={warmRoomEnabled}
      warmConnectedPaneLimit={warmConnectedPaneLimit}
      defaultWorktreeEnabled={defaultWorktreeEnabled}
      onDefaultWorktreeEnabledChange={(enabled) => {
        setDefaultWorktreeEnabled(enabled);
        try {
          localStorage.setItem("space.worktree.defaultEnabled", String(enabled));
        } catch {}
        if (auth?.isAuthenticated) {
          saveUserSettingDebounced("worktreeDefaultEnabled", enabled);
        }
      }}
      onCliImagePreviewLimitChange={(limit) => setCliImagePreviewLimit(writeStoredCliImagePreviewLimit(limit))}
      onWarmRoomEnabledChange={(enabled) => {
        setWarmRoomEnabled(writeStoredWarmRoomEnabled(enabled));
      }}
      onWarmConnectedPaneLimitChange={(limit) => {
        setWarmConnectedPaneLimit(writeStoredWarmRoomConnectedPaneLimit(limit));
      }}
      onOpenRestartAll={openCliRuntimeRestartAllDialog}
      restartAllPending={cliRuntimeRestartAllPending}
    />
  );
  const renderSideSurfaceContent = (surface: SideSurface, onClose?: () => void, onNavigate?: (id: string) => void) =>
    surface === "rooms" ? (
      onNavigate ? cloneElement(roomsSurfaceContent, { ref: undefined }) : roomsSurfaceContent
    ) : surface === "room-agent" ? (
      <LazyRoomAgentDock
        activeRoom={activeRoom}
        selectedBrowserPaneId={activePane?.mode === "BROWSER" && activePane.id === selectedPaneId ? activePane.id : undefined}
        isCodexEnabled={isCodexEnabled}
        refreshKey={roomEvents.at(-1)?.id ?? null}
      />
    ) : surface === "settings" ? (
      <AgentSettingsDock
        adminMode={shellMode !== "desktop" || isAdminMode}
        onOpenSetup={() => onNavigate ? onNavigate("setup-connections") : openManage("setup-connections")}
        activePane={activePane}
        currentAppearance={modernAppearance}
        currentBackground={uiBackground}
        currentIconPack={modernIconPack}
        currentUiTheme={uiTheme}
        isCodexEnabled={isCodexEnabled}
        canManageCliRuntimes={auth?.user?.role === "ADMIN"}
        canManageDiagnostics={auth?.user?.role === "ADMIN"}
        canManageSourceControl={auth?.user?.role === "ADMIN"}
        canManageTelegram={auth?.user?.role === "ADMIN"}
        suppressNotifications={suppressNotifications}
        providerSettings={providerSettings}
        providers={providers}
        gitPluginsActive={sourceControlEnabled}
        isHarnessEnabled={isHarnessEnabled}
        onSuppressNotificationsChange={(suppressed) => {
          setSuppressNotifications(writeStoredSuppressNotifications(suppressed));
        }}
        onProviderSettingsRefresh={setProviderSettings}
        onUiThemeApply={async ({ appearance, background, iconPack, theme }) => {
          writeModernAppearance(runtime.platform.localStorage, appearance);
          writeUiBackground(runtime.platform.localStorage, background);
          writeModernIconPack(runtime.platform.localStorage, iconPack);
          writeUiTheme(runtime.platform.localStorage, theme);
          try {
            await api.updateUserSettings({
              modernAppearance: appearance,
              uiBackground: background,
              modernIconPack: iconPack,
              uiTheme: theme
            });
          } catch {
            // offline fallback
          }
          runtime.platform.reloadPage();
        }}
        auth={auth}
        onAuthRefresh={refresh}
      />
    ) : surface === "media" ? (
      <LazyMediaDock activeRoom={activeRoom} refreshKey={latestArtifactEventId} />
    ) : surface === "streaming" ? (
      <LazyStreamingDock />
    ) : surface === "source-control" ? (
      <LazySourceControlDock userId={auth?.user?.id || ""} currentProjectPath={activeRoom?.projectPath}
        projects={[...projectPresets, ...rooms.filter(room => room.projectPath).map(room => ({ label: room.name, path: room.projectPath! }))]}
        isAdmin={auth?.user?.role === "ADMIN" || auth?.user?.role === "OPERATOR"} onProjectOpened={addOpenedProjectPreset} />
    ) : surface === "cli" ? (
      cliDockContent
    ) : surface === "agent-sessions" ? (
      <LazyAgentSessionsDock
        activePaneLabel={activePane ? displayPaneTitle(activePane) : null}
        canResume={Boolean(selectedRoomId)}
        codexEnabled={isCodexEnabled}
        onResume={resumeAgentSession}
      />
    ) : surface === "agent-files" ? (
      <LazyAgentFilesDock activeRoom={activeRoom} refreshKey={latestArtifactEventId} paneTitles={agentFilesPaneTitles} />
    ) : surface === "shared-chat" ? (
      <LazySharedChatDock />
    ) : surface === "clipboard" ? (
      <LazyClipboardDock
        canInsert={activePane?.mode === "CHAT" || activePane?.mode === "TERMINAL"}
        activePaneLabel={activePane ? displayPaneTitle(activePane) : null}
        onInsert={insertClipboardItem}
        onOpenStickyNote={onNavigate ? (item) => { setWorkspaceStickyItem(item ?? null); onNavigate("sticky-note"); } : openStickyNote}
        onClose={() => {
          if (onClose) { onClose(); return; }
          setIsDesktopSideSurfaceOpen(false);
          closeCompactSideSurface();
        }}
      />
    ) : surface === "tasks" ? (
      <LazyTaskDock
        canInsert={activePane?.mode === "CHAT" || activePane?.mode === "TERMINAL"}
        activePaneLabel={activePane ? displayPaneTitle(activePane) : null}
        onInsert={insertTaskItem}
      />
    ) : surface === "links" ? (
      <LinksPanel onOpen={link => {
        if (onNavigate && link.openMode !== "NEW_TAB" && !isYouTubeUrl(link.url)) {
          setWorkspaceUserLink(link);
          onNavigate("link-preview");
        } else openUserLink(link);
      }} />
    ) : (
      <HealthDock
        readiness={readiness}
        mcp={mcp}
        latestSmoke={latestMcpSmoke}
        providers={providers}
        models={models}
        observability={observability}
        workerReadiness={workerReadiness}
        storageReadiness={storageReadiness}
        loadError={healthSurfaceError}
        onRefresh={() => loadHealthSurfaceData(true)}
      />
    );

  // Agent Files cards name the pane that produced a file; the key keeps the map stable while titles are unchanged.
  const paneTitleKey = panes.map((pane) => `${pane.id}\u0001${displayPaneTitle(pane)}`).join("\u0002");
  const agentFilesPaneTitles = useMemo<Record<string, string>>(
    () => Object.fromEntries(paneTitleKey ? paneTitleKey.split("\u0002").map((entry) => entry.split("\u0001") as [string, string]) : []),
    [paneTitleKey]
  );

  const targetablePanes = useMemo(() => {
    const roomPanes = panes.filter(
      (p) => p.roomId === activeRoom?.id && !p.isClosed && !floatingYouTubePaneIds.has(p.id)
    );
    const nonMinimized = roomPanes.filter((p) => !p.isMinimized);
    return nonMinimized.length > 0 ? nonMinimized : roomPanes;
  }, [panes, activeRoom?.id, floatingYouTubePaneIds]);

  const handleSnipCapture = useStableCallback(async (file: File, targetPaneId?: string | null, captureRoomId?: string, signal?: AbortSignal) => {
    const assertCurrent = () => {
      if (signal?.aborted) throw new DOMException("Capture cancelled", "AbortError");
      if (!activeRoom || selectedRoomIdRef.current !== activeRoom.id || (captureRoomId && activeRoom.id !== captureRoomId)) {
        throw new Error("The room changed. Close Snip Tool and capture again in the current room.");
      }
    };
    assertCurrent();
    // Explicit null means Media Dock, never a fallback to a different pane.
    const resolvedPane = targetPaneId ? panes.find(p => p.id === targetPaneId && p.roomId === activeRoom!.id && !p.isClosed) : null;
    if (targetPaneId && !resolvedPane) throw new Error("The selected pane is no longer available. Choose another pane or Media Dock.");
    if (resolvedPane?.isMinimized) await restorePane(resolvedPane);
    assertCurrent();
    if (resolvedPane && !panesRef.current.some(p => p.id === resolvedPane.id && !p.isClosed && p.roomId === activeRoom!.id)) {
      throw new Error("The selected pane is no longer available. Choose another pane or Media Dock.");
    }
    if (resolvedPane) setSelectedPaneId(resolvedPane.id);
    await routeClipImage(file, {
      roomId: activeRoom!.id,
      paneId: resolvedPane?.id ?? null,
      paneMode: resolvedPane?.mode ?? null
    }, signal);
  });

  const isVibeMusicMounted = useVibeMusicMount(activeRoom?.id, isVibeMusicOpen || Boolean(workspaceMusicHost));

  if (!auth || !setupStatus) {
    return (
      <AppIconProvider pack={modernIconPack}>
        <AuthenticationBootstrap
          error={authBootstrapError}
          onRetry={() => {
            setAuthBootstrapError(null);
            refresh().catch((err: unknown) => {
              if (!appMountedRef.current) return;
              setAuthBootstrapError(err instanceof Error ? err.message : "Owner setup status is unavailable.");
            });
          }}
        />
      </AppIconProvider>
    );
  }

  if (!auth.isAuthenticated && (setupStatus.setupRequired || auth.isSetupRequired)) {
    return (
      <AppIconProvider pack={modernIconPack}>
        <OwnerSetupScreen expiresAt={setupStatus.expiresAt} onClaim={handleOwnerClaim} />
      </AppIconProvider>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <AppIconProvider pack={modernIconPack}>
        <LoginScreen
          auth={auth}
          colorMode={uiTheme !== "classic" ? modernColorMode : null}
          modern={uiTheme !== "classic"}
          onLogin={handleLogin}
        />
      </AppIconProvider>
    );
  }

  if (isOskKeyboardOpen || workspaceKeyboardHost) oskKeyboardMountedRef.current = true;

  const vibeMusicPlayer = isVibeMusicMounted ? (
    <RecoverableSurface fallback={null}>
      <LazyVibeMusicPlayer
        activeRoomId={activeRoom?.id}
        mobile={shellMode === "mobile"}
        open={isVibeMusicOpen || Boolean(workspaceMusicHost)}
        portalTarget={workspaceMusicHost}
        onOpenChange={open => { if (!open && workspaceMusicHost) workspaceMusicBack.current?.(); else setIsVibeMusicOpen(open); }}
        onOpenYouTube={(url) => { void addPane("YOUTUBE", url); }}
        roomTheme={roomTheme}
        triggerRef={vibeMusicButtonRef}
      />
    </RecoverableSurface>
  ) : null;

  const snipToolOverlay = isSnipToolOpen ? (
    <RecoverableSurface fallback={null}>
    <LazySnipToolOverlay
      isOpen={isSnipToolOpen}
      initialMode={snipToolInitialModeRef.current}
      roomId={activeRoom?.id}
      onClose={() => setIsSnipToolOpen(false)}
      isMobile={shellMode === "mobile"}
      activePaneId={activePane && !activePane.isMinimized ? activePane.id : null}
      activePaneTitle={activePane ? displayPaneTitle(activePane) : null}
      activePaneMode={activePane?.mode ?? null}
      activePaneName={activePane?.paneName ?? null}
      availablePanes={targetablePanes.map((p) => ({
        id: p.id,
        title: displayPaneTitle(p),
        mode: p.mode,
        paneName: p.paneName ?? null
      }))}
      onCapture={handleSnipCapture}
    />
    </RecoverableSurface>
  ) : null;

  const oskKeyboard = oskKeyboardMountedRef.current ? (
    <RecoverableSurface fallback={null}>
      <LazyOnScreenKeyboard
        mobile={shellMode === "mobile"}
        open={isOskKeyboardOpen || Boolean(workspaceKeyboardHost)}
        portalTarget={workspaceKeyboardHost}
        onInput={routeOnScreenKeyboardInput}
        onShortcut={routeCliShortcut}
        onOpenChange={open => { if (!open && workspaceKeyboardHost) workspaceKeyboardBack.current?.(); else setIsOskKeyboardOpen(open); }}
        roomTheme={roomTheme}
      />
    </RecoverableSurface>
  ) : null;

  const stickyNoteLayer = shellMode === "mobile" ? null : (
    <StickyNoteLayer
      windows={stickyWindows}
      onClose={closeStickyWindow}
      onUpdateText={(id, text) => updateStickyWindow(id, { text })}
      onUpdateColor={(id, color) => updateStickyWindow(id, { color })}
      onUpdatePosition={(id, x, y) => updateStickyWindow(id, { x, y })}
      onUpdateItemId={(id, itemId) => updateStickyWindow(id, { itemId })}
      onBringToFront={bringStickyWindowToFront}
    />
  );

  const isHeaderDockActive = !isRoomToolbarHidden && !(shellMode === "mobile" && isMobilePaneFocusMode && Boolean(activePane));

  const desktopWidgetsLayer = shellMode === "mobile" ? null : (
    <DesktopWidgetsLayer
      widgetsController={desktopWidgets}
      isMultiColumn={paneGridColumnCount >= 2}
      isHeaderDockActive={isHeaderDockActive}
    />
  );

  if (auth?.isAuthenticated && appView === "benchmark") {
    const benchmarkContent = (
      <RecoverableSurface fallback={<div className="page-loading" role="status">Loading benchmark…</div>}>
        <LazyBenchmarkPage onBack={closeBenchmark} />
      </RecoverableSurface>
    );
    return (
      <AppIconProvider pack={modernIconPack}>
        {vibeMusicPlayer}
        {oskKeyboard}
        {stickyNoteLayer}
        {desktopWidgetsLayer}
        {uiTheme !== "classic" ? (
          <div
            className="modern-theme-page"
            data-ui-theme="modern"
            data-color-mode={modernColorMode}
            data-icon-pack={modernIconPack}
            data-room-theme={roomTheme}
          >
            {benchmarkContent}
          </div>
        ) : benchmarkContent}
      </AppIconProvider>
    );
  }

  if (auth?.isAuthenticated && appView === "help") {
    const helpContent = (
        <RecoverableSurface fallback={<div className="page-loading" role="status">Loading Help…</div>}>
          <LazyHelpPage onBack={closeHelp} />
        </RecoverableSurface>
    );
    // Same provider path as the workspace, so the music player, keyboard, notes and widgets keep
    // their instances (audio keeps playing) when Help opens and closes.
    return (
      <AppIconProvider pack={modernIconPack}>
        <LiveSessionProvider ownerId={auth.user?.id || ""} roomId={selectedRoomId || activeRoom?.id || null} roomName={activeRoom?.name}>
        {vibeMusicPlayer}
        {oskKeyboard}
        {stickyNoteLayer}
        {desktopWidgetsLayer}
        {uiTheme !== "classic" ? (
          <div
            className={
              uiTheme === "codex"
                ? "modern-theme-page codex-theme-page"
                : uiTheme === "motion"
                  ? "modern-theme-page motion-theme-page"
                  : "modern-theme-page"
            }
            data-ui-theme={uiTheme}
            data-interface-theme={uiTheme}
            data-color-mode={modernColorMode}
            data-icon-pack={modernIconPack}
            data-room-theme={roomTheme}
          >
            {helpContent}
          </div>
        ) : (
          <div
            className="space-shell classic-theme-page"
            data-ui-theme="classic"
            data-interface-theme="classic"
            data-room-theme={roomTheme}
            data-icon-pack={modernIconPack}
          >
            {helpContent}
          </div>
        )}
        </LiveSessionProvider>
      </AppIconProvider>
    );
  }

  const isMobilePaneFocused = shellMode === "mobile" && isMobilePaneFocusMode && Boolean(activePane);
  const showPaneNavigation = !isMobilePaneFocused && showMinimizedBar;
  const shellClassName = ["space-shell", `shell-${shellMode}`, isRoomFocusMode ? "room-focus-mode" : ""].filter(Boolean).join(" ");
  const workspaceClassName = ["workspace", showInlineSideSurface ? "" : "side-surface-hidden"].filter(Boolean).join(" ");
  const boardClassName = ["board", showPaneNavigation ? "has-pane-navigation" : ""].filter(Boolean).join(" ");
  const mountedRoomRuntimeIds = selectedRoomId
    ? Array.from(new Set(
        [selectedRoomId, displayedRoomId, preparingRoomId, ...warmRoomIds]
          .filter((roomId): roomId is string => Boolean(roomId))
      ))
    : [];

  function renderRoomRuntimeLayer(roomId: string) {
    const isActive = roomId === selectedRoomId;
    const warmRecencyRank = warmRoomIds.indexOf(roomId);
    const presentationState =
      roomId === preparingRoomId
        ? "preparing"
        : roomId === displayedRoomId
          ? preparingRoomId
            ? "held"
            : "displayed"
          : "hidden";
    const isPresented = presentationState !== "hidden";
    const isInteractive = presentationState === "displayed";
    const acceptsTerminalOutput = presentationState === "preparing" || presentationState === "displayed";
    const cached = roomRuntimes[roomId];
    if (!isActive && !cached) return null;
    const layerPanes = isActive ? panes : cached?.panes ?? [];
    const layerTurns = isActive ? turns : cached?.turns ?? [];
    const layerEvents = isActive ? roomEvents : cached?.events ?? [];
    const layerSelectedPaneId = isActive ? selectedPaneId : cached?.selectedPaneId ?? null;
    const layerPaneLoadState = roomPaneLoadStates[roomId] ?? "loading";
    const layerRoom = rooms.find((room) => room.id === roomId) ?? null;
    const layerPaneLimit = roomPaneLimit(layerRoom);
    const layerAddPaneBlockedReason = layerPanes.length >= layerPaneLimit
      ? `This room already has the maximum of ${layerPaneLimit} panes.`
      : null;
    const roomCategoryFilter = activeCategoryColorByRoom[roomId] ?? null;
    const layerRenderPanes = roomCategoryFilter
      ? layerPanes.filter((pane) => pane.categoryColor === roomCategoryFilter)
      : layerPanes;
    const layerVisiblePanes = layerRenderPanes.filter((pane) => (shellMode === "mobile" || !pane.isMinimized) && !floatingYouTubePaneIds.has(pane.id));
    // A stored layout may outlive pane creation/closure or a shell mode change.
    // Fall back to the existing grid until it covers the current room exactly.
    const savedControlLayout = controlLayouts[roomId];
    const layerControlLayout = savedControlLayout?.mode === "CUSTOM"
      && !layerPanes.some(pane => pane.isMaximized)
      && layerRoom?.paneLayoutColumns !== 0
      && savedControlLayout.placements.length === layerPanes.length
      && layerPanes.every(pane => savedControlLayout.placements.some(placement => placement.paneId === pane.id))
      ? savedControlLayout : null;
    const layerFullscreenLayout = layerRoom?.paneLayoutColumns === 0;
    const layerShellVisiblePaneIds = new Set(
      shellVisiblePaneIds(layerPanes, layerSelectedPaneId, shellMode, layerFullscreenLayout)
    );
    const layerShellVisiblePanes = layerVisiblePanes.filter((pane) =>
      layerShellVisiblePaneIds.has(pane.id)
    );
    const layerActivePane =
      layerShellVisiblePanes.find((pane) => pane.id === layerSelectedPaneId) ??
      layerShellVisiblePanes[0] ??
      null;
    const layerDensity = isActive ? paneDensity : paneDensityFor(shellMode, layerVisiblePanes.length);
    const layerColumnCount = isActive
      ? paneGridColumnCount
      : resolvePaneGridColumnCount({
          shellMode,
          paneDensity: layerDensity,
          containerWidth: paneGridWidth,
          rootRemSize,
          paneLayoutColumns: layerRoom?.paneLayoutColumns ?? null,
          visiblePaneCount: layerVisiblePanes.length,
          forceTabletTwoColumns: uiTheme !== "classic"
        });
    const layerPlacements = isActive
      ? paneGridPlacements
      : resolvePaneGridPlacements(layerVisiblePanes, layerColumnCount, new Map());
    const layerLatestTurnByPane = new Map<string, Turn>();
    for (const turn of layerTurns) {
      if (turn.paneId && !layerLatestTurnByPane.has(turn.paneId)) layerLatestTurnByPane.set(turn.paneId, turn);
    }
    const layerLatestCompletionByPane = new Map<string, SpaceEvent>();
    for (const event of layerEvents) {
      if (event.type === "TURN_COMPLETED" && event.paneId && !layerLatestCompletionByPane.has(event.paneId)) {
        layerLatestCompletionByPane.set(event.paneId, event);
      }
    }
    const layerAgentNumberByPaneId = new Map(layerPanes.map((pane, index) => [pane.id, index + 1]));
    const bootstrappedPaneIds = new Set(cached?.bootstrappedPaneIds ?? []);
    const prefillReadyPaneIds = new Set(cached?.prefillReadyPaneIds ?? []);
    const layerTerminalPrefillReady = layerRenderPanes
      .filter((pane) => pane.mode === "TERMINAL" && !pane.isMinimized)
      .every((pane) => prefillReadyPaneIds.has(pane.id));
    const unorderedTerminalBootstrapPaneIds = layerRenderPanes
      .filter((pane) => pane.mode === "TERMINAL" && !pane.isMinimized && !pane.id.startsWith("pane:optimistic-"))
      .map((pane) => pane.id);
    const priorityTerminalPaneId = layerActivePane?.mode === "TERMINAL" && !layerActivePane.id.startsWith("pane:optimistic-")
      ? layerActivePane.id
      : null;
    const terminalBootstrapPaneIds = priorityTerminalPaneId
      ? [
          priorityTerminalPaneId,
          ...unorderedTerminalBootstrapPaneIds.filter((paneId) => paneId !== priorityTerminalPaneId)
        ]
      : unorderedTerminalBootstrapPaneIds;
    const layerVisiblePaneCount = (shellMode === "mobile" || layerFullscreenLayout) && layerActivePane ? 1 : layerVisiblePanes.length;
    const layerHasMaximizedPane = shellMode !== "mobile" && layerVisiblePanes.some((pane) => pane.isMaximized);
    const layerHeight = (layerRoom?.paneLayoutHeight ?? 1) as 1 | 2 | 3 | 4;
    const {
      naturalRows: layerNaturalRows,
      naturalEmptySlots: layerNaturalEmptySlots,
      actualBaseRows: layerCalculatedBaseRows
    } = calculatePaneGridBaseRows({
      placements: layerPlacements,
      visiblePaneCount: layerVisiblePanes.length,
      columnCount: layerColumnCount,
      targetEmptySlots: roomExtraEmptySlots[roomId]
    });
    const layerActualBaseRows = layerFullscreenLayout ? 1 : layerCalculatedBaseRows;
    const layerExplicitHeight =
      shellMode !== "mobile" &&
      !layerHasMaximizedPane &&
      !layerFullscreenLayout &&
      layerVisiblePanes.length > 0;
    const layerGridGapPx = layerDensity === "dense" || layerDensity === "tight" ? 9.6 : 12;
    const layerEffectiveContainerHeight =
      paneGridHeight > 0
        ? paneGridHeight
        : typeof window !== "undefined" && window.innerHeight > 0
          ? Math.max(window.innerHeight - 120, 480)
          : 600;
    const minPaneRowPx = 320;
    const maxFittingRows = Math.max(
      1,
      Math.floor((layerEffectiveContainerHeight + layerGridGapPx) / (minPaneRowPx + layerGridGapPx))
    );
    const viewportRows = Math.max(1, Math.min(layerActualBaseRows, maxFittingRows));
    const layerBaselineRowPx = Math.max(
      Math.round((layerEffectiveContainerHeight - (viewportRows - 1) * layerGridGapPx) / viewportRows),
      minPaneRowPx
    );
    const layerRowPx = layerExplicitHeight ? Math.round(layerBaselineRowPx * layerHeight) : 0;

    const staticEmptyGridSlots: { rowIndex: number; columnStart: number }[] = [];
    if (shellMode !== "mobile" && (layerColumnCount > 1 || layerActualBaseRows > 1) && !layerHasMaximizedPane && layerVisiblePanes.length > 0) {
      const occupied = Array.from({ length: layerActualBaseRows }, () => Array(layerColumnCount).fill(false));
      for (const pane of layerVisiblePanes) {
        const placement = layerPlacements.get(pane.id);
        if (!placement) continue;
        for (let c = 0; c < placement.effectiveSpan; c++) {
          const colIdx = placement.columnStart - 1 + c;
          const rowArr = occupied[placement.rowIndex];
          if (rowArr && colIdx < layerColumnCount) {
            rowArr[colIdx] = true;
          }
        }
      }
      for (let r = 0; r < layerActualBaseRows; r++) {
        for (let c = 0; c < layerColumnCount; c++) {
          if (!occupied[r]?.[c]) {
            staticEmptyGridSlots.push({ rowIndex: r, columnStart: c + 1 });
          }
        }
      }
    }

    const emptyGridSlots: { rowIndex: number; columnStart: number; precedingPaneId: string | null }[] = [];
    if (draggedPaneId && shellMode !== "mobile" && (layerColumnCount > 1 || layerActualBaseRows > 1) && !layerHasMaximizedPane && layerVisiblePanes.length > 0) {
      const occupied = Array.from({ length: layerActualBaseRows }, () => Array(layerColumnCount).fill(false));
      for (const pane of layerVisiblePanes) {
        if (pane.id === draggedPaneId) continue;
        const placement = layerPlacements.get(pane.id);
        if (!placement) continue;
        for (let c = 0; c < placement.effectiveSpan; c++) {
          const colIdx = placement.columnStart - 1 + c;
          const rowArr = occupied[placement.rowIndex];
          if (rowArr && colIdx < layerColumnCount) {
            rowArr[colIdx] = true;
          }
        }
      }
      for (let r = 0; r < layerActualBaseRows; r++) {
        for (let c = 0; c < layerColumnCount; c++) {
          if (!occupied[r]?.[c]) {
            let precedingPaneId: string | null = null;
            let maxPos = -1;
            for (const pane of layerVisiblePanes) {
              if (pane.id === draggedPaneId) continue;
              const pl = layerPlacements.get(pane.id);
              if (!pl) continue;
              const pos = pl.rowIndex * layerColumnCount + (pl.columnStart - 1);
              const currentSlotPos = r * layerColumnCount + c;
              if (pos < currentSlotPos && pos > maxPos) {
                maxPos = pos;
                precedingPaneId = pane.id;
              }
            }
            emptyGridSlots.push({ rowIndex: r, columnStart: c + 1, precedingPaneId });
          }
        }
      }
    }

    return (
      <div
        key={roomId}
        className="room-runtime-layer"
        data-room-runtime-id={roomId}
        data-presentation-state={presentationState}
        data-reveal-state={isActive && preparingRoomId === roomId ? "preparing" : "ready"}
        data-warm-room-admission-state={
          isActive
            ? "active"
            : roomId === preparingRoomId
              ? "preparing"
              : roomId === displayedRoomId
                ? "displayed"
                : "warm"
        }
        data-warm-room-recency-rank={warmRecencyRank >= 0 ? warmRecencyRank + 1 : undefined}
        data-terminal-prefill-ready={layerTerminalPrefillReady ? "true" : "false"}
        aria-hidden={!isInteractive}
        inert={isInteractive ? undefined : true}
      >
        {layerPanes.length === 0 && layerPaneLoadState === "loading" ? (
          <div className="empty-state" role={isInteractive ? "status" : undefined}>
            <Loader2 aria-hidden="true" />
            <h3>Loading panes</h3>
          </div>
        ) : layerPanes.length === 0 && layerPaneLoadState === "error" ? (
          <div className="empty-state" role={isInteractive ? "alert" : undefined}>
            <Grid2X2 aria-hidden="true" />
            <h3>Unable to load panes</h3>
          </div>
        ) : layerPanes.length === 0 ? (
          <div
            className="empty-state room-empty-state"
            role={isInteractive ? "region" : undefined}
            aria-label={isInteractive ? "Empty room quick start" : undefined}
          >
            <Grid2X2 aria-hidden="true" />
            <h3>Start your workspace</h3>
            <p>Choose a pane to begin working in this room.</p>
            <div className="empty-state-actions" aria-label="Quick start" aria-busy={paneCreationPendingMode !== null}>
              <button
                onClick={() => void addPane("TERMINAL")}
                disabled={!isInteractive || !selectedRoomId || paneCreationPendingMode !== null || cliPaneCreationPending}
              >
                {paneCreationPendingMode === "TERMINAL" ? <Loader2 className="spin" aria-hidden="true" /> : <Terminal aria-hidden="true" />}
                {paneCreationPendingMode === "TERMINAL" ? "Opening CLI…" : "Open CLI"}
              </button>
              <button
                onClick={() => void addPane("CHAT")}
                disabled={!isInteractive || !selectedRoomId || paneCreationPendingMode !== null || cliPaneCreationPending}
              >
                {paneCreationPendingMode === "CHAT" ? <Loader2 className="spin" aria-hidden="true" /> : <MessageSquare aria-hidden="true" />}
                {paneCreationPendingMode === "CHAT" ? "Opening Chat…" : "Open Chat"}
              </button>
              <button
                onClick={() => void addPane("BROWSER")}
                disabled={!isInteractive || !selectedRoomId || paneCreationPendingMode !== null || cliPaneCreationPending}
              >
                {paneCreationPendingMode === "BROWSER" ? <Loader2 className="spin" aria-hidden="true" /> : <Eye aria-hidden="true" />}
                {paneCreationPendingMode === "BROWSER" ? "Opening Browser…" : "Open Browser"}
              </button>
            </div>
          </div>
        ) : layerRenderPanes.length === 0 ? (
          <div className="empty-state" role={isInteractive ? "status" : undefined}>
            <Palette aria-hidden="true" />
            <h3>No panes match this color</h3>
          </div>
        ) : (
          <TerminalBootstrapBoundary paneIds={terminalBootstrapPaneIds}>
            {(terminalBootstrapBarriers) => (
              <div
                ref={isActive ? paneGridRef : undefined}
                className={layerHasMaximizedPane ? "pane-grid maximized" : "pane-grid"}
                data-density={layerDensity}
                data-shell-mode={shellMode}
                data-pane-count={layerRenderPanes.length}
                data-visible-pane-count={layerVisiblePaneCount}
                data-column-count={layerColumnCount}
                data-pane-layout-columns={layerRoom?.paneLayoutColumns ?? "automatic"}
                data-pane-layout-height={layerRoom?.paneLayoutHeight ?? 1}
                data-fullscreen-layout={layerFullscreenLayout ? "true" : undefined}
                style={{
                  gridTemplateColumns: layerFullscreenLayout
                    ? "minmax(0, 1fr)"
                    : `repeat(${layerColumnCount}, minmax(0, 1fr))`,
                  ...(shellMode !== "mobile" && layerControlLayout ? {position:"relative",display:"block",minHeight:`${Math.max(30,...layerControlLayout.placements.map(p=>p.y+p.height))*12}px`} : {}),
                  ...(shellMode !== "mobile" && layerExplicitHeight && layerRowPx > 0
                    ? {
                        gridTemplateRows: `repeat(${layerActualBaseRows}, ${layerRowPx}px)`,
                        gridAutoRows: `${layerRowPx}px`
                      }
                    : {
                        gridTemplateRows: shellMode === "mobile" || layerFullscreenLayout
                          ? "minmax(0, 1fr)"
                          : `repeat(${layerActualBaseRows}, minmax(20rem, 1fr))`
                      })
                }}
              >
                {layerRenderPanes.map((pane) => {
                  const latestCompletion = layerLatestCompletionByPane.get(pane.id) ?? null;
                  const placement = layerPlacements.get(pane.id);
                  return (
                    <PaneCard
                      key={pane.id}
                      roomProjectPath={layerRoom?.projectPath}
                      controlPlacement={shellMode !== "mobile" && !pane.isMinimized ? layerControlLayout?.placements.find(p=>p.paneId===pane.id) : undefined}
                      pane={shellMode === "mobile" && pane.isMinimized ? { ...pane, isMinimized: false } : pane}
                      agentNumber={layerAgentNumberByPaneId.get(pane.id) ?? 1}
                      latestTurn={layerLatestTurnByPane.get(pane.id) ?? null}
                      latestCompletion={latestCompletion}
                      hasPendingCompletion={Boolean(
                        pendingPaneCompletionEventId(paneCompletionLifecycle, pane.id)
                      )}
                      isLifecycleRunning={paneCompletionLifecycle.panes[pane.id]?.activeRunKey != null}
                      isTarget={isPresented && layerActivePane?.id === pane.id}
                      isMoveDialogOpen={isInteractive && paneMoveDialog?.pane.id === pane.id}
                      isVisibleInShell={isPresented && (layerShellVisiblePaneIds.has(pane.id) || floatingYouTubePaneIds.has(pane.id))}
                      isFloatingYouTube={pane.mode === "YOUTUBE" && floatingYouTubePaneIds.has(pane.id)}
                      onToggleYouTubeFloating={pane.mode === "YOUTUBE" ? () => toggleYouTubeFloating(pane.id) : undefined}
                      maskSensitiveData={maskSensitiveData}
                      isTerminalOutputVisible={
                        acceptsTerminalOutput &&
                        layerShellVisiblePaneIds.has(pane.id)
                      }
                      isMobilePaneFocused={isInteractive && isMobilePaneFocused}
                      oskOpen={isOskKeyboardOpen}
                      browserObserverOnly={auth?.user?.automationScope === "APP_DIAGNOSTICS"}
                      terminalObserverOnly={auth?.user?.automationScope === "APP_DIAGNOSTICS"}
                      uiTheme={uiTheme}
                      shellMode={shellMode}
                      codexTurnsEnabled={codexTurnsEnabled}
                      codexEnvironment={paneCodexEnvironment}
                      cliRuntimeSettings={pane.mode === "HARNESS" ? cliRuntimeSettings : null}
                      runtimeBlockedReason={paneRuntimeBlockedReason(pane, cliRuntimeSettings)}
                      addPaneBlockedReason={layerAddPaneBlockedReason}
                      canMoveToAnotherRoom={rooms.some((room) => room.id !== pane.roomId)}
                      draggedPaneId={draggedPaneId === pane.id ? draggedPaneId : null}
                      dragOverPaneId={paneDragOverId === pane.id ? paneDragOverId : null}
                      dragOverPosition={paneDragOverId === pane.id ? paneDragOverPosition : undefined}
                      paneReorderPending={paneReorderPending}
                      onPaneDragStart={paneCardOnDragStart}
                      onPaneDragEnd={paneCardOnDragEnd}
                      onPaneDragOver={paneCardOnDragOver}
                      onPaneDragLeave={paneCardOnDragLeave}
                      onPaneDrop={paneCardOnDrop}
                      onTarget={paneCardOnTarget}
                      onMove={paneCardOnMove}
                      onPaneUpdated={paneCardOnPaneUpdated}
                      onOpenExistingPane={paneCardOnOpenExisting}
                      onClose={paneCardOnClose}
                      onMaximize={paneCardOnMaximize}
                      onMinimize={paneCardOnMinimize}
                      onMobilePaneFocusChange={paneCardOnMobilePaneFocusChange}
                      onGrowColumnSpan={paneCardOnGrowColumnSpan}
                      onResetColumnSpan={paneCardOnResetColumnSpan}
                      onToggleColumnSpan={paneCardOnToggleColumnSpan}
                      onSplit={paneCardOnSplit}
                      isFullscreenLayout={layerFullscreenLayout}
                      fullscreenIndex={Math.max(0, layerVisiblePanes.findIndex((candidate) => candidate.id === pane.id))}
                      fullscreenCount={layerVisiblePanes.length}
                      onFullscreenNavigate={paneCardOnFullscreenNavigate}
                      onRestoreLayout={paneCardOnRestoreLayout}
                      effectiveColumnSpan={placement?.effectiveSpan ?? 1}
                      rowSpan={1}
                      columnStart={placement?.columnStart ?? 1}
                      rowIndex={placement?.rowIndex ?? 0}
                      canGrowColumnSpan={placement?.canGrow ?? false}
                      canResetColumnSpan={placement?.canReset ?? false}
                      terminalFontSize={terminalFontSize}
                      hideCliFloats={cliFloatsHidden}
                      showSessionDebugIds={showSessionDebugIds}
                      cliDebugModeEnabled={cliDebugModeEnabled}
                      onCliDebugModeChange={setCliDebugModeEnabled}
                      cliMemorySaveModelId={cliMemorySaveModelId}
                      cliImagePreviewLimit={cliImagePreviewLimit}
                      terminalBootstrapBarrier={terminalBootstrapBarriers.get(pane.id)}
                      shouldBootstrapTerminal={
                        !pane.id.startsWith("pane:optimistic-") &&
                        (!pane.isMinimized || bootstrappedPaneIds.has(pane.id) || (shellMode === "mobile" && layerShellVisiblePaneIds.has(pane.id)))
                      }
                      prefillInitialReplay={presentationState === "hidden" && !pane.isMinimized}
                      shouldLoadHarness={shouldLoadHarnessPane(presentationState, layerTerminalPrefillReady)}
                      // Only the selected room can acknowledge this reveal.
                      // Keep unrelated resident panes memoized across switches;
                      // recordTerminalRevealReady still rejects stale rooms.
                      revealGeneration={isActive ? roomPresentationGenerationRef.current : 0}
                      onTerminalBootstrapped={paneCardOnTerminalBootstrapped}
                      onTerminalPrefillReadyChange={paneCardOnTerminalPrefillReadyChange}
                      onTerminalRevealReady={paneCardOnTerminalRevealReady}
                    />
                  );
                })}
                {!draggedPaneId && staticEmptyGridSlots.map((slot) => (
                  <div
                    key={`static-empty-${slot.rowIndex}-${slot.columnStart}`}
                    className="pane-grid-empty-slot"
                    style={{
                      gridRow: slot.rowIndex + 1,
                      gridColumn: slot.columnStart
                    }}
                    aria-hidden="true"
                  />
                ))}
                {emptyGridSlots.map((slot) => {
                  const slotKey = `slot-${slot.rowIndex}-${slot.columnStart}`;
                  const isHovered = dragOverSlotKey === slotKey;
                  return (
                    <div
                      key={slotKey}
                      className={`pane-grid-drop-slot${isHovered ? " is-hovered" : ""}`}
                      style={{
                        gridRow: slot.rowIndex + 1,
                        gridColumn: slot.columnStart
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (event.dataTransfer) {
                          event.dataTransfer.dropEffect = "move";
                        }
                        setDragOverSlotKey(slotKey);
                      }}
                      onDragLeave={() => {
                        if (dragOverSlotKey === slotKey) {
                          setDragOverSlotKey(null);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const fallbackPane = layerVisiblePanes.find((candidate) => candidate.id !== draggedPaneId);
                        if (slot.precedingPaneId) {
                          void handlePaneDrop(slot.precedingPaneId, "after", slot.columnStart, slot.rowIndex);
                        } else if (fallbackPane) {
                          void handlePaneDrop(fallbackPane.id, "before", slot.columnStart, slot.rowIndex);
                        } else if (draggedPaneId) {
                          void handlePaneDrop(draggedPaneId, "after", slot.columnStart, slot.rowIndex);
                        }
                      }}
                    >
                      <div className="pane-grid-drop-slot-indicator">
                        <MoveHorizontal aria-hidden="true" />
                        <span>Drop pane here</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TerminalBootstrapBoundary>
        )}
      </div>
    );
  }

  async function reopenPane(roomId: string, paneId: string) {
    try {
      const pane = await api.updatePane(paneId, { isClosed: false, isMinimized: false, status: "IDLE" });
      if (selectedRoomIdRef.current === roomId) {
        setPanes((current) => [...current.filter((candidate) => candidate.id !== pane.id), pane]);
        setSelectedPaneId(pane.id);
        setIsMobilePaneFocusMode(false);
        await refreshRoomEvents(roomId);
      } else {
        await selectRoom(roomId);
        setSelectedPaneId(pane.id);
        setIsMobilePaneFocusMode(false);
      }
      refreshToolbarSystemState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen window");
    }
  }

  async function reopenAllDetachedPanes() {
    try {
      const analytics = await api.systemAnalyticsCliSessions("10m").catch(() => null);
      const detached = analytics?.sessions.filter((s) => s.status === "RUNNING" && s.attachmentCount === 0) ?? [];
      if (detached.length === 0) return;
      const reopenedRoomIds = new Set<string>();
      for (const session of detached) {
        await api.updatePane(session.paneId, { isClosed: false, isMinimized: false, status: "IDLE" }).catch(() => null);
        reopenedRoomIds.add(session.roomId);
      }
      const currentRoomId = selectedRoomIdRef.current;
      if (currentRoomId && reopenedRoomIds.has(currentRoomId)) {
        await loadRoomRuntime(currentRoomId);
        await refreshRoomEvents(currentRoomId);
      } else if (detached[0]?.roomId) {
        await selectRoom(detached[0].roomId);
      }
      refreshToolbarSystemState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen detached windows");
    }
  }

  async function closeDetachedPane(paneId: string) {
    try {
      await api.closePane(paneId);
      setPanes((current) => current.filter((pane) => pane.id !== paneId));
      refreshToolbarSystemState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close window");
    }
  }

  const showResourceIndicatorRail = (resourceIndicatorsVisible || (Boolean(showMinimizedBarToggle) && auth?.user?.role === "ADMIN")) && (isRoomToolbarHidden || isMobilePaneFocused);
  const renderToolbarMetrics = (hideTrigger = true) => (
    <ToolbarMetrics
      hideTrigger={hideTrigger}
      ref={toolbarMetricsRef}
      presentation="drawer"
      onOpenResources={auth?.user?.role === "ADMIN" ? () => openSystemResources() : undefined}
      allowChanges={shellMode !== "desktop" || isAdminMode}
      canManage={auth?.user?.role === "ADMIN"}
      environment={codexEnvironmentSummary}
      roomName={presentationRoom?.name}
      roomId={presentationRoom?.id}
      onOpenAnalytics={(tab) => {
        setIsMemoryWorkspaceOpen(false);
        setSystemAnalyticsTab(tab);
      }}
      onChanged={refreshToolbarSystemState}
      onReopenPane={reopenPane}
      onReopenAllDetached={reopenAllDetachedPanes}
      onCloseSession={closeDetachedPane}
    />
  );

  const setupConnectionsContent = auth?.user?.role === "ADMIN" ? (
              <SettingsSections>
                <SettingsDisclosure title="GitHub & Gitea" description="Connect repositories for publishing." scope="Installation" icon={GitBranch}>
                  <RecoverableSurface fallback={settingsCardLoadingFallback}><LazySourceControlPublishingCard canManage /></RecoverableSurface>
                </SettingsDisclosure>
                <SettingsDisclosure title="Telegram notifications" description="Get updates in Telegram." scope="Installation" icon={Bell}>
                  <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyTelegramIntegrationCard canManage isCodexEnabled={isCodexEnabled} /></RecoverableSurface>
                </SettingsDisclosure>
                <SettingsDisclosure title="Codex CLI defaults" description="Set defaults for future CLI sessions." scope="New sessions" icon={Terminal}>
                  <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyCodexCliDefaultsCard client={api} isCodexEnabled={isCodexEnabled} /></RecoverableSurface>
                </SettingsDisclosure>
              </SettingsSections>
            ) : undefined;

  function renderManageGroupIntro(group: string, open: (id: string) => void) {
    if (group !== "maintenance") return null;
    return <RecoverableSurface fallback={<p role="status">Loading maintenance…</p>}><LazyMaintenanceHub onOpenTool={open} /></RecoverableSurface>;
  }

  function renderWorkspaceManageAction(id: string, back: () => void, navigate: (id: string) => void = openManage, inline = false) {
              if (id === "setup-connections" && inline) return <WorkspacePortalMount onTargetChange={setWorkspaceSetupHost} onBack={back} onBackRef={workspaceSetupBack} />;
              if (id === "space-cli-maintenance" || id === "cli-update-all" || id === "publish-space-release")
                return <LazyAdminOperationsDialog embedded initialTool={id === "publish-space-release" ? "release" : id === "cli-update-all" ? "update-all" : "maintenance"} onClose={back} />;
              if (id === "codex-lb-speed-control" || id === "cli-session-cleanup" || id === "codex-history-purge")
                return <LazyAdminCodexToolsDialog embedded initialTool={id === "codex-lb-speed-control" ? "speed" : id === "cli-session-cleanup" ? "cleanup" : "history"} isCodexEnabled={isCodexEnabled} anyCliEnabled={anyCliEnabled} onClose={back} />;
              if (id === "system-services") return <LazySystemServicesDialog embedded onClose={back} />;
              if (id === "user-management") return <LazyUserManagementDialog embedded currentUserId={auth?.user?.id} onClose={back} />;
              if (id === "space-gateway") return <LazySpaceGatewayDialog embedded onClose={back} />;
              if (id === "setup-connections") return <LazySetupConnectionsWizard embedded open onOpenMaintenance={() => navigate("space-cli-maintenance")} connectionsContent={setupConnectionsContent} checks={api} finish={api.finishSetup} loadOverview={api.setupOverview} openLogin={async connection => {
                  manageLoginPendingRef.current = true; setManageLoginPending(true);
                  try { await openSetupConnectionLogin(connection); }
                  catch (error) { manageLoginPendingRef.current = false; setManageLoginPending(false); throw error; }
                }} onOpenChange={open => {
                  if (open) { manageLoginPendingRef.current = false; setIsServerActionsMenuOpen(true); setManageLoginPending(false); }
                  else if (manageLoginPendingRef.current) setIsServerActionsMenuOpen(false);
                  else back();
                }} />;
              return null;
  }

  function renderWorkspaceAction(id: string, { onBack, onNavigate, triggerRef }: {
    onBack: () => void; onNavigate: (id: string) => void; triggerRef: RefObject<HTMLButtonElement | null>;
  }) {
    let content;
    if (id === "vibe-music") return <WorkspacePortalMount onTargetChange={setWorkspaceMusicHost} onBack={onBack} onBackRef={workspaceMusicBack} />;
    if (id === "osk-keyboard") return <WorkspacePortalMount onTargetChange={setWorkspaceKeyboardHost} onBack={onBack} onBackRef={workspaceKeyboardBack} />;
    if (id === "workspace-room") {
      content = <WorkspaceRoomSettings actions={workspaceNavigationActions} detailActionIds={workspaceDetailActionIds} onNavigate={onNavigate} />;
    } else if (id === "resources" || id === "system-resources" || id === "surface-health") {
      content = <SystemHealth userId={auth?.user?.id ?? ""} railVisible={false} environment={codexEnvironmentSummary}
        allowChanges={isAdminMode} onClose={onBack} onReopenPane={reopenPane} onReopenAllDetached={reopenAllDetachedPanes}
        onCloseSession={closeDetachedPane} />;
    } else if (id.startsWith("surface-")) {
      const surface = id.slice(8) as SideSurface;
      content = <section className="workspace-dock-detail" aria-label={sideSurfaceMeta[surface].surfaceLabel}>
        {renderSideSurfaceContent(surface, onBack, onNavigate)}
      </section>;
    } else if (id === "advanced-settings") {
      content = renderSideSurfaceContent("settings", onBack, onNavigate);
    } else if (id === "pane-layout" && activeRoom) {
      content = <LazyPaneLayoutMenu automaticColumns={layoutAutomaticPaneGridColumnCount}
        currentColumns={activeRoom.paneLayoutColumns ?? null} currentHeight={activeRoom.paneLayoutHeight ?? 1}
        emptySlots={activeRoomEmptySlotsMetrics ?? undefined} error={paneLayoutError}
        maximumColumns={shellMode === "mobile" ? 1 : shellMode === "tablet" ? 2 : 4}
        onClose={onBack} onSelect={columns => void applyPaneLayoutPreset(columns, undefined, true)}
        onSelectHeight={height => void applyPaneLayoutPreset(undefined, height, true)} pending={paneLayoutPending}
        triggerRef={triggerRef} visiblePaneCount={effectiveLayoutPaneCount} />;
    } else if (id === "pane-span-all") {
      content = <LazyPaneSpanAllMenu activeColumnCount={paneGridColumnCount}
        currentSpan={commonPaneColumnSpan(visiblePanes)} error={paneSpanAllError} onClose={onBack}
        onSelect={span => void applyPaneSpanToAll(span)} pending={paneSpanAllPending} triggerRef={triggerRef}
        visiblePaneCount={visiblePanes.length} />;
    } else if (id === "rename-room" && activeRoom) {
      content = <form className="workspace-room-rename" onSubmit={event => void submitRoomRename(event, onBack)} aria-busy={roomRenamePending}>
        <label>Room name<input aria-label="Room name" value={roomNameDraft} disabled={roomRenamePending}
          onChange={event => setRoomNameDraft(event.target.value)} required /></label>
        {roomRenameError ? <p role="alert">{roomRenameError}</p> : null}
        <button type="submit" disabled={roomRenamePending}>Save room name</button>
      </form>;
    } else if (id === "font-down") {
      content = <div className="workspace-text-size-page"><p>Text size across your workspace</p>
        <WorkspaceTextSizePicker anchorRef={triggerRef} open value={terminalFontSize} onChange={setTerminalFontSize} onClose={onBack} />
        <p className="workspace-text-preview" style={{ fontSize: terminalFontSize }}>The quick brown fox jumps over the lazy dog. 0123456789</p></div>;
    } else if (id === "theme") {
      content = <RoomThemeMenu currentTheme={roomTheme} mobile={false} onClose={onBack} onSelect={setRoomTheme} triggerRef={triggerRef} />;
    } else if (["server-restart", "setup-connections", "system-services"].includes(id)) {
      content = <LazyServerActionsMenu actions={serverActionCommands} mobile={false} onClose={onBack} triggerRef={triggerRef}
        initialAction={id === "server-restart" ? null : id} renderAction={(actionId, back, navigate) => renderWorkspaceManageAction(actionId, back, navigate, true)}
        renderGroupIntro={renderManageGroupIntro} />;
    } else if (["space-cli-maintenance", "cli-update-all", "publish-space-release", "codex-lb-speed-control", "cli-session-cleanup", "codex-history-purge", "user-management", "space-gateway"].includes(id)) {
      content = renderWorkspaceManageAction(id, onBack, onNavigate, true);
    } else if (id === "memory-workspace") {
      content = <MemoryWorkspaceErrorBoundary onClose={onBack}><LazyMemoryWorkspace shellMode={shellMode}
        activeRoomId={activeRoom?.id ?? null} onClose={onBack} /></MemoryWorkspaceErrorBoundary>;
    } else if (id === "system-analytics" || id === "token-usage") {
      content = <LazySystemAnalyticsWorkspace shellMode={shellMode} initialTab={id === "token-usage" ? "models" : "overview"} onClose={onBack} />;
    } else if (id === "help") {
      content = <LazyHelpPage onBack={onBack} />;
    } else if (id === "benchmark") {
      content = <LazyBenchmarkPage onBack={onBack} />;
    } else if (id === "room-toolbar") {
      content = <div className="workspace-rail-settings" role="group" aria-label="Room toolbar icons">
        {DEFAULT_LOWER_RAIL_ITEMS.map(item => (
          <SpaceToggle
            key={item.id}
            name={`rail-item-${item.id}`}
            label={item.label}
            checked={lowerRailVisibility.isVisible(item.id)}
            disabled={item.hideable === false}
            onChange={(checked) => checked ? lowerRailVisibility.show(item.id) : lowerRailVisibility.hide(item.id)}
          />
        ))}
      </div>;
    } else if (id === "desktop-displays") {
      content = <DesktopDisplayControls activeRoomId={activeRoom?.id} activePaneId={activePane?.id} />;
    } else if (id === "demo-mode") {
      content = <LazyDemoModeOverlay isOpen onClose={onBack} onActionPreview={onNavigate} />;
    } else if (id === "link-preview" && workspaceUserLink) {
      content = <LazyEmbeddedDashboardDialog link={workspaceUserLink} onClose={() => { setWorkspaceUserLink(null); onBack(); }} />;
    } else if (id === "quick-links") {
      content = renderSideSurfaceContent("links", onBack, onNavigate);
    } else if (id === "sticky-note") {
      content = <StickyNoteWindow key={workspaceStickyItem?.id ?? "new"} id="workspace-sticky-note"
        initialText={workspaceStickyItem?.text} itemId={workspaceStickyItem?.id}
        onClose={() => { setWorkspaceStickyItem(null); onBack(); }} />;
    } else if (id === "clip-tool" || id === "snip-tool") {
      content = <LazySnipToolOverlay isOpen onClose={onBack} roomId={activeRoom?.id} isMobile={shellMode === "mobile"}
        activePaneId={activePane && !activePane.isMinimized ? activePane.id : null}
        activePaneTitle={activePane ? displayPaneTitle(activePane) : null}
        activePaneMode={activePane?.mode ?? null}
        activePaneName={activePane?.paneName ?? null}
        availablePanes={targetablePanes.map(p => ({
          id: p.id,
          title: displayPaneTitle(p),
          mode: p.mode,
          paneName: p.paneName ?? null
        }))} onCapture={handleSnipCapture} />;
    } else if (id === "agents-dashboard") {
      content = <LazyAgentsDashboard userId={auth?.user?.id} open rooms={rooms} completions={paneCompletionLifecycle.panes}
        activePanes={panes} onOpenPane={paneCardOnOpenExisting} onClose={onBack}
        currentRoomId={activeRoom?.id ?? selectedRoomId ?? null} selectedPaneId={selectedPaneId} />;
    } else if (id === "add-chat") {
      content = <LazyChatLauncherMenu mobile={false} onClose={onBack} onSelectChat={() => void addPane("CHAT")}
        onSelectHarness={() => void addHarnessPane()} onSelectLive={() => void addLivePane()} triggerRef={triggerRef}
        chatDisabled={!isCodexEnabled || panes.length >= 16} harnessDisabled={panes.length >= 16}
        chatHidden={isPaneHidden("chat")}
        harnessHidden={!isHarnessEnabled || isPaneHidden("harness")}
        liveDisabled={isPaneHidden("live") || panes.length >= 16}
        liveHidden={isPaneHidden("live")} />;
    } else if (id === "add-cli" || id === "create") {
      content = <LazyCliLauncherMenu embedded query="" mobile={false} refreshOnOpen atPaneCap={panes.length >= 16}
        availablePanes={Math.max(0, 16 - panes.length)}
        isCodexEnabled={isCodexEnabled} onClose={onBack} onCreate={addCliRuntimePane} onLogin={openCliRuntimeLogin}
        onOpenSettings={() => onNavigate("surface-settings")} triggerRef={triggerRef} />;
    }
    return <RecoverableSurface resetKey={id} fallback={sideSurfaceLoadingFallback}>{content}</RecoverableSurface>;
  }

  function renderCollapsedToolbar() {
    if (isMobilePaneFocused || !isRoomToolbarHidden || showOverlaySideSurface || systemAnalyticsTab) {
      return null;
    }
    return (
      <div
        ref={collapsedToolbarRef}
        className="room-toolbar-collapsed room-toolbar-floating-controls"
        role="region"
        aria-label="Room toolbar hidden"
        {...lowerRailTouchContext}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsCollapsedPaneLayoutMenuOpen(false);
          setIsPaneSpanAllMenuOpen(false);
          setIsWorkspaceTextSizePickerOpen(false);
          setIsVibeMusicOpen(false);
          setLowerRailVisibilityMenu((current) => current ? null : { x: event.clientX, y: event.clientY });
        }}
      >
        {previousRoom && lowerRailVisibility.isVisible("previous") ? (
          <button
            type="button"
            className="room-toolbar-visibility-button room-rail-secondary"
            title={`Previous room: ${previousRoom.name}`}
            data-rail-id="previous"
            aria-label="Previous room"
            onClick={() => { void selectRoom(previousRoom.id); }}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
        ) : null}
        {nextRoom && lowerRailVisibility.isVisible("next") ? (
          <button
            type="button"
            className="room-toolbar-visibility-button room-rail-secondary"
            title={`Next room: ${nextRoom.name}`}
            data-rail-id="next"
            aria-label="Next room"
            onClick={() => { void selectRoom(nextRoom.id); }}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        ) : null}
        {lowerRailVisibility.isVisible("rooms") ? (
          <button
            type="button"
            className={`room-toolbar-visibility-button${isSideSurfaceOpen && activeSideSurface === "rooms" ? " is-active" : ""}`}
            title={sideSurfaceToggleLabel("rooms")}
            data-rail-id="rooms"
            aria-label={sideSurfaceToggleLabel("rooms")}
            aria-pressed={isSideSurfaceOpen && activeSideSurface === "rooms"}
            onClick={() => {
              setIsThemeMenuOpen(false);
              setIsPaneLayoutMenuOpen(false);
              setIsCollapsedPaneLayoutMenuOpen(false);
              setIsPaneSpanAllMenuOpen(false);
              setIsWorkspaceTextSizePickerOpen(false);
              setIsVibeMusicOpen(false);
              setLowerRailVisibilityMenu(null);
              toggleSideSurface("rooms");
            }}
          >
            <PanelLeft aria-hidden="true" />
          </button>
        ) : null}
        {lowerRailVisibility.isVisible("live-model") ? (
          <button
            type="button"
            className={`room-toolbar-visibility-button room-live-rail-button ${
              isLiveRailGraphicDisabled ? "is-graphic-disabled" : ""
            } ${
              liveRailStatus === "active" || liveRailStatus === "listening" || liveRailStatus === "thinking" || liveRailStatus === "speaking" ? "is-connected" : ""
            } ${liveRailStatus === "listening" ? "is-listening is-user-speaking" : ""} ${
              liveRailStatus === "speaking" ? "is-speaking is-agent-speaking" : ""
            } ${liveRailStatus === "connecting" ? "is-connecting" : ""}`}
            title={
              liveRailStatus === "listening"
                ? "User speaking..."
                : liveRailStatus === "speaking"
                ? "Agent speaking..."
                : liveRailStatus === "active"
                ? "Live voice active (Listening)"
                : liveRailStatus === "connecting"
                ? "Connecting Live voice model..."
                : liveRailStatus === "thinking"
                ? "Live voice is thinking..."
                : liveRailStatus === "error"
                ? "Live voice disconnected. Tap to retry."
                : "Start Live voice conversation"
            }
            data-rail-id="live-model"
            data-live-status={liveRailStatus}
            data-graphic-disabled={isLiveRailGraphicDisabled ? "true" : undefined}
            aria-label={
              liveRailStatus === "connecting"
                ? "Connecting Live voice model"
                : liveRailStatus === "listening"
                ? "User speaking"
                : liveRailStatus === "speaking"
                ? "Agent speaking"
                : liveRailStatus === "thinking"
                ? "Live voice is thinking"
                : liveRailStatus === "error"
                ? "Retry Live voice conversation"
                : "Start Live voice conversation"
            }
            aria-pressed={liveRailStatus !== "idle" && liveRailStatus !== "error"}
            aria-busy={liveRailStatus === "connecting"}
            onClick={activateLiveFromRail}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setLiveRailContextMenu((current) => current ? null : { x: event.clientX, y: event.clientY });
            }}
            disabled={!selectedRoomId && !activeRoom && rooms.length === 0}
          >
            {!isLiveRailGraphicDisabled ? (
              <>
                <span className="room-live-rail-glow" aria-hidden="true" />
                <span className="room-live-rail-sphere" aria-hidden="true">
                  <span className="room-live-rail-line line-one" />
                  <span className="room-live-rail-line line-two" />
                  <span className="room-live-rail-line line-three" />
                  <span className="room-live-rail-line line-four" />
                  <span className="room-live-rail-core" />
                </span>
              </>
            ) : null}
          </button>
        ) : null}
        {liveRailContextMenu ? (
          <LiveRailContextMenu
            x={liveRailContextMenu.x}
            y={liveRailContextMenu.y}
            isGraphicDisabled={isLiveRailGraphicDisabled}
            onToggleGraphic={toggleLiveRailGraphic}
            onClose={() => setLiveRailContextMenu(null)}
          />
        ) : null}
        {lowerRailVisibility.isVisible("create") ? (
          <DesktopNavigation createOnly actions={desktopToolbarActions}
            adminMode={isAdminMode} canAdmin={auth?.user?.role === "ADMIN"}
            onModeChange={() => undefined} onAction={runDesktopAction}
            renderCreateTools={renderDesktopCreateTools}
            availablePanes={Math.max(0, 16 - panes.length)}
            emptySlots={activeRoomEmptySlotsMetrics ?? undefined} />
        ) : null}
        {lowerRailVisibility.isVisible("layout") ? (
          <button
            ref={paneLayoutCollapsedButtonRef}
            type="button"
            className={`room-toolbar-visibility-button${isCollapsedPaneLayoutMenuOpen ? " is-active" : ""}`}
            title="Pane layout"
            data-rail-id="layout"
            aria-label="Pane layout"
            aria-controls="pane-layout-presets-collapsed"
            aria-expanded={isCollapsedPaneLayoutMenuOpen}
            aria-pressed={isCollapsedPaneLayoutMenuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setIsThemeMenuOpen(false);
              setIsPaneSpanAllMenuOpen(false);
              setIsWorkspaceTextSizePickerOpen(false);
              setIsVibeMusicOpen(false);
              setIsPaneLayoutMenuOpen(false);
              setLowerRailVisibilityMenu(null);
              setIsCollapsedPaneLayoutMenuOpen((current) => !current);
            }}
            disabled={!activeRoom || paneLayoutPending}
          >
            <PanelsTopLeft aria-hidden="true" />
          </button>
        ) : null}
        {lowerRailVisibility.isVisible("sticky") ? (
          <button
            type="button"
            className={`room-toolbar-visibility-button room-rail-secondary${stickyWindows.length > 0 ? " is-active" : ""}`}
            title="Sticky note"
            data-rail-id="sticky"
            aria-label="Sticky note"
            aria-pressed={stickyWindows.length > 0}
            onClick={() => {
              setIsThemeMenuOpen(false);
              setIsPaneLayoutMenuOpen(false);
              setIsCollapsedPaneLayoutMenuOpen(false);
              setIsPaneSpanAllMenuOpen(false);
              setIsWorkspaceTextSizePickerOpen(false);
              setIsVibeMusicOpen(false);
              setLowerRailVisibilityMenu(null);
              openStickyNote();
            }}
          >
            <StickyNote aria-hidden="true" />
          </button>
        ) : null}
        {lowerRailVisibility.isVisible("keyboard") ? (
          <button
            type="button"
            className={`room-toolbar-visibility-button room-rail-secondary${isOskKeyboardOpen ? " is-active" : ""}`}
            title="On-screen keyboard"
            data-rail-id="keyboard"
            aria-label="On-screen keyboard"
            aria-controls={OSK_PANEL_ID}
            aria-expanded={isOskKeyboardOpen}
            aria-pressed={isOskKeyboardOpen}
            aria-haspopup="dialog"
            onClick={() => {
              setIsThemeMenuOpen(false);
              setIsPaneLayoutMenuOpen(false);
              setIsCollapsedPaneLayoutMenuOpen(false);
              setIsPaneSpanAllMenuOpen(false);
              setIsWorkspaceTextSizePickerOpen(false);
              setIsVibeMusicOpen(false);
              setLowerRailVisibilityMenu(null);
              setIsOskKeyboardOpen((current) => !current);
            }}
          >
            <Keyboard aria-hidden="true" />
          </button>
        ) : null}
        {lowerRailVisibility.isVisible("music") ? (
          <button
            ref={vibeMusicButtonRef}
            type="button"
            className={`room-toolbar-visibility-button room-rail-secondary${isVibeMusicOpen ? " is-active" : ""}`}
            title="Vibe music with freeCodeCamp Code Radio"
            data-rail-id="music"
            aria-label="Music"
            aria-controls={VIBE_MUSIC_PANEL_ID}
            aria-expanded={isVibeMusicOpen}
            aria-pressed={isVibeMusicOpen}
            aria-haspopup="dialog"
            onClick={() => {
              setIsThemeMenuOpen(false);
              setIsPaneLayoutMenuOpen(false);
              setIsCollapsedPaneLayoutMenuOpen(false);
              setIsPaneSpanAllMenuOpen(false);
              setIsWorkspaceTextSizePickerOpen(false);
              setLowerRailVisibilityMenu(null);
              setIsVibeMusicOpen((current) => !current);
            }}
          >
            <Music2 aria-hidden="true" />
          </button>
        ) : null}
        {lowerRailVisibility.isVisible("snip-tool") ? (
          <button
            type="button"
            className={`room-toolbar-visibility-button room-rail-secondary${isSnipToolOpen ? " is-active" : ""}`}
            title={isSnipToolOpen ? "Close Snip Tool" : "Snip Tool (Capture, edit and share)"}
            data-rail-id="snip-tool"
            aria-label="Snip Tool"
            aria-pressed={isSnipToolOpen}
            onClick={() => {
              setIsSnipToolOpen((current) => !current);
            }}
            disabled={!activeRoom}
          >
            <Crop aria-hidden="true" />
          </button>
        ) : null}
        {lowerRailVisibility.isVisible("quick-links") ? (
          <button
            ref={quickLinksButtonRef}
            type="button"
            className={`room-toolbar-visibility-button room-rail-secondary${isQuickLinksOpen ? " is-active" : ""}`}
            title="Quick Links"
            data-rail-id="quick-links"
            aria-label="Quick Links"
            aria-controls="quick-links-popover"
            aria-haspopup="dialog"
            aria-expanded={isQuickLinksOpen}
            aria-pressed={isQuickLinksOpen}
            onClick={() => {
              setIsThemeMenuOpen(false);
              setIsPaneLayoutMenuOpen(false);
              setIsCollapsedPaneLayoutMenuOpen(false);
              setIsPaneSpanAllMenuOpen(false);
              setIsWorkspaceTextSizePickerOpen(false);
              setIsVibeMusicOpen(false);
              setLowerRailVisibilityMenu(null);
              setIsQuickLinksOpen((current) => !current);
            }}
          >
            <Star aria-hidden="true" fill={isQuickLinksOpen ? "currentColor" : "none"} />
          </button>
        ) : null}
        {lowerRailVisibility.isVisible("docks") ? (
          <DesktopNavigation docksOnly actions={roomToolbarActions}
            adminMode={isAdminMode} canAdmin={auth?.user?.role === "ADMIN"}
            onModeChange={() => undefined}
            onAction={(action, anchor) => {
              setIsThemeMenuOpen(false);
              setIsPaneLayoutMenuOpen(false);
              setIsCollapsedPaneLayoutMenuOpen(false);
              setIsPaneSpanAllMenuOpen(false);
              setIsWorkspaceTextSizePickerOpen(false);
              setIsVibeMusicOpen(false);
              setLowerRailVisibilityMenu(null);
              runDesktopAction(action, anchor);
            }} />
        ) : null}
        {lowerRailVisibility.isVisible("tools") ? (
          <DesktopNavigation toolsOnly actions={workspaceNavigationActions}
            adminMode={isAdminMode} canAdmin={auth?.user?.role === "ADMIN"}
            onModeChange={() => {
              setAdminModeRequested(!isAdminMode);
              setIsServerActionsMenuOpen(false);
              if (isAdminMode && ["health", "streaming"].includes(activeSideSurface)) setIsDesktopSideSurfaceOpen(false);
            }}
            onAction={(action, anchor) => {
              setIsThemeMenuOpen(false);
              if (action.id !== "pane-layout") {
                setIsPaneLayoutMenuOpen(false);
                setIsCollapsedPaneLayoutMenuOpen(false);
              }
              setIsPaneSpanAllMenuOpen(false);
              setIsWorkspaceTextSizePickerOpen(false);
              if (action.id !== "vibe-music") setIsVibeMusicOpen(false);
              setLowerRailVisibilityMenu(null);
              runDesktopAction(action, anchor);
            }}
            hiddenRailIds={lowerRailVisibility.hiddenIds} />
        ) : null}
        {lowerRailVisibility.isVisible("fullscreen") ? (
          <button
            type="button"
            className={`room-toolbar-visibility-button room-rail-secondary dock-fullscreen-toggle${isBrowserFullscreen ? " is-active" : ""}`}
            title={isBrowserFullscreen ? "Exit full screen (F11)" : "Full screen browser (F11)"}
            data-rail-id="fullscreen"
            aria-label={isBrowserFullscreen ? "Exit full screen" : "Full screen browser"}
            aria-pressed={isBrowserFullscreen}
            onClick={() => {
              setIsThemeMenuOpen(false);
              setIsPaneLayoutMenuOpen(false);
              setIsCollapsedPaneLayoutMenuOpen(false);
              setIsPaneSpanAllMenuOpen(false);
              setIsWorkspaceTextSizePickerOpen(false);
              setIsVibeMusicOpen(false);
              setLowerRailVisibilityMenu(null);
              void toggleBrowserFullscreen();
            }}
          >
            {isBrowserFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </button>
        ) : null}
        {showMinimizedBarToggle && auth?.user?.role !== "ADMIN" && lowerRailVisibility.isVisible("minimized-bar") ? (
          <MinimizedPaneBarToggle
            count={minimizedPanes.length}
            runningCount={minimizedPaneRunningCount}
            expanded={showMinimizedBar}
            onToggle={() => setMinimizedBarExpanded((value) => !value)}
          />
        ) : null}
        <button
          type="button"
          className="room-toolbar-visibility-button"
          title="Show room toolbar"
          data-rail-id="expand"
          aria-label="Show room toolbar"
          onClick={() => updateRoomToolbarVisibility(false)}
        >
          <PanelTopOpen aria-hidden="true" />
        </button>
        {lowerRailVisibility.isVisible("more") ? (
          <div className="room-rail-more">
            <DesktopNavigation workspaceOnly actions={workspaceNavigationActions}
              renderWorkspaceAction={renderWorkspaceAction} onWorkspaceDetailChange={setWorkspaceNavigationDetail} workspaceDetailActionIds={workspaceDetailActionIds}
              renderCreateTools={renderDesktopCreateTools} hiddenRailIds={lowerRailVisibility.hiddenIds}
              adminMode={isAdminMode} canAdmin={auth?.user?.role === "ADMIN"}
              availablePanes={Math.max(0, 16 - panes.length)}
              onModeChange={() => {
                setAdminModeRequested(!isAdminMode);
                setIsServerActionsMenuOpen(false);
                if (isAdminMode && ["health", "streaming"].includes(activeSideSurface)) setIsDesktopSideSurfaceOpen(false);
              }} onAction={runDesktopAction} />
          </div>
        ) : null}
        {isCollapsedPaneLayoutMenuOpen && activeRoom ? (
          <RecoverableSurface fallback={toolbarMenuLoadingFallback}>
            <LazyPaneLayoutMenu
              automaticColumns={layoutAutomaticPaneGridColumnCount}
              currentColumns={activeRoom.paneLayoutColumns ?? null}
              currentHeight={activeRoom.paneLayoutHeight ?? 1}
              error={paneLayoutError}
              maximumColumns={shellMode === "mobile" ? 1 : shellMode === "tablet" ? 2 : 4}
              menuId="pane-layout-presets-collapsed"
              onClose={() => setIsCollapsedPaneLayoutMenuOpen(false)}
              onSelect={(paneLayoutColumns) => void applyPaneLayoutPreset(paneLayoutColumns)}
              onSelectHeight={(paneLayoutHeight) => void applyPaneLayoutPreset(undefined, paneLayoutHeight, true)}
              pending={paneLayoutPending}
              triggerRef={paneLayoutCollapsedButtonRef}
              visiblePaneCount={effectiveLayoutPaneCount}
              emptySlots={activeRoomEmptySlotsMetrics ?? undefined}
            />
          </RecoverableSurface>
        ) : null}
        {isPaneSpanAllMenuOpen && activeRoom ? (
          <RecoverableSurface fallback={toolbarMenuLoadingFallback}>
            <LazyPaneSpanAllMenu
              activeColumnCount={paneGridColumnCount}
              currentSpan={commonPaneColumnSpan(visiblePanes)}
              error={paneSpanAllError}
              onClose={() => setIsPaneSpanAllMenuOpen(false)}
              onSelect={(columnSpan) => void applyPaneSpanToAll(columnSpan)}
              pending={paneSpanAllPending}
              triggerRef={paneSpanAllButtonRef}
              visiblePaneCount={visiblePanes.length}
            />
          </RecoverableSurface>
        ) : null}
        <WorkspaceTextSizePicker
          anchorRef={workspaceTextSizeButtonRef}
          open={isWorkspaceTextSizePickerOpen}
          value={terminalFontSize}
          onChange={setTerminalFontSize}
          onClose={() => setIsWorkspaceTextSizePickerOpen(false)}
        />
        {lowerRailVisibilityMenu ? (
          <RailVisibilityMenu
            anchorRef={collapsedToolbarRef}
            items={
              showMinimizedBarToggle && auth?.user?.role !== "ADMIN"
                ? [
                    ...DEFAULT_LOWER_RAIL_ITEMS.filter((item) => item.id !== "expand" && item.id !== "more"),
                    ...railVisibilityItems(["minimized-bar"], LOWER_RAIL_LABELS, LOWER_RAIL_NON_HIDEABLE),
                  ]
                : DEFAULT_LOWER_RAIL_ITEMS.filter((item) => item.id !== "expand" && item.id !== "more")
            }
            hiddenIds={lowerRailVisibility.hiddenIds}
            label="Rail icons"
            x={lowerRailVisibilityMenu.x}
            y={lowerRailVisibilityMenu.y}
            onClose={() => setLowerRailVisibilityMenu(null)}
            onHide={lowerRailVisibility.hide}
            onShow={lowerRailVisibility.show}
            onShowAll={lowerRailVisibility.showAll}
          />
        ) : null}
      </div>
    );
  }

  return (
    <AppIconProvider pack={modernIconPack}>
      <LiveSessionProvider ownerId={auth.user?.id || ""} roomId={selectedRoomId || activeRoom?.id || null} roomName={activeRoom?.name}>
      {vibeMusicPlayer}
      {oskKeyboard}
      {stickyNoteLayer}
      {desktopWidgetsLayer}
      {snipToolOverlay}
      <StreamingOverlayProvider active={auth.user?.role === "ADMIN"}>
      {setupConnectionsMounted.current ? (
        <RecoverableSurface
          fallback={(
            <div className="setup-connections-backdrop" role="status">
              Loading setup &amp; connections…
            </div>
          )}
        >
          <LazySetupConnectionsWizard
            guided={!setupFromWorkspace.current}
            embedded={Boolean(workspaceSetupHost)}
            portalTarget={workspaceSetupHost}
            connectionsContent={setupConnectionsContent}
            checks={api}
            open={isSetupConnectionsOpen || Boolean(workspaceSetupHost)}
            finish={api.finishSetup}
            loadOverview={api.setupOverview}
            onOpenChange={open => {
              if (!open && workspaceSetupHost) workspaceSetupBack.current?.();
              setIsSetupConnectionsOpen(open);
            }}
            openLogin={openSetupConnectionLogin}
            onOpenMaintenance={() => {
              workspaceSetupBack.current?.();
              setIsSetupConnectionsOpen(false);
              adminOperationToolTriggerRef.current = serverActionsButtonRef.current;
              openManage("space-cli-maintenance");
            }}
            triggerRef={serverActionsButtonRef}
          />
        </RecoverableSurface>
      ) : null}
      <AppDiagnosticsGlobalIndicators />
      <SensitiveDataMask enabled={maskSensitiveData} />
      <LiveRailSession />
      <main
      className={shellClassName}
      data-room-theme={roomTheme}
      data-sensitive-mode={maskSensitiveData ? "hidden" : undefined}
      data-ui-theme={uiTheme !== "classic" ? "modern" : undefined}
      data-interface-theme={uiTheme}
      data-color-mode={uiTheme !== "classic" ? modernColorMode : undefined}
      data-icon-pack={modernIconPack}
      data-room-id={activeRoom?.id}
      data-shell-mode={shellMode}
      data-interface-mode={isAdminMode ? "admin" : "user"}
      data-warm-room-cache-enabled={String(warmRoomEnabled)}
      data-suppress-notifications={String(suppressNotifications)}
      data-warm-room-safe-capacity={warmRoomLimitsForDevice.maxRooms}
      data-warm-room-hard-capacity={warmRoomLimitsForDevice.maxRooms}
      data-warm-room-count={warmRoomIds.length}
      data-warm-room-connected-panes={warmConnectedPaneTotal}
      data-warm-room-memory-source="fixed"
      data-warm-room-pressure="false"
      data-warm-room-overcommit="false"
      data-cli-floats-hidden={cliFloatsHidden ? "true" : "false"}
      data-workspace-rail={showResourceIndicatorRail || (isRoomToolbarHidden && !isMobilePaneFocused) ? "true" : undefined}
      data-room-toolbar-hidden={isRoomToolbarHidden ? "true" : undefined}
      data-mobile-pane-focus={isMobilePaneFocused ? "true" : undefined}
      data-browser-fullscreen={isBrowserFullscreen ? "true" : undefined}
    >
      <DesktopWindowTitlebar
        activeRoomName={activeRoom?.name}
        activeRoomId={activeRoom?.id}
        activePaneId={activePane?.id}
        isFullscreen={isBrowserFullscreen}
      />
      {!selectedRoomId && shellMode !== "desktop" && !isRoomFocusMode && !isMobilePaneFocused ? <header className="topbar">
        <div className="brand">
          <SpaceBrand />
          <div>
            <h1>
              <a
                className="brand-site-link"
                href="https://spaceapp.dev"
                target="_blank"
                rel="noopener noreferrer"
              >
                SpaceApp.dev
              </a>
            </h1>
            <span>Space agent room control plane</span>
          </div>
        </div>
        <div className="topbar-summary">
          <span>{presentationRoom?.name ?? "No room selected"}</span>
          <small>{presentationActivePane ? `Target ${displayPaneTitle(presentationActivePane)}` : "No pane target"}</small>
        </div>
        {runtimeKind === "demo" ? <DemoVersionMeta /> : <AppVersionMeta />}
      </header> : null}

      <input
        ref={clipImageInputRef}
        type="file"
        name="clip-tool-image"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = "";
          handleClipImageSelection(file);
        }}
      />
      {watchdogAlerts.map((alert) => (
        <div key={alert.id} className="banner bad" role="alert">
          <div className="notice-row">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <ShieldAlert size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>{alert.message}</span>
            </div>
            <button
              type="button"
              className="notice-close"
              aria-label="Dismiss watchdog alert"
              title="Dismiss watchdog alert"
              onClick={() => setWatchdogAlerts((current) => current.filter((item) => item.id !== alert.id))}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}

      <GlobalApiErrorAlert actionError={error} onDismissActionError={() => setError(null)} />
      {storageWarning && (!isRoomFocusMode || runtimeKind === "demo") && dismissedStorageWarning !== storageWarning ? (
        <div className="banner warn" role="status">
          <div className="notice-row">
            <span>{storageWarning}</span>
            <button
              type="button"
              className="notice-close"
              aria-label="Dismiss message"
              title="Dismiss message"
              onClick={() => {
                setDismissedStorageWarning(storageWarning);
                writeStoredSessionString(DISMISSED_STORAGE_WARNING_STORAGE_KEY, storageWarning);
              }}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      {clipToolNotice ? (
        <div className="banner warn" role="status">
          <div className="notice-row"><span>{clipToolNotice}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setClipToolNotice(null)}><X aria-hidden="true" /></button></div>
        </div>
      ) : null}
      {vpnCityNotice ? (
        <div ref={vpnCityNoticeRef} className="banner ok" role="status">
          <div className="notice-row"><span>{vpnCityNotice}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setVpnCityNotice(null)}><X aria-hidden="true" /></button></div>
        </div>
      ) : null}
      {!isRoomFocusMode && clipboardNotice ? (
        <div className="banner warn" role="status">
          <div className="notice-row"><span>{clipboardNotice}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setClipboardNotice(null)}><X aria-hidden="true" /></button></div>
        </div>
      ) : null}
      {accountNotice ? (
        <div className="banner ok" role="status">
          <div className="notice-row"><span>{accountNotice}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setAccountNotice(null)}><X aria-hidden="true" /></button></div>
        </div>
      ) : null}
      {accountError ? (
        <div className="banner warn" role="alert">
          <div className="notice-row"><span>{accountError}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setAccountError(null)}><X aria-hidden="true" /></button></div>
        </div>
      ) : null}

      {auth?.user?.role === "ADMIN" && adminCodexTool ? (
        <RecoverableSurface fallback={<div role="status">Loading Codex tools…</div>}>
          <LazyAdminCodexToolsDialog
            initialTool={adminCodexTool}
            isCodexEnabled={isCodexEnabled}
            anyCliEnabled={anyCliEnabled}
            onClose={closeAdminCodexTool}
          />
        </RecoverableSurface>
      ) : null}

      {auth?.user?.role === "ADMIN" && adminOperationTool ? (
        <RecoverableSurface fallback={<div role="status">Loading admin operation…</div>}>
          <LazyAdminOperationsDialog initialTool={adminOperationTool} onClose={closeAdminOperationTool} />
        </RecoverableSurface>
      ) : null}

      {auth?.user?.role === "ADMIN" && isSystemServicesDialogOpen ? (
        <RecoverableSurface fallback={<div role="status">Loading system services…</div>}>
          <LazySystemServicesDialog onClose={() => setIsSystemServicesDialogOpen(false)} />
        </RecoverableSurface>
      ) : null}

      {auth?.user?.role === "ADMIN" && isUserManagementOpen ? (
        <RecoverableSurface fallback={<div role="status">Loading user management…</div>}>
          <LazyUserManagementDialog
            currentUserId={auth.user?.id}
            onClose={closeUserManagement}
          />
        </RecoverableSurface>
      ) : null}

      {auth?.user?.role === "ADMIN" && isDemoModeActive ? (
        <RecoverableSurface fallback={<div role="status">Loading demo mode…</div>}>
          <LazyDemoModeOverlay
            isOpen={isDemoModeActive}
            onClose={() => setIsDemoModeActive(false)}
            onActionPreview={(actionId) => {
              if (actionId === "surface-rooms" || actionId.startsWith("surface-")) {
                const surface = actionId.replace("surface-", "") as SideSurface;
                toggleSideSurface(surface);
              } else if (actionId === "memory-workspace") {
                setIsMemoryWorkspaceOpen(true);
              } else if (actionId === "system-resources") {
                openSystemResources();
              } else if (actionId === "benchmark") {
                openBenchmark();
              } else if (actionId === "vibe-music") {
                setIsVibeMusicOpen(true);
              }
            }}
          />
        </RecoverableSurface>
      ) : null}

      {auth?.user?.role === "ADMIN" && (isServerActionsMenuOpen || manageLoginPending) ? (
        <RecoverableSurface fallback={toolbarMenuLoadingFallback}>
          <LazyServerActionsMenu
            actions={serverActionCommands}
            suspended={!isServerActionsMenuOpen}
            initialAction={manageInitialAction}
            renderAction={renderWorkspaceManageAction}
            renderGroupIntro={renderManageGroupIntro}
            mobile={shellMode === "mobile"}
            onClose={() => setIsServerActionsMenuOpen(false)}
            triggerRef={serverActionsButtonRef}
          />
        </RecoverableSurface>
      ) : null}

      {isServerRestartDialogOpen ? (
        <div
          className="attachment-modal server-restart-modal"
          onClick={closeServerRestartDialog}
        >
          <section
            className="attachment-modal-body server-restart-modal-body"
            role="dialog"
            aria-modal="true"
            aria-label="Restart Space server"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !serverRestartPending) {
                event.preventDefault();
                closeServerRestartDialog();
              }
            }}
          >
            <header>
              <span className="server-restart-modal-icon warning">
                <ServerCog aria-hidden="true" />
              </span>
              <div>
                <h3>Restart Space server</h3>
                <p>Restarts space-worker.service, space-api.service, and space-web.service.</p>
              </div>
              <button
                type="button"
                aria-label="Close Restart Space server"
                disabled={serverRestartPending}
                onClick={closeServerRestartDialog}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <p>CLI and browser sessions stay protected because codex-pane-host, the admin host, and the browser host are not restarted.</p>
            {serverRestartMessage ? <p className="server-restart-status" role="status"><span>{serverRestartMessage}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setServerRestartMessage(null)}><X aria-hidden="true" /></button></p> : null}
            {serverRestartError ? <p className="server-restart-error" role="alert"><span>{serverRestartError}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setServerRestartError(null)}><X aria-hidden="true" /></button></p> : null}
            <div className="server-restart-modal-actions">
              <button type="button" autoFocus onClick={closeServerRestartDialog} disabled={serverRestartPending}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={() => void confirmServerRestart()} disabled={serverRestartPending}>
                {serverRestartPending ? "Restarting..." : "Restart server"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isCliRuntimeRestartAllDialogOpen ? (
        <div
          className="attachment-modal server-restart-modal"
          onClick={closeCliRuntimeRestartAllDialog}
        >
          <section
            className="attachment-modal-body server-restart-modal-body"
            role="dialog"
            aria-modal="true"
            aria-label="Restart all CLI runtimes"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !cliRuntimeRestartAllPending) {
                event.preventDefault();
                closeCliRuntimeRestartAllDialog();
              }
            }}
          >
            <header>
              <span className="server-restart-modal-icon">
                <Terminal aria-hidden="true" />
              </span>
              <div>
                <h3>Restart all CLI runtimes</h3>
                <p>Stops and restarts the sessions of every CLI type one after another.</p>
              </div>
              <button
                type="button"
                aria-label="Close Restart all CLI runtimes"
                disabled={cliRuntimeRestartAllPending}
                onClick={closeCliRuntimeRestartAllDialog}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <p>Codex, claude, gemini, opencode, kimi, and the other CLI runtimes are restarted individually; the pane host service itself is not restarted.</p>
            {cliRuntimeRestartAllMessage ? <p className="server-restart-status" role="status"><span>{cliRuntimeRestartAllMessage}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setCliRuntimeRestartAllMessage(null)}><X aria-hidden="true" /></button></p> : null}
            {cliRuntimeRestartAllError ? <p className="server-restart-error" role="alert"><span>{cliRuntimeRestartAllError}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setCliRuntimeRestartAllError(null)}><X aria-hidden="true" /></button></p> : null}
            <div className="server-restart-modal-actions">
              <button type="button" autoFocus onClick={closeCliRuntimeRestartAllDialog} disabled={cliRuntimeRestartAllPending}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={() => void confirmCliRuntimeRestartAll()} disabled={cliRuntimeRestartAllPending}>
                {cliRuntimeRestartAllPending ? "Restarting..." : "Restart all CLI runtimes"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {auth.user?.role === "ADMIN" && (isRoomToolbarHidden || isMobilePaneFocused || isMemoryWorkspaceOpen || systemAnalyticsTab || !presentationRoom) ? renderToolbarMetrics(true) : null}
      {auth.user?.role === "ADMIN" ? (
        <RecoverableSurface fallback={isAgentsDashboardOpen ? <div role="status">Loading agents dashboard…</div> : null}>
          <LazyAgentsDashboard key={auth.user.id} userId={auth.user.id} open={isAgentsDashboardOpen} rooms={rooms} completions={paneCompletionLifecycle.panes}
            activePanes={panes} onSummaryChange={setAgentsDashboardSummary}
            onOpenPane={paneCardOnOpenExisting} onClose={() => setIsAgentsDashboardOpen(false)}
            currentRoomId={activeRoom?.id ?? selectedRoomId ?? null} selectedPaneId={selectedPaneId} />
        </RecoverableSurface>
      ) : null}
      {auth.user && <SystemHealth key={auth.user.id} userId={auth.user.id} allowChanges={shellMode !== "desktop" || isAdminMode}
        onOpenAgentsDashboard={() => setIsAgentsDashboardOpen(true)}
        agentsSummary={agentsDashboardSummary}
        railVisible={showResourceIndicatorRail}
        indicatorsVisible={resourceIndicatorsVisible}
        environment={codexEnvironmentSummary}
        readOnly={auth.user.role !== "ADMIN"}
        minimizedBarToggle={auth.user.role === "ADMIN" && showMinimizedBarToggle && (isRoomToolbarHidden || isMobilePaneFocused) ? (
          <MinimizedPaneBarToggle
            count={minimizedPanes.length}
            runningCount={minimizedPaneRunningCount}
            expanded={showMinimizedBar}
            onToggle={() => setMinimizedBarExpanded((value) => !value)}
          />
        ) : undefined}
        onManage={auth.user.role === "ADMIN" ? (panel) => openSystemHealth(panel === "accounts" ? "ai" : panel === "cli" ? "sessions" : "provider") : undefined}
        onReopenPane={auth.user.role === "ADMIN" ? reopenPane : undefined}
        onReopenAllDetached={auth.user.role === "ADMIN" ? reopenAllDetachedPanes : undefined}
        onCloseSession={auth.user.role === "ADMIN" ? closeDetachedPane : undefined} />}

      {renderCollapsedToolbar()}

      <div className="workspace-stage">
      <section className={workspaceClassName}
        inert={isMemoryWorkspaceOpen || undefined}
        aria-hidden={isMemoryWorkspaceOpen || undefined}>
        {mountInlineSideSurface ? (
          <aside className="side-surface side-surface-inline" aria-label={activeSideSurfaceLabel} data-surface={activeSideSurface}
            style={showInlineSideSurface ? undefined : { display: "none" }}
            aria-hidden={showInlineSideSurface ? undefined : true}
            inert={showInlineSideSurface ? undefined : true}>
            <div className="desktop-dock-header">
              <span><strong>{activeSideSurfaceDockTitle}</strong><small>{desktopActionDescriptions[`surface-${activeSideSurface}`]}</small></span>
              <div className="dock-nav-controls">
                <button type="button" className="icon-button" aria-label="Previous dock" title="Previous dock"
                  onClick={() => navigateDock("prev")}><ChevronLeft aria-hidden="true" /></button>
                <button type="button" className="icon-button" aria-label="Next dock" title="Next dock"
                  onClick={() => navigateDock("next")}><ChevronRight aria-hidden="true" /></button>
                <button type="button" className="icon-button" aria-label={activeSideSurfaceCloseLabel}
                  title={activeSideSurfaceCloseLabel}
                  onClick={() => setIsDesktopSideSurfaceOpen(false)}><X aria-hidden="true" /></button>
              </div>
            </div>
            <DockKeepAliveHost
              activeSurface={activeSideSurface}
              isOpen={showInlineSideSurface}
              renderSurface={renderSideSurfaceContent}
              fallback={sideSurfaceLoadingFallback}
            />
          </aside>
        ) : null}
        {showOverlaySideSurface ? (
          <>
            <button className="surface-dismiss-layer" type="button" aria-label={activeSideSurfaceCloseLabel} onClick={closeCompactSideSurface} />
            <aside
              ref={compactSideSurfaceRef}
              className="side-surface side-surface-drawer"
              role="dialog"
              aria-modal="true"
              aria-label={activeSideSurfaceLabel}
              data-surface={activeSideSurface}
              data-surface-mode="drawer"
            >
              <div className="surface-header">
                <span><strong>{activeSideSurfaceDockTitle}</strong><small>{desktopActionDescriptions[`surface-${activeSideSurface}`]}</small></span>
                <div className="dock-nav-controls">
                  <button type="button" className="icon-button" aria-label="Previous dock" title="Previous dock"
                    onClick={() => navigateDock("prev")}><ChevronLeft aria-hidden="true" /></button>
                  <button type="button" className="icon-button" aria-label="Next dock" title="Next dock"
                    onClick={() => navigateDock("next")}><ChevronRight aria-hidden="true" /></button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={activeSideSurfaceCloseLabel}
                    title={activeSideSurfaceCloseLabel}
                    onClick={closeCompactSideSurface}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              </div>
              <DockKeepAliveHost
                activeSurface={activeSideSurface}
                isOpen={showOverlaySideSurface}
                renderSurface={renderSideSurfaceContent}
                fallback={sideSurfaceLoadingFallback}
              />
            </aside>
          </>
        ) : null}

        <section className={boardClassName} aria-label="Pane board">
          {!isMobilePaneFocused && !isRoomToolbarHidden ? (
            <div
              ref={boardToolbarRef}
              className="board-toolbar"
              data-room-actions-stacked={isRoomToolbarStacked ? "true" : undefined}
              data-presentation-state={preparingRoomId ? "held" : "displayed"}
              aria-disabled={preparingRoomId ? "true" : undefined}
              inert={preparingRoomId ? true : undefined}
            >
            <div className="board-toolbar-main">
              <div className="board-title-row">
                <button type="button" className="desktop-rooms-toggle"
                  aria-label={sideSurfaceToggleLabel("rooms")} title={sideSurfaceToggleLabel("rooms")}
                  aria-pressed={isSideSurfaceOpen && activeSideSurface === "rooms"}
                  onClick={() => toggleSideSurface("rooms")}><PanelLeft aria-hidden="true" /></button>
                <SpaceBrand onActivate={() => void minimizeAllPanes()} />
                <div className="board-title-heading">
                  {isRoomRenameOpen && presentationRoom ? (
                    <form className="room-title-form" onSubmit={submitRoomRename}>
                      <input
                        aria-label="Room name"
                        placeholder="Room name"
                        value={roomNameDraft}
                        disabled={roomRenamePending}
                        onChange={(event) => setRoomNameDraft(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRoomRename();
                          }
                        }}
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="room-title-save"
                        title="Save room name"
                        aria-label="Save room name"
                        disabled={roomRenamePending}
                      >
                        <Save aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="room-title-cancel"
                        title="Cancel room rename"
                        aria-label="Cancel room rename"
                        onClick={cancelRoomRename}
                        disabled={roomRenamePending}
                      >
                        <Undo2 aria-hidden="true" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <h2 title={presentationRoom?.name ?? "No room"} onContextMenu={(event) => {
                        if (shellMode !== "mobile") return;
                        event.preventDefault();
                        setRoomNamePreview(presentationRoom?.name ?? "No room");
                      }} onTouchStart={shellMode === "mobile" ? () => {
                        const name = presentationRoom?.name ?? "No room";
                        roomNameHoldTimerRef.current = window.setTimeout(() => setRoomNamePreview(name), 500);
                      } : undefined} onTouchEnd={() => {
                        if (roomNameHoldTimerRef.current !== null) window.clearTimeout(roomNameHoldTimerRef.current);
                      }} onTouchMove={() => {
                        if (roomNameHoldTimerRef.current !== null) window.clearTimeout(roomNameHoldTimerRef.current);
                      }}>{presentationRoom?.name ?? "No room"}</h2>
                      {presentationRoom ? (() => {
                        const effectiveProj = presentationRoom.projectPath || "/opt/spaceapp";
                        return (
                          <button
                            type="button"
                            className="room-project-pill"
                            title={`Project: ${effectiveProj} • Click to open/focus File Manager`}
                            aria-label={`Project: ${effectiveProj}`}
                            onClick={async () => {
                              const existingFilesPane = panes.find((p) => !p.isClosed && p.mode === "FILES");
                              if (existingFilesPane) {
                                setSelectedPaneId(existingFilesPane.id);
                                window.dispatchEvent(new CustomEvent("space:files:navigate", { detail: { path: effectiveProj } }));
                              } else {
                                await addFilesPane(1, presentationRoom.id);
                              }
                            }}
                          >
                            <Folder aria-hidden="true" />
                            <span>{effectiveProj.split("/").filter(Boolean).pop() || effectiveProj}</span>
                          </button>
                        );
                      })() : null}
                    </>
                  )}
                  {roomNamePreview && shellMode === "mobile" ? (
                    <button type="button" className="mobile-room-name-preview" role="tooltip" aria-label={`Full room name: ${roomNamePreview}. Tap to dismiss`} onClick={() => setRoomNamePreview(null)}>{roomNamePreview}</button>
                  ) : null}
                  {presentationRoom ? (
                    <div className="board-title-controls">
                      {!isRoomRenameOpen ? (
                        <button
                          type="button"
                          className="room-title-edit"
                          title={`Rename ${presentationRoom.name}`}
                          aria-label={`Rename ${presentationRoom.name}`}
                          onClick={beginRoomRename}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                      ) : null}
                      {userNavigableRooms.length > 1 ? (
                        <div className="room-title-nav" role="group" aria-label="Room navigation">
                          <button
                            type="button"
                            title="Previous room"
                            aria-label="Previous room"
                            disabled={!previousRoom}
                            onClick={() => {
                              if (previousRoom) {
                                void selectRoom(previousRoom.id);
                              }
                            }}
                          >
                            <ChevronLeft aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            title="Next room"
                            aria-label="Next room"
                            disabled={!nextRoom}
                            onClick={() => {
                              if (nextRoom) {
                                void selectRoom(nextRoom.id);
                              }
                            }}
                          >
                            <ChevronRight aria-hidden="true" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              {roomRenameError ? <p className="room-title-error" role="alert"><span>{roomRenameError}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setRoomRenameError(null)}><X aria-hidden="true" /></button></p> : null}
              {paneMoveNotice ? (
                <div className="validation-result" role="status" aria-live="polite">
                  <div className="notice-row"><span>{paneMoveNotice}</span><button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setPaneMoveNotice(null)}><X aria-hidden="true" /></button></div>
                </div>
              ) : null}
            </div>
            <div
              id="toolbar-docked-widgets"
              className="toolbar-docked-widgets"
              role="region"
              aria-label="Docked toolbar widgets"
            />
            <div className="toolbar-actions" ref={roomToolbarActionsRef} {...roomToolbarTouchContext}>
              {presentationRoom ? (
                renderToolbarMetrics()
              ) : null}
              <div ref={roomToolbarScrollRef} className="toolbar-actions-scroll">
                <DesktopNavigation
                  actions={workspaceNavigationActions}
                  renderWorkspaceAction={renderWorkspaceAction} onWorkspaceDetailChange={setWorkspaceNavigationDetail} workspaceDetailActionIds={workspaceDetailActionIds}
                  hiddenRailIds={lowerRailVisibility.hiddenIds}
                  adminMode={isAdminMode}
                  canAdmin={auth?.user?.role === "ADMIN"}
                  availablePanes={Math.max(0, 16 - panes.length)}
                  onModeChange={() => {
                    setAdminModeRequested(!isAdminMode);
                    setIsServerActionsMenuOpen(false);
                    if (isAdminMode && ["health", "streaming"].includes(activeSideSurface)) setIsDesktopSideSurfaceOpen(false);
                  }}
                  onAction={runDesktopAction}
                  renderCreateTools={renderDesktopCreateTools}
                  emptySlots={activeRoomEmptySlotsMetrics ?? undefined}
                  footer={runtimeKind === "demo" ? <DemoVersionMeta /> : <AppVersionMeta />}
                />
              </div>
              {roomToolbar.isOverflowOpen ? (
                shellMode === "mobile" ? (
                  <MobileActionSheet
                    actionSections={uiTheme !== "classic" ? groupModernRoomActions(availableRoomActions) : undefined}
                    actions={availableRoomActions}
                    hiddenActionIds={roomToolbar.hiddenActionIds}
                    label="Room actions"
                    onClose={roomToolbar.closeMenus}
                    onHideAction={roomToolbar.hideAction}
                    onShowAction={roomToolbar.showAction}
                    onRunAction={(action) => {
                      roomToolbar.closeMenus();
                      if (action.id !== "theme") setIsThemeMenuOpen(false);
                      if (action.id !== "pane-layout") setIsPaneLayoutMenuOpen(false);
                      if (action.id !== "pane-span-all") setIsPaneSpanAllMenuOpen(false);
                      if (action.id !== "font-down") setIsWorkspaceTextSizePickerOpen(false);
                      if (action.id !== "add-cli") setIsCliLauncherOpen(false);
                      action.onClick();
                    }}
                    popupId="room-actions-popup"
                    summary={<ToolbarMetricsSummary environment={codexEnvironmentSummary} />}
                    triggerRef={roomOverflowTriggerRef}
                  />
                ) : (
                  <DesktopActionManager
                    actions={availableRoomActions}
                    hiddenActionIds={roomToolbar.hiddenActionIds}
                    label="Room actions"
                    onClose={roomToolbar.closeMenus}
                    onHideAction={roomToolbar.hideAction}
                    onReorderAction={roomToolbar.moveAction}
                    onShowAction={roomToolbar.showAction}
                    popupId="room-actions-popup"
                    triggerRef={roomOverflowTriggerRef}
                  />
                )
              ) : null}
              <div className="toolbar-actions-fixed" role="group" aria-label="Room utility controls">
                {showMinimizedBarToggle ? (
                  <MinimizedPaneBarToggle
                    count={minimizedPanes.length}
                    runningCount={minimizedPaneRunningCount}
                    expanded={showMinimizedBar}
                    onToggle={() => setMinimizedBarExpanded((value) => !value)}
                  />
                ) : null}
                <button
                  type="button"
                  className="room-toolbar-visibility-button"
                  title="Hide room toolbar"
                  aria-label="Hide room toolbar"
                  onClick={() => updateRoomToolbarVisibility(true)}
                >
                  <Minus aria-hidden="true" />
                </button>
              </div>
              {shellMode !== "mobile" && isPaneLayoutMenuOpen && activeRoom ? (
                <RecoverableSurface fallback={toolbarMenuLoadingFallback}>
                  <LazyPaneLayoutMenu
                    automaticColumns={layoutAutomaticPaneGridColumnCount}
                    currentColumns={activeRoom.paneLayoutColumns ?? null}
                    currentHeight={activeRoom.paneLayoutHeight ?? 1}
                    error={paneLayoutError}
                    maximumColumns={shellMode === "tablet" ? 2 : 4}
                    onClose={() => setIsPaneLayoutMenuOpen(false)}
                    onSelect={(paneLayoutColumns) => void applyPaneLayoutPreset(paneLayoutColumns)}
                    onSelectHeight={(paneLayoutHeight) => void applyPaneLayoutPreset(undefined, paneLayoutHeight, true)}
                    pending={paneLayoutPending}
                    triggerRef={paneLayoutButtonRef}
                    visiblePaneCount={effectiveLayoutPaneCount}
                    emptySlots={activeRoomEmptySlotsMetrics ?? undefined}
                  />
                </RecoverableSurface>
              ) : null}
              {isPaneSpanAllMenuOpen && activeRoom ? (
                <RecoverableSurface fallback={toolbarMenuLoadingFallback}>
                  <LazyPaneSpanAllMenu
                    activeColumnCount={paneGridColumnCount}
                    currentSpan={commonPaneColumnSpan(visiblePanes)}
                    error={paneSpanAllError}
                    onClose={() => setIsPaneSpanAllMenuOpen(false)}
                    onSelect={(columnSpan) => void applyPaneSpanToAll(columnSpan)}
                    pending={paneSpanAllPending}
                    triggerRef={paneSpanAllButtonRef}
                    visiblePaneCount={visiblePanes.length}
                  />
                </RecoverableSurface>
              ) : null}
              {isCliLauncherOpen ? (
                <RecoverableSurface fallback={toolbarMenuLoadingFallback}>
                  <LazyCliLauncherMenu
                    refreshOnOpen={true}
                    atPaneCap={panes.length >= 16}
                    availablePanes={Math.max(0, 16 - panes.length)}
                    isCodexEnabled={isCodexEnabled}
                    mobile={shellMode === "mobile"}
                    onClose={() => setIsCliLauncherOpen(false)}
                    onCreate={addCliRuntimePane}
                    onLogin={openCliRuntimeLogin}
                    onOpenSettings={openSettingsSurface}
                    triggerRef={cliLauncherReturnFocusRef}
                  />
                </RecoverableSurface>
              ) : null}
              {isChatLauncherOpen ? (
                <RecoverableSurface fallback={toolbarMenuLoadingFallback}>
                  <LazyChatLauncherMenu
                    mobile={shellMode === "mobile"}
                    onClose={closeChatLauncher}
                    onSelectChat={() => void addPane("CHAT")}
                    onSelectHarness={() => void addHarnessPane()}
                    onSelectLive={() => void addLivePane()}
                    triggerRef={chatLauncherButtonRef}
                    chatDisabled={!isCodexEnabled || panes.length >= 16}
                    chatHidden={isPaneHidden("chat")}
                    harnessDisabled={panes.length >= 16}
                    harnessHidden={!isHarnessEnabled || isPaneHidden("harness")}
                    liveDisabled={isPaneHidden("live") || panes.length >= 16}
                    liveHidden={isPaneHidden("live")}
                  />
                </RecoverableSurface>
              ) : null}
              {isThemeMenuOpen ? (
                <RoomThemeMenu
                  currentTheme={roomTheme}
                  mobile={shellMode === "mobile"}
                  onClose={() => setIsThemeMenuOpen(false)}
                  onSelect={setRoomTheme}
                  triggerRef={roomThemeButtonRef}
                />
              ) : null}
              <WorkspaceTextSizePicker
                anchorRef={workspaceTextSizeButtonRef}
                open={isWorkspaceTextSizePickerOpen}
                value={terminalFontSize}
                onChange={setTerminalFontSize}
                onClose={() => setIsWorkspaceTextSizePickerOpen(false)}
              />
              {roomToolbar.actionMenu ? (
                <div
                  className="icon-context-menu"
                  role="menu"
                  aria-label={`Action menu ${roomToolbar.actionMenu.actionLabel}`}
                  style={{ left: `${roomToolbar.actionMenu.x}px`, top: `${roomToolbar.actionMenu.y}px` }}
                >
                  {roomToolbar.actionMenu.actionId === "sensitive-data" ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        if (roomToolbar.actionMenu) {
                          roomToolbar.closeMenus();
                          toggleMaskSensitiveData();
                        }
                      }}
                    >
                      {maskSensitiveData ? "Show sensitive data" : "Hide sensitive data"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        if (roomToolbar.actionMenu) {
                          roomToolbar.hideAction(roomToolbar.actionMenu.actionId);
                        }
                      }}
                    >
                      Hide
                    </button>
                  )}
                </div>
              ) : null}
            </div>
            </div>
          ) : null}
          {showPaneNavigation ? (
            <div className="pane-navigation">
              {showMinimizedBar ? (
                <section
                  className={`minimized-pane-bar${minimizedBarPreviewMode ? " is-preview-mode" : ""}`}
                  id={MINIMIZED_PANE_BAR_ID}
                  aria-label="Minimized panes"
                >
                  <div className="minimized-pane-items">
                    {visiblePanes.length === 0 ? (
                      <span className="all-panes-minimized" role="status">All panes minimized</span>
                    ) : null}
                    {minimizedPanes.map((pane) => {
                      const paneRunActive =
                        paneCompletionLifecycle.panes[pane.id]?.activeRunKey != null;
                      const fullTitle = formatPaneFullTitle(pane);
                      const latestTurn = pane.mode === "CHAT" ? turns.find((t) => t.paneId === pane.id) ?? null : null;
                      if (minimizedBarPreviewMode) {
                        return (
                          <MinimizedPanePreviewCard
                            key={pane.id}
                            pane={pane}
                            icon={<PaneModeIcon pane={pane} />}
                            title={displayPaneTitle(pane)}
                            subtitle={minimizedPaneSubtitle(pane)}
                            fullTitle={fullTitle}
                            modeLabel={paneModeLabel(pane.mode)}
                            isRunning={paneRunActive}
                            latestTurn={latestTurn}
                            onRestore={() => void restorePane(pane)}
                          />
                        );
                      }
                      return (
                        <MinimizedPaneChip
                          key={pane.id}
                          pane={pane}
                          icon={<PaneModeIcon pane={pane} />}
                          title={displayPaneTitle(pane)}
                          fullTitle={fullTitle}
                          isRunning={paneRunActive}
                          latestTurn={latestTurn}
                          buttonRef={(element) => {
                            if (element) minimizedPaneRestoreRefs.current.set(pane.id, element);
                            else minimizedPaneRestoreRefs.current.delete(pane.id);
                          }}
                          onRestore={() => void restorePane(pane)}
                        />
                      );
                    })}
                  </div>
                  <div className="minimized-pane-bar-actions">
                    <button
                      type="button"
                      className={`minimized-preview-toggle${minimizedBarPreviewMode ? " is-active" : ""}`}
                      aria-label={minimizedBarPreviewMode ? "Collapse pane preview" : "Expand pane preview"}
                      title={minimizedBarPreviewMode ? "Collapse pane preview" : "Expand pane preview"}
                      aria-pressed={minimizedBarPreviewMode}
                      onClick={toggleMinimizedBarPreviewMode}
                    >
                      <Eye aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="minimize-all-panes"
                      aria-label="Minimize all visible panes"
                      title="Minimize all visible panes"
                      disabled={minimizeAllPending || visiblePanes.length === 0}
                      onClick={() => void minimizeAllPanes()}
                    >
                      <Minus aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="restore-all-panes"
                      aria-label="Restore all minimized panes"
                      title="Restore all minimized panes"
                      aria-busy={restoreAllPending}
                      disabled={restoreAllPending}
                      onClick={() => void restoreAllPanes()}
                    >
                      <Grid2X2 aria-hidden="true" />
                    </button>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          <div
            className="room-runtime-stack"
            data-ui-background={uiBackground}
            aria-busy={preparingRoomId ? "true" : "false"}
            data-presentation-generation={roomPresentationGenerationRef.current}
          >
            {mountedRoomRuntimeIds.map((roomId) => renderRoomRuntimeLayer(roomId))}
            {canPlayAsteroids({ selectedRoomId, displayedRoomId, preparingRoomId,
              loaded: Boolean(selectedRoomId && roomPaneLoadStates[selectedRoomId] === "loaded"),
              category: selectedRoomId ? activeCategoryColorByRoom[selectedRoomId] ?? null : null, panes }) ? (
                <AsteroidsGate key={selectedRoomId} />
              ) : null}
          </div>
        </section>
        {paneMoveDialog ? (
          <MovePaneDialog
            paneTitle={displayPaneTitle(paneMoveDialog.pane)}
            targetRooms={rooms.filter((room) => room.id !== paneMoveDialog.pane.roomId)}
            targetRoomId={paneMoveDialog.targetRoomId}
            pending={paneMoveDialog.pending}
            error={paneMoveDialog.error}
            onTargetRoomChange={(targetRoomId) =>
              setPaneMoveDialog((current) => (current ? { ...current, targetRoomId, error: null } : current))
            }
            onClose={closeMovePaneDialog}
            onConfirm={() => void submitPaneMove()}
          />
        ) : null}

      </section>
      {isMemoryWorkspaceOpen ? <div className="workspace-cover">
        <MemoryWorkspaceErrorBoundary onClose={() => setIsMemoryWorkspaceOpen(false)}>
          <RecoverableSurface fallback={<div className="memory-workspace-loading" role="status">Loading memory workspace…</div>}>
            <LazyMemoryWorkspace
              shellMode={shellMode}
              activeRoomId={activeRoom?.id ?? null}
              onClose={() => setIsMemoryWorkspaceOpen(false)}
            />
          </RecoverableSurface>
        </MemoryWorkspaceErrorBoundary>
      </div> : null}
      </div>
      <QuickLinksPopover open={isQuickLinksOpen} triggerRef={quickLinksButtonRef} onClose={() => setIsQuickLinksOpen(false)} onOpen={openUserLink} onManage={manageLinks} />
      {activeUserLink && !workspaceNavigationDetail ? (
        <RecoverableSurface fallback={<div role="status">Loading dashboard…</div>}>
          <LazyEmbeddedDashboardDialog link={activeUserLink} onClose={() => setActiveUserLink(null)} />
        </RecoverableSurface>
      ) : null}
      {liveDebugToast ? (
        <aside
          className={`live-debug-toast is-${liveDebugToast.type}`}
          role="status"
          aria-live="polite"
          onClick={() => setLiveDebugToast(null)}
        >
          <span>{liveDebugToast.message}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation();
              setLiveDebugToast(null);
            }}
          >
            ×
          </button>
        </aside>
      ) : null}
      </main>
      <StreamingOverlay theme={uiTheme !== "classic" ? "modern" : "classic"} />
      </StreamingOverlayProvider>
      </LiveSessionProvider>
    </AppIconProvider>
  );
}


const providerTypeOptions: CreateProviderInput["type"][] = ["CODEX_LB", "OPENAI", "ANTHROPIC", "LOCAL", "CUSTOM"];
const providerRouteProfileOptions: NonNullable<Provider["routeProfile"]>[] = [
  "headroom",
  "direct-primary",
  "direct-auto",
  "direct-fallback",
  "openai-direct",
  "custom"
];

interface ProviderFormState {
  id: string;
  displayName: string;
  type: CreateProviderInput["type"];
  baseUrl: string;
  routeProfile: NonNullable<Provider["routeProfile"]>;
  backingProviderId: string;
  credentialRef: string;
}

const emptyProviderForm: ProviderFormState = {
  id: "",
  displayName: "",
  type: "CUSTOM",
  baseUrl: "",
  routeProfile: "custom",
  backingProviderId: "",
  credentialRef: ""
};
















const AGENT_PANE_SETTINGS_EVENT = "space:agent-pane-settings-updated";

function dispatchAgentPaneSettingsUpdated(paneId: string | null, session?: AgentPaneSession) {
  window.dispatchEvent(new CustomEvent(AGENT_PANE_SETTINGS_EVENT, { detail: { paneId, session } }));
}

function providerRouteLabel(provider: Provider): string {
  return [provider.routeProfile ?? "custom", provider.backingProviderId ?? provider.type.toLowerCase()].join(" / ");
}

function AgentSettingsDock({
  adminMode,
  onOpenSetup,
  activePane: _activePane,
  canManageCliRuntimes,
  canManageDiagnostics,
  canManageSourceControl,
  canManageTelegram,
  currentAppearance,
  currentBackground = "spaceapp",
  currentIconPack,
  currentUiTheme,
  isCodexEnabled,
  isHarnessEnabled = true,
  suppressNotifications,
  providerSettings,
  providers,
  gitPluginsActive,
  onUiThemeApply,
  onSuppressNotificationsChange,
  onProviderSettingsRefresh,
  auth,
  onAuthRefresh
}: {
  adminMode: boolean;
  onOpenSetup: () => void;
  activePane?: Pane | null;
  canManageCliRuntimes: boolean;
  canManageDiagnostics: boolean;
  canManageSourceControl: boolean;
  canManageTelegram: boolean;
  currentAppearance: ModernAppearance;
  currentBackground?: UiBackground;
  currentIconPack: ModernIconPack;
  currentUiTheme: UiTheme;
  isCodexEnabled: boolean;
  isHarnessEnabled?: boolean;
  suppressNotifications: boolean;
  providerSettings: ProviderSettings | null;
  providers: Provider[];
  gitPluginsActive?: boolean;
  onUiThemeApply: (selection: { appearance: ModernAppearance; background: UiBackground; iconPack: ModernIconPack; theme: UiTheme }) => void;
  onSuppressNotificationsChange: (suppressed: boolean) => void;
  onProviderSettingsRefresh: (settings: ProviderSettings) => void;
  auth?: AuthMe | null;
  onAuthRefresh?: () => Promise<void>;
}) {
  const [providerPending, setProviderPending] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [defaultWorktree, setDefaultWorktree] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("space.worktree.defaultEnabled");
      if (stored !== null) return stored === "true";
    } catch {}
    return true;
  });

  const defaultProvider = providers.find((provider) => provider.id === providerSettings?.defaultProviderId) ?? null;

  async function selectDefaultProvider(providerId: string) {
    if (!isCodexEnabled || !providerId || providerId === providerSettings?.defaultProviderId) return;
    setProviderPending(true);
    setProviderError(null);
    try {
      const updated = await api.updateProviderSettings({ defaultProviderId: providerId });
      onProviderSettingsRefresh(updated);
      dispatchAgentPaneSettingsUpdated(null);
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : "Default provider update failed");
    } finally {
      setProviderPending(false);
    }
  }

  return (
    <div className="dock-panel agent-settings-dock basic-settings-dock">
      <SettingsSections>
      <header className="settings-dock-title settings-flat-dock-title">
        <Settings2 aria-hidden="true" />
        <span>
          <h2>{adminMode ? "Advanced settings" : "Settings"}</h2>
          <small>{adminMode ? "Preferences and advanced installation settings." : "Your everyday preferences. Open a section to change it."}</small>
        </span>
      </header>

      <RecoverableSurface fallback={settingsCardLoadingFallback}>
        <LazyEnvironmentPresetCard
          isAdmin={auth?.user?.role === "ADMIN"}
          canManageCliRuntimes={canManageCliRuntimes}
          userId={auth?.user?.id}
        />
      </RecoverableSurface>

      {adminMode && canManageCliRuntimes ? <div className="settings-setup-shortcut">
        <strong>Need to set up a tool?</strong>
        <p>The wizard guides you through tools and connections. You can return at any time.</p>
        <button type="button" onClick={onOpenSetup}>Open setup wizard</button>
      </div> : null}
      <SettingsDisclosure title="Account & Google" description="Link or manage your Google single sign-on connection." scope="Installation" icon={Users}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}>
          <LazyGoogleAccountSettingsCard auth={auth ?? null} onAuthRefresh={onAuthRefresh ?? (async () => {})} />
        </RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Appearance" description="Theme, colors, and icon style." scope="Your account" icon={Palette}>
      <RecoverableSurface fallback={settingsCardLoadingFallback}>
        <LazyUiThemeSettingsCard
          currentAppearance={currentAppearance}
          currentBackground={currentBackground}
          currentIconPack={currentIconPack}
          currentTheme={currentUiTheme}
          onChange={onUiThemeApply}
        />
      </RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Docks" description="Choose which docks appear in your workspace navigation and toolbar." scope="Your account" icon={Grid2X2}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}>
          <LazyDocksSettingsCard
            gitPluginsActive={gitPluginsActive}
            isAdmin={auth?.user?.role === "ADMIN"}
          />
        </RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Panes" description="Choose which non-CLI panes appear in your workspace creation menu and toolbar." scope="Your account" icon={PanelsTopLeft}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}>
          <LazyPanesSettingsCard
            isHarnessEnabled={isHarnessEnabled}
          />
        </RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Widgets" description="Choose which desktop widgets are enabled and float in your workspace." scope="Your account" icon={Sparkles}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyWidgetsSettingsCard /></RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Date & time" description="Time zone, UTC reference, and 24-hour display format." scope="Your account" icon={Clock3}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyDateTimeSettingsCard userId={auth?.user?.id} /></RecoverableSurface>
      </SettingsDisclosure>

      {canManageDiagnostics ? <SettingsDisclosure title="Diagnostics" description="Debug events and screen recording." scope="Installation" icon={Activity}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyAppDiagnosticsSettingsCard canManage={canManageDiagnostics} /></RecoverableSurface>
      </SettingsDisclosure> : null}

      {canManageDiagnostics ? <SettingsDisclosure title="Deploy queue" description="Agent changes on their way to live." scope="Installation" icon={GitMerge}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyDeployQueueSettingsCard /></RecoverableSurface>
      </SettingsDisclosure> : null}

      {canManageCliRuntimes ? <SettingsDisclosure hidden={!adminMode} title="Default provider" description="Choose the provider for new conversations." scope="New sessions" icon={ServerCog}>
      <section className="agent-settings-card settings-flat-card settings-provider-card" aria-label="Global provider settings">
        <div className="agent-settings-section-title settings-flat-heading codex-gated-settings-title">
          <ServerCog aria-hidden="true" />
          <span>
            <strong>Default provider</strong>
            <small>{defaultProvider ? `${defaultProvider.displayName} / ${providerRouteLabel(defaultProvider)}` : "Provider settings loading"}</small>
          </span>
          {!isCodexEnabled ? <span className="status muted">OFF</span> : null}
        </div>
        <label className="provider-default-select settings-flat-row">
          <span className="settings-flat-row-copy">
            <strong>Provider</strong>
            <small>Used by new Chat and agent sessions.</small>
          </span>
          <select
            aria-label="Default provider"
            name="settings-default-provider"
            value={providerSettings?.defaultProviderId ?? ""}
            onChange={(event) => void selectDefaultProvider(event.target.value)}
            disabled={!isCodexEnabled || providerPending || providers.length === 0}
            title={!isCodexEnabled ? "Enable Codex in Settings" : undefined}
          >
            {providers.length ? (
              providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName}
                </option>
              ))
            ) : (
              <option value="">No providers</option>
            )}
          </select>
        </label>
        {providerError ? (
          <DockNotice onDismiss={() => setProviderError(null)}>The default provider could not be changed: {providerError}</DockNotice>
        ) : null}
      </section>

      </SettingsDisclosure> : null}
      {canManageSourceControl ? <SettingsDisclosure hidden={!adminMode} title="GitHub & Gitea" description="Connect repositories and manage publishing credentials." scope="Installation" icon={GitBranch}>
      <RecoverableSurface fallback={settingsCardLoadingFallback}>
        <LazySourceControlPublishingCard canManage={canManageSourceControl} />
      </RecoverableSurface>
      </SettingsDisclosure> : null}

      {canManageCliRuntimes ? <SettingsDisclosure hidden={!adminMode} title="Codex CLI defaults" description="Default model and behavior for new CLI sessions." scope="New sessions" icon={Terminal}>
      <RecoverableSurface fallback={settingsCardLoadingFallback}>
        <LazyCodexCliDefaultsCard client={api} isCodexEnabled={isCodexEnabled} />
      </RecoverableSurface>
      </SettingsDisclosure> : null}

      <SettingsDisclosure title="Git worktrees" description="Default worktree isolation mode for CLI tools." scope="Your account" icon={GitBranch}>
        <section className="agent-settings-card settings-flat-card cli-worktree-settings-card" aria-label="Git Worktrees default settings">
          <div className="agent-settings-section-title settings-flat-heading">
            <GitBranch aria-hidden="true" />
            <span>
              <strong>Git Worktrees</strong>
              <small>{defaultWorktree ? "CLI tools launch in isolated Git branches by default." : "Direct project execution by default."}</small>
            </span>
          </div>
          <SpaceToggle
            className="settings-flat-row settings-flat-toggle-row default-worktree-toggle"
            name="default-worktree-enabled-global"
            ariaLabel="Enable isolated worktrees by default"
            label="Isolated worktrees by default"
            detail="Automatically isolate CLI tools (Gemini, Codex, OpenCode, Hermes) in dedicated Git worktrees for rooms with a project directory."
            checked={defaultWorktree}
            onChange={(checked) => {
              setDefaultWorktree(checked);
              try {
                localStorage.setItem("space.worktree.defaultEnabled", String(checked));
              } catch {}
              if (auth?.isAuthenticated) {
                saveUserSettingDebounced("worktreeDefaultEnabled", checked);
              }
            }}
          />
        </section>
      </SettingsDisclosure>

      {canManageTelegram ? <SettingsDisclosure hidden={!adminMode} title="Telegram notifications" description="Connect Telegram and choose which updates to send." scope="Installation" icon={Bell}>
      <RecoverableSurface fallback={settingsCardLoadingFallback}>
        <LazyTelegramIntegrationCard canManage={canManageTelegram} isCodexEnabled={isCodexEnabled} />
      </RecoverableSurface>
      </SettingsDisclosure> : null}

      <SettingsDisclosure title="Plugins" description="Accounts and services your agents can act through." scope="Installation" icon={Plug}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyPluginsSettingsCard /></RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Voice input" description="Microphone and speech preferences." scope="Your account" icon={Mic}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><VoiceSettingsCard /></RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Keyboard autocorrection" description="Layout detection, Alt+G suggestions, audio alert, and languages." scope="Your account" icon={Keyboard}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyKeyboardAutocorrectSettingsCard /></RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Prompt variables" description="Custom #variable shortcuts, quick expansions, and technical context." scope="Your account" icon={Hash}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyPromptVariablesSettingsCard /></RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Notifications" description="Choose whether your account shows notices." scope="Your account" icon={Bell}>
      <section className="agent-settings-card settings-flat-card suppress-notifications-settings-card" aria-label="Notification settings">
        <div className="agent-settings-section-title settings-flat-heading">
          <Bell aria-hidden="true" />
          <span>
            <strong>Notifications</strong>
            <small>Account-wide toast and status controls.</small>
          </span>
        </div>
        <SpaceToggle
          className="settings-flat-row settings-flat-toggle-row suppress-notifications-toggle"
          name="suppress-notifications-enabled"
          label="Suppress all notifications"
          detail={suppressNotifications ? "All notices are hidden for your account." : "Notices appear normally."}
          checked={suppressNotifications}
          onChange={onSuppressNotificationsChange}
        />
      </section>

      </SettingsDisclosure>

      <SettingsDisclosure
        title="Backup & migration"
        description="Export and import rooms, panes, bookmarks, plans, and settings."
        scope="Installation"
        icon={ArrowUpDown}
      >
        <RecoverableSurface fallback={settingsCardLoadingFallback}>
          <LazyConfigurationMigrationCard canManageInstallation={auth?.user?.role === "ADMIN" || auth?.user?.role === "OPERATOR"} />
        </RecoverableSurface>
      </SettingsDisclosure>
      </SettingsSections>
    </div>
  );
}













function mergeSpaceEvents(current: SpaceEvent[], incoming: SpaceEvent | SpaceEvent[]): SpaceEvent[] {
  const next = new Map<string, SpaceEvent>();
  for (const event of current) {
    next.set(event.id, event);
  }
  for (const event of Array.isArray(incoming) ? incoming : [incoming]) {
    next.set(event.id, event);
  }
  return [...next.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, roomEventLimit);
}













const swarmRoles: SwarmTaskRole[] = ["PLANNER", "WORKER", "REVIEWER"];
const swarmTaskStatuses: SwarmTaskStatus[] = ["READY", "RUNNING", "BLOCKED", "DONE"];
const reconcileDecisions: SwarmReconcileDecision[] = ["MERGED", "BLOCKED", "NEEDS_HUMAN"];












const artifactKinds: Artifact["kind"][] = [
  "SCREENSHOT",
  "DOM_SNAPSHOT",
  "CONSOLE_LOG",
  "NETWORK_LOG",
  "TRACE",
  "VIDEO",
  "PATCH",
  "TRANSCRIPT",
  "EXPORT"
];

const browserEvidenceViewports: BrowserEvidenceViewport[] = ["mobile", "tablet", "desktop", "wide", "ultrawide"];



const reviewCheckStatuses: ReviewCheck["status"][] = ["PASS", "WARN", "FAIL", "SKIPPED", "RUNNING"];
const reviewDiffStatuses: ReviewDiffSummary["status"][] = ["MODIFIED", "ADDED", "DELETED", "RENAMED"];
