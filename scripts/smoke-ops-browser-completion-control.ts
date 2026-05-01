#!/usr/bin/env tsx
import type {
  AccountMirrorCompletionControlRequest,
  AccountMirrorCompletionListRequest,
  AccountMirrorCompletionOperation,
  AccountMirrorCompletionService,
  AccountMirrorCompletionStartRequest,
} from '../src/accountMirror/completionService.js';
import {
  assertApiOpsBrowserStatus,
  readApiOpsBrowserStatusForCli,
} from '../src/cli/apiOpsBrowserCommand.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';

const operation: AccountMirrorCompletionOperation = {
  object: 'account_mirror_completion',
  id: 'acctmirror_dashboard_control_smoke',
  provider: 'chatgpt',
  runtimeProfileId: 'default',
  mode: 'live_follow',
  phase: 'steady_follow',
  status: 'running',
  startedAt: '2026-05-01T12:00:00.000Z',
  completedAt: null,
  nextAttemptAt: '2026-05-01T12:10:00.000Z',
  maxPasses: null,
  passCount: 4,
  lastRefresh: null,
  mirrorCompleteness: {
    state: 'complete',
    summary: 'Dashboard control smoke mirror is complete.',
    remainingDetailSurfaces: {
      projects: 0,
      conversations: 0,
      total: 0,
    },
    signals: {
      projectsTruncated: false,
      conversationsTruncated: false,
      attachmentInventoryTruncated: false,
      attachmentCursorPresent: false,
    },
  },
  error: null,
};

function cloneOperation(): AccountMirrorCompletionOperation {
  return JSON.parse(JSON.stringify(operation)) as AccountMirrorCompletionOperation;
}

function createInjectedCompletionService(): AccountMirrorCompletionService & { controlCalls: AccountMirrorCompletionControlRequest[] } {
  let current = cloneOperation();
  const controlCalls: AccountMirrorCompletionControlRequest[] = [];
  return {
    controlCalls,
    start(_request: AccountMirrorCompletionStartRequest = {}) {
      throw new Error('ops-browser completion-control smoke must not start provider work');
    },
    read(id: string) {
      return id === current.id ? current : null;
    },
    list(request: AccountMirrorCompletionListRequest = {}) {
      if (request.provider && request.provider !== current.provider) return [];
      if (request.runtimeProfileId && request.runtimeProfileId !== current.runtimeProfileId) return [];
      if (request.status && request.status !== 'active' && request.status !== current.status) return [];
      if (request.activeOnly === true && !['queued', 'running', 'paused'].includes(current.status)) return [];
      return [current];
    },
    control(request: AccountMirrorCompletionControlRequest) {
      if (request.id !== current.id) return null;
      controlCalls.push(request);
      current = {
        ...current,
        status: request.action === 'cancel' ? 'cancelled' : request.action === 'pause' ? 'paused' : 'running',
        completedAt: request.action === 'cancel' ? '2026-05-01T12:05:00.000Z' : null,
        nextAttemptAt: request.action === 'cancel' ? null : current.nextAttemptAt,
        error: null,
      };
      return current;
    },
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${text}`);
  }
  return text;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as T;
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: expected dashboard HTML to include ${expected}.`);
  }
}

async function main(): Promise<void> {
  const service = createInjectedCompletionService();
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    { accountMirrorCompletionService: service },
  );
  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const dashboard = await fetchText(`${baseUrl}/ops/browser`);
    assertIncludes(dashboard, 'Mirror Live Follow', 'dashboard panel');
    assertIncludes(dashboard, "fetch('/status'", 'dashboard control endpoint');
    assertIncludes(dashboard, 'body: JSON.stringify({ accountMirrorCompletion: { id, action } })', 'dashboard control payload');
    assertIncludes(dashboard, "$('pauseMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('pause'))", 'dashboard pause binding');
    assertIncludes(dashboard, "$('resumeMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('resume'))", 'dashboard resume binding');
    assertIncludes(dashboard, "$('cancelMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('cancel'))", 'dashboard cancel binding');

    const pause = await fetchJson<{
      controlResult?: {
        kind?: string;
        id?: string;
        action?: string;
        status?: string;
      };
      accountMirrorCompletions?: {
        metrics?: {
          active?: number;
          paused?: number;
        };
      };
      liveFollow?: {
        severity?: string;
        pausedCompletions?: number | null;
      };
    }>(`${baseUrl}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountMirrorCompletion: {
          id: operation.id,
          action: 'pause',
        },
      }),
    });

    assertEqual(pause.controlResult?.kind, 'account-mirror-completion', 'status control kind');
    assertEqual(pause.controlResult?.id, operation.id, 'status control id');
    assertEqual(pause.controlResult?.action, 'pause', 'status control action');
    assertEqual(pause.controlResult?.status, 'paused', 'status control result');
    assertEqual(pause.accountMirrorCompletions?.metrics?.active, 1, 'status active count');
    assertEqual(pause.accountMirrorCompletions?.metrics?.paused, 1, 'status paused count');
    assertEqual(pause.liveFollow?.severity, 'paused', 'status live-follow severity');
    assertEqual(pause.liveFollow?.pausedCompletions, 1, 'status live-follow paused count');
    assertEqual(service.controlCalls.length, 1, 'control call count');
    assertEqual(service.controlCalls[0]?.action, 'pause', 'control call action');

    const opsBrowserStatus = await readApiOpsBrowserStatusForCli({
      port: server.port,
    });
    assertApiOpsBrowserStatus(opsBrowserStatus, {
      expectedSeverity: 'paused',
      expectedActive: 1,
      expectedPaused: 1,
    });

    console.log([
      `ops-browser completion-control smoke: pass port=${server.port}`,
      'dashboardControl=/status',
      `operation=${operation.id}`,
      `status.pause=${pause.controlResult?.status ?? 'unknown'}`,
      `liveFollow=${pause.liveFollow?.severity ?? 'unknown'}`,
      'opsBrowserStatus=ok',
      'providerWork=none',
    ].join('\n'));
  } finally {
    await server.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
