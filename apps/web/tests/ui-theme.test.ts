import { describe, expect, it } from "vitest";
import {
  MODERN_APPEARANCE_STORAGE_KEY,
  MODERN_ICON_PACK_STORAGE_KEY,
  MODERN_TOOLBAR_MIGRATION_MARKER_SUFFIX,
  UI_BACKGROUND_STORAGE_KEY,
  UI_THEME_STORAGE_KEY,
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
  writeUiTheme
} from "../src/ui-theme.js";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("Space UI theme preferences", () => {
  it("uses Modern by default while preserving an explicit Classic preference", () => {
    const storage = new MemoryStorage();

    expect(readUiTheme(storage)).toBe("modern");

    storage.setItem(UI_THEME_STORAGE_KEY, "unknown");
    expect(readUiTheme(storage)).toBe("modern");

    storage.setItem(UI_THEME_STORAGE_KEY, "classic");
    expect(readUiTheme(storage)).toBe("classic");
    expect(writeUiTheme(storage, "codex")).toBe("codex");
    expect(readUiTheme(storage)).toBe("codex");
    expect(writeUiTheme(storage, "motion")).toBe("motion");
    expect(readUiTheme(storage)).toBe("motion");
    expect(writeUiTheme(storage, "aurora")).toBe("aurora");
    expect(readUiTheme(storage)).toBe("aurora");
  });

  it("stores the opt-in Modern selection without touching Classic theme keys", () => {
    const storage = new MemoryStorage();
    storage.setItem("space.room.theme", "forest");

    expect(writeUiTheme(storage, "modern")).toBe("modern");
    expect(storage.getItem(UI_THEME_STORAGE_KEY)).toBe("modern");
    expect(storage.getItem("space.room.theme")).toBe("forest");
  });

  it("defaults Modern appearance to System and resolves the current color mode", () => {
    const storage = new MemoryStorage();

    expect(readModernAppearance(storage)).toBe("system");
    expect(resolveModernColorMode("system", true)).toBe("dark");
    expect(resolveModernColorMode("system", false)).toBe("light");
    expect(resolveModernColorMode("dark", false)).toBe("dark");
    expect(resolveModernColorMode("light", true)).toBe("light");
  });

  it("keeps DOM layout measurement on Classic and lets Modern use stable CSS layout", () => {
    expect(shouldMeasureToolbarLayout("classic")).toBe(true);
    expect(shouldMeasureToolbarLayout("modern")).toBe(false);
  });

  it("stores Modern appearance in an isolated namespace", () => {
    const storage = new MemoryStorage();
    storage.setItem("space.room.theme", "copper");

    expect(writeModernAppearance(storage, "light")).toBe("light");
    expect(storage.getItem(MODERN_APPEARANCE_STORAGE_KEY)).toBe("light");
    expect(storage.getItem("space.room.theme")).toBe("copper");
  });

  it("stores a Modern-only icon pack with Lucide as the safe default", () => {
    const storage = new MemoryStorage();
    storage.setItem("space.room.theme", "forest");

    expect(readModernIconPack(storage)).toBe("lucide");
    storage.setItem(MODERN_ICON_PACK_STORAGE_KEY, "unsupported");
    expect(readModernIconPack(storage)).toBe("lucide");
    expect(writeModernIconPack(storage, "material-rounded")).toBe("material-rounded");
    expect(storage.getItem(MODERN_ICON_PACK_STORAGE_KEY)).toBe("material-rounded");
    expect(writeModernIconPack(storage, "motion")).toBe("motion");
    expect(readModernIconPack(storage)).toBe("motion");
    expect(storage.getItem(MODERN_ICON_PACK_STORAGE_KEY)).toBe("motion");
    expect(writeModernIconPack(storage, "aurora")).toBe("aurora");
    expect(readModernIconPack(storage)).toBe("aurora");
    expect(storage.getItem("space.room.theme")).toBe("forest");
  });

  it("provides only Modern-namespaced room and pane toolbar keys", () => {
    expect(modernRoomToolbarStorageKeys()).toEqual({
      hidden: "space.modern.toolbar.room.hiddenActionIds.v1",
      order: "space.modern.toolbar.room.actionOrder.v1"
    });
    expect(modernPaneToolbarStorageKeys("CHAT")).toEqual({
      hidden: "space.modern.toolbar.pane.sharedCodex.hiddenActionIds.v1",
      order: "space.modern.toolbar.pane.sharedCodex.actionOrder.v1"
    });
    expect(modernPaneToolbarStorageKeys("TERMINAL")).toEqual(modernPaneToolbarStorageKeys("CHAT"));
    expect(modernPaneToolbarStorageKeys("BROWSER")).toEqual({
      hidden: "space.modern.toolbar.pane.BROWSER.hiddenActionIds.v1",
      order: "space.modern.toolbar.pane.BROWSER.actionOrder.v1"
    });
  });

  it("copies a Classic toolbar preference once without writing to the Classic key", () => {
    const storage = new MemoryStorage();
    const classicKey = "space.roomToolbar.hiddenActionIds.v3";
    const modernKey = modernRoomToolbarStorageKeys().hidden;
    storage.setItem(classicKey, JSON.stringify(["theme", "clip-tool"]));

    migrateModernToolbarPreference(storage, classicKey, modernKey);

    expect(storage.getItem(modernKey)).toBe(JSON.stringify(["theme", "clip-tool"]));
    expect(storage.getItem(classicKey)).toBe(JSON.stringify(["theme", "clip-tool"]));
    expect(storage.getItem(`${modernKey}${MODERN_TOOLBAR_MIGRATION_MARKER_SUFFIX}`)).toBe("true");

    storage.removeItem(modernKey);
    storage.setItem(classicKey, JSON.stringify(["reload-room"]));
    migrateModernToolbarPreference(storage, classicKey, modernKey);

    expect(storage.getItem(modernKey)).toBeNull();
    expect(storage.getItem(classicKey)).toBe(JSON.stringify(["reload-room"]));
  });

  it("preserves an existing Modern toolbar preference during first-use migration", () => {
    const storage = new MemoryStorage();
    const classicKey = "space.browserToolbar.actionOrder";
    const modernKey = modernPaneToolbarStorageKeys("BROWSER").order;
    storage.setItem(classicKey, JSON.stringify(["refresh", "stop"]));
    storage.setItem(modernKey, JSON.stringify(["stop", "refresh"]));

    migrateModernToolbarPreference(storage, classicKey, modernKey);

    expect(storage.getItem(modernKey)).toBe(JSON.stringify(["stop", "refresh"]));
    expect(storage.getItem(classicKey)).toBe(JSON.stringify(["refresh", "stop"]));
  });

  it("stores and reads UI background with spaceapp as default", () => {
    const storage = new MemoryStorage();

    expect(readUiBackground(storage)).toBe("spaceapp");
    storage.setItem(UI_BACKGROUND_STORAGE_KEY, "invalid");
    expect(readUiBackground(storage)).toBe("spaceapp");

    expect(writeUiBackground(storage, "none")).toBe("none");
    expect(storage.getItem(UI_BACKGROUND_STORAGE_KEY)).toBe("none");
    expect(readUiBackground(storage)).toBe("none");

    expect(writeUiBackground(storage, "aurora")).toBe("aurora");
    expect(readUiBackground(storage)).toBe("aurora");
    expect(writeUiBackground(storage, "spaceapp")).toBe("spaceapp");
    expect(storage.getItem(UI_BACKGROUND_STORAGE_KEY)).toBe("spaceapp");
    expect(readUiBackground(storage)).toBe("spaceapp");
  });
});
