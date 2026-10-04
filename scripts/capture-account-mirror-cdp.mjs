#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const options = readOptions(process.argv.slice(2));
const startedAt = new Date();
const deadlineAt = Date.now() + options.timeoutMs;
const sockets = new Map();
const requests = new Map();
const events = [];
const initialTargetIds = new Set();
let warning = null;
let runId = null;
let nextCommandId = 1;

function readOptions(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<end>"}.`);
    }
    values.set(key.slice(2), value);
  }
  const output = values.get("output");
  if (!output) throw new Error("--output is required.");
  return {
    mode: values.get("mode") ?? "detail",
    apiBaseUrl: values.get("api-base-url") ?? "http://127.0.0.1:18139",
    devtoolsBaseUrl: values.get("devtools-base-url") ?? "http://127.0.0.1:45015",
    output: path.resolve(output),
    timeoutMs: Number(values.get("timeout-ms") ?? "180000"),
    selectionIndex: Number(values.get("selection-index") ?? "0"),
  };
}

function pseudokey(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function sanitizeRoute(rawUrl) {
  try {
    const url = new URL(rawUrl);
    let route = url.pathname;
    route = route
      .replace(/\/c\/[A-Za-z0-9_-]+/g, "/c/:conversation")
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:uuid")
      .replace(/\/c\/:uuid/g, "/c/:conversation")
      .replace(/\/conversation\/[A-Za-z0-9_-]+/g, "/conversation/:conversation")
      .replace(/\/gizmos\/[A-Za-z0-9_-]+/g, "/gizmos/:project")
      .replace(/\/aip\/connectors\/connector_[A-Za-z0-9_-]+/g, "/aip/connectors/:connector")
      .replace(/\/files\/[A-Za-z0-9_-]+/g, "/files/:file")
      .replace(/\/download\/[A-Za-z0-9_-]+/g, "/download/:asset")
      .replace(/\/asdk_app_[A-Za-z0-9_-]+/g, "/:app")
      .replace(/\/oneshot\/[^/]+\/[A-Za-z0-9_-]+/g, "/oneshot/:challenge/:attempt");
    return route;
  } catch {
    return "<invalid-url>";
  }
}

function sanitizeText(value) {
  if (typeof value !== "string") return value ?? null;
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":uuid")
    .replace(/connector_[A-Za-z0-9_-]+/g, "connector_:connector")
    .replace(/\b(file|conversation|artifact)_[A-Za-z0-9_-]{8,}\b/g, "$1_:id");
}

function record(kind, detail = {}) {
  events.push({
    at: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt.getTime(),
    kind,
    ...detail,
  });
}

async function send(socket, method, params = {}) {
  const id = nextCommandId++;
  socket.send(JSON.stringify({ id, method, params }));
}

async function attachTarget(target) {
  if (!target.webSocketDebuggerUrl || sockets.has(target.id)) return;
  const targetKey = pseudokey(target.id);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  sockets.set(target.id, { socket, targetKey });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  record("cdp.target.attached", {
    targetKey,
    route: sanitizeRoute(target.url),
    cohort: initialTargetIds.has(target.id) ? "initial" : "created-during-capture",
  });
  socket.addEventListener("message", (message) => {
    const payload = JSON.parse(String(message.data));
    const params = payload.params ?? {};
    if (payload.method === "Network.requestWillBeSent") {
      const requestKey = `${targetKey}:${params.requestId}`;
      const route = sanitizeRoute(params.request?.url ?? "");
      requests.set(requestKey, { route, method: params.request?.method ?? null });
      record("cdp.network.request", {
        targetKey,
        requestKey: pseudokey(requestKey),
        method: params.request?.method ?? null,
        route,
        resourceType: params.type ?? null,
        initiatorType: params.initiator?.type ?? null,
      });
    } else if (payload.method === "Network.responseReceived") {
      const requestKey = `${targetKey}:${params.requestId}`;
      const request = requests.get(requestKey);
      record("cdp.network.response", {
        targetKey,
        requestKey: pseudokey(requestKey),
        method: request?.method ?? null,
        route: request?.route ?? sanitizeRoute(params.response?.url ?? ""),
        status: params.response?.status ?? null,
        resourceType: params.type ?? null,
        fromDiskCache: params.response?.fromDiskCache === true,
        fromServiceWorker: params.response?.fromServiceWorker === true,
      });
    } else if (payload.method === "Page.frameNavigated" && !params.frame?.parentId) {
      record("cdp.page.navigated", {
        targetKey,
        route: sanitizeRoute(params.frame?.url ?? ""),
      });
    }
  });
  await send(socket, "Network.enable", { maxTotalBufferSize: 1_000_000 });
  await send(socket, "Page.enable");
  await send(socket, "Runtime.enable");
}

