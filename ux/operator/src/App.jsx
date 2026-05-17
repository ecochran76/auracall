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

function MainViewport({ activeNav }) {
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
    runs: {
      title: "Run Control",
      kicker: "Queue, batch, and workflow status",
      body:
        "Runs should expose response jobs, batches, live-follow work, retries, cancellation, rate limits, and algorithm launches once read-only status is reliable.",
      rows: [
        ["Queue", "Pending, active, paused, failed, and completed work"],
        ["Batches", "Progress, item status, materialized output, diagnostics"],
        ["Controls", "Start, pause, retry, cancel, and inspect with audit trail"],
      ],
    },
    health: {
      title: "Service Health",
      kicker: "Runtime and provider readiness",
      body:
        "Health should show API service state, browser profile readiness, bound account identity, provider guard status, dispatcher locks, rate limits, and recent logs.",
      rows: [
        ["API", "HTTP, MCP, scheduler, archive, and config registry"],
        ["Browsers", "Runtime profiles, locks, auth, DOM drift, and guards"],
        ["Limits", "Provider-specific rate budgets and cooldowns"],
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

function LeftPane({ activeNav }) {
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

function RightPane({ activeNav }) {
  const labels = {
    chats: "Conversation inspector",
    search: "Result inspector",
    runs: "Run inspector",
    health: "Health inspector",
  };
  return (
    <aside className="inspector-body" aria-label={labels[activeNav]}>
      <div className="inspector-header">
        <Database size={18} />
        <span>{labels[activeNav]}</span>
      </div>
      <dl>
        <div>
          <dt>Source of truth</dt>
          <dd>AuraCall JSON API</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>Read-only shell scaffold</dd>
        </div>
        <div>
          <dt>Debug dashboard</dt>
          <dd>Keep existing surface for low-level probes</dd>
        </div>
      </dl>
      <div className="json-preview">
        <code>{`{ route: "${activeNav}", mutable: false }`}</code>
      </div>
    </aside>
  );
}

export default function App() {
  const [layout, setLayout] = useState(readLayout);
  const [menuOpen, setMenuOpen] = useState(false);
  const dragRef = useRef(null);

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
            <LeftPane activeNav={layout.activeNav} />
          </div>
          <button className="resize-handle right" type="button" aria-label="Resize left pane" onPointerDown={() => beginResize("left")}>
            <GripVertical size={16} />
          </button>
        </aside>

        <MainViewport activeNav={layout.activeNav} />

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
            <RightPane activeNav={layout.activeNav} />
          </div>
        </aside>
      </div>
    </div>
  );
}
