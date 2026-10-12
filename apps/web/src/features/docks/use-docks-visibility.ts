import { useCallback, useEffect, useMemo, useState } from "react";
import { getSpaceRuntime } from "../../runtime/SpaceRuntime.js";
import {
  Archive,
  Bot,
  Clipboard,
  FolderOpen,
  GitBranch,
  Images,
  Link,
  ListTodo,
  MessageSquare,
  PanelLeft,
  Radio,
  Settings2,
  Terminal,
  type LucideIcon
} from "../ui-theme/app-icons.js";
import type { SideSurface } from "./dock-types.js";
import { saveUserSettingDebounced } from "../user-settings/user-settings-save-queue.js";

export const DOCKS_HIDDEN_STORAGE_KEY = "space:docks-hidden:v1";
export const DOCKS_VISIBILITY_EVENT = "space:docks-visibility-changed";
export const NON_HIDEABLE_DOCK_IDS = new Set<SideSurface>(["settings"]);

export interface DockItemConfig {
  id: SideSurface;
  label: string;
  description: string;
  icon: LucideIcon;
  requiresGitPlugin?: boolean;
  requiresAdmin?: boolean;
  locked?: boolean;
}

export const DOCK_DEFINITIONS: DockItemConfig[] = [
  {
    id: "rooms",
    label: "Rooms",
    description: "Choose a room or organize your workspace.",
    icon: PanelLeft
  },
  {
    id: "room-agent",
    label: "Room Agent",
    description: "Ask an assistant to coordinate this room.",
    icon: Bot
  },
  {
    id: "shared-chat",
    label: "Shared Chat",
    description: "A shared conversation for everyone in the room.",
    icon: MessageSquare
  },
  {
    id: "media",
    label: "Media",
    description: "Images, recordings, and other media.",
    icon: Images
  },
  {
    id: "agent-files",
    label: "Agent Files",
    description: "Preview and download files created by agents.",
    icon: FolderOpen
  },
  {
    id: "clipboard",
    label: "Clipboard",
    description: "Saved text, notes, and plans.",
    icon: Clipboard
  },
  {
    id: "tasks",
    label: "Tasks",
    description: "Follow tasks and their progress.",
    icon: ListTodo
  },
  {
    id: "links",
    label: "Links",
    description: "Bookmarks and browser connections.",
    icon: Link
  },
  {
    id: "cli",
    label: "CLI tools",
    description: "Manage coding tools and their connections.",
    icon: Terminal
  },
  {
    id: "agent-sessions",
    label: "Sessions",
    description: "Find previous work and resume sessions.",
    icon: Archive
  },
  {
    id: "source-control",
    label: "Source Control",
    description: "Open projects, review changes and sync with your repository providers. Works without a connected account.",
    icon: GitBranch
  },
  {
    id: "settings",
    label: "Settings",
    description: "Appearance, notifications, and preferences.",
    icon: Settings2,
    locked: true
  },
  {
    id: "streaming",
    label: "Streaming",
    description: "Manage live broadcasts and overlays.",
    icon: Radio,
    requiresAdmin: true
  }
];

export const VALID_DOCK_IDS = new Set<string>(DOCK_DEFINITIONS.map((dock) => dock.id));

function getStorage(customStorage?: Storage): Storage | null {
  if (customStorage) return customStorage;
  try {
    return getSpaceRuntime().platform.localStorage;
  } catch {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    return null;
  }
}

export function normalizeHiddenDockIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const valid = values.filter(
    (id): id is string => typeof id === "string" && VALID_DOCK_IDS.has(id) && !NON_HIDEABLE_DOCK_IDS.has(id as SideSurface)
  );
  return Array.from(new Set(valid));
}

export function readHiddenDockIds(customStorage?: Storage): string[] {
  try {
    const storage = getStorage(customStorage);
    if (!storage) return [];
    const raw = storage.getItem(DOCKS_HIDDEN_STORAGE_KEY);
    if (!raw) return [];
    return normalizeHiddenDockIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeHiddenDockIds(hiddenIds: string[], customStorage?: Storage): void {
  try {
    const storage = getStorage(customStorage);
    const normalized = normalizeHiddenDockIds(hiddenIds);
    if (storage) {
      if (normalized.length > 0) {
        storage.setItem(DOCKS_HIDDEN_STORAGE_KEY, JSON.stringify(normalized));
      } else {
        storage.removeItem(DOCKS_HIDDEN_STORAGE_KEY);
      }
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(DOCKS_VISIBILITY_EVENT, { detail: normalized }));
    }
  } catch {
    // Ignore storage errors in restrictive environments
  }
}

export function useDocksVisibility(customStorage?: Storage) {
  const [hiddenDockIds, setHiddenDockIds] = useState<string[]>(() => readHiddenDockIds(customStorage));

  useEffect(() => {
    const handleUpdate = () => {
      setHiddenDockIds(readHiddenDockIds(customStorage));
    };
    if (typeof window !== "undefined") {
      window.addEventListener(DOCKS_VISIBILITY_EVENT, handleUpdate);
      window.addEventListener("storage", handleUpdate);
      return () => {
        window.removeEventListener(DOCKS_VISIBILITY_EVENT, handleUpdate);
        window.removeEventListener("storage", handleUpdate);
      };
    }
  }, [customStorage]);

  const hiddenSet = useMemo(() => new Set(hiddenDockIds), [hiddenDockIds]);

  const isDockHidden = useCallback((id: SideSurface) => {
    if (NON_HIDEABLE_DOCK_IDS.has(id)) return false;
    return hiddenSet.has(id);
  }, [hiddenSet]);

  const isDockVisible = useCallback((id: SideSurface) => {
    if (NON_HIDEABLE_DOCK_IDS.has(id)) return true;
    return !hiddenSet.has(id);
  }, [hiddenSet]);

  const hideDock = useCallback(
    (id: SideSurface) => {
      if (NON_HIDEABLE_DOCK_IDS.has(id) || !VALID_DOCK_IDS.has(id) || hiddenSet.has(id)) return;
      const next = [...hiddenDockIds, id];
      writeHiddenDockIds(next, customStorage);
      setHiddenDockIds(next);
      saveUserSettingDebounced("docksHidden", next);
    },
    [customStorage, hiddenDockIds, hiddenSet]
  );

  const showDock = useCallback(
    (id: SideSurface) => {
      if (!hiddenSet.has(id)) return;
      const next = hiddenDockIds.filter((hiddenId) => hiddenId !== id);
      writeHiddenDockIds(next, customStorage);
      setHiddenDockIds(next);
      saveUserSettingDebounced("docksHidden", next);
    },
    [customStorage, hiddenDockIds, hiddenSet]
  );

  const toggleDock = useCallback(
    (id: SideSurface) => {
      if (NON_HIDEABLE_DOCK_IDS.has(id)) return;
      if (hiddenSet.has(id)) {
        showDock(id);
      } else {
        hideDock(id);
      }
    },
    [hiddenSet, hideDock, showDock]
  );

  const resetDocks = useCallback(() => {
    writeHiddenDockIds([], customStorage);
    setHiddenDockIds([]);
    saveUserSettingDebounced("docksHidden", []);
  }, [customStorage]);

  return {
    hiddenDockIds,
    isDockHidden,
    isDockVisible,
    hideDock,
    showDock,
    toggleDock,
    resetDocks
  };
}
