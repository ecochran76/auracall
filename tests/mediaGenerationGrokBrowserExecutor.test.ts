import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserClient = {
  runPrompt: vi.fn(),
  getFeatureSignature: vi.fn(),
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
              src: 'https://imagine-public.x.ai/generated/image-1.jpg',
              width: 1024,
              height: 1024,
            },
          ],
          videos: [],
          urls: ['https://imagine-public.x.ai/generated/image-1.jpg'],
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
            remoteUrl: 'https://imagine-public.x.ai/generated/image-1.jpg',
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
});
