import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8081";
const ROOT_CAUSES = [
  "Network",
  "Database",
  "Application",
  "Configuration",
  "Security",
  "Other",
];
const SEVERITY_ORDER = { critical: 1, high: 2, medium: 3, low: 4 };
const STATUS_ORDER = { open: 1, investigating: 2, resolved: 3, closed: 4 };

function formatDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function safeJsonParse(input) {
  if (!input?.trim()) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (error) {
    return { ok: false, error };
  }
}

function getBackendLabel({ loading, error }) {
  if (loading) return { tone: "muted", label: "Connecting…" };
  if (error) return { tone: "danger", label: "Offline" };
  return { tone: "success", label: "Online" };
}

function App() {
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [activeTab, setActiveTab] = useState("Live Feed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [toast, setToast] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const toastTimerRef = useRef(null);

  const [rcaForm, setRcaForm] = useState({
    startAt: "",
    endAt: "",
    rootCause: "Application",
    fixApplied: "",
    preventionSteps: "",
  });

  const [signalForm, setSignalForm] = useState({
    type: "error",
    source: "webserver-1",
    severity: "high",
    description: "Database connection timeout",
    metadata: `{
  "usage": 92
}`,
  });
  const [signalResponse, setSignalResponse] = useState(null);
  const [signalError, setSignalError] = useState("");

  function showToast(message, tone = "info") {
    setToast({ message, tone });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  const sortedIncidents = useMemo(() => {
    return [...incidents]
      .filter((incident) => {
        if (!incident) return false;

        if (statusFilter !== "all") {
          if (statusFilter === "active") {
            if (incident.status === "closed") return false;
          } else if (incident.status !== statusFilter) {
            return false;
          }
        }

        if (severityFilter !== "all" && incident.severity !== severityFilter) return false;

        const needle = search.trim().toLowerCase();
        if (!needle) return true;

        const haystack = [
          incident.description,
          incident.source,
          incident.status,
          incident.severity,
          incident._id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(needle);
      })
      .sort((a, b) => {
        const severityDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
        if (severityDiff !== 0) return severityDiff;
        const statusDiff = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
        if (statusDiff !== 0) return statusDiff;
        return new Date(b.timeline?.openedAt) - new Date(a.timeline?.openedAt);
      });
  }, [incidents, search, severityFilter, statusFilter]);

  async function loadIncidents({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
    }
    setError("");
    try {
      const response = await fetch(`${API_URL}/incidents`);
      if (!response.ok) {
        throw new Error(`Failed to load incidents (${response.status})`);
      }
      const data = await response.json();
      setIncidents(Array.isArray(data) ? data : []);
      setLastUpdatedAt(new Date());

      if (Array.isArray(data) && data.length > 0) {
        setSelectedIncident((prev) => {
          if (!prev) return data[0];
          const stillExists = data.find((incident) => incident?._id === prev?._id);
          return stillExists ?? data[0];
        });
      }
    } catch (err) {
      setError(err.message || "Unable to reach backend");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadIncidents().catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      loadIncidents({ silent: true }).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  function selectIncident(incident) {
    setSelectedIncident(incident);
    setActiveTab("Incident Detail");
    setSubmitMessage("");
  }

  async function handleRcaSubmit(event) {
    event.preventDefault();
    setSubmitMessage("");

    if (!selectedIncident) {
      setSubmitMessage("Please select an incident first.");
      showToast("Select an incident first.", "warning");
      return;
    }

    const payload = {
      description: rcaForm.fixApplied,
      rootCause: rcaForm.rootCause,
      actionItems: rcaForm.preventionSteps
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    };

    try {
      const response = await fetch(
        `${API_URL}/incidents/${selectedIncident._id}/rca`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || `HTTP ${response.status}`);
      }

      const updated = await response.json();
      setSelectedIncident(updated);
      setSubmitMessage("RCA saved successfully.");
      showToast("RCA saved.", "success");
    } catch (err) {
      setSubmitMessage(`Failed to save RCA: ${err.message}`);
      showToast("Failed to save RCA.", "danger");
    }
  }

  async function handleSignalSubmit(event) {
    event.preventDefault();
    setSignalError("");
    setSignalResponse(null);

    const parsedMetadata = safeJsonParse(signalForm.metadata);
    if (!parsedMetadata.ok) {
      setSignalError("Invalid JSON in metadata field.");
      showToast("Metadata must be valid JSON.", "warning");
      return;
    }

    const payload = {
      type: signalForm.type,
      source: signalForm.source,
      severity: signalForm.severity,
      description: signalForm.description,
      metadata: parsedMetadata.value,
    };

    try {
      const response = await fetch(`${API_URL}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setSignalResponse(data);
      setSignalError("");
      setSubmitMessage("");
      showToast("Signal sent. Processing…", "success");
      if (data.signalId) {
        setTimeout(() => {
          loadIncidents({ silent: true }).catch(() => {});
          setActiveTab("Incident Detail");
        }, 400);
      }
    } catch (err) {
      setSignalError(err.message || "Failed to send signal");
      showToast("Failed to send signal.", "danger");
    }
  }

  const backendStatus = getBackendLabel({ loading, error });
  const selectedSignalsCount = selectedIncident?.signals?.length ?? 0;

  return (
    <div className="page">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <p className="eyebrow">Incident Management System</p>
            <h1 className="title">IMS Dashboard</h1>
            <p className="subtle">
              API: <span className="mono">{API_URL}</span>
              {lastUpdatedAt ? (
                <>
                  {" "}
                  • Updated <span className="mono">{formatDate(lastUpdatedAt)}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="header-actions">
          <span className={`status-badge ${backendStatus.tone}`}>{backendStatus.label}</span>
          <button
            className="button"
            type="button"
            onClick={() => loadIncidents().catch(() => {})}
            disabled={loading}
          >
            Refresh
          </button>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Auto-refresh
          </label>
        </div>
      </header>

      <main className="layout">
        <aside className="panel sidebar">
          <div className="panel-header">
            <h2>Incidents</h2>
            <p className="subtle">{sortedIncidents.length} shown</p>
          </div>

          <div className="filters">
            <div className="field">
              <label className="label" htmlFor="search">
                Search
              </label>
              <input
                id="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Description, source, id…"
              />
            </div>

            <div className="filter-row">
              <div className="field">
                <label className="label" htmlFor="status">
                  Status
                </label>
                <select
                  id="status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="active">Active (not closed)</option>
                  <option value="open">Open</option>
                  <option value="investigating">Investigating</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                  <option value="all">All</option>
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="severity">
                  Severity
                </label>
                <select
                  id="severity"
                  value={severityFilter}
                  onChange={(event) => setSeverityFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
          </div>

          {loading ? <p className="callout subtle">Loading incidents…</p> : null}
          {error ? <p className="callout danger">{error}</p> : null}
          {!loading && !error && sortedIncidents.length === 0 ? (
            <p className="callout subtle">No incidents match your filters.</p>
          ) : null}

          <ul className="incident-list">
            {sortedIncidents.map((incident) => {
              const selected = selectedIncident?._id === incident._id;
              return (
                <li key={incident._id}>
                  <button
                    type="button"
                    className={`incident-row ${selected ? "selected" : ""}`}
                    onClick={() => selectIncident(incident)}
                  >
                    <div className="incident-row-top">
                      <span className={`chip ${incident.severity}`}>{incident.severity}</span>
                      <span className="status-pill">{incident.status}</span>
                    </div>
                    <div className="incident-row-title">{incident.description}</div>
                    <div className="incident-row-meta">
                      <span className="meta">
                        <span className="meta-label">Source</span>
                        <span className="mono">{incident.source}</span>
                      </span>
                      <span className="meta">
                        <span className="meta-label">Opened</span>
                        <span className="mono">{formatDate(incident.timeline?.openedAt)}</span>
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="panel content">
          <nav className="tabs" aria-label="views">
            {["Live Feed", "Incident Detail", "RCA Form", "Send Signal"].map((tab) => (
              <button
                key={tab}
                type="button"
                className={`tab ${activeTab === tab ? "active" : ""}`}
                onClick={() => {
                  setActiveTab(tab);
                  setSubmitMessage("");
                }}
              >
                {tab}
              </button>
            ))}
          </nav>

          {activeTab === "Live Feed" && (
            <section className="pane">
              <div className="pane-header">
                <div>
                  <h2>Overview</h2>
                  <p className="subtle">Select an incident to view details and signals.</p>
                </div>
                <div className="kpis">
                  <div className="kpi">
                    <p className="kpi-label">Active incidents</p>
                    <p className="kpi-value">{incidents.length}</p>
                  </div>
                  <div className="kpi">
                    <p className="kpi-label">Selected signals</p>
                    <p className="kpi-value">{selectedSignalsCount}</p>
                  </div>
                </div>
              </div>

              <div className="card">
                {selectedIncident ? (
                  <>
                    <div className="card-title-row">
                      <h3 className="card-title">{selectedIncident.description}</h3>
                      <div className="card-badges">
                        <span className={`chip ${selectedIncident.severity}`}>
                          {selectedIncident.severity}
                        </span>
                        <span className="status-pill">{selectedIncident.status}</span>
                      </div>
                    </div>
                    <div className="definition-grid">
                      <div>
                        <p className="def-label">Source</p>
                        <p className="mono">{selectedIncident.source}</p>
                      </div>
                      <div>
                        <p className="def-label">Opened</p>
                        <p className="mono">{formatDate(selectedIncident.timeline?.openedAt)}</p>
                      </div>
                      <div>
                        <p className="def-label">Resolved</p>
                        <p className="mono">{formatDate(selectedIncident.timeline?.resolvedAt)}</p>
                      </div>
                      <div>
                        <p className="def-label">Signals</p>
                        <p className="mono">{selectedSignalsCount}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="subtle">No incident selected yet.</p>
                )}
              </div>
            </section>
          )}

          {activeTab === "Incident Detail" && (
            <section className="pane">
              <div className="pane-header">
                <div>
                  <h2>Incident detail</h2>
                  <p className="subtle">Review the incident timeline and attached signals.</p>
                </div>
              </div>

              {!selectedIncident ? <p className="callout subtle">Select an incident from the list.</p> : null}

              {selectedIncident ? (
                <div className="two-col">
                  <div className="card">
                    <div className="card-title-row">
                      <h3 className="card-title">{selectedIncident.description}</h3>
                      <div className="card-badges">
                        <span className={`chip ${selectedIncident.severity}`}>
                          {selectedIncident.severity}
                        </span>
                        <span className="status-pill">{selectedIncident.status}</span>
                      </div>
                    </div>

                    <div className="definition-grid">
                      <div>
                        <p className="def-label">Source</p>
                        <p className="mono">{selectedIncident.source}</p>
                      </div>
                      <div>
                        <p className="def-label">Opened</p>
                        <p className="mono">{formatDate(selectedIncident.timeline?.openedAt)}</p>
                      </div>
                      <div>
                        <p className="def-label">Resolved</p>
                        <p className="mono">{formatDate(selectedIncident.timeline?.resolvedAt)}</p>
                      </div>
                      <div>
                        <p className="def-label">Incident ID</p>
                        <p className="mono">{selectedIncident._id}</p>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <h3 className="card-title">Signals</h3>
                    {selectedIncident.signals?.length ? (
                      <ul className="signal-list">
                        {selectedIncident.signals.map((signal) => (
                          <li key={signal._id} className="signal-item">
                            <div className="signal-top">
                              <span className="signal-title">
                                <span className="mono">{signal.type}</span>
                                <span className="dot" aria-hidden="true" />
                                <span className="mono">{signal.source}</span>
                              </span>
                              <span className={`chip ${signal.severity}`}>{signal.severity}</span>
                            </div>
                            <p className="subtle">{signal.description || "No description"}</p>
                            <details className="json-details">
                              <summary className="json-summary">Metadata</summary>
                              <pre className="json-pre">{JSON.stringify(signal.metadata, null, 2)}</pre>
                            </details>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="subtle">No raw signals attached yet.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          )}

          {activeTab === "RCA Form" && (
            <section className="pane">
              <div className="pane-header">
                <div>
                  <h2>RCA form</h2>
                  <p className="subtle">Attach root cause details to the selected incident.</p>
                </div>
              </div>

              {!selectedIncident ? (
                <p className="callout subtle">Select an incident from the list first.</p>
              ) : (
                <form onSubmit={handleRcaSubmit} className="form">
                  <div className="form-grid">
                    <div className="field">
                      <label className="label">
                        Incident start
                        <input
                          type="datetime-local"
                          value={rcaForm.startAt}
                          onChange={(event) =>
                            setRcaForm((prev) => ({ ...prev, startAt: event.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <div className="field">
                      <label className="label">
                        Incident end
                        <input
                          type="datetime-local"
                          value={rcaForm.endAt}
                          onChange={(event) =>
                            setRcaForm((prev) => ({ ...prev, endAt: event.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <div className="field span-2">
                      <label className="label">
                        Root cause category
                        <select
                          value={rcaForm.rootCause}
                          onChange={(event) =>
                            setRcaForm((prev) => ({ ...prev, rootCause: event.target.value }))
                          }
                        >
                          {ROOT_CAUSES.map((cause) => (
                            <option key={cause} value={cause}>
                              {cause}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="field span-2">
                      <label className="label">
                        Fix applied
                        <textarea
                          rows={4}
                          placeholder="What was changed to resolve the incident?"
                          value={rcaForm.fixApplied}
                          onChange={(event) =>
                            setRcaForm((prev) => ({ ...prev, fixApplied: event.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <div className="field span-2">
                      <label className="label">
                        Prevention steps
                        <textarea
                          rows={5}
                          placeholder="One item per line"
                          value={rcaForm.preventionSteps}
                          onChange={(event) =>
                            setRcaForm((prev) => ({
                              ...prev,
                              preventionSteps: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div className="form-footer">
                    <div className="subtle">
                      Incident: <span className="mono">{selectedIncident.description}</span>
                    </div>
                    <button type="submit" className="button primary">
                      Save RCA
                    </button>
                  </div>

                  {submitMessage ? <p className="callout subtle">{submitMessage}</p> : null}
                </form>
              )}
            </section>
          )}

          {activeTab === "Send Signal" && (
            <section className="pane">
              <div className="pane-header">
                <div>
                  <h2>Send signal</h2>
                  <p className="subtle">Generate a signal and watch it become an incident.</p>
                </div>
              </div>

              <form onSubmit={handleSignalSubmit} className="form">
                <div className="form-grid">
                  <div className="field">
                    <label className="label">
                      Type
                      <input
                        value={signalForm.type}
                        onChange={(event) =>
                          setSignalForm((prev) => ({ ...prev, type: event.target.value }))
                        }
                        placeholder="error / warning / exception …"
                      />
                    </label>
                  </div>

                  <div className="field">
                    <label className="label">
                      Source
                      <input
                        value={signalForm.source}
                        onChange={(event) =>
                          setSignalForm((prev) => ({ ...prev, source: event.target.value }))
                        }
                        placeholder="api-server / webserver-1 …"
                      />
                    </label>
                  </div>

                  <div className="field">
                    <label className="label">
                      Severity
                      <select
                        value={signalForm.severity}
                        onChange={(event) =>
                          setSignalForm((prev) => ({ ...prev, severity: event.target.value }))
                        }
                      >
                        {Object.keys(SEVERITY_ORDER).map((severity) => (
                          <option key={severity} value={severity}>
                            {severity}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="field span-2">
                    <label className="label">
                      Description
                      <textarea
                        rows={3}
                        value={signalForm.description}
                        onChange={(event) =>
                          setSignalForm((prev) => ({ ...prev, description: event.target.value }))
                        }
                        placeholder="What happened?"
                      />
                    </label>
                  </div>

                  <div className="field span-2">
                    <label className="label">
                      Metadata (JSON)
                      <textarea
                        rows={7}
                        value={signalForm.metadata}
                        onChange={(event) =>
                          setSignalForm((prev) => ({ ...prev, metadata: event.target.value }))
                        }
                        className="mono"
                      />
                    </label>
                    <p className="helper">
                      Tip: keep metadata small; it’s stored with the signal and shown in the detail view.
                    </p>
                  </div>
                </div>

                <div className="form-footer">
                  <div className="subtle">Backend endpoint: <span className="mono">{API_URL}/signals</span></div>
                  <button type="submit" className="button primary">
                    Send signal
                  </button>
                </div>

                {signalError ? <p className="callout danger">{signalError}</p> : null}
                {signalResponse ? (
                  <div className="card">
                    <h3 className="card-title">Response</h3>
                    <pre className="json-pre">{JSON.stringify(signalResponse, null, 2)}</pre>
                  </div>
                ) : null}
              </form>
            </section>
          )}
        </section>
      </main>

      {toast ? (
        <div className={`toast ${toast.tone}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

export default App;
