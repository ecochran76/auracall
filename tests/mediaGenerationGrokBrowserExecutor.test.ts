import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserClient = {
  runPrompt: vi.fn(),
  getFeatureSignature: vi.fn(),
  materializeActiveMediaArtifacts: vi.fn(),
};

const fromConfig = vi.fn(async () => browserClient);

vi.mock('../src/browser/client.js', () => ({
  BrowserAutomationClient: {
    fromConfig,
  },
}));

describe('Grok browser media generation executor', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    browserClient.materializeActiveMediaArtifacts.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: {
        get: (name: string) => name.toLowerCase() === 'content-type' ? 'image/jpeg' : null,
      },
      arrayBuffer: async () => Buffer.from('fake grok image bytes').buffer,
    })));
  });

  it('defines post-submit video acceptance criteria before enabling submit', async () => {
    const {
      GROK_VIDEO_POST_SUBMIT_ACCEPTANCE_CONTRACT,
      evaluateGrokImagineVideoPostSubmitAcceptance,
    } = await import('../src/media/grokBrowserExecutor.js');

    expect(GROK_VIDEO_POST_SUBMIT_ACCEPTANCE_CONTRACT.failureCases).toContain(
      'terminal_public_template_without_generated_video',
    );

    expect(evaluateGrokImagineVideoPostSubmitAcceptance(JSON.stringify({
      imagine: {
        run_state: 'generating',
        pending: false,
        terminal_video: false,
        media: { videos: [], visible_tiles: [], urls: [] },
      },
    }))).toMatchObject({
      pending: true,
      terminalVideo: false,
      ready: false,
      failureReason: null,
    });

    expect(evaluateGrokImagineVideoPostSubmitAcceptance(JSON.stringify({
      imagine: {
        href: 'https://grok.com/imagine/templates/template-1',
        pending: false,
        terminal_video: true,
        media: {
          videos: [{
            kind: 'video',
            src: 'https://imagine-public.x.ai/imagine-public/share-videos/template.mp4',
            publicGallery: true,
          }],
          visible_tiles: [],
          urls: ['https://imagine-public.x.ai/imagine-public/share-videos/template.mp4'],
        },
      },
    }))).toMatchObject({
      terminalVideo: true,
      generatedVideoCount: 0,
      publicTemplateWithoutGeneratedVideo: true,
      ready: false,
      failureReason: 'terminal_public_template_without_generated_video',
    });

    expect(evaluateGrokImagineVideoPostSubmitAcceptance(JSON.stringify({
      imagine: {
        href: 'https://grok.com/imagine',
        pending: false,
        terminal_video: true,
        materialization_controls: [{ ariaLabel: 'Download', visible: true }],
        media: {
          videos: [{
            kind: 'video',
            tag: 'video',
            src: 'https://assets.grok.com/users/test/generated/video-1.mp4',
            generated: true,
            selected: true,
            publicGallery: false,
          }],
          visible_tiles: [],
          urls: ['https://assets.grok.com/users/test/generated/video-1.mp4'],
        },
      },
    }))).toMatchObject({
      terminalVideo: true,
      generatedVideoCount: 1,
      selectedGeneratedVideoCount: 1,
      downloadControlCount: 1,
      materializationCandidateCount: 2,
      ready: true,
      failureReason: null,
    });

    expect(evaluateGrokImagineVideoPostSubmitAcceptance(JSON.stringify({
      imagine: {
        href: 'https://grok.com/imagine',
        pending: false,
        terminal_video: true,
        media: {
          videos: [],
          visible_tiles: [{
            kind: 'video',
            src: 'https://assets.grok.com/users/test/generated/selected-video.mp4',
            generated: true,
            selected: true,
            publicGallery: false,
          }],
          urls: ['https://assets.grok.com/users/test/generated/selected-video.mp4'],
        },
      },
    }))).toMatchObject({
      terminalVideo: true,
      generatedVideoCount: 0,
      selectedGeneratedVideoCount: 1,
      materializationCandidateCount: 1,
      ready: true,
      failureReason: null,
    });
  });

  it('classifies fixture-backed Grok video post-submit readback states', async () => {
    const {
      evaluateGrokImagineVideoPostSubmitReadback,
      selectGrokImagineVideoMaterializationCandidate,
    } = await import('../src/media/grokBrowserExecutor.js');

    expect(evaluateGrokImagineVideoPostSubmitReadback(JSON.stringify({
      imagine: {
        href: 'https://grok.com/imagine',
        run_state: 'progress',
        pending: false,
        terminal_video: false,
        media: { videos: [], visible_tiles: [], urls: [] },
      },
    }), 3)).toMatchObject({
      decision: 'pending',
      pollCount: 3,
      pending: true,
      ready: false,
      timelineDetails: {
        decision: 'pending',
        pollCount: 3,
        runState: 'progress',
        terminalVideo: false,
      },
    });

    expect(evaluateGrokImagineVideoPostSubmitReadback(JSON.stringify({
      imagine: {
        href: 'https://grok.com/imagine',
        run_state: 'terminal_video',
        pending: false,
        terminal_video: true,
        materialization_controls: [{ ariaLabel: 'Download', visible: true }],
        media: {
          videos: [{
            kind: 'video',
            tag: 'video',
            src: 'https://assets.grok.com/users/test/generated/video-1.mp4',
            generated: true,
            selected: true,
          }],
          visible_tiles: [],
          urls: ['https://assets.grok.com/users/test/generated/video-1.mp4'],
        },
      },
    }), 4)).toMatchObject({
      decision: 'ready',
      pollCount: 4,
      terminalVideo: true,
      generatedVideoCount: 1,
      materializationCandidateCount: 2,
      ready: true,
      timelineDetails: {
        decision: 'ready',
        generatedVideoCount: 1,
        materializationCandidateCount: 2,
        materializationCandidateSource: 'generated-video',
        mediaUrlCount: 1,
      },
      materializationCandidate: {
        source: 'generated-video',
        remoteUrl: 'https://assets.grok.com/users/test/generated/video-1.mp4',
        mimeType: 'video/mp4',
        selected: true,
      },
      runStateTimelineEvent: {
        event: 'run_state_observed',
      },
      terminalTimelineEvent: {
        event: 'video_visible',
        details: {
          materializationCandidateSource: 'generated-video',
        },
      },
    });

    expect(selectGrokImagineVideoMaterializationCandidate(JSON.stringify({
      imagine: {
        href: 'https://grok.com/imagine',
        terminal_video: true,
        media: {
          videos: [],
          visible_tiles: [{
            kind: 'video',
            src: 'https://assets.grok.com/users/test/generated/selected-video.mp4',
            generated: true,
            selected: true,
          }],
          urls: ['https://assets.grok.com/users/test/generated/selected-video.mp4'],
        },
      },
    }))).toMatchObject({
      source: 'selected-tile',
      remoteUrl: 'https://assets.grok.com/users/test/generated/selected-video.mp4',
      mimeType: 'video/mp4',
      selected: true,
    });

    expect(evaluateGrokImagineVideoPostSubmitReadback(JSON.stringify({
      imagine: {
        href: 'https://grok.com/imagine/templates/template-1',
        run_state: 'terminal_video',
        pending: false,
        terminal_video: true,
        media: {
          videos: [{
            kind: 'video',
            src: 'https://imagine-public.x.ai/imagine-public/share-videos/template.mp4',
            publicGallery: true,
          }],
          visible_tiles: [],
          urls: ['https://imagine-public.x.ai/imagine-public/share-videos/template.mp4'],
        },
      },
    }), 5)).toMatchObject({
      decision: 'failed',
      failureReason: 'terminal_public_template_without_generated_video',
      ready: false,
      timelineDetails: {
        decision: 'failed',
        failureReason: 'terminal_public_template_without_generated_video',
        publicTemplateWithoutGeneratedVideo: true,
      },
    });

    expect(evaluateGrokImagineVideoPostSubmitReadback(JSON.stringify({
      imagine: {
        href: 'https://grok.com/imagine',
        run_state: 'terminal_video',
        pending: false,
        terminal_video: true,
        media: {
          videos: [{
            kind: 'video',
            src: '',
            generated: true,
            selected: true,
          }],
          visible_tiles: [],
          urls: [],
        },
      },
    }), 6)).toMatchObject({
      decision: 'failed',
      failureReason: 'terminal_video_without_materialization_candidate',
      ready: false,
      timelineDetails: {
        decision: 'failed',
        terminalVideo: true,
        materializationCandidateCount: 0,
      },
    });
  });

  it('polls fixture-backed Grok video readback and materializes a terminal candidate without submitting', async () => {
    const {
      materializeGrokVideoCandidate,
      waitForGrokImagineTerminalVideoReadback,
    } = await import('../src/media/grokBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-grok-video-media-artifacts';
    browserClient.getFeatureSignature
      .mockResolvedValueOnce(JSON.stringify({
        imagine: {
          href: 'https://grok.com/imagine',
          run_state: 'progress',
          pending: false,
          terminal_video: false,
          media: { videos: [], visible_tiles: [], urls: [] },
        },
      }))
      .mockResolvedValueOnce(JSON.stringify({
        imagine: {
          href: 'https://grok.com/imagine',
          run_state: 'terminal_video',
          pending: false,
          terminal_video: true,
          media: {
            videos: [{
              kind: 'video',
              src: 'https://assets.grok.com/users/test/generated/video-2.mp4',
              generated: true,
              selected: true,
            }],
            visible_tiles: [],
            urls: ['https://assets.grok.com/users/test/generated/video-2.mp4'],
          },
        },
      }));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: {
        get: (name: string) => name.toLowerCase() === 'content-type' ? 'video/mp4' : null,
      },
      arrayBuffer: async () => Buffer.from('fake grok video bytes').buffer,
    })));

    const timelineEvents: string[] = [];
    const readback = await waitForGrokImagineTerminalVideoReadback(
      browserClient,
      'grok-video-tab-1',
      'https://grok.com/imagine',
      { host: '127.0.0.1', port: 38261 },
      { artifactPollIntervalMs: 1 },
      30000,
      (event) => {
        timelineEvents.push(event.event);
      },
    );
    const artifact = await materializeGrokVideoCandidate(readback.materializationCandidate!, artifactDir, 1);

    expect(browserClient.runPrompt).not.toHaveBeenCalled();
    expect(browserClient.getFeatureSignature).toHaveBeenCalledWith({
      configuredUrl: 'https://grok.com/imagine',
      tabUrl: 'https://grok.com/imagine',
      tabTargetId: 'grok-video-tab-1',
      host: '127.0.0.1',
      port: 38261,
      preserveActiveTab: true,
    });
    expect(browserClient.getFeatureSignature).toHaveBeenCalledTimes(2);
    expect(timelineEvents).toEqual([
      'run_state_observed',
      'run_state_observed',
      'video_visible',
    ]);
    expect(readback).toMatchObject({
      decision: 'ready',
      pollCount: 2,
      materializationCandidate: {
        source: 'generated-video',
        remoteUrl: 'https://assets.grok.com/users/test/generated/video-2.mp4',
      },
    });
    expect(artifact).toMatchObject({
      id: 'grok_imagine_video_1',
      type: 'video',
      mimeType: 'video/mp4',
      fileName: 'grok-imagine-video-1.mp4',
      path: path.join(artifactDir, 'grok-imagine-video-1.mp4'),
      metadata: {
        remoteUrl: 'https://assets.grok.com/users/test/generated/video-2.mp4',
        materialization: 'remote-media-fetch',
        materializationSource: 'generated-video',
        selected: true,
      },
    });
  });

  it('fails fixture-backed Grok video readback when terminal video has no materialization candidate', async () => {
    const { waitForGrokImagineTerminalVideoReadback } = await import('../src/media/grokBrowserExecutor.js');
    browserClient.getFeatureSignature.mockResolvedValueOnce(JSON.stringify({
      imagine: {
        href: 'https://grok.com/imagine',
        run_state: 'terminal_video',
        pending: false,
        terminal_video: true,
        media: {
          videos: [{
            kind: 'video',
            src: '',
            generated: true,
            selected: true,
          }],
          visible_tiles: [],
          urls: [],
        },
      },
    }));

    const timelineEvents: string[] = [];
    await expect(waitForGrokImagineTerminalVideoReadback(
      browserClient,
      'grok-video-tab-2',
      'https://grok.com/imagine',
      { host: '127.0.0.1', port: 38261 },
      { artifactPollIntervalMs: 1 },
      30000,
      (event) => {
        timelineEvents.push(event.event);
      },
    )).rejects.toMatchObject({
      code: 'media_generation_artifact_materialization_failed',
      details: {
        decision: 'failed',
        failureReason: 'terminal_video_without_materialization_candidate',
        terminalVideo: true,
        materializationCandidateCount: 0,
      },
    });

    expect(browserClient.runPrompt).not.toHaveBeenCalled();
    expect(timelineEvents).toEqual(['run_state_observed']);
  });

  it('submits through the guarded Imagine path and materializes terminal image evidence', async () => {
    const { createGrokBrowserMediaGenerationExecutor } = await import('../src/media/grokBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-grok-media-artifacts';
    browserClient.runPrompt.mockImplementationOnce(async (input) => {
      await input.onProgress?.({
        phase: 'browser_target_attached',
        details: {
          targetId: 'grok-tab-1',
        },
      });
      await input.onProgress?.({
        phase: 'prompt_inserted',
        details: {
          targetId: 'grok-tab-1',
          promptLength: input.prompt.length,
        },
      });
      await input.onProgress?.({
        phase: 'submit_path_observed',
        details: {
          targetId: 'grok-tab-1',
          outcome: 'generated_media',
          routeKind: 'imagine_root',
          generatedImageCount: 1,
        },
      });
      return {
        text: '',
        url: 'https://grok.com/imagine',
        tabTargetId: 'grok-tab-1',
      };
    });
    browserClient.getFeatureSignature.mockResolvedValueOnce(JSON.stringify({
      detector: 'grok-feature-probe-v1',
      imagine: {
        run_state: 'terminal_image',
        pending: false,
        terminal_image: true,
        terminal_video: false,
        account_gated: false,
        blocked: false,
        media: {
          images: [
            {
              src: 'https://assets.grok.com/users/test/generated/image-1.jpg',
              generated: true,
              publicGallery: false,
              width: 1024,
              height: 1024,
            },
          ],
          videos: [],
          urls: ['https://assets.grok.com/users/test/generated/image-1.jpg'],
        },
      },
    }));

    const executor = createGrokBrowserMediaGenerationExecutor({} as never);
    const timelineEvents: string[] = [];
    const result = await executor({
      id: 'medgen_grok_test',
      createdAt: '2026-04-24T12:00:00.000Z',
      artifactDir,
      emitTimeline: (event) => {
        timelineEvents.push(event.event);
      },
      request: {
        provider: 'grok',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        transport: 'browser',
      },
    });

    expect(fromConfig).toHaveBeenCalledWith({}, { target: 'grok' });
    expect(browserClient.runPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Generate an image of an asphalt secret agent',
        capabilityId: 'grok.media.imagine_image',
        completionMode: 'prompt_submitted',
        configuredUrl: 'https://grok.com/imagine',
        timeoutMs: 300000,
        onProgress: expect.any(Function),
      }),
      expect.objectContaining({
        configuredUrl: 'https://grok.com/imagine',
        preserveActiveTab: true,
        mutationSourcePrefix: 'media:grok-imagine',
      }),
    );
    expect(browserClient.getFeatureSignature).toHaveBeenCalledWith({
      configuredUrl: 'https://grok.com/imagine',
      tabUrl: 'https://grok.com/imagine',
      tabTargetId: 'grok-tab-1',
      preserveActiveTab: true,
    });
    expect(browserClient.materializeActiveMediaArtifacts).toHaveBeenCalledWith(
      {
        capabilityId: 'grok.media.imagine_image',
        mediaType: 'image',
        maxItems: 8,
        compareFullQuality: true,
      },
      artifactDir,
      expect.objectContaining({
        configuredUrl: 'https://grok.com/imagine',
        tabUrl: 'https://grok.com/imagine',
        tabTargetId: 'grok-tab-1',
        preserveActiveTab: true,
      }),
    );
    expect(result).toMatchObject({
      artifacts: [
        {
          id: 'grok_imagine_image_1',
          type: 'image',
          mimeType: 'image/jpeg',
          fileName: 'grok-imagine-1.jpg',
          path: path.join(artifactDir, 'grok-imagine-1.jpg'),
          width: 1024,
          height: 1024,
          metadata: {
            remoteUrl: 'https://assets.grok.com/users/test/generated/image-1.jpg',
            materialization: 'remote-media-fetch',
          },
        },
      ],
      metadata: {
        executor: 'grok-browser',
        tabUrl: 'https://grok.com/imagine',
        tabTargetId: 'grok-tab-1',
        capabilityId: 'grok.media.imagine_image',
        runState: 'terminal_image',
        artifactPollCount: 1,
        generatedArtifactCount: 1,
      },
    });
    expect(timelineEvents).toEqual([
      'browser_target_attached',
      'prompt_inserted',
      'submit_path_observed',
      'prompt_submitted',
      'run_state_observed',
      'image_visible',
      'artifact_materialized',
    ]);
  });

  it('defaults Grok image materialization to eight visible tiles and honors request count', async () => {
    const { createGrokBrowserMediaGenerationExecutor } = await import('../src/media/grokBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-grok-media-artifacts';
    browserClient.runPrompt.mockResolvedValue({
      text: '',
      url: 'https://grok.com/imagine',
      tabTargetId: 'grok-tab-count',
    });
    browserClient.getFeatureSignature.mockResolvedValue(JSON.stringify({
      detector: 'grok-feature-probe-v1',
      imagine: {
        run_state: 'terminal_image',
        pending: false,
        terminal_image: true,
        terminal_video: false,
        media: {
          images: Array.from({ length: 10 }, (_, index) => ({
            src: `https://assets.grok.com/users/test/generated/image-${index + 1}.jpg`,
            generated: true,
            publicGallery: false,
          })),
          videos: [],
          urls: Array.from({ length: 10 }, (_, index) =>
            `https://assets.grok.com/users/test/generated/image-${index + 1}.jpg`),
        },
      },
    }));

    const executor = createGrokBrowserMediaGenerationExecutor({} as never);
    const defaultResult = await executor({
      id: 'medgen_grok_default_count',
      createdAt: '2026-04-25T12:00:00.000Z',
      artifactDir,
      request: {
        provider: 'grok',
        mediaType: 'image',
        prompt: 'Generate images of an asphalt secret agent',
        transport: 'browser',
      },
    });
    const countedResult = await executor({
      id: 'medgen_grok_counted',
      createdAt: '2026-04-25T12:00:00.000Z',
      artifactDir,
      request: {
        provider: 'grok',
        mediaType: 'image',
        prompt: 'Generate images of an asphalt secret agent',
        transport: 'browser',
        count: 3,
      },
    });

    expect(browserClient.materializeActiveMediaArtifacts).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ maxItems: 8 }),
      artifactDir,
      expect.any(Object),
    );
    expect(browserClient.materializeActiveMediaArtifacts).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ maxItems: 3 }),
      artifactDir,
      expect.any(Object),
    );
    expect(defaultResult.artifacts).toHaveLength(8);
    expect(countedResult.artifacts).toHaveLength(3);
    expect(defaultResult.metadata).toMatchObject({
      requestedVisibleTileCount: 8,
      visibleTileMaterializationLimit: 8,
      generatedArtifactCount: 8,
    });
    expect(countedResult.metadata).toMatchObject({
      requestedVisibleTileCount: 3,
      visibleTileMaterializationLimit: 3,
      generatedArtifactCount: 3,
    });
  });

  it('submits through the guarded Imagine Video path and materializes terminal video evidence', async () => {
    const { createGrokBrowserMediaGenerationExecutor } = await import('../src/media/grokBrowserExecutor.js');
    const executor = createGrokBrowserMediaGenerationExecutor({} as never);
    const artifactDir = '/tmp/auracall-grok-video-media-artifacts';
    browserClient.runPrompt.mockImplementationOnce(async (input) => {
      await input.onProgress?.({
        phase: 'browser_target_attached',
        details: {
          targetId: 'grok-video-tab-1',
        },
      });
      await input.onProgress?.({
        phase: 'prompt_inserted',
        details: {
          targetId: 'grok-video-tab-1',
          promptLength: input.prompt.length,
        },
      });
      await input.onProgress?.({
        phase: 'submit_path_observed',
        details: {
          targetId: 'grok-video-tab-1',
          outcome: 'generated_media',
          routeKind: 'imagine_root',
          generatedVideoCount: 1,
          generatedMediaCount: 1,
        },
      });
      return {
        text: '',
        url: 'https://grok.com/imagine/post/video-1',
        tabTargetId: 'grok-video-tab-1',
      };
    });
    browserClient.getFeatureSignature.mockResolvedValueOnce(JSON.stringify({
      imagine: {
        href: 'https://grok.com/imagine/post/video-1',
        run_state: 'terminal_video',
        pending: false,
        terminal_video: true,
        materialization_controls: [{ ariaLabel: 'Download', visible: true }],
        media: {
          videos: [{
            kind: 'video',
            src: 'https://assets.grok.com/users/test/generated/video-1.mp4',
            generated: true,
            selected: true,
          }],
          visible_tiles: [],
          urls: ['https://assets.grok.com/users/test/generated/video-1.mp4'],
        },
      },
    }));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: {
        get: (name: string) => name.toLowerCase() === 'content-type' ? 'video/mp4' : null,
      },
      arrayBuffer: async () => Buffer.from('fake grok video bytes').buffer,
    })));
    const timelineEvents: string[] = [];

    const result = await executor({
      id: 'medgen_grok_video_test',
      createdAt: '2026-04-24T12:00:00.000Z',
      artifactDir,
      workbenchCapability: {
        id: 'grok.media.imagine_video',
        provider: 'grok',
        providerLabels: ['Imagine'],
        category: 'media',
        invocationMode: 'post_prompt_action',
        surfaces: ['browser_service', 'local_api', 'mcp'],
        availability: 'available',
        stability: 'observed',
        requiredInputs: [{ name: 'prompt', required: true }],
        output: { artifactTypes: ['video'] },
        safety: {},
        observedAt: '2026-04-24T12:00:00.000Z',
        source: 'browser_discovery',
        metadata: {
          discoveryAction: {
            action: 'grok-imagine-video-mode',
            status: 'observed_video_mode',
            videoModeAudit: {
              composer: [{ tag: 'div', placeholder: 'Type to imagine' }],
              submitControls: [{ tag: 'button', ariaLabel: 'Submit', disabled: true }],
              uploadControls: [{ tag: 'button', ariaLabel: 'Upload' }],
              aspectControls: [{ tag: 'button', ariaLabel: 'Aspect Ratio', text: '2:3' }],
              filmstrip: [],
              downloadControls: [],
              visibleMedia: [{ tag: 'img', generated: true, selected: true }],
              generatedMediaSelectorCount: 2,
              selectedGeneratedMediaCount: 1,
            },
          },
        },
      },
      emitTimeline: (event) => {
        timelineEvents.push(event.event);
      },
      request: {
        provider: 'grok',
        mediaType: 'video',
        prompt: 'Generate a video of an asphalt secret agent',
        transport: 'browser',
      },
    });

    expect(browserClient.runPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Generate a video of an asphalt secret agent',
        capabilityId: 'grok.media.imagine_video',
        completionMode: 'prompt_submitted',
        configuredUrl: 'https://grok.com/imagine',
      }),
      expect.objectContaining({
        configuredUrl: 'https://grok.com/imagine',
        preserveActiveTab: true,
      }),
    );
    expect(browserClient.getFeatureSignature).toHaveBeenCalledWith({
      configuredUrl: 'https://grok.com/imagine/post/video-1',
      tabUrl: 'https://grok.com/imagine/post/video-1',
      tabTargetId: 'grok-video-tab-1',
      preserveActiveTab: true,
    });
    expect(result).toMatchObject({
      artifacts: [{
        id: 'grok_imagine_video_1',
        type: 'video',
        mimeType: 'video/mp4',
        fileName: 'grok-imagine-video-1.mp4',
        metadata: {
          remoteUrl: 'https://assets.grok.com/users/test/generated/video-1.mp4',
          materialization: 'remote-media-fetch',
          materializationSource: 'generated-video',
        },
      }],
      metadata: {
        executor: 'grok-browser',
        capabilityId: 'grok.media.imagine_video',
        tabUrl: 'https://grok.com/imagine/post/video-1',
        tabTargetId: 'grok-video-tab-1',
        artifactPollCount: 1,
        generatedArtifactCount: 1,
      },
    });
    expect(timelineEvents).toEqual([
      'browser_target_attached',
      'prompt_inserted',
      'submit_path_observed',
      'prompt_submitted',
      'run_state_observed',
      'video_visible',
      'artifact_materialized',
    ]);
  });

  it('runs the disabled Grok video readback probe when explicit metadata provides an existing tab', async () => {
    const { createGrokBrowserMediaGenerationExecutor } = await import('../src/media/grokBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-grok-video-media-artifacts';
    browserClient.getFeatureSignature
      .mockResolvedValueOnce(JSON.stringify({
        imagine: {
          href: 'https://grok.com/imagine',
          run_state: 'progress',
          pending: false,
          terminal_video: false,
          media: { videos: [], visible_tiles: [], urls: [] },
        },
      }))
      .mockResolvedValueOnce(JSON.stringify({
        imagine: {
          href: 'https://grok.com/imagine',
          run_state: 'terminal_video',
          pending: false,
          terminal_video: true,
          media: {
            videos: [{
              kind: 'video',
              src: 'https://assets.grok.com/users/test/generated/video-probe.mp4',
              generated: true,
              selected: true,
            }],
            visible_tiles: [],
            urls: ['https://assets.grok.com/users/test/generated/video-probe.mp4'],
          },
        },
      }));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: {
        get: (name: string) => name.toLowerCase() === 'content-type' ? 'video/mp4' : null,
      },
      arrayBuffer: async () => Buffer.from('fake grok probe video bytes').buffer,
    })));

    const executor = createGrokBrowserMediaGenerationExecutor({} as never);
    const timelineEvents: string[] = [];
    const result = await executor({
      id: 'medgen_grok_video_probe_test',
      createdAt: '2026-04-24T12:00:00.000Z',
      artifactDir,
      emitTimeline: (event) => {
        timelineEvents.push(event.event);
      },
      request: {
        provider: 'grok',
        mediaType: 'video',
        prompt: 'Generate a video of an asphalt secret agent',
        transport: 'browser',
        metadata: {
          grokVideoReadbackProbe: true,
          grokVideoReadbackTabTargetId: 'grok-video-tab-probe',
          grokVideoReadbackTabUrl: 'https://grok.com/imagine',
          grokVideoReadbackDevtoolsPort: 38261,
          artifactPollIntervalMs: 1,
        },
      },
    });

    expect(fromConfig).toHaveBeenCalledWith({}, { target: 'grok' });
    expect(browserClient.runPrompt).not.toHaveBeenCalled();
    expect(browserClient.getFeatureSignature).toHaveBeenCalledTimes(2);
    expect(browserClient.getFeatureSignature).toHaveBeenCalledWith(expect.objectContaining({
      host: '127.0.0.1',
      port: 38261,
      tabTargetId: 'grok-video-tab-probe',
      preserveActiveTab: true,
    }));
    expect(timelineEvents).toEqual([
      'capability_selected',
      'composer_ready',
      'submitted_state_observed',
      'run_state_observed',
      'run_state_observed',
      'video_visible',
      'artifact_materialized',
    ]);
    expect(result).toMatchObject({
      artifacts: [{
        id: 'grok_imagine_video_1',
        type: 'video',
        mimeType: 'video/mp4',
        fileName: 'grok-imagine-video-1.mp4',
        metadata: {
          remoteUrl: 'https://assets.grok.com/users/test/generated/video-probe.mp4',
          materializationSource: 'generated-video',
        },
      }],
      metadata: {
        executor: 'grok-browser',
        capabilityId: 'grok.media.imagine_video',
        readbackProbe: true,
        tabTargetId: 'grok-video-tab-probe',
        artifactPollCount: 2,
        generatedArtifactCount: 1,
      },
    });
  });

  it('rejects the Grok video readback probe without an explicit DevTools port', async () => {
    const { createGrokBrowserMediaGenerationExecutor } = await import('../src/media/grokBrowserExecutor.js');
    const executor = createGrokBrowserMediaGenerationExecutor({} as never);

    await expect(executor({
      id: 'medgen_grok_video_probe_missing_port',
      createdAt: '2026-04-24T12:00:00.000Z',
      artifactDir: '/tmp/auracall-grok-video-media-artifacts',
      request: {
        provider: 'grok',
        mediaType: 'video',
        prompt: 'Generate a video of an asphalt secret agent',
        transport: 'browser',
        metadata: {
          grokVideoReadbackProbe: true,
          grokVideoReadbackTabTargetId: 'grok-video-tab-probe',
        },
      },
    })).rejects.toMatchObject({
      code: 'media_generation_readback_failed',
      message: expect.stringContaining('grokVideoReadbackDevtoolsPort'),
    });

    expect(fromConfig).not.toHaveBeenCalled();
    expect(browserClient.getFeatureSignature).not.toHaveBeenCalled();
  });

  it('does not treat public template media as completed generated image output', async () => {
    const { createGrokBrowserMediaGenerationExecutor } = await import('../src/media/grokBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-grok-media-artifacts';
    browserClient.runPrompt.mockResolvedValueOnce({
      text: '',
      url: 'https://grok.com/imagine',
      tabTargetId: 'grok-tab-template',
    });
    browserClient.getFeatureSignature
      .mockResolvedValueOnce(JSON.stringify({
        detector: 'grok-feature-probe-v1',
        imagine: {
          run_state: 'terminal_image',
          pending: false,
          terminal_image: true,
          terminal_video: true,
          account_gated: false,
          blocked: false,
          media: {
            images: [{
              src: 'https://imagine-public.x.ai/imagine-public/share-images/template.jpg',
              generated: false,
              publicGallery: true,
              width: 1024,
              height: 1024,
            }],
            videos: [],
            urls: ['https://imagine-public.x.ai/imagine-public/share-images/template.jpg'],
          },
        },
      }))
      .mockResolvedValueOnce(JSON.stringify({
        detector: 'grok-feature-probe-v1',
        imagine: {
          run_state: 'terminal_image',
          pending: false,
          terminal_image: true,
          terminal_video: false,
          account_gated: false,
          blocked: false,
          media: {
            images: [{
              src: 'https://assets.grok.com/users/test/generated/image-2.jpg',
              generated: true,
              publicGallery: false,
              width: 1024,
              height: 1024,
            }],
            videos: [],
            urls: ['https://assets.grok.com/users/test/generated/image-2.jpg'],
          },
        },
      }));

    const executor = createGrokBrowserMediaGenerationExecutor({} as never);
    const observedGeneratedCounts: number[] = [];
    const result = await executor({
      id: 'medgen_grok_test',
      createdAt: '2026-04-24T12:00:00.000Z',
      artifactDir,
      emitTimeline: (event) => {
        if (event.event === 'run_state_observed') {
          observedGeneratedCounts.push(Number(event.details?.generatedImageCount ?? 0));
        }
      },
      request: {
        provider: 'grok',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        transport: 'browser',
        metadata: {
          artifactPollIntervalMs: 1,
        },
      },
    });

    expect(browserClient.getFeatureSignature).toHaveBeenCalledTimes(2);
    expect(observedGeneratedCounts).toEqual([0, 1]);
    expect(result.artifacts[0]).toMatchObject({
      id: 'grok_imagine_image_1',
      metadata: {
        remoteUrl: 'https://assets.grok.com/users/test/generated/image-2.jpg',
        materialization: 'remote-media-fetch',
      },
    });
  });

  it('surfaces repeated public template media as no generated output instead of a generic timeout', async () => {
    const { createGrokBrowserMediaGenerationExecutor } = await import('../src/media/grokBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-grok-media-artifacts';
    browserClient.runPrompt.mockResolvedValueOnce({
      text: '',
      url: 'https://grok.com/imagine/templates/template-1',
      tabTargetId: 'grok-tab-template',
    });
    const publicTemplateSignature = JSON.stringify({
      detector: 'grok-feature-probe-v1',
      imagine: {
        href: 'https://grok.com/imagine/templates/template-1',
        run_state: 'terminal_video',
        pending: false,
        terminal_image: true,
        terminal_video: true,
        account_gated: false,
        blocked: false,
        media: {
          images: [{
            src: 'https://imagine-public.x.ai/imagine-public/share-images/template.jpg',
            generated: false,
            publicGallery: true,
            width: 1024,
            height: 1024,
          }],
          videos: [{
            poster: 'https://imagine-public.x.ai/imagine-public/share-images/template.jpg',
            publicGallery: true,
          }],
          visible_tiles: [{
            src: 'https://imagine-public.x.ai/imagine-public/share-images/template.jpg',
            publicGallery: true,
          }],
          urls: ['https://imagine-public.x.ai/imagine-public/share-images/template.jpg'],
        },
      },
    });
    browserClient.getFeatureSignature.mockResolvedValue(publicTemplateSignature);

    const executor = createGrokBrowserMediaGenerationExecutor({} as never);
    const timelineEvents: string[] = [];
    await expect(executor({
      id: 'medgen_grok_test',
      createdAt: '2026-04-24T12:00:00.000Z',
      artifactDir,
      emitTimeline: (event) => {
        timelineEvents.push(event.event);
      },
      request: {
        provider: 'grok',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        transport: 'browser',
        metadata: {
          artifactPollIntervalMs: 1,
        },
      },
    })).rejects.toMatchObject({
      code: 'media_generation_no_generated_output',
      details: {
        runState: 'terminal_video',
        generatedImageCount: 0,
        publicGalleryImageCount: 1,
        publicGalleryVisibleTileCount: 1,
        templateRoute: true,
        providerHref: 'https://grok.com/imagine/templates/template-1',
      },
    });

    expect(browserClient.getFeatureSignature).toHaveBeenCalledTimes(3);
    expect(timelineEvents).toContain('no_generated_media');
    expect(timelineEvents).not.toContain('image_visible');
  });

  it('prefers browser-service visible tile capture and records full-quality comparison metadata', async () => {
    const { createGrokBrowserMediaGenerationExecutor } = await import('../src/media/grokBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-grok-media-artifacts';
    browserClient.runPrompt.mockResolvedValueOnce({
      text: '',
      url: 'https://grok.com/imagine',
      tabTargetId: 'grok-tab-2',
    });
    browserClient.getFeatureSignature.mockResolvedValueOnce(JSON.stringify({
      detector: 'grok-feature-probe-v1',
      imagine: {
        run_state: 'terminal_image',
        pending: false,
        terminal_image: true,
        terminal_video: false,
        account_gated: false,
        blocked: false,
        media: {
          images: [{
            src: 'data:image/jpeg;base64,<omitted 200 chars>',
            srcKind: 'data-url',
            generated: true,
            publicGallery: false,
          }],
          videos: [],
          visible_tiles: [{ srcKind: 'data-url', selected: true }],
          urls: [],
        },
      },
    }));
    browserClient.materializeActiveMediaArtifacts.mockResolvedValueOnce([
      {
        id: 'grok_imagine_visible_1',
        name: 'grok-imagine-visible-1.jpg',
        provider: 'grok',
        source: 'conversation',
        size: 10,
        mimeType: 'image/jpeg',
        localPath: path.join(artifactDir, 'grok-imagine-visible-1.jpg'),
        checksumSha256: 'preview-sha',
        metadata: {
          materialization: 'visible-tile-browser-capture',
          width: 277,
          height: 413,
          srcKind: 'data-url',
          selected: true,
        },
      },
      {
        id: 'grok_imagine_full_quality_1',
        name: 'grok-imagine-full-quality.jpg',
        provider: 'grok',
        source: 'conversation',
        size: 100,
        mimeType: 'image/jpeg',
        localPath: path.join(artifactDir, 'grok-imagine-full-quality.jpg'),
        checksumSha256: 'full-sha',
        metadata: {
          materialization: 'download-button',
          previewArtifactId: 'grok_imagine_visible_1',
          fullQualityDiffersFromPreview: true,
        },
      },
    ]);

    const executor = createGrokBrowserMediaGenerationExecutor({} as never);
    const timelineEvents: string[] = [];
    const result = await executor({
      id: 'medgen_grok_test',
      createdAt: '2026-04-24T12:00:00.000Z',
      artifactDir,
      emitTimeline: (event) => {
        timelineEvents.push(event.event);
      },
      request: {
        provider: 'grok',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        transport: 'browser',
        metadata: {
          visibleTileMaterializationLimit: 5,
        },
      },
    });

    expect(browserClient.materializeActiveMediaArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        maxItems: 5,
        compareFullQuality: true,
      }),
      artifactDir,
      expect.objectContaining({
        preserveActiveTab: true,
        mutationSourcePrefix: 'media:grok-imagine',
      }),
    );
    expect(result.artifacts).toMatchObject([
      {
        id: 'grok_imagine_visible_1',
        metadata: {
          materialization: 'visible-tile-browser-capture',
          checksumSha256: 'preview-sha',
        },
      },
      {
        id: 'grok_imagine_full_quality_1',
        metadata: {
          materialization: 'download-button',
          fullQualityDiffersFromPreview: true,
        },
      },
    ]);
    expect(timelineEvents).toContain('artifact_materialized');
    expect(fetch).not.toHaveBeenCalled();
  });
});
