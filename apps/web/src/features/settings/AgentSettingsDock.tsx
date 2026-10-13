import { useState } from "react";
import type { AgentPaneSession, AuthMe, Pane, Provider, ProviderSettings } from "@space/contracts";
import { api } from "../../api.js";
import { RecoverableSurface } from "../SurfaceErrorBoundary.js";
import { DockNotice } from "../dock-kit/DockKit.js";
import { SpaceToggle } from "../ui-controls/SpaceToggle.js";
import {
  Activity,
  ArrowUpDown,
  Bell,
  Bot,
  Clock3,
  GitBranch,
  GitMerge,
  Grid2X2,
  Hash,
  Keyboard,
  Mic,
  Palette,
  PanelsTopLeft,
  Plug,
  Rocket,
  ServerCog,
  Settings2,
  Sparkles,
  Terminal,
  Users
} from "../ui-theme/app-icons.js";
import { saveUserSettingDebounced } from "../user-settings/user-settings-manager.js";
import { VoiceSettingsCard } from "../voice-input/VoiceSettingsCard.js";
import type { ModernAppearance, ModernIconPack, UiBackground, UiTheme } from "../../ui-theme.js";
import { SettingsDisclosure, SettingsSections } from "./SettingsDisclosure.js";
import type { EnvironmentPresetCard } from "./EnvironmentPresetCard.js";
import type { GoogleAccountSettingsCard } from "../auth/GoogleAccountSettingsCard.js";
import type { UiThemeSettingsCard } from "../ui-theme/UiThemeSettingsCard.js";
import type { DocksSettingsCard } from "./DocksSettingsCard.js";
import type { PanesSettingsCard } from "./PanesSettingsCard.js";
import type { WidgetsSettingsCard } from "./WidgetsSettingsCard.js";
import type { DateTimeSettingsCard } from "../date-time-settings/DateTimeSettingsCard.js";
import type { AppDiagnosticsSettingsCard } from "../app-diagnostics/AppDiagnosticsSettingsCard.js";
import type { DeployQueueSettingsCard } from "../deploy-queue/DeployQueueSettingsCard.js";
import type { ReleasesSettingsCard } from "../releases/ReleasesSettingsCard.js";
import type { SourceControlPublishingCard } from "../source-control-publishing/SourceControlPublishingCard.js";
import type { CodexCliDefaultsCard } from "../codex-cli-defaults/CodexCliDefaultsCard.js";
import type { TelegramIntegrationCard } from "../telegram-integration/TelegramIntegrationCard.js";
import type { PluginsSettingsCard } from "../plugins/PluginsSettingsCard.js";
import type { AgentCapabilitiesCard } from "../agent-tools/AgentCapabilitiesCard.js";
import type { KeyboardAutocorrectSettingsCard } from "../keyboard-autocorrect/KeyboardAutocorrectSettingsCard.js";
import type { PromptVariablesSettingsCard } from "../prompt-variables/PromptVariablesSettingsCard.js";
import type { ConfigurationMigrationCard } from "./ConfigurationMigrationCard.js";
import type { DotSettingsRequest, DotsSettingsCard } from "../agent-pane/DotsSettingsCard.js";

// The Settings dock (and the Workspace "Advanced settings" page): everyday
// preferences, then the admin installation settings.

/** The settings cards the dock renders; App declares them with lazyWithPreload. */
export interface AgentSettingsCards {
  EnvironmentPreset: typeof EnvironmentPresetCard;
  GoogleAccount: typeof GoogleAccountSettingsCard;
  UiTheme: typeof UiThemeSettingsCard;
  Docks: typeof DocksSettingsCard;
  Panes: typeof PanesSettingsCard;
  Widgets: typeof WidgetsSettingsCard;
  DateTime: typeof DateTimeSettingsCard;
  AppDiagnostics: typeof AppDiagnosticsSettingsCard;
  DeployQueue: typeof DeployQueueSettingsCard;
  Releases: typeof ReleasesSettingsCard;
  SourceControlPublishing: typeof SourceControlPublishingCard;
  CodexCliDefaults: typeof CodexCliDefaultsCard;
  TelegramIntegration: typeof TelegramIntegrationCard;
  Plugins: typeof PluginsSettingsCard;
  AgentCapabilities: typeof AgentCapabilitiesCard;
  KeyboardAutocorrect: typeof KeyboardAutocorrectSettingsCard;
  PromptVariables: typeof PromptVariablesSettingsCard;
  ConfigurationMigration: typeof ConfigurationMigrationCard;
  Dots: typeof DotsSettingsCard;
}

