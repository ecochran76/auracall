import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserWorkbenchCapabilityDiscovery } from '../src/workbench/browserDiscovery.js';
import type { ResolvedUserConfig } from '../src/config.js';

const browserClientMock = vi.hoisted(() => {
  const getFeatureSignature = vi.fn();
  const fromConfig = vi.fn(async () => ({
    getFeatureSignature,
  }));
  return {
    getFeatureSignature,
    fromConfig,
  };
});

vi.mock('../src/browser/client.js', () => ({
  BrowserAutomationClient: {
    fromConfig: browserClientMock.fromConfig,
  },
}));

describe('browser-backed workbench capability discovery', () => {
  const userConfig = {
    auracallProfile: 'default',
  } as ResolvedUserConfig;

  beforeEach(() => {
    browserClientMock.fromConfig.mockClear();
    browserClientMock.getFeatureSignature.mockReset();
  });

  it('maps Gemini browser tool drawer labels into provider capabilities', async () => {
    browserClientMock.getFeatureSignature.mockResolvedValue(JSON.stringify({
      detector: 'gemini-feature-probe-v1',
      modes: ['Images', 'Music', 'Videos', 'Deep research'],
    }));
    const discover = createBrowserWorkbenchCapabilityDiscovery(userConfig);

    const capabilities = await discover({ provider: 'gemini', category: 'media' });

    expect(browserClientMock.fromConfig).toHaveBeenCalledWith(userConfig, { target: 'gemini' });
    expect(browserClientMock.getFeatureSignature).toHaveBeenCalledWith(undefined);
    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'gemini.media.create_image',
        providerLabels: ['Images'],
        availability: 'available',
        source: 'browser_discovery',
      }),
      expect.objectContaining({
        id: 'gemini.media.create_music',
        providerLabels: ['Music'],
      }),
      expect.objectContaining({
        id: 'gemini.media.create_video',
        providerLabels: ['Videos'],
      }),
      expect.objectContaining({
        id: 'gemini.research.deep_research',
        category: 'research',
      }),
    ]));
  });

  it('maps ChatGPT browser apps, skills, and research labels into capabilities', async () => {
    browserClientMock.getFeatureSignature.mockResolvedValue(JSON.stringify({
      detector: 'chatgpt-feature-probe-v1',
      detected: {
        web_search: true,
        deep_research: true,
        company_knowledge: true,
        apps: ['github', 'google drive'],
        skills: ['study and learn'],
      },
    }));
    const discover = createBrowserWorkbenchCapabilityDiscovery(userConfig);

    const capabilities = await discover({ provider: 'chatgpt' });

    expect(browserClientMock.fromConfig).toHaveBeenCalledWith(userConfig, { target: 'chatgpt' });
    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'chatgpt.search.web_search',
        availability: 'available',
      }),
      expect.objectContaining({
        id: 'chatgpt.research.deep_research',
        safety: expect.objectContaining({ mayTakeMinutes: true }),
      }),
      expect.objectContaining({
        id: 'chatgpt.apps.github',
        providerLabels: ['GitHub'],
        safety: expect.objectContaining({ requiresUserConsent: true }),
      }),
      expect.objectContaining({
        id: 'chatgpt.apps.google_drive',
        providerLabels: ['Google Drive'],
      }),
      expect.objectContaining({
        id: 'chatgpt.skills.study_and_learn',
        providerLabels: ['Study And Learn'],
      }),
    ]));
  });

  it('passes Grok Imagine entrypoint discovery options through the browser service', async () => {
    browserClientMock.getFeatureSignature.mockResolvedValue(JSON.stringify({
      detector: 'grok-feature-probe-v1',
      imagine: {
        visible: true,
        modes: ['image-to-video'],
        labels: ['Imagine'],
        discovery_action: {
          action: 'grok-imagine-video-mode',
          status: 'observed_video_mode',
          afterMode: 'Video',
        },
      },
    }));
    const discover = createBrowserWorkbenchCapabilityDiscovery(userConfig);

    const capabilities = await discover({
      provider: 'grok',
      entrypoint: 'grok-imagine',
      discoveryAction: 'grok-imagine-video-mode',
    });

    expect(browserClientMock.fromConfig).toHaveBeenCalledWith(userConfig, { target: 'grok' });
    expect(browserClientMock.getFeatureSignature).toHaveBeenCalledWith({
      configuredUrl: 'https://grok.com/imagine',
      preserveActiveTab: true,
      discoveryAction: 'grok-imagine-video-mode',
      mutationSourcePrefix: 'workbench:grok-imagine',
    });
    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'grok.media.imagine_video',
        availability: 'available',
        metadata: expect.objectContaining({
          discoveryAction: expect.objectContaining({
            action: 'grok-imagine-video-mode',
            afterMode: 'Video',
          }),
        }),
      }),
    ]));
  });
});