async function listTargets() {
  const targets = await fetch(`${options.devtoolsBaseUrl}/json/list`)
    .then((response) => response.json())
    .catch(() => []);
  return targets.filter(
    (target) => target.type === "page" && String(target.url).startsWith("https://chatgpt.com"),
  );
}

async function discoverTargets() {
  const targets = await listTargets();
  for (const target of targets) {
    await attachTarget(target).catch((error) => {
      record("cdp.target.attach-race", {
        targetKey: pseudokey(target.id),
        message: sanitizeText(error instanceof Error ? error.message : String(error)),
      });
    });
  }
  return targets.length;
}

async function inspectWarnings() {
  for (const { socket, targetKey } of sockets.values()) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const id = nextCommandId++;
    const resultPromise = new Promise((resolve) => {
      const listener = (message) => {
        const payload = JSON.parse(String(message.data));
        if (payload.id !== id) return;
        socket.removeEventListener("message", listener);
        resolve(payload.result?.result?.value ?? null);
      };
      socket.addEventListener("message", listener);
      setTimeout(() => {
        socket.removeEventListener("message", listener);
        resolve(null);
      }, 1_000).unref();
    });
    socket.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: {
        returnByValue: true,
        expression: `(() => {
          const visible = (node) => {
            const style = getComputedStyle(node);
            const box = node.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
          };
          for (const node of document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) {
            if (!visible(node)) continue;
            const text = (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
            if (/too many requests|making requests too quickly|temporarily limited access/i.test(text)) {
              return { detected: true, summary: text.slice(0, 240) };
            }
          }
          return { detected: false };
        })()`,
      },
    }));
    const result = await resultPromise;
    if (result?.detected) {
      warning = {
        detectedAt: new Date().toISOString(),
        targetKey,
        classifier: "chatgpt-visible-rate-limit-dialog-v1",
        summary: result.summary,
      };
      record("provider.warning.detected", warning);
      return true;
    }
  }
  return false;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function cancelRun() {
  if (!runId) return;
  const route = options.mode === "detail"
    ? `/v1/account-mirrors/development-runs/${encodeURIComponent(runId)}`
    : `/v1/account-mirrors/materializations/${encodeURIComponent(runId)}`;
  await postJson(`${options.apiBaseUrl}${route}`, {
    action: "cancel",
  }).catch((error) => record("development-run.cancel.failed", { message: error.message }));
}

