#!/usr/bin/env tsx
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';
import { recordLazyLiveFollowPreflightRun } from '../src/preflightStatus.js';

const execFileAsync = promisify(execFile);
const sessionName = `auracall-preflight-run-detail-${process.pid}`;
const runId = 'preflight_lazy_live_follow_browser_detail_smoke';
let profileDir = '';

async function runAgentBrowser(args: string[]): Promise<string> {
  try {
    const result = await execFileAsync('agent-browser', ['--session', sessionName, '--profile', profileDir, ...args], {
      maxBuffer: 1024 * 1024,
    });
    return result.stdout;
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error([
      `agent-browser ${args.join(' ')} failed.`,
      detail.message,
      detail.stdout,
      detail.stderr,
    ].filter(Boolean).join('\n'));
  }
}

async function main(): Promise<void> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-preflight-dashboard-smoke-'));
  profileDir = path.join(homeDir, 'agent-browser-profile');
  setAuracallHomeDirOverrideForTest(homeDir);
  const logPath = path.join(homeDir, 'logs', 'preflight-lazy-live-follow-browser-detail.log');
  await recordLazyLiveFollowPreflightRun({
    object: 'auracall_preflight_run',
    id: runId,
    name: 'lazy-live-follow',
    status: 'passed',
    command: 'pnpm',
    args: ['run', 'preflight:lazy-live-follow'],
    cwd: process.cwd(),
    logPath,
    startedAt: '2026-05-09T20:00:00.000Z',
    completedAt: '2026-05-09T20:00:02.000Z',
    durationMs: 2000,
    exitCode: 0,
    signal: null,
    errorMessage: null,
    steps: [
      {
        label: 'browser dashboard run detail',
        status: 'passed',
        command: 'agent-browser click Open Run',
        startedAt: '2026-05-09T20:00:00.000Z',
        completedAt: '2026-05-09T20:00:02.000Z',
        durationMs: 2000,
        errorMessage: null,
      },
    ],
  });
  const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });
  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;
    await runAgentBrowser(['open', `${baseUrl}/ops/browser`]);
    await runAgentBrowser(['wait', `button[data-preflight-run-id="${runId}"][onclick^="loadPreflightRunDetail"]`]);
    await runAgentBrowser(['click', `button[data-preflight-run-id="${runId}"][onclick^="loadPreflightRunDetail"]`]);
    await runAgentBrowser(['wait', '500']);
    const detail = await runAgentBrowser(['get', 'text', '#preflightRunDetail']);
    for (const expected of [runId, '"status": "passed"', 'browser dashboard run detail', logPath]) {
      if (!detail.includes(expected)) {
        throw new Error(`preflight run detail panel did not include ${expected}.\n${detail}`);
      }
    }
    console.log([
      `ops-browser preflight-run-detail smoke: pass port=${server.port}`,
      `dashboardUrl=${baseUrl}/ops/browser`,
      `runId=${runId}`,
      'openRun=ok',
      'detailPanel=ok',
      'providerWork=none',
    ].join('\n'));
  } finally {
    await runAgentBrowser(['close']).catch(() => undefined);
    await server.close();
    await fs.rm(homeDir, { recursive: true, force: true });
    setAuracallHomeDirOverrideForTest(null);
  }
}

main().then(() => {
  process.exit(0);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
