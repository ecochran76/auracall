import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuracallHomeDir } from '../auracallHome.js';
import { resolveManagedBrowserLaunchContextFromResolvedConfig } from '../browser/service/profileResolution.js';
import {
  createFileBackedBrowserOperationDispatcher,
  formatBrowserOperationBusyResult,
  type BrowserOperationDispatcher,
  type BrowserOperationRecord,
} from '../../packages/browser-service/src/service/operationDispatcher.js';
import type { AccountMirrorProvider } from './politePolicy.js';
import type {
  AccountMirrorMetadataCounts,
  AccountMirrorStatusEntry,
  AccountMirrorStatusRegistry,
  AccountMirrorStatusSummary,
} from './statusRegistry.js';
import { createAccountMirrorStatusRegistry } from './statusRegistry.js';

export interface AccountMirrorRefreshRequest {
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  explicitRefresh?: boolean;
  queueTimeoutMs?: number;
  queuePollMs?: number;
}

export interface AccountMirrorRefreshResult {
  object: 'account_mirror_refresh';
  requestId: string;
  status: 'completed' | 'blocked' | 'busy';
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  startedAt: string;
  completedAt: string | null;
  dispatcher: {
    key: string | null;
    operationId: string | null;
    blockedBy: Record<string, unknown> | null;
  };
  metadataCounts: AccountMirrorMetadataCounts;
  mirrorStatus: AccountMirrorStatusSummary;
}

export class AccountMirrorRefreshError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 409 | 503,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AccountMirrorRefreshError';
  }
}

export interface AccountMirrorRefreshService {
  requestRefresh(request?: AccountMirrorRefreshRequest): Promise<AccountMirrorRefreshResult>;
}

export function createAccountMirrorRefreshService(input: {
  config: Record<string, unknown> | null | undefined;
  registry?: AccountMirrorStatusRegistry;
  dispatcher?: BrowserOperationDispatcher;
  now?: () => Date;
  generateRequestId?: () => string;
}): AccountMirrorRefreshService {
  const now = input.now ?? (() => new Date());
  const registry = input.registry ?? createAccountMirrorStatusRegistry({
    config: input.config,
    now,
  });
  const dispatcher = input.dispatcher ?? createFileBackedBrowserOperationDispatcher({
    lockRoot: path.join(getAuracallHomeDir(), 'browser-operations'),
  });
  const generateRequestId = input.generateRequestId ?? (() => `acctmirror_${randomUUID()}`);

  return {
    async requestRefresh(request = {}) {
      const provider = request.provider ?? 'chatgpt';
      const runtimeProfileId = request.runtimeProfileId ?? 'default';
      const requestId = generateRequestId();
      if (provider !== 'chatgpt' || runtimeProfileId !== 'default') {
        throw new AccountMirrorRefreshError(
          400,
          'account_mirror_refresh_scope_unsupported',
          'The first account mirror refresh slice only supports the default ChatGPT mirror.',
          { provider, runtimeProfileId },
        );
      }

      const target = readSingleMirrorTarget({
        registry,
        provider,
        runtimeProfileId,
        explicitRefresh: request.explicitRefresh ?? true,
      });
      if (!target) {
        throw new AccountMirrorRefreshError(
          404,
          'account_mirror_target_not_found',
          `No configured account mirror target exists for ${provider}/${runtimeProfileId}.`,
          { provider, runtimeProfileId },
        );
      }
      if (target.status !== 'eligible') {
        throw new AccountMirrorRefreshError(
          409,
          'account_mirror_not_eligible',
          `Account mirror ${provider}/${runtimeProfileId} is ${target.status}: ${target.reason}.`,
          {
            provider,
            runtimeProfileId,
            reason: target.reason,
            eligibleAt: target.eligibleAt,
          },
        );
      }

      const queuedAt = now();
      const managedProfileDir = resolveMirrorManagedProfileDir({
        config: input.config,
        provider,
        runtimeProfileId,
        browserProfileId: target.browserProfileId,
      });
      registry.mergeState({ provider, runtimeProfileId }, {
        queued: true,
        running: false,
        lastRefreshRequestId: requestId,
        lastQueuedAtMs: queuedAt.getTime(),
        lastAttemptAtMs: queuedAt.getTime(),
        detectedIdentityKey: target.expectedIdentityKey,
        lastDispatcherBlockedBy: null,
      });

      const acquired = await dispatcher.acquireQueued({
        managedProfileDir,
        serviceTarget: provider,
        kind: 'browser-execution',
        operationClass: 'exclusive-probe',
        ownerCommand: `account-mirror-refresh:${provider}:${runtimeProfileId}`,
      }, {
        timeoutMs: normalizeNonNegativeInteger(request.queueTimeoutMs, 30_000),
        pollMs: normalizePositiveInteger(request.queuePollMs, 1_000),
        onBlocked: (result) => {
          registry.mergeState({ provider, runtimeProfileId }, {
            queued: true,
            running: false,
            lastDispatcherKey: result.key,
            lastDispatcherBlockedBy: summarizeBrowserOperation(result.blockedBy),
          });
        },
      });

      if (!acquired.acquired) {
        const completedAt = now();
        registry.mergeState({ provider, runtimeProfileId }, {
          queued: false,
          running: false,
          lastFailureAtMs: completedAt.getTime(),
          consecutiveFailureCount: 1,
          lastDispatcherKey: acquired.key,
          lastDispatcherBlockedBy: summarizeBrowserOperation(acquired.blockedBy),
        });
        throw new AccountMirrorRefreshError(
          503,
          'account_mirror_browser_operation_busy',
          formatBrowserOperationBusyResult(acquired),
          {
            provider,
            runtimeProfileId,
            dispatcherKey: acquired.key,
            blockedBy: summarizeBrowserOperation(acquired.blockedBy),
          },
        );
      }

      const startedAt = now();
      registry.mergeState({ provider, runtimeProfileId }, {
        queued: false,
        running: true,
        lastStartedAtMs: startedAt.getTime(),
        lastDispatcherKey: acquired.operation.key,
        lastDispatcherOperationId: acquired.operation.id,
        lastDispatcherBlockedBy: null,
      });

      const metadataCounts = estimateMetadataCountsFromConfig(input.config, target);
      try {
        const completedAt = now();
        registry.mergeState({ provider, runtimeProfileId }, {
          queued: false,
          running: false,
          detectedIdentityKey: target.expectedIdentityKey,
          lastSuccessAtMs: completedAt.getTime(),
          lastCompletedAtMs: completedAt.getTime(),
          consecutiveFailureCount: 0,
          metadataCounts,
        });
        return {
          object: 'account_mirror_refresh',
          requestId,
          status: 'completed',
          provider,
          runtimeProfileId,
          browserProfileId: target.browserProfileId,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          dispatcher: {
            key: acquired.operation.key,
            operationId: acquired.operation.id,
            blockedBy: null,
          },
          metadataCounts,
          mirrorStatus: registry.readStatus({ provider, runtimeProfileId, explicitRefresh: true }),
        };
      } finally {
        await acquired.release();
      }
    },
  };
}

