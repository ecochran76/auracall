import {
  getCurrentRuntimeProfiles,
  getRuntimeProfileBrowserProfileId,
} from '../config/model.js';
import type {
  AccountMirrorPolitenessDecision,
  AccountMirrorProvider,
} from './politePolicy.js';
import { evaluateAccountMirrorPoliteness } from './politePolicy.js';

type MutableRecord = Record<string, unknown>;

export type AccountMirrorStatusState = {
  detectedIdentityKey?: string | null;
  lastAttemptAtMs?: number | null;
  lastSuccessAtMs?: number | null;
  lastFailureAtMs?: number | null;
  consecutiveFailureCount?: number | null;
  providerCooldownUntilMs?: number | null;
  providerHardStopAtMs?: number | null;
  queued?: boolean;
  running?: boolean;
};

export type AccountMirrorStatusEntry = {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  expectedIdentityKey: string | null;
  detectedIdentityKey: string | null;
  accountLevel: string | null;
  status: 'eligible' | 'delayed' | 'blocked';
  reason: AccountMirrorPolitenessDecision['reason'];
  eligibleAt: string | null;
  delayMs: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailureCount: number;
  limits: AccountMirrorPolitenessDecision['limits'];
};

export type AccountMirrorStatusSummary = {
  object: 'account_mirror_status';
  generatedAt: string;
  entries: AccountMirrorStatusEntry[];
  metrics: {
    total: number;
    eligible: number;
    delayed: number;
    blocked: number;
  };
};

export type AccountMirrorStatusRegistrySnapshot = {
  entries: AccountMirrorStatusState[];
};

export interface AccountMirrorStatusRegistry {
  readStatus(input?: {
    provider?: AccountMirrorProvider | null;
    runtimeProfileId?: string | null;
    explicitRefresh?: boolean;
  }): AccountMirrorStatusSummary;
  updateState(
    key: {
      provider: AccountMirrorProvider;
      runtimeProfileId: string;
    },
    state: AccountMirrorStatusState,
  ): void;
}

export function createAccountMirrorStatusRegistry(input: {
  config: Record<string, unknown> | null | undefined;
  now?: () => Date;
  initialState?: Record<string, AccountMirrorStatusState>;
}): AccountMirrorStatusRegistry {
  const states = new Map<string, AccountMirrorStatusState>(
    Object.entries(input.initialState ?? {}),
  );
  const now = input.now ?? (() => new Date());
  const readStatus: AccountMirrorStatusRegistry['readStatus'] = (query = {}) =>
    createAccountMirrorStatusSummary({
      config: input.config,
      now: now(),
      states,
      provider: query.provider ?? null,
      runtimeProfileId: query.runtimeProfileId ?? null,
      explicitRefresh: query.explicitRefresh ?? false,
    });

  return {
    readStatus,
    updateState(key, state) {
      states.set(createMirrorStateKey(key), { ...state });
    },
  };
}

export function createAccountMirrorStatusSummary(input: {
  config: Record<string, unknown> | null | undefined;
  now: Date;
  states?: Map<string, AccountMirrorStatusState> | Record<string, AccountMirrorStatusState>;
  provider?: AccountMirrorProvider | null;
  runtimeProfileId?: string | null;
  explicitRefresh?: boolean;
}): AccountMirrorStatusSummary {
  const states = input.states instanceof Map
    ? input.states
    : new Map(Object.entries(input.states ?? {}));
  const entries = discoverConfiguredAccountMirrorTargets(input.config)
    .filter((entry) => !input.provider || entry.provider === input.provider)
    .filter((entry) => !input.runtimeProfileId || entry.runtimeProfileId === input.runtimeProfileId)
    .map((target) => {
      const state = states.get(createMirrorStateKey(target)) ?? {};
      const decision = evaluateAccountMirrorPoliteness({
        provider: target.provider,
        runtimeProfileId: target.runtimeProfileId,
        browserProfileId: target.browserProfileId,
        expectedIdentityKey: target.expectedIdentityKey,
        detectedIdentityKey: state.detectedIdentityKey,
        lastAttemptAtMs: state.lastAttemptAtMs,
        lastSuccessAtMs: state.lastSuccessAtMs,
        lastFailureAtMs: state.lastFailureAtMs,
        consecutiveFailureCount: state.consecutiveFailureCount,
        providerCooldownUntilMs: state.providerCooldownUntilMs,
        providerHardStopAtMs: state.providerHardStopAtMs,
        queued: state.queued,
        running: state.running,
        explicitRefresh: input.explicitRefresh,
        nowMs: input.now.getTime(),
      });
      return createStatusEntry(target, state, decision);
    });
  const metrics = entries.reduce<AccountMirrorStatusSummary['metrics']>(
    (acc, entry) => {
      acc.total += 1;
      acc[entry.status] += 1;
      return acc;
    },
    { total: 0, eligible: 0, delayed: 0, blocked: 0 },
  );
  return {
    object: 'account_mirror_status',
    generatedAt: input.now.toISOString(),
    entries,
    metrics,
  };
}

