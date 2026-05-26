import { execFile } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';
import {
  formatApiMirrorCompletionCliSummary,
  formatApiMirrorReconciliationCliSummary,
  listApiMirrorReconciliationsForCli,
} from '../../src/cli/apiMirrorCompletionCommand.js';

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
  test('summarizes terminal completion materialization evidence', () => {
    const summary = formatApiMirrorCompletionCliSummary({
      id: 'acctmirror_completion_cli',
      status: 'completed',
      mode: 'bounded',
      sweepMode: 'full_sweep',
      phase: 'steady_follow',
      provider: 'gemini',
      runtimeProfileId: 'auracall-gemini-pro',
      passCount: 1,
      maxPasses: 1,
      materializationCursor: {
        jobId: 'hmj_cli_terminal',
        jobStatus: 'succeeded',
      },
      materializationOutcome: {
        conversationsAttempted: 5,
        materialized: 4,
        skipped: 1,
        failed: 0,
        checksumCount: 4,
        manifestPaths: ['/tmp/gemini-manifest.json'],
      },
    });

    expect(summary).toContain('Materialization job: hmj_cli_terminal status=succeeded');
    expect(summary).toContain('Materialization outcome: conversations=5 materialized=4 skipped=1 failed=0 checksums=4');
    expect(summary).toContain('Materialization manifests: /tmp/gemini-manifest.json');
  });

  test('summarizes reconciliation materialization evidence', () => {
    const summary = formatApiMirrorReconciliationCliSummary({
      id: 'acctmirror_reconciliation_cli',
      status: 'completed',
      dryRun: false,
      metrics: {
        totalTargets: 1,
        selectedTargets: 1,
        materialization: {
          jobs: 1,
          activeJobs: 0,
          materialized: 2,
          checksummedAssets: 2,
          terminalUnavailableConversations: 1,
        },
      },
      targets: [
        {
          provider: 'gemini',
          tenantKey: 'service-account:gemini:operator@example.com',
          bindingKey: 'binding:gemini:default:default',
          runtimeProfileId: 'default',
          state: 'eligible',
          selected: true,
          expectedIdentityKey: 'operator@example.com',
          activeCompletionId: 'acctmirror_completion_child',
          childOperations: {
            completionId: 'acctmirror_completion_child',
            materializationJobId: 'hmj_cli',
          },
          execution: {
            status: 'completed',
            materializationMetrics: {
              materialized: 2,
              checksummedAssets: 2,
            },
            materializedAssets: [
              { checksumSha256: 'abc123' },
              { checksumSha256: 'def456' },
            ],
          },
        },
      ],
    });

    expect(summary).toContain('Materialization: jobs=1 active=0 materialized=2 checksums=2 unavailable=1');
    expect(summary).toContain('gemini/default identity=operator@example.com tenant=service-account:gemini:operator@example.com binding=binding:gemini:default:default: eligible selected exec=completed child=acctmirror_completion_child materialization=hmj_cli assets=2/2');
  });

  test('retries local mirror API requests with configured auth key after 401', async () => {
    const originalKey = process.env.AURACALL_API_KEY;
    process.env.AURACALL_API_KEY = 'test-local-api-key';
    const seenAuthHeaders: Array<string | null> = [];
    const fetchImpl = async (_url: URL, init?: RequestInit) => {
      seenAuthHeaders.push(new Headers(init?.headers).get('authorization'));
      if (seenAuthHeaders.length === 1) {
        return new Response(JSON.stringify({ error: { message: 'unauthorized' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ object: 'list', data: [], count: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    try {
      await expect(listApiMirrorReconciliationsForCli({ port: 18095 }, fetchImpl as typeof fetch)).resolves.toMatchObject({
        object: 'list',
        count: 0,
      });
      expect(seenAuthHeaders).toEqual([null, 'Bearer test-local-api-key']);
    } finally {
      if (originalKey === undefined) {
        delete process.env.AURACALL_API_KEY;
      } else {
        process.env.AURACALL_API_KEY = originalKey;
      }
    }
  });

  test('passes dry-run campaign options when planning mirror reconciliation', async () => {
    let seenUrl = '';
    let seenBody: Record<string, unknown> | null = null;
    const server = http.createServer((req, res) => {
      seenUrl = req.url ?? '';
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        seenBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          object: 'account_mirror_reconciliation_campaign',
          id: 'acctmirror_reconciliation_cli',
          dryRun: true,
          status: 'planned',
          metrics: {
            totalTargets: 2,
            selectedTargets: 1,
          },
          targets: [],
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
        'mirror-reconcile-all',
        '--port',
        String(address.port),
        '--provider',
        'gemini',
        '--runtime-profile',
        'auracall-gemini-pro',
        '--identity',
        'operator@example.com',
        '--max-targets',
        '3',
        '--max-active-targets',
        '2',
        '--materialization-policy',
        'full_missing_assets',
        '--materialization-asset-kind',
        'media',
        '--materialization-max-items',
        '4',
        '--dry-run',
        '--json',
      ],
      { env },
    );

    expect(JSON.parse(result.stdout)).toMatchObject({ id: 'acctmirror_reconciliation_cli' });
    expect(seenUrl).toBe('/v1/account-mirrors/reconciliations');
    expect(seenBody).toMatchObject({
      provider: 'gemini',
      runtimeProfile: 'auracall-gemini-pro',
      identity: 'operator@example.com',
      maxTargets: 3,
      maxActiveTargets: 2,
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['media'],
      materializationMaxItems: 4,
      dryRun: true,
    });

    await execFileAsync(
      process.execPath,
      [
        TSX_BIN,
        CLI_ENTRY,
        'api',
        'mirror-reconcile-all',
        '--port',
        String(address.port),
        '--provider',
        'gemini',
        '--no-dry-run',
        '--json',
      ],
      { env },
    );

    expect(seenBody).toMatchObject({
      provider: 'gemini',
      dryRun: false,
    });
  }, CLI_TIMEOUT);

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

  test('normalizes run-next-pass when controlling mirror reconciliation campaigns', async () => {
    let seenUrl = '';
    let seenBody: Record<string, unknown> | null = null;
    const server = http.createServer((req, res) => {
      seenUrl = req.url ?? '';
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        seenBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          object: 'account_mirror_reconciliation_campaign',
          id: 'acctmirror_reconciliation_cli',
          dryRun: false,
          status: 'running',
          metrics: {
            totalTargets: 2,
            selectedTargets: 2,
          },
          targets: [],
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
        'mirror-reconciliation-control',
        'acctmirror_reconciliation_cli',
        'run-next-pass',
        '--port',
        String(address.port),
        '--json',
      ],
      { env },
    );

    expect(JSON.parse(result.stdout)).toMatchObject({ id: 'acctmirror_reconciliation_cli' });
    expect(seenUrl).toBe('/v1/account-mirrors/reconciliations/acctmirror_reconciliation_cli');
    expect(seenBody).toMatchObject({
      action: 'run_next_pass',
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
