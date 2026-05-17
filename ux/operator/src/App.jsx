import {
  Activity,
  Bot,
  ChevronDown,
  Database,
  GripVertical,
  HeartPulse,
  KeyRound,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings,
  ShieldCheck,
  TerminalSquare,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "auracall.operatorUx.v1";
const STATUS_POLL_MS = 30000;

const NAV_ITEMS = [
  { id: "chats", label: "Chats", icon: MessageSquareText },
  { id: "search", label: "Search", icon: Search },
  { id: "runs", label: "Runs", icon: Activity },
  { id: "health", label: "Health", icon: HeartPulse },
];

const MENU_ITEMS = [
  { label: "UX Settings", icon: Settings },
  { label: "Tenant Config", icon: ShieldCheck },
  { label: "Agents", icon: Bot },
  { label: "Teams", icon: UsersRound },
  { label: "API Keys", icon: KeyRound },
  { label: "Diagnostics", icon: TerminalSquare },
];

const DEFAULT_LAYOUT = {
  activeNav: "chats",
  leftCollapsed: false,
  rightCollapsed: false,
  leftWidth: 288,
  rightWidth: 344,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readLayout() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { ...DEFAULT_LAYOUT, ...stored };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

function formatDateTime(value) {
  if (!value) return "not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return "unknown";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function statusTone(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (["ok", "healthy", "running", "complete", "enabled", "idle_waiting", "scheduled"].includes(normalized)) {
    return "good";
  }
  if (["waiting", "delayed", "eligible", "draft", "planned", "unconfigured"].includes(normalized)) {
    return "warn";
  }
  if (["blocked", "failed", "error", "attention_needed", "attention"].includes(normalized)) {
    return "bad";
  }
  return "neutral";
}

function useApiStatus() {
  const [state, setState] = useState({
    status: null,
    loading: true,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    let alive = true;
    let timer = null;
    let controller = null;

    async function load() {
      controller?.abort();
      controller = new AbortController();
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await fetch("/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const status = await response.json();
        if (!alive) return;
        setState({
          status,
          loading: false,
          error: null,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (!alive || error.name === "AbortError") return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error.message || "Unable to load status",
        }));
      }
    }

    load();
    timer = window.setInterval(load, STATUS_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  return state;
}

function useRunRecoveryStatus() {
  const [state, setState] = useState({
    status: null,
    loading: true,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    let alive = true;
    let timer = null;
    let controller = null;

    async function load() {
      controller?.abort();
      controller = new AbortController();
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await fetch("/status?recovery=true&sourceKind=all", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const status = await response.json();
        if (!alive) return;
        setState({
          status,
          loading: false,
          error: null,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (!alive || error.name === "AbortError") return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error.message || "Unable to load run recovery status",
        }));
      }
    }

    load();
    timer = window.setInterval(load, STATUS_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  return state;
}

function SectionList({ title, items }) {
  return (
    <section className="section-list" aria-label={title}>
      <h2>{title}</h2>
      <div className="list-stack">
        {items.map((item) => (
          <button className="list-row" type="button" key={item.title}>
            <span>
              <strong>{item.title}</strong>
              <small>{item.meta}</small>
            </span>
            <span className={`status-pill status-${item.status}`}>{item.status}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function HealthViewport({ apiStatus }) {
  const { status, loading, error, updatedAt } = apiStatus;
  const liveFollow = status?.liveFollow ?? {};
  const targets = liveFollow.targets ?? {};
  const accounts = targets.accounts ?? [];
  const routes = status?.routes ?? {};
  const discovery = status?.serviceDiscovery ?? {};
  const process = status?.process ?? {};
  const binding = status?.binding ?? {};

  return (
    <main className="viewport" tabIndex="-1">
      <div className="health-toolbar">
        <div className="viewport-heading">
          <span>Live AuraCall status</span>
          <h1>Service Health</h1>
          <p>Read-only status from the running API service, including route discovery and live-follow account posture.</p>
        </div>
        <div className="status-readout">
          <span className={`state-dot state-${statusTone(status?.ok ? "ok" : "error")}`} />
          <strong>{status?.ok ? "API reachable" : loading ? "Loading" : "API unavailable"}</strong>
          <small>{updatedAt ? `Updated ${formatDateTime(updatedAt)}` : "Waiting for first poll"}</small>
        </div>
      </div>

      {error ? <div className="health-error">Unable to load /status: {error}</div> : null}

      <div className="health-grid">
        <article className="health-card">
          <span className="card-kicker">API</span>
          <strong>{status?.version ?? "unknown"}</strong>
          <p>
            {binding.host ?? "127.0.0.1"}:{binding.port ?? "unknown"}
          </p>
          <div className="metric-row">
            <span>Auth</span>
            <b>{status?.auth?.required ? `${status.auth.scheme ?? "bearer"} (${status.auth.keyCount ?? 0})` : "off"}</b>
          </div>
          <div className="metric-row">
            <span>Scope</span>
            <b>{status?.auth?.scoped ? "scoped keys" : "global keys"}</b>
          </div>
        </article>

        <article className="health-card">
          <span className="card-kicker">Live Follow</span>
          <strong>{liveFollow.severity ?? "unknown"}</strong>
          <p>
            {liveFollow.schedulerPosture ?? "unknown"} / {liveFollow.schedulerState ?? "unknown"}
          </p>
          <div className="metric-row">
            <span>Active</span>
            <b>{formatNumber(liveFollow.activeCompletions)}</b>
          </div>
          <div className="metric-row">
            <span>Attention</span>
            <b>{formatNumber(targets.attentionNeeded)}</b>
          </div>
        </article>

        <article className="health-card">
          <span className="card-kicker">Routing</span>
          <strong>{discovery.local?.hostname ?? "auracall.localhost"}</strong>
          <p>
            {discovery.routing?.ingress ?? "local"} via {discovery.routing?.proxyTarget ?? "API service"}
          </p>
          <div className="route-list">
            <a href={routes.operatorBrowserDashboard ?? "/dashboard"}>Dashboard</a>
            <a href={routes.operatorDebugDashboard ?? "/ops/browser"}>Debug</a>
            <a href={routes.accountMirrorDashboard ?? "/account-mirror"}>Mirror</a>
          </div>
        </article>

        <article className="health-card">
          <span className="card-kicker">Runtime</span>
          <strong>{process.service ?? "auracall-api.service"}</strong>
          <p>
            PID {process.pid ?? "unknown"} / uptime {formatUptime(process.uptimeSeconds)}
          </p>
          <div className="metric-row">
            <span>CWD</span>
            <b>{process.cwd ?? "unknown"}</b>
          </div>
          <div className="metric-row">
            <span>Log</span>
            <b>{process.logPath ?? "unknown"}</b>
          </div>
        </article>
      </div>

      <section className="health-section" aria-label="Live follow accounts">
        <div className="section-heading">
          <h2>Live Follow Accounts</h2>
          <span>{formatNumber(accounts.length)} targets</span>
        </div>
        <div className="health-table-wrap">
          <table className="health-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Profile</th>
                <th>Desired</th>
                <th>Status</th>
                <th>Mirror</th>
                <th>Content</th>
                <th>Next attempt</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const counts = account.metadataCounts ?? {};
                return (
                  <tr key={`${account.provider}-${account.runtimeProfileId}`}>
                    <td>{account.provider}</td>
                    <td>{account.runtimeProfileId}</td>
                    <td>
                      <span className={`status-pill status-${statusTone(account.desiredState)}`}>{account.desiredState}</span>
                    </td>
                    <td>
                      <span className={`status-pill status-${statusTone(account.actualStatus)}`}>{account.actualStatus}</span>
                    </td>
                    <td>{account.mirrorCompleteness ?? "unknown"}</td>
                    <td>
                      {formatNumber(counts.conversations)} chats /{" "}
                      {formatNumber((counts.artifacts ?? 0) + (counts.files ?? 0) + (counts.media ?? 0))} files
                    </td>
                    <td>{formatDateTime(account.nextAttemptAt)}</td>
                  </tr>
                );
              })}
              {!accounts.length ? (
                <tr>
                  <td colSpan="7">No live-follow accounts reported yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function IdList({ title, ids }) {
  const visible = Array.isArray(ids) ? ids.slice(0, 12) : [];
  return (
    <article className="id-list">
      <div className="id-list-heading">
        <strong>{title}</strong>
        <span>{formatNumber(Array.isArray(ids) ? ids.length : 0)}</span>
      </div>
      {visible.length ? (
        <ul>
          {visible.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      ) : (
        <p>No runs reported.</p>
      )}
    </article>
  );
}

function RunsViewport({ runStatus }) {
  const { status, loading, error, updatedAt } = runStatus;
  const recovery = status?.recoverySummary ?? {};
  const localClaim = status?.localClaimSummary ?? {};
  const topology = status?.runnerTopology ?? {};
  const topologyMetrics = topology.metrics ?? {};
  const localClaimMetrics = localClaim.metrics ?? {};

  return (
    <main className="viewport" tabIndex="-1">
      <div className="health-toolbar">
        <div className="viewport-heading">
          <span>Runtime recovery posture</span>
          <h1>Runs</h1>
          <p>Read-only runtime state from `/status?recovery=true&sourceKind=all`, showing queue health without exposing API keys in the browser.</p>
        </div>
        <div className="status-readout">
          <span className={`state-dot state-${statusTone(error ? "error" : "ok")}`} />
          <strong>{error ? "Run status unavailable" : loading ? "Loading" : "Run status loaded"}</strong>
          <small>{updatedAt ? `Updated ${formatDateTime(updatedAt)}` : "Waiting for first poll"}</small>
        </div>
      </div>

      {error ? <div className="health-error">Unable to load run status: {error}</div> : null}

      <div className="health-grid runs-grid">
        <article className="health-card">
          <span className="card-kicker">Recovery</span>
          <strong>{formatNumber(recovery.totalRuns)} total</strong>
          <p>All runtime records currently visible to the recovery scanner.</p>
          <div className="metric-row">
            <span>Reclaimable</span>
            <b>{formatNumber(recovery.reclaimableRunIds?.length)}</b>
          </div>
          <div className="metric-row">
            <span>Stranded</span>
            <b>{formatNumber(recovery.strandedRunIds?.length)}</b>
          </div>
        </article>

        <article className="health-card">
          <span className="card-kicker">Local Claim</span>
          <strong>{formatNumber(localClaimMetrics.selectedCount)} selected</strong>
          <p>{localClaim.runnerId ?? "No local runner id reported"}</p>
          <div className="metric-row">
            <span>Blocked</span>
            <b>{formatNumber(localClaimMetrics.blockedCount)}</b>
          </div>
          <div className="metric-row">
            <span>Not ready</span>
            <b>{formatNumber(localClaimMetrics.notReadyCount)}</b>
          </div>
        </article>

        <article className="health-card">
          <span className="card-kicker">Runner Topology</span>
          <strong>{formatNumber(topologyMetrics.activeRunnerCount)} active</strong>
          <p>{topology.localExecutionOwnerRunnerId ?? "No execution owner reported"}</p>
          <div className="metric-row">
            <span>Fresh</span>
            <b>{formatNumber(topologyMetrics.freshRunnerCount)}</b>
          </div>
          <div className="metric-row">
            <span>Stale</span>
            <b>{formatNumber(topologyMetrics.staleRunnerCount)}</b>
          </div>
        </article>

        <article className="health-card">
          <span className="card-kicker">Authenticated APIs</span>
          <strong>{status?.routes?.runtimeRunsRecent ?? "/v1/runtime-runs/recent"}</strong>
          <p>Deep run listing and inspection remain on bearer-protected `/v1` routes.</p>
          <div className="metric-row">
            <span>Inspect</span>
            <b>{status?.routes?.runtimeRunInspection ? "available" : "unknown"}</b>
          </div>
          <div className="metric-row">
            <span>Status</span>
            <b>{status?.routes?.runStatusTemplate ? "available" : "unknown"}</b>
          </div>
        </article>
      </div>

      <section className="run-lists" aria-label="Runtime run id summaries">
        <IdList title="Reclaimable" ids={recovery.reclaimableRunIds} />
        <IdList title="Active Leases" ids={recovery.activeLeaseRunIds} />
        <IdList title="Stranded" ids={recovery.strandedRunIds} />
        <IdList title="Cancelled" ids={recovery.cancelledRunIds} />
      </section>
    </main>
  );
}

function MainViewport({ activeNav, apiStatus, runStatus }) {
  if (activeNav === "health") {
    return <HealthViewport apiStatus={apiStatus} />;
  }
  if (activeNav === "runs") {
    return <RunsViewport runStatus={runStatus} />;
  }

  const content = {
    chats: {
      title: "Conversation Archive",
      kicker: "Cache-backed chat review",
      body:
        "Chat views should render cached provider conversations as dialog transcripts with artifact cards, upload references, project context, and provider identity metadata.",
      rows: [
        ["Dialog layout", "Message bubbles, timestamps, model/runtime badges"],
        ["Artifacts", "Generated files, uploads, downloads, and provider links"],
        ["Filters", "Provider, account, project, run, and date"],
      ],
    },
    search: {
      title: "Search Workbench",
      kicker: "Lexical plus semantic retrieval",
      body:
        "Search should cover mirrored chats, AuraCall run archives, uploaded files, generated artifacts, and caller-supplied evidence without requiring browser work.",
      rows: [
        ["Lexical", "Fast exact text, metadata, ids, and file names"],
        ["Semantic", "Embeddings-backed retrieval across text and artifacts"],
        ["Result actions", "Open chat, inspect run, download asset, attach evidence"],
      ],
    },
  }[activeNav];

  return (
    <main className="viewport" tabIndex="-1">
      <div className="viewport-heading">
        <span>{content.kicker}</span>
        <h1>{content.title}</h1>
        <p>{content.body}</p>
      </div>
      <div className="capability-grid">
        {content.rows.map(([title, detail]) => (
          <article className="capability-card" key={title}>
            <strong>{title}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </div>
      <section className="timeline-band" aria-label="Implementation sequence">
        <div>
          <strong>First UX slice</strong>
          <p>Static operator shell with persistent layout, route taxonomy, and inspector surfaces.</p>
        </div>
        <div>
          <strong>Next integration</strong>
          <p>Typed API client for health, runs, archive search, and account mirror status.</p>
        </div>
      </section>
    </main>
  );
}

function LeftPane({ activeNav, apiStatus, runStatus }) {
  const status = apiStatus.status;
  if (activeNav === "health" && status) {
    const liveFollow = status.liveFollow ?? {};
    const targets = liveFollow.targets ?? {};
    return (
      <SectionList
        title="Context"
        items={[
          {
            title: "API service",
            meta: `${status.binding?.host ?? "127.0.0.1"}:${status.binding?.port ?? "unknown"} / ${status.auth?.keyCount ?? 0} keys`,
            status: status.ok ? "good" : "bad",
          },
          {
            title: "Live follow",
            meta: `${targets.enabled ?? 0} enabled, ${targets.running ?? 0} running, ${targets.attentionNeeded ?? 0} attention`,
            status: statusTone(liveFollow.severity),
          },
          {
            title: "Routes",
            meta: status.serviceDiscovery?.local?.dashboardUrl ?? "/dashboard",
            status: "good",
          },
        ]}
      />
    );
  }
  if (activeNav === "runs" && runStatus.status) {
    const recovery = runStatus.status.recoverySummary ?? {};
    const localClaim = runStatus.status.localClaimSummary ?? {};
    const metrics = localClaim.metrics ?? {};
    return (
      <SectionList
        title="Context"
        items={[
          {
            title: "Recovery scan",
            meta: `${recovery.totalRuns ?? 0} total, ${(recovery.reclaimableRunIds ?? []).length} reclaimable`,
            status: statusTone((recovery.strandedRunIds ?? []).length ? "attention" : "healthy"),
          },
          {
            title: "Local claim",
            meta: `${metrics.selectedCount ?? 0} selected, ${metrics.notReadyCount ?? 0} not ready`,
            status: statusTone((metrics.blockedCount ?? 0) ? "blocked" : "waiting"),
          },
          {
            title: "Deep inspection",
            meta: "Bearer-protected /v1 runtime run APIs",
            status: "warn",
          },
        ]}
      />
    );
  }

  const datasets = {
    chats: [
      { title: "Recent conversations", meta: "Provider cache and project-bound runs", status: "draft" },
      { title: "Artifacts", meta: "Generated files and upload references", status: "planned" },
      { title: "Conversation filters", meta: "Provider, tenant, project, model", status: "planned" },
    ],
    search: [
      { title: "All indexed content", meta: "Archive, mirrors, artifacts, evidence", status: "planned" },
      { title: "Saved filters", meta: "Operator-owned search presets", status: "draft" },
      { title: "Dedupe keys", meta: "UUID, checksum, provider ids", status: "planned" },
    ],
    runs: [
      { title: "Active work", meta: "Responses, batches, live follow", status: "planned" },
      { title: "Queues", meta: "Priority, cooldowns, dispatcher locks", status: "planned" },
      { title: "Algorithms", meta: "Course grading, transcript enrichment", status: "draft" },
    ],
    health: [
      { title: "Service surfaces", meta: "API, MCP, scheduler, archive", status: "planned" },
      { title: "Browser profiles", meta: "Identity, auth, DOM drift, locks", status: "planned" },
      { title: "Provider guards", meta: "Bot gates, rate limits, status probes", status: "planned" },
    ],
  };
  return <SectionList title="Context" items={datasets[activeNav]} />;
}

function RightPane({ activeNav, apiStatus, runStatus }) {
  const labels = {
    chats: "Conversation inspector",
    search: "Result inspector",
    runs: "Run inspector",
    health: "Health inspector",
  };
  const status = apiStatus.status;
  const runs = runStatus.status;
  const details =
    activeNav === "health" && status
      ? [
          ["Source", "/status"],
          ["Service", status.process?.service ?? "auracall-api.service"],
          ["Route", status.routes?.operatorBrowserDashboardUrl ?? status.routes?.operatorBrowserDashboard ?? "/dashboard"],
          ["Debug", status.routes?.operatorDebugDashboard ?? "/ops/browser"],
        ]
      : activeNav === "runs" && runs
        ? [
            ["Source", "/status?recovery=true&sourceKind=all"],
            ["Recent runs", runs.routes?.runtimeRunsRecent ?? "/v1/runtime-runs/recent"],
            ["Inspect", runs.routes?.runtimeRunInspection ?? "/v1/runtime-runs/inspect"],
            ["Auth", "Deep /v1 data requires bearer key"],
          ]
      : [
          ["Source of truth", "AuraCall JSON API"],
          ["Mode", "Read-only shell scaffold"],
          ["Debug dashboard", "Keep existing surface for low-level probes"],
        ];
  const preview =
    activeNav === "health" && status
      ? {
          ok: status.ok,
          port: status.binding?.port,
          liveFollow: {
            severity: status.liveFollow?.severity,
            active: status.liveFollow?.activeCompletions,
            attention: status.liveFollow?.targets?.attentionNeeded,
          },
        }
      : activeNav === "runs" && runs
        ? {
            totalRuns: runs.recoverySummary?.totalRuns,
            reclaimable: runs.recoverySummary?.reclaimableRunIds?.length,
            stranded: runs.recoverySummary?.strandedRunIds?.length,
            selected: runs.localClaimSummary?.metrics?.selectedCount,
            activeRunners: runs.runnerTopology?.metrics?.activeRunnerCount,
          }
      : { route: activeNav, mutable: false };

  return (
    <aside className="inspector-body" aria-label={labels[activeNav]}>
      <div className="inspector-header">
        <Database size={18} />
        <span>{labels[activeNav]}</span>
      </div>
      <dl>
        {details.map(([term, detail]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
      <div className="json-preview">
        <code>{JSON.stringify(preview, null, 2)}</code>
      </div>
    </aside>
  );
}

export default function App() {
  const [layout, setLayout] = useState(readLayout);
  const [menuOpen, setMenuOpen] = useState(false);
  const dragRef = useRef(null);
  const apiStatus = useApiStatus();
  const runStatus = useRunRecoveryStatus();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    function onPointerMove(event) {
      if (!dragRef.current) return;
      const { pane } = dragRef.current;
      if (pane === "left") {
        setLayout((current) => ({
          ...current,
          leftWidth: clamp(event.clientX, 232, 440),
        }));
      }
      if (pane === "right") {
        setLayout((current) => ({
          ...current,
          rightWidth: clamp(window.innerWidth - event.clientX, 280, 520),
        }));
      }
    }

    function onPointerUp() {
      dragRef.current = null;
      document.body.classList.remove("is-resizing-pane");
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const activeItem = useMemo(
    () => NAV_ITEMS.find((item) => item.id === layout.activeNav) ?? NAV_ITEMS[0],
    [layout.activeNav],
  );

  function beginResize(pane) {
    dragRef.current = { pane };
    document.body.classList.add("is-resizing-pane");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <button className="icon-button mobile-menu" type="button" aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <span>AuraCall</span>
        </div>
        <nav className="topnav" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={item.id === layout.activeNav ? "nav-item is-active" : "nav-item"}
                type="button"
                key={item.id}
                onClick={() => setLayout((current) => ({ ...current, activeNav: item.id }))}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="account-wrap">
          <button className="account-chip" type="button" onClick={() => setMenuOpen((open) => !open)}>
            <span className="avatar">AC</span>
            <span className="account-copy">
              <strong>Operator</strong>
              <small>{activeItem.label}</small>
            </span>
            <ChevronDown size={15} />
          </button>
          {menuOpen ? (
            <div className="account-menu">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button type="button" key={item.label}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </header>

      <div
        className="workbench"
        style={{
          "--left-width": `${layout.leftWidth}px`,
          "--right-width": `${layout.rightWidth}px`,
        }}
      >
        <aside className={layout.leftCollapsed ? "pane left-pane is-collapsed" : "pane left-pane"}>
          <div className="pane-toolbar">
            <button
              className="icon-button"
              type="button"
              aria-label={layout.leftCollapsed ? "Expand left pane" : "Collapse left pane"}
              onClick={() => setLayout((current) => ({ ...current, leftCollapsed: !current.leftCollapsed }))}
            >
              {layout.leftCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </div>
          <div className="pane-content">
            <LeftPane activeNav={layout.activeNav} apiStatus={apiStatus} runStatus={runStatus} />
          </div>
          <button className="resize-handle right" type="button" aria-label="Resize left pane" onPointerDown={() => beginResize("left")}>
            <GripVertical size={16} />
          </button>
        </aside>

        <MainViewport activeNav={layout.activeNav} apiStatus={apiStatus} runStatus={runStatus} />

        <aside className={layout.rightCollapsed ? "pane right-pane is-collapsed" : "pane right-pane"}>
          <button className="resize-handle left" type="button" aria-label="Resize right pane" onPointerDown={() => beginResize("right")}>
            <GripVertical size={16} />
          </button>
          <div className="pane-toolbar">
            <button
              className="icon-button"
              type="button"
              aria-label={layout.rightCollapsed ? "Expand right pane" : "Collapse right pane"}
              onClick={() => setLayout((current) => ({ ...current, rightCollapsed: !current.rightCollapsed }))}
            >
              {layout.rightCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
            </button>
          </div>
          <div className="pane-content">
            <RightPane activeNav={layout.activeNav} apiStatus={apiStatus} runStatus={runStatus} />
          </div>
        </aside>
      </div>
    </div>
  );
}
