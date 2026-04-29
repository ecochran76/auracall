import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { createAccountMirrorCatalogService } from '../../src/accountMirror/catalogService.js';
import { createAccountMirrorPersistence } from '../../src/accountMirror/cachePersistence.js';
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

describe('account mirror catalog service', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('reads cached mirror manifests without invoking browser refresh', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-mirror-catalog-'));
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
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
