import { describe, expect, it } from 'vitest';
import { createApiStatusToolHandler } from '../src/mcp/tools/apiStatus.js';

const statusPayload = {
  ok: true,
  api: {
    process: {
      pid: 5151,
      ppid: 100,
      uptimeSeconds: 45,
      cwd: '/home/ecochran76',
      execPath: '/usr/bin/node',
      nodeVersion: 'v25.8.0',
    },
    managedService: {
      manager: 'systemd-user',
      unitName: 'auracall-api.service',
      logPath: '/home/ecochran76/.auracall/logs/api-18080.log',
      installCommand: 'pnpm run install:user-runtime-service',
      restartCommand: 'systemctl --user restart auracall-api.service',
      statusCommand: 'systemctl --user status auracall-api.service',
    },
  },
  routes: {
    apiLogTail: '/v1/api/logs/tail[?maxBytes=32768]',
  },
  accountMirrorScheduler: {
    enabled: true,
    state: 'idle',
    dryRun: true,
    lastWakeReason: 'media-generation-settled',
    lastWakeAt: '2026-04-30T12:00:01.000Z',
    operatorStatus: {
      posture: 'backpressured',
      reason: 'minimum interval has not elapsed',
      backpressureReason: 'routine-delayed',
    },
    lastPass: {
      action: 'skipped',
      backpressure: {
        reason: 'routine-delayed',
        message: 'minimum interval has not elapsed',
      },
    },
    history: {
      entries: [
        {
          completedAt: '2026-04-30T11:55:00.000Z',
          selectedTarget: {
            provider: 'chatgpt',
            runtimeProfileId: 'default',
          },
          backpressure: {
            reason: 'yielded-to-queued-work',
          },
          refresh: {
            mirrorCompleteness: {
              remainingDetailSurfaces: {
                total: 4,
              },
            },
            metadataEvidence: {
              attachmentInventory: {
                yieldCause: {
                  ownerCommand: 'media-generation:chatgpt:image',
                },
              },
            },
          },
        },
      ],
    },
  },
  accountMirrorCompletions: {
    object: 'account_mirror_completion_summary',
    generatedAt: '2026-04-30T12:00:02.000Z',
    metrics: {
      total: 3,
      active: 2,
      queued: 0,
      running: 2,
      paused: 0,
      completed: 0,
      blocked: 0,
      failed: 0,
      cancelled: 1,
    },
    active: [
      {
        id: 'acctmirror_running',
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        mode: 'live_follow',
        phase: 'backfill_history',
        status: 'running',
        startedAt: '2026-04-30T11:50:00.000Z',
        completedAt: null,
        nextAttemptAt: null,
        passCount: 2,
        error: null,
      },
      {
        id: 'acctmirror_grok_running',
        provider: 'grok',
        runtimeProfileId: 'default',
        mode: 'live_follow',
        phase: 'steady_follow',
        status: 'running',
        startedAt: '2026-04-30T11:52:00.000Z',
        completedAt: null,
        nextAttemptAt: null,
        passCount: 1,
        error: null,
      },
    ],
    recent: [
      {
        id: 'acctmirror_cancelled',
        provider: 'gemini',
        runtimeProfileId: 'default',
        mode: 'live_follow',
        phase: 'steady_follow',
        status: 'cancelled',
        startedAt: '2026-04-30T11:00:00.000Z',
        completedAt: '2026-04-30T11:30:00.000Z',
        nextAttemptAt: null,
        passCount: 4,
        error: null,
      },
    ],
  },
  liveFollow: {
    targets: {
      total: 3,
      enabled: 2,
      disabled: 0,
      unconfigured: 1,
      missingIdentity: 0,
      unsupported: 0,
      active: 2,
      queued: 0,
      running: 2,
      paused: 0,
      attentionNeeded: 1,
      complete: 0,
      inProgress: 1,
      none: 1,
      unknown: 0,
      desired: {
        total: 3,
        enabled: 2,
        disabled: 0,
        unconfigured: 1,
        missingIdentity: 0,
        unsupported: 0,
      },
      actual: {
        active: 2,
        queued: 0,
        running: 2,
        paused: 0,
        attentionNeeded: 1,
        complete: 0,
        inProgress: 1,
        none: 1,
        unknown: 0,
      },
      accounts: [
        {
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          desiredState: 'enabled',
          desiredEnabled: true,
          actualStatus: 'running',
          statusReason: 'minimum-interval',
          attentionNeeded: false,
          activeCompletionId: 'acctmirror_running',
          latestCompletionStatus: 'running',
          latestCompletionError: null,
          phase: 'backfill_history',
          passCount: 2,
          routineEligibleAt: '2026-05-01T00:00:00.000Z',
          lastFailureAt: null,
          consecutiveFailureCount: 0,
          activeCompletionNextAttemptAt: '2026-05-01T00:05:00.000Z',
          nextAttemptAt: '2026-05-01T00:05:00.000Z',
          mirrorCompleteness: 'in_progress',
          latestLifecycleEvent: null,
          metadataCounts: {
            projects: 5,
            conversations: 323,
            artifacts: 532,
            files: 67,
            media: 0,
          },
        },
        {
          provider: 'grok',
          runtimeProfileId: 'default',
          desiredState: 'enabled',
          desiredEnabled: true,
          actualStatus: 'running',
          statusReason: null,
          attentionNeeded: false,
          activeCompletionId: 'acctmirror_grok_running',
          latestCompletionStatus: 'running',
          latestCompletionError: null,
          phase: 'steady_follow',
          passCount: 1,
          routineEligibleAt: null,
          lastFailureAt: null,
          consecutiveFailureCount: 0,
          activeCompletionNextAttemptAt: null,
          nextAttemptAt: null,
          mirrorCompleteness: 'in_progress',
          latestLifecycleEvent: null,
          metadataCounts: {
            projects: 0,
            conversations: 12,
            artifacts: 0,
            files: 0,
            media: 0,
          },
        },
      ],
    },
  },
};

