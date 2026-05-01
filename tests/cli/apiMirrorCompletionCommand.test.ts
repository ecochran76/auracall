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
