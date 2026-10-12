import React, { useState, useRef } from "react";
import {
  Download,
  Upload,
  FileJson,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  Bookmark,
  ClipboardList,
  Sliders,
  Server,
  Key,
  Lock
} from "../ui-theme/app-icons.js";
import { api, type ConfigurationInspectResult } from "../../api.js";
import { getSpaceRuntime } from "../../runtime/SpaceRuntime.js";
import type { SpaceConfigBundle, ImportConfigResult, ImportConfigMode } from "@space/contracts";
import { SpaceToggle } from "../ui-controls/SpaceToggle.js";
import "./configuration-migration.css";

export function ConfigurationMigrationCard({ canManageInstallation = false }: { canManageInstallation?: boolean }) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [includeApiKeys, setIncludeApiKeys] = useState(false);
  const [includeCredentials, setIncludeCredentials] = useState(false);

  const [importMode, setImportMode] = useState<ImportConfigMode>("replace");
  const [importApiKeys, setImportApiKeys] = useState(true);
  const [importCredentials, setImportCredentials] = useState(true);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspection, setInspection] = useState<ConfigurationInspectResult | null>(null);
  const [rawBundle, setRawBundle] = useState<SpaceConfigBundle | null>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportConfigResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const bundle = await api.exportConfiguration({
        includeApiKeys: canManageInstallation && includeApiKeys,
        includeCredentials: canManageInstallation && includeCredentials
      });
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `spaceapp-config-${dateStr}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Failed to export configuration.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setInspection(null);
    setRawBundle(null);
    setImportError(null);
    setImportResult(null);
    setIsInspecting(true);

    try {
      const text = await file.text();
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        throw new Error("Selected file is not valid JSON.");
      }

      const inspectRes = await api.inspectConfiguration(parsedJson);
      if (!inspectRes.valid) {
        throw new Error("The file is not a valid SpaceApp configuration bundle.");
      }

      setInspection(inspectRes);
      setRawBundle(parsedJson as SpaceConfigBundle);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "Failed to parse configuration file.");
    } finally {
      setIsInspecting(false);
    }
  };

  const handleImport = async () => {
    if (!canManageInstallation || !rawBundle) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const res = await api.importConfiguration({
        bundle: rawBundle,
        mode: importMode,
        importApiKeys,
        importCredentials
      });
      setImportResult(res);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "Failed to import configuration.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleReload = () => {
    getSpaceRuntime().platform.reloadPage();
  };

  return (
    <div className="config-migration-card" aria-label="Configuration backup and migration">
      {/* Export Section */}
      <div className="config-migration-section">
        <div className="config-migration-section-header">
          <div className="config-migration-section-title">
            <Download size={18} aria-hidden="true" />
            <span>Export Configuration</span>
          </div>
        </div>
        <p className="config-migration-desc">
          Download a complete portable bundle of your rooms, panes, preferences, user bookmarks, plans, and CLI defaults as a single JSON file.
        </p>

        {canManageInstallation ? <div className="config-migration-options-group">
          <SpaceToggle
            className="config-migration-toggle-row"
            name="export-include-api-keys"
            ariaLabel="Include Provider API Keys"
            label={
              <span className="config-migration-toggle-title">
                <Key size={14} color="#f59e0b" />
                <span>Include Provider API Keys</span>
                <span className="config-migration-badge sensitive">Sensitive</span>
              </span>
            }
            detail="Exports configured provider API keys (DeepSeek, OpenAI, Anthropic, Qwen, Grok, Kimi, etc.) into the bundle."
            checked={includeApiKeys}
            disabled={isExporting}
            onChange={setIncludeApiKeys}
          />

          <SpaceToggle
            className="config-migration-toggle-row"
            name="export-include-credentials"
            ariaLabel="Include Login Credentials & Sessions"
            label={
              <span className="config-migration-toggle-title">
                <Lock size={14} color="#f59e0b" />
                <span>Include Login Credentials & Sessions</span>
                <span className="config-migration-badge sensitive">Sensitive</span>
              </span>
            }
            detail="Exports active OAuth session tokens and device login credentials (Codex, Claude, Cursor, Copilot, etc.)."
            checked={includeCredentials}
            disabled={isExporting}
            onChange={setIncludeCredentials}
          />
        </div> : <p className="config-migration-desc">Import and secret exports require ADMIN or OPERATOR access.</p>}

        {exportError ? (
          <div className="config-migration-alert bad" role="alert">
            <AlertCircle size={16} />
            <span>{exportError}</span>
          </div>
        ) : null}

        <div className="config-migration-actions">
          <button
            type="button"
            className="config-migration-btn primary"
            onClick={() => void handleExport()}
            disabled={isExporting}
          >
            {isExporting ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
            <span>{isExporting ? "Exporting..." : "Download Configuration Bundle (.json)"}</span>
          </button>
        </div>
      </div>

      {/* Import Section */}
      {canManageInstallation ? <div className="config-migration-section">
        <div className="config-migration-section-header">
          <div className="config-migration-section-title">
            <Upload size={18} aria-hidden="true" />
            <span>Import Configuration</span>
          </div>
        </div>
        <p className="config-migration-desc">
          Restore or migrate a previously exported SpaceApp configuration file into this instance.
        </p>

        {/* Mode Selector */}
        <div className="config-migration-mode-selector">
          <label className={`config-migration-mode-option ${importMode === "replace" ? "selected" : ""}`}>
            <input
              type="radio"
              name="config-import-mode"
              value="replace"
              checked={importMode === "replace"}
              onChange={() => setImportMode("replace")}
              disabled={isImporting}
            />
            <div className="config-migration-mode-info">
              <strong>Replace (Full Mirror)</strong>
              <small>Clears existing rooms and panes, then recreates the exact setup from the bundle. Recommended for public-host to local mirror.</small>
            </div>
          </label>

          <label className={`config-migration-mode-option ${importMode === "merge" ? "selected" : ""}`}>
            <input
              type="radio"
              name="config-import-mode"
              value="merge"
              checked={importMode === "merge"}
              onChange={() => setImportMode("merge")}
              disabled={isImporting}
            />
            <div className="config-migration-mode-info">
              <strong>Merge (Append)</strong>
              <small>Preserves all your current rooms, panes, and bookmarks, appending new items from the bundle.</small>
            </div>
          </label>
        </div>

        {/* File Dropzone */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="config-migration-file-input"
          onChange={(e) => void handleFileChange(e)}
        />

        <div
          className="config-migration-dropzone"
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <FileJson size={32} color="var(--text-muted, #888)" />
          <div>
            <strong>{selectedFileName ? selectedFileName : "Choose a JSON configuration file"}</strong>
            <p className="config-migration-desc">Click to browse or drop bundle file here</p>
          </div>
        </div>

        {isInspecting ? (
          <div className="config-migration-meta">
            <RefreshCw size={14} className="spin" />
            <span>Validating and inspecting configuration bundle...</span>
          </div>
        ) : null}

        {importError ? (
          <div className="config-migration-alert bad" role="alert">
            <AlertCircle size={16} />
            <span>{importError}</span>
          </div>
        ) : null}

        {/* Inspection Preview */}
        {inspection && !importResult ? (
          <div className="config-migration-preview">
            <div className="config-migration-meta">
              <span>Source: <strong>{inspection.source.instance}</strong></span>
              <span>Exported: <strong>{new Date(inspection.exportedAt).toLocaleString()}</strong></span>
              <span>Version: <strong>{inspection.version}</strong></span>
            </div>

            <div className="config-migration-stats-grid">
              <div className="config-migration-stat-badge">
                <Layers size={16} color="#60a5fa" />
                <span className="stat-count">{inspection.summary.roomsCount}</span>
                <span className="stat-label">Rooms</span>
              </div>
              <div className="config-migration-stat-badge">
                <span className="stat-count">{inspection.summary.panesCount}</span>
                <span className="stat-label">Panes</span>
              </div>
              <div className="config-migration-stat-badge">
                <Bookmark size={16} color="#34d399" />
                <span className="stat-count">{inspection.summary.userLinksCount}</span>
                <span className="stat-label">Bookmarks</span>
              </div>
              <div className="config-migration-stat-badge">
                <ClipboardList size={16} color="#fbbf24" />
                <span className="stat-count">{inspection.summary.clipboardItemsCount}</span>
                <span className="stat-label">Plans / Notes</span>
              </div>
              <div className="config-migration-stat-badge">
                <Sliders size={16} color="#a78bfa" />
                <span className="stat-count">{inspection.summary.cliRuntimeSettingsCount}</span>
                <span className="stat-label">CLI Runtimes</span>
              </div>
              <div className="config-migration-stat-badge">
                <Server size={16} color="#f472b6" />
                <span className="stat-count">{inspection.summary.providersCount}</span>
                <span className="stat-label">Providers</span>
              </div>
              {(inspection.summary.apiKeysCount ?? 0) > 0 ? (
                <div className="config-migration-stat-badge">
                  <Key size={16} color="#f59e0b" />
                  <span className="stat-count">{inspection.summary.apiKeysCount}</span>
                  <span className="stat-label">API Keys</span>
                </div>
              ) : null}
              {(inspection.summary.credentialsCount ?? 0) > 0 ? (
                <div className="config-migration-stat-badge">
                  <Lock size={16} color="#f59e0b" />
                  <span className="stat-count">{inspection.summary.credentialsCount}</span>
                  <span className="stat-label">Credentials</span>
                </div>
              ) : null}
            </div>

            {(inspection.summary.apiKeysCount ?? 0) > 0 || (inspection.summary.credentialsCount ?? 0) > 0 ? (
              <div className="config-migration-options-group">
                {(inspection.summary.apiKeysCount ?? 0) > 0 ? (
                  <SpaceToggle
                    className="config-migration-toggle-row"
                    name="import-api-keys"
                    ariaLabel={`Import Provider API Keys (${inspection.summary.apiKeysCount} found)`}
                    label={
                      <span className="config-migration-toggle-title">
                        <Key size={14} color="#f59e0b" />
                        <span>Import Provider API Keys ({inspection.summary.apiKeysCount} found)</span>
                      </span>
                    }
                    detail="Writes .key files into secrets directory for immediate provider readiness."
                    checked={importApiKeys}
                    disabled={isImporting}
                    onChange={setImportApiKeys}
                  />
                ) : null}

                {(inspection.summary.credentialsCount ?? 0) > 0 ? (
                  <SpaceToggle
                    className="config-migration-toggle-row"
                    name="import-credentials"
                    ariaLabel={`Import Login Credentials (${inspection.summary.credentialsCount} found)`}
                    label={
                      <span className="config-migration-toggle-title">
                        <Lock size={14} color="#f59e0b" />
                        <span>Import Login Credentials ({inspection.summary.credentialsCount} found)</span>
                      </span>
                    }
                    detail="Restores active CLI session logins and OAuth tokens."
                    checked={importCredentials}
                    disabled={isImporting}
                    onChange={setImportCredentials}
                  />
                ) : null}
              </div>
            ) : null}

            <div className="config-migration-actions">
              <button
                type="button"
                className="config-migration-btn primary"
                onClick={() => void handleImport()}
                disabled={isImporting}
              >
                {isImporting ? <RefreshCw size={16} className="spin" /> : <Upload size={16} />}
                <span>{isImporting ? "Applying Configuration..." : `Apply & Import (${importMode.toUpperCase()})`}</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Success Result */}
        {importResult ? (
          <div className="config-migration-preview">
            <div className="config-migration-alert good">
              <CheckCircle2 size={18} />
              <span><strong>Configuration successfully imported!</strong></span>
            </div>
            <div className="config-migration-stats-grid">
              <div className="config-migration-stat-badge">
                <span className="stat-count">{importResult.stats.roomsImported}</span>
                <span className="stat-label">Rooms Imported</span>
              </div>
              <div className="config-migration-stat-badge">
                <span className="stat-count">{importResult.stats.panesImported}</span>
                <span className="stat-label">Panes Imported</span>
              </div>
              <div className="config-migration-stat-badge">
                <span className="stat-count">{importResult.stats.linksImported}</span>
                <span className="stat-label">Links Imported</span>
              </div>
              <div className="config-migration-stat-badge">
                <span className="stat-count">{importResult.stats.clipboardImported}</span>
                <span className="stat-label">Plans Imported</span>
              </div>
              {importResult.stats.apiKeysImported ? (
                <div className="config-migration-stat-badge">
                  <Key size={16} color="#f59e0b" />
                  <span className="stat-count">{importResult.stats.apiKeysImported}</span>
                  <span className="stat-label">API Keys</span>
                </div>
              ) : null}
              {importResult.stats.credentialsImported ? (
                <div className="config-migration-stat-badge">
                  <Lock size={16} color="#f59e0b" />
                  <span className="stat-count">{importResult.stats.credentialsImported}</span>
                  <span className="stat-label">Credentials</span>
                </div>
              ) : null}
            </div>

            <div className="config-migration-actions">
              <button
                type="button"
                className="config-migration-btn success"
                onClick={handleReload}
              >
                <RefreshCw size={16} />
                <span>Reload SpaceApp to Apply Changes</span>
              </button>
            </div>
          </div>
        ) : null}
      </div> : null}
    </div>
  );
}
