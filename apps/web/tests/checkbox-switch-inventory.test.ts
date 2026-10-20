import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && path.endsWith(".tsx") ? [path] : [];
  });
}

describe("Space checkbox switch inventory", () => {
  it("routes every native checkbox through SpaceToggle", () => {
    const matches = sourceFiles("src").flatMap((path) => {
      const count = readFileSync(path, "utf8").match(/type="checkbox"/g)?.length ?? 0;
      return Array.from({ length: count }, () => relative("src", path));
    }).sort();

    // On/off settings use SpaceToggle. Native checkboxes are kept only where a checkbox is the right
    // control: picking several items from a list, or acknowledging a destructive action. A new
    // checkbox anywhere else has to be a SpaceToggle or be added here with its reason.
    const allowed = [
      "features/cli-runtime-settings/CliRuntimeSettingsCard.tsx", // acknowledge closing panes before disabling a CLI
      "features/space-gateway/GatewayKeysTab.tsx", // reasoning efforts (multi-select)
      "features/space-gateway/GatewayKeysTab.tsx", // accounts (multi-select)
      "features/space-gateway/GatewayKeysTab.tsx", // accumulated usage view option
      "features/space-gateway/GatewayLogsTab.tsx", // log filter values (multi-select)
      "features/ui-controls/SpaceToggle.tsx"
    ].sort();
    expect(matches).toEqual(allowed);

    // The CLI runtime VPN and on/off switches and the CLI shortcut list use the shared switch too.
    const runtimeCard = readFileSync("src/features/cli-runtime-settings/CliRuntimeSettingsCard.tsx", "utf8");
    expect(runtimeCard).toContain("cli-runtime-vpn-switch");
    expect(runtimeCard).toContain("cli-runtime-enabled-switch");
    expect(runtimeCard.match(/<SpaceToggle\b/g)).toHaveLength(2);
    expect(readFileSync("src/features/terminal-pane/CliShortcutVisibilitySettings.tsx", "utf8")).toContain("<SpaceToggle");
  });

  it("does not let legacy voice-checkbox CSS override the shared switch grid", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const flatSettings = readFileSync("src/features/settings/flat-settings.css", "utf8");
    const voiceToggleBlock = styles.match(/\.voice-toggle\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(voiceToggleBlock).not.toMatch(/display\s*:\s*inline-flex/);
    expect(voiceToggleBlock).not.toMatch(/align-items\s*:/);
    expect(styles).not.toMatch(/\.voice-toggle\s+input\s*\{/);
    expect(flatSettings).toMatch(/\.settings-flat-card,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(flatSettings).toMatch(/\.settings-flat-card \.settings-flat-heading strong,[\s\S]*?overflow-wrap:\s*anywhere/);
    expect(flatSettings).toMatch(/\.settings-flat-card \.empty-mini[\s\S]*?overflow-wrap:\s*anywhere/);
  });
});
