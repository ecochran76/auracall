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
        maxItems: 12,
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
      'prompt_submitted',
      'run_state_observed',
      'image_visible',
      'artifact_materialized',
    ]);
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
