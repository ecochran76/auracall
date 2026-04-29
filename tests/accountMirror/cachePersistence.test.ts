import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { createAccountMirrorPersistence } from '../../src/accountMirror/cachePersistence.js';
import type { ProviderCacheContext } from '../../src/browser/providers/cache.js';
import { createCacheStore } from '../../src/browser/llmService/cache/store.js';

const baseRecord = {
  provider: 'chatgpt' as const,
  runtimeProfileId: 'default',
  browserProfileId: 'default',
  boundIdentityKey: 'Ecochran76@Gmail.com',
  detectedIdentityKey: 'ecochran76@gmail.com',
  detectedAccountLevel: 'Business',
  requestId: 'acctmirror_test',
  startedAt: '2026-04-29T12:00:00.000Z',
  completedAt: '2026-04-29T12:00:10.000Z',
  dispatcherKey: 'managed-profile:/tmp/default/chatgpt::service:chatgpt',
  dispatcherOperationId: 'op_123',
  metadataCounts: {
    projects: 2,
    conversations: 5,
    artifacts: 1,
    media: 0,
  },
  metadataEvidence: {
    identitySource: 'profile-menu',
    projectSampleIds: ['project_1'],
    conversationSampleIds: ['conv_1'],
    truncated: {
      projects: false,
      conversations: false,
      artifacts: false,
    },
  },
  manifests: {
    projects: [
      {
        id: 'project_1',
        name: 'Default Project',
        provider: 'chatgpt' as const,
      },
    ],
    conversations: [
      {
        id: 'conv_1',
        title: 'Mirror conversation',
        provider: 'chatgpt' as const,
        projectId: 'project_1',
      },
    ],
    artifacts: [
      {
        id: 'artifact_1',
        title: 'Generated report',
        kind: 'document' as const,
      },
    ],
    media: [
      {
        id: 'media_1',
        title: 'Generated image',
        mediaType: 'image' as const,
        provider: 'chatgpt',
      },
    ],
  },
};

describe('account mirror cache persistence', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('stores canonical mirror data by provider and bound identity in the existing cache store', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-mirror-cache-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const cacheStore = createCacheStore('dual');
    const persistence = createAccountMirrorPersistence({
      config: {
        browser: {
          cache: {
            store: 'dual',
          },
        },
      },
      cacheStore,
    });
    const context: ProviderCacheContext = {
      provider: 'chatgpt',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'ecochran76@gmail.com',
    };
    try {
      await persistence.writeSnapshot(baseRecord);

      const sameProfileState = await persistence.readState({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        boundIdentityKey: 'ecochran76@gmail.com',
      });
      expect(sameProfileState).toMatchObject({
        detectedIdentityKey: 'ecochran76@gmail.com',
        lastSuccessAtMs: Date.parse('2026-04-29T12:00:10.000Z'),
        lastRefreshRequestId: 'acctmirror_test',
        lastDispatcherOperationId: 'op_123',
        metadataCounts: {
          projects: 2,
          conversations: 5,
          artifacts: 1,
          media: 0,
        },
      });

      const alternateProfileState = await persistence.readState({
        provider: 'chatgpt',
        runtimeProfileId: 'wsl-chrome-2',
        browserProfileId: 'wsl-chrome-2',
        boundIdentityKey: 'ecochran76@gmail.com',
      });
      expect(alternateProfileState).toMatchObject({
        detectedIdentityKey: 'ecochran76@gmail.com',
        lastSuccessAtMs: Date.parse('2026-04-29T12:00:10.000Z'),
        metadataCounts: {
          projects: 2,
          conversations: 5,
          artifacts: 1,
          media: 0,
        },
      });
      expect(alternateProfileState?.lastRefreshRequestId).toBeUndefined();

      await expect(cacheStore.readProjects(context)).resolves.toMatchObject({
        items: [{ id: 'project_1', name: 'Default Project', provider: 'chatgpt' }],
      });
      await expect(cacheStore.readConversations(context)).resolves.toMatchObject({
        items: [{ id: 'conv_1', title: 'Mirror conversation', provider: 'chatgpt' }],
      });
      await expect(cacheStore.readAccountMirrorArtifacts(context)).resolves.toMatchObject({
        items: [{ id: 'artifact_1', title: 'Generated report', kind: 'document' }],
      });
      await expect(cacheStore.readAccountMirrorMedia(context)).resolves.toMatchObject({
        items: [{ id: 'media_1', title: 'Generated image', mediaType: 'image' }],
      });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
