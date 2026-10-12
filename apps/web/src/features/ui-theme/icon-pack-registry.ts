import type { ModernIconPack } from "../../ui-theme.js";
import type { AppIconName } from "./app-icon-map.js";
import type { LucideIcon } from "lucide-react";

// Non-default icon packs are loaded on demand. main.tsx awaits the stored pack
// before the first render, so the selected pack never flashes Lucide icons.
export type AppIconPackIcons = Partial<Record<AppIconName, LucideIcon>>;
type OnDemandIconPack = Exclude<ModernIconPack, "lucide">;

const iconPackLoaders: Record<OnDemandIconPack, () => Promise<AppIconPackIcons>> = {
  "material-rounded": () => import("./material-rounded-icons.js").then((module) => module.materialRoundedAppIcons),
  motion: () => import("./motion-geometric-icons.js").then((module) => module.motionGeometricIcons)
};
const loadedIconPacks = new Map<OnDemandIconPack, AppIconPackIcons>();
const pendingIconPacks = new Map<OnDemandIconPack, Promise<void>>();

export function isAppIconPackReady(pack: ModernIconPack): boolean {
  return pack === "lucide" || loadedIconPacks.has(pack);
}

export function getLoadedAppIconPack(pack: ModernIconPack): AppIconPackIcons | undefined {
  return pack === "lucide" ? undefined : loadedIconPacks.get(pack);
}

export function loadAppIconPack(pack: ModernIconPack): Promise<void> {
  if (pack === "lucide" || loadedIconPacks.has(pack)) return Promise.resolve();
  let pending = pendingIconPacks.get(pack);
  if (!pending) {
    pending = iconPackLoaders[pack]()
      .then((icons) => { loadedIconPacks.set(pack, icons); })
      .finally(() => { pendingIconPacks.delete(pack); });
    pendingIconPacks.set(pack, pending);
  }
  return pending;
}
