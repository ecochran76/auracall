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
export const PROFILE_IDENTITY_SMOKE_BATCH_CONTRACT = 'auracall.profile-identity-smoke.batch';

export type ProfileIdentitySmokeProvider = BrowserProviderConfig['id'];
export const PROFILE_IDENTITY_SMOKE_PROVIDERS: readonly ProfileIdentitySmokeProvider[] = [
  'chatgpt',
  'gemini',
  'grok',
];

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

export interface ProfileIdentitySmokeBatchReport {
  contract: typeof PROFILE_IDENTITY_SMOKE_BATCH_CONTRACT;
  version: typeof PROFILE_IDENTITY_SMOKE_CONTRACT_VERSION;
  generatedAt: string;
  runtimeProfile: string | null;
  mode: 'all' | 'all-bound';
  targets: ProfileIdentitySmokeProvider[];
  reports: ProfileIdentitySmokeReport[];
  ok: boolean;
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
  if (typeof identity.accountId === 'string' && identity.accountId.trim()) {
    normalized.accountId = identity.accountId.trim();
  }
  if (typeof identity.accountLevel === 'string' && identity.accountLevel.trim()) {
    normalized.accountLevel = identity.accountLevel.trim();
  }
  if (typeof identity.accountPlanType === 'string' && identity.accountPlanType.trim()) {
    normalized.accountPlanType = identity.accountPlanType.trim();
  }
  if (typeof identity.accountStructure === 'string' && identity.accountStructure.trim()) {
    normalized.accountStructure = identity.accountStructure.trim();
  }
  if (typeof identity.organizationId === 'string' && identity.organizationId.trim()) {
    normalized.organizationId = identity.organizationId.trim();
  }
  if (typeof identity.capabilityProfile === 'string' && identity.capabilityProfile.trim()) {
    normalized.capabilityProfile = identity.capabilityProfile.trim();
  }
  if (typeof identity.proAccess === 'string' && identity.proAccess.trim()) {
    normalized.proAccess = identity.proAccess.trim();
  }
  if (typeof identity.deepResearchAccess === 'string' && identity.deepResearchAccess.trim()) {
    normalized.deepResearchAccess = identity.deepResearchAccess.trim();
  }
  return Object.keys(normalized).some((key) => key !== 'source') ? normalized : null;
}

export function normalizeProfileIdentitySmokeProvider(value: unknown): ProfileIdentitySmokeProvider {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'chatgpt' || normalized === 'gemini' || normalized === 'grok') {
    return normalized;
  }
  throw new Error(`Invalid provider "${String(value)}". Use "chatgpt", "gemini", or "grok".`);
}

export function resolveProfileIdentitySmokeTargets(
  config: MutableRecord,
  input: {
    explicitTarget?: unknown;
    all?: boolean;
    allBound?: boolean;
    runtimeProfileId?: string | null;
    explicitAgentId?: string | null;
    fallbackTarget?: unknown;
  },
): ProfileIdentitySmokeProvider[] {
  if (input.all && input.allBound) {
    throw new Error('Use only one of --all or --all-bound.');
  }
  if (input.explicitTarget && (input.all || input.allBound)) {
    throw new Error('Use --target with a single smoke, or --all/--all-bound for a profile-wide smoke.');
  }
  if (input.all) {
    return [...PROFILE_IDENTITY_SMOKE_PROVIDERS];
  }
  if (input.allBound) {
    return PROFILE_IDENTITY_SMOKE_PROVIDERS.filter((providerId) => {
      const expected = resolveConfiguredProviderIdentity(config, {
        providerId,
        runtimeProfileId: input.runtimeProfileId,
        explicitAgentId: input.explicitAgentId ?? null,
      });
      return Boolean(expected.identity || expected.serviceAccountId);
    });
  }
  return [normalizeProfileIdentitySmokeProvider(input.explicitTarget ?? input.fallbackTarget ?? 'chatgpt')];
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

export function buildProfileIdentitySmokeBatchReport(input: {
  reports: ProfileIdentitySmokeReport[];
  mode: 'all' | 'all-bound';
  runtimeProfile?: string | null;
  generatedAt?: string;
}): ProfileIdentitySmokeBatchReport {
  return {
    contract: PROFILE_IDENTITY_SMOKE_BATCH_CONTRACT,
    version: PROFILE_IDENTITY_SMOKE_CONTRACT_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runtimeProfile: input.runtimeProfile ?? input.reports[0]?.runtimeProfile ?? null,
    mode: input.mode,
    targets: input.reports.map((report) => report.target),
    reports: input.reports,
    ok: input.reports.every((report) => resolveProfileIdentitySmokeExitCode(report) === 0),
  };
}

export function resolveProfileIdentitySmokeBatchExitCode(report: ProfileIdentitySmokeBatchReport): number {
  return report.ok ? 0 : 1;
}

export function formatProfileIdentitySmokeReport(report: ProfileIdentitySmokeReport): string {
  const expected =
    describeProviderIdentity(report.expected.identity) ??
    report.expected.serviceAccountId ??
    '(missing expected identity)';
  const actual = describeProviderIdentity(report.actualIdentity) ?? '(identity not detected)';
  const expectedAccountLevel = report.expected.identity?.accountLevel ?? null;
  const actualAccountLevel = report.actualIdentity?.accountLevel ?? null;
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
    expectedAccountLevel || actualAccountLevel
      ? `Account level: expected ${expectedAccountLevel ?? '(not configured)'}; actual ${actualAccountLevel ?? '(not detected)'}`
      : '',
    `Browser launched: ${report.launchedBrowser ? 'yes' : 'no'}`,
    negative.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatProfileIdentitySmokeBatchReport(report: ProfileIdentitySmokeBatchReport): string {
  const header = `Profile identity smoke batch: ${report.ok ? 'PASS' : 'FAIL'} (${report.mode}, AuraCall runtime profile ${
    report.runtimeProfile ?? '(none)'
  })`;
  const body = report.reports
    .map((single) => {
      const expected =
        describeProviderIdentity(single.expected.identity) ??
        single.expected.serviceAccountId ??
        '(missing expected identity)';
      const actual = describeProviderIdentity(single.actualIdentity) ?? '(identity not detected)';
      const expectedAccountLevel = single.expected.identity?.accountLevel ?? null;
      const actualAccountLevel = single.actualIdentity?.accountLevel ?? null;
      const accountLevel =
        expectedAccountLevel || actualAccountLevel
          ? `; account level expected ${expectedAccountLevel ?? '(not configured)'}, actual ${actualAccountLevel ?? '(not detected)'}`
          : '';
      const status = single.preflight.ok && single.negative.ok ? 'PASS' : `FAIL ${single.preflight.reason ?? 'unknown'}`;
      return `- ${single.target}: ${status}; expected ${expected}; actual ${actual}${accountLevel}; launched ${
        single.launchedBrowser ? 'yes' : 'no'
      }`;
    })
    .join('\n');
  return `${header}\n${body}`;
}
