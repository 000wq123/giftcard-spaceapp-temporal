import type { CSSProperties, Dispatch, ReactNode, Ref, SetStateAction } from "react";
import { MAX_ROOMS, type AuthMe, type Pane, type Room } from "@space/contracts";
import { api } from "../../api.js";
import { cliRuntimePresentation } from "../../cli-runtime-presentation.js";
import type { SpaceRuntime } from "../../runtime/SpaceRuntime.js";
import { classifyRoomWarmPresentation } from "../../warm-room-startup.js";
import type { PaneCompletionLifecycleState } from "../../pane-completion-lifecycle.js";
import { lazyWithPreload } from "../../lazy-with-preload.js";
import type { ShellMode } from "../pane-grid/pane-grid-layout.js";
import { RoomPaneComposer } from "../room-pane-composer/RoomPaneComposer.js";
import { RecoverableSurface } from "../SurfaceErrorBoundary.js";
import { SpaceToggle } from "../ui-controls/SpaceToggle.js";
import { ChevronDown, Folder, FolderOpen, GitBranch, Plus, Radio, Save, Search, Terminal, Trash2, X } from "../ui-theme/app-icons.js";
import { workspaceRoomActivity } from "../ui-theme/workspace-room-filter.js";
import type { AdminUsers } from "./useAdminUsers.js";
import { ensureProjectFolder } from "./room-catalog.js";
import type { RoomsDock } from "./useRoomsDock.js";

const LazyProjectSourcePicker = lazyWithPreload(() => import("../source-control/ProjectSourcePicker.js").then(module => ({ default: module.ProjectSourcePicker })));

export interface RoomEntry { room: Room; activity: ReturnType<typeof workspaceRoomActivity> }