describe('mcp api_status tool', () => {
  it('reads local API status with compact lazy mirror posture', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe('http://127.0.0.1:18080/status');
      return new Response(JSON.stringify(statusPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const handler = createApiStatusToolHandler({ fetchImpl });

    const result = await handler({
      port: 18080,
      expectedAccountMirrorPosture: 'backpressured',
      expectedAccountMirrorBackpressure: 'routine-delayed',
      expectedLiveFollowSeverity: 'attention-needed',
      expectedCompletionActive: 2,
      expectedCompletionCancelled: 1,
      expectedCompletionPaused: 0,
      expectedCompletionFailed: 0,
    });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'AuraCall API 127.0.0.1:18080 is ok; pid=5151; log=/home/ecochran76/.auracall/logs/api-18080.log; mirror posture backpressured; scheduler state idle; Live follow health: severity=attention-needed posture=backpressured state=idle enabled=2 active=2 paused=0 attention=1 backpressure=routine-delayed latestYield=chatgpt/default remaining=4 queued=media-generation:chatgpt:image\nScheduler diagnostics: available=2\nScheduler diagnostics command 1 (chatgpt/default): "auracall api scheduler-diagnostics --port 18080 --provider chatgpt --runtime-profile default --completion-id acctmirror_running"\nScheduler diagnostics command 2 (grok/default): "auracall api scheduler-diagnostics --port 18080 --provider grok --runtime-profile default --completion-id acctmirror_grok_running"',
        },
      ],
      structuredContent: {
        ok: true,
        host: '127.0.0.1',
        port: 18080,
        api: {
          process: {
            pid: 5151,
            ppid: 100,
            uptimeSeconds: 45,
          },
          managedService: {
            unitName: 'auracall-api.service',
            logPath: '/home/ecochran76/.auracall/logs/api-18080.log',
            restartCommand: 'systemctl --user restart auracall-api.service',
          },
          logTailRoute: '/v1/api/logs/tail[?maxBytes=32768]',
        },
        scheduler: {
          enabled: true,
          state: 'idle',
          dryRun: true,
          lastWakeReason: 'media-generation-settled',
          lastWakeAt: '2026-04-30T12:00:01.000Z',
          lastAction: 'skipped',
          operatorStatus: {
            posture: 'backpressured',
            reason: 'minimum interval has not elapsed',
            backpressureReason: 'routine-delayed',
          },
          backpressure: {
            reason: 'routine-delayed',
            message: 'minimum interval has not elapsed',
          },
          latestYield: {
            completedAt: '2026-04-30T11:55:00.000Z',
            provider: 'chatgpt',
            runtimeProfileId: 'default',
            queuedOwnerCommand: 'media-generation:chatgpt:image',
            remainingDetailSurfaces: 4,
          },
        },
        completions: {
          generatedAt: '2026-04-30T12:00:02.000Z',
          metrics: {
            total: 3,
            active: 2,
            running: 2,
            idleWaiting: null,
            cancelled: 1,
          },
          active: [
            {
              id: 'acctmirror_running',
              provider: 'chatgpt',
              runtimeProfileId: 'default',
              status: 'running',
            },
            {
              id: 'acctmirror_grok_running',
              provider: 'grok',
              runtimeProfileId: 'default',
              status: 'running',
            },
          ],
          recentControlled: [
            {
              id: 'acctmirror_cancelled',
              provider: 'gemini',
              runtimeProfileId: 'default',
              status: 'cancelled',
            },
          ],
        },
        liveFollow: {
          line: 'Live follow health: severity=attention-needed posture=backpressured state=idle enabled=2 active=2 paused=0 attention=1 backpressure=routine-delayed latestYield=chatgpt/default remaining=4 queued=media-generation:chatgpt:image',
          severity: 'attention-needed',
          schedulerPosture: 'backpressured',
          schedulerState: 'idle',
          backpressureReason: 'routine-delayed',
          activeCompletions: 2,
          pausedCompletions: 0,
          failedCompletions: 0,
          cancelledCompletions: 1,
          latestYield: {
            provider: 'chatgpt',
            runtimeProfileId: 'default',
            queuedOwnerCommand: 'media-generation:chatgpt:image',
            remainingDetailSurfaces: 4,
          },
          targets: {
            desired: {
              enabled: 2,
              unconfigured: 1,
            },
            actual: {
              active: 2,
              attentionNeeded: 1,
              inProgress: 1,
            },
          },
        },
        schedulerDiagnosticsHints: [
          {
            provider: 'chatgpt',
            runtimeProfileId: 'default',
            completionId: 'acctmirror_running',
            command:
              'auracall api scheduler-diagnostics --port 18080 --provider chatgpt --runtime-profile default --completion-id acctmirror_running',
          },
          {
            provider: 'grok',
            runtimeProfileId: 'default',
            completionId: 'acctmirror_grok_running',
            command:
              'auracall api scheduler-diagnostics --port 18080 --provider grok --runtime-profile default --completion-id acctmirror_grok_running',
          },
        ],
      },
    });
  });

  it('fails when an expected mirror posture does not match', async () => {
    const handler = createApiStatusToolHandler({
      fetchImpl: async () => new Response(JSON.stringify(statusPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    await expect(handler({
      port: 18080,
      expectedAccountMirrorPosture: 'healthy',
    })).rejects.toThrow(
      'Expected accountMirrorScheduler.operatorStatus.posture to be healthy, got backpressured.',
    );
  });

  it('fails when an expected completion metric does not match', async () => {
    const handler = createApiStatusToolHandler({
      fetchImpl: async () => new Response(JSON.stringify(statusPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    await expect(handler({
      port: 18080,
      expectedCompletionCancelled: 0,
    })).rejects.toThrow(
      'Expected accountMirrorCompletions.metrics.cancelled to be 0, got 1.',
    );
  });

  it('fails when an expected live-follow severity does not match', async () => {
    const handler = createApiStatusToolHandler({
      fetchImpl: async () => new Response(JSON.stringify(statusPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    await expect(handler({
      port: 18080,
      expectedLiveFollowSeverity: 'healthy',
    })).rejects.toThrow(
      'Expected liveFollow.severity to be healthy, got attention-needed.',
    );
  });
});
