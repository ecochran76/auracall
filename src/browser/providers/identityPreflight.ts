import type { BrowserProviderConfig, BrowserProviderListOptions, ProviderUserIdentity } from './types.js';

export type ProviderIdentityPreflightReason =
  | `${BrowserProviderConfig['id']}_expected_identity_missing`
  | `${BrowserProviderConfig['id']}_identity_not_detected`
  | `${BrowserProviderConfig['id']}_identity_mismatch`
  | `${BrowserProviderConfig['id']}_account_session_drift`;

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
  if (normalizeStringOrNull(identity.accountId)) {
    normalized.accountId = normalizeStringOrNull(identity.accountId) ?? undefined;
  }
  if (normalizeStringOrNull(identity.accountLevel)) {
    normalized.accountLevel = normalizeStringOrNull(identity.accountLevel) ?? undefined;
  }
  if (normalizeStringOrNull(identity.accountPlanType)) {
    normalized.accountPlanType = normalizeStringOrNull(identity.accountPlanType) ?? undefined;
  }
  if (normalizeStringOrNull(identity.accountStructure)) {
    normalized.accountStructure = normalizeStringOrNull(identity.accountStructure) ?? undefined;
  }
  if (normalizeStringOrNull(identity.organizationId)) {
    normalized.organizationId = normalizeStringOrNull(identity.organizationId) ?? undefined;
  }
  if (normalizeStringOrNull(identity.capabilityProfile)) {
    normalized.capabilityProfile = normalizeStringOrNull(identity.capabilityProfile) ?? undefined;
  }
  if (normalizeStringOrNull(identity.proAccess)) {
    normalized.proAccess = normalizeStringOrNull(identity.proAccess) ?? undefined;
  }
  if (normalizeStringOrNull(identity.deepResearchAccess)) {
    normalized.deepResearchAccess = normalizeStringOrNull(identity.deepResearchAccess) ?? undefined;
  }
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

function expectedIdentityHasAccountKey(identity: ProviderUserIdentity | null): boolean {
  if (!identity) return false;
  return Boolean(
    normalizeIdentityComparable(identity.email) ||
      normalizeIdentityComparable(identity.handle) ||
      normalizeIdentityComparable(identity.id) ||
      normalizeIdentityComparable(identity.name) ||
      normalizeIdentityComparable(identity.accountId) ||
      normalizeIdentityComparable(identity.organizationId),
  );
}

function parseServiceAccountBinding(serviceAccountId: string): {
  base: string | null;
  qualifiers: Map<string, string>;
} | null {
  const accountKey = serviceAccountId.replace(/^service-account:[^:]+:/i, '');
  const [rawBase, ...rawQualifiers] = accountKey.split('|');
  const base = normalizeIdentityComparable(rawBase);
  const qualifiers = new Map<string, string>();
  for (const qualifier of rawQualifiers) {
    const separatorIndex = qualifier.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = normalizeIdentityComparable(qualifier.slice(0, separatorIndex));
    const value = normalizeIdentityComparable(qualifier.slice(separatorIndex + 1));
    if (key && value) qualifiers.set(key, value);
  }
  return base || qualifiers.size > 0 ? { base, qualifiers } : null;
}

function serviceAccountBaseMatches(base: string | null, actual: ProviderUserIdentity): boolean {
  if (!base) return true;
  const explicitAccountId = base.match(/^account-id=(.+)$/i)?.[1] ?? null;
  if (explicitAccountId) {
    return normalizeIdentityComparable(actual.accountId) === normalizeIdentityComparable(explicitAccountId);
  }
  const actualKeys = [
    actual.email,
    actual.handle,
    actual.id,
    actual.name,
    actual.accountId,
    actual.organizationId,
  ].map(normalizeIdentityComparable).filter((value): value is string => Boolean(value));
  return actualKeys.includes(base);
}

function serviceAccountQualifiersMatch(
  qualifiers: Map<string, string>,
  actual: ProviderUserIdentity,
): boolean {
  for (const [key, expected] of qualifiers) {
    const actualValue =
      key === 'account-id'
        ? actual.accountId
        : key === 'org'
          ? actual.organizationId
          : key === 'plan'
            ? actual.accountPlanType
            : key === 'structure'
              ? actual.accountStructure
              : null;
    if (normalizeIdentityComparable(actualValue) !== expected) return false;
  }
  return true;
}

function identityMatchesServiceAccountId(serviceAccountId: string | null, actual: ProviderUserIdentity): boolean | null {
  if (!serviceAccountId) return null;
  const binding = parseServiceAccountBinding(serviceAccountId);
  if (!binding) return null;
  return serviceAccountBaseMatches(binding.base, actual) &&
    serviceAccountQualifiersMatch(binding.qualifiers, actual);
}

