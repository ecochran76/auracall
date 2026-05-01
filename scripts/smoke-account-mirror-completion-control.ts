#!/usr/bin/env tsx
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  controlApiMirrorCompletionForCli,
  listApiMirrorCompletionsForCli,
  readApiMirrorCompletionForCli,
} from '../src/cli/apiMirrorCompletionCommand.js';
import {
  assertApiStatusCompletionMetrics,
  readApiStatusForCli,
} from '../src/cli/apiStatusCommand.js';
import type {
  AccountMirrorCompletionControlRequest,
  AccountMirrorCompletionListRequest,
  AccountMirrorCompletionOperation,
  AccountMirrorCompletionService,
  AccountMirrorCompletionStartRequest,
} from '../src/accountMirror/completionService.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';
import { createApiStatusToolHandler } from '../src/mcp/tools/apiStatus.js';
import { registerAccountMirrorCompletionTools } from '../src/mcp/tools/accountMirrorCompletion.js';

type ToolHandler = (input: unknown) => Promise<{
  isError?: boolean;
  structuredContent?: unknown;
}>;

const operation: AccountMirrorCompletionOperation = {
  object: 'account_mirror_completion',
  id: 'acctmirror_control_smoke',
  provider: 'chatgpt',
  runtimeProfileId: 'default',
  mode: 'live_follow',
  phase: 'steady_follow',
  status: 'running',
  startedAt: '2026-05-01T12:00:00.000Z',
  completedAt: null,
  nextAttemptAt: '2026-05-01T12:10:00.000Z',
  maxPasses: null,
  passCount: 3,
  lastRefresh: null,
  mirrorCompleteness: {
    state: 'complete',
    summary: 'Smoke mirror is complete.',
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
      throw new Error('completion-control smoke must not start provider work');
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
      if (request.action === 'pause') {
        current = {
          ...current,
          status: 'paused',
          error: null,
        };
      } else if (request.action === 'resume') {
        current = {
          ...current,
          status: 'running',
          completedAt: null,
          error: null,
        };
      } else {
        current = {
          ...current,
          status: 'cancelled',
          completedAt: '2026-05-01T12:05:00.000Z',
          nextAttemptAt: null,
          error: null,
        };
      }
      return current;
    },
  };
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

function createCapturedMcpHandlers(service: AccountMirrorCompletionService): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  const fakeServer = {
    registerTool(name: string, _config: unknown, handler: ToolHandler) {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  registerAccountMirrorCompletionTools(fakeServer, { service });
  return handlers;
}

async function main(): Promise<void> {
  const service = createInjectedCompletionService();
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    { accountMirrorCompletionService: service },
  );
  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;

    const httpPause = await fetchJson<AccountMirrorCompletionOperation>(
      `${baseUrl}/v1/account-mirrors/completions/acctmirror_control_smoke`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      },
    );
    assertEqual(httpPause.status, 'paused', 'HTTP pause status');

    const statusAfterPause = await fetchJson<{
      accountMirrorCompletions?: {
        metrics?: { active?: number; paused?: number };
        active?: AccountMirrorCompletionOperation[];
      };
    }>(`${baseUrl}/status`);
    assertEqual(statusAfterPause.accountMirrorCompletions?.metrics?.active, 1, 'status active count after pause');
    assertEqual(statusAfterPause.accountMirrorCompletions?.metrics?.paused, 1, 'status paused count after pause');
    assertEqual(statusAfterPause.accountMirrorCompletions?.active?.[0]?.status, 'paused', 'status active operation paused');

    const cliApiStatusAfterPause = await readApiStatusForCli({ port: server.port });
    assertApiStatusCompletionMetrics(cliApiStatusAfterPause, {
      expectedActive: 1,
      expectedPaused: 1,
      expectedCancelled: 0,
      expectedFailed: 0,
    });
    assertEqual(cliApiStatusAfterPause.completions.metrics.paused, 1, 'CLI api status paused count after pause');
    assertEqual(cliApiStatusAfterPause.completions.active[0]?.status, 'paused', 'CLI api status active operation paused');

    const cliResume = await controlApiMirrorCompletionForCli({
      port: server.port,
      id: 'acctmirror_control_smoke',
      action: 'resume',
    }) as AccountMirrorCompletionOperation;
    assertEqual(cliResume.status, 'running', 'CLI resume status');

    const cliStatus = await readApiMirrorCompletionForCli({
      port: server.port,
      id: 'acctmirror_control_smoke',
    }) as AccountMirrorCompletionOperation;
    assertEqual(cliStatus.status, 'running', 'CLI status after resume');

    const cliList = await listApiMirrorCompletionsForCli({
      port: server.port,
      status: 'active',
    }) as { data?: AccountMirrorCompletionOperation[] };
    assertEqual(cliList.data?.[0]?.id, 'acctmirror_control_smoke', 'CLI active list id');

    const handlers = createCapturedMcpHandlers(service);
    const controlHandler = handlers.get('account_mirror_completion_control');
    if (!controlHandler) throw new Error('MCP control handler was not registered.');
    const mcpCancel = await controlHandler({
      id: 'acctmirror_control_smoke',
      action: 'cancel',
    });
    if (mcpCancel.isError) throw new Error('MCP cancel returned an error result.');
    assertEqual((mcpCancel.structuredContent as AccountMirrorCompletionOperation).status, 'cancelled', 'MCP cancel status');

    const apiStatusHandler = createApiStatusToolHandler();
    const mcpApiStatusAfterCancel = await apiStatusHandler({
      port: server.port,
      expectedCompletionActive: 0,
      expectedCompletionPaused: 0,
      expectedCompletionCancelled: 1,
      expectedCompletionFailed: 0,
    });
    if (mcpApiStatusAfterCancel.isError) throw new Error('MCP api_status returned an error result.');
    const apiStatusStructured = mcpApiStatusAfterCancel.structuredContent as Awaited<ReturnType<typeof readApiStatusForCli>>;
    assertEqual(apiStatusStructured.completions.metrics.cancelled, 1, 'MCP api_status cancelled count after cancel');
    assertEqual(
      apiStatusStructured.completions.recentControlled[0]?.status,
      'cancelled',
      'MCP api_status recent controlled cancelled',
    );

    const finalStatus = await fetchJson<{
      accountMirrorCompletions?: {
        metrics?: { active?: number; cancelled?: number };
        recent?: AccountMirrorCompletionOperation[];
      };
    }>(`${baseUrl}/status`);
    assertEqual(finalStatus.accountMirrorCompletions?.metrics?.active, 0, 'status active count after cancel');
    assertEqual(finalStatus.accountMirrorCompletions?.metrics?.cancelled, 1, 'status cancelled count after cancel');
    assertEqual(finalStatus.accountMirrorCompletions?.recent?.[0]?.status, 'cancelled', 'status recent operation cancelled');

    assertEqual(service.controlCalls.length, 3, 'control call count');
    console.log([
      `completion-control smoke: pass port=${server.port}`,
      `http.pause=${httpPause.status}`,
      `cli.resume=${cliResume.status}`,
      `mcp.cancel=${(mcpCancel.structuredContent as AccountMirrorCompletionOperation).status}`,
      `status.cancelled=${finalStatus.accountMirrorCompletions?.metrics?.cancelled ?? 'unknown'}`,
      `api_status.cancelled=${apiStatusStructured.completions.metrics.cancelled ?? 'unknown'}`,
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
