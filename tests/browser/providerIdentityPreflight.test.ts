import { describe, expect, test } from 'vitest';
import {
  assertProviderIdentityPreflight,
  checkProviderIdentityPreflight,
  providerIdentityPreflightRequested,
} from '../../src/browser/providers/identityPreflight.js';

describe('provider identity preflight', () => {
  test('is requested when runtime explicitly carries expected identity fields, even when null', () => {
    expect(providerIdentityPreflightRequested({ expectedUserIdentity: null })).toBe(true);
    expect(providerIdentityPreflightRequested({ expectedServiceAccountId: null })).toBe(true);
    expect(providerIdentityPreflightRequested({})).toBe(false);
    expect(providerIdentityPreflightRequested(undefined)).toBe(false);
  });

  test('fails when a signed-in account has no configured expectation', () => {
    expect(checkProviderIdentityPreflight({
      providerId: 'chatgpt',
      actualIdentity: { email: 'ecochran76@gmail.com', source: 'auth-session' },
      expectedIdentity: null,
      expectedServiceAccountId: null,
    })).toMatchObject({
      ok: false,
      reason: 'chatgpt_expected_identity_missing',
      actualIdentity: { email: 'ecochran76@gmail.com' },
    });
  });

  test('accepts matching configured email and rejects mismatch', () => {
    expect(checkProviderIdentityPreflight({
      providerId: 'gemini',
      actualIdentity: { email: 'ecochran76@gmail.com', source: 'google-account-label' },
      expectedIdentity: { email: 'ecochran76@gmail.com', source: 'profile' },
      expectedServiceAccountId: 'service-account:gemini:ecochran76@gmail.com',
    })).toMatchObject({ ok: true, reason: null });

    expect(() => assertProviderIdentityPreflight({
      providerId: 'chatgpt',
      actualIdentity: { email: 'ecochran76@gmail.com' },
      expectedIdentity: { email: 'consult@polymerconsultinggroup.com' },
      expectedServiceAccountId: 'service-account:chatgpt:consult@polymerconsultinggroup.com',
    })).toThrow(/chatgpt_identity_mismatch/);
  });

  test('checks configured account level when provided', () => {
    expect(checkProviderIdentityPreflight({
      providerId: 'chatgpt',
      actualIdentity: { email: 'operator@example.com', accountLevel: 'Pro', source: 'auth-session' },
      expectedIdentity: { email: 'operator@example.com', accountLevel: 'Pro', source: 'profile' },
      expectedServiceAccountId: 'service-account:chatgpt:operator@example.com',
    })).toMatchObject({ ok: true, reason: null });

    expect(checkProviderIdentityPreflight({
      providerId: 'chatgpt',
      actualIdentity: { email: 'operator@example.com', accountLevel: 'Business', source: 'auth-session' },
      expectedIdentity: { email: 'operator@example.com', accountLevel: 'Pro', source: 'profile' },
      expectedServiceAccountId: 'service-account:chatgpt:operator@example.com',
    })).toMatchObject({
      ok: false,
      reason: 'chatgpt_identity_mismatch',
    });
  });
});
