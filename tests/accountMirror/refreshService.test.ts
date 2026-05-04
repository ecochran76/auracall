import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createBrowserOperationDispatcher } from '../../packages/browser-service/src/service/operationDispatcher.js';
import {
  type AccountMirrorRefreshError,
  createAccountMirrorRefreshService,
} from '../../src/accountMirror/refreshService.js';
import {
  AccountMirrorIdentityMismatchError,
  type AccountMirrorMetadataCollectorInput,
  type AccountMirrorMetadataCollectorResult,
} from '../../src/accountMirror/chatgptMetadataCollector.js';
import { createAccountMirrorStatusRegistry } from '../../src/accountMirror/statusRegistry.js';
import type { AccountMirrorPersistence } from '../../src/accountMirror/cachePersistence.js';
import {
  clearBrowserOperationQueueObservationsForTest,
  recordBrowserOperationQueueObservation,
} from '../../src/browser/operationQueueObservations.js';

const config = {
  model: 'gpt-5.2',
  browser: {},
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
          projects: [{ id: 'project_1' }],
          conversations: [{ id: 'conv_1' }, { id: 'conv_2' }],
          artifacts: [{ id: 'artifact_1' }],
        },
      },
    },
    'wsl-chrome-2': {
      browserProfile: 'wsl-chrome-2',
      defaultService: 'chatgpt',
      services: {
        chatgpt: {
          identity: {
            email: 'consult@polymerconsultinggroup.com',
            accountLevel: 'Pro',
          },
        },
      },
    },
  },
};

function createNoopPersistence(): AccountMirrorPersistence {
  return {
    writeSnapshot: vi.fn(async () => {}),
    readCatalog: vi.fn(async () => null),
    readState: vi.fn(async () => null),
    readConversationContext: vi.fn(async () => null),
  };
}

