import { describe, expect, test } from 'vitest';
import {
  createAccountMirrorBindingKey,
  createAccountMirrorTenantKey,
  normalizeAccountMirrorProviderIdentityKey,
} from '../../src/accountMirror/tenantBinding.js';

describe('account mirror tenant binding keys', () => {
  test('derives tenant keys from provider and normalized bound identity', () => {
    expect(createAccountMirrorTenantKey({
      provider: 'gemini',
      boundIdentityKey: ' Operator@Example.COM ',
    })).toBe('service-account:gemini:operator@example.com');
    expect(createAccountMirrorTenantKey({
      provider: 'chatgpt',
      boundIdentityKey: null,
    })).toBeNull();
  });

  test('derives binding keys from provider runtime profile and browser profile', () => {
    expect(createAccountMirrorBindingKey({
      provider: 'gemini',
      runtimeProfileId: 'eco-gemini',
      browserProfileId: 'stealth-rdp',
    })).toBe('binding:gemini:eco-gemini:stealth-rdp');
  });

  test('keeps provider-specific identity normalization on the shared path', () => {
    expect(normalizeAccountMirrorProviderIdentityKey('grok', ' @Valid_123 ')).toBe('@valid_123');
    expect(normalizeAccountMirrorProviderIdentityKey('grok', '@not-valid-handle')).toBeNull();
  });
});