function discoverConfiguredAccountMirrorTargets(
  config: Record<string, unknown> | null | undefined,
): Array<{
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  expectedIdentityKey: string | null;
  accountLevel: string | null;
}> {
  if (!config) return [];
  const runtimeProfiles = getCurrentRuntimeProfiles(config);
  return Object.entries(runtimeProfiles).flatMap(([runtimeProfileId, runtimeProfile]) => {
    const browserProfileId = getRuntimeProfileBrowserProfileId(runtimeProfile);
    const services = isRecord(runtimeProfile.services) ? runtimeProfile.services : {};
    return (['chatgpt', 'gemini', 'grok'] as const).flatMap((provider) => {
      const service = isRecord(services[provider]) ? services[provider] : null;
      if (!service) return [];
      return [{
        provider,
        runtimeProfileId,
        browserProfileId,
        expectedIdentityKey: readIdentityKey(service),
        accountLevel: readAccountLevel(service),
      }];
    });
  });
}

function createStatusEntry(
  target: {
    provider: AccountMirrorProvider;
    runtimeProfileId: string;
    browserProfileId: string | null;
    expectedIdentityKey: string | null;
    accountLevel: string | null;
  },
  state: AccountMirrorStatusState,
  decision: AccountMirrorPolitenessDecision,
): AccountMirrorStatusEntry {
  return {
    provider: target.provider,
    runtimeProfileId: target.runtimeProfileId,
    browserProfileId: target.browserProfileId,
    expectedIdentityKey: target.expectedIdentityKey,
    detectedIdentityKey: decision.detectedIdentityKey,
    accountLevel: target.accountLevel,
    status: decision.posture === 'delay' ? 'delayed' : decision.posture,
    reason: decision.reason,
    eligibleAt: timestampToIso(decision.eligibleAtMs),
    delayMs: decision.delayMs,
    lastAttemptAt: timestampToIso(state.lastAttemptAtMs),
    lastSuccessAt: timestampToIso(state.lastSuccessAtMs),
    lastFailureAt: timestampToIso(state.lastFailureAtMs),
    consecutiveFailureCount: Math.max(0, Math.floor(state.consecutiveFailureCount ?? 0)),
    limits: decision.limits,
  };
}

function createMirrorStateKey(input: {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
}): string {
  return `${input.provider}:${input.runtimeProfileId}`;
}

function readIdentityKey(service: MutableRecord): string | null {
  const identity = isRecord(service.identity) ? service.identity : {};
  return (
    readString(identity.email) ??
    readString(identity.handle) ??
    readString(identity.accountId) ??
    readString(identity.name)
  );
}

function readAccountLevel(service: MutableRecord): string | null {
  const identity = isRecord(service.identity) ? service.identity : {};
  return (
    readString(identity.accountLevel) ??
    readString(identity.accountPlanType) ??
    readString(identity.capabilityProfile) ??
    readString(identity.proAccess)
  );
}

function timestampToIso(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value).toISOString();
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
