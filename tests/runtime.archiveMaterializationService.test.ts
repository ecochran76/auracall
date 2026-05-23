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
        expect((input.config as Record<string, unknown>).auracallProfile).toBe('wsl-chrome-3');
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

  it('normalizes sparse ChatGPT sandbox archive ids before provider materialization', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-archive-materialize-sparse-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const item = {
      ...createGeneratedArtifactItem(),
      id: 'generated-artifact:resp_1:assist-2:download:sandbox:/mnt/data/first_pass_readout.json',
      artifactId: 'assist-2:download:sandbox:/mnt/data/first_pass_readout.json',
      metadata: {
        artifactType: 'generated',
        disposition: 'inline',
      },
    };
    const service = createArchiveMaterializationService({
      config: {},
      now: () => new Date('2026-05-18T18:03:00.000Z'),
      runArchiveService: readOnlyArchiveService(item),
      materializeConversationArtifact: async (input): Promise<FileRef> => {
        expect(input.artifact).toMatchObject({
          id: 'sandbox:/mnt/data/first_pass_readout.json',
          uri: 'sandbox:/mnt/data/first_pass_readout.json',
          kind: 'download',
          messageId: 'assist-2',
          metadata: expect.objectContaining({
            providerArtifactId: 'sandbox:/mnt/data/first_pass_readout.json',
            originalArchiveArtifactId: 'assist-2:download:sandbox:/mnt/data/first_pass_readout.json',
            messageId: 'assist-2',
          }),
        });
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
    expect(result.item.metadata).toMatchObject({
      materialization: expect.objectContaining({
        status: 'materialized',
      }),
    });
  });

  it('links a duplicate archive item to an existing materialized sibling asset', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-archive-materialize-reuse-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const localPath = path.join(homeDir, 'first_pass_readout.json');
    await fs.writeFile(localPath, '{"reuse":true}\n', 'utf8');
    const item = {
      ...createGeneratedArtifactItem(),
      id: 'generated-artifact:resp_1:assist-1:download:sandbox:/mnt/data/first_pass_readout.json',
      artifactId: 'assist-1:download:sandbox:/mnt/data/first_pass_readout.json',
      localPath: null,
      fileAvailable: false,
      checksumSha256: null,
      cacheKey: null,
      metadata: {
        artifactType: 'generated',
      },
    };
    const sibling = {
      ...createGeneratedArtifactItem(),
      id: 'generated-artifact:resp_1:assist-2:download:sandbox:/mnt/data/first_pass_readout.json',
      artifactId: 'assist-2:download:sandbox:/mnt/data/first_pass_readout.json',
      localPath,
      fileAvailable: true,
      checksumSha256: 'abc123',
      cacheKey: 'sha256:abc123',
      metadata: {
        fileSizeBytes: Buffer.byteLength('{"reuse":true}\n'),
      },
    };
    const indexStore = createRunArchiveIndexStore();
    const service = createArchiveMaterializationService({
      config: {},
      indexStore,
      now: () => new Date('2026-05-18T18:04:00.000Z'),
      runArchiveService: archiveServiceWithItems(item, [sibling]),
      materializeConversationArtifact: async () => {
        throw new Error('provider should not be called when matching archive asset exists');
      },
    });

    const result = await service.materializeItem({ archiveItemId: item.id });

    expect(result.status).toBe('materialized');
    expect(result.file).toMatchObject({
      localPath,
      remoteUrl: 'sandbox:/mnt/data/first_pass_readout.json',
    });
    expect(result.item).toMatchObject({
      localPath,
      fileAvailable: true,
      metadata: expect.objectContaining({
        sourceArchiveItemId: sibling.id,
        materialization: expect.objectContaining({
          status: 'materialized',
          method: 'existing-archive-asset',
        }),
      }),
    });
    await expect(indexStore.readItem(item.id)).resolves.toMatchObject({
      localPath,
      fileAvailable: true,
    });
  });

  it('reindexes an existing file from the item materialized archive directory', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-archive-materialize-existing-dir-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const item = {
      ...createGeneratedArtifactItem(),
      id: 'generated-artifact:resp_1:assist-1:download:sandbox:/mnt/data/first_pass_readout.json',
      artifactId: 'assist-1:download:sandbox:/mnt/data/first_pass_readout.json',
      localPath: null,
      fileAvailable: null,
      checksumSha256: null,
      cacheKey: null,
      metadata: {
        artifactType: 'generated',
      },
    };
    const localPath = path.join(
      homeDir,
      'runtime',
      'archive',
      'materialized',
      sanitizeArchiveItemPathSegment(item.id),
      'first_pass_readout.json',
    );
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, '{"existing":true}\n', 'utf8');
    const indexStore = createRunArchiveIndexStore();
    const service = createArchiveMaterializationService({
      config: {},
      indexStore,
      now: () => new Date('2026-05-18T18:04:30.000Z'),
      runArchiveService: readOnlyArchiveService(item),
      materializeConversationArtifact: async () => {
        throw new Error('provider should not be called when the item materialized directory has a file');
      },
    });

    const result = await service.materializeItem({ archiveItemId: item.id });

    expect(result.status).toBe('materialized');
    expect(result.file).toMatchObject({
      name: 'first_pass_readout.json',
      localPath,
      mimeType: 'application/json',
    });
    expect(result.item).toMatchObject({
      localPath,
      fileAvailable: true,
      metadata: expect.objectContaining({
        sourceArchiveItemId: item.id,
        materialization: expect.objectContaining({
          status: 'materialized',
          method: 'existing-materialized-directory',
        }),
      }),
    });
    await expect(indexStore.readItem(item.id)).resolves.toMatchObject({
      localPath,
      fileAvailable: true,
      checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('links an archive item to an existing provider conversation attachment cache file', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-archive-materialize-conversation-cache-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const item = {
      ...createGeneratedArtifactItem(),
      id: 'generated-artifact:resp_1:user-message:download:sandbox:/mnt/data/first_pass_readout.json',
      artifactId: 'user-message:download:sandbox:/mnt/data/first_pass_readout.json',
      localPath: null,
      fileAvailable: false,
      checksumSha256: null,
      cacheKey: null,
      metadata: {
        artifactType: 'generated',
      },
    };
    const localPath = path.join(
      homeDir,
      'cache',
      'providers',
      'chatgpt',
      'eric.cochran@soylei.com',
      'conversation-attachments',
      item.providerConversationId ?? '',
      'files',
      'download-dom-turn-0',
      'first_pass_readout.json',
    );
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, '{"cached":true}\n', 'utf8');
    await fs.writeFile(
      path.join(
        homeDir,
        'cache',
        'providers',
        'chatgpt',
        'eric.cochran@soylei.com',
        'conversation-attachments',
        item.providerConversationId ?? '',
        'artifact-fetch-manifest.json',
      ),
      JSON.stringify({
        provider: 'chatgpt',
        conversationId: item.providerConversationId,
        projectId: item.projectId,
        artifactCount: 3,
        materializedCount: 1,
        entries: [
          {
            artifactId: 'download-dom:assistant-turn:0',
            title: 'first_pass_readout.json',
            kind: 'download',
            uri: 'chatgpt://download-button/assistant-turn/0',
            status: 'materialized',
            fileId: 'download-dom:assistant-turn:0',
            fileName: 'first_pass_readout.json',
            localPath,
            remoteUrl: 'https://chatgpt.com/backend-api/estuary/content?id=file_1',
            mimeType: 'application/json',
            size: Buffer.byteLength('{"cached":true}\n'),
          },
        ],
      }),
      'utf8',
    );
    const indexStore = createRunArchiveIndexStore();
    const service = createArchiveMaterializationService({
      config: {},
      indexStore,
      now: () => new Date('2026-05-18T18:04:45.000Z'),
      runArchiveService: readOnlyArchiveService(item),
      materializeConversationArtifact: async () => {
        throw new Error('provider should not be called when the conversation attachment cache has a matching file');
      },
    });

    const result = await service.materializeItem({ archiveItemId: item.id });

    expect(result.status).toBe('materialized');
    expect(result.file).toMatchObject({
      id: 'download-dom:assistant-turn:0',
      name: 'first_pass_readout.json',
      localPath,
      remoteUrl: 'https://chatgpt.com/backend-api/estuary/content?id=file_1',
      mimeType: 'application/json',
    });
    expect(result.item).toMatchObject({
      localPath,
      fileAvailable: true,
      metadata: expect.objectContaining({
        sourceArtifactFetchManifest: true,
        sourceFileId: 'download-dom:assistant-turn:0',
        materialization: expect.objectContaining({
          status: 'materialized',
          method: 'cached-conversation-attachment',
        }),
      }),
    });
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

  it('force-refreshes a readable local artifact through the provider materializer', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-archive-materialize-force-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const stalePath = path.join(homeDir, 'stale.json');
    await fs.writeFile(stalePath, '{"stale":true}\n', 'utf8');
    const item = {
      ...createGeneratedArtifactItem(),
      fileAvailable: true,
      localPath: stalePath,
      cacheKey: 'sha256:stale',
      checksumSha256: 'stale',
    };
    const service = createArchiveMaterializationService({
      config: {},
      now: () => new Date('2026-05-18T18:06:00.000Z'),
      runArchiveService: readOnlyArchiveService(item),
      materializeConversationArtifact: async (input): Promise<FileRef> => {
        const localPath = path.join(input.destDir, 'fresh.json');
        await fs.writeFile(localPath, '{"fresh":true}\n', 'utf8');
        return {
          id: input.artifact.id,
          name: 'fresh.json',
          provider: 'chatgpt',
          source: 'conversation',
          localPath,
          remoteUrl: input.artifact.uri,
          mimeType: 'application/json',
          size: 15,
          metadata: {
            materialization: 'fixture-force-download',
          },
        };
      },
    });

    const result = await service.materializeItem({ archiveItemId: item.id, force: true });

    expect(result.status).toBe('materialized');
    expect(result.item.localPath).toContain('fresh.json');
    expect(result.item.localPath).not.toBe(stalePath);
    expect(result.item.metadata.materialization).toMatchObject({
      status: 'materialized',
      method: 'fixture-force-download',
    });
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

function sanitizeArchiveItemPathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180) || 'archive-item';
}

function readOnlyArchiveService(item: RunArchiveItem): RunArchiveService {
  return archiveServiceWithItems(item, []);
}

function archiveServiceWithItems(item: RunArchiveItem, items: RunArchiveItem[]): RunArchiveService {
  return {
    listItems: async () => ({
      object: 'run_archive',
      generatedAt: '2026-05-18T18:00:00.000Z',
      kind: 'generated_artifact',
      limit: 1000,
      items,
      metrics: {
        total: items.length,
        byKind: {
          response: 0,
          response_batch: 0,
          team_run: 0,
          media_generation: 0,
          upload: 0,
          generated_artifact: items.length,
          provider_conversation: 0,
          evidence: 0,
        },
      },
    }),
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
