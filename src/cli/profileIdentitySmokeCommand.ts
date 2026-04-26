import { getPreferredRuntimeProfile, getPreferredRuntimeProfileName } from '../config/model.js';
import { resolveConfiguredServiceAccountId } from '../config/serviceAccountIdentity.js';
import {
  checkProviderIdentityPreflight,
  describeProviderIdentity,
  type ProviderIdentityPreflightResult,
} from '../browser/providers/identityPreflight.js';
import type { BrowserProviderConfig, ProviderUserIdentity } from '../browser/providers/types.js';

type MutableRecord = Record<string, unknown>;

export const PROFILE_IDENTITY_SMOKE_CONTRACT = 'auracall.profile-identity-smoke';
export const PROFILE_IDENTITY_SMOKE_CONTRACT_VERSION = 1;

export type ProfileIdentitySmokeProvider = BrowserProviderConfig['id'];

export interface ResolvedConfiguredProviderIdentity {
  identity: ProviderUserIdentity | null;
  serviceAccountId: string | null;
  source: 'profile' | 'config' | null;
}

export interface ProfileIdentitySmokeNegativeCheck {
  requested: boolean;
  ok: boolean;
  expectedReason: string;
  preflight: ProviderIdentityPreflightResult | null;
}

export interface ProfileIdentitySmokeReport {
  contract: typeof PROFILE_IDENTITY_SMOKE_CONTRACT;
  version: typeof PROFILE_IDENTITY_SMOKE_CONTRACT_VERSION;
  generatedAt: string;
  runtimeProfile: string | null;
  target: ProfileIdentitySmokeProvider;
  launchedBrowser: boolean;
  expected: ResolvedConfiguredProviderIdentity;
  actualIdentity: ProviderUserIdentity | null;
  identityStatus: unknown;
  localReport: unknown;
  preflight: ProviderIdentityPreflightResult;
  negative: ProfileIdentitySmokeNegativeCheck;
}

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeProviderIdentity(identity: unknown, source: 'profile' | 'config'): ProviderUserIdentity | null {
  if (!isRecord(identity)) return null;
  const normalized: ProviderUserIdentity = { source };
  if (typeof identity.name === 'string' && identity.name.trim()) normalized.name = identity.name.trim();
  if (typeof identity.handle === 'string' && identity.handle.trim()) normalized.handle = identity.handle.trim();
  if (typeof identity.email === 'string' && identity.email.trim()) normalized.email = identity.email.trim();
  if (typeof identity.id === 'string' && identity.id.trim()) normalized.id = identity.id.trim();
  return Object.keys(normalized).some((key) => key !== 'source') ? normalized : null;
}

export function normalizeProfileIdentitySmokeProvider(value: unknown): ProfileIdentitySmokeProvider {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'chatgpt' || normalized === 'gemini' || normalized === 'grok') {
    return normalized;
  }
  throw new Error(`Invalid provider "${String(value)}". Use "chatgpt", "gemini", or "grok".`);
}

export function resolveConfiguredProviderIdentity(
  config: MutableRecord,
  input: {
    providerId: ProfileIdentitySmokeProvider;
    runtimeProfileId?: string | null;
    explicitAgentId?: string | null;
  },
): ResolvedConfiguredProviderIdentity {
  const runtimeProfileId =
    input.runtimeProfileId ??
    getPreferredRuntimeProfileName(config, {
      explicitAgentId: input.explicitAgentId ?? null,
    });
  const runtimeProfile = getPreferredRuntimeProfile(config, {
    explicitProfileName: runtimeProfileId,
    explicitAgentId: input.explicitAgentId ?? null,
  });
  const profileServices = isRecord(runtimeProfile?.services) ? runtimeProfile.services : null;
  const profileServiceValue = profileServices?.[input.providerId];
  const profileService = isRecord(profileServiceValue) ? profileServiceValue : null;
  const profileIdentity = normalizeProviderIdentity(profileService?.identity, 'profile');
  const globalServices = isRecord(config.services) ? config.services : null;
  const globalServiceValue = globalServices?.[input.providerId];
  const globalService = isRecord(globalServiceValue) ? globalServiceValue : null;
  const globalIdentity = normalizeProviderIdentity(globalService?.identity, 'config');
  const identity = profileIdentity ?? globalIdentity;
  return {
    identity,
    serviceAccountId: resolveConfiguredServiceAccountId(config, {
      serviceId: input.providerId,
      runtimeProfileId,
    }),
    source: identity?.source === 'profile' || identity?.source === 'config' ? identity.source : null,
  };
}

