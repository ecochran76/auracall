import type { BrowserProviderConfig, BrowserProviderListOptions, ProviderUserIdentity } from './types.js';

export type ProviderIdentityPreflightReason =
  | `${BrowserProviderConfig['id']}_expected_identity_missing`
  | `${BrowserProviderConfig['id']}_identity_not_detected`
  | `${BrowserProviderConfig['id']}_identity_mismatch`;

export interface ProviderIdentityPreflightResult {
  ok: boolean;
  reason: ProviderIdentityPreflightReason | null;
  providerId: BrowserProviderConfig['id'];
  expectedServiceAccountId: string | null;
  expectedIdentity: ProviderUserIdentity | null;
  actualIdentity: ProviderUserIdentity | null;
}

export function providerIdentityPreflightRequested(options: BrowserProviderListOptions | undefined): boolean {
  return Boolean(
    options &&
      (Object.hasOwn(options, 'expectedUserIdentity') || Object.hasOwn(options, 'expectedServiceAccountId')),
  );
}

export function normalizeExpectedProviderIdentity(
  identity: ProviderUserIdentity | null | undefined,
): ProviderUserIdentity | null {
  if (!identity) return null;
  const normalized: ProviderUserIdentity = {};
  if (normalizeStringOrNull(identity.id)) normalized.id = normalizeStringOrNull(identity.id) ?? undefined;
  if (normalizeStringOrNull(identity.email)) normalized.email = normalizeStringOrNull(identity.email) ?? undefined;
  if (normalizeIdentityComparable(identity.handle)) normalized.handle = identity.handle?.trim();
  if (normalizeStringOrNull(identity.name)) normalized.name = normalizeStringOrNull(identity.name) ?? undefined;
  if (normalizeStringOrNull(identity.source)) normalized.source = normalizeStringOrNull(identity.source) ?? undefined;
  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function normalizeStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIdentityComparable(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function identitiesMatch(expected: ProviderUserIdentity, actual: ProviderUserIdentity): boolean {
  const expectedEmail = normalizeIdentityComparable(expected.email);
  if (expectedEmail && expectedEmail === normalizeIdentityComparable(actual.email)) return true;
  const expectedHandle = normalizeIdentityComparable(expected.handle);
  if (expectedHandle && expectedHandle === normalizeIdentityComparable(actual.handle)) return true;
  const expectedId = normalizeIdentityComparable(expected.id);
  if (expectedId && expectedId === normalizeIdentityComparable(actual.id)) return true;
  const expectedName = normalizeIdentityComparable(expected.name);
  if (expectedName && expectedName === normalizeIdentityComparable(actual.name)) return true;
  return false;
}

export function describeProviderIdentity(identity: ProviderUserIdentity | null | undefined): string | null {
  if (!identity) return null;
  return normalizeStringOrNull(identity.email) ??
    normalizeStringOrNull(identity.handle) ??
    normalizeStringOrNull(identity.name) ??
    normalizeStringOrNull(identity.id);
}

export function checkProviderIdentityPreflight(input: {
  providerId: BrowserProviderConfig['id'];
  actualIdentity: ProviderUserIdentity | null | undefined;
  expectedIdentity?: ProviderUserIdentity | null;
  expectedServiceAccountId?: string | null;
}): ProviderIdentityPreflightResult {
  const expectedIdentity = normalizeExpectedProviderIdentity(input.expectedIdentity);
  const expectedServiceAccountId = normalizeStringOrNull(input.expectedServiceAccountId);
  const actualIdentity = normalizeExpectedProviderIdentity(input.actualIdentity);
  const reason = (suffix: 'expected_identity_missing' | 'identity_not_detected' | 'identity_mismatch') =>
    `${input.providerId}_${suffix}` as ProviderIdentityPreflightReason;

  if (!actualIdentity) {
    return {
      ok: false,
      reason: reason('identity_not_detected'),
      providerId: input.providerId,
      expectedServiceAccountId,
      expectedIdentity,
      actualIdentity,
    };
  }
  if (!expectedIdentity && !expectedServiceAccountId) {
    return {
      ok: false,
      reason: reason('expected_identity_missing'),
      providerId: input.providerId,
      expectedServiceAccountId,
      expectedIdentity,
      actualIdentity,
    };
  }
  if (expectedIdentity && !identitiesMatch(expectedIdentity, actualIdentity)) {
    return {
      ok: false,
      reason: reason('identity_mismatch'),
      providerId: input.providerId,
      expectedServiceAccountId,
      expectedIdentity,
      actualIdentity,
    };
  }
  return {
    ok: true,
    reason: null,
    providerId: input.providerId,
    expectedServiceAccountId,
    expectedIdentity,
    actualIdentity,
  };
}

export function assertProviderIdentityPreflight(input: {
  providerId: BrowserProviderConfig['id'];
  actualIdentity: ProviderUserIdentity | null | undefined;
  expectedIdentity?: ProviderUserIdentity | null;
  expectedServiceAccountId?: string | null;
}): ProviderIdentityPreflightResult {
  const preflight = checkProviderIdentityPreflight(input);
  if (preflight.ok) return preflight;
  const providerLabel = input.providerId.charAt(0).toUpperCase() + input.providerId.slice(1);
  if (preflight.reason?.endsWith('_expected_identity_missing')) {
    const actual = describeProviderIdentity(preflight.actualIdentity) ?? 'detected signed-in account';
    throw new Error(
      `${providerLabel} browser auth preflight failed (${preflight.reason}); no expected ${providerLabel} account is configured, found ${actual}. ` +
        'Bind the detected account to this AuraCall runtime profile before retrying.',
    );
  }
  const expected =
    describeProviderIdentity(preflight.expectedIdentity) ??
    preflight.expectedServiceAccountId ??
    `configured ${providerLabel} account`;
  const actual = describeProviderIdentity(preflight.actualIdentity) ?? 'unknown account';
  throw new Error(
    `${providerLabel} browser auth preflight failed (${preflight.reason}); expected ${expected}, found ${actual}.`,
  );
}

