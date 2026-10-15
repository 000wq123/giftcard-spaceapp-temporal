import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "@space/contracts";
import { taskTitleMaxCharacters } from "@space/contracts";

const mocks = vi.hoisted(() => ({
  taskItems: vi.fn(),
  createTaskItem: vi.fn(),
  updateTaskItem: vi.fn(),
  deleteTaskItem: vi.fn(),
  clearTaskItems: vi.fn()
}));

vi.mock("../src/api.js", () => ({ api: mocks }));

import { SPACE_TASK_ITEM_MIME } from "../src/features/task-dock/task-events.js";
import { TaskDock } from "../src/features/task-dock/TaskDock.js";
import { liveRuntime } from "../src/live/live-runtime.js";
import { installSpaceRuntime } from "../src/runtime/SpaceRuntime.js";

const item: TaskItem = {
  id: "task:one",
  title: "Verify fallback",
  objective: "Verify the fallback policy before rollout.",
  status: "OPEN",
  source: "MANUAL",
  roomId: "room:one",
  paneId: "pane:one",
  paneTitle: "Model Task",
  occurrenceCount: 2,
  characterCount: 44,
  createdAt: "2026-07-15T11:00:00.000Z",
  lastUsedAt: "2026-07-15T11:18:00.000Z"
};

describe("TaskDock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.taskItems.mockResolvedValue({
      data: [item],
      pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 }
    });
    mocks.createTaskItem.mockImplementation(async (input: { title: string; objective: string; status: TaskItem["status"] }) => ({
      ...item,
      id: "task:manual",
      title: input.title,
      objective: input.objective,
      status: input.status
    }));
    mocks.updateTaskItem.mockImplementation(async (_id: string, input: { status: TaskItem["status"] }) => ({
      ...item,
      status: input.status
    }));
    mocks.deleteTaskItem.mockResolvedValue({ id: item.id, deleted: true });
    mocks.clearTaskItems.mockResolvedValue({ deletedCount: 1 });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
    installSpaceRuntime(liveRuntime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads, copies, drags, filters, and starts a task", async () => {
    const onInsert = vi.fn();
    render(<TaskDock canInsert activePaneLabel="Model Task" onInsert={onInsert} />);

    expect(screen.getByRole("searchbox", { name: "Search tasks" }).getAttribute("name")).toBe("task-search");

    const copyButton = await screen.findByRole("button", { name: "Copy task objective" });
    fireEvent.click(copyButton);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(item.objective));
    expect(await screen.findByText("Copied")).toBeTruthy();

    const setData = vi.fn();
    fireEvent.dragStart(screen.getByRole("button", { name: "Drag task to a CLI" }), {
      dataTransfer: { setData, effectAllowed: "" }
    });
    expect(setData).toHaveBeenCalledWith("text/plain", item.objective);
    expect(setData).toHaveBeenCalledWith(SPACE_TASK_ITEM_MIME, item.id);

    fireEvent.click(screen.getByRole("button", { name: "Start in Model Task" }));
    expect(onInsert).toHaveBeenCalledWith(item);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search tasks" }), { target: { value: "fallback" } });
    fireEvent.click(screen.getByRole("button", { name: "Running" }));
    await waitFor(() => expect(mocks.taskItems).toHaveBeenLastCalledWith({
      q: "fallback",
      status: "RUNNING",
      page: 1,
      pageSize: 100
    }));
  });

  it("creates tasks and supports status, delete, clear, and fullscreen", async () => {
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal("confirm", nativeConfirm);
    render(<TaskDock canInsert={false} activePaneLabel={null} onInsert={vi.fn()} />);
    await screen.findByText("Verify the fallback policy before rollout.");

    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Task title" }), { target: { value: "Manual task" } });
    const objective = screen.getByRole("textbox", { name: "Task objective" });
    fireEvent.change(objective, { target: { value: "manual objective" } });
    fireEvent.click(screen.getByRole("button", { name: "Save task" }));
    await waitFor(() => expect(mocks.createTaskItem).toHaveBeenCalledWith({
      title: "Manual task",
      objective: "manual objective",
      status: "OPEN"
    }));

    const status = screen.getByRole("combobox", { name: "Task status" }) as HTMLSelectElement;
    expect(Array.from(status.options).map((option) => option.textContent)).toEqual(["Open", "Running", "Done", "Archived"]);
    fireEvent.change(status, { target: { value: "RUNNING" } });
    await waitFor(() => expect(mocks.updateTaskItem).toHaveBeenCalledWith(item.id, { status: "RUNNING" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    const deleteDialog = screen.getByRole("alertdialog", { name: "Delete this task?" });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Cancel" }));
    expect(mocks.deleteTaskItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.deleteTaskItem).toHaveBeenCalledWith(item.id));

    fireEvent.click(screen.getByRole("button", { name: "Clear all tasks" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Clear all tasks?" })).getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(mocks.clearTaskItems).toHaveBeenCalled());
    expect(nativeConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open tasks fullscreen" }));
    expect(screen.getByLabelText("Task list").className).toContain("is-fullscreen");
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByLabelText("Task list").className).not.toContain("is-fullscreen");
  });

  it("blocks over-limit titles and shows a spinning Save while saving", async () => {
    let finishSave: (value: TaskItem) => void = () => undefined;
    mocks.createTaskItem.mockImplementation(() => new Promise<TaskItem>((resolve) => { finishSave = resolve; }));
    render(<TaskDock canInsert activePaneLabel="Model Task" onInsert={vi.fn()} />);
    await screen.findByText("Verify the fallback policy before rollout.");
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Task title" }), { target: { value: "x".repeat(taskTitleMaxCharacters + 1) } });
    fireEvent.change(screen.getByRole("textbox", { name: "Task objective" }), { target: { value: "objective" } });
    expect(screen.getByText(`Title is over ${taskTitleMaxCharacters} characters`)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save task" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: "Task title" }), { target: { value: "Short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save task" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save task" }).querySelector(".dock-kit-spin")).toBeTruthy());
    await act(async () => finishSave(item));
  });

  it("reports copy failures instead of failing silently", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<TaskDock canInsert activePaneLabel="Model Task" onInsert={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy task objective" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Clipboard access was unavailable");
  });

  it("keeps the last tasks visible with a dismissible notice when a refresh fails", async () => {
    mocks.taskItems.mockRejectedValueOnce(new Error("Network down"));
    render(<TaskDock canInsert activePaneLabel="Model Task" onInsert={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Network down");
    expect(screen.getByText("Verify the fallback policy before rollout.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an empty state when no tasks match", async () => {
    mocks.taskItems.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 }
    });
    render(<TaskDock canInsert activePaneLabel="Model Task" onInsert={vi.fn()} />);
    expect(await screen.findByText("No tasks yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add your first task" }));
    expect(screen.getByRole("textbox", { name: "Task title" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText("No tasks match this view.")).toBeTruthy();
  });
});
