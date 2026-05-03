#!/usr/bin/env tsx
import os from 'node:os';
import path from 'node:path';
import type {
  AccountMirrorCompletionControlRequest,
  AccountMirrorCompletionListRequest,
  AccountMirrorCompletionOperation,
  AccountMirrorCompletionService,
  AccountMirrorCompletionStartRequest,
} from '../src/accountMirror/completionService.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface Options {
  mcpBin: string;
}

const operation: AccountMirrorCompletionOperation = {
  object: 'account_mirror_completion',
  id: 'acctmirror_ops_browser_mcp_smoke',
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
    summary: 'MCP ops browser smoke mirror is complete.',
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

function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    mcpBin: path.join(os.homedir(), '.local', 'bin', 'auracall-mcp'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mcp-bin') {
      const value = argv[index + 1];
      if (!value) throw new Error('--mcp-bin requires a path.');
      options.mcpBin = expandHome(value);
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp(): void {
  console.log(`Smoke /ops/browser through installed MCP api_ops_browser_status.

Usage:
  pnpm tsx scripts/smoke-ops-browser-mcp.ts [options]

Options:
  --mcp-bin <path>  AuraCall MCP binary. Default: ~/.local/bin/auracall-mcp
  -h, --help        Show this help
`);
}

function cloneOperation(): AccountMirrorCompletionOperation {
  return JSON.parse(JSON.stringify(operation)) as AccountMirrorCompletionOperation;
}

function createInjectedCompletionService(): AccountMirrorCompletionService {
  let current = cloneOperation();
  return {
    start(_request: AccountMirrorCompletionStartRequest = {}) {
      throw new Error('ops-browser MCP smoke must not start provider work');
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as T;
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function callOpsBrowserStatusThroughMcp(input: { mcpBin: string; port: number }) {
  const client = new Client({ name: 'auracall-ops-browser-smoke', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: input.mcpBin,
    env: {
      ...process.env,
      // biome-ignore lint/style/useNamingConvention: environment variables stay upper snake case
      AURACALL_DISABLE_KEYTAR: '1',
    },
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools({}, { timeout: 10_000 });
    if (!tools.some((tool) => tool.name === 'api_ops_browser_status')) {
      throw new Error('Installed MCP server did not expose api_ops_browser_status.');
    }
    return await client.callTool({
      name: 'api_ops_browser_status',
      arguments: {
        port: input.port,
        expectedLiveFollowSeverity: 'paused',
        expectedCompletionActive: 1,
        expectedCompletionPaused: 1,
      },
    }, undefined, { timeout: 10_000 });
  } finally {
    await client.close().catch(() => {});
    transport.close?.();
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const service = createInjectedCompletionService();
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    { accountMirrorCompletionService: service },
  );
  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;
    await fetchJson(`${baseUrl}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountMirrorCompletion: {
          id: operation.id,
          action: 'pause',
        },
      }),
    });

    const result = await callOpsBrowserStatusThroughMcp({
      mcpBin: options.mcpBin,
      port: server.port,
    });
    if (result.isError) throw new Error('MCP api_ops_browser_status returned an error result.');
    const structuredContent = result.structuredContent as {
      dashboard?: {
        usesStatusControlPath?: unknown;
        usesAccountMirrorCompletionPayload?: unknown;
        hasLiveFollowTargetTable?: unknown;
        hasCompletionIdFillControl?: unknown;
        hasInlineCompletionActionControls?: unknown;
        hasControlFeedbackNotice?: unknown;
        hasPauseBinding?: unknown;
        hasResumeBinding?: unknown;
        hasCancelBinding?: unknown;
      };
      status?: {
        liveFollow?: { severity?: unknown };
        completions?: { metrics?: { active?: unknown; paused?: unknown } };
      };
    } | undefined;
    assertEqual(structuredContent?.dashboard?.usesStatusControlPath, true, 'dashboard status path');
    assertEqual(
      structuredContent?.dashboard?.usesAccountMirrorCompletionPayload,
      true,
      'dashboard completion payload',
    );
    assertEqual(structuredContent?.dashboard?.hasLiveFollowTargetTable, true, 'dashboard target table');
    assertEqual(structuredContent?.dashboard?.hasCompletionIdFillControl, true, 'dashboard completion id fill');
    assertEqual(structuredContent?.dashboard?.hasInlineCompletionActionControls, true, 'dashboard row actions');
    assertEqual(structuredContent?.dashboard?.hasControlFeedbackNotice, true, 'dashboard feedback notice');
    assertEqual(structuredContent?.dashboard?.hasPauseBinding, true, 'dashboard pause binding');
    assertEqual(structuredContent?.dashboard?.hasResumeBinding, true, 'dashboard resume binding');
    assertEqual(structuredContent?.dashboard?.hasCancelBinding, true, 'dashboard cancel binding');
    assertEqual(structuredContent?.status?.liveFollow?.severity, 'paused', 'live-follow severity');
    assertEqual(structuredContent?.status?.completions?.metrics?.active, 1, 'active completions');
    assertEqual(structuredContent?.status?.completions?.metrics?.paused, 1, 'paused completions');

    console.log([
      `ops-browser MCP smoke: pass port=${server.port}`,
      'tool=api_ops_browser_status',
      'listed=ok',
      'dashboardControl=/status',
      'targetTable=ok',
      'completionIdFill=ok',
      'rowActions=ok',
      'feedback=ok',
      'liveFollow=paused',
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
