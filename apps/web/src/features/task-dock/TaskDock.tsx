import {
  GripVertical,
  ListTodo,
  Play,
  Plus,
  Trash2
} from "../ui-theme/app-icons.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { AnimatedNumber } from "../ui-controls/AnimatedNumber.js";
import type { TaskItem, TaskStatus } from "@space/contracts";
import { taskObjectiveMaxCharacters, taskTitleMaxCharacters } from "@space/contracts";
import { api } from "../../api.js";
import { DEMO_LOCAL_REPLY, getSpaceRuntime } from "../../runtime/SpaceRuntime.js";
import {
  SPACE_TASK_ITEM_MIME,
  SPACE_TASK_UPDATED_EVENT,
  notifyTasksUpdated
} from "./task-events.js";
import {
  formatAppDateTime,
  DATE_TIME_SETTINGS_UPDATED_EVENT
} from "../date-time-settings/date-time-settings.js";
import { useIsDockActive } from "../docks/dock-active-context.js";
import {
  DockButton,
  DockChips,
  DockFullscreenButton,
  DockIconButton,
  DockNotice,
  DockSearch,
  DockState,
  DockToolbar,
  useDockConfirm,
  useDockFullscreen
} from "../dock-kit/DockKit.js";

let cachedTaskItems: TaskItem[] | null = null;
let cachedTaskTotal = 0;

interface TaskDockProps {
  canInsert: boolean;
  activePaneLabel: string | null;
  onInsert: (item: TaskItem) => void;
}

type StatusFilter = "ALL" | TaskStatus;

const statusLabels: Record<TaskStatus, string> = {
  OPEN: "Open",
  RUNNING: "Running",
  DONE: "Done",
  ARCHIVED: "Archived"
};

const statusFilters: Array<{ id: StatusFilter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "OPEN", label: "Open" },
  { id: "RUNNING", label: "Running" },
  { id: "DONE", label: "Done" },
  { id: "ARCHIVED", label: "Archived" }
];

const statusTone: Record<TaskStatus, string> = {
  OPEN: "is-accent",
  RUNNING: "is-warning",
  DONE: "is-success",
  ARCHIVED: ""
};

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return formatAppDateTime(date);
}

const acceptedStatuses: TaskStatus[] = ["OPEN", "RUNNING", "DONE", "ARCHIVED"];

