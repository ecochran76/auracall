#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAccountMirrorCompletionStore } from '../src/accountMirror/completionStore.js';
import type { AccountMirrorCompletionOperation } from '../src/accountMirror/completionService.js';
import { readApiStatusForCli } from '../src/cli/apiStatusCommand.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';
import { createApiStatusToolHandler } from '../src/mcp/tools/apiStatus.js';
import type { LiveFollowHealthSummary } from '../src/status/liveFollowHealth.js';

const operation: AccountMirrorCompletionOperation = {
  object: 'account_mirror_completion',
  id: 'acctmirror_hydration_smoke',
  provider: 'chatgpt',
  runtimeProfileId: 'default',
  mode: 'live_follow',
  phase: 'steady_follow',
  status: 'paused',
  startedAt: '2026-05-01T12:00:00.000Z',
  completedAt: null,
  nextAttemptAt: '2026-05-01T12:10:00.000Z',
  maxPasses: null,
  passCount: 7,
  lastRefresh: null,
  mirrorCompleteness: {
    state: 'complete',
    summary: 'Hydration smoke mirror is complete.',
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

interface CompletionStatusProjection {
  accountMirrorCompletions?: {
    metrics?: {
      active?: number;
      paused?: number;
      total?: number;
    };
    active?: AccountMirrorCompletionOperation[];
    recent?: AccountMirrorCompletionOperation[];
  };
  liveFollow?: LiveFollowHealthSummary;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
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

async function assertHydratedStatus(port: number, label: string): Promise<void> {
  const baseUrl = `http://127.0.0.1:${port}`;
  const status = await fetchJson<CompletionStatusProjection>(`${baseUrl}/status`);
  assertEqual(status.accountMirrorCompletions?.metrics?.total, 1, `${label} HTTP total`);
  assertEqual(status.accountMirrorCompletions?.metrics?.active, 1, `${label} HTTP active`);
  assertEqual(status.accountMirrorCompletions?.metrics?.paused, 1, `${label} HTTP paused`);
  assertEqual(status.accountMirrorCompletions?.active?.[0]?.id, operation.id, `${label} HTTP active id`);
  assertEqual(status.accountMirrorCompletions?.recent?.[0]?.status, 'paused', `${label} HTTP recent status`);
  assertEqual(status.liveFollow?.severity, 'paused', `${label} HTTP live-follow severity`);
  assertEqual(status.liveFollow?.pausedCompletions, 1, `${label} HTTP live-follow paused`);

  const cliStatus = await readApiStatusForCli({ port });
  assertEqual(cliStatus.completions.metrics.total, 1, `${label} CLI total`);
  assertEqual(cliStatus.completions.metrics.active, 1, `${label} CLI active`);
  assertEqual(cliStatus.completions.metrics.paused, 1, `${label} CLI paused`);
  assertEqual(cliStatus.completions.active[0]?.id, operation.id, `${label} CLI active id`);
  assertEqual(cliStatus.liveFollow.severity, 'paused', `${label} CLI live-follow severity`);

  const mcpStatus = await createApiStatusToolHandler()({
    port,
    expectedCompletionActive: 1,
    expectedCompletionPaused: 1,
    expectedLiveFollowSeverity: 'paused',
  });
  if (mcpStatus.isError) throw new Error(`${label} MCP api_status returned an error result.`);
  const structured = mcpStatus.structuredContent as Awaited<ReturnType<typeof readApiStatusForCli>>;
  assertEqual(structured.completions.metrics.paused, 1, `${label} MCP paused`);
  assertEqual(structured.liveFollow.severity, 'paused', `${label} MCP live-follow severity`);
}

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-completion-hydration-'));
  const config = {
    browser: {
      cache: {
        rootDir: tmp,
      },
    },
  };
  try {
    const store = createAccountMirrorCompletionStore({ config });
    await store.writeOperation(operation, { persistedAt: '2026-05-01T12:00:01.000Z' });

    const first = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { config });
    try {
      await assertHydratedStatus(first.port, 'first start');
    } finally {
      await first.close();
    }

    const second = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { config });
    try {
      await assertHydratedStatus(second.port, 'restart');
      console.log([
        `completion-hydration smoke: pass port=${second.port}`,
        `operation=${operation.id}`,
        'status=paused',
        'active=1',
        'liveFollow=paused',
        'providerWork=none',
      ].join('\n'));
    } finally {
      await second.close();
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
