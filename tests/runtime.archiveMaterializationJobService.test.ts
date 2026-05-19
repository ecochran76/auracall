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