function identitiesMatch(expected: ProviderUserIdentity, actual: ProviderUserIdentity): boolean {
  const expectedEmail = normalizeIdentityComparable(expected.email);
  if (expectedEmail && expectedEmail !== normalizeIdentityComparable(actual.email)) return false;
  const expectedHandle = normalizeIdentityComparable(expected.handle);
  if (expectedHandle && expectedHandle !== normalizeIdentityComparable(actual.handle)) return false;
  const expectedId = normalizeIdentityComparable(expected.id);
  if (expectedId && expectedId !== normalizeIdentityComparable(actual.id)) return false;
  const expectedName = normalizeIdentityComparable(expected.name);
  if (expectedName && expectedName !== normalizeIdentityComparable(actual.name)) return false;
  const expectedAccountId = normalizeIdentityComparable(expected.accountId);
  if (expectedAccountId && expectedAccountId !== normalizeIdentityComparable(actual.accountId)) return false;
  const expectedOrganizationId = normalizeIdentityComparable(expected.organizationId);
  if (expectedOrganizationId && expectedOrganizationId !== normalizeIdentityComparable(actual.organizationId)) {
    return false;
  }
  const expectedAccountLevel = normalizeIdentityComparable(expected.accountLevel);
  if (expectedAccountLevel && expectedAccountLevel !== normalizeIdentityComparable(actual.accountLevel)) return false;
  const expectedAccountPlanType = normalizeIdentityComparable(expected.accountPlanType);
  if (expectedAccountPlanType && expectedAccountPlanType !== normalizeIdentityComparable(actual.accountPlanType)) {
    return false;
  }
  const expectedAccountStructure = normalizeIdentityComparable(expected.accountStructure);
  if (expectedAccountStructure && expectedAccountStructure !== normalizeIdentityComparable(actual.accountStructure)) {
    return false;
  }
  return Boolean(
    expectedEmail ||
      expectedHandle ||
      expectedId ||
      expectedName ||
      expectedAccountId ||
      expectedOrganizationId,
  );
}

export function describeProviderIdentity(identity: ProviderUserIdentity | null | undefined): string | null {
  if (!identity) return null;
  return normalizeStringOrNull(identity.email) ??
    normalizeStringOrNull(identity.handle) ??
    normalizeStringOrNull(identity.name) ??
    normalizeStringOrNull(identity.id) ??
    normalizeStringOrNull(identity.accountId);
}

export function checkProviderIdentityPreflight(input: {
  providerId: BrowserProviderConfig['id'];
  actualIdentity: ProviderUserIdentity | null | undefined;
  fallbackIdentity?: ProviderUserIdentity | null;
  expectedIdentity?: ProviderUserIdentity | null;
  expectedServiceAccountId?: string | null;
}): ProviderIdentityPreflightResult {
  const expectedIdentity = normalizeExpectedProviderIdentity(input.expectedIdentity);
  const expectedServiceAccountId = normalizeStringOrNull(input.expectedServiceAccountId);
  const actualIdentity =
    normalizeExpectedProviderIdentity(input.actualIdentity) ??
    normalizeExpectedProviderIdentity(input.fallbackIdentity);
  const reason = (
    suffix: 'expected_identity_missing' | 'identity_not_detected' | 'identity_mismatch' | 'account_session_drift',
  ) =>
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
  const expectedHasAccountKey = expectedIdentityHasAccountKey(expectedIdentity);
  const serviceAccountMatchesActual = identityMatchesServiceAccountId(expectedServiceAccountId, actualIdentity);
  if (!expectedHasAccountKey && serviceAccountMatchesActual !== true) {
    return {
      ok: false,
      reason: expectedServiceAccountId ? reason('account_session_drift') : reason('expected_identity_missing'),
      providerId: input.providerId,
      expectedServiceAccountId,
      expectedIdentity,
      actualIdentity,
    };
  }
  if (expectedIdentity && expectedHasAccountKey && !identitiesMatch(expectedIdentity, actualIdentity)) {
    return {
      ok: false,
      reason: reason(expectedServiceAccountId ? 'account_session_drift' : 'identity_mismatch'),
      providerId: input.providerId,
      expectedServiceAccountId,
      expectedIdentity,
      actualIdentity,
    };
  }
  if (expectedServiceAccountId && serviceAccountMatchesActual === false) {
    return {
      ok: false,
      reason: reason('account_session_drift'),
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
  fallbackIdentity?: ProviderUserIdentity | null;
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
  if (preflight.reason?.endsWith('_account_session_drift')) {
    const binding = preflight.expectedServiceAccountId
      ? ` Bound service account: ${preflight.expectedServiceAccountId}.`
      : '';
    throw new Error(
      `${providerLabel} browser auth preflight failed (${preflight.reason}); account_session_drift: expected ${expected}, found ${actual}.${binding} ` +
        `The browser/runtime profile binding and the ${providerLabel} app session disagree; switch/sign into the expected account for this AuraCall runtime profile or update the binding before retrying.`,
    );
  }
  throw new Error(
    `${providerLabel} browser auth preflight failed (${preflight.reason}); expected ${expected}, found ${actual}.`,
  );
}
