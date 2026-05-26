import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { createAccountMirrorCatalogService } from '../../src/accountMirror/catalogService.js';
import {
  createAccountMirrorPersistence,
  type AccountMirrorPersistence,
} from '../../src/accountMirror/cachePersistence.js';
import { createCacheStore } from '../../src/browser/llmService/cache/store.js';

const config = {
  browser: {
    cache: {
      store: 'dual',
    },
  },
  runtimeProfiles: {
    default: {
      browserProfile: 'default',
      defaultService: 'chatgpt',
      services: {
        chatgpt: {
          identity: {
            email: 'ecochran76@gmail.com',
            accountLevel: 'Business',
          },
        },
      },
    },
  },
};

const movedBindingConfig = {
  browser: {
    cache: {
      store: 'dual',
    },
  },
  runtimeProfiles: {
    default: {
      browserProfile: 'stealth-rdp',
      defaultService: 'chatgpt',
      services: {
        chatgpt: {
          identity: {
            email: 'ecochran76@gmail.com',
            accountLevel: 'Business',
          },
        },
      },
    },
  },
};

describe('account mirror catalog service', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('reads cached mirror manifests without invoking browser refresh', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-mirror-catalog-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const cacheStore = createCacheStore('dual');
    const persistence = createAccountMirrorPersistence({
      config,
      cacheStore,
    });
    try {
      await persistence.writeSnapshot({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        boundIdentityKey: 'ecochran76@gmail.com',
        detectedIdentityKey: 'ecochran76@gmail.com',
        detectedAccountLevel: 'Business',
        requestId: 'acctmirror_test',
        startedAt: '2026-04-29T12:00:00.000Z',
        completedAt: '2026-04-29T12:00:10.000Z',
        dispatcherKey: 'managed-profile:/tmp/default/chatgpt::service:chatgpt',
        dispatcherOperationId: 'op_123',
        metadataCounts: {
          projects: 2,
          conversations: 2,
          artifacts: 1,
          files: 1,
          media: 1,
        },
        metadataEvidence: {
          identitySource: 'profile-menu',
          projectSampleIds: ['project_1'],
          conversationSampleIds: ['conv_1'],
          attachmentInventory: {
            nextProjectIndex: 2,
            nextConversationIndex: 1,
            detailReadLimit: 6,
            scannedProjects: 2,
            scannedConversations: 1,
          },
          truncated: {
            projects: false,
            conversations: false,
            artifacts: true,
          },
        },
        manifests: {
          projects: [
            { id: 'project_1', name: 'Project 1', provider: 'chatgpt' },
            { id: 'project_2', name: 'Project 2', provider: 'chatgpt' },
          ],
          conversations: [
            { id: 'conv_1', title: 'Conversation 1', provider: 'chatgpt', projectId: 'project_1' },
            { id: 'conv_2', title: 'Conversation 2', provider: 'chatgpt', projectId: 'project_2' },
          ],
          artifacts: [
            { id: 'artifact_1', title: 'Artifact 1', kind: 'document' },
          ],
          files: [
            {
              id: 'file_1',
              name: 'Upload.pdf',
              provider: 'chatgpt',
              source: 'conversation',
            },
          ],
          media: [
            { id: 'media_1', title: 'Image 1', mediaType: 'image', provider: 'chatgpt' },
          ],
        },
      });
      await cacheStore.writeConversationContext({
        provider: 'chatgpt',
        userConfig: config as never,
        listOptions: {},
        identityKey: 'ecochran76@gmail.com',
      }, 'conv_1', {
        provider: 'chatgpt',
        conversationId: 'conv_1',
        messages: [
          { role: 'user', text: 'Can you summarize this?' },
          { role: 'assistant', text: 'Yes. Here is the summary.' },
        ],
        artifacts: [
          {
            id: 'artifact_1',
            title: 'Artifact 1',
            kind: 'document',
          },
        ],
      });
      const service = createAccountMirrorCatalogService({
        config,
        persistence,
        now: () => new Date('2026-04-29T12:10:00.000Z'),
      });

      const catalog = await service.readCatalog({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        kind: 'all',
      });

      expect(catalog).toMatchObject({
        object: 'account_mirror_catalog',
        generatedAt: '2026-04-29T12:10:00.000Z',
        kind: 'all',
        limit: 50,
        metrics: {
          targets: 1,
          projects: 2,
          conversations: 2,
          artifacts: 1,
          files: 1,
          media: 1,
        },
        entries: [
          {
            provider: 'chatgpt',
            tenantKey: 'service-account:chatgpt:ecochran76@gmail.com',
            bindingKey: 'binding:chatgpt:default:default',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            boundIdentityKey: 'ecochran76@gmail.com',
            counts: {
              projects: 2,
              conversations: 2,
              artifacts: 1,
              files: 1,
              media: 1,
            },
            mirrorCompleteness: {
              state: 'in_progress',
              remainingDetailSurfaces: {
                projects: 0,
                conversations: 1,
                total: 1,
              },
            },
          },
        ],
      });
      expect(catalog.entries[0]?.manifests.projects).toEqual([
        { id: 'project_1', name: 'Project 1', provider: 'chatgpt' },
        { id: 'project_2', name: 'Project 2', provider: 'chatgpt' },
      ]);
      expect(catalog.entries[0]?.manifests.files).toEqual([
        { id: 'file_1', name: 'Upload.pdf', provider: 'chatgpt', source: 'conversation' },
      ]);
      expect(catalog.entries[0]?.manifests.conversations).toMatchObject([
        {
          id: 'conv_1',
          title: 'Conversation 1',
          provider: 'chatgpt',
          projectId: 'project_1',
          hasCachedTranscript: true,
          messageCount: 2,
          cachedFileCount: 0,
          cachedSourceCount: 0,
          cachedArtifactCount: 1,
          freshnessState: 'fresh',
          routeabilityState: 'unknown',
          conversationFreshness: {
            object: 'account_mirror_conversation_freshness',
            state: 'fresh',
            indexObservedAt: '2026-04-29T12:00:10.000Z',
            indexSource: 'project-conversations',
            indexRank: 0,
            conversationFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{32}$/),
            detailCompleteness: 'complete',
          },
        },
        {
          id: 'conv_2',
          title: 'Conversation 2',
          provider: 'chatgpt',
          projectId: 'project_2',
          freshnessState: 'partial',
          routeabilityState: 'unknown',
          conversationFreshness: {
            object: 'account_mirror_conversation_freshness',
            state: 'partial',
            indexObservedAt: '2026-04-29T12:00:10.000Z',
            indexSource: 'project-conversations',
            indexRank: 1,
            conversationFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{32}$/),
            detailCompleteness: 'partial',
          },
        },
      ]);

      const projectsOnly = await service.readCatalog({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        kind: 'projects',
        limit: 1,
      });
      expect(projectsOnly.metrics).toMatchObject({
        targets: 1,
        projects: 1,
        conversations: 0,
        artifacts: 0,
        files: 0,
        media: 0,
      });
      expect(projectsOnly.entries[0]?.manifests).toMatchObject({
        projects: [{ id: 'project_1' }],
        conversations: [],
        artifacts: [],
        files: [],
        media: [],
      });

      const item = await service.readItem({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        kind: 'files',
        itemId: 'file_1',
      });
      expect(item).toMatchObject({
        object: 'account_mirror_catalog_item',
        generatedAt: '2026-04-29T12:10:00.000Z',
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        boundIdentityKey: 'ecochran76@gmail.com',
        kind: 'files',
        itemId: 'file_1',
        item: {
          id: 'file_1',
          name: 'Upload.pdf',
        },
      });

      const conversationItem = await service.readItem({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        kind: 'conversations',
        itemId: 'conv_1',
      });
      expect(conversationItem).toMatchObject({
        object: 'account_mirror_catalog_item',
        generatedAt: '2026-04-29T12:10:00.000Z',
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        boundIdentityKey: 'ecochran76@gmail.com',
        kind: 'conversations',
        itemId: 'conv_1',
        item: {
          id: 'conv_1',
          title: 'Conversation 1',
          messages: [
            { role: 'user', text: 'Can you summarize this?' },
            { role: 'assistant', text: 'Yes. Here is the summary.' },
          ],
          artifacts: [
            {
              id: 'artifact_1',
              title: 'Artifact 1',
            },
          ],
        },
      });

      await expect(service.readItem({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        kind: 'files',
        itemId: 'missing_file',
      })).resolves.toBeNull();
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('keeps tenant catalog visible when the browser binding changes', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-mirror-catalog-binding-move-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const persistence = createAccountMirrorPersistence({
      config,
      cacheStore: createCacheStore('dual'),
    });
    try {
      await writeSingleConversationSnapshot(persistence, 'default');
      const service = createAccountMirrorCatalogService({
        config: movedBindingConfig,
        persistence,
        now: () => new Date('2026-05-25T12:00:00.000Z'),
      });

      const catalog = await service.readCatalog({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        kind: 'conversations',
      });

      expect(catalog.entries).toHaveLength(1);
      expect(catalog.entries[0]).toMatchObject({
        provider: 'chatgpt',
        tenantKey: 'service-account:chatgpt:ecochran76@gmail.com',
        bindingKey: 'binding:chatgpt:default:stealth-rdp',
        runtimeProfileId: 'default',
        browserProfileId: 'stealth-rdp',
        boundIdentityKey: 'ecochran76@gmail.com',
        status: 'eligible',
        counts: {
          conversations: 1,
        },
        manifests: {
          conversations: [
            expect.objectContaining({
              id: 'conv_binding_move',
              title: 'Binding move survives',
            }),
          ],
        },
      });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('keeps binding-scoped backoff state separate from tenant catalog visibility', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-mirror-catalog-binding-backoff-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const persistence = createAccountMirrorPersistence({
      config,
      cacheStore: createCacheStore('dual'),
    });
    try {
      await writeSingleConversationSnapshot(persistence, 'default');
      await persistence.writeState?.({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        boundIdentityKey: 'ecochran76@gmail.com',
        updatedAt: '2026-05-25T11:00:00.000Z',
        state: {
          detectedIdentityKey: 'ecochran76@gmail.com',
          lastFailureAtMs: Date.parse('2026-05-25T11:00:00.000Z'),
          consecutiveFailureCount: 4,
          providerCooldownUntilMs: Date.parse('2026-05-25T13:00:00.000Z'),
        },
      });
      const service = createAccountMirrorCatalogService({
        config: movedBindingConfig,
        persistence,
        now: () => new Date('2026-05-25T12:00:00.000Z'),
      });

      const catalog = await service.readCatalog({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        kind: 'conversations',
      });

      expect(catalog.entries[0]).toMatchObject({
        tenantKey: 'service-account:chatgpt:ecochran76@gmail.com',
        bindingKey: 'binding:chatgpt:default:stealth-rdp',
        status: 'eligible',
        reason: 'eligible',
        counts: {
          conversations: 1,
        },
      });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('projects per-conversation asset counts from account-mirror manifests', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-mirror-catalog-manifest-counts-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const persistence = createAccountMirrorPersistence({
      config,
      cacheStore: createCacheStore('dual'),
    });
    try {
      await persistence.writeSnapshot({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        boundIdentityKey: 'ecochran76@gmail.com',
        detectedIdentityKey: 'ecochran76@gmail.com',
        detectedAccountLevel: 'Business',
        requestId: 'acctmirror_manifest_counts',
        startedAt: '2026-05-23T20:00:00.000Z',
        completedAt: '2026-05-23T20:00:10.000Z',
        dispatcherKey: 'managed-profile:/tmp/default/chatgpt::service:chatgpt',
        dispatcherOperationId: 'op_manifest_counts',
        metadataCounts: {
          projects: 0,
          conversations: 1,
          artifacts: 1,
          files: 1,
          media: 1,
        },
        metadataEvidence: {
          identitySource: 'profile-menu',
          projectSampleIds: [],
          conversationSampleIds: ['conv_manifest_counts'],
          truncated: {
            projects: false,
            conversations: false,
            artifacts: false,
          },
        },
        manifests: {
          projects: [],
          conversations: [
            { id: 'conv_manifest_counts', title: 'Manifest-backed assets', provider: 'chatgpt' },
          ],
          artifacts: [
            {
              id: 'artifact_manifest_counts',
              title: 'Generated image',
              kind: 'image',
              uri: 'https://provider.example/image.png',
              metadata: {
                conversationId: 'conv_manifest_counts',
              },
            },
          ],
          files: [
            {
              id: 'file_manifest_counts',
              name: 'Source.pdf',
              provider: 'chatgpt',
              source: 'conversation',
              metadata: {
                conversationId: 'conv_manifest_counts',
              },
            },
          ],
          media: [
            {
              id: 'media_manifest_counts',
              title: 'Generated image',
              mediaType: 'image',
              provider: 'chatgpt',
              conversationId: 'conv_manifest_counts',
            },
          ],
        },
      });
      const service = createAccountMirrorCatalogService({
        config,
        persistence,
        now: () => new Date('2026-05-23T20:10:00.000Z'),
      });

      const catalog = await service.readCatalog({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        kind: 'conversations',
      });

      expect(catalog.entries[0]?.manifests.conversations).toMatchObject([
        {
          id: 'conv_manifest_counts',
          cachedArtifactCount: 1,
          cachedFileCount: 1,
          cachedMediaCount: 1,
          freshnessState: 'missing_assets',
          conversationFreshness: {
            assetCounts: {
              known: 3,
              missingLocal: 1,
            },
          },
        },
      ]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});

async function writeSingleConversationSnapshot(
  persistence: AccountMirrorPersistence,
  browserProfileId: string,
): Promise<void> {
  await persistence.writeSnapshot({
    provider: 'chatgpt',
    runtimeProfileId: 'default',
    browserProfileId,
    boundIdentityKey: 'ecochran76@gmail.com',
    detectedIdentityKey: 'ecochran76@gmail.com',
    detectedAccountLevel: 'Business',
    requestId: 'acctmirror_binding_move',
    startedAt: '2026-05-24T00:00:00.000Z',
    completedAt: '2026-05-24T00:00:05.000Z',
    dispatcherKey: 'managed-profile:/tmp/default/chatgpt::service:chatgpt',
    dispatcherOperationId: 'op_binding_move',
    metadataCounts: {
      projects: 0,
      conversations: 1,
      artifacts: 0,
      files: 0,
      media: 0,
    },
    metadataEvidence: {
      identitySource: 'profile-menu',
      projectSampleIds: [],
      conversationSampleIds: ['conv_binding_move'],
      truncated: {
        projects: false,
        conversations: false,
        artifacts: false,
      },
    },
    manifests: {
      projects: [],
      conversations: [
        { id: 'conv_binding_move', title: 'Binding move survives', provider: 'chatgpt' },
      ],
      artifacts: [],
      files: [],
      media: [],
    },
  });
}
