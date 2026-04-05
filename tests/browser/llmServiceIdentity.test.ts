import { describe, expect, test, vi } from 'vitest';
import type { ResolvedUserConfig } from '../../src/config.js';
import type { BrowserProviderListOptions, ProviderUserIdentity } from '../../src/browser/providers/types.js';
import { LlmService } from '../../src/browser/llmService/llmService.js';
import type { LlmServiceAdapter, IdentityPrompt } from '../../src/browser/llmService/types.js';
import { deriveProviderIdentityFromChromeGoogleAccount } from '../../src/browser/profileDoctor.js';

class IdentityTestLlmService extends LlmService {
  constructor(
    userConfig: ResolvedUserConfig,
    provider: LlmServiceAdapter,
    options?: { identityPrompt?: IdentityPrompt },
  ) {
    super(userConfig, provider, {} as never, options);
  }

  async listProjects(): Promise<[]> {
    return [];
  }

  async listConversations(): Promise<[]> {
    return [];
  }

  async renameConversation(): Promise<void> {}

  async deleteConversation(): Promise<void> {}

  async getUserIdentity(options?: BrowserProviderListOptions): Promise<ProviderUserIdentity | null> {
    return this.provider.getUserIdentity ? this.provider.getUserIdentity(options) : null;
  }
}

describe('llmService cache identity resolution', () => {
  test('derives a provider identity from managed-profile Google account state', () => {
    expect(deriveProviderIdentityFromChromeGoogleAccount({
      provider: 'google',
      source: 'merged',
      status: 'signed-in',
      chromeProfile: 'Default',
      profileName: 'Default',
      displayName: 'Polymer Consult',
      givenName: 'Polymer',
      email: 'consult@polymerconsultingroup.com',
      gaiaId: '123',
      consentedPrimaryAccount: true,
      explicitBrowserSignin: true,
      activeAccounts: 1,
      localStatePath: '/tmp/Local State',
      preferencesPath: '/tmp/Preferences',
    })).toEqual({
      name: 'Polymer Consult',
      email: 'consult@polymerconsultingroup.com',
      source: 'managed-profile-google-account',
    });
  });

  test('auto-detects browser identity before prompting by default', async () => {
    const getUserIdentity = vi.fn(async () => ({
      email: 'ecochran76@gmail.com',
      name: 'Eric Cochra',
      source: 'auth-session',
    }));
    const identityPrompt = vi.fn(async () => ({
      email: 'prompted@example.com',
      source: 'prompt',
    }));
    const provider = {
      id: 'chatgpt',
      config: { id: 'chatgpt', selectors: {} as never },
      getUserIdentity,
    } satisfies LlmServiceAdapter;
    const service = new IdentityTestLlmService({ browser: { cache: {} } } as ResolvedUserConfig, provider, {
      identityPrompt,
    });

    await expect(service.resolveCacheIdentity({})).resolves.toEqual({
      userIdentity: {
        email: 'ecochran76@gmail.com',
        name: 'Eric Cochra',
        source: 'auth-session',
      },
      identityKey: 'ecochran76@gmail.com',
      featureSignature: null,
    });
    expect(getUserIdentity).toHaveBeenCalledTimes(1);
    expect(identityPrompt).not.toHaveBeenCalled();
  });

  test('respects explicit cache.useDetectedIdentity = false', async () => {
    const getUserIdentity = vi.fn(async () => ({
      email: 'ecochran76@gmail.com',
      name: 'Eric Cochra',
      source: 'auth-session',
    }));
    const identityPrompt = vi.fn(async () => ({
      email: 'prompted@example.com',
      source: 'prompt',
    }));
    const provider = {
      id: 'chatgpt',
      config: { id: 'chatgpt', selectors: {} as never },
      getUserIdentity,
    } satisfies LlmServiceAdapter;
    const service = new IdentityTestLlmService(
      { browser: { cache: { useDetectedIdentity: false } } } as ResolvedUserConfig,
      provider,
      { identityPrompt },
    );

    await expect(service.resolveCacheIdentity({})).resolves.toEqual({
      userIdentity: {
        email: 'prompted@example.com',
        source: 'prompt',
      },
      identityKey: 'prompted@example.com',
      featureSignature: null,
    });
    expect(getUserIdentity).not.toHaveBeenCalled();
    expect(identityPrompt).toHaveBeenCalledTimes(1);
  });

  test('includes configured and detected feature state in the cache signature', async () => {
    const provider = {
      id: 'chatgpt',
      config: { id: 'chatgpt', selectors: {} as never },
      getFeatureSignature: vi.fn(async () =>
        JSON.stringify({ detector: 'chatgpt-feature-probe-v1', web_search: true, apps: ['github'] }),
      ),
    } satisfies LlmServiceAdapter;
    const service = new IdentityTestLlmService(
      ({
        model: 'gpt-5.1-pro',
        browser: { cache: {} },
        auracallProfile: 'default',
        auracallProfiles: {
          default: {
            services: {
              chatgpt: {
                features: {
                  deep_research: true,
                },
              },
            },
          },
        },
      } as unknown) as ResolvedUserConfig,
      provider,
    );

    const identity = await service.resolveCacheIdentity({});
    expect(identity.userIdentity).toBeNull();
    expect(identity.identityKey).toBeNull();
    expect(JSON.parse(identity.featureSignature ?? 'null')).toEqual({
      configured: { deep_research: true },
      detected: { detector: 'chatgpt-feature-probe-v1', web_search: true, apps: ['github'] },
    });
  });

  test('reads active runtime profile features from current profiles bridge when legacy auracallProfiles is absent', async () => {
    const provider = {
      id: 'chatgpt',
      config: { id: 'chatgpt', selectors: {} as never },
      getFeatureSignature: vi.fn(async () =>
        JSON.stringify({ detector: 'chatgpt-feature-probe-v1', web_search: true }),
      ),
    } satisfies LlmServiceAdapter;
    const service = new IdentityTestLlmService(
      ({
        model: 'gpt-5.2-pro',
        browser: { cache: {} },
        auracallProfile: 'consulting',
        profiles: {
          consulting: {
            services: {
              chatgpt: {
                features: {
                  deep_research: true,
                },
              },
            },
          },
        },
      } as unknown) as ResolvedUserConfig,
      provider,
    );

    const identity = await service.resolveCacheIdentity({});
    expect(JSON.parse(identity.featureSignature ?? 'null')).toEqual({
      configured: { deep_research: true },
      detected: { detector: 'chatgpt-feature-probe-v1', web_search: true },
    });
  });
});
