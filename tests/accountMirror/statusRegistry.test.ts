import { describe, expect, test } from 'vitest';
import {
  createAccountMirrorStatusRegistry,
  createAccountMirrorStatusSummary,
} from '../../src/accountMirror/statusRegistry.js';

const config = {
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
        gemini: {
          identity: {
            email: 'ecochran76@gmail.com',
          },
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
    unbound: {
      browserProfile: 'default',
      defaultService: 'grok',
      services: {
        grok: {},
      },
    },
  },
};

describe('account mirror status registry', () => {
  test('derives identity-gated mirror status entries from configured runtime profiles', () => {
    const status = createAccountMirrorStatusSummary({
      config,
      now: new Date('2026-04-29T12:00:00.000Z'),
    });

    expect(status).toMatchObject({
      object: 'account_mirror_status',
      generatedAt: '2026-04-29T12:00:00.000Z',
      metrics: {
        total: 4,
        eligible: 3,
        delayed: 0,
        blocked: 1,
      },
    });
    expect(status.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          expectedIdentityKey: 'ecochran76@gmail.com',
          accountLevel: 'Business',
          status: 'eligible',
          reason: 'eligible',
          mirrorState: expect.objectContaining({
            queued: false,
            running: false,
          }),
          metadataCounts: {
            projects: 0,
            conversations: 0,
            artifacts: 0,
            files: 0,
            media: 0,
          },
        }),
        expect.objectContaining({
          provider: 'grok',
          runtimeProfileId: 'unbound',
          status: 'blocked',
          reason: 'expected-identity-missing',
        }),
      ]),
    );
  });

  test('filters by provider and runtime profile', () => {
    const status = createAccountMirrorStatusSummary({
      config,
      now: new Date('2026-04-29T12:00:00.000Z'),
      provider: 'chatgpt',
      runtimeProfileId: 'wsl-chrome-2',
    });

    expect(status.metrics.total).toBe(1);
    expect(status.entries[0]).toMatchObject({
      provider: 'chatgpt',
      runtimeProfileId: 'wsl-chrome-2',
      expectedIdentityKey: 'consult@polymerconsultinggroup.com',
      accountLevel: 'Pro',
    });
  });

  test('reports delayed status from registry state without enqueueing browser work', () => {
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });
    registry.updateState(
      {
        provider: 'chatgpt',
        runtimeProfileId: 'default',
      },
      {
        lastSuccessAtMs: Date.parse('2026-04-29T11:59:00.000Z'),
        detectedIdentityKey: 'ecochran76@gmail.com',
      },
    );

    const status = registry.readStatus({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
    });

    expect(status.metrics).toMatchObject({
      total: 1,
      delayed: 1,
    });
    expect(status.entries[0]).toMatchObject({
      status: 'delayed',
      reason: 'minimum-interval',
      lastSuccessAt: '2026-04-29T11:59:00.000Z',
      detectedIdentityKey: 'ecochran76@gmail.com',
    });
  });

  test('merges dispatcher and metadata state for explicit refresh readback', () => {
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });
    registry.mergeState(
      {
        provider: 'chatgpt',
        runtimeProfileId: 'default',
      },
      {
        lastRefreshRequestId: 'acctmirror_test',
        lastQueuedAtMs: Date.parse('2026-04-29T11:58:00.000Z'),
        lastStartedAtMs: Date.parse('2026-04-29T11:58:01.000Z'),
        lastCompletedAtMs: Date.parse('2026-04-29T11:58:02.000Z'),
        lastDispatcherKey: 'managed-profile:/tmp/default/chatgpt::service:chatgpt',
        lastDispatcherOperationId: 'op_123',
        metadataCounts: {
          projects: 2,
          conversations: 5,
          artifacts: 1,
          files: 0,
          media: 0,
        },
      },
    );

    const status = registry.readStatus({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      explicitRefresh: true,
    });

    expect(status.entries[0]).toMatchObject({
      lastQueuedAt: '2026-04-29T11:58:00.000Z',
      lastStartedAt: '2026-04-29T11:58:01.000Z',
      lastCompletedAt: '2026-04-29T11:58:02.000Z',
      mirrorState: {
        queued: false,
        running: false,
        lastRefreshRequestId: 'acctmirror_test',
        lastDispatcherKey: 'managed-profile:/tmp/default/chatgpt::service:chatgpt',
        lastDispatcherOperationId: 'op_123',
        lastDispatcherBlockedBy: null,
      },
      metadataCounts: {
        projects: 2,
        conversations: 5,
        artifacts: 1,
        files: 0,
        media: 0,
      },
    });
  });

  test('hydrates persisted mirror state without making status readback asynchronous', async () => {
    const registry = createAccountMirrorStatusRegistry({
      config,
      now: () => new Date('2026-04-29T12:00:00.000Z'),
      readPersistentState: async (target) => {
        if (
          target.provider !== 'chatgpt' ||
          target.runtimeProfileId !== 'default' ||
          target.boundIdentityKey !== 'ecochran76@gmail.com'
        ) {
          return null;
        }
        return {
          detectedIdentityKey: 'ecochran76@gmail.com',
          lastSuccessAtMs: Date.parse('2026-04-29T10:00:00.000Z'),
          metadataCounts: {
            projects: 3,
            conversations: 9,
            artifacts: 2,
            files: 0,
            media: 1,
          },
        };
      },
    });

    await registry.refreshPersistentState?.();
    const status = registry.readStatus({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      explicitRefresh: true,
    });

    expect(status.entries[0]).toMatchObject({
      detectedIdentityKey: 'ecochran76@gmail.com',
      lastSuccessAt: '2026-04-29T10:00:00.000Z',
      metadataCounts: {
        projects: 3,
        conversations: 9,
        artifacts: 2,
        files: 0,
        media: 1,
      },
    });
  });
});