describe('account mirror refresh service', () => {
  beforeEach(() => {
    clearBrowserOperationQueueObservationsForTest();
  });

  test('runs an explicit default ChatGPT refresh through the browser operation dispatcher', async () => {
    const metadataCollector = {
      collect: vi.fn(async () => ({
        detectedIdentityKey: 'ecochran76@gmail.com',
        detectedAccountLevel: 'Business',
        metadataCounts: {
          projects: 1,
          conversations: 2,
          artifacts: 1,
          files: 0,
          media: 0,
        },
        manifests: {
          projects: [{ id: 'project_1', name: 'Project 1', provider: 'chatgpt' as const }],
          conversations: [
            { id: 'conv_1', title: 'One', provider: 'chatgpt' as const },
            { id: 'conv_2', title: 'Two', provider: 'chatgpt' as const },
          ],
          artifacts: [{ id: 'artifact_1', title: 'Artifact 1' }],
          files: [],
          media: [],
        },
        evidence: {
          identitySource: 'profile-menu',
          projectSampleIds: ['project_1'],
          conversationSampleIds: ['conv_1', 'conv_2'],
          truncated: {
            projects: false,
            conversations: false,
            artifacts: false,
          },
        },
      })),
    };
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });
    const persistence = createNoopPersistence();
    const service = createAccountMirrorRefreshService({
      config,
      registry,
      dispatcher: createBrowserOperationDispatcher({
        now: () => new Date('2026-04-29T12:00:00.000Z'),
      }),
      metadataCollector,
      persistence,
      now: () => new Date('2026-04-29T12:00:00.000Z'),
      generateRequestId: () => 'acctmirror_test',
    });

    const result = await service.requestRefresh({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      explicitRefresh: true,
    });

    expect(result).toMatchObject({
      object: 'account_mirror_refresh',
      requestId: 'acctmirror_test',
      status: 'completed',
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      metadataCounts: {
        projects: 1,
        conversations: 2,
        artifacts: 1,
        files: 0,
        media: 0,
      },
      metadataEvidence: {
        identitySource: 'profile-menu',
        projectSampleIds: ['project_1'],
        conversationSampleIds: ['conv_1', 'conv_2'],
        truncated: {
          projects: false,
          conversations: false,
          artifacts: false,
        },
      },
      mirrorCompleteness: {
        state: 'complete',
        remainingDetailSurfaces: {
          projects: 0,
          conversations: 0,
          total: 0,
        },
      },
      detectedIdentityKey: 'ecochran76@gmail.com',
      detectedAccountLevel: 'Business',
      dispatcher: {
        key: expect.stringContaining('service:chatgpt'),
        operationId: expect.any(String),
        blockedBy: null,
      },
    });
    expect(metadataCollector.collect).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      expectedIdentityKey: 'ecochran76@gmail.com',
      shouldYield: expect.any(Function),
      limits: {
        maxPageReadsPerCycle: 12,
        maxConversationRowsPerCycle: 250,
        maxArtifactRowsPerCycle: 80,
      },
      previousEvidence: null,
    });
    const collectCalls = metadataCollector.collect.mock.calls as unknown as [AccountMirrorMetadataCollectorInput][];
    const collectInput = collectCalls[0]?.[0];
    expect(await Promise.resolve(collectInput?.shouldYield?.())).toBe(false);
    const dispatcherKey = result.dispatcher.key ?? 'missing-dispatcher-key';
    const dispatcherOperationId = result.dispatcher.operationId ?? 'missing-operation-id';
    recordBrowserOperationQueueObservation({
      event: 'queued',
      key: dispatcherKey,
      requested: {
        managedProfileDir: '/tmp/auracall-default-chatgpt',
        serviceTarget: 'chatgpt',
        kind: 'browser-execution',
        operationClass: 'exclusive-probe',
        ownerCommand: 'account-mirror-refresh:chatgpt:default',
      },
      blockedBy: {
        id: dispatcherOperationId,
        key: dispatcherKey,
        managedProfileDir: '/tmp/auracall-default-chatgpt',
        serviceTarget: 'chatgpt',
        kind: 'browser-execution',
        operationClass: 'exclusive-mutating',
        ownerPid: process.pid,
        ownerCommand: 'account-mirror-refresh:chatgpt:default',
        startedAt: '2026-04-29T12:00:00.000Z',
        updatedAt: '2026-04-29T12:00:00.001Z',
      },
      at: '2026-04-29T12:00:00.001Z',
    });
    expect(await Promise.resolve(collectInput?.shouldYield?.())).toBe(false);
    recordBrowserOperationQueueObservation({
      event: 'queued',
      key: dispatcherKey,
      requested: {
        managedProfileDir: '/tmp/auracall-default-chatgpt',
        serviceTarget: 'chatgpt',
        kind: 'browser-execution',
        operationClass: 'exclusive-mutating',
        ownerCommand: 'browser-execution',
      },
      blockedBy: {
        id: dispatcherOperationId,
        key: dispatcherKey,
        managedProfileDir: '/tmp/auracall-default-chatgpt',
        serviceTarget: 'chatgpt',
        kind: 'browser-execution',
        operationClass: 'exclusive-mutating',
        ownerPid: process.pid,
        ownerCommand: 'account-mirror-refresh:chatgpt:default',
        startedAt: '2026-04-29T12:00:00.000Z',
        updatedAt: '2026-04-29T12:00:00.002Z',
      },
      at: '2026-04-29T12:00:00.002Z',
    });
    expect(await Promise.resolve(collectInput?.shouldYield?.())).toBe(true);
    expect(persistence.writeSnapshot).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      boundIdentityKey: 'ecochran76@gmail.com',
      detectedIdentityKey: 'ecochran76@gmail.com',
      detectedAccountLevel: 'Business',
      requestId: 'acctmirror_test',
      startedAt: '2026-04-29T12:00:00.000Z',
      completedAt: '2026-04-29T12:00:00.000Z',
      dispatcherKey: expect.stringContaining('service:chatgpt'),
      dispatcherOperationId: expect.any(String),
      metadataCounts: {
        projects: 1,
        conversations: 2,
        artifacts: 1,
        files: 0,
        media: 0,
      },
      metadataEvidence: expect.objectContaining({
        identitySource: 'profile-menu',
      }),
      manifests: {
        projects: [{ id: 'project_1', name: 'Project 1', provider: 'chatgpt' }],
        conversations: [
          { id: 'conv_1', title: 'One', provider: 'chatgpt' },
          { id: 'conv_2', title: 'Two', provider: 'chatgpt' },
        ],
        artifacts: [{ id: 'artifact_1', title: 'Artifact 1' }],
        files: [],
        media: [],
      },
    });
    expect(result.mirrorStatus.entries[0]).toMatchObject({
      detectedIdentityKey: 'ecochran76@gmail.com',
      lastSuccessAt: '2026-04-29T12:00:00.000Z',
      metadataEvidence: expect.objectContaining({
        identitySource: 'profile-menu',
        projectSampleIds: ['project_1'],
      }),
      mirrorState: {
        queued: false,
        running: false,
        lastRefreshRequestId: 'acctmirror_test',
        lastDispatcherKey: expect.stringContaining('service:chatgpt'),
        lastDispatcherOperationId: expect.any(String),
        lastDispatcherBlockedBy: null,
      },
    });
  });

  test('passes the persisted attachment cursor and merges new manifest rows with the cached catalog', async () => {
    const previousEvidence = {
      identitySource: 'profile-menu',
      projectSampleIds: ['project_1'],
      conversationSampleIds: ['conv_1'],
      attachmentInventory: {
        nextProjectIndex: 1,
        nextConversationIndex: 0,
        detailReadLimit: 2,
        scannedProjects: 1,
        scannedConversations: 0,
        yielded: false,
        yieldCause: null,
      },
      truncated: {
        projects: false,
        conversations: false,
        artifacts: true,
      },
    };
    const metadataCollector = {
      collect: vi.fn(async () => ({
        detectedIdentityKey: 'ecochran76@gmail.com',
        detectedAccountLevel: 'Business',
        metadataCounts: {
          projects: 1,
          conversations: 1,
          artifacts: 0,
          files: 1,
          media: 0,
        },
        manifests: {
          projects: [{ id: 'project_1', name: 'Project 1', provider: 'chatgpt' as const }],
          conversations: [{ id: 'conv_1', title: 'One', provider: 'chatgpt' as const }],
          artifacts: [],
          files: [{ id: 'file_2', name: 'Second upload.pdf', provider: 'chatgpt' as const, source: 'conversation' as const }],
          media: [],
        },
        evidence: previousEvidence,
      })),
    };
    const persistence: AccountMirrorPersistence = {
      writeSnapshot: vi.fn(async () => {}),
      readCatalog: vi.fn(async () => ({
        projects: [{ id: 'project_1', name: 'Project 1', provider: 'chatgpt' as const }],
        conversations: [{ id: 'conv_1', title: 'One', provider: 'chatgpt' as const }],
        artifacts: [],
        files: [{ id: 'file_1', name: 'First upload.pdf', provider: 'chatgpt' as const, source: 'project' as const }],
        media: [],
      })),
      readState: vi.fn(async () => ({
        detectedIdentityKey: 'ecochran76@gmail.com',
        metadataCounts: {
          projects: 1,
          conversations: 1,
          artifacts: 0,
          files: 1,
          media: 0,
        },
        metadataEvidence: previousEvidence,
      })),
      readConversationContext: vi.fn(async () => null),
    };
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-04-29T12:00:00.000Z'),
      readPersistentState: persistence.readState,
    });
    const service = createAccountMirrorRefreshService({
      config,
      registry,
      dispatcher: createBrowserOperationDispatcher({
        now: () => new Date('2026-04-29T12:00:00.000Z'),
      }),
      metadataCollector,
      persistence,
      now: () => new Date('2026-04-29T12:00:00.000Z'),
      generateRequestId: () => 'acctmirror_cursor',
    });

    const result = await service.requestRefresh({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      explicitRefresh: true,
    });

    expect(metadataCollector.collect).toHaveBeenCalledWith(expect.objectContaining({
      previousEvidence,
    }));
    expect(result.metadataCounts.files).toBe(2);
    expect(result.mirrorCompleteness).toMatchObject({
      state: 'in_progress',
      remainingDetailSurfaces: {
        projects: 0,
        conversations: 1,
        total: 1,
      },
    });
    expect(persistence.writeSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      metadataCounts: expect.objectContaining({ files: 2 }),
      metadataEvidence: expect.objectContaining({ attachmentInventory: previousEvidence.attachmentInventory }),
      manifests: expect.objectContaining({
        files: [
          { id: 'file_1', name: 'First upload.pdf', provider: 'chatgpt', source: 'project' },
          { id: 'file_2', name: 'Second upload.pdf', provider: 'chatgpt', source: 'conversation' },
        ],
      }),
    }));
  });

  test('runs a configured non-default ChatGPT runtime profile refresh', async () => {
    const metadataCollector = {
      collect: vi.fn(async () => ({
        detectedIdentityKey: 'consult@polymerconsultinggroup.com',
        detectedAccountLevel: 'Pro',
        metadataCounts: {
          projects: 0,
          conversations: 1,
          artifacts: 0,
          files: 0,
          media: 0,
        },
        manifests: {
          projects: [],
          conversations: [{ id: 'consult_conv_1', title: 'Consult conversation', provider: 'chatgpt' as const }],
          artifacts: [],
          files: [],
          media: [],
        },
        evidence: {
          identitySource: 'auth-session',
          projectSampleIds: [],
          conversationSampleIds: ['consult_conv_1'],
          truncated: {
            projects: false,
            conversations: false,
            artifacts: false,
          },
        },
      })),
    };
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-05-02T16:10:00.000Z'),
    });
    const persistence = createNoopPersistence();
    const service = createAccountMirrorRefreshService({
      config,
      registry,
      dispatcher: createBrowserOperationDispatcher({
        now: () => new Date('2026-05-02T16:10:00.000Z'),
      }),
      metadataCollector,
      persistence,
      now: () => new Date('2026-05-02T16:10:00.000Z'),
      generateRequestId: () => 'acctmirror_consult',
    });

    const result = await service.requestRefresh({
      provider: 'chatgpt',
      runtimeProfileId: 'wsl-chrome-2',
      explicitRefresh: true,
    });

    expect(metadataCollector.collect).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'chatgpt',
      runtimeProfileId: 'wsl-chrome-2',
      expectedIdentityKey: 'consult@polymerconsultinggroup.com',
    }));
    expect(result).toMatchObject({
      requestId: 'acctmirror_consult',
      provider: 'chatgpt',
      runtimeProfileId: 'wsl-chrome-2',
      browserProfileId: 'wsl-chrome-2',
      detectedIdentityKey: 'consult@polymerconsultinggroup.com',
      detectedAccountLevel: 'Pro',
      metadataCounts: {
        conversations: 1,
      },
      dispatcher: {
        key: expect.stringContaining('wsl-chrome-2/chatgpt::service:chatgpt'),
      },
    });
    expect(persistence.writeSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'chatgpt',
      runtimeProfileId: 'wsl-chrome-2',
      browserProfileId: 'wsl-chrome-2',
      boundIdentityKey: 'consult@polymerconsultinggroup.com',
    }));
  });

  test('runs a read-only Gemini refresh through the browser operation dispatcher', async () => {
    const geminiConfig = {
      ...config,
      runtimeProfiles: {
        ...config.runtimeProfiles,
        default: {
          ...config.runtimeProfiles.default,
          defaultService: 'gemini',
          services: {
            ...config.runtimeProfiles.default.services,
            gemini: {
              identity: {
                email: 'ecochran76@gmail.com',
              },
            },
          },
        },
      },
    };
    const metadataCollector = {
      collect: vi.fn(async () => ({
        detectedIdentityKey: 'ecochran76@gmail.com',
        detectedAccountLevel: null,
        metadataCounts: {
          projects: 0,
          conversations: 1,
          artifacts: 0,
          files: 0,
          media: 0,
        },
        manifests: {
          projects: [],
          conversations: [
            { id: 'gemini_conv_1', title: 'Gemini conversation', provider: 'gemini' as const },
          ],
          artifacts: [],
          files: [],
          media: [],
        },
        evidence: {
          identitySource: 'profile-menu',
          projectSampleIds: [],
          conversationSampleIds: ['gemini_conv_1'],
          truncated: {
            projects: false,
            conversations: false,
            artifacts: false,
          },
        },
      })),
    };
    const service = createAccountMirrorRefreshService({
      config: geminiConfig,
      dispatcher: createBrowserOperationDispatcher(),
      metadataCollector,
      persistence: createNoopPersistence(),
      generateRequestId: () => 'acctmirror_gemini',
    });

    const result = await service.requestRefresh({
      provider: 'gemini',
      runtimeProfileId: 'default',
      explicitRefresh: true,
    });

    expect(result).toMatchObject({
      requestId: 'acctmirror_gemini',
      provider: 'gemini',
      runtimeProfileId: 'default',
      detectedIdentityKey: 'ecochran76@gmail.com',
      metadataCounts: {
        conversations: 1,
      },
      dispatcher: {
        key: expect.stringContaining('service:gemini'),
      },
    });
    expect(metadataCollector.collect).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'gemini',
      runtimeProfileId: 'default',
      expectedIdentityKey: 'ecochran76@gmail.com',
    }));
  });

  test('reports dispatcher busy instead of bypassing the browser control plane', async () => {
    const dispatcher = createBrowserOperationDispatcher({
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });
    const active = await dispatcher.acquire({
      managedProfileDir: '/tmp/auracall-default-chatgpt',
      serviceTarget: 'chatgpt',
      kind: 'browser-execution',
      operationClass: 'exclusive-mutating',
      ownerCommand: 'test-active-browser-run',
    });
    if (!active.acquired) {
      throw new Error('test setup failed to acquire dispatcher lock');
    }
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });
    const service = createAccountMirrorRefreshService({
      config: {
        ...config,
        browser: {
          manualLoginProfileDir: '/tmp/auracall-default-chatgpt',
        },
      },
      registry,
      dispatcher,
      persistence: createNoopPersistence(),
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });

    await expect(
      service.requestRefresh({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        queueTimeoutMs: 0,
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'account_mirror_browser_operation_busy',
    } satisfies Partial<AccountMirrorRefreshError>);
    expect(registry.readStatus({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      explicitRefresh: true,
    }).entries[0]).toMatchObject({
      mirrorState: expect.objectContaining({
        queued: false,
        running: false,
        lastDispatcherBlockedBy: expect.objectContaining({
          ownerCommand: 'test-active-browser-run',
        }),
      }),
    });

    await active.release();
  });

  test('times out a stuck metadata collector and releases the browser operation', async () => {
    const dispatcher = createBrowserOperationDispatcher({
      now: () => new Date('2026-05-02T20:05:00.000Z'),
    });
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-05-02T20:05:00.000Z'),
    });
    const service = createAccountMirrorRefreshService({
      config,
      registry,
      dispatcher,
      metadataCollector: {
        collect: vi.fn(
          (_input: AccountMirrorMetadataCollectorInput) =>
            new Promise<AccountMirrorMetadataCollectorResult>(() => {}),
        ),
      },
      persistence: createNoopPersistence(),
      now: () => new Date('2026-05-02T20:05:00.000Z'),
    });

    await expect(
      service.requestRefresh({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        explicitRefresh: true,
        collectorTimeoutMs: 5,
      }),
    ).rejects.toThrow('Account mirror metadata collector timed out for chatgpt/default.');

    const entry = registry.readStatus({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      explicitRefresh: true,
    }).entries[0];
    expect(entry).toMatchObject({
      mirrorState: expect.objectContaining({
        queued: false,
        running: false,
      }),
    });

    const dispatcherKey = entry?.mirrorState.lastDispatcherKey ?? 'missing-dispatcher-key';
    await expect(dispatcher.getActive(dispatcherKey)).resolves.toBeNull();
  });

  test('fails fast when the collector detects the wrong ChatGPT identity', async () => {
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });
    const service = createAccountMirrorRefreshService({
      config,
      registry,
      dispatcher: createBrowserOperationDispatcher({
        now: () => new Date('2026-04-29T12:00:00.000Z'),
      }),
      metadataCollector: {
        collect: vi.fn(async () => {
          throw new AccountMirrorIdentityMismatchError(
            'chatgpt',
            'ecochran76@gmail.com',
            'wrong@example.com',
          );
        }),
      },
      persistence: createNoopPersistence(),
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });

    await expect(
      service.requestRefresh({
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        explicitRefresh: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'account_mirror_identity_mismatch',
    } satisfies Partial<AccountMirrorRefreshError>);
    expect(registry.readStatus({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      explicitRefresh: true,
    }).entries[0]).toMatchObject({
      detectedIdentityKey: 'wrong@example.com',
      status: 'blocked',
      reason: 'identity-mismatch',
    });
  });
});
