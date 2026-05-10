import { execFile } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, test } from 'vitest';
import {
  clearApiMirrorProviderGuardForCli,
  formatApiMirrorProviderGuardClearCliSummary,
} from '../../src/cli/apiMirrorProviderGuardCommand.js';

const execFileAsync = promisify(execFile);
const TSX_BIN = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_ENTRY = path.join(process.cwd(), 'bin', 'auracall.ts');
const CLI_TIMEOUT = process.platform === 'win32' ? 60_000 : 30_000;
const servers: http.Server[] = [];

const guardClearPayload = {
  object: 'status',
  ok: true,
  controlResult: {
    kind: 'account-mirror-provider-guard',
    action: 'clear',
    provider: 'gemini',
    runtimeProfileId: 'default',
    cooldownUntil: '2026-05-10T12:35:00.000Z',
  },
  accountMirrorStatus: {
    entries: [
      {
        provider: 'gemini',
        runtimeProfileId: 'default',
        status: 'delayed',
        reason: 'provider-guard-cooldown',
        providerGuard: {
          state: 'cooldown',
          kind: 'google-sorry',
          action: 'operator-clear',
        },
      },
    ],
  },
};

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

describe('api mirror-provider-guard-clear CLI helpers', () => {
  it('posts provider guard clear through fetch', async () => {
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('http://127.0.0.1:18080/status');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        accountMirrorProviderGuard: {
          action: 'clear',
          provider: 'gemini',
          runtimeProfile: 'default',
          cooldownMs: 600000,
        },
      });
      return new Response(JSON.stringify(guardClearPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await expect(clearApiMirrorProviderGuardForCli({
      port: 18080,
      timeoutMs: 1000,
      provider: 'gemini',
      runtimeProfile: 'default',
      cooldownMs: 600_000,
    }, fetchImpl)).resolves.toMatchObject({
      host: '127.0.0.1',
      port: 18080,
      provider: 'gemini',
      runtimeProfileId: 'default',
      cooldownUntil: '2026-05-10T12:35:00.000Z',
      status: 'delayed',
      reason: 'provider-guard-cooldown',
    });
  });

  it('formats a compact provider guard clear summary', () => {
    const output = formatApiMirrorProviderGuardClearCliSummary({
      host: '127.0.0.1',
      port: 18080,
      provider: 'gemini',
      runtimeProfileId: 'default',
      cooldownUntil: '2026-05-10T12:35:00.000Z',
      status: 'delayed',
      reason: 'provider-guard-cooldown',
      raw: guardClearPayload,
    });

    expect(output).toContain('Account mirror provider guard cleared (127.0.0.1:18080)');
    expect(output).toContain('Target: gemini/default');
    expect(output).toContain('Cooldown until: 2026-05-10T12:35:00.000Z');
    expect(output).toContain('Mirror status: delayed provider-guard-cooldown');
  });
});

describe('api mirror-provider-guard-clear CLI', () => {
  test('clears a provider guard through the real command parser', async () => {
    const seenRequests: Array<{ url: string; body: unknown }> = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += String(chunk);
      });
      req.on('end', () => {
        seenRequests.push({
          url: req.url ?? '',
          body: JSON.parse(body),
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(guardClearPayload));
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('expected TCP server address');
    }

    const env = {
      ...process.env,
      // biome-ignore lint/style/useNamingConvention: environment variable name
      ORACLE_NO_BANNER: '1',
      // biome-ignore lint/style/useNamingConvention: environment variable name
      AURACALL_DISABLE_KEYTAR: '1',
    };

    const result = await execFileAsync(
      process.execPath,
      [
        TSX_BIN,
        CLI_ENTRY,
        'api',
        'mirror-provider-guard-clear',
        '--port',
        String(address.port),
        '--provider',
        'gemini',
        '--runtime-profile',
        'default',
        '--cooldown-ms',
        '600000',
        '--json',
      ],
      { env },
    );

    expect(JSON.parse(result.stdout)).toMatchObject({
      controlResult: {
        kind: 'account-mirror-provider-guard',
        provider: 'gemini',
        runtimeProfileId: 'default',
      },
    });
    expect(seenRequests.at(-1)).toEqual({
      url: '/status',
      body: {
        accountMirrorProviderGuard: {
          action: 'clear',
          provider: 'gemini',
          runtimeProfile: 'default',
          cooldownMs: 600000,
        },
      },
    });
  }, CLI_TIMEOUT);
});
