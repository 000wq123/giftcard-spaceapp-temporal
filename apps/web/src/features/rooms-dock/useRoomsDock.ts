import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type MutableRefObject, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import type { OpenProjectResult, Room } from "@space/contracts";
import { api } from "../../api.js";
import type { SideSurface } from "../docks/dock-types.js";
import { ensureProjectFolder, reorderRoomsById, sortRoomsByOrder } from "./room-catalog.js";

// The Rooms dock: search and account filters, per-room project settings, the
// shared project picker, right-button drag reordering and the download banner fit.

export type AdminRoomFilterMode = "mine" | "all" | "user";

export interface RoomsDockContext {
  rooms: Room[];
  setRooms: Dispatch<SetStateAction<Room[]>>;
  /** Shows a workspace error banner. */
  reportError: (message: string | null) => void;
  /** Saves a named project preset (a user preference). */
  addNamedProjectPreset: (label: string, path: string) => void;
}

export interface RoomsDock {
  roomSearch: string;
  setRoomSearch: (search: string) => void;
  adminRoomFilterMode: AdminRoomFilterMode;
  setAdminRoomFilterMode: (mode: AdminRoomFilterMode) => void;
  adminSelectedUserId: string;
  setAdminSelectedUserId: (userId: string) => void;
  roomsPanelRef: MutableRefObject<HTMLDivElement | null>;
  /** Download banner and room-list height; measured by useRoomsDockFit. */
  showDownloadBanner: boolean;
  setShowDownloadBanner: Dispatch<SetStateAction<boolean>>;
  roomListOverflow: boolean;
  setRoomListOverflow: Dispatch<SetStateAction<boolean>>;
  roomListMaxHeight: number | null;
  setRoomListMaxHeight: Dispatch<SetStateAction<number | null>>;
  dockExpandedRoomId: string | null;
  setDockExpandedRoomId: Dispatch<SetStateAction<string | null>>;
  /** Project path drafts per room; also the fallback project of new CLI panes. */
  dockProjectPathDrafts: Record<string, string>;
  setDockProjectPathDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  dockProjectSavingRoomId: string | null;
  setDockProjectSavingRoomId: (roomId: string | null) => void;
  isAddingPresetRoomId: string | null;
  setIsAddingPresetRoomId: (roomId: string | null) => void;
  newPresetDraft: string;
  setNewPresetDraft: (draft: string) => void;
  projectPickerRoom: { id: string; name: string } | null;
  setProjectPickerRoom: (room: { id: string; name: string } | null) => void;
  roomProjectSources: Record<string, string>;
  assignPickedProjectToRoom: (roomId: string, result: OpenProjectResult) => Promise<void>;
  handleAddNewPreset: (roomId: string) => Promise<void>;
  saveDockProject: (roomId: string) => Promise<void>;
  roomReorderPending: boolean;
  draggedRoomId: string | null;
  dragOverRoomId: string | null;
  handleRoomRightPointerDown: (event: ReactPointerEvent<HTMLElement>, roomId: string) => void;
}

