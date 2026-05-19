import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import {
  createArchiveMaterializationJobService,
} from '../src/runtime/archiveMaterializationJobService.js';
import type { RunArchiveItem } from '../src/runtime/archiveService.js';

describe('archive materialization job service', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  it('persists a queued job and completes it through the materialization service', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-archive-materialize-job-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    let scheduled: (() => Promise<void>) | null = null;
    const materializeItem = vi.fn(async (request: { archiveItemId: string }) => ({
      object: 'run_archive_item_materialization' as const,
      generatedAt: '2026-05-19T12:01:00.000Z',
      status: 'materialized' as const,
      item: createGeneratedArtifactItem(request.archiveItemId),
      file: {
        id: 'artifact_1',
        name: 'first_pass_readout.json',
        localPath: '/tmp/first_pass_readout.json',
        remoteUrl: 'sandbox:/mnt/data/first_pass_readout.json',
        mimeType: 'application/json',
        size: 12,
      },
      message: 'Archive item materialized and indexed.',
    }));
    const service = createArchiveMaterializationJobService({
      materializationService: { materializeItem },
      generateId: () => 'ramj_test_1',
      now: sequenceNow([
        '2026-05-19T12:00:00.000Z',
        '2026-05-19T12:00:01.000Z',
        '2026-05-19T12:00:02.000Z',
      ]),
      schedule: (work) => {
        scheduled = work;
      },
    });

    const created = await service.createJob({ archiveItemId: 'generated-artifact:resp_1:artifact_1' });

    expect(created).toMatchObject({
      object: 'run_archive_materialization_job_create_result',
      reused: false,
      job: {
        id: 'ramj_test_1',
        status: 'queued',
        archiveItemId: 'generated-artifact:resp_1:artifact_1',
      },
    });

    const duplicate = await service.createJob({ archiveItemId: 'generated-artifact:resp_1:artifact_1' });
    expect(duplicate.reused).toBe(true);
    expect(duplicate.job.id).toBe('ramj_test_1');

    await scheduled?.();

    const completed = await service.readJob('ramj_test_1');
    expect(completed).toMatchObject({
      status: 'succeeded',
      attemptCount: 1,
      message: 'Archive item materialized and indexed.',
      result: {
        status: 'materialized',
      },
    });
    expect(materializeItem).toHaveBeenCalledWith({ archiveItemId: 'generated-artifact:resp_1:artifact_1' });
  });

  it('lists persisted jobs with status and archive item filters', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-archive-materialize-list-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const service = createArchiveMaterializationJobService({
      materializationService: {
        materializeItem: async (request) => ({
          object: 'run_archive_item_materialization' as const,
          generatedAt: '2026-05-19T12:11:00.000Z',
          status: request.archiveItemId.endsWith('skip') ? 'skipped' as const : 'already_materialized' as const,
          item: createGeneratedArtifactItem(request.archiveItemId),
          file: null,
          message: request.archiveItemId.endsWith('skip') ? 'Provider artifact materializer did not produce a local file.' : 'Archive item already has a readable local asset.',
        }),
      },
      generateId: sequenceId(['ramj_list_1', 'ramj_list_2', 'ramj_list_3']),
      now: sequenceNow([
        '2026-05-19T12:10:00.000Z',
        '2026-05-19T12:10:01.000Z',
        '2026-05-19T12:10:02.000Z',
        '2026-05-19T12:10:03.000Z',
        '2026-05-19T12:10:04.000Z',
        '2026-05-19T12:10:05.000Z',
        '2026-05-19T12:10:06.000Z',
      ]),
      schedule: () => {},
    });
    await service.createJob({ archiveItemId: 'generated-artifact:resp_1:artifact_1' });
    await service.createJob({ archiveItemId: 'generated-artifact:resp_2:artifact_skip' });
    await service.runJob('ramj_list_2');
    await service.createJob({ archiveItemId: 'generated-artifact:resp_3:artifact_3' });

    const active = await service.listJobs({ status: 'active' });
    expect(active.metrics).toMatchObject({ total: 2, active: 2, terminal: 0 });
    expect(active.jobs.map((job) => job.id)).toEqual(['ramj_list_3', 'ramj_list_1']);

    const skipped = await service.listJobs({ status: 'skipped' });
    expect(skipped.metrics).toMatchObject({ total: 1, active: 0, terminal: 1 });
    expect(skipped.jobs[0]?.archiveItemId).toBe('generated-artifact:resp_2:artifact_skip');

    const byItem = await service.listJobs({
      archiveItemId: 'generated-artifact:resp_1:artifact_1',
      limit: 1,
    });
    expect(byItem.limit).toBe(1);
    expect(byItem.jobs).toHaveLength(1);
    expect(byItem.jobs[0]?.id).toBe('ramj_list_1');
  });

  it('recovers active jobs after process interruption instead of leaving them running forever', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-archive-materialize-recover-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const service = createArchiveMaterializationJobService({
      materializationService: {
        materializeItem: async () => {
          throw new Error('should not run during recovery');
        },
      },
      generateId: () => 'ramj_recover_1',
      now: sequenceNow([
        '2026-05-19T12:05:00.000Z',
        '2026-05-19T12:06:00.000Z',
      ]),
      schedule: () => {},
    });
    await service.createJob({ archiveItemId: 'generated-artifact:resp_1:artifact_1' });

    const recovered = await service.recoverInterruptedJobs();

    expect(recovered).toBe(1);
    expect(await service.readJob('ramj_recover_1')).toMatchObject({
      status: 'failed',
      completedAt: '2026-05-19T12:06:00.000Z',
      error: {
        type: 'internal_error',
        message: expect.stringContaining('interrupted'),
      },
    });
  });
});

function sequenceNow(values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}

function sequenceId(values: string[]): () => string {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function createGeneratedArtifactItem(id: string): RunArchiveItem {
  return {
    id,
    object: 'run_archive_item',
    kind: 'generated_artifact',
    source: 'runtime',
    createdAt: '2026-05-19T12:00:00.000Z',
    updatedAt: '2026-05-19T12:01:00.000Z',
    title: 'first_pass_readout.json',
    status: 'succeeded',
    runtimeState: 'terminal',
    provider: 'chatgpt',
    runtimeProfile: 'wsl-chrome-3',
    browserProfile: 'wsl-chrome-3',
    projectId: 'Transcripts',
    boundIdentityKey: 'service-account:chatgpt:eric.cochran@soylei.com',
    agentId: 'pro-extended-chatgpt-soylei',
    teamId: null,
    responseId: 'resp_1',
    batchId: 'batch_1',
    batchIndex: 0,
    mediaGenerationId: null,
    providerConversationId: 'conv_1',
    providerConversationUrl: 'https://chatgpt.com/c/conv_1',
    artifactId: 'artifact_1',
    fileName: 'first_pass_readout.json',
    mimeType: 'application/json',
    localPath: '/tmp/first_pass_readout.json',
    uri: 'sandbox:/mnt/data/first_pass_readout.json',
    cacheKey: 'sha256:fixture',
    checksumSha256: 'fixture',
    fileAvailable: true,
    metadata: {},
    links: {},
  };
}
