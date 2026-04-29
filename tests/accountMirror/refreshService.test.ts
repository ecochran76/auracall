import { describe, expect, test, vi } from 'vitest';
import { createBrowserOperationDispatcher } from '../../packages/browser-service/src/service/operationDispatcher.js';
import {
  type AccountMirrorRefreshError,
  createAccountMirrorRefreshService,
} from '../../src/accountMirror/refreshService.js';
import { AccountMirrorIdentityMismatchError } from '../../src/accountMirror/chatgptMetadataCollector.js';
import { createAccountMirrorStatusRegistry } from '../../src/accountMirror/statusRegistry.js';

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
  },
};

describe('account mirror refresh service', () => {
  test('runs an explicit default ChatGPT refresh through the browser operation dispatcher', async () => {
    const metadataCollector = {
      collect: vi.fn(async () => ({
        detectedIdentityKey: 'ecochran76@gmail.com',
        detectedAccountLevel: 'Business',
        metadataCounts: {
          projects: 1,
          conversations: 2,
          artifacts: 1,
          media: 0,
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
    const service = createAccountMirrorRefreshService({
      config,
      registry,
      dispatcher: createBrowserOperationDispatcher({
        now: () => new Date('2026-04-29T12:00:00.000Z'),
      }),
      metadataCollector,
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
      limits: {
        maxPageReadsPerCycle: 12,
        maxConversationRowsPerCycle: 250,
        maxArtifactRowsPerCycle: 80,
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

  test('fails fast before queueing unsupported providers in the first refresh slice', async () => {
    const service = createAccountMirrorRefreshService({
      config,
      dispatcher: createBrowserOperationDispatcher(),
    });

    await expect(
      service.requestRefresh({
        provider: 'gemini',
        runtimeProfileId: 'default',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'account_mirror_refresh_scope_unsupported',
    } satisfies Partial<AccountMirrorRefreshError>);
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
            'ecochran76@gmail.com',
            'wrong@example.com',
          );
        }),
      },
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