function summarizeRun(run) {
  if (options.mode !== "detail") {
    const result = run.result ?? {};
    const manifest = result.manifest ?? result.entries ?? [];
    return {
      status: run.status,
      startedAt: run.startedAt ?? null,
      completedAt: run.completedAt ?? null,
      attemptCount: run.attemptCount ?? null,
      error: run.error ? { code: run.error.code ?? null, message: sanitizeText(run.error.message) } : null,
      message: sanitizeText(run.message),
      metrics: result.metrics ?? null,
      candidateFunnel: result.candidateFunnel ?? null,
      snapshotRefresh: result.snapshotRefresh
        ? {
            status: result.snapshotRefresh.status ?? null,
            reason: result.snapshotRefresh.reason ?? null,
          }
        : null,
      manifest: manifest.map((entry) => ({
        kind: entry.kind ?? null,
        status: entry.status ?? null,
        failureKind: entry.failureKind ?? null,
        retryable: entry.retryable ?? null,
        materializationMethod: entry.materializationMethod ?? null,
        reason: sanitizeText(entry.reason),
        assetAvailability: entry.assetAvailability ?? null,
        hasLocalPath: Boolean(entry.localPath),
        hasChecksum: Boolean(entry.checksumSha256),
        size: entry.size ?? null,
      })),
      scrapeTelemetry: run.scrapeTelemetry ?? null,
    };
  }
  const result = run.result ?? {};
  const metadataEvidence = result.metadataEvidence ?? result.metadata?.evidence ?? {};
  return {
    status: run.status,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
    error: run.error ? { code: run.error.code ?? null, message: sanitizeText(run.error.message) } : null,
    counts: result.metadataCounts ?? result.counts ?? null,
    collectorProgress: metadataEvidence.collectorProgress ?? result.collectorProgress ?? null,
    scrapeTelemetry: metadataEvidence.scrapeTelemetry ?? result.scrapeTelemetry ?? null,
    diagnostics: (run.diagnostics ?? []).map((diagnostic) => ({
      at: diagnostic.at ?? null,
      phase: diagnostic.phase ?? null,
      stage: diagnostic.stage ?? null,
      event: diagnostic.event ?? null,
      durationMs: diagnostic.durationMs ?? null,
      outcome: diagnostic.outcome ?? null,
      errorClass: diagnostic.errorClass ?? null,
    })),
  };
}

