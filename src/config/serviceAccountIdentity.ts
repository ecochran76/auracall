import { getCurrentRuntimeProfiles } from './model.js';

type MutableRecord = Record<string, unknown>;

export type ConfiguredServiceAccountServiceId = 'chatgpt' | 'gemini' | 'grok';

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeServiceAccountIdentityKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function createConfiguredServiceAccountId(
  serviceId: ConfiguredServiceAccountServiceId,
  serviceConfig: unknown,
): string | null {
  if (!isRecord(serviceConfig) || !isRecord(serviceConfig.identity)) return null;
  const identityKey =
    normalizeServiceAccountIdentityKey(serviceConfig.identity.email) ??
    normalizeServiceAccountIdentityKey(serviceConfig.identity.handle) ??
    normalizeServiceAccountIdentityKey(serviceConfig.identity.name);
  return identityKey ? `service-account:${serviceId}:${identityKey}` : null;
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
