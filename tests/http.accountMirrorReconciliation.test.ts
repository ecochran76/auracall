import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createResponsesHttpServer, type ResponsesHttpServerInstance } from '../src/http/responsesServer.js';
import type {
  AccountMirrorCompletionOperation,
  AccountMirrorCompletionService,
} from '../src/accountMirror/completionService.js';

const servers: ResponsesHttpServerInstance[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
});

describe('account mirror reconciliation HTTP routes', () => {
  test('creates and reads a dry-run campaign without browser work', async () => {
    const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-reconciliation-'));
    const server = await createResponsesHttpServer({
      host: '127.0.0.1',
      port: 0,
      reconcileAccountMirrorLiveFollowOnStart: false,
    }, {
      config: {
        browser: {
          cache: {
            rootDir: cacheRoot,
          },
        },
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            services: {
              chatgpt: {
                identity: { email: 'operator@example.com' },
                liveFollow: { enabled: true },
              },
              gemini: {
                liveFollow: { enabled: true },
              },
            },
          },
        },
      },
      now: () => new Date('2026-05-24T12:00:00.000Z'),
    });
    servers.push(server);

    const createResponse = await fetch(`http://127.0.0.1:${server.port}/v1/account-mirrors/reconciliations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'chatgpt',
        dryRun: true,
        materializationPolicy: 'full_missing_assets',
        materializationAssetKinds: ['all'],
      }),
    });
    expect(createResponse.status).toBe(202);
    const campaign = await createResponse.json() as Record<string, unknown>;
    expect(campaign).toMatchObject({
      object: 'account_mirror_reconciliation_campaign',
      dryRun: true,
      status: 'planned',
      metrics: {
        totalTargets: 1,
        selectedTargets: 1,
      },
    });

    const id = String(campaign.id);
    const statusResponse = await fetch(`http://127.0.0.1:${server.port}/v1/account-mirrors/reconciliations/${encodeURIComponent(id)}`);
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toMatchObject({
      id,
      object: 'account_mirror_reconciliation_campaign',
    });

    const listResponse = await fetch(`http://127.0.0.1:${server.port}/v1/account-mirrors/reconciliations?limit=5`);
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      object: 'list',
      count: 1,
    });
  });

  test('starts selected targets through the injected completion service for execution campaigns', async () => {
    const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-reconciliation-execute-'));
    const start = vi.fn(() => completionOperation());
    const completionService = {
      start,
      read: vi.fn((id: string) => id === 'acctmirror_http_reconcile_child' ? completionOperation() : null),
      list: vi.fn(() => []),
      control: vi.fn(() => null),
    } satisfies AccountMirrorCompletionService;
    const server = await createResponsesHttpServer({
      host: '127.0.0.1',
      port: 0,
      reconcileAccountMirrorLiveFollowOnStart: false,
    }, {
      config: {
        browser: {
          cache: {
            rootDir: cacheRoot,
          },
        },
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            services: {
              chatgpt: {
                identity: { email: 'operator@example.com' },
                liveFollow: { enabled: true },
              },
            },
          },
        },
      },
      accountMirrorCompletionService: completionService,
      now: () => new Date('2026-05-24T12:00:00.000Z'),
    });
    servers.push(server);

    const createResponse = await fetch(`http://127.0.0.1:${server.port}/v1/account-mirrors/reconciliations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'chatgpt',
        dryRun: false,
        materializationPolicy: 'full_missing_assets',
      }),
    });
    expect(createResponse.status).toBe(202);
    const campaign = await createResponse.json() as Record<string, unknown>;

    expect(start).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      maxPasses: 1,
      sweepMode: 'full_sweep',
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['all'],
      materializationMaxItems: null,
      materializationRefreshSnapshot: true,
    });
    expect(campaign).toMatchObject({
      dryRun: false,
      status: 'running',
      metrics: {
        selectedTargets: 1,
      },
      targets: [
        expect.objectContaining({
          childOperations: {
            completionId: 'acctmirror_http_reconcile_child',
            materializationJobId: null,
          },
        }),
      ],
    });

    const controlResponse = await fetch(`http://127.0.0.1:${server.port}/v1/account-mirrors/reconciliations/${encodeURIComponent(String(campaign.id))}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'run-next-pass' }),
    });
    expect(controlResponse.status).toBe(200);
    await expect(controlResponse.json()).resolves.toMatchObject({
      id: campaign.id,
      object: 'account_mirror_reconciliation_campaign',
    });
  });
});

function completionOperation(): AccountMirrorCompletionOperation {
  return {
    object: 'account_mirror_completion',
    id: 'acctmirror_http_reconcile_child',
    provider: 'chatgpt',
    runtimeProfileId: 'default',
    mode: 'bounded',
    sweepMode: 'full_sweep',
    phase: 'backfill_history',
    status: 'queued',
    startedAt: '2026-05-24T12:00:00.000Z',
    completedAt: null,
    nextAttemptAt: null,
    maxPasses: 1,
    passCount: 0,
    lastRefresh: null,
    materializationPolicy: 'full_missing_assets',
    materializationAssetKinds: ['all'],
    materializationMaxItems: null,
    materializationRefreshSnapshot: true,
    materializationForce: false,
    materializationCursor: null,
    mirrorCompleteness: null,
    error: null,
    lifecycleEvents: [],
  };
}
