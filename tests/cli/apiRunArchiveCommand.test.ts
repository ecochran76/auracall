import { describe, expect, test, vi } from 'vitest';
import {
  attachApiRunArchiveEvidenceForCli,
  backfillApiRunArchiveForCli,
  createApiRunArchiveMaterializationJobForCli,
  formatApiRunArchiveAssetLookupCliSummary,
  formatApiRunArchiveBackfillCliSummary,
  formatApiRunArchiveCliSummary,
  formatApiRunArchiveEvidenceCliSummary,
  formatApiRunArchiveItemCliSummary,
  formatApiRunArchiveItemMaterializeCliSummary,
  formatApiRunArchiveMaterializationJobCliSummary,
  formatApiRunArchiveMaterializationJobsCliSummary,
  lookupApiRunArchiveAssetForCli,
  listApiRunArchiveMaterializationJobsForCli,
  materializeApiRunArchiveItemForCli,
  readApiRunArchiveMaterializationJobForCli,
  readApiRunArchiveForCli,
  readApiRunArchiveItemForCli,
} from '../../src/cli/apiRunArchiveCommand.js';

describe('api run archive CLI helpers', () => {
  test('reads archive search with filters from the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe(
        'http://127.0.0.1:18095/v1/archive?kind=upload&provider=chatgpt&runtimeProfile=default&projectId=project_1&batchId=batch_1&q=packet&limit=3',
      );
      return new Response(JSON.stringify({
        object: 'run_archive',
        generatedAt: '2026-05-16T17:00:00.000Z',
        kind: 'upload',
        limit: 3,
        items: [],
        metrics: {
          total: 0,
          byKind: {},
        },
      }));
    });

    await expect(readApiRunArchiveForCli({
      port: 18095,
      kind: 'upload',
      provider: 'chatgpt',
      runtimeProfile: 'default',
      projectId: 'project_1',
      batchId: 'batch_1',
      query: 'packet',
      limit: 3,
    }, fetchImpl as never)).resolves.toMatchObject({
      object: 'run_archive',
      kind: 'upload',
    });
  });

  test('retries archive search with the local API key after auth challenge', async () => {
    const previousKey = process.env.AURACALL_API_KEY;
    process.env.AURACALL_API_KEY = 'local-secret';
    try {
      const fetchImpl = vi.fn(async (_url: URL, init?: RequestInit) => {
        if (fetchImpl.mock.calls.length === 1) {
          expect(init?.headers).toBeUndefined();
          return new Response('', { status: 401 });
        }
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer local-secret');
        return new Response(JSON.stringify({
          object: 'run_archive',
          generatedAt: '2026-05-16T17:00:00.000Z',
          kind: 'generated_artifact',
          limit: 1,
          items: [],
          metrics: {
            total: 0,
            byKind: {},
          },
        }));
      });

      await expect(readApiRunArchiveForCli({
        port: 18095,
        kind: 'generated_artifact',
        limit: 1,
      }, fetchImpl as never)).resolves.toMatchObject({
        object: 'run_archive',
        kind: 'generated_artifact',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      if (previousKey === undefined) {
        delete process.env.AURACALL_API_KEY;
      } else {
        process.env.AURACALL_API_KEY = previousKey;
      }
    }
  });

  test('reads archive item detail and formats compact summaries', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe('http://127.0.0.1:18095/v1/archive/items/response%3Aresp_1');
      return new Response(JSON.stringify({
        object: 'run_archive_item_detail',
        generatedAt: '2026-05-16T17:00:00.000Z',
        item: {
          id: 'response:resp_1',
          object: 'run_archive_item',
          kind: 'response',
          source: 'runtime',
          createdAt: '2026-05-16T17:00:00.000Z',
          updatedAt: '2026-05-16T17:00:00.000Z',
          title: 'Prompt',
          status: 'succeeded',
          provider: 'chatgpt',
          runtimeProfile: 'default',
          browserProfile: null,
          projectId: 'project_1',
          boundIdentityKey: null,
          agentId: 'instant-chatgpt-ecochran76',
          teamId: null,
          responseId: 'resp_1',
          batchId: null,
          batchIndex: null,
          mediaGenerationId: null,
          providerConversationId: 'conv_1',
          providerConversationUrl: 'https://chatgpt.com/c/conv_1',
          artifactId: null,
          fileName: null,
          mimeType: null,
          localPath: null,
          uri: null,
          cacheKey: null,
          checksumSha256: null,
          fileAvailable: null,
          metadata: {},
          links: {},
        },
      }));
    });

    const item = await readApiRunArchiveItemForCli({
      port: 18095,
      id: 'response:resp_1',
    }, fetchImpl as never);

    expect(formatApiRunArchiveItemCliSummary(item)).toContain('Run archive item: response:resp_1');
    expect(formatApiRunArchiveItemCliSummary(item)).toContain('Project: project_1');
    expect(formatApiRunArchiveCliSummary({
      object: 'run_archive',
      kind: 'response',
      items: [(item as { item: unknown }).item],
      metrics: { total: 1 },
    })).toContain('project=project_1');
  });

  test('formats transient runtime state as archive display status', () => {
    const item = {
      id: 'response:resp_finalizing_cli',
      object: 'run_archive_item',
      kind: 'response',
      source: 'runtime',
      createdAt: '2026-05-18T17:00:00.000Z',
      updatedAt: '2026-05-18T17:05:00.000Z',
      title: 'Prompt',
      status: 'running',
      runtimeState: 'finalizing',
      provider: 'chatgpt',
      runtimeProfile: 'wsl-chrome-3',
      browserProfile: 'wsl-chrome-3',
      projectId: 'Transcripts',
      boundIdentityKey: 'ecochran76@gmail.com',
      agentId: 'pro-extended-chatgpt-soylei-transcripts',
      teamId: null,
      responseId: 'resp_finalizing_cli',
      batchId: 'batch_finalizing_cli',
      batchIndex: 0,
      mediaGenerationId: null,
      providerConversationId: null,
      providerConversationUrl: null,
      artifactId: null,
      fileName: null,
      mimeType: null,
      localPath: null,
      uri: null,
      cacheKey: null,
      checksumSha256: null,
      fileAvailable: null,
      metadata: {},
      links: {},
    };

    expect(formatApiRunArchiveCliSummary({
      object: 'run_archive',
      kind: 'response',
      items: [item],
      metrics: { total: 1 },
    })).toContain('status=finalizing (raw: running)');
    expect(formatApiRunArchiveItemCliSummary({
      object: 'run_archive_item_detail',
      item,
    })).toContain('Status: finalizing (raw: running)');
  });

  test('looks up archive assets by checksum through the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe(
        'http://127.0.0.1:18095/v1/archive/assets/lookup?checksumSha256=abc123&limit=5',
      );
      return new Response(JSON.stringify({
        object: 'run_archive_asset_lookup',
        generatedAt: '2026-05-16T17:00:00.000Z',
        query: {
          checksumSha256: 'abc123',
          cacheKey: null,
          providerArtifactId: null,
          artifactId: null,
        },
        canonicalItem: {
          id: 'generated-artifact:resp_1:file_1',
          kind: 'generated_artifact',
          localPath: '/tmp/file.json',
          checksumSha256: 'abc123',
        },
        items: [
          {
            id: 'generated-artifact:resp_1:file_1',
            kind: 'generated_artifact',
            fileAvailable: true,
            cacheKey: 'sha256:abc123',
          },
        ],
        metrics: {
          total: 1,
          fileAvailable: 1,
          duplicateCacheKeys: [],
        },
      }));
    });

    const result = await lookupApiRunArchiveAssetForCli({
      port: 18095,
      checksumSha256: 'abc123',
      limit: 5,
    }, fetchImpl as never);

    expect(formatApiRunArchiveAssetLookupCliSummary(result)).toContain('Canonical: generated-artifact:resp_1:file_1');
  });

  test('materializes an archive item through the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe(
        'http://127.0.0.1:18095/v1/archive/items/generated-artifact%3Aresp_1%3Aartifact_1/materialize',
      );
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({
        object: 'run_archive_item_materialization',
        generatedAt: '2026-05-18T18:30:00.000Z',
        status: 'materialized',
        message: 'Archive item materialized and indexed.',
        item: {
          id: 'generated-artifact:resp_1:artifact_1',
          fileName: 'first_pass_readout.json',
          localPath: '/tmp/first_pass_readout.json',
          links: {
            asset: '/v1/archive/items/b64/Z2VuZXJhdGVk/asset',
          },
        },
        file: {
          name: 'first_pass_readout.json',
          localPath: '/tmp/first_pass_readout.json',
        },
      }));
    });

    const result = await materializeApiRunArchiveItemForCli({
      port: 18095,
      id: 'generated-artifact:resp_1:artifact_1',
    }, fetchImpl as never);

    expect(formatApiRunArchiveItemMaterializeCliSummary(result)).toContain(
      'Run archive item materialization: materialized',
    );
    expect(formatApiRunArchiveItemMaterializeCliSummary(result)).toContain(
      'Local path: /tmp/first_pass_readout.json',
    );
  });

  test('queues and reads archive materialization jobs through the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      if (url.pathname === '/v1/archive/materializations') {
        expect(url.toString()).toBe('http://127.0.0.1:18095/v1/archive/materializations');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toEqual({ 'content-type': 'application/json' });
        expect(JSON.parse(String(init?.body))).toMatchObject({
          archiveItemId: 'generated-artifact:resp_1:artifact_1',
        });
        return new Response(JSON.stringify({
          object: 'run_archive_materialization_job_create_result',
          generatedAt: '2026-05-19T12:00:00.000Z',
          reused: false,
          job: {
            object: 'run_archive_materialization_job',
            id: 'ramj_test_1',
            archiveItemId: 'generated-artifact:resp_1:artifact_1',
            status: 'queued',
            createdAt: '2026-05-19T12:00:00.000Z',
            updatedAt: '2026-05-19T12:00:00.000Z',
            startedAt: null,
            completedAt: null,
            attemptCount: 0,
            result: null,
            error: null,
            message: 'Archive materialization job queued.',
          },
        }));
      }
      expect(url.toString()).toBe('http://127.0.0.1:18095/v1/archive/materializations/ramj_test_1');
      return new Response(JSON.stringify({
        object: 'run_archive_materialization_job',
        id: 'ramj_test_1',
        archiveItemId: 'generated-artifact:resp_1:artifact_1',
        status: 'succeeded',
        createdAt: '2026-05-19T12:00:00.000Z',
        updatedAt: '2026-05-19T12:01:00.000Z',
        startedAt: '2026-05-19T12:00:01.000Z',
        completedAt: '2026-05-19T12:01:00.000Z',
        attemptCount: 1,
        result: {
          status: 'already_materialized',
          item: {
            id: 'generated-artifact:resp_1:artifact_1',
            localPath: '/tmp/first_pass_readout.json',
          },
        },
        error: null,
        message: 'Archive item already has a readable local asset.',
      }));
    });

    const created = await createApiRunArchiveMaterializationJobForCli({
      port: 18095,
      id: 'generated-artifact:resp_1:artifact_1',
    }, fetchImpl as never);
    expect(formatApiRunArchiveMaterializationJobCliSummary(created)).toContain(
      'Run archive materialization job: ramj_test_1',
    );

    const read = await readApiRunArchiveMaterializationJobForCli({
      port: 18095,
      id: 'ramj_test_1',
    }, fetchImpl as never);
    expect(formatApiRunArchiveMaterializationJobCliSummary(read)).toContain('Status: succeeded');
    expect(formatApiRunArchiveMaterializationJobCliSummary(read)).toContain('Local path: /tmp/first_pass_readout.json');
  });

  test('lists archive materialization jobs through the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe(
        'http://127.0.0.1:18095/v1/archive/materializations?status=terminal&archiveItemId=generated-artifact%3Aresp_1%3Aartifact_1&limit=2',
      );
      return new Response(JSON.stringify({
        object: 'run_archive_materialization_jobs',
        generatedAt: '2026-05-19T12:05:00.000Z',
        status: 'terminal',
        archiveItemId: 'generated-artifact:resp_1:artifact_1',
        limit: 2,
        jobs: [
          {
            object: 'run_archive_materialization_job',
            id: 'ramj_test_1',
            archiveItemId: 'generated-artifact:resp_1:artifact_1',
            status: 'succeeded',
            createdAt: '2026-05-19T12:00:00.000Z',
            updatedAt: '2026-05-19T12:01:00.000Z',
            startedAt: '2026-05-19T12:00:01.000Z',
            completedAt: '2026-05-19T12:01:00.000Z',
            attemptCount: 1,
            result: null,
            error: null,
            message: 'Archive item already has a readable local asset.',
          },
        ],
        metrics: {
          total: 1,
          byStatus: { succeeded: 1 },
          active: 0,
          terminal: 1,
        },
      }));
    });

    const result = await listApiRunArchiveMaterializationJobsForCli({
      port: 18095,
      status: 'terminal',
      archiveItemId: 'generated-artifact:resp_1:artifact_1',
      limit: 2,
    }, fetchImpl as never);

    expect(formatApiRunArchiveMaterializationJobsCliSummary(result)).toContain(
      'Run archive materialization jobs: 1 job',
    );
    expect(formatApiRunArchiveMaterializationJobsCliSummary(result)).toContain(
      'ramj_test_1 status=succeeded',
    );
  });

  test('requests archive index backfill from the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe('http://127.0.0.1:18095/v1/archive/backfill');
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({
        object: 'run_archive_backfill',
        generatedAt: '2026-05-16T17:00:00.000Z',
        index: {
          updatedAt: '2026-05-16T17:00:00.000Z',
          itemCount: 4,
        },
        metrics: {
          byKind: {},
        },
      }));
    });

    const result = await backfillApiRunArchiveForCli({
      port: 18095,
    }, fetchImpl as never);

    expect(formatApiRunArchiveBackfillCliSummary(result)).toContain('4 items');
  });

  test('attaches caller-owned archive evidence through the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe('http://127.0.0.1:18095/v1/archive/evidence');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({ 'content-type': 'application/json' });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        producer: 'course-agent',
        schema: 'grading-review.v1',
      });
      return new Response(JSON.stringify({
        object: 'run_archive_evidence_result',
        generatedAt: '2026-05-16T17:00:00.000Z',
        evidence: {
          id: 'score_review',
          schema: 'grading-review.v1',
          status: 'pass',
        },
        item: {
          id: 'evidence:score_review',
        },
      }));
    });

    const result = await attachApiRunArchiveEvidenceForCli({
      port: 18095,
      payload: {
        producer: 'course-agent',
        schema: 'grading-review.v1',
        status: 'pass',
      },
    }, fetchImpl as never);

    expect(formatApiRunArchiveEvidenceCliSummary(result)).toContain('Run archive evidence attached: evidence:score_review');
  });
});
