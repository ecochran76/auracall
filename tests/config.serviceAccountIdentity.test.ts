import { describe, expect, it } from 'vitest';
import {
  createConfiguredServiceAccountId,
  resolveConfiguredServiceAccountId,
} from '../src/config/serviceAccountIdentity.js';

describe('configured service account identity', () => {
  it('keeps the legacy email key for unqualified identities', () => {
    expect(
      createConfiguredServiceAccountId('chatgpt', {
        identity: { email: 'Operator@Example.com' },
      }),
    ).toBe('service-account:chatgpt:operator@example.com');
  });

  it('qualifies same-email ChatGPT accounts by account plan and structure', () => {
    const config = {
      profiles: {
        business: {
          services: {
            chatgpt: {
              identity: {
                email: 'operator@example.com',
                accountPlanType: 'team',
                accountStructure: 'workspace',
              },
            },
          },
        },
        personal: {
          services: {
            chatgpt: {
              identity: {
                email: 'operator@example.com',
                accountPlanType: 'pro',
                accountStructure: 'personal',
              },
            },
          },
        },
      },
    };

    expect(
      resolveConfiguredServiceAccountId(config, {
        serviceId: 'chatgpt',
        runtimeProfileId: 'business',
      }),
    ).toBe('service-account:chatgpt:operator@example.com|plan=team|structure=workspace');
    expect(
      resolveConfiguredServiceAccountId(config, {
        serviceId: 'chatgpt',
        runtimeProfileId: 'personal',
      }),
    ).toBe('service-account:chatgpt:operator@example.com|plan=pro|structure=personal');
  });

  it('can bind by account id when an email is unavailable', () => {
    expect(
      createConfiguredServiceAccountId('chatgpt', {
        identity: {
          accountId: '1FBB0E15-D5B5-4AA1-B767-BAFC39C2892F',
          accountPlanType: 'pro',
        },
      }),
    ).toBe('service-account:chatgpt:account-id=1fbb0e15-d5b5-4aa1-b767-bafc39c2892f|plan=pro');
  });
});
