export type AccountMirrorProvider = 'chatgpt' | 'gemini' | 'grok';

export type AccountMirrorPolitenessPosture = 'eligible' | 'delay' | 'blocked';

export type AccountMirrorDelayReason =
  | 'eligible'
  | 'already-running'
  | 'already-queued'
  | 'expected-identity-missing'
  | 'identity-mismatch'
  | 'provider-hard-stop'
  | 'provider-cooldown'
  | 'minimum-interval'
  | 'failure-backoff';

export interface AccountMirrorProviderPolitenessPolicy {
  provider: AccountMirrorProvider;
  minIntervalMs: number;
  explicitRefreshMinIntervalMs: number;
  jitterMaxMs: number;
  failureBaseCooldownMs: number;
  failureMaxCooldownMs: number;
  hardStopCooldownMs: number;
  maxPageReadsPerCycle: number;
  maxConversationRowsPerCycle: number;
  maxArtifactRowsPerCycle: number;
}

export interface AccountMirrorPolitenessInput {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  expectedIdentityKey?: string | null;
  detectedIdentityKey?: string | null;
  lastAttemptAtMs?: number | null;
  lastSuccessAtMs?: number | null;
  lastFailureAtMs?: number | null;
  consecutiveFailureCount?: number | null;
  providerCooldownUntilMs?: number | null;
  providerHardStopAtMs?: number | null;
  queued?: boolean;
  running?: boolean;
  explicitRefresh?: boolean;
  nowMs?: number;
  policy?: Partial<AccountMirrorProviderPolitenessPolicy>;
}

export interface AccountMirrorPolitenessDecision {
  posture: AccountMirrorPolitenessPosture;
  reason: AccountMirrorDelayReason;
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null;
  expectedIdentityKey: string | null;
  detectedIdentityKey: string | null;
  eligibleAtMs: number | null;
  delayMs: number;
  limits: {
    minIntervalMs: number;
    explicitRefreshMinIntervalMs: number;
    jitterMs: number;
    jitterMaxMs: number;
    failureCooldownMs: number;
    hardStopCooldownMs: number;
    maxPageReadsPerCycle: number;
    maxConversationRowsPerCycle: number;
    maxArtifactRowsPerCycle: number;
  };
}

const HOUR_MS = 60 * 60_000;
const MINUTE_MS = 60_000;

const DEFAULT_POLICIES: Record<AccountMirrorProvider, AccountMirrorProviderPolitenessPolicy> = {
  chatgpt: {
    provider: 'chatgpt',
    minIntervalMs: 6 * HOUR_MS,
    explicitRefreshMinIntervalMs: 10 * MINUTE_MS,
    jitterMaxMs: 20 * MINUTE_MS,
    failureBaseCooldownMs: 30 * MINUTE_MS,
    failureMaxCooldownMs: 6 * HOUR_MS,
    hardStopCooldownMs: 12 * HOUR_MS,
    maxPageReadsPerCycle: 12,
    maxConversationRowsPerCycle: 250,
    maxArtifactRowsPerCycle: 80,
  },
  gemini: {
    provider: 'gemini',
    minIntervalMs: 12 * HOUR_MS,
    explicitRefreshMinIntervalMs: 30 * MINUTE_MS,
    jitterMaxMs: 45 * MINUTE_MS,
    failureBaseCooldownMs: 2 * HOUR_MS,
    failureMaxCooldownMs: 24 * HOUR_MS,
    hardStopCooldownMs: 24 * HOUR_MS,
    maxPageReadsPerCycle: 6,
    maxConversationRowsPerCycle: 120,
    maxArtifactRowsPerCycle: 40,
  },
  grok: {
    provider: 'grok',
    minIntervalMs: 8 * HOUR_MS,
    explicitRefreshMinIntervalMs: 20 * MINUTE_MS,
    jitterMaxMs: 30 * MINUTE_MS,
    failureBaseCooldownMs: 60 * MINUTE_MS,
    failureMaxCooldownMs: 12 * HOUR_MS,
    hardStopCooldownMs: 12 * HOUR_MS,
    maxPageReadsPerCycle: 8,
    maxConversationRowsPerCycle: 160,
    maxArtifactRowsPerCycle: 80,
  },
};