export const settingsCardLoadingFallback = <div className="empty-mini" role="status">Loading settings…</div>;

const AGENT_PANE_SETTINGS_EVENT = "space:agent-pane-settings-updated";

function dispatchAgentPaneSettingsUpdated(paneId: string | null, session?: AgentPaneSession) {
  window.dispatchEvent(new CustomEvent(AGENT_PANE_SETTINGS_EVENT, { detail: { paneId, session } }));
}

function providerRouteLabel(provider: Provider): string {
  return [provider.routeProfile ?? "custom", provider.backingProviderId ?? provider.type.toLowerCase()].join(" / ");
}

export function AgentSettingsDock({
  cards,
  adminMode,
  onOpenSetup,
  activePane: _activePane,
  canManageCliRuntimes,
  canManageDiagnostics,
  canManageSourceControl,
  canManageTelegram,
  currentAppearance,
  currentBackground = "spaceapp",
  currentIconPack,
  currentUiTheme,
  isCodexEnabled,
  isHarnessEnabled = true,
  suppressNotifications,
  providerSettings,
  providers,
  gitPluginsActive,
  onUiThemeApply,
  onSuppressNotificationsChange,
  onProviderSettingsRefresh,
  auth,
  onAuthRefresh,
  roomId = null,
  dotSettingsRequest = null
}: {
  /** The lazily loaded settings cards (declared, and preloaded at idle, by App). */
  cards: AgentSettingsCards;
  adminMode: boolean;
  onOpenSetup: () => void;
  activePane?: Pane | null;
  canManageCliRuntimes: boolean;
  canManageDiagnostics: boolean;
  canManageSourceControl: boolean;
  canManageTelegram: boolean;
  currentAppearance: ModernAppearance;
  currentBackground?: UiBackground;
  currentIconPack: ModernIconPack;
  currentUiTheme: UiTheme;
  isCodexEnabled: boolean;
  isHarnessEnabled?: boolean;
  suppressNotifications: boolean;
  providerSettings: ProviderSettings | null;
  providers: Provider[];
  gitPluginsActive?: boolean;
  onUiThemeApply: (selection: { appearance: ModernAppearance; background: UiBackground; iconPack: ModernIconPack; theme: UiTheme }) => void;
  onSuppressNotificationsChange: (suppressed: boolean) => void;
  onProviderSettingsRefresh: (settings: ProviderSettings) => void;
  auth?: AuthMe | null;
  onAuthRefresh?: () => Promise<void>;
  /** The current room: Dot memory, tools and evaluation runs there. */
  roomId?: string | null;
  /** Opens Settings → Dots at a Dot and section (from a Dot pane). */
  dotSettingsRequest?: DotSettingsRequest | null;
}) {
  const {
    EnvironmentPreset: LazyEnvironmentPresetCard,
    GoogleAccount: LazyGoogleAccountSettingsCard,
    UiTheme: LazyUiThemeSettingsCard,
    Docks: LazyDocksSettingsCard,
    Panes: LazyPanesSettingsCard,
    Widgets: LazyWidgetsSettingsCard,
    DateTime: LazyDateTimeSettingsCard,
    AppDiagnostics: LazyAppDiagnosticsSettingsCard,
    DeployQueue: LazyDeployQueueSettingsCard,
    Releases: LazyReleasesSettingsCard,
    SourceControlPublishing: LazySourceControlPublishingCard,
    CodexCliDefaults: LazyCodexCliDefaultsCard,
    TelegramIntegration: LazyTelegramIntegrationCard,
    Plugins: LazyPluginsSettingsCard,
    AgentCapabilities: LazyAgentCapabilitiesCard,
    KeyboardAutocorrect: LazyKeyboardAutocorrectSettingsCard,
    PromptVariables: LazyPromptVariablesSettingsCard,
    ConfigurationMigration: LazyConfigurationMigrationCard,
    Dots: LazyDotsSettingsCard
  } = cards;
  const [providerPending, setProviderPending] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [defaultWorktree, setDefaultWorktree] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("space.worktree.defaultEnabled");
      if (stored !== null) return stored === "true";
    } catch {}
    return true;
  });

  const defaultProvider = providers.find((provider) => provider.id === providerSettings?.defaultProviderId) ?? null;

  async function selectDefaultProvider(providerId: string) {
    if (!isCodexEnabled || !providerId || providerId === providerSettings?.defaultProviderId) return;
    setProviderPending(true);
    setProviderError(null);
    try {
      const updated = await api.updateProviderSettings({ defaultProviderId: providerId });
      onProviderSettingsRefresh(updated);
      dispatchAgentPaneSettingsUpdated(null);
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : "Default provider update failed");
    } finally {
      setProviderPending(false);
    }
  }

  return (
    <div className="dock-panel agent-settings-dock basic-settings-dock">
      <SettingsSections request={dotSettingsRequest ? { key: "dots", nonce: dotSettingsRequest.nonce } : null}>
      <header className="settings-dock-title settings-flat-dock-title">
        <Settings2 aria-hidden="true" />
        <span>
          <h2>{adminMode ? "Advanced settings" : "Settings"}</h2>
          <small>{adminMode ? "Preferences and advanced installation settings." : "Your everyday preferences. Open a section to change it."}</small>
        </span>
      </header>

      <RecoverableSurface fallback={settingsCardLoadingFallback}>
        <LazyEnvironmentPresetCard
          isAdmin={auth?.user?.role === "ADMIN"}
          canManageCliRuntimes={canManageCliRuntimes}
          userId={auth?.user?.id}
        />
      </RecoverableSurface>

      {adminMode && canManageCliRuntimes ? <div className="settings-setup-shortcut">
        <strong>Need to set up a tool?</strong>
        <p>The wizard guides you through tools and connections. You can return at any time.</p>
        <button type="button" onClick={onOpenSetup}>Open setup wizard</button>
      </div> : null}
      <SettingsDisclosure sectionKey="dots" title="Dots" description="Your six assistants: default Dot, models, permissions, accounts, Slack and reminders."
        scope="Your account" icon={Bot}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}>
          <LazyDotsSettingsCard roomId={roomId} isAdmin={auth?.user?.role === "ADMIN"} request={dotSettingsRequest} />
        </RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Account & Google" description="Link or manage your Google single sign-on connection." scope="Installation" icon={Users}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}>
          <LazyGoogleAccountSettingsCard auth={auth ?? null} onAuthRefresh={onAuthRefresh ?? (async () => {})} />
        </RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Appearance" description="Theme, colors, and icon style." scope="Your account" icon={Palette}>
      <RecoverableSurface fallback={settingsCardLoadingFallback}>
        <LazyUiThemeSettingsCard
          currentAppearance={currentAppearance}
          currentBackground={currentBackground}
          currentIconPack={currentIconPack}
          currentTheme={currentUiTheme}
          onChange={onUiThemeApply}
        />
      </RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Docks" description="Choose which docks appear in your workspace navigation and toolbar." scope="Your account" icon={Grid2X2}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}>
          <LazyDocksSettingsCard
            gitPluginsActive={gitPluginsActive}
            isAdmin={auth?.user?.role === "ADMIN"}
          />
        </RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Panes" description="Choose which non-CLI panes appear in your workspace creation menu and toolbar." scope="Your account" icon={PanelsTopLeft}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}>
          <LazyPanesSettingsCard
            isHarnessEnabled={isHarnessEnabled}
          />
        </RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Widgets" description="Choose which desktop widgets are enabled and float in your workspace." scope="Your account" icon={Sparkles}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyWidgetsSettingsCard /></RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Date & time" description="Time zone, UTC reference, and 24-hour display format." scope="Your account" icon={Clock3}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyDateTimeSettingsCard userId={auth?.user?.id} /></RecoverableSurface>
      </SettingsDisclosure>

      {canManageDiagnostics ? <SettingsDisclosure title="Diagnostics" description="Debug events and screen recording." scope="Installation" icon={Activity}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyAppDiagnosticsSettingsCard canManage={canManageDiagnostics} /></RecoverableSurface>
      </SettingsDisclosure> : null}

      {canManageDiagnostics ? <SettingsDisclosure title="Releases" description="Compare stable and dev, and promote dev to stable." scope="Installation" icon={Rocket}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyReleasesSettingsCard /></RecoverableSurface>
      </SettingsDisclosure> : null}

      {canManageDiagnostics ? <SettingsDisclosure title="Deploy queue" description="Agent changes on their way to live." scope="Installation" icon={GitMerge}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyDeployQueueSettingsCard /></RecoverableSurface>
      </SettingsDisclosure> : null}

      {canManageCliRuntimes ? <SettingsDisclosure hidden={!adminMode} title="Default provider" description="Choose the provider for new conversations." scope="New sessions" icon={ServerCog}>
      <section className="agent-settings-card settings-flat-card settings-provider-card" aria-label="Global provider settings">
        <div className="agent-settings-section-title settings-flat-heading codex-gated-settings-title">
          <ServerCog aria-hidden="true" />
          <span>
            <strong>Default provider</strong>
            <small>{defaultProvider ? `${defaultProvider.displayName} / ${providerRouteLabel(defaultProvider)}` : "Provider settings loading"}</small>
          </span>
          {!isCodexEnabled ? <span className="status muted">OFF</span> : null}
        </div>
        <label className="provider-default-select settings-flat-row">
          <span className="settings-flat-row-copy">
            <strong>Provider</strong>
            <small>Used by new Chat and agent sessions.</small>
          </span>
          <select
            aria-label="Default provider"
            name="settings-default-provider"
            value={providerSettings?.defaultProviderId ?? ""}
            onChange={(event) => void selectDefaultProvider(event.target.value)}
            disabled={!isCodexEnabled || providerPending || providers.length === 0}
            title={!isCodexEnabled ? "Enable Codex in Settings" : undefined}
          >
            {providers.length ? (
              providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName}
                </option>
              ))
            ) : (
              <option value="">No providers</option>
            )}
          </select>
        </label>
        {providerError ? (
          <DockNotice onDismiss={() => setProviderError(null)}>The default provider could not be changed: {providerError}</DockNotice>
        ) : null}
      </section>

      </SettingsDisclosure> : null}
      {canManageSourceControl ? <SettingsDisclosure hidden={!adminMode} title="GitHub & Gitea" description="Connect repositories and manage publishing credentials." scope="Installation" icon={GitBranch}>
      <RecoverableSurface fallback={settingsCardLoadingFallback}>
        <LazySourceControlPublishingCard canManage={canManageSourceControl} />
      </RecoverableSurface>
      </SettingsDisclosure> : null}

      {canManageCliRuntimes ? <SettingsDisclosure hidden={!adminMode} title="Codex CLI defaults" description="Default model and behavior for new CLI sessions." scope="New sessions" icon={Terminal}>
      <RecoverableSurface fallback={settingsCardLoadingFallback}>
        <LazyCodexCliDefaultsCard client={api} isCodexEnabled={isCodexEnabled} />
      </RecoverableSurface>
      </SettingsDisclosure> : null}

      <SettingsDisclosure title="Git worktrees" description="Default worktree isolation mode for CLI tools." scope="Your account" icon={GitBranch}>
        <section className="agent-settings-card settings-flat-card cli-worktree-settings-card" aria-label="Git Worktrees default settings">
          <div className="agent-settings-section-title settings-flat-heading">
            <GitBranch aria-hidden="true" />
            <span>
              <strong>Git Worktrees</strong>
              <small>{defaultWorktree ? "CLI tools launch in isolated Git branches by default." : "Direct project execution by default."}</small>
            </span>
          </div>
          <SpaceToggle
            className="settings-flat-row settings-flat-toggle-row default-worktree-toggle"
            name="default-worktree-enabled-global"
            ariaLabel="Enable isolated worktrees by default"
            label="Isolated worktrees by default"
            detail="Automatically isolate CLI tools (Gemini, Codex, OpenCode, Hermes) in dedicated Git worktrees for rooms with a project directory."
            checked={defaultWorktree}
            onChange={(checked) => {
              setDefaultWorktree(checked);
              try {
                localStorage.setItem("space.worktree.defaultEnabled", String(checked));
              } catch {}
              if (auth?.isAuthenticated) {
                saveUserSettingDebounced("worktreeDefaultEnabled", checked);
              }
            }}
          />
        </section>
      </SettingsDisclosure>

      {canManageTelegram ? <SettingsDisclosure hidden={!adminMode} title="Telegram notifications" description="Connect Telegram and choose which updates to send." scope="Installation" icon={Bell}>
      <RecoverableSurface fallback={settingsCardLoadingFallback}>
        <LazyTelegramIntegrationCard canManage={canManageTelegram} isCodexEnabled={isCodexEnabled} />
      </RecoverableSurface>
      </SettingsDisclosure> : null}

      <SettingsDisclosure title="Plugins" description="Accounts and services your agents can act through." scope="Installation" icon={Plug}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyPluginsSettingsCard canManage={auth?.user?.role === "ADMIN" || auth?.user?.role === "OPERATOR"} /></RecoverableSurface>
      </SettingsDisclosure>

      {auth?.user?.role === "ADMIN" ? <SettingsDisclosure title="Agent capabilities" description="Skills, MCP backends and tool routing for every CLI agent, with 30-day usage." scope="Installation" icon={Sparkles}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyAgentCapabilitiesCard /></RecoverableSurface>
      </SettingsDisclosure> : null}

      <SettingsDisclosure title="Voice input" description="Microphone and speech preferences." scope="Your account" icon={Mic}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><VoiceSettingsCard /></RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Keyboard autocorrection" description="Layout detection, Alt+G suggestions, audio alert, and languages." scope="Your account" icon={Keyboard}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyKeyboardAutocorrectSettingsCard /></RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Prompt variables" description="Custom #variable shortcuts, quick expansions, and technical context." scope="Your account" icon={Hash}>
        <RecoverableSurface fallback={settingsCardLoadingFallback}><LazyPromptVariablesSettingsCard /></RecoverableSurface>
      </SettingsDisclosure>

      <SettingsDisclosure title="Notifications" description="Choose whether your account shows notices." scope="Your account" icon={Bell}>
      <section className="agent-settings-card settings-flat-card suppress-notifications-settings-card" aria-label="Notification settings">
        <div className="agent-settings-section-title settings-flat-heading">
          <Bell aria-hidden="true" />
          <span>
            <strong>Notifications</strong>
            <small>Account-wide toast and status controls.</small>
          </span>
        </div>
        <SpaceToggle
          className="settings-flat-row settings-flat-toggle-row suppress-notifications-toggle"
          name="suppress-notifications-enabled"
          label="Suppress all notifications"
          detail={suppressNotifications ? "All notices are hidden for your account." : "Notices appear normally."}
          checked={suppressNotifications}
          onChange={onSuppressNotificationsChange}
        />
      </section>

      </SettingsDisclosure>

      <SettingsDisclosure
        title="Backup & migration"
        description="Export and import rooms, panes, bookmarks, plans, and settings."
        scope="Installation"
        icon={ArrowUpDown}
      >
        <RecoverableSurface fallback={settingsCardLoadingFallback}>
          <LazyConfigurationMigrationCard canManageInstallation={auth?.user?.role === "ADMIN" || auth?.user?.role === "OPERATOR"} />
        </RecoverableSurface>
      </SettingsDisclosure>
      </SettingsSections>
    </div>
  );
}
