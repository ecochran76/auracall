import {
  Activity,
  Bot,
  ChevronDown,
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
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
const ARCHIVE_KEY_STORAGE = "auracall.operatorUx.archiveKey";
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

const ARCHIVE_KINDS = [
  "all",
  "response",
  "response_batch",
  "team_run",
  "media_generation",
  "upload",
  "generated_artifact",
  "provider_conversation",
  "evidence",
];

const DEFAULT_LAYOUT = {
  activeNav: "chats",
  leftCollapsed: false,
  rightCollapsed: false,
  leftWidth: 264,
  rightWidth: 320,
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

function compactText(value, maxLength = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function readSessionValue(key) {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeSessionValue(key, value) {
  try {
    if (value) {
      sessionStorage.setItem(key, value);
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Session storage can be disabled; keep the in-memory value.
  }
}

function fileNameFromDisposition(value) {
  const match = String(value ?? "").match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/"$/u, "")) : null;
}

function isPreviewableText(mimeType, fileName) {
  const mime = String(mimeType ?? "").toLowerCase();
  const name = String(fileName ?? "").toLowerCase();
  return (
    mime.startsWith("text/")
    || ["application/json", "application/xml", "application/javascript"].includes(mime)
    || /\.(json|txt|md|csv|xml|log)$/u.test(name)
  );
}

function base64UrlEncodeText(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function archiveItemRoute(item) {
  if (!item?.id) return null;
  return `/v1/archive/items/b64/${base64UrlEncodeText(item.id)}`;
}

function archiveItemAssetRoute(item) {
  if (!item?.fileAvailable) return null;
  const route = archiveItemRoute(item);
  return item.links?.asset ?? (route ? `${route}/asset` : null);
}

function readStringField(value, fields) {
  if (!value || typeof value !== "object") return null;
  for (const field of fields) {
    const candidate = value[field];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function readObjectField(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value[field];
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : null;
}

function normalizeChatRole(value) {
  const role = String(value ?? "").toLowerCase();
  if (["assistant", "ai", "model", "gpt"].includes(role)) return "assistant";
  if (["user", "human", "operator"].includes(role)) return "user";
  if (["system", "developer", "tool"].includes(role)) return role;
  return "assistant";
}

function stringifyMessagePart(part) {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  return readStringField(part, ["text", "content", "markdown", "body"]) ?? JSON.stringify(part);
}

function readConversationTurnContent(value) {
  const direct = readStringField(value, ["text", "content", "message", "body", "markdown"]);
  if (direct) return direct;
  const content = readObjectField(value, "content");
  if (content) {
    const parts = content.parts;
    if (Array.isArray(parts)) return parts.map(stringifyMessagePart).join("\n").trim();
    return readStringField(content, ["text", "content", "markdown", "body"]);
  }
  const parts = value && typeof value === "object" ? value.parts : null;
  if (Array.isArray(parts)) return parts.map(stringifyMessagePart).join("\n").trim();
  return null;
}

function normalizeConversationTurn(value, index) {
  if (!value || typeof value !== "object") return null;
  const author = readObjectField(value, "author");
  const role = normalizeChatRole(readStringField(value, ["role", "authorRole", "speaker", "from"]) ?? readStringField(author, ["role", "name"]));
  const content = readConversationTurnContent(value);
  if (!content) return null;
  return {
    id: readStringField(value, ["id", "messageId"]) ?? `turn-${index}`,
    role,
    content,
    createdAt: readStringField(value, ["createdAt", "created", "timestamp", "time"]),
  };
}

function extractConversationTurns(item) {
  if (!item || typeof item !== "object") return [];
  for (const field of ["messages", "turns", "conversation", "transcript"]) {
    const value = item[field];
    if (Array.isArray(value)) return value.map(normalizeConversationTurn).filter(Boolean);
  }
  if (item.mapping && typeof item.mapping === "object") {
    return Object.values(item.mapping)
      .map((entry) => (entry && typeof entry === "object" ? entry.message : null))
      .filter(Boolean)
      .map(normalizeConversationTurn)
      .filter(Boolean);
  }
  return [];
}

function flattenConversationEntries(payload) {
  return (payload?.entries ?? []).flatMap((entry) =>
    (entry.manifests?.conversations ?? []).map((conversation) => ({
      ...conversation,
      provider: conversation.provider ?? entry.provider,
      runtimeProfileId: entry.runtimeProfileId,
      browserProfileId: entry.browserProfileId,
      boundIdentityKey: entry.boundIdentityKey,
      mirrorStatus: entry.status,
      mirrorCompleteness: entry.mirrorCompleteness?.state,
    })),
  );
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

function routeLabel(value) {
  const route = String(value ?? "").trim();
  if (!route) return "unknown";
  const withoutMethod = route.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "");
  try {
    const url = new URL(withoutMethod);
    return url.pathname || url.hostname;
  } catch {
    const pathStart = withoutMethod.indexOf("/");
    const candidate = pathStart >= 0 ? withoutMethod.slice(pathStart) : withoutMethod;
    return candidate.split("[")[0].split("?")[0].split(" ")[0] || candidate;
  }
}

function linkKeyLabel(value) {
  return String(value ?? "Link")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value ?? ""));
}

function isNavigableRoute(value) {
  const route = String(value ?? "");
  return isUrl(route) || route.startsWith("/");
}

function RouteChip({ value, label }) {
  const [copied, setCopied] = useState(false);
  const fullValue = String(value ?? "unknown");
  const display = label ?? routeLabel(fullValue);
  const external = isUrl(fullValue);

  async function copyRoute() {
    try {
      await navigator.clipboard.writeText(fullValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="route-chip" title={fullValue}>
      <code>{display}</code>
      <button type="button" aria-label={`Copy ${display}`} title="Copy full route" onClick={copyRoute}>
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      </button>
      {isNavigableRoute(fullValue) ? (
        <a href={fullValue} aria-label={`Open ${display}`} title="Open route" {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      ) : null}
    </span>
  );
}

function DetailValue({ detail }) {
  if (detail && typeof detail === "object" && detail.kind === "route") {
    return <RouteChip value={detail.value} label={detail.label} />;
  }
  return detail;
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
          <article className="list-row" key={item.title}>
            <span>
              <strong>{item.title}</strong>
              <small>{item.route ? <RouteChip value={item.route} label={item.meta} /> : item.meta}</small>
            </span>
            <span className={`status-pill status-${item.status}`}>{item.status}</span>
          </article>
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
          <strong>{status?.routes?.runtimeRunsRecent ? "available" : "unknown"}</strong>
          <p>Deep run listing and inspection remain on bearer-protected `/v1` routes.</p>
          <div className="metric-row">
            <span>Recent</span>
            <b>{status?.routes?.runtimeRunsRecent ?? "unknown"}</b>
          </div>
          <div className="metric-row">
            <span>Inspect</span>
            <b>{status?.routes?.runtimeRunInspection ?? "unknown"}</b>
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

function selectedArchiveSummary(item) {
  if (!item) return null;
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    file: {
      name: item.fileName,
      mimeType: item.mimeType,
      available: item.fileAvailable,
      checksumSha256: item.checksumSha256 ? compactText(item.checksumSha256, 28) : null,
    },
    provider: {
      name: item.provider,
      runtimeProfile: item.runtimeProfile,
      browserProfile: item.browserProfile,
      conversationId: item.providerConversationId,
    },
    ownership: {
      projectId: item.projectId,
      boundIdentityKey: item.boundIdentityKey,
      agentId: item.agentId,
      teamId: item.teamId,
    },
    links: Object.keys(item.links ?? {}),
    metadataKeys: Object.keys(item.metadata ?? {}),
    updatedAt: item.updatedAt,
  };
}

function emptyArchiveDetailState() {
  return {
    loading: false,
    error: null,
    result: null,
    updatedAt: null,
  };
}

function ArchiveSearchViewport({
  apiStatus,
  archiveApiKey,
  onArchiveApiKeyChange,
  selectedArchiveItem,
  onSelectedArchiveItemChange,
  onSelectedArchiveDetailChange,
}) {
  const [filters, setFilters] = useState({
    q: "",
    kind: "all",
    provider: "",
    status: "",
    limit: "25",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchedAt, setSearchedAt] = useState(null);
  const archiveRoute = apiStatus.status?.routes?.runArchive ?? "/v1/archive";

  useEffect(() => {
    if (!selectedArchiveItem) {
      onSelectedArchiveDetailChange(emptyArchiveDetailState());
      return undefined;
    }
    const trimmedKey = archiveApiKey.trim();
    if (!trimmedKey) {
      onSelectedArchiveDetailChange({
        loading: false,
        error: "Operator API key required to inspect archive item detail.",
        result: null,
        updatedAt: null,
      });
      return undefined;
    }

    let alive = true;
    const controller = new AbortController();
    onSelectedArchiveDetailChange({
      loading: true,
      error: null,
      result: null,
      updatedAt: null,
    });

    fetch(archiveItemRoute(selectedArchiveItem), {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${trimmedKey}`,
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
        return payload;
      })
      .then((payload) => {
        if (!alive) return;
        onSelectedArchiveDetailChange({
          loading: false,
          error: null,
          result: payload,
          updatedAt: new Date().toISOString(),
        });
      })
      .catch((detailError) => {
        if (!alive || detailError.name === "AbortError") return;
        onSelectedArchiveDetailChange({
          loading: false,
          error: detailError.message || "Archive item inspection failed",
          result: null,
          updatedAt: null,
        });
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [archiveApiKey, selectedArchiveItem, onSelectedArchiveDetailChange]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function runSearch(event) {
    event?.preventDefault();
    if (!archiveApiKey.trim()) {
      setError("Enter an operator API key for read-only archive search.");
      return;
    }
    const params = new URLSearchParams();
    if (filters.kind && filters.kind !== "all") params.set("kind", filters.kind);
    if (filters.provider) params.set("provider", filters.provider);
    if (filters.status) params.set("status", filters.status);
    if (filters.q.trim()) params.set("q", filters.q.trim());
    params.set("limit", filters.limit || "25");

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/v1/archive?${params.toString()}`, {
        cache: "no-store",
        headers: {
          authorization: `Bearer ${archiveApiKey.trim()}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setResult(payload);
      onSelectedArchiveItemChange(payload?.items?.[0] ?? null);
      setSearchedAt(new Date().toISOString());
    } catch (searchError) {
      setError(searchError.message || "Archive search failed");
      onSelectedArchiveItemChange(null);
      onSelectedArchiveDetailChange(emptyArchiveDetailState());
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="viewport" tabIndex="-1">
      <div className="health-toolbar">
        <div className="viewport-heading">
          <span>Searchable cache archive</span>
          <h1>Search</h1>
          <p>Read-only search over archived responses, batches, uploads, generated artifacts, provider conversations, media, and caller evidence.</p>
        </div>
        <div className="status-readout">
          <span className={`state-dot state-${statusTone(error ? "error" : archiveApiKey ? "ok" : "waiting")}`} />
          <strong>{archiveApiKey ? "Operator key loaded" : "Operator key required"}</strong>
          <small>{searchedAt ? `Last search ${formatDateTime(searchedAt)}` : archiveRoute}</small>
        </div>
      </div>

      <form className="archive-search-panel" onSubmit={runSearch}>
        <div className="field-row field-row-wide">
          <label htmlFor="archiveApiKey">Operator API key</label>
          <div className="secret-field">
            <input
              id="archiveApiKey"
              type="password"
              value={archiveApiKey}
              autoComplete="off"
              placeholder="Paste a scoped AuraCall API key for this browser session"
              onChange={(event) => onArchiveApiKeyChange(event.target.value)}
            />
            <button
              type="button"
              title="Forget API key"
              onClick={() => {
                onArchiveApiKeyChange("");
                onSelectedArchiveDetailChange(emptyArchiveDetailState());
              }}
            >
              Forget
            </button>
          </div>
        </div>
        <div className="field-row field-row-wide">
          <label htmlFor="archiveQuery">Query</label>
          <input
            id="archiveQuery"
            type="search"
            value={filters.q}
            placeholder="Search title, ids, metadata, filenames, schemas, or summaries"
            onChange={(event) => updateFilter("q", event.target.value)}
          />
        </div>
        <div className="field-row">
          <label htmlFor="archiveKind">Kind</label>
          <select id="archiveKind" value={filters.kind} onChange={(event) => updateFilter("kind", event.target.value)}>
            {ARCHIVE_KINDS.map((kind) => (
              <option key={kind} value={kind}>{kind}</option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="archiveProvider">Provider</label>
          <input
            id="archiveProvider"
            value={filters.provider}
            placeholder="chatgpt, gemini, grok"
            onChange={(event) => updateFilter("provider", event.target.value)}
          />
        </div>
        <div className="field-row">
          <label htmlFor="archiveStatus">Status</label>
          <input
            id="archiveStatus"
            value={filters.status}
            placeholder="succeeded, failed, pass"
            onChange={(event) => updateFilter("status", event.target.value)}
          />
        </div>
        <div className="field-row">
          <label htmlFor="archiveLimit">Limit</label>
          <input
            id="archiveLimit"
            type="number"
            min="1"
            max="100"
            value={filters.limit}
            onChange={(event) => updateFilter("limit", event.target.value)}
          />
        </div>
        <button className="primary-action" type="submit" disabled={loading} title="Search archive" aria-label="Search archive">
          <Search size={16} aria-hidden="true" />
          <span>{loading ? "Searching" : "Search"}</span>
        </button>
      </form>

      {error ? <div className="health-error">Archive search failed: {error}</div> : null}

      <section className="archive-results" aria-label="Archive search results">
        <div className="section-heading">
          <h2>Results</h2>
          <span>{result ? `${formatNumber(result.metrics?.total)} matched / ${formatNumber(result.items?.length)} shown` : "No search yet"}</span>
        </div>
        {result ? (
          <div className="archive-metrics">
            {Object.entries(result.metrics?.byKind ?? {}).map(([kind, count]) => (
              <span key={kind}>{kind}: {formatNumber(count)}</span>
            ))}
          </div>
        ) : null}
        <div className="archive-result-list">
          {(result?.items ?? []).map((item) => {
            const selected = selectedArchiveItem?.id === item.id;
            const title = compactText(item.title ?? item.fileName ?? item.id);
            return (
              <article className={selected ? "archive-result is-selected" : "archive-result"} key={item.id}>
                <div className="archive-result-topline">
                  <span>
                    <span className={`status-pill status-${statusTone(item.status ?? item.kind)}`}>{item.kind}</span>
                    {item.status ? <span className={`status-pill status-${statusTone(item.status)}`}>{item.status}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="inspect-action"
                    aria-label={`Inspect ${item.kind ?? "archive item"} ${item.id}`}
                    aria-pressed={selected}
                    title="Inspect result"
                    onClick={() => onSelectedArchiveItemChange(item)}
                  >
                    <Database size={14} aria-hidden="true" />
                    <span>{selected ? "Selected" : "Inspect"}</span>
                  </button>
                </div>
                <strong>{title}</strong>
                <p>{item.id}</p>
                <dl>
                  <div><dt>Provider</dt><dd>{item.provider ?? "none"}</dd></div>
                  <div><dt>Runtime</dt><dd>{item.runtimeProfile ?? "none"}</dd></div>
                  <div><dt>Agent</dt><dd>{item.agentId ?? "none"}</dd></div>
                  <div><dt>Updated</dt><dd>{formatDateTime(item.updatedAt)}</dd></div>
                </dl>
                <div className="archive-links">
                  {item.links?.self ? <a href={item.links.self}>Detail</a> : null}
                  {archiveItemAssetRoute(item) ? <a href={archiveItemAssetRoute(item)}>Asset</a> : null}
                  {item.providerConversationUrl ? <a href={item.providerConversationUrl} target="_blank" rel="noreferrer">Provider</a> : null}
                </div>
              </article>
            );
          })}
          {result && !(result.items ?? []).length ? <p className="empty-state">No archive items matched the current filters.</p> : null}
          {!result ? <p className="empty-state">Enter a session-scoped API key and run a search.</p> : null}
        </div>
      </section>
    </main>
  );
}

function ConversationChatViewport({ archiveApiKey, onArchiveApiKeyChange }) {
  const [filters, setFilters] = useState({
    provider: "chatgpt",
    runtimeProfile: "default",
    limit: "25",
  });
  const [catalog, setCatalog] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationDetail, setConversationDetail] = useState({ loading: false, error: null, result: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const conversations = useMemo(() => flattenConversationEntries(catalog), [catalog]);
  const selectedItem = conversationDetail.result?.item ?? selectedConversation;
  const turns = useMemo(() => extractConversationTurns(selectedItem), [selectedItem]);
  const relatedSources = Array.isArray(selectedItem?.sources) ? selectedItem.sources : [];
  const relatedArtifacts = Array.isArray(selectedItem?.artifacts) ? selectedItem.artifacts : [];
  const relatedFiles = Array.isArray(selectedItem?.files) ? selectedItem.files : [];

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function loadConversations(event) {
    event?.preventDefault();
    const trimmedKey = archiveApiKey.trim();
    if (!trimmedKey) {
      setError("Enter an operator API key to read cached conversations.");
      return;
    }
    const params = new URLSearchParams({
      provider: filters.provider || "chatgpt",
      runtimeProfile: filters.runtimeProfile || "default",
      kind: "conversations",
      limit: filters.limit || "25",
    });
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/v1/account-mirrors/catalog?${params.toString()}`, {
        cache: "no-store",
        headers: { authorization: `Bearer ${trimmedKey}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      const nextConversations = flattenConversationEntries(payload);
      setCatalog(payload);
      setSelectedConversation(nextConversations[0] ?? null);
    } catch (loadError) {
      setError(loadError.message || "Conversation catalog load failed");
      setCatalog(null);
      setSelectedConversation(null);
      setConversationDetail({ loading: false, error: null, result: null });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedConversation) {
      setConversationDetail({ loading: false, error: null, result: null });
      return undefined;
    }
    const trimmedKey = archiveApiKey.trim();
    if (!trimmedKey) {
      setConversationDetail({ loading: false, error: "Operator API key required to inspect conversation detail.", result: null });
      return undefined;
    }
    const controller = new AbortController();
    let alive = true;
    const params = new URLSearchParams({
      provider: filters.provider || selectedConversation.provider || "chatgpt",
      runtimeProfile: filters.runtimeProfile || selectedConversation.runtimeProfileId || "default",
      kind: "conversations",
    });
    setConversationDetail({ loading: true, error: null, result: null });
    fetch(`/v1/account-mirrors/catalog/items/${encodeURIComponent(selectedConversation.id)}?${params.toString()}`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${trimmedKey}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
        return payload;
      })
      .then((payload) => {
        if (!alive) return;
        setConversationDetail({ loading: false, error: null, result: payload });
      })
      .catch((detailError) => {
        if (!alive || detailError.name === "AbortError") return;
        setConversationDetail({ loading: false, error: detailError.message || "Conversation detail load failed", result: null });
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [archiveApiKey, filters.provider, filters.runtimeProfile, selectedConversation]);

  return (
    <main className="viewport" tabIndex="-1">
      <div className="health-toolbar">
        <div className="viewport-heading">
          <span>Cache-backed chat review</span>
          <h1>Chats</h1>
          <p>Browse mirrored conversations as dialog transcripts with cached artifacts, sources, provider links, and tenant context.</p>
        </div>
        <div className="status-readout">
          <span className={`state-dot state-${statusTone(error ? "error" : archiveApiKey ? "ok" : "waiting")}`} />
          <strong>{archiveApiKey ? "Operator key loaded" : "Operator key required"}</strong>
          <small>{catalog ? `${formatNumber(conversations.length)} conversations shown` : "/v1/account-mirrors/catalog"}</small>
        </div>
      </div>

      <form className="archive-search-panel chat-filter-panel" onSubmit={loadConversations}>
        <div className="field-row field-row-wide">
          <label htmlFor="chatApiKey">Operator API key</label>
          <div className="secret-field">
            <input
              id="chatApiKey"
              type="password"
              value={archiveApiKey}
              autoComplete="off"
              placeholder="Paste a scoped AuraCall API key for this browser session"
              onChange={(event) => onArchiveApiKeyChange(event.target.value)}
            />
            <button type="button" title="Forget API key" onClick={() => onArchiveApiKeyChange("")}>Forget</button>
          </div>
        </div>
        <div className="field-row">
          <label htmlFor="chatProvider">Provider</label>
          <input id="chatProvider" value={filters.provider} onChange={(event) => updateFilter("provider", event.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="chatRuntime">Runtime</label>
          <input id="chatRuntime" value={filters.runtimeProfile} onChange={(event) => updateFilter("runtimeProfile", event.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="chatLimit">Limit</label>
          <input id="chatLimit" type="number" min="1" max="100" value={filters.limit} onChange={(event) => updateFilter("limit", event.target.value)} />
        </div>
        <button className="primary-action" type="submit" disabled={loading} title="Load conversations" aria-label="Load conversations">
          <MessageSquareText size={16} aria-hidden="true" />
          <span>{loading ? "Loading" : "Load"}</span>
        </button>
      </form>

      {error ? <div className="health-error">Conversation load failed: {error}</div> : null}

      <section className="conversation-workbench" aria-label="Conversation dialog view">
        <div className="conversation-list" aria-label="Cached conversations">
          <div className="section-heading">
            <h2>Conversations</h2>
            <span>{catalog ? `${formatNumber(catalog.metrics?.conversations)} listed` : "No catalog yet"}</span>
          </div>
          <div className="conversation-list-scroll">
            {conversations.map((conversation) => {
              const selected = selectedConversation?.id === conversation.id;
              return (
                <button
                  type="button"
                  key={`${conversation.runtimeProfileId}:${conversation.id}`}
                  className={selected ? "conversation-row is-selected" : "conversation-row"}
                  aria-pressed={selected}
                  onClick={() => setSelectedConversation(conversation)}
                >
                  <strong>{compactText(conversation.title ?? conversation.id, 76)}</strong>
                  <span>{conversation.provider ?? "provider"} / {conversation.runtimeProfileId ?? "runtime"}</span>
                  <small>{conversation.messageCount ? `${conversation.messageCount} messages` : conversation.hasCachedTranscript ? "cached transcript" : "metadata only"}</small>
                </button>
              );
            })}
            {!catalog ? <p className="empty-state">Load a provider/runtime catalog to review cached conversations.</p> : null}
            {catalog && !conversations.length ? <p className="empty-state">No cached conversations matched this provider/runtime.</p> : null}
          </div>
        </div>

        <article className="chat-dialog" aria-label="Selected conversation transcript">
          {selectedItem ? (
            <>
              <div className="chat-dialog-header">
                <span>
                  <strong>{selectedItem.title ?? selectedItem.id}</strong>
                  <small>{selectedItem.provider ?? filters.provider} / {filters.runtimeProfile}</small>
                </span>
                {selectedItem.url ? <a href={selectedItem.url} target="_blank" rel="noreferrer">Provider</a> : null}
              </div>
              {conversationDetail.error ? <div className="health-error">Detail unavailable: {conversationDetail.error}</div> : null}
              {conversationDetail.loading ? <p className="empty-state">Loading cached transcript...</p> : null}
              {turns.length ? (
                <div className="chat-turns">
                  {turns.map((turn, index) => (
                    <section className={`chat-turn chat-turn-${turn.role}`} key={`${turn.id}-${index}`}>
                      <div className="chat-bubble">
                        <div className="chat-bubble-meta">
                          <span>{turn.role}</span>
                          {turn.createdAt ? <time>{formatDateTime(turn.createdAt)}</time> : null}
                        </div>
                        <p>{turn.content}</p>
                      </div>
                    </section>
                  ))}
                </div>
              ) : !conversationDetail.loading ? (
                <div className="empty-state">No cached transcript turns are available for this conversation yet.</div>
              ) : null}
              {(relatedFiles.length || relatedArtifacts.length || relatedSources.length) ? (
                <div className="conversation-related">
                  {relatedFiles.length ? <span>{formatNumber(relatedFiles.length)} files</span> : null}
                  {relatedArtifacts.length ? <span>{formatNumber(relatedArtifacts.length)} artifacts</span> : null}
                  {relatedSources.length ? <span>{formatNumber(relatedSources.length)} sources</span> : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">Select a cached conversation to inspect its transcript.</div>
          )}
        </article>
      </section>
    </main>
  );
}

function MainViewport({
  activeNav,
  apiStatus,
  archiveApiKey,
  onArchiveApiKeyChange,
  runStatus,
  selectedArchiveItem,
  onSelectedArchiveItemChange,
  onSelectedArchiveDetailChange,
}) {
  if (activeNav === "chats") {
    return (
      <ConversationChatViewport
        archiveApiKey={archiveApiKey}
        onArchiveApiKeyChange={onArchiveApiKeyChange}
      />
    );
  }
  if (activeNav === "health") {
    return <HealthViewport apiStatus={apiStatus} />;
  }
  if (activeNav === "runs") {
    return <RunsViewport runStatus={runStatus} />;
  }
  if (activeNav === "search") {
    return (
      <ArchiveSearchViewport
        apiStatus={apiStatus}
        archiveApiKey={archiveApiKey}
        onArchiveApiKeyChange={onArchiveApiKeyChange}
        selectedArchiveItem={selectedArchiveItem}
        onSelectedArchiveItemChange={onSelectedArchiveItemChange}
        onSelectedArchiveDetailChange={onSelectedArchiveDetailChange}
      />
    );
  }

  const content = {
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
  }[activeNav] ?? {
    title: "Operator Workbench",
    kicker: "AuraCall",
    body: "Select a workspace surface from the top navigation.",
    rows: [],
  };

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
            meta: "Dashboard",
            route: status.serviceDiscovery?.local?.dashboardUrl ?? "/dashboard",
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
  if (activeNav === "search" && status) {
    return (
      <SectionList
        title="Context"
        items={[
          {
            title: "Archive route",
            meta: "Archive",
            route: status.routes?.runArchive ?? "/v1/archive",
            status: "good",
          },
          {
            title: "Session key",
            meta: "Stored only in browser sessionStorage",
            status: "warn",
          },
          {
            title: "Assets",
            meta: "Detail and asset links use protected archive routes",
            status: "planned",
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

function ArchiveAssetPreview({ item, apiKey }) {
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const assetRoute = archiveItemAssetRoute(item);
  const canFetch = Boolean(assetRoute);

  useEffect(() => {
    setAsset((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return null;
    });
    setLoading(false);
    setError(null);
  }, [item?.id]);

  useEffect(() => () => {
    if (asset?.objectUrl) URL.revokeObjectURL(asset.objectUrl);
  }, [asset?.objectUrl]);

  async function fetchAsset() {
    if (!assetRoute) return;
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setError("Operator API key required to fetch archived assets.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(assetRoute, {
        cache: "no-store",
        headers: {
          authorization: `Bearer ${trimmedKey}`,
        },
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text ? compactText(text, 160) : `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const mimeType = response.headers.get("content-type") ?? item.mimeType ?? blob.type;
      const fileName = fileNameFromDisposition(response.headers.get("content-disposition")) ?? item.fileName ?? item.title ?? item.id;
      const objectUrl = URL.createObjectURL(blob);
      let textPreview = null;
      if (blob.size <= 256 * 1024 && isPreviewableText(mimeType, fileName)) {
        textPreview = compactText(await blob.text(), 5000);
      }
      setAsset((current) => {
        if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
        return {
          objectUrl,
          mimeType,
          fileName,
          size: blob.size,
          textPreview,
        };
      });
    } catch (assetError) {
      setError(assetError.message || "Asset fetch failed");
    } finally {
      setLoading(false);
    }
  }

  if (!item) return null;

  return (
    <section className="asset-preview" aria-label="Selected archive asset preview">
      <div className="asset-preview-head">
        <span>
          <FileText size={15} aria-hidden="true" />
          <strong>Asset</strong>
        </span>
        <button
          type="button"
          className="icon-label-button"
          disabled={!canFetch || loading}
          title={canFetch ? "Fetch archived asset" : "No local asset available"}
          onClick={fetchAsset}
        >
          <Download size={14} aria-hidden="true" />
          <span>{loading ? "Fetching" : "Fetch"}</span>
        </button>
      </div>
      <dl className="asset-facts">
        <div><dt>Available</dt><dd>{canFetch ? "yes" : "no"}</dd></div>
        <div><dt>Name</dt><dd>{asset?.fileName ?? item.fileName ?? item.title ?? "none"}</dd></div>
        <div><dt>Type</dt><dd>{asset?.mimeType ?? item.mimeType ?? "unknown"}</dd></div>
        <div><dt>Size</dt><dd>{asset ? `${formatNumber(asset.size)} bytes` : "not fetched"}</dd></div>
      </dl>
      {error ? <div className="asset-error">Asset fetch failed: {error}</div> : null}
      {asset ? (
        <div className="asset-actions">
          <a href={asset.objectUrl} target="_blank" rel="noreferrer">Open</a>
          <a href={asset.objectUrl} download={asset.fileName}>Download</a>
        </div>
      ) : null}
      {asset?.mimeType?.startsWith("image/") ? <img className="asset-image-preview" src={asset.objectUrl} alt="" /> : null}
      {asset?.mimeType === "application/pdf" ? <iframe className="asset-frame-preview" title="Asset PDF preview" src={asset.objectUrl} /> : null}
      {asset?.textPreview ? (
        <pre className="asset-text-preview">{asset.textPreview}</pre>
      ) : null}
    </section>
  );
}

function RightPane({ activeNav, apiStatus, archiveApiKey, runStatus, selectedArchiveItem, selectedArchiveDetail }) {
  const labels = {
    chats: "Conversation inspector",
    search: "Result inspector",
    runs: "Run inspector",
    health: "Health inspector",
  };
  const status = apiStatus.status;
  const runs = runStatus.status;
  const inspectedArchiveItem = selectedArchiveDetail?.result?.item ?? selectedArchiveItem;
  const inspectedArchiveLinks = Object.entries({
    ...(inspectedArchiveItem?.links ?? {}),
    ...(archiveItemAssetRoute(inspectedArchiveItem) ? { asset: archiveItemAssetRoute(inspectedArchiveItem) } : {}),
  }).filter(([, value]) => typeof value === "string" && value.trim());
  const selectedArchiveDetails = inspectedArchiveItem
    ? [
        ["Kind", inspectedArchiveItem.kind ?? "unknown"],
        ["Status", inspectedArchiveItem.status ?? "none"],
        ["Provider", inspectedArchiveItem.provider ?? "none"],
        ["Runtime", inspectedArchiveItem.runtimeProfile ?? "none"],
        ["Project", inspectedArchiveItem.projectId ?? "none"],
        ["File", inspectedArchiveItem.fileName ?? inspectedArchiveItem.mimeType ?? "none"],
        ["Agent", inspectedArchiveItem.agentId ?? "none"],
        ["Updated", formatDateTime(inspectedArchiveItem.updatedAt)],
      ]
    : null;
  const details =
    activeNav === "health" && status
      ? [
          ["Source", { kind: "route", value: "/status" }],
          ["Service", status.process?.service ?? "auracall-api.service"],
          ["Route", { kind: "route", value: status.routes?.operatorBrowserDashboardUrl ?? status.routes?.operatorBrowserDashboard ?? "/dashboard", label: "Dashboard" }],
          ["Debug", { kind: "route", value: status.routes?.operatorDebugDashboard ?? "/ops/browser", label: "Debug" }],
        ]
      : activeNav === "search" && selectedArchiveDetails
        ? selectedArchiveDetails
      : activeNav === "search" && status
        ? [
            ["Source", { kind: "route", value: status.routes?.runArchive ?? "/v1/archive", label: "Archive" }],
            ["Auth", "Bearer key entered by operator"],
            ["Storage", "sessionStorage only"],
            ["Mode", "Read-only archive search"],
          ]
      : activeNav === "runs" && runs
        ? [
            ["Source", { kind: "route", value: "/status?recovery=true&sourceKind=all", label: "/status" }],
            ["Recent runs", { kind: "route", value: runs.routes?.runtimeRunsRecent ?? "/v1/runtime-runs/recent", label: "/v1/runtime-runs/recent" }],
            ["Inspect", { kind: "route", value: runs.routes?.runtimeRunInspection ?? "/v1/runtime-runs/inspect", label: "/v1/runtime-runs/inspect" }],
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
      : activeNav === "search" && inspectedArchiveItem
        ? selectedArchiveSummary(inspectedArchiveItem)
      : activeNav === "search" && status
        ? {
            route: status.routes?.runArchive,
            authRequired: status.auth?.required,
            keyCount: status.auth?.keyCount,
            mutable: false,
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
            <dd>
              <DetailValue detail={detail} />
            </dd>
          </div>
        ))}
      </dl>
      {activeNav === "search" && selectedArchiveItem ? (
        <div className={`inspector-status inspector-status-${selectedArchiveDetail?.error ? "bad" : selectedArchiveDetail?.loading ? "warn" : "good"}`}>
          <span className={`state-dot state-${selectedArchiveDetail?.error ? "bad" : selectedArchiveDetail?.loading ? "warn" : "good"}`} />
          <span>
            <strong>{selectedArchiveDetail?.error ? "Detail unavailable" : selectedArchiveDetail?.loading ? "Loading detail" : "Detail loaded"}</strong>
            <small>{selectedArchiveDetail?.error ?? (selectedArchiveDetail?.updatedAt ? formatDateTime(selectedArchiveDetail.updatedAt) : "Using selected result summary")}</small>
          </span>
        </div>
      ) : null}
      {activeNav === "search" && inspectedArchiveItem ? (
        <div className="inspector-actions" aria-label="Selected archive item actions">
          {inspectedArchiveLinks.map(([key, value]) => (
            <RouteChip key={key} value={value} label={linkKeyLabel(key)} />
          ))}
          {inspectedArchiveItem.providerConversationUrl ? <RouteChip value={inspectedArchiveItem.providerConversationUrl} label="Provider" /> : null}
        </div>
      ) : null}
      {activeNav === "search" && inspectedArchiveItem ? (
        <ArchiveAssetPreview item={inspectedArchiveItem} apiKey={archiveApiKey} />
      ) : null}
      <div className="json-preview">
        <code>{JSON.stringify(preview, null, 2)}</code>
      </div>
    </aside>
  );
}

export default function App() {
  const [layout, setLayout] = useState(readLayout);
  const [menuOpen, setMenuOpen] = useState(false);
  const [archiveApiKey, setArchiveApiKey] = useState(() => readSessionValue(ARCHIVE_KEY_STORAGE));
  const [selectedArchiveItem, setSelectedArchiveItem] = useState(null);
  const [selectedArchiveDetail, setSelectedArchiveDetail] = useState(emptyArchiveDetailState);
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

  function updateArchiveApiKey(nextKey) {
    setArchiveApiKey(nextKey);
    writeSessionValue(ARCHIVE_KEY_STORAGE, nextKey);
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
                aria-label={item.label}
                title={item.label}
                onClick={() => setLayout((current) => ({ ...current, activeNav: item.id }))}
              >
                <Icon size={17} aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="account-wrap">
          <button
            className="account-chip"
            type="button"
            aria-label={`Operator menu, ${activeItem.label}`}
            title="Operator menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="avatar">AC</span>
            <span className="account-copy">
              <strong>Operator</strong>
              <small>{activeItem.label}</small>
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div className="account-menu" role="menu">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button type="button" key={item.label} role="menuitem" title={item.label}>
                    <Icon size={15} aria-hidden="true" />
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
              title={layout.leftCollapsed ? "Expand left pane" : "Collapse left pane"}
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

        <MainViewport
          activeNav={layout.activeNav}
          apiStatus={apiStatus}
          archiveApiKey={archiveApiKey}
          onArchiveApiKeyChange={updateArchiveApiKey}
          runStatus={runStatus}
          selectedArchiveItem={selectedArchiveItem}
          onSelectedArchiveItemChange={setSelectedArchiveItem}
          onSelectedArchiveDetailChange={setSelectedArchiveDetail}
        />

        <aside className={layout.rightCollapsed ? "pane right-pane is-collapsed" : "pane right-pane"}>
          <button className="resize-handle left" type="button" aria-label="Resize right pane" onPointerDown={() => beginResize("right")}>
            <GripVertical size={16} />
          </button>
          <div className="pane-toolbar">
            <button
              className="icon-button"
              type="button"
              aria-label={layout.rightCollapsed ? "Expand right pane" : "Collapse right pane"}
              title={layout.rightCollapsed ? "Expand right pane" : "Collapse right pane"}
              onClick={() => setLayout((current) => ({ ...current, rightCollapsed: !current.rightCollapsed }))}
            >
              {layout.rightCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
            </button>
          </div>
          <div className="pane-content">
            <RightPane
              activeNav={layout.activeNav}
              apiStatus={apiStatus}
              archiveApiKey={archiveApiKey}
              runStatus={runStatus}
              selectedArchiveItem={selectedArchiveItem}
              selectedArchiveDetail={selectedArchiveDetail}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