let run = null;
let targetCountBefore = 0;
let targetCountAfter = 0;
try {
  for (const target of await listTargets()) initialTargetIds.add(target.id);
  targetCountBefore = await discoverTargets();
  record("capture.started", { targetCount: targetCountBefore });
  if (await inspectWarnings()) throw new Error("Rate-limit warning was visible before the run.");

  if (options.mode === "detail") {
    run = await postJson(`${options.apiBaseUrl}/v1/account-mirrors/development-runs`, {
      provider: "chatgpt",
      runtimeProfile: "wsl-chrome-3",
      explicitRefresh: true,
      ignoreMinimumInterval: true,
      ignoreFailureBackoff: true,
      sweepMode: "steady_follow",
      requestedPhase: "detail-inventory",
      development: {
        enabled: true,
        maxWallTimeMs: Math.min(options.timeoutMs, 180_000),
        maxConversations: 1,
        maxMaterializationCandidates: 1,
        maxPasses: 1,
        providerCallTimeoutMs: 45_000,
        maxBrowserInteractionsPerMinute: 6,
        conversationReadCooldownMs: 6_000,
        pageRefreshCooldownMs: 30_000,
        renavigationCooldownMs: 30_000,
      },
    });
    runId = run.id;
    record("development-run.started", {
      requestedPhase: "detail-inventory",
      maxConversations: 1,
      maxPasses: 1,
    });
  } else {
    const refreshSnapshot = options.mode === "materialize-refresh";
    const catalog = await fetch(
      `${options.apiBaseUrl}/v1/account-mirrors/catalog?provider=chatgpt&runtimeProfile=wsl-chrome-3&kind=all&limit=1000`,
    ).then((response) => response.json());
    const manifests = catalog.entries?.[0]?.manifests ?? {};
    let selected = null;
    let selection = {};
    if (options.mode === "materialize-upload" || options.mode === "materialize-upload-item") {
      const candidates = (manifests.files ?? []).filter(
        (file) => file.source === "conversation" && file.metadata?.providerFileId && file.metadata?.conversationId,
      );
      selected = candidates[options.selectionIndex] ?? null;
      if (!selected) throw new Error("No cached conversation-upload file candidate is available.");
      selection = options.mode === "materialize-upload-item"
        ? {
            catalogItemId: selected.id,
            catalogKind: "files",
            assetKinds: ["files"],
          }
        : {
            conversationId: selected.metadata.conversationId,
            assetKinds: ["files"],
          };
    } else if (options.mode === "materialize-library") {
      selected = (manifests.files ?? []).find(
        (file) =>
          file.source === "account" &&
          file.metadata?.materializationSurface === "chatgpt-library-file-row-click" &&
          file.metadata?.providerFileId,
      );
      if (!selected) throw new Error("No cached persistent Library file candidate is available.");
      selection = {
        catalogItemId: selected.id,
        catalogKind: "files",
        assetKinds: ["files"],
      };
    } else {
      selection = {
        reconcile: true,
        assetKinds: ["artifacts", "files"],
      };
    }
    const created = await postJson(`${options.apiBaseUrl}/v1/account-mirrors/materializations`, {
      provider: "chatgpt",
      runtimeProfile: "wsl-chrome-3",
      browserProfile: "wsl-chrome-3",
      refreshSnapshot,
      ...selection,
      maxItems: 1,
      providerWorkTimeoutMs: Math.min(options.timeoutMs, 120_000),
      force: false,
    });
    run = created.job;
    runId = run.id;
    record("materialization-run.started", {
      refreshSnapshot,
      maxItems: 1,
      reused: created.reused === true,
      selectedKind: selected?.source === "account" ? "persistent-library-file" :
        selected?.source === "conversation" ? "volatile-conversation-upload" : "frontier-candidate",
      selectedKey: selected?.id ? pseudokey(selected.id) : null,
    });
  }

  const terminalStatuses = new Set(["completed", "succeeded", "skipped", "failed", "cancelled"]);
  while (!terminalStatuses.has(run.status) && Date.now() < deadlineAt) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    await discoverTargets();
    if (await inspectWarnings()) {
      await cancelRun();
      break;
    }
    const readRoute = options.mode === "detail"
      ? `/v1/account-mirrors/development-runs/${encodeURIComponent(runId)}`
      : `/v1/account-mirrors/materializations/${encodeURIComponent(runId)}?detail=full`;
    run = await fetch(`${options.apiBaseUrl}${readRoute}`).then((response) => response.json());
  }
  if (run && !terminalStatuses.has(run.status)) {
    record("development-run.deadline", {});
    await cancelRun();
    const readRoute = options.mode === "detail"
      ? `/v1/account-mirrors/development-runs/${encodeURIComponent(runId)}`
      : `/v1/account-mirrors/materializations/${encodeURIComponent(runId)}?detail=full`;
    run = await fetch(`${options.apiBaseUrl}${readRoute}`).then((response) => response.json());
  }
  targetCountAfter = await discoverTargets();
  await inspectWarnings();
} catch (error) {
  record("capture.failed", { message: error instanceof Error ? error.message : String(error) });
  await cancelRun();
} finally {
  for (const { socket } of sockets.values()) socket.close();
  const networkRequests = events.filter((event) => event.kind === "cdp.network.request");
  const routeCounts = Object.entries(
    networkRequests.reduce((counts, event) => {
      const key = `${event.method ?? "?"} ${event.route ?? "?"}`;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .map(([route, count]) => ({ route, count }))
    .sort((left, right) => right.count - left.count || left.route.localeCompare(right.route));
  const report = {
    schemaVersion: 1,
    kind: "account-mirror-cdp-capture",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    scope: {
      provider: "chatgpt",
      runtimeProfile: "wsl-chrome-3",
      managedBrowserProfile: "wsl-chrome-3/chatgpt",
      requestedPhase: options.mode === "detail" ? "detail-inventory" : null,
      mode: options.mode,
      maxConversations: 1,
      maxPasses: 1,
      scheduler: "isolated-disabled",
    },
    targets: { before: targetCountBefore, after: targetCountAfter },
    warning,
    run: summarizeRun(run ?? {}),
    metrics: {
      eventCount: events.length,
      requestCount: networkRequests.length,
      navigationCount: events.filter((event) => event.kind === "cdp.page.navigated").length,
      routeCounts,
    },
    events,
  };
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({
    output: options.output,
    status: report.run.status,
    warningDetected: Boolean(warning),
    requestCount: report.metrics.requestCount,
    navigationCount: report.metrics.navigationCount,
    targetCountBefore,
    targetCountAfter,
  }, null, 2));
}
