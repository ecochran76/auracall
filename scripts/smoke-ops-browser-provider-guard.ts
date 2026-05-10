#!/usr/bin/env tsx
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createAccountMirrorStatusRegistry } from '../src/accountMirror/statusRegistry.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';

const execFileAsync = promisify(execFile);
const sessionName = `auracall-provider-guard-${process.pid}`;
let profileDir = '';

const config = {
  runtimeProfiles: {
    default: {
      browserProfile: 'default',
      defaultService: 'gemini',
      services: {
        gemini: {
          identity: {
            email: 'ecochran76@gmail.com',
          },
          liveFollow: {
            enabled: true,
            mode: 'metadata-first',
            priority: 'background',
          },
        },
      },
    },
  },
};

async function runAgentBrowser(args: string[]): Promise<string> {
  try {
    const result = await execFileAsync(
      'agent-browser',
      ['--session', sessionName, '--profile', profileDir, ...args],
      { maxBuffer: 1024 * 1024 },
    );
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as T;
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: expected ${expected}.\n${text}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

async function main(): Promise<void> {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-provider-guard-smoke-'));
  profileDir = path.join(homeDir, 'agent-browser-profile');
  setAuracallHomeDirOverrideForTest(homeDir);
  const registry = createAccountMirrorStatusRegistry({
    config,
    initialState: {
      'gemini:default': {
        detectedIdentityKey: 'ecochran76@gmail.com',
        providerGuard: {
          state: 'manual_clear_required',
          kind: 'google-sorry',
          summary: 'Google unusual-traffic interstitial detected (google.com/sorry).',
          detectedAtMs: Date.parse('2026-05-10T12:00:00.000Z'),
          url: 'https://www.google.com/sorry/index',
          action: 'account-mirror-refresh',
        },
        providerHardStopAtMs: Date.parse('2026-05-10T12:00:00.000Z'),
      },
    },
    now: () => new Date('2026-05-10T12:05:00.000Z'),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0, accountMirrorSchedulerIntervalMs: 60_000 },
    {
      config,
      now: () => new Date('2026-05-10T12:05:00.000Z'),
      accountMirrorStatusRegistry: registry,
    },
  );
  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;
    await runAgentBrowser(['open', `${baseUrl}/ops/browser`]);
    await runAgentBrowser(['wait', 'button[onclick^="clearMirrorProviderGuard"]']);
    const before = await runAgentBrowser(['get', 'text', 'body']);
    assertIncludes(before, 'manual clear', 'dashboard manual-clear status');
    assertIncludes(before, 'Google unusual-traffic interstitial detected', 'dashboard guard summary');
    assertIncludes(before, 'Clear guard', 'dashboard clear action');

    await runAgentBrowser(['click', 'button[onclick^="clearMirrorProviderGuard"]']);
    await runAgentBrowser(['wait', '1000']);
    const after = await runAgentBrowser(['get', 'text', 'body']);
    assertIncludes(after, 'guard cooldown', 'dashboard cooldown status');
    assertIncludes(after, 'provider guard cleared', 'dashboard cooldown attention reason');

    const status = await fetchJson<{
      accountMirrorStatus?: {
        entries?: Array<{
          provider?: string;
          runtimeProfileId?: string;
          status?: string;
          reason?: string;
          providerGuard?: {
            state?: string;
            kind?: string;
            action?: string;
          };
        }>;
      };
    }>(`${baseUrl}/status`);
    const entry = status.accountMirrorStatus?.entries?.find((candidate) =>
      candidate.provider === 'gemini' && candidate.runtimeProfileId === 'default'
    );
    assertEqual(entry?.status, 'delayed', 'status guard clear posture');
    assertEqual(entry?.reason, 'provider-guard-cooldown', 'status guard clear reason');
    assertEqual(entry?.providerGuard?.state, 'cooldown', 'status provider guard state');
    assertEqual(entry?.providerGuard?.kind, 'google-sorry', 'status provider guard kind');
    assertEqual(entry?.providerGuard?.action, 'operator-clear', 'status provider guard action');

    console.log([
      `ops-browser provider-guard smoke: pass port=${server.port}`,
      `dashboardUrl=${baseUrl}/ops/browser`,
      'manualClear=ok',
      'clearGuard=ok',
      'cooldown=ok',
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
