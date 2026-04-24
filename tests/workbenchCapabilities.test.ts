import { describe, expect, it } from 'vitest';
import { createWorkbenchCapabilityService } from '../src/workbench/service.js';
import { deriveGeminiWorkbenchCapabilitiesFromFeatureSignature } from '../src/workbench/geminiDiscovery.js';
import { deriveChatgptWorkbenchCapabilitiesFromFeatureSignature } from '../src/workbench/chatgptDiscovery.js';
import { deriveGrokWorkbenchCapabilitiesFromFeatureSignature } from '../src/workbench/grokDiscovery.js';

describe('workbench capability service', () => {
  it('reports static workbench capabilities with bounded availability summary', async () => {
    const service = createWorkbenchCapabilityService({
      now: () => new Date('2026-04-23T12:00:00.000Z'),
    });

    const report = await service.listCapabilities({ provider: 'gemini' });

    expect(report).toMatchObject({
      object: 'workbench_capability_report',
      generatedAt: '2026-04-23T12:00:00.000Z',
      provider: 'gemini',
      summary: {
        total: 5,
        available: 0,
        accountGated: 0,
        unknown: 5,
        blocked: 0,
      },
    });
    expect(report.capabilities.map((capability) => capability.id)).toEqual([
      'gemini.canvas',
      'gemini.media.create_image',
      'gemini.media.create_music',
      'gemini.media.create_video',
      'gemini.research.deep_research',
    ]);
  });

  it('merges discovered capabilities over the static catalog', async () => {
    const service = createWorkbenchCapabilityService({
      now: () => new Date('2026-04-23T12:00:00.000Z'),
      discoverCapabilities: async () => [
        {
          id: 'gemini.media.create_image',
          provider: 'gemini',
          providerLabels: ['Create image', 'Image creation'],
          category: 'media',
          invocationMode: 'tool_drawer_selection',
          surfaces: ['browser_service'],
          availability: 'available',
          stability: 'observed',
          requiredInputs: [
            {
              name: 'prompt',
              required: true,
            },
          ],
          output: {
            artifactTypes: ['image'],
          },
          safety: {},
          source: 'browser_discovery',
          observedAt: '2026-04-23T12:00:00.000Z',
        },
      ],
    });

    const report = await service.listCapabilities({ provider: 'gemini', category: 'media' });

    expect(report.capabilities[0]).toMatchObject({
      id: 'gemini.media.create_image',
      availability: 'available',
      source: 'browser_discovery',
      providerLabels: ['Create image', 'Create Image', 'Images', 'Image creation'],
    });
    expect(report.summary.available).toBe(1);
  });

  it('derives available Gemini capabilities from a live feature signature', () => {
    const capabilities = deriveGeminiWorkbenchCapabilitiesFromFeatureSignature(
      JSON.stringify({
        detector: 'gemini-feature-probe-v1',
        modes: ['Images', 'Music', 'Videos', 'Canvas', 'Deep research'],
      }),
      '2026-04-23T12:00:00.000Z',
    );

    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'gemini.canvas',
        provider: 'gemini',
        availability: 'available',
        source: 'browser_discovery',
      }),
      expect.objectContaining({
        id: 'gemini.media.create_image',
        availability: 'available',
        providerLabels: ['Images'],
      }),
      expect.objectContaining({
        id: 'gemini.media.create_music',
        availability: 'available',
        providerLabels: ['Music'],
        output: expect.objectContaining({
          artifactTypes: ['music', 'video/mp4'],
        }),
      }),
      expect.objectContaining({
        id: 'gemini.media.create_video',
        availability: 'available',
        providerLabels: ['Videos'],
      }),
      expect.objectContaining({
        id: 'gemini.research.deep_research',
        availability: 'available',
      }),
    ]));
  });

  it('derives available ChatGPT capabilities from a live feature signature', () => {
    const capabilities = deriveChatgptWorkbenchCapabilitiesFromFeatureSignature(
      JSON.stringify({
        detector: 'chatgpt-feature-probe-v1',
        web_search: true,
        deep_research: true,
        company_knowledge: true,
        apps: ['github', 'google drive'],
        skills: ['study and learn'],
      }),
      '2026-04-23T12:00:00.000Z',
    );

    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'chatgpt.search.web_search',
        provider: 'chatgpt',
        category: 'search',
        availability: 'available',
        source: 'browser_discovery',
      }),
      expect.objectContaining({
        id: 'chatgpt.research.deep_research',
        category: 'research',
        availability: 'available',
        safety: expect.objectContaining({ mayTakeMinutes: true }),
      }),
      expect.objectContaining({
        id: 'chatgpt.files.company_knowledge',
        category: 'file',
        availability: 'available',
      }),
      expect.objectContaining({
        id: 'chatgpt.apps.github',
        category: 'app',
        providerLabels: ['GitHub'],
        availability: 'available',
        safety: expect.objectContaining({ requiresUserConsent: true }),
      }),
      expect.objectContaining({
        id: 'chatgpt.apps.google_drive',
        providerLabels: ['Google Drive'],
      }),
      expect.objectContaining({
        id: 'chatgpt.skills.study_and_learn',
        category: 'skill',
        providerLabels: ['Study And Learn'],
      }),
    ]));
  });

  it('merges discovered ChatGPT app visibility without losing account-gated catalog entries', async () => {
    const service = createWorkbenchCapabilityService({
      now: () => new Date('2026-04-23T12:00:00.000Z'),
      discoverCapabilities: async () =>
        deriveChatgptWorkbenchCapabilitiesFromFeatureSignature(
          JSON.stringify({
            detector: 'chatgpt-feature-probe-v1',
            detected: {
              deep_research: true,
              apps: ['github'],
            },
          }),
          '2026-04-23T12:00:00.000Z',
        ),
    });

    const report = await service.listCapabilities({ provider: 'chatgpt', category: 'app' });

    expect(report.capabilities.map((capability) => capability.id)).toEqual([
      'chatgpt.apps',
      'chatgpt.apps.github',
    ]);
    expect(report.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'chatgpt.apps',
        availability: 'account_gated',
        source: 'static_catalog',
      }),
      expect.objectContaining({
        id: 'chatgpt.apps.github',
        availability: 'available',
        source: 'browser_discovery',
      }),
    ]));
    expect(report.summary).toMatchObject({
      total: 2,
      available: 1,
      accountGated: 1,
    });
  });

  it('derives available Grok Imagine capabilities from browser discovery evidence', () => {
    const capabilities = deriveGrokWorkbenchCapabilitiesFromFeatureSignature(
      JSON.stringify({
        detector: 'grok-feature-probe-v1',
        imagine: {
          visible: true,
          modes: ['image', 'image-to-video'],
          labels: ['Imagine', 'Create with Imagine'],
          routes: ['https://grok.com/imagine'],
        },
      }),
      '2026-04-24T12:00:00.000Z',
    );

    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'grok.media.imagine_image',
        provider: 'grok',
        category: 'media',
        availability: 'available',
        source: 'browser_discovery',
        output: expect.objectContaining({
          artifactTypes: ['image'],
        }),
      }),
      expect.objectContaining({
        id: 'grok.media.imagine_video',
        category: 'media',
        invocationMode: 'post_prompt_action',
        availability: 'available',
        output: expect.objectContaining({
          artifactTypes: ['video'],
        }),
      }),
    ]));
  });

  it('reports Grok Imagine account gating without claiming availability', async () => {
    const service = createWorkbenchCapabilityService({
      now: () => new Date('2026-04-24T12:00:00.000Z'),
      discoverCapabilities: async () =>
        deriveGrokWorkbenchCapabilitiesFromFeatureSignature(
          JSON.stringify({
            detector: 'grok-feature-probe-v1',
            imagine: {
              visible: true,
              account_gated: true,
              labels: ['Imagine'],
              routes: ['https://grok.com/imagine'],
            },
          }),
          '2026-04-24T12:00:00.000Z',
        ),
    });

    const report = await service.listCapabilities({ provider: 'grok', category: 'media' });

    expect(report.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'grok.media.imagine_image',
        availability: 'account_gated',
        source: 'browser_discovery',
      }),
      expect.objectContaining({
        id: 'grok.media.imagine_video',
        availability: 'unknown',
        source: 'static_catalog',
      }),
    ]));
    expect(report.summary).toMatchObject({
      total: 2,
      available: 0,
      accountGated: 1,
      unknown: 1,
    });
  });

  it('does not promote account-gated gallery media to terminal Grok Imagine output', () => {
    const capabilities = deriveGrokWorkbenchCapabilitiesFromFeatureSignature(
      JSON.stringify({
        detector: 'grok-feature-probe-v1',
        imagine: {
          visible: true,
          account_gated: true,
          terminal_image: true,
          terminal_video: true,
          run_state: 'account_gated',
          modes: ['image', 'video'],
          labels: ['Imagine'],
          routes: ['https://grok.com/imagine'],
          media: {
            images: [{ src: 'https://imagine-public.x.ai/example.jpg' }],
            videos: [{ src: 'https://imagine-public.x.ai/example.mp4' }],
          },
        },
      }),
      '2026-04-24T12:00:00.000Z',
    );

    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'grok.media.imagine_image',
        availability: 'account_gated',
        metadata: expect.objectContaining({
          runState: 'account_gated',
          terminalImage: false,
          terminalVideo: false,
        }),
      }),
      expect.objectContaining({
        id: 'grok.media.imagine_video',
        availability: 'account_gated',
        metadata: expect.objectContaining({
          terminalImage: false,
          terminalVideo: false,
        }),
      }),
    ]));
  });

  it('preserves Grok Imagine run-state and materialization evidence in capability metadata', () => {
    const capabilities = deriveGrokWorkbenchCapabilitiesFromFeatureSignature(
      JSON.stringify({
        detector: 'grok-feature-probe-v1',
        imagine: {
          visible: true,
          run_state: 'terminal_video',
          terminal_video: true,
          modes: ['image'],
          labels: ['Imagine'],
          routes: ['https://grok.com/imagine'],
          materialization_controls: [
            {
              tag: 'button',
              ariaLabel: 'Download',
              visible: true,
            },
          ],
          media: {
            videos: [
              {
                kind: 'video',
                src: 'blob:https://grok.com/video-1',
                width: 640,
                height: 360,
              },
            ],
            visible_tiles: [
              {
                kind: 'image',
                src: 'https://assets.grok.com/users/user/generated/image-1.jpg',
                selected: true,
                tileSurface: 'masonry',
              },
            ],
            urls: ['blob:https://grok.com/video-1'],
          },
        },
      }),
      '2026-04-24T12:00:00.000Z',
    );

    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'grok.media.imagine_video',
        metadata: expect.objectContaining({
          runState: 'terminal_video',
          terminalVideo: true,
          materializationControls: [
            expect.objectContaining({
              ariaLabel: 'Download',
              visible: true,
            }),
          ],
          media: expect.objectContaining({
            visibleTiles: [
              expect.objectContaining({
                src: 'https://assets.grok.com/users/user/generated/image-1.jpg',
                selected: true,
                tileSurface: 'masonry',
              }),
            ],
            videos: [
              expect.objectContaining({
                src: 'blob:https://grok.com/video-1',
              }),
            ],
            urls: ['blob:https://grok.com/video-1'],
          }),
        }),
      }),
    ]));
  });

  it('attaches opt-in browser diagnostics to a workbench capability report', async () => {
    const service = createWorkbenchCapabilityService({
      now: () => new Date('2026-04-24T12:00:00.000Z'),
      diagnoseCapabilities: async (request) => ({
        probeStatus: 'observed',
        service: request.provider ?? null,
        ownerStepId: 'workbench-capabilities-grok',
        observedAt: '2026-04-24T12:00:00.000Z',
        source: 'browser-service',
        reason: null,
        target: {
          host: '127.0.0.1',
          port: 45000,
          targetId: 'target-1',
          url: 'https://grok.com/imagine',
          title: 'Grok',
        },
        document: {
          url: 'https://grok.com/imagine',
          title: 'Grok',
          readyState: 'complete',
          visibilityState: 'visible',
          focused: true,
          bodyTextLength: 1200,
        },
        visibleCounts: {
          buttons: 4,
          links: 2,
          inputs: 0,
          textareas: 1,
          contenteditables: 0,
          modelResponses: 0,
        },
        providerEvidence: {
          detector: 'grok-feature-probe-v1',
          imagine: {
            visible: true,
            account_gated: true,
            labels: ['Imagine'],
          },
        },
        screenshot: {
          path: '/tmp/auracall-diagnostics/grok.png',
          mimeType: 'image/png',
          bytes: 1234,
        },
      }),
    });

    const report = await service.listCapabilities({
      provider: 'grok',
      category: 'media',
      diagnostics: 'browser-state',
    });

    expect(report.browserDiagnostics).toMatchObject({
      probeStatus: 'observed',
      service: 'grok',
      target: {
        url: 'https://grok.com/imagine',
      },
      providerEvidence: {
        detector: 'grok-feature-probe-v1',
      },
      screenshot: {
        path: '/tmp/auracall-diagnostics/grok.png',
      },
    });
  });
});
