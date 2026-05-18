import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import type { FileRef } from '../src/browser/providers/domain.js';
import { createRunArchiveIndexStore } from '../src/runtime/archiveIndexStore.js';
import {
  createArchiveMaterializationService,
} from '../src/runtime/archiveMaterializationService.js';
import type { RunArchiveItem, RunArchiveService } from '../src/runtime/archiveService.js';

describe('archive materialization service', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  it('downloads a provider generated artifact and indexes the local asset', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-archive-materialize-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const item = createGeneratedArtifactItem();
    const indexStore = createRunArchiveIndexStore();
    const service = createArchiveMaterializationService({
      config: {},
      indexStore,
      now: () => new Date('2026-05-18T18:00:00.000Z'),
      runArchiveService: readOnlyArchiveService(item),
      materializeConversationArtifact: async (input): Promise<FileRef> => {
        expect(input.provider).toBe('chatgpt');
        expect(input.conversationId).toBe('conv_1');
        expect(input.artifact.id).toBe('sandbox:/mnt/data/first_pass_readout.json');
        expect(input.artifact.kind).toBe('download');
        expect((input.config as Record<string, unknown>).defaultRuntimeProfile).toBe('wsl-chrome-3');
        const localPath = path.join(input.destDir, 'first_pass_readout.json');
        await fs.writeFile(localPath, '{"ok":true}\n', 'utf8');
        return {
          id: input.artifact.id,
          name: 'first_pass_readout.json',
          provider: 'chatgpt',
          source: 'conversation',
          localPath,
          remoteUrl: input.artifact.uri,
          mimeType: 'application/json',
          size: 12,
          metadata: {
            materialization: 'fixture-download',
          },
        };
      },
    });

    const result = await service.materializeItem({ archiveItemId: item.id });

    expect(result.status).toBe('materialized');
    expect(result.item.fileAvailable).toBe(true);
    expect(result.item.localPath).toContain('first_pass_readout.json');
    expect(result.item.links.asset).toContain('/v1/archive/items/b64/');
    expect(result.file?.mimeType).toBe('application/json');
    expect(await fs.readFile(result.item.localPath ?? '', 'utf8')).toBe('{"ok":true}\n');
    const indexed = await indexStore.readItem(item.id);
    expect(indexed?.localPath).toBe(result.item.localPath);
    expect(indexed?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns an already materialized result without invoking the provider', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-archive-materialized-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const localPath = path.join(homeDir, 'already.json');
    await fs.writeFile(localPath, '{}\n', 'utf8');
    const item = {
      ...createGeneratedArtifactItem(),
      fileAvailable: true,
      localPath,
    };
    const service = createArchiveMaterializationService({
      config: {},
      now: () => new Date('2026-05-18T18:05:00.000Z'),
      runArchiveService: readOnlyArchiveService(item),
      materializeConversationArtifact: async () => {
        throw new Error('provider should not be called');
      },
    });

    const result = await service.materializeItem({ archiveItemId: item.id });

    expect(result.status).toBe('already_materialized');
    expect(result.file?.localPath).toBe(localPath);
  });
});

function createGeneratedArtifactItem(): RunArchiveItem {
  return {
    id: 'generated-artifact:resp_1:artifact_1',
    object: 'run_archive_item',
    kind: 'generated_artifact',
    source: 'runtime',
    createdAt: '2026-05-18T17:50:00.000Z',
    updatedAt: '2026-05-18T17:50:00.000Z',
    title: 'first_pass_readout.json',
    status: 'succeeded',
    provider: 'chatgpt',
    runtimeProfile: 'wsl-chrome-3',
    browserProfile: 'wsl-chrome-3',
    projectId: 'project_1',
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
    localPath: null,
    uri: 'sandbox:/mnt/data/first_pass_readout.json',
    cacheKey: null,
    checksumSha256: null,
    fileAvailable: false,
    metadata: {
      providerArtifactId: 'sandbox:/mnt/data/first_pass_readout.json',
      providerArtifactKind: 'download',
    },
    links: {
      response: '/v1/responses/resp_1',
    },
  };
}

function readOnlyArchiveService(item: RunArchiveItem): RunArchiveService {
  return {
    listItems: async () => {
      throw new Error('not implemented');
    },
    readItem: async (id) => (id === item.id
      ? {
          object: 'run_archive_item_detail',
          generatedAt: '2026-05-18T18:00:00.000Z',
          item,
        }
      : null),
    readAsset: async () => null,
    lookupAsset: async () => {
      throw new Error('not implemented');
    },
    attachEvidence: async () => {
      throw new Error('not implemented');
    },
    upsertResponseItems: async () => {
      throw new Error('not implemented');
    },
    upsertBatchItems: async () => {
      throw new Error('not implemented');
    },
    upsertMediaGenerationItems: async () => {
      throw new Error('not implemented');
    },
    backfillIndex: async () => {
      throw new Error('not implemented');
    },
  };
}