export function buildProfileIdentitySmokeReport(input: {
  config: MutableRecord;
  target: ProfileIdentitySmokeProvider;
  runtimeProfileId?: string | null;
  explicitAgentId?: string | null;
  actualIdentity: ProviderUserIdentity | null;
  identityStatus: unknown;
  localReport: unknown;
  launchedBrowser?: boolean;
  includeNegative?: boolean;
  generatedAt?: string;
}): ProfileIdentitySmokeReport {
  const runtimeProfile =
    input.runtimeProfileId ??
    getPreferredRuntimeProfileName(input.config, {
      explicitAgentId: input.explicitAgentId ?? null,
    });
  const expected = resolveConfiguredProviderIdentity(input.config, {
    providerId: input.target,
    runtimeProfileId: runtimeProfile,
    explicitAgentId: input.explicitAgentId ?? null,
  });
  const preflight = checkProviderIdentityPreflight({
    providerId: input.target,
    actualIdentity: input.actualIdentity,
    expectedIdentity: expected.identity,
    expectedServiceAccountId: expected.serviceAccountId,
  });
  const expectedReason = `${input.target}_expected_identity_missing`;
  const negativePreflight = input.includeNegative
    ? checkProviderIdentityPreflight({
        providerId: input.target,
        actualIdentity: input.actualIdentity,
        expectedIdentity: null,
        expectedServiceAccountId: null,
      })
    : null;
  return {
    contract: PROFILE_IDENTITY_SMOKE_CONTRACT,
    version: PROFILE_IDENTITY_SMOKE_CONTRACT_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runtimeProfile,
    target: input.target,
    launchedBrowser: Boolean(input.launchedBrowser),
    expected,
    actualIdentity: preflight.actualIdentity,
    identityStatus: input.identityStatus,
    localReport: input.localReport,
    preflight,
    negative: {
      requested: Boolean(input.includeNegative),
      ok: input.includeNegative
        ? Boolean(!negativePreflight?.ok && negativePreflight?.reason === expectedReason)
        : true,
      expectedReason,
      preflight: negativePreflight,
    },
  };
}

export function resolveProfileIdentitySmokeExitCode(report: ProfileIdentitySmokeReport): number {
  return report.preflight.ok && report.negative.ok ? 0 : 1;
}

export function formatProfileIdentitySmokeReport(report: ProfileIdentitySmokeReport): string {
  const expected =
    describeProviderIdentity(report.expected.identity) ??
    report.expected.serviceAccountId ??
    '(missing expected identity)';
  const actual = describeProviderIdentity(report.actualIdentity) ?? '(identity not detected)';
  const status = report.preflight.ok ? 'PASS' : `FAIL ${report.preflight.reason ?? 'unknown'}`;
  const negative =
    report.negative.requested
      ? `\nNegative missing-identity check: ${report.negative.ok ? 'PASS' : 'FAIL'} (${report.negative.expectedReason})`
      : '';
  return [
    `Profile identity smoke: ${status}`,
    `AuraCall runtime profile: ${report.runtimeProfile ?? '(none)'}`,
    `Target: ${report.target}`,
    `Expected: ${expected}`,
    `Actual: ${actual}`,
    `Browser launched: ${report.launchedBrowser ? 'yes' : 'no'}`,
    negative.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}
