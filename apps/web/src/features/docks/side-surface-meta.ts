import {
  Activity,
  Archive,
  Bot,
  Clipboard,
  FolderOpen,
  GitBranch,
  Images,
  Link as LinkIcon,
  ListTodo,
  MessageSquare,
  PanelLeft,
  Radio,
  Settings2,
  Terminal,
  type LucideIcon
} from "../ui-theme/app-icons.js";
import type { SideSurface } from "./dock-types.js";

export const sideSurfaceMeta: Record<SideSurface, { icon: LucideIcon; label: string; surfaceLabel: string }> = {
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