function normalizeIdentityKey(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTimestamp(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function mergePolicy(
  provider: AccountMirrorProvider,
  override: Partial<AccountMirrorProviderPolitenessPolicy> | null | undefined,
): AccountMirrorProviderPolitenessPolicy {
  return {
    ...DEFAULT_POLICIES[provider],
    ...override,
    provider,
  };
}

function hashForJitter(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getAccountMirrorJitterMs(input: {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId?: string | null;
  expectedIdentityKey?: string | null;
  anchorMs?: number | null;
  jitterMaxMs: number;
}): number {
  const jitterMaxMs = Math.max(0, Math.floor(input.jitterMaxMs));
  if (jitterMaxMs === 0) return 0;
  const seed = [
    input.provider,
    input.runtimeProfileId,
    input.browserProfileId ?? '',
    normalizeIdentityKey(input.expectedIdentityKey) ?? '',
    String(Math.floor((input.anchorMs ?? 0) / MINUTE_MS)),
  ].join('|');
  return hashForJitter(seed) % (jitterMaxMs + 1);
}

function getFailureCooldownMs(policy: AccountMirrorProviderPolitenessPolicy, failureCount: number): number {
  const normalizedFailureCount = Math.max(0, Math.floor(failureCount));
  if (normalizedFailureCount <= 0) return 0;
  const multiplier = 2 ** Math.min(8, normalizedFailureCount - 1);
  return Math.min(policy.failureMaxCooldownMs, policy.failureBaseCooldownMs * multiplier);
}

function createDecision(
  input: AccountMirrorPolitenessInput,
  policy: AccountMirrorProviderPolitenessPolicy,
  reason: AccountMirrorDelayReason,
  eligibleAtMs: number | null,
  jitterMs: number,
): AccountMirrorPolitenessDecision {
  const nowMs = input.nowMs ?? Date.now();
  const failureCooldownMs = getFailureCooldownMs(policy, input.consecutiveFailureCount ?? 0);
  const delayMs = eligibleAtMs === null ? 0 : Math.max(0, eligibleAtMs - nowMs);
  return {
    posture: reason === 'eligible' ? 'eligible' : reason === 'expected-identity-missing' || reason === 'identity-mismatch' ? 'blocked' : 'delay',
    reason,
    provider: input.provider,
    runtimeProfileId: input.runtimeProfileId,
    browserProfileId: input.browserProfileId ?? null,
    expectedIdentityKey: normalizeIdentityKey(input.expectedIdentityKey),
    detectedIdentityKey: normalizeIdentityKey(input.detectedIdentityKey),
    eligibleAtMs,
    delayMs,
    limits: {
      minIntervalMs: policy.minIntervalMs,
      explicitRefreshMinIntervalMs: policy.explicitRefreshMinIntervalMs,
      jitterMs,
      jitterMaxMs: policy.jitterMaxMs,
      failureCooldownMs,
      hardStopCooldownMs: policy.hardStopCooldownMs,
      maxPageReadsPerCycle: policy.maxPageReadsPerCycle,
      maxConversationRowsPerCycle: policy.maxConversationRowsPerCycle,
      maxArtifactRowsPerCycle: policy.maxArtifactRowsPerCycle,
    },
  };
}

export function evaluateAccountMirrorPoliteness(
  input: AccountMirrorPolitenessInput,
): AccountMirrorPolitenessDecision {
  const policy = mergePolicy(input.provider, input.policy);
  const nowMs = input.nowMs ?? Date.now();
  const expectedIdentityKey = normalizeIdentityKey(input.expectedIdentityKey);
  const detectedIdentityKey = normalizeIdentityKey(input.detectedIdentityKey);
  const zeroJitter = 0;

  if (!expectedIdentityKey) {
    return createDecision(input, policy, 'expected-identity-missing', null, zeroJitter);
  }

  if (detectedIdentityKey && detectedIdentityKey !== expectedIdentityKey) {
    return createDecision(input, policy, 'identity-mismatch', null, zeroJitter);
  }

  if (input.running) {
    return createDecision(input, policy, 'already-running', null, zeroJitter);
  }

  if (input.queued) {
    return createDecision(input, policy, 'already-queued', null, zeroJitter);
  }

  const providerCooldownUntilMs = normalizeTimestamp(input.providerCooldownUntilMs);
  if (providerCooldownUntilMs && providerCooldownUntilMs > nowMs) {
    return createDecision(input, policy, 'provider-cooldown', providerCooldownUntilMs, zeroJitter);
  }

  const providerHardStopAtMs = normalizeTimestamp(input.providerHardStopAtMs);
  if (providerHardStopAtMs) {
    const hardStopEligibleAtMs = providerHardStopAtMs + policy.hardStopCooldownMs;
    if (hardStopEligibleAtMs > nowMs) {
      return createDecision(input, policy, 'provider-hard-stop', hardStopEligibleAtMs, zeroJitter);
    }
  }

  const failureCount = Math.max(0, Math.floor(input.consecutiveFailureCount ?? 0));
  const failureCooldownMs = getFailureCooldownMs(policy, failureCount);
  const lastFailureAtMs = normalizeTimestamp(input.lastFailureAtMs);
  if (lastFailureAtMs && failureCooldownMs > 0) {
    const failureEligibleAtMs = lastFailureAtMs + failureCooldownMs;
    if (failureEligibleAtMs > nowMs) {
      return createDecision(input, policy, 'failure-backoff', failureEligibleAtMs, zeroJitter);
    }
  }

  const lastAttemptAtMs = normalizeTimestamp(input.lastAttemptAtMs);
  const lastSuccessAtMs = normalizeTimestamp(input.lastSuccessAtMs);
  const intervalAnchorMs = Math.max(lastAttemptAtMs ?? 0, lastSuccessAtMs ?? 0);
  if (intervalAnchorMs > 0) {
    const intervalMs = input.explicitRefresh ? policy.explicitRefreshMinIntervalMs : policy.minIntervalMs;
    const jitterMs = getAccountMirrorJitterMs({
      provider: input.provider,
      runtimeProfileId: input.runtimeProfileId,
      browserProfileId: input.browserProfileId,
      expectedIdentityKey,
      anchorMs: intervalAnchorMs,
      jitterMaxMs: policy.jitterMaxMs,
    });
    const intervalEligibleAtMs = intervalAnchorMs + intervalMs + jitterMs;
    if (intervalEligibleAtMs > nowMs) {
      return createDecision(input, policy, 'minimum-interval', intervalEligibleAtMs, jitterMs);
    }
    return createDecision(input, policy, 'eligible', intervalEligibleAtMs, jitterMs);
  }

  return createDecision(input, policy, 'eligible', nowMs, zeroJitter);
}

export function getDefaultAccountMirrorPolitenessPolicy(
  provider: AccountMirrorProvider,
): AccountMirrorProviderPolitenessPolicy {
  return { ...DEFAULT_POLICIES[provider] };
}
