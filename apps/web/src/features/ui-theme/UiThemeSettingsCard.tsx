import { Palette } from "./app-icons.js";
import type { ModernAppearance, ModernIconPack, UiBackground, UiTheme } from "../../ui-theme.js";
import "./ui-theme-settings-card.css";

export function UiThemeSettingsCard({
  currentAppearance,
  currentBackground = "spaceapp",
  currentIconPack,
  currentTheme,
  onChange
}: {
  currentAppearance: ModernAppearance;
  currentBackground?: UiBackground;
  currentIconPack: ModernIconPack;
  currentTheme: UiTheme;
  onChange: (selection: {
    appearance: ModernAppearance;
    background: UiBackground;
    iconPack: ModernIconPack;
    theme: UiTheme;
  }) => void;
}) {
  return (
    <section className="agent-settings-card settings-flat-card ui-theme-settings-card" aria-label="Interface appearance">
      <div className="agent-settings-section-title settings-flat-heading">
        <Palette aria-hidden="true" />
        <span>
          <strong>Interface appearance</strong>
          <small>Saved to your account and synced across all devices.</small>
        </span>
      </div>

      <label className="settings-flat-row">
        <span className="settings-flat-row-copy">
          <strong>Interface theme</strong>
          <small>Choose the overall Space layout.</small>
        </span>
        <select
          aria-label="Interface theme"
          name="space-ui-theme"
          value={currentTheme}
          onChange={(event) => onChange({
            appearance: currentAppearance,
            background: currentBackground,
            iconPack: currentIconPack,
            theme: event.target.value as UiTheme
          })}
        >
          <option value="classic">Classic</option>
          <option value="modern">Modern</option>
          <option value="codex">Codex LB</option>
          <option value="motion">Motion</option>
        </select>
      </label>

      <label className="settings-flat-row">
        <span className="settings-flat-row-copy">
          <strong>Color mode</strong>
          <small>Modern supports light and dark. Classic, Codex LB and Motion use dark colors.</small>
        </span>
        <select
          aria-label="Modern color mode"
          name="modern-color-mode"
          value={currentAppearance}
          disabled={currentTheme !== "modern"}
          onChange={(event) => onChange({
            appearance: event.target.value as ModernAppearance,
            background: currentBackground,
            iconPack: currentIconPack,
            theme: currentTheme
          })}
        >
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>

      <label className="settings-flat-row">
        <span className="settings-flat-row-copy">
          <strong>Icon pack</strong>
          <small>Available in every interface theme.</small>
        </span>
        <select
          aria-label="Icon pack"
          name="modern-icon-pack"
          value={currentIconPack}
          onChange={(event) => onChange({
            appearance: currentAppearance,
            background: currentBackground,
            iconPack: event.target.value as ModernIconPack,
            theme: currentTheme
          })}
        >
          <option value="lucide">Lucide</option>
          <option value="material-rounded">Material Rounded</option>
          <option value="motion">Motion Geometric</option>
        </select>
      </label>

      <label className="settings-flat-row">
        <span className="settings-flat-row-copy">
          <strong>Background</strong>
          <small>SpaceApp artwork or clean theme default.</small>
        </span>
        <select
          aria-label="Background"
          name="space-ui-background"
          value={currentBackground}
          onChange={(event) => onChange({
            appearance: currentAppearance,
            background: event.target.value as UiBackground,
            iconPack: currentIconPack,
            theme: currentTheme
          })}
        >
          <option value="spaceapp">SpaceApp</option>
          <option value="none">Theme default (no background)</option>
        </select>
      </label>
    </section>
  );
}