export function TaskDock({ canInsert, activePaneLabel, onInsert }: TaskDockProps) {
  const runtime = getSpaceRuntime();
  const isDockActive = useIsDockActive();
  const { confirm, confirmDialog } = useDockConfirm();
  const [items, setItems] = useState<TaskItem[]>(() => cachedTaskItems ?? []);
  const [totalItems, setTotalItems] = useState(() => cachedTaskTotal);
  const [hasLoaded, setHasLoaded] = useState(() => cachedTaskItems !== null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useDockFullscreen();
  const [isAdding, setIsAdding] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualObjective, setManualObjective] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [taskListRef] = useAutoAnimate();
  const titleCharacters = Array.from(manualTitle).length;
  const objectiveCharacters = Array.from(manualObjective).length;
  const titleTooLong = titleCharacters > taskTitleMaxCharacters;
  const objectiveTooLong = objectiveCharacters > taskObjectiveMaxCharacters;
  const isFiltered = Boolean(search.trim()) || statusFilter !== "ALL";

  const loadItems = useCallback(async () => {
    try {
      const payload = await api.taskItems({
        ...(search.trim() ? { q: search.trim() } : {}),
        ...(statusFilter === "ALL" ? {} : { status: statusFilter }),
        page: 1,
        pageSize: 100
      });
      setItems(payload.data);
      setTotalItems(payload.pagination.totalItems);
      setLoadError(null);
      if (!search.trim() && statusFilter === "ALL") {
        cachedTaskItems = payload.data;
        cachedTaskTotal = payload.pagination.totalItems;
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Tasks could not be loaded.");
    } finally {
      setHasLoaded(true);
    }
  }, [search, statusFilter]);

  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      void loadItems();
      return;
    }
    const timer = window.setTimeout(() => void loadItems(), 150);
    return () => window.clearTimeout(timer);
  }, [loadItems]);

  useEffect(() => {
    const refresh = () => void loadItems();
    window.addEventListener(SPACE_TASK_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(SPACE_TASK_UPDATED_EVENT, refresh);
    };
  }, [loadItems]);

  useEffect(() => {
    if (!isDockActive) return;
    const refresh = () => void loadItems();
    const poll = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(poll);
  }, [isDockActive, loadItems]);

  const [, setDateTimeTick] = useState(0);
  useEffect(() => {
    const handleSettingsUpdate = () => setDateTimeTick((c) => c + 1);
    window.addEventListener(DATE_TIME_SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
    return () => window.removeEventListener(DATE_TIME_SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
  }, []);

  async function copyItem(item: TaskItem) {
    try {
      if (!runtime.platform.clipboard?.writeText) throw new DOMException("Clipboard access is unavailable.", "NotSupportedError");
      await runtime.platform.clipboard.writeText(item.objective);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 1_500);
    } catch {
      setError("Clipboard access was unavailable. Select the objective and copy it manually.");
    }
  }

  function closeEditor() {
    setManualTitle("");
    setManualObjective("");
    setIsAdding(false);
  }

  async function saveTask() {
    if (!manualTitle.trim() || !manualObjective.trim() || titleTooLong || objectiveTooLong) return;
    try {
      setSaving(true);
      await api.createTaskItem({
        title: manualTitle.trim(),
        objective: manualObjective.trim(),
        status: "OPEN"
      });
      closeEditor();
      notifyTasksUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function setTaskStatus(item: TaskItem, status: TaskStatus) {
    if (status === item.status) return;
    try {
      setUpdatingId(item.id);
      await api.updateTaskItem(item.id, { status });
      notifyTasksUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task status could not be updated.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteItem(item: TaskItem) {
    if (!await confirm({ title: "Delete this task?", message: `"${item.title}" will be removed.`, confirmLabel: "Delete" })) return;
    try {
      await api.deleteTaskItem(item.id);
      notifyTasksUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task could not be deleted.");
    }
  }

  async function clearAll() {
    if (!await confirm({ title: "Clear all tasks?", message: "Every task in your list will be removed. This cannot be undone.", confirmLabel: "Clear all" })) return;
    try {
      await api.clearTaskItems();
      notifyTasksUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tasks could not be cleared.");
    }
  }

  return (
    <section
      className={`task-dock-shell dock-kit-shell${isFullscreen ? " is-fullscreen" : ""}`}
      aria-label="Task list"
    >
      <div className="task-dock dock-kit-dock">
        <DockToolbar
          title={isFullscreen ? "Tasks" : undefined}
          summary={<><strong><AnimatedNumber value={totalItems} /></strong> task{totalItems === 1 ? "" : "s"} · private to you</>}
        >
          <DockIconButton label="Add task" icon={Plus} tone="primary" aria-expanded={isAdding} onClick={() => setIsAdding(true)} />
          <DockIconButton label="Clear all tasks" icon={Trash2} tone="danger" disabled={!totalItems} onClick={() => void clearAll()} />
          <DockFullscreenButton name="tasks" active={isFullscreen} onToggle={() => setIsFullscreen((value) => !value)} />
        </DockToolbar>

        <div className="dock-kit-controls">
          <DockSearch name="task-search" label="Search tasks" value={search} onChange={setSearch} />
          <DockChips label="Task statuses" options={statusFilters} value={statusFilter} onChange={setStatusFilter} />
        </div>

        {isAdding ? (
          <div className="dock-kit-editor">
            <input className="dock-kit-field" type="text" autoFocus aria-label="Task title" placeholder="Task title" value={manualTitle}
              maxLength={taskTitleMaxCharacters + 1}
              onChange={(event) => setManualTitle(event.currentTarget.value)} />
            <textarea className="dock-kit-field" aria-label="Task objective"
              placeholder="What should the agent do? Drag the task onto a CLI or press Start to send it."
              value={manualObjective} maxLength={taskObjectiveMaxCharacters + 1}
              onChange={(event) => setManualObjective(event.currentTarget.value)} />
            <div className="dock-kit-editor-footer">
              <span className={`dock-kit-counter${titleTooLong || objectiveTooLong ? " is-over" : ""}`}>
                {titleTooLong ? `Title is over ${taskTitleMaxCharacters} characters` : `${objectiveCharacters.toLocaleString()} / ${taskObjectiveMaxCharacters.toLocaleString()}`}
              </span>
              <DockButton tone="ghost" onClick={closeEditor} aria-label="Cancel task">Cancel</DockButton>
              <DockButton tone="primary" busy={saving} onClick={() => void saveTask()}
                disabled={!manualTitle.trim() || !manualObjective.trim() || titleTooLong || objectiveTooLong || saving}
                aria-label="Save task">Save</DockButton>
            </div>
          </div>
        ) : null}

        {error ? <DockNotice onDismiss={() => setError(null)}>{error}</DockNotice> : null}
        {loadError && items.length ? <DockNotice onDismiss={() => setLoadError(null)}>{loadError}</DockNotice> : null}

        {!items.length ? (
          !hasLoaded ? (
            <DockState kind="loading" title="Loading tasks…" />
          ) : loadError ? (
            <DockState kind="error" title="Tasks could not be loaded" detail={loadError} action={{ label: "Try again", onClick: () => void loadItems() }} />
          ) : isFiltered ? (
            <DockState kind="empty" icon={ListTodo} title="No tasks match this view." detail="Change the search or the status filter." />
          ) : (
            <DockState kind="empty" icon={ListTodo} title="No tasks yet" detail="Add a task, then drag it onto a CLI or press Start to send it."
              action={{ label: "Add your first task", icon: Plus, onClick: () => setIsAdding(true) }} />
          )
        ) : null}

        <div ref={taskListRef} className="task-list dock-kit-list" role="list" aria-label="Task items" hidden={!items.length}>
          {items.map((item) => {
            const expanded = expandedIds.has(item.id);
            const isLong = item.characterCount > 360;
            return (
            <article className={`task-card dock-kit-card is-${item.status.toLocaleLowerCase()} ${statusTone[item.status]}${item.status === "ARCHIVED" ? " is-muted" : ""}`} role="listitem" key={item.id}>
              <div className="dock-kit-meta">
                <span className={`dock-kit-badge ${statusTone[item.status]}`}>{statusLabels[item.status]}</span>
                <span className="dock-kit-meta-text">{item.source === "AGENT" ? "Agent" : "Manual"} · {item.paneTitle ?? "Space"} · {timeLabel(item.lastUsedAt)}</span>
                {item.occurrenceCount > 1 ? <span className="dock-kit-badge">Used {item.occurrenceCount}×</span> : null}
              </div>
              <div className="dock-kit-card-title">{item.title}</div>
              <button className={`task-card-objective${expanded ? " expanded" : ""}`} onClick={() => void copyItem(item)}
                aria-label="Copy task objective" title="Click to copy">{item.objective}</button>
              {copiedId === item.id ? (
                <span className="task-copied" role="status">{runtime.kind === "demo" ? DEMO_LOCAL_REPLY : "Copied"}</span>
              ) : null}
              {isLong ? <DockButton tone="ghost" className="task-expand" onClick={() => setExpandedIds((current) => {
                const next = new Set(current);
                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                return next;
              })}>{expanded ? "Collapse" : "Expand"}</DockButton> : null}
              <div className="dock-kit-card-actions">
                <select className="dock-kit-select task-status-select" aria-label="Task status" value={item.status}
                  disabled={updatingId === item.id}
                  onChange={(event) => void setTaskStatus(item, event.currentTarget.value as TaskStatus)}>
                  {acceptedStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                </select>
                <DockIconButton label="Drag task to a CLI" icon={GripVertical} className="task-drag-handle" draggable onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("text/plain", item.objective);
                  event.dataTransfer.setData(SPACE_TASK_ITEM_MIME, item.id);
                }} />
                <DockButton icon={Play} tone="primary" disabled={!canInsert} onClick={() => onInsert(item)}
                  aria-label={`Start in ${activePaneLabel ?? "active pane"}`}
                  title={canInsert ? `Start in ${activePaneLabel ?? "active pane"}` : "Select a CLI or chat pane to start this task"}>Start</DockButton>
                <DockIconButton label="Delete task" icon={Trash2} tone="danger" onClick={() => void deleteItem(item)} />
              </div>
            </article>
            );
          })}
        </div>
      </div>
      {confirmDialog}
    </section>
  );
}
