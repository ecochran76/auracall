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

  it('does not claim that the static ChatGPT Skills catalog is invokable', async () => {
    const service = createWorkbenchCapabilityService();

    const report = await service.listCapabilities({ provider: 'chatgpt', category: 'skill' });

    expect(report.capabilities).toEqual([
      expect.objectContaining({
        id: 'chatgpt.skills',
        availability: 'account_gated',
        invocationMode: 'unknown',
        metadata: expect.objectContaining({
          lifecycleState: 'unknown',
          stableIdentityObserved: false,
          installationObserved: false,
          invocationObserved: false,
        }),
      }),
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

  it('blocks Gemini capabilities when the live feature signature shows signed-out or disabled tools', () => {
    const capabilities = deriveGeminiWorkbenchCapabilitiesFromFeatureSignature(
      JSON.stringify({
        detector: 'gemini-feature-probe-v1',
        signed_out: true,
        modes: ['Create image', 'Create video'],
        disabled_modes: ['Create image'],
      }),
      '2026-04-23T12:00:00.000Z',
    );

    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'gemini.media.create_image',
        availability: 'blocked',
        metadata: expect.objectContaining({
          disabledReason: 'gemini_signed_out',
        }),
      }),
      expect.objectContaining({
        id: 'gemini.media.create_video',
        availability: 'blocked',
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
        create_image: true,
        apps: ['github', 'google drive'],
        composer_mode: 'work',
        composer_apps: [
          {
            name: 'GitHub',
            app_id: 'connector_76869538009648d5b282a4bb21c3d157',
            plugin_id: 'plugin_connector_github',
            selection_state: 'selectable',
          },
          {
            name: 'Google Drive',
            app_id: 'connector_google_drive',
            plugin_id: 'plugin_connector_google_drive',
            selection_state: 'selectable',
          },
        ],
        installed_apps: [
          {
            plugin_id: 'plugin_connector_github',
            name: 'GitHub',
            app_ids: ['connector_76869538009648d5b282a4bb21c3d157'],
            status: 'ENABLED',
            enabled: true,
            installation_policy: 'AVAILABLE',
            authentication_policy: 'ON_INSTALL',
          },
          {
            plugin_id: 'plugin_connector_google_drive',
            name: 'Google Drive',
            app_ids: ['connector_google_drive'],
            status: 'ENABLED',
            enabled: true,
          },
        ],
        linked_apps: [
          {
            link_id: 'link_github',
            connector_id: 'connector_76869538009648d5b282a4bb21c3d157',
            name: 'GitHub',
            auth_status: 'ACTIVE',
            connector_status: 'ENABLED',
            visibility: 'VISIBLE',
          },
          {
            link_id: 'link_google_drive',
            connector_id: 'connector_google_drive',
            name: 'Google Drive',
            auth_status: 'ACTIVE',
            connector_status: 'ENABLED',
            visibility: 'VISIBLE',
          },
        ],
        skills: ['study and learn'],
        model_controls: {
          visible: true,
          label: 'Instant',
          aria_label: 'Switch model',
          location: 'prompt_workbench',
          selector: 'button[aria-label="Switch model"]',
          model_options: ['Instant', 'Thinking', 'Pro'],
          depth_options: ['Standard', 'Extended'],
          selected_model: 'Pro',
          selected_depth: 'Standard',
        },
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
        id: 'chatgpt.media.create_image',
        category: 'media',
        availability: 'available',
        source: 'browser_discovery',
        output: expect.objectContaining({
          artifactTypes: ['image'],
        }),
      }),
      expect.objectContaining({
        id: 'chatgpt.apps.github',
        category: 'app',
        providerLabels: ['GitHub'],
        availability: 'available',
        invocationMode: 'composer_mention',
        metadata: expect.objectContaining({
          installed: true,
          composerMode: 'work',
          linkAuthStatuses: ['ACTIVE'],
        }),
      }),
      expect.objectContaining({
        id: 'chatgpt.apps.google_drive',
        providerLabels: ['Google Drive'],
      }),
      expect.objectContaining({
        id: 'chatgpt.skills.study_and_learn',
        category: 'skill',
        providerLabels: ['Study And Learn'],
        availability: 'unknown',
        invocationMode: 'unknown',
        metadata: expect.objectContaining({
          lifecycleState: 'unknown',
          stableIdentityObserved: false,
          installationObserved: false,
          invocationObserved: false,
        }),
      }),
      expect.objectContaining({
        id: 'chatgpt.model.selector',
        category: 'other',
        availability: 'available',
        providerLabels: expect.arrayContaining(['Switch model', 'Instant', 'Model selector', 'Thinking Standard', 'Pro Standard']),
        metadata: expect.objectContaining({
          featureSignatureSignal: 'model_controls',
          location: 'prompt_workbench',
          selector: 'button[aria-label="Switch model"]',
          modelOptions: ['Instant', 'Thinking', 'Pro'],
          depthOptions: ['Standard', 'Extended'],
          synthesizedOptions: ['Thinking Standard', 'Thinking Extended', 'Pro Standard', 'Pro Extended'],
          selectedModel: 'Pro',
          selectedDepth: 'Standard',
        }),
      }),
      expect.objectContaining({
        id: 'chatgpt.model.thinking.standard',
        providerLabels: ['Thinking Standard'],
        availability: 'available',
        metadata: expect.objectContaining({
          model: 'thinking',
          depth: 'standard',
          selected: false,
        }),
      }),
      expect.objectContaining({
        id: 'chatgpt.model.pro.standard',
        providerLabels: ['Pro Standard'],
        availability: 'available',
        metadata: expect.objectContaining({
          model: 'pro',
          depth: 'standard',
          selected: true,
        }),
      }),
    ]));
  });

  it('keeps ChatGPT static browser-media and model capabilities visible until live discovery confirms them', async () => {
    const service = createWorkbenchCapabilityService({
      now: () => new Date('2026-04-23T12:00:00.000Z'),
    });

    const mediaReport = await service.listCapabilities({ provider: 'chatgpt', category: 'media' });
    expect(mediaReport.capabilities).toEqual([
      expect.objectContaining({
        id: 'chatgpt.media.create_image',
        availability: 'unknown',
        source: 'static_catalog',
      }),
    ]);

    const report = await service.listCapabilities({ provider: 'chatgpt', category: 'other' });

    expect(report.capabilities).toEqual([
      expect.objectContaining({
        id: 'chatgpt.model.selector',
        availability: 'unknown',
        source: 'static_catalog',
      }),
    ]);
  });

  it('does not treat legacy ChatGPT app-token visibility as proof of installed availability', async () => {
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
        availability: 'unknown',
        source: 'browser_discovery',
        metadata: expect.objectContaining({
          installed: false,
          featureSignatureSignal: 'apps',
        }),
      }),
    ]));
    expect(report.summary).toMatchObject({
      total: 2,
      available: 0,
      accountGated: 1,
      unknown: 1,
    });
  });

  it('reports an installed ChatGPT plugin as account-gated when its link requires reauthentication', () => {
    const capabilities = deriveChatgptWorkbenchCapabilitiesFromFeatureSignature(
      JSON.stringify({
        installed_apps: [
          {
            plugin_id: 'plugin_adobe_acrobat',
            name: 'Adobe Acrobat',
            app_ids: ['connector_adobe_acrobat'],
            status: 'ENABLED',
            enabled: true,
          },
        ],
        linked_apps: [
          {
            link_id: 'link_adobe_acrobat',
            connector_id: 'connector_adobe_acrobat',
            name: 'Adobe Acrobat',
            auth_status: 'REAUTH_REQUIRED',
            connector_status: 'ENABLED',
            visibility: 'VISIBLE',
          },
        ],
      }),
      '2026-07-24T12:00:00.000Z',
    );

    expect(capabilities).toEqual([
      expect.objectContaining({
        id: 'chatgpt.apps.adobe_acrobat',
        availability: 'account_gated',
        invocationMode: 'composer_mention',
        metadata: expect.objectContaining({
          installed: true,
          linkAuthStatuses: ['REAUTH_REQUIRED'],
        }),
      }),
    ]);
  });

  it('matches ChatGPT app SDK installs to connector links with the same provider identity', () => {
    const capabilities = deriveChatgptWorkbenchCapabilitiesFromFeatureSignature(
      JSON.stringify({
        installed_apps: [
          {
            plugin_id: 'plugin_photoshop',
            name: 'Adobe (formerly Photoshop)',
            app_ids: ['asdk_app_69312da8'],
            status: 'ENABLED',
            enabled: true,
          },
        ],
        linked_apps: [
          {
            link_id: 'link_photoshop',
            connector_id: 'connector_69312da8',
            name: 'Adobe Photoshop',
            auth_status: 'ACTIVE',
            connector_status: 'ENABLED',
          },
        ],
      }),
      '2026-07-24T12:00:00.000Z',
    );

    expect(capabilities).toEqual([
      expect.objectContaining({
        id: 'chatgpt.apps.adobe_formerly_photoshop',
        availability: 'available',
        metadata: expect.objectContaining({
          installed: true,
          linkAuthStatuses: ['ACTIVE'],
        }),
      }),
    ]);
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
          controls: [
            {
              text: 'Video',
              role: 'radio',
              checked: 'true',
            },
          ],
          discovery_action: {
            action: 'grok-imagine-video-mode',
            status: 'observed_video_mode',
            clicked: true,
            beforeMode: 'Image',
            afterMode: 'Video',
          },
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
          controls: [
            expect.objectContaining({
              text: 'Video',
              checked: 'true',
            }),
          ],
          discoveryAction: expect.objectContaining({
            action: 'grok-imagine-video-mode',
            afterMode: 'Video',
          }),
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
