import { SurfaceErrorBoundary } from "./features/SurfaceErrorBoundary.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { clearStaleBuildRecoveryGuard, handleStaleBuildLoadError, renderReloadFallback } from "./entry-load-recovery.js";
import { PUBLIC_SITE_URL, resolveEntryRoute } from "./entry-route.js";
import { enableStrictCspCompatibility } from "./strict-csp.js";
import {
  appDiagnosticsSessionIsAuthenticated,
  startAppDiagnosticsBootstrap
} from "./app-diagnostics/app-diagnostics-bootstrap.js";

enableStrictCspCompatibility();

async function mount() {
  if (new URLSearchParams(window.location.search).get("spaceDebug") === "1") {
    try {
      const { installBrowserDiagnostics } = await import("./browser-diagnostics.js");
      installBrowserDiagnostics();
    } catch {
      console.info("[space-debug] diagnostics:load-failed");
    }
  }
  const route = resolveEntryRoute(window.location.pathname, window.location.hostname);
  if (route === "app" && await appDiagnosticsSessionIsAuthenticated()) {
    const diagnosticsStartup = startAppDiagnosticsBootstrap();
    await diagnosticsStartup.beforeMount;
  }
  if (route === "public-site") {
    // The old in-app homepage was retired; the public site is spaceapp.dev.
    window.location.replace(PUBLIC_SITE_URL);
    return route;
  }
  const root = createRoot(document.getElementById("root")!);


  await import("./styles.css");
  if (route === "demo") {
    await import("./features/ui-theme/modern-theme.css");
    await import("./features/ui-theme/codex-theme.css");
    await import("./features/ui-theme/motion-theme.css");
    const { DemoSpaceApp } = await import("./demo/DemoSpaceApp.js");
    root.render(<StrictMode><SurfaceErrorBoundary><DemoSpaceApp /></SurfaceErrorBoundary></StrictMode>);
    return route;
  }
  const [{ LiveSpaceApp }, { readUiTheme, readUiBackground, readModernIconPack }, { loadAppIconPack }] = await Promise.all([
    import("./live/LiveSpaceApp.js"),
    import("./ui-theme.js"),
    import("./features/ui-theme/icon-pack-registry.js")
  ]);
  document.documentElement.dataset.uiBackground = readUiBackground(window.localStorage);
  // Non-default icon packs load on demand; await the stored one like the theme CSS.
  const iconPackReady = loadAppIconPack(readModernIconPack(window.localStorage)).catch(() => undefined);
  if (readUiTheme(window.localStorage) !== "classic") {
    await import("./features/ui-theme/modern-theme.css");
    await import("./features/ui-theme/codex-theme.css");
    await import("./features/ui-theme/motion-theme.css");
  }
  await iconPackReady;
  root.render(<StrictMode><SurfaceErrorBoundary><LiveSpaceApp /></SurfaceErrorBoundary></StrictMode>);
  return route;
}

void mount()
  .then((route) => {
    if (route === "app") clearStaleBuildRecoveryGuard();
  })
  .catch((error: unknown) => {
    const route = resolveEntryRoute(window.location.pathname, window.location.hostname);
    if (route !== "app" || !handleStaleBuildLoadError(error)) {
      renderReloadFallback(null, () => window.location.reload(), "Space could not load. Check your connection and try again.");
    }
  });
