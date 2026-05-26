import type { AccountMirrorProvider } from './politePolicy.js';

export type AccountMirrorTenantKey = string;
export type AccountMirrorBindingKey = string;

export function normalizeAccountMirrorIdentityKey(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeAccountMirrorProviderIdentityKey(
  provider: AccountMirrorProvider,
  value: string | null | undefined,
): string | null {
  const normalized = normalizeAccountMirrorIdentityKey(value);
  if (!normalized) return null;
  if (provider === 'grok' && normalized.startsWith('@') && !/^@[a-z0-9_]{2,30}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function createAccountMirrorTenantKey(input: {
  provider: AccountMirrorProvider;
  boundIdentityKey: string | null | undefined;
}): AccountMirrorTenantKey | null {
  const identityKey = normalizeAccountMirrorProviderIdentityKey(input.provider, input.boundIdentityKey);
  return identityKey ? `service-account:${input.provider}:${identityKey}` : null;
}

export function createAccountMirrorBindingKey(input: {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  browserProfileId: string | null | undefined;
}): AccountMirrorBindingKey {
  const runtimeProfileId = input.runtimeProfileId.trim() || 'default';
  const browserProfileId = input.browserProfileId?.trim() || 'unbound-browser-profile';
  return `binding:${input.provider}:${runtimeProfileId}:${browserProfileId}`;
}