export function useRoomsDock({ rooms, setRooms, reportError, addNamedProjectPreset }: RoomsDockContext): RoomsDock {
  const [roomSearch, setRoomSearch] = useState("");
  const [adminRoomFilterMode, setAdminRoomFilterMode] = useState<AdminRoomFilterMode>("mine");
  const [adminSelectedUserId, setAdminSelectedUserId] = useState<string>("");
  const roomsPanelRef = useRef<HTMLDivElement | null>(null);
  const [showDownloadBanner, setShowDownloadBanner] = useState(true);
  const [roomListOverflow, setRoomListOverflow] = useState(false);
  const [roomListMaxHeight, setRoomListMaxHeight] = useState<number | null>(null);
  const [dockExpandedRoomId, setDockExpandedRoomId] = useState<string | null>(null);
  const [dockProjectPathDrafts, setDockProjectPathDrafts] = useState<Record<string, string>>({});
  const [dockProjectSavingRoomId, setDockProjectSavingRoomId] = useState<string | null>(null);
  const [isAddingPresetRoomId, setIsAddingPresetRoomId] = useState<string | null>(null);
  const [newPresetDraft, setNewPresetDraft] = useState("");
  // Shared project picker: a room assignment is bound to the room that opened the picker.
  const [projectPickerRoom, setProjectPickerRoom] = useState<{ id: string; name: string } | null>(null);
  const [roomProjectSources, setRoomProjectSources] = useState<Record<string, string>>({});
  const latestRoomsRef = useRef(rooms);
  latestRoomsRef.current = rooms;

  async function assignPickedProjectToRoom(roomId: string, result: OpenProjectResult) {
    const targetRoom = latestRoomsRef.current.find((r) => r.id === roomId);
    if (!targetRoom) throw new Error("The room was removed. The project is ready; choose it again from another room.");
    const updated = await api.updateRoom(roomId, { name: targetRoom.name, projectPath: result.projectPath });
    setRooms((current) => current.map((r) => (r.id === roomId ? updated : r)));
    setDockProjectPathDrafts((prev) => ({ ...prev, [roomId]: result.projectPath }));
    setRoomProjectSources((prev) => ({ ...prev, [roomId]: `${result.source.label}${result.source.detail ? ` · ${result.source.detail}` : ""}` }));
  }

  async function handleAddNewPreset(roomId: string) {
    const name = newPresetDraft.trim();
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) return;
    const projectPath = `/opt/spaceapp/projects/${name}`;
    await ensureProjectFolder(projectPath);
    addNamedProjectPreset(name, projectPath);
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
        reportError(err instanceof Error ? err.message : "Failed to save project");
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
      reportError(err instanceof Error ? err.message : "Failed to update project path");
    } finally {
      setDockProjectSavingRoomId(null);
    }
  }

  const [roomReorderPending, setRoomReorderPending] = useState(false);
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
  const [dragOverRoomId, setDragOverRoomId] = useState<string | null>(null);
  const dragOverRoomIdRef = useRef<string | null>(null);
  const roomPointerDragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => roomPointerDragCleanupRef.current?.(), []);

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
    reportError(null);
    try {
      const reorderedRooms = await api.reorderRooms(nextRooms.map((room) => room.id));
      setRooms(sortRoomsByOrder(reorderedRooms));
    } catch (err) {
      setRooms(previousRooms);
      reportError(err instanceof Error ? err.message : "Room reorder failed");
    } finally {
      setRoomReorderPending(false);
    }
  }

  return {
    roomSearch,
    setRoomSearch,
    adminRoomFilterMode,
    setAdminRoomFilterMode,
    adminSelectedUserId,
    setAdminSelectedUserId,
    roomsPanelRef,
    showDownloadBanner,
    setShowDownloadBanner,
    roomListOverflow,
    setRoomListOverflow,
    roomListMaxHeight,
    setRoomListMaxHeight,
    dockExpandedRoomId,
    setDockExpandedRoomId,
    dockProjectPathDrafts,
    setDockProjectPathDrafts,
    dockProjectSavingRoomId,
    setDockProjectSavingRoomId,
    isAddingPresetRoomId,
    setIsAddingPresetRoomId,
    newPresetDraft,
    setNewPresetDraft,
    projectPickerRoom,
    setProjectPickerRoom,
    roomProjectSources,
    assignPickedProjectToRoom,
    handleAddNewPreset,
    saveDockProject,
    roomReorderPending,
    draggedRoomId,
    dragOverRoomId,
    handleRoomRightPointerDown
  };
}

/**
 * Shows the download banner only when the rooms, the pane composer and the banner fit,
 * and caps the room list height otherwise. Measures while the Rooms dock is active.
 * `layoutKey`: the values that change the dock's content height (a fixed-length list).
 */
export function useRoomsDockFit(dock: RoomsDock, activeSideSurface: SideSurface, layoutKey: readonly unknown[]): void {
  const { roomsPanelRef, setShowDownloadBanner, setRoomListOverflow, setRoomListMaxHeight } = dock;
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
  }, [activeSideSurface, ...layoutKey]);
}
