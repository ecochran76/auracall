import { getCurrentRuntimeProfiles } from './model.js';

type MutableRecord = Record<string, unknown>;

export type ConfiguredServiceAccountServiceId = 'chatgpt' | 'gemini' | 'grok';

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeServiceAccountIdentityKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[|=]/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function readIdentityKey(identity: MutableRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeServiceAccountIdentityKey(identity[key]);
    if (value) return value;
  }
  return null;
}

function readIdentityQualifiers(identity: MutableRecord): Array<[string, string]> {
  const qualifiers: Array<[string, unknown]> = [
    ['account-id', identity.accountId],
    ['org', identity.organizationId],
    ['plan', identity.accountPlanType],
    ['structure', identity.accountStructure],
  ];
  return qualifiers.flatMap(([key, value]) => {
    const normalized = normalizeServiceAccountIdentityKey(value);
    return normalized ? [[key, normalized] as [string, string]] : [];
  });
}

export function createConfiguredServiceAccountId(
  serviceId: ConfiguredServiceAccountServiceId,
  serviceConfig: unknown,
): string | null {
  if (!isRecord(serviceConfig) || !isRecord(serviceConfig.identity)) return null;
  const identity = serviceConfig.identity;
  const identityKey = readIdentityKey(identity, ['email', 'handle', 'id', 'name']);
  const qualifiers = readIdentityQualifiers(identity);
  if (identityKey) {
    const suffix = qualifiers.map(([key, value]) => `|${key}=${value}`).join('');
    return `service-account:${serviceId}:${identityKey}${suffix}`;
  }

  const accountId = normalizeServiceAccountIdentityKey(identity.accountId);
  if (!accountId) return null;
  const suffix = qualifiers
    .filter(([key]) => key !== 'account-id')
    .map(([key, value]) => `|${key}=${value}`)
    .join('');
  return `service-account:${serviceId}:account-id=${accountId}${suffix}`;
}

export function resolveConfiguredServiceAccountId(
  config: Record<string, unknown>,
  input: {
    serviceId: ConfiguredServiceAccountServiceId | null;
    runtimeProfileId?: string | null;
  },
): string | null {
  if (!input.serviceId) return null;

  const runtimeProfiles = getCurrentRuntimeProfiles(config);
  const runtimeProfile =
    input.runtimeProfileId && isRecord(runtimeProfiles[input.runtimeProfileId])
      ? runtimeProfiles[input.runtimeProfileId]
      : null;
  const profileServices = runtimeProfile && isRecord(runtimeProfile.services) ? runtimeProfile.services : null;
  const globalServices = isRecord(config.services) ? config.services : {};

  return (
    createConfiguredServiceAccountId(input.serviceId, profileServices?.[input.serviceId]) ??
    createConfiguredServiceAccountId(input.serviceId, globalServices[input.serviceId])
  );
}