function readSingleMirrorTarget(input: {
  registry: AccountMirrorStatusRegistry;
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  explicitRefresh: boolean;
}): AccountMirrorStatusEntry | null {
  return input.registry.readStatus({
    provider: input.provider,
    runtimeProfileId: input.runtimeProfileId,
    explicitRefresh: input.explicitRefresh,
  }).entries[0] ?? null;
}

function resolveMirrorManagedProfileDir(input: {
  config: Record<string, unknown> | null | undefined;
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
}): string {
  const config = isRecord(input.config) ? input.config : {};
  const browser = isRecord(config.browser) ? config.browser : {};
  const context = resolveManagedBrowserLaunchContextFromResolvedConfig({
    auracallProfile: input.runtimeProfileId,
    browserProfileName: input.browserProfileId,
    browser: {
      ...browser,
      target: input.provider,
    },
    target: input.provider,
  });
  return context.managedProfileDir;
}

function estimateMetadataCountsFromConfig(
  config: Record<string, unknown> | null | undefined,
  target: AccountMirrorStatusEntry,
): AccountMirrorMetadataCounts {
  const runtimeProfile = readRuntimeProfile(config, target.runtimeProfileId);
  const service: Record<string, unknown> =
    isRecord(runtimeProfile?.services) && isRecord(runtimeProfile.services[target.provider])
      ? (runtimeProfile.services[target.provider] as Record<string, unknown>)
      : {};
  return {
    projects: countArrayLike(service.projects) + countOptionalString(service.projectId),
    conversations: countArrayLike(service.conversations) + countOptionalString(service.conversationId),
    artifacts: countArrayLike(service.artifacts) + countArrayLike(service.files),
    media: countArrayLike(service.media) + countArrayLike(service.saved),
  };
}

function readRuntimeProfile(
  config: Record<string, unknown> | null | undefined,
  runtimeProfileId: string,
): Record<string, unknown> | null {
  if (!isRecord(config)) return null;
  const targetProfiles = isRecord(config.runtimeProfiles) ? config.runtimeProfiles : {};
  const bridgeProfiles = isRecord(config.profiles) ? config.profiles : {};
  const runtimeProfile = isRecord(targetProfiles[runtimeProfileId])
    ? targetProfiles[runtimeProfileId]
    : isRecord(bridgeProfiles[runtimeProfileId])
      ? bridgeProfiles[runtimeProfileId]
      : null;
  return runtimeProfile;
}

function countArrayLike(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function countOptionalString(value: unknown): number {
  return typeof value === 'string' && value.trim().length > 0 ? 1 : 0;
}

function summarizeBrowserOperation(operation: BrowserOperationRecord): Record<string, unknown> {
  return {
    id: operation.id,
    key: operation.key,
    kind: operation.kind,
    operationClass: operation.operationClass,
    ownerPid: operation.ownerPid,
    ownerCommand: operation.ownerCommand ?? null,
    startedAt: operation.startedAt,
    updatedAt: operation.updatedAt,
    managedProfileDir: operation.managedProfileDir ?? null,
    serviceTarget: operation.serviceTarget ?? null,
    rawDevTools: operation.rawDevTools ?? null,
    devTools: operation.devTools ?? null,
  };
}

function normalizePositiveInteger(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function normalizeNonNegativeInteger(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
