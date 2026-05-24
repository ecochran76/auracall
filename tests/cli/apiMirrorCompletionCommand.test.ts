import { execFile } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const TSX_BIN = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_ENTRY = path.join(process.cwd(), 'bin', 'auracall.ts');
const CLI_TIMEOUT = process.platform === 'win32' ? 60_000 : 30_000;

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

describe('api mirror completion CLI', () => {
  test('passes full-sweep materialization options when starting mirror completion', async () => {
    let seenBody: Record<string, unknown> | null = null;
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        seenBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          object: 'account_mirror_completion',
          id: 'acctmirror_cli_full_sweep',
          status: 'queued',
        }));
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
        'mirror-complete',
        '--port',
        String(address.port),
        '--provider',
        'gemini',
        '--runtime-profile',
        'auracall-gemini-pro',
        '--max-passes',
        '1',
        '--sweep-mode',
        'full_sweep',
        '--materialization-policy',
        'full_missing_assets',
        '--materialization-asset-kind',
        'media',
        '--materialization-max-items',
        '2',
        '--materialization-refresh-snapshot',
        '--json',
      ],
      { env },
    );

    expect(JSON.parse(result.stdout)).toMatchObject({ id: 'acctmirror_cli_full_sweep' });
    expect(seenBody).toMatchObject({
      provider: 'gemini',
      runtimeProfile: 'auracall-gemini-pro',
      maxPasses: 1,
      sweepMode: 'full_sweep',
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['media'],
      materializationMaxItems: 2,
      materializationRefreshSnapshot: true,
    });
  }, CLI_TIMEOUT);

  test('scopes --status value form to mirror-completions instead of root status alias', async () => {
    const seenUrls: string[] = [];
    const server = http.createServer((req, res) => {
      seenUrls.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        object: 'list',
        data: [],
        count: 0,
      }));
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

    const spaced = await execFileAsync(
      process.execPath,
      [TSX_BIN, CLI_ENTRY, 'api', 'mirror-completions', '--port', String(address.port), '--status', 'active', '--json'],
      { env },
    );
    expect(JSON.parse(spaced.stdout)).toMatchObject({ object: 'list', count: 0 });
    expect(seenUrls.at(-1)).toBe('/v1/account-mirrors/completions?status=active&limit=50');

    const equals = await execFileAsync(
      process.execPath,
      [TSX_BIN, CLI_ENTRY, 'api', 'mirror-completions', '--port', String(address.port), '--status=paused', '--json'],
      { env },
    );
    expect(JSON.parse(equals.stdout)).toMatchObject({ object: 'list', count: 0 });
    expect(seenUrls.at(-1)).toBe('/v1/account-mirrors/completions?status=paused&limit=50');
  }, CLI_TIMEOUT);
});
