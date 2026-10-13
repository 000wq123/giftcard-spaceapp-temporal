import {
  type CliUpdateAllDetection,
  type CliUpdateAllRequest,
  type CliUpdateAllResult
} from "@space/contracts";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Wrench,
  Zap
} from "../ui-theme/app-icons.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpaceToggle } from "../ui-controls/SpaceToggle.js";
import { errorMessage } from "./admin-operation-utils.js";

export interface CliUpdateAllClient {
  detectCliUpdateAll(): Promise<CliUpdateAllDetection>;
  runCliUpdateAll(input: CliUpdateAllRequest): Promise<CliUpdateAllResult>;
}

type FilterTab = "all" | "updates" | "custom" | "managed";

export function CliUpdateAllPanel({
  client,
  onBusyChange
}: {
  client: CliUpdateAllClient;
  onBusyChange: (busy: boolean) => void;
}) {
  const [detection, setDetection] = useState<CliUpdateAllDetection | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CliUpdateAllResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [reinstall, setReinstall] = useState(true);
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);
  const resultRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (result && resultRef.current && typeof resultRef.current.scrollIntoView === "function") {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [result]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const detectionValue = await client.detectCliUpdateAll();
      if (!Array.isArray(detectionValue?.cliTypes)) throw new Error("Update detection returned no CLI list.");
      if (mountedRef.current) setDetection(detectionValue);
    } catch (reason) {
      if (mountedRef.current) setError(errorMessage(reason, "Custom procedure detection could not be loaded."));
    } finally {
      loadingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onBusyChange(running);
  }, [onBusyChange, running]);

  const customTypes = useMemo(
    () => detection?.cliTypes.filter((entry) => entry.hasCustom) ?? [],
    [detection]
  );
  const customCount = customTypes.length;
  const totalTypes = detection?.cliTypes.length ?? 0;
  const managedTypes = useMemo(
    () => detection?.cliTypes.filter((entry) => entry.managed) ?? [],
    [detection]
  );
  const updatesAvailableList = useMemo(
    () => detection?.cliTypes.filter((entry) => entry.updateAvailable) ?? [],
    [detection]
  );
  const updatesAvailableCount = updatesAvailableList.length;
  // What the one-click update installs: managed, already installed, newer version available.
  const pendingUpdates = useMemo(
    () => updatesAvailableList.filter((entry) => entry.managed && entry.installedVersion),
    [updatesAvailableList]
  );

  const presentCustomCount = useMemo(
    () => customTypes.flatMap((entry) => entry.custom).filter((item) => item.present).length,
    [customTypes]
  );

  const allSelected = managedTypes.length > 0
    ? managedTypes.every((entry) => selected.has(entry.key))
    : false;

  const filteredCliTypes = useMemo(() => {
    if (!detection?.cliTypes) return [];
    let list = detection.cliTypes;

    if (filterTab === "updates") {
      list = list.filter((e) => e.updateAvailable);
    } else if (filterTab === "custom") {
      list = list.filter((e) => e.hasCustom);
    } else if (filterTab === "managed") {
      list = list.filter((e) => e.managed);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.displayName.toLowerCase().includes(query) ||
          e.key.toLowerCase().includes(query) ||
          e.cliType.toLowerCase().includes(query)
      );
    }

    return list;
  }, [detection, filterTab, searchQuery]);

  function toggleSelectAll() {
    if (!detection) return;
    setSelected(allSelected ? new Set() : new Set(managedTypes.map((entry) => entry.key)));
  }

  function toggleKey(key: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function runUpdateAll(keys: string[], forceReinstall = false) {
    if (running) return;
    setRunning(true);
    setRunStartedAt(new Date().toISOString());
    setResult(null);
    setError(null);
    try {
      const input: CliUpdateAllRequest = reinstall || forceReinstall ? { reinstall: true } : {};
      if (keys.length > 0) input.keys = keys as NonNullable<CliUpdateAllRequest["keys"]>;
      const updateAllResult = await client.runCliUpdateAll(input);
      if (mountedRef.current) {
        setResult(updateAllResult);
        setRunStartedAt(null);
        void load();
      }
    } catch (reason) {
      if (mountedRef.current) {
        setRunStartedAt(null);
        setError(errorMessage(reason, "The update-all procedure could not be started."));
      }
    } finally {
      if (mountedRef.current) setRunning(false);
    }
  }

  return (
    <div className="admin-operation-panel update-all-panel">
      {/* One-click recommended update */}
      <section className="cli-update-recommended" aria-label="Recommended update" aria-busy={running}>
        {!detection ? (
          <p role="status">{loading ? "Checking every CLI for updates…" : "Update status is unavailable."}</p>
        ) : pendingUpdates.length > 0 ? (
          <>
            <div>
              <strong>{pendingUpdates.length === 1 ? "1 update available" : `${pendingUpdates.length} updates available`}</strong>
              <small>{pendingUpdates.map((entry) => `${entry.displayName} ${entry.installedVersion} → ${entry.availableVersion}`).join(" · ")}</small>
            </div>
            <button
              type="button"
              className="admin-operation-primary"
              disabled={loading || running}
              onClick={() => void runUpdateAll(pendingUpdates.map((entry) => entry.key), true)}
            >
              {running ? <Loader2 className="spin" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
              {running ? "Updating…" : `Update ${pendingUpdates.length} CLI${pendingUpdates.length === 1 ? "" : "s"}`}
            </button>
          </>
        ) : (
          <>
            <div>
              <strong>All managed CLIs are up to date</strong>
              <small>Checked {new Date(detection.detectedAt).toLocaleTimeString()}</small>
            </div>
            <button type="button" disabled={loading || running} onClick={() => void load()}>
              {loading ? <Loader2 className="spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              Check again
            </button>
          </>
        )}
        <p className="cli-update-recommended-note">
          <ShieldCheck aria-hidden="true" />
          <span>
            Custom code stays: tracked patches, installers and Space config are fingerprinted before and after, Space
            settings and MCP are re-applied, patched CLIs only receive their patched line, and a failed update rolls back
            to the previous version.
          </span>
        </p>
      </section>

      {/* Summary KPI Stats Bar */}
      <div className="cli-update-stats-bar" aria-label="CLI statistics">
        <div className="cli-stat-pill">
          <span className="cli-stat-num">{totalTypes || 13}</span>
          <span className="cli-stat-label">CLI Types ({managedTypes.length} managed)</span>
        </div>
        <button
          type="button"
          className={`cli-stat-pill clickable ${updatesAvailableCount > 0 ? "has-updates" : "all-current"}`}
          onClick={() => setFilterTab(updatesAvailableCount > 0 ? "updates" : "all")}
          title="Filter by available updates"
        >
          <span className="cli-stat-num">{updatesAvailableCount}</span>
          <span className="cli-stat-label">
            {updatesAvailableCount === 1 ? "Update available" : updatesAvailableCount > 0 ? "Updates available" : "All up to date"}
          </span>
        </button>
        <button
          type="button"
          className="cli-stat-pill clickable has-custom"
          onClick={() => setFilterTab("custom")}
          title="Filter by custom procedures"
        >
          <span className="cli-stat-num">{presentCustomCount}</span>
          <span className="cli-stat-label">
            <strong>Custom procedures detected</strong>
            <span> ({customCount} CLIs)</span>
          </span>
        </button>
      </div>

      {/* Primary Actions Grid */}
      <section className="admin-operation-actions-grid">
        <section>
          <Terminal aria-hidden="true" />
          <div>
            <strong>Update CLI types</strong>
            <small>
              {totalTypes
                ? `${managedTypes.length} managed of ${totalTypes} CLI types · ${updatesAvailableCount} update(s) available`
                : "Detecting CLI types…"}
            </small>
          </div>
          <button
            type="button"
            className="admin-operation-primary"
            disabled={loading || running || !detection}
            onClick={() => void runUpdateAll([])}
            aria-label="Update all"
          >
            {running ? <Loader2 className="spin" aria-hidden="true" /> : <Zap aria-hidden="true" />}
            {running ? "Updating…" : "Update all"}
          </button>
        </section>
        <section>
          <Wrench aria-hidden="true" />
          <div>
            <strong>Update selected</strong>
            <small>{selected.size ? `${selected.size} CLI type(s) selected` : "No CLI types selected"}</small>
          </div>
          <button
            type="button"
            className="admin-operation-primary"
            disabled={loading || running || !detection || selected.size === 0}
            onClick={() => void runUpdateAll(Array.from(selected))}
            aria-label={`Update selected (${selected.size})`}
          >
            {running ? <Loader2 className="spin" aria-hidden="true" /> : <Wrench aria-hidden="true" />}
            {running ? "Updating…" : `Update selected (${selected.size})`}
          </button>
        </section>
      </section>

      {/* Running Banner */}
      {running ? (
        <p className="admin-operation-running" role="status" aria-live="assertive">
          <Loader2 className="spin" aria-hidden="true" />
          <span>
            <strong>CLI update started</strong>
            <small>
              Updating the selected runtimes and verifying custom procedures. This can take several minutes; keep
              this window open. Started {runStartedAt ? new Date(runStartedAt).toLocaleTimeString() : "now"}.
            </small>
          </span>
        </p>
      ) : null}

      {/* Reinstall Custom Procedures Toggle */}
      <SpaceToggle
        id="cli-update-all-reinstall"
        className="admin-operation-check"
        name="cli-update-all-reinstall"
        ariaLabel="Reinstall custom procedures after update"
        label={<strong>Verify and re-apply custom procedures after update</strong>}
        detail="Verify each detected patch and safely restore tracked config/MCP overlays after the update."
        checked={reinstall}
        disabled={running}
        onChange={setReinstall}
      />

      {error ? <p className="admin-operation-alert error" role="alert">{error}</p> : null}

      {/* Unified Single-Window CLI Management Section */}
      <section className="admin-operation-history unified-cli-section" aria-label="All CLI types">
        <header className="unified-cli-toolbar-header">
          <div className="unified-cli-title-group">
            <strong>All CLI types & Custom procedures</strong>
            <small>
              Full catalog with live version status, custom procedures, and individual update selection.
            </small>
          </div>
          <div className="unified-cli-header-actions">
            <button
              type="button"
              className="refresh-btn"
              aria-label="Re-run custom procedure detection"
              disabled={loading || running}
              onClick={() => void load()}
              title="Refresh CLI versions and detection"
            >
              {loading ? <Loader2 className="spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            </button>
          </div>
        </header>

        {/* Filters and Search Bar */}
        <div className="unified-cli-filter-bar">
          <div className="filter-tabs" role="tablist" aria-label="CLI filter tabs">
            <button
              type="button"
              role="tab"
              aria-selected={filterTab === "all"}
              className={`filter-tab ${filterTab === "all" ? "active" : ""}`}
              onClick={() => setFilterTab("all")}
            >
              All ({totalTypes})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterTab === "updates"}
              className={`filter-tab ${filterTab === "updates" ? "active" : ""} ${updatesAvailableCount > 0 ? "highlight" : ""}`}
              onClick={() => setFilterTab("updates")}
            >
              Updates available ({updatesAvailableCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterTab === "custom"}
              className={`filter-tab ${filterTab === "custom" ? "active" : ""}`}
              onClick={() => setFilterTab("custom")}
            >
              With custom procedures ({customCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterTab === "managed"}
              className={`filter-tab ${filterTab === "managed" ? "active" : ""}`}
              onClick={() => setFilterTab("managed")}
            >
              Managed ({managedTypes.length})
            </button>
          </div>

          <div className="search-box">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter CLIs…"
              aria-label="Filter CLIs"
            />
          </div>
        </div>

        {/* Global Select All Row */}
        <div className="unified-cli-select-all-row">
          <SpaceToggle
            id="cli-update-all-select-all"
            className="admin-operation-check indented select-all-label"
            name="cli-update-all-select-all"
            ariaLabel="Select all managed CLI types"
            label={<strong>{allSelected ? "Deselect all" : "Select all CLI types"}</strong>}
            detail={`(${managedTypes.length} managed CLIs)`}
            checked={!!allSelected}
            disabled={running}
            onChange={toggleSelectAll}
          />
          <span className="selected-counter">
            {selected.size} of {managedTypes.length} selected
          </span>
        </div>

        {/* Unified Single List of Cards */}
        <div className="unified-cli-card-list">
          {filteredCliTypes.length === 0 ? (
            <div className="unified-cli-empty">
              <p>No CLI types match the current filter.</p>
            </div>
          ) : (
            filteredCliTypes.map((entry) => {
              const isSelected = selected.has(entry.key);
              const presentCustoms = entry.custom.filter((c) => c.present);

              return (
                <div
                  key={entry.cliType}
                  className={`unified-cli-card ${isSelected ? "is-selected" : ""} ${
                    !entry.managed ? "not-managed" : ""
                  } ${!entry.enabled ? "is-disabled" : ""}`}
                >
                  {/* Card Top: Checkbox, Name, Badges */}
                  <div className="unified-cli-card-header">
                    <SpaceToggle
                      id={`cli-update-all-${entry.key}`}
                      className="unified-cli-toggle-wrapper"
                      name={`cli-update-all-${entry.key}`}
                      ariaLabel={entry.displayName}
                      label={
                        <span className="unified-cli-title">
                          <strong>{entry.displayName}</strong>
                          <span className="cli-type-key">{entry.key}</span>
                        </span>
                      }
                      checked={isSelected}
                      disabled={running || !entry.managed}
                      onChange={() => toggleKey(entry.key)}
                    />

                    <div className="unified-cli-badge-group">
                      <span className={`status-badge ${entry.enabled ? "enabled" : "disabled"}`}>
                        {entry.enabled ? "enabled" : "disabled"}
                      </span>
                      <span className={`status-badge ${entry.managed ? "managed" : "not-managed"}`}>
                        {entry.managed ? "managed" : "not managed"}
                      </span>
                      {entry.hasCustom ? (
                        <span className="status-badge has-custom" title={`${presentCustoms.length} custom procedure(s)`}>
                          <ShieldCheck aria-hidden="true" />
                          custom ({presentCustoms.length})
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Card Middle: Version Comparison Row */}
                  <div className="unified-cli-version-row">
                    <div className="version-col current">
                      <span className="version-label">Current version:</span>
                      <span className="version-text current" title={entry.installedVersion ?? "Not installed"}>
                        {entry.installedVersion ? `v${entry.installedVersion}` : "Not installed"}
                      </span>
                    </div>

                    <span className="version-flow-arrow" aria-hidden="true">→</span>

                    <div className="version-col latest">
                      <span className="version-label">Latest version:</span>
                      <span className="version-text latest" title={entry.availableVersion ?? (entry.managed ? "Checking…" : "Upstream git")}>
                        {entry.availableVersion
                          ? `v${entry.availableVersion}`
                          : entry.managed
                            ? "Checking…"
                            : "Upstream git"}
                      </span>
                    </div>

                    <div className="version-verdict">
                      {entry.updateAvailable ? (
                        <span className="verdict-pill update-available" title="A newer version is available to install">
                          <ArrowUp aria-hidden="true" />
                          Update available: {entry.installedVersion} → {entry.availableVersion}
                        </span>
                      ) : entry.installedVersion && entry.availableVersion && entry.installedVersion === entry.availableVersion ? (
                        <span className="verdict-pill up-to-date" title="Installed runtime matches the latest stable version">
                          <Check aria-hidden="true" />
                          Up to date
                        </span>
                      ) : !entry.managed ? (
                        <span className="verdict-pill not-managed" title="Standalone runtime managed outside Space bulk updates">
                          Standalone runtime
                        </span>
                      ) : (
                        <span className="verdict-pill current" title="Installed runtime is active">
                          {entry.installedVersion ? `v${entry.installedVersion} installed` : "No update path"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom: Custom Procedures Details */}
                  {entry.hasCustom && presentCustoms.length > 0 ? (
                    <div className="unified-cli-custom-box">
                      <div className="custom-box-header">
                        <ShieldCheck aria-hidden="true" />
                        <span>Preserved custom procedures ({presentCustoms.length}):</span>
                      </div>
                      <div className="custom-chips-wrap">
                        {presentCustoms.map((item, index) => (
                          <span key={index} className="custom-chip" title={item.path}>
                            <span className="custom-chip-kind">{item.kind}</span>
                            <span className="custom-chip-label">{item.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="unified-cli-standard-box">
                      <small>Standard runtime · Preserved and verified during every update.</small>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Note */}
        <p className="admin-operation-alert note" role="status">
          These custom procedures are preserved during every update. Enabling the <strong>reinstall</strong>{" "}
          toggle above re-applies each patch and config overlay on top after each update completes.
          Only managed CLI types can be individually updated. DeepSeek Harness is listed for detection only.
        </p>
      </section>

      {/* Results View */}
      {result ? (
        <section ref={resultRef} className="admin-operation-history" aria-label="Update-all result">
          <header>
            <span>
              <strong>Update result · {result.overallStatus}</strong>
              <small>
                {result.runtimes.length} CLI types · finished {new Date(result.finishedAt).toLocaleTimeString()}
              </small>
            </span>
            <CheckCircle2 aria-hidden="true" />
          </header>
          <div className="admin-operation-result-list">
            {result.runtimes.map((runtime) => (
              <div key={String(runtime.runtimeId ?? "runtime")}>
                <strong>{String(runtime.displayName ?? runtime.runtimeId ?? "Runtime")}</strong>
                <span className={`status-tag ${String(runtime.status).toLowerCase()}`}>
                  {String(runtime.status)}
                </span>
                <small>
                  {String(runtime.code)}
                  {runtime.installedVersion ? ` · was v${runtime.installedVersion}` : ""}
                  {runtime.availableVersion ? ` → now v${runtime.availableVersion}` : ""}
                  {runtime.customPreserved ? " · custom preserved" : ""}
                  {runtime.customReinstalled ? " · custom reinstalled" : ""}
                  {"errorMessage" in runtime && runtime.errorMessage
                    ? ` · ${String(runtime.errorMessage)}`
                    : ""}
                </small>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