/** Rooms shown in the dock: own rooms, or the admin's account filter, then the search. */
export function selectRoomEntries({ rooms, selectedRoomId, panes, roomRuntimes, completions, roomCliActivityCounts, isAdminMode, userId, dock, userEmailById }: {
  rooms: Room[];
  selectedRoomId: string | null;
  /** Panes of the active room. */
  panes: Pane[];
  roomRuntimes: Record<string, { panes: Pane[] }>;
  completions: PaneCompletionLifecycleState["panes"];
  roomCliActivityCounts: Record<string, number>;
  isAdminMode: boolean;
  userId: string | undefined;
  dock: Pick<RoomsDock, "roomSearch" | "adminRoomFilterMode" | "adminSelectedUserId">;
  userEmailById: Map<string, string>;
}): { entries: RoomEntry[]; isRoomListFiltered: boolean } {
  const { roomSearch, adminRoomFilterMode, adminSelectedUserId } = dock;
  const entries = rooms.map(room => ({
    room,
    activity: workspaceRoomActivity(room.id === selectedRoomId ? panes : roomRuntimes[room.id]?.panes ?? [], completions, roomCliActivityCounts[room.id])
  })).filter(({ room }) => {
    if (!isAdminMode) {
      if (room.ownerUserId && room.ownerUserId !== userId) return false;
    } else {
      if (adminRoomFilterMode === "mine") {
        if (room.ownerUserId && room.ownerUserId !== userId) return false;
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
  return { entries, isRoomListFiltered };
}

export interface RoomsDockPanelProps {
  /** Only the dock instance measured by useRoomsDockFit gets the ref. */
  panelRef?: Ref<HTMLDivElement>;
  dock: RoomsDock;
  adminUsers: AdminUsers;
  entries: RoomEntry[];
  isRoomListFiltered: boolean;
  catalog: {
    rooms: Room[];
    setRooms: Dispatch<SetStateAction<Room[]>>;
    selectedRoomId: string | null;
    /** Panes of the active room. */
    panes: Pane[];
    roomRuntimes: Record<string, { panes: Pane[]; bootstrappedPaneIds: string[] }>;
    roomPaneLoadStates: Record<string, "loading" | "loaded" | "error">;
    warmRoomIds: string[];
    warmRoomEnabled: boolean;
    roomPaneCounts: Record<string, number>;
    roomCliRuntimeIds: Record<string, string[]>;
  };
  access: {
    auth: AuthMe | null;
    isAdminMode: boolean;
    runtimeKind: SpaceRuntime["kind"] | null;
  };
  actions: {
    createRoom: () => Promise<void>;
    roomCreationPending: boolean;
    selectRoom: (roomId: string, options?: { keepCompactSurfaceOpen?: boolean }) => Promise<void>;
    /** Asks in the app before deleting; running CLI sessions are named in the question. */
    requestRoomDelete: (room: Room) => Promise<void>;
    deletePendingRoomId: string | null;
    setSelectedPaneId: (paneId: string | null) => void;
    addFilesPane: (count?: number, targetRoomId?: string) => Promise<void>;
    addRootAdminPane: (targetRoomId?: string) => Promise<void>;
    isRoomWorktreeEnabled: (roomId: string) => boolean;
    setRoomWorktreeEnabled: (roomId: string, enabled: boolean) => void;
    projectPresets: { label: string; path: string }[];
    reportError: (message: string) => void;
    /** The delete confirmation, rendered at the end of the dock. */
    roomDeleteConfirmDialog: ReactNode;
  };
  composer: {
    preparingRoomId: string | null;
    /** Panes of the room on screen (the outgoing room while the next one prepares). */
    presentationPanes: Pane[];
    presentationRoom: Room | null;
    addRoomPanes: Parameters<typeof RoomPaneComposer>[0]["onApply"];
    openSettingsSurface: () => void;
    shellMode: ShellMode;
    modernColorMode: string;
  };
}

/** The Rooms dock: room list with filters, per-room project settings and the pane composer. */
export function RoomsDockPanel({ panelRef, dock, adminUsers, entries, isRoomListFiltered, catalog, access, actions, composer }: RoomsDockPanelProps) {
  const {
    roomSearch, setRoomSearch, adminRoomFilterMode, setAdminRoomFilterMode, adminSelectedUserId, setAdminSelectedUserId,
    showDownloadBanner, roomListOverflow, roomListMaxHeight, dockExpandedRoomId, setDockExpandedRoomId, dockProjectPathDrafts,
    setDockProjectPathDrafts, dockProjectSavingRoomId, setDockProjectSavingRoomId, isAddingPresetRoomId, setIsAddingPresetRoomId,
    newPresetDraft, setNewPresetDraft, projectPickerRoom, setProjectPickerRoom, roomProjectSources, assignPickedProjectToRoom,
    handleAddNewPreset, saveDockProject, roomReorderPending, draggedRoomId, dragOverRoomId, handleRoomRightPointerDown
  } = dock;
  const { adminUsersList, adminUsersListWithLiveCounts, userEmailById } = adminUsers;
  const { rooms, setRooms, selectedRoomId, panes, roomRuntimes, roomPaneLoadStates, warmRoomIds, warmRoomEnabled, roomPaneCounts, roomCliRuntimeIds } = catalog;
  const { auth, isAdminMode, runtimeKind } = access;
  const {
    createRoom, roomCreationPending, selectRoom, requestRoomDelete, deletePendingRoomId, setSelectedPaneId, addFilesPane, addRootAdminPane,
    isRoomWorktreeEnabled, setRoomWorktreeEnabled, projectPresets, reportError: setError, roomDeleteConfirmDialog
  } = actions;
  const { preparingRoomId, presentationPanes, presentationRoom, addRoomPanes, openSettingsSurface, shellMode, modernColorMode } = composer;
  const filteredRoomEntries = entries;
  return (
    <div
      ref={panelRef}
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
        } as CSSProperties}
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
      {roomDeleteConfirmDialog}
    </div>
  );
}
