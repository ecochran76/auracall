import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserClient = {
  runPrompt: vi.fn(),
  getConversationContext: vi.fn(),
  readActiveConversationArtifacts: vi.fn(),
  materializeConversationArtifact: vi.fn(),
};

const fromConfig = vi.fn(async () => browserClient);

vi.mock('../src/browser/client.js', () => ({
  BrowserAutomationClient: {
    fromConfig,
  },
}));

describe('Gemini browser media generation executor', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('selects Create image, reads generated artifacts, and maps the materialized file', async () => {
    const { createGeminiBrowserMediaGenerationExecutor } = await import('../src/media/geminiBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-media-artifacts';
    const filePath = path.join(artifactDir, 'generated.png');
    browserClient.runPrompt.mockImplementationOnce(async (input) => {
      await input.onProgress?.({
        phase: 'browser_target_attached',
        details: {
          targetId: 'gemini-tab-1',
        },
      });
      await input.onProgress?.({
        phase: 'submitted_state_observed',
        details: {
          conversationId: 'gemini-conversation-1',
          targetId: 'gemini-tab-1',
          href: 'https://gemini.google.com/app/gemini-conversation-1',
          isGenerating: true,
        },
      });
      return {
        text: 'Done',
        conversationId: 'gemini-conversation-1',
        url: 'https://gemini.google.com/app/gemini-conversation-1',
        tabTargetId: 'gemini-tab-1',
      };
    });
    browserClient.readActiveConversationArtifacts.mockResolvedValueOnce([
      {
        id: 'artifact-image-1',
        title: 'Generated image 1',
        kind: 'image',
        uri: 'blob:https://gemini.google.com/image-1',
        metadata: {
          width: 1024,
          height: 1024,
        },
      },
    ]);
    browserClient.materializeConversationArtifact.mockResolvedValueOnce({
      id: 'artifact-image-1',
      name: 'generated.png',
      provider: 'gemini',
      source: 'conversation',
      size: 1234,
      mimeType: 'image/png',
      remoteUrl: 'blob:https://gemini.google.com/image-1',
      localPath: filePath,
      metadata: {
        materialization: 'blob-image-fetch',
      },
    });

    const executor = createGeminiBrowserMediaGenerationExecutor({} as never);
    const timelineEvents: string[] = [];
    const result = await executor({
      id: 'medgen_test',
      createdAt: '2026-04-23T12:00:00.000Z',
      artifactDir,
      emitTimeline: (event) => {
        timelineEvents.push(event.event);
      },
      request: {
        provider: 'gemini',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        transport: 'browser',
        count: 1,
      },
    });

    expect(fromConfig).toHaveBeenCalledWith({}, { target: 'gemini' });
    expect(browserClient.runPrompt).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Generate an image of an asphalt secret agent',
      capabilityId: 'gemini.media.create_image',
      completionMode: 'prompt_submitted',
      noProject: true,
      timeoutMs: 300000,
      onProgress: expect.any(Function),
    }));
    expect(browserClient.materializeConversationArtifact).toHaveBeenCalledWith(
      'gemini-conversation-1',
      expect.objectContaining({ id: 'artifact-image-1' }),
      artifactDir,
      {
        listOptions: {
          configuredUrl: 'https://gemini.google.com/app/gemini-conversation-1',
          tabUrl: 'https://gemini.google.com/app/gemini-conversation-1',
          tabTargetId: 'gemini-tab-1',
          preserveActiveTab: true,
        },
      },
    );
    expect(browserClient.getConversationContext).not.toHaveBeenCalled();
    expect(browserClient.readActiveConversationArtifacts).toHaveBeenCalledWith(
      'gemini-conversation-1',
      {
        configuredUrl: 'https://gemini.google.com/app/gemini-conversation-1',
        tabUrl: 'https://gemini.google.com/app/gemini-conversation-1',
        tabTargetId: 'gemini-tab-1',
        preserveActiveTab: true,
      },
    );
    expect(result).toMatchObject({
      model: null,
      artifacts: [
        {
          id: 'artifact-image-1',
          type: 'image',
          mimeType: 'image/png',
          fileName: 'generated.png',
          path: filePath,
          uri: `file://${filePath}`,
          width: 1024,
          height: 1024,
          metadata: {
            providerArtifactId: 'artifact-image-1',
            remoteUrl: 'blob:https://gemini.google.com/image-1',
            materialization: 'blob-image-fetch',
          },
        },
      ],
      metadata: {
        executor: 'gemini-browser',
        conversationId: 'gemini-conversation-1',
        tabTargetId: 'gemini-tab-1',
        capabilityId: 'gemini.media.create_image',
        generatedArtifactCount: 1,
        artifactPollCount: 1,
      },
    });
    expect(timelineEvents).toEqual([
      'browser_target_attached',
      'submitted_state_observed',
      'prompt_submitted',
      'artifact_poll',
      'image_visible',
      'artifact_materialized',
    ]);
  });

  it('selects Create video, waits for generated video artifacts, and maps the materialized file', async () => {
    const { createGeminiBrowserMediaGenerationExecutor } = await import('../src/media/geminiBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-media-artifacts';
    const filePath = path.join(artifactDir, 'generated-video.mp4');
    browserClient.runPrompt.mockResolvedValueOnce({
      text: '',
      conversationId: 'gemini-video-conversation-1',
      url: 'https://gemini.google.com/app/gemini-video-conversation-1',
      tabTargetId: 'gemini-video-tab-1',
    });
    browserClient.readActiveConversationArtifacts.mockResolvedValueOnce([
      {
        id: 'artifact-video-1',
        title: 'Generated video 1',
        kind: 'generated',
        uri: 'https://contribution.usercontent.google.com/download?filename=video.mp4',
        metadata: {
          mediaType: 'video',
          fileName: 'video.mp4',
        },
      },
    ]);
    browserClient.materializeConversationArtifact.mockResolvedValueOnce({
      id: 'artifact-video-1',
      name: 'generated-video.mp4',
      provider: 'gemini',
      source: 'conversation',
      size: 4321,
      mimeType: 'video/mp4',
      remoteUrl: 'https://contribution.usercontent.google.com/download?filename=video.mp4',
      localPath: filePath,
      metadata: {
        materialization: 'generated-media-fetch',
        mediaType: 'video',
      },
    });

    const executor = createGeminiBrowserMediaGenerationExecutor({} as never);
    const timelineEvents: string[] = [];
    const result = await executor({
      id: 'medgen_video_test',
      createdAt: '2026-04-25T12:00:00.000Z',
      artifactDir,
      emitTimeline: (event) => {
        timelineEvents.push(event.event);
      },
      request: {
        provider: 'gemini',
        mediaType: 'video',
        prompt: 'Generate a video of an asphalt secret agent',
        transport: 'browser',
        count: 1,
      },
    });

    expect(browserClient.runPrompt).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Generate a video of an asphalt secret agent',
      capabilityId: 'gemini.media.create_video',
      completionMode: 'prompt_submitted',
      noProject: true,
      timeoutMs: 600000,
      onProgress: expect.any(Function),
    }));
    expect(browserClient.readActiveConversationArtifacts).toHaveBeenCalledWith(
      'gemini-video-conversation-1',
      {
        configuredUrl: 'https://gemini.google.com/app/gemini-video-conversation-1',
        tabUrl: 'https://gemini.google.com/app/gemini-video-conversation-1',
        tabTargetId: 'gemini-video-tab-1',
        preserveActiveTab: true,
      },
    );
    expect(browserClient.materializeConversationArtifact).toHaveBeenCalledWith(
      'gemini-video-conversation-1',
      expect.objectContaining({ id: 'artifact-video-1' }),
      artifactDir,
      {
        listOptions: {
          configuredUrl: 'https://gemini.google.com/app/gemini-video-conversation-1',
          tabUrl: 'https://gemini.google.com/app/gemini-video-conversation-1',
          tabTargetId: 'gemini-video-tab-1',
          preserveActiveTab: true,
        },
      },
    );
    expect(result).toMatchObject({
      model: null,
      artifacts: [
        {
          id: 'artifact-video-1',
          type: 'video',
          mimeType: 'video/mp4',
          fileName: 'generated-video.mp4',
          path: filePath,
          uri: `file://${filePath}`,
          metadata: {
            providerArtifactId: 'artifact-video-1',
            remoteUrl: 'https://contribution.usercontent.google.com/download?filename=video.mp4',
            materialization: 'generated-media-fetch',
            mediaType: 'video',
          },
        },
      ],
      metadata: {
        executor: 'gemini-browser',
        conversationId: 'gemini-video-conversation-1',
        tabTargetId: 'gemini-video-tab-1',
        capabilityId: 'gemini.media.create_video',
        generatedArtifactCount: 1,
        artifactPollCount: 1,
      },
    });
    expect(timelineEvents).toEqual([
      'prompt_submitted',
      'artifact_poll',
      'video_visible',
      'artifact_materialized',
    ]);
  });

  it('selects Create music and materializes both video-with-artwork and mp3 variants', async () => {
    const { createGeminiBrowserMediaGenerationExecutor } = await import('../src/media/geminiBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-media-artifacts';
    const videoPath = path.join(artifactDir, 'spy-theme-with-artwork.mp4');
    const mp3Path = path.join(artifactDir, 'spy-theme.mp3');
    browserClient.runPrompt.mockResolvedValueOnce({
      text: '',
      conversationId: 'gemini-music-conversation-1',
      url: 'https://gemini.google.com/app/gemini-music-conversation-1',
      tabTargetId: 'gemini-music-tab-1',
    });
    browserClient.readActiveConversationArtifacts.mockResolvedValueOnce([
      {
        id: 'artifact-music-video-1',
        title: 'Spy Theme',
        kind: 'generated',
        uri: 'https://contribution.usercontent.google.com/download?filename=spy_theme_with_artwork.mp4',
        metadata: {
          mediaType: 'music',
          fileName: 'spy_theme_with_artwork.mp4',
          downloadLabel: 'Download as video with album art',
          downloadVariant: 'video_with_album_art',
        },
      },
      {
        id: 'artifact-music-mp3-1',
        title: 'Spy Theme',
        kind: 'generated',
        uri: 'https://contribution.usercontent.google.com/download?filename=spy_theme.mp3',
        metadata: {
          mediaType: 'music',
          fileName: 'spy_theme.mp3',
          downloadLabel: 'Download as MP3',
          downloadVariant: 'mp3',
        },
      },
    ]);
    browserClient.materializeConversationArtifact
      .mockResolvedValueOnce({
        id: 'artifact-music-video-1',
        name: 'spy-theme-with-artwork.mp4',
        provider: 'gemini',
        source: 'conversation',
        size: 9876,
        mimeType: 'video/mp4',
        remoteUrl: 'https://contribution.usercontent.google.com/download?filename=spy_theme_with_artwork.mp4',
        localPath: videoPath,
        metadata: {
          materialization: 'generated-media-fetch',
          mediaType: 'music',
          downloadVariant: 'video_with_album_art',
        },
      })
      .mockResolvedValueOnce({
        id: 'artifact-music-mp3-1',
        name: 'spy-theme.mp3',
        provider: 'gemini',
        source: 'conversation',
        size: 3456,
        mimeType: 'audio/mpeg',
        remoteUrl: 'https://contribution.usercontent.google.com/download?filename=spy_theme.mp3',
        localPath: mp3Path,
        metadata: {
          materialization: 'generated-media-fetch',
          mediaType: 'music',
          downloadVariant: 'mp3',
        },
      });

    const executor = createGeminiBrowserMediaGenerationExecutor({} as never);
    const timelineEvents: string[] = [];
    const result = await executor({
      id: 'medgen_music_test',
      createdAt: '2026-04-25T12:00:00.000Z',
      artifactDir,
      emitTimeline: (event) => {
        timelineEvents.push(event.event);
      },
      request: {
        provider: 'gemini',
        mediaType: 'music',
        prompt: 'Create a spy theme song',
        transport: 'browser',
        count: 1,
      },
    });

    expect(browserClient.runPrompt).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Create a spy theme song',
      capabilityId: 'gemini.media.create_music',
      completionMode: 'prompt_submitted',
      noProject: true,
      timeoutMs: 600000,
      onProgress: expect.any(Function),
    }));
    expect(browserClient.materializeConversationArtifact).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      artifacts: [
        {
          id: 'artifact-music-video-1',
          type: 'music',
          mimeType: 'video/mp4',
          fileName: 'spy-theme-with-artwork.mp4',
          path: videoPath,
          metadata: {
            providerArtifactId: 'artifact-music-video-1',
            mediaType: 'music',
            downloadVariant: 'video_with_album_art',
          },
        },
        {
          id: 'artifact-music-mp3-1',
          type: 'music',
          mimeType: 'audio/mpeg',
          fileName: 'spy-theme.mp3',
          path: mp3Path,
          metadata: {
            providerArtifactId: 'artifact-music-mp3-1',
            mediaType: 'music',
            downloadVariant: 'mp3',
          },
        },
      ],
      metadata: {
        executor: 'gemini-browser',
        conversationId: 'gemini-music-conversation-1',
        tabTargetId: 'gemini-music-tab-1',
        capabilityId: 'gemini.media.create_music',
        generatedArtifactCount: 2,
        artifactPollCount: 1,
      },
    });
    expect(timelineEvents).toEqual([
      'prompt_submitted',
      'artifact_poll',
      'music_visible',
      'artifact_materialized',
      'artifact_materialized',
    ]);
  });

  it('polls conversation artifacts after prompt submission before materializing', async () => {
    const { createGeminiBrowserMediaGenerationExecutor } = await import('../src/media/geminiBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-media-artifacts';
    const filePath = path.join(artifactDir, 'generated.png');
    browserClient.runPrompt.mockResolvedValueOnce({
      text: '',
      conversationId: 'gemini-conversation-2',
      url: 'https://gemini.google.com/app/gemini-conversation-2',
      tabTargetId: 'gemini-tab-2',
    });
    browserClient.readActiveConversationArtifacts
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'artifact-image-2',
          title: 'Generated image 1',
          kind: 'image',
          uri: 'blob:https://gemini.google.com/image-2',
        },
      ]);
    browserClient.materializeConversationArtifact.mockResolvedValueOnce({
      id: 'artifact-image-2',
      name: 'generated.png',
      provider: 'gemini',
      source: 'conversation',
      size: 1234,
      mimeType: 'image/png',
      remoteUrl: 'blob:https://gemini.google.com/image-2',
      localPath: filePath,
    });

    const executor = createGeminiBrowserMediaGenerationExecutor({} as never);
    const timelineEvents: string[] = [];
    const resultPromise = executor({
      id: 'medgen_test',
      createdAt: '2026-04-23T12:00:00.000Z',
      artifactDir,
      emitTimeline: (event) => {
        timelineEvents.push(event.event);
      },
      request: {
        provider: 'gemini',
        mediaType: 'image',
        prompt: 'Generate an image',
        transport: 'browser',
        metadata: {
          artifactPollIntervalMs: 250,
        },
      },
    });

    await expect(resultPromise).resolves.toMatchObject({
      artifacts: [{ id: 'artifact-image-2' }],
      metadata: {
        conversationId: 'gemini-conversation-2',
        artifactPollCount: 2,
      },
    });
    expect(timelineEvents).toEqual([
      'prompt_submitted',
      'artifact_poll',
      'artifact_poll',
      'image_visible',
      'artifact_materialized',
    ]);
    expect(browserClient.getConversationContext).not.toHaveBeenCalled();
    expect(browserClient.readActiveConversationArtifacts).toHaveBeenNthCalledWith(
      1,
      'gemini-conversation-2',
      {
        configuredUrl: 'https://gemini.google.com/app/gemini-conversation-2',
        tabUrl: 'https://gemini.google.com/app/gemini-conversation-2',
        tabTargetId: 'gemini-tab-2',
        preserveActiveTab: true,
      },
    );
  });

  it('reports a media-specific timeout when submitted Gemini image artifacts never appear', async () => {
    vi.useFakeTimers();
    const { createGeminiBrowserMediaGenerationExecutor } = await import('../src/media/geminiBrowserExecutor.js');
    browserClient.runPrompt.mockResolvedValueOnce({
      text: '',
      conversationId: 'gemini-conversation-timeout',
      url: 'https://gemini.google.com/app/gemini-conversation-timeout',
      tabTargetId: 'gemini-tab-timeout',
    });
    browserClient.readActiveConversationArtifacts.mockRejectedValue(
      new Error(
        'Gemini conversation content not found on the active tab for gemini-conversation-timeout. ' +
          'activeState={"href":"https://gemini.google.com/app","title":"Gemini","pathname":"/app","conversationId":null,"bodyTextLength":165}',
      ),
    );

    const executor = createGeminiBrowserMediaGenerationExecutor({} as never);
    const resultPromise = executor({
      id: 'medgen_test',
      createdAt: '2026-04-23T12:00:00.000Z',
      artifactDir: '/tmp/auracall-media-artifacts',
      request: {
        provider: 'gemini',
        mediaType: 'image',
        prompt: 'Generate an image',
        transport: 'browser',
        metadata: {
          timeoutMs: 30_000,
          artifactPollIntervalMs: 250,
        },
      },
    });

    const assertion = expect(resultPromise).rejects.toMatchObject({
      code: 'media_generation_provider_timeout',
      details: {
        conversationId: 'gemini-conversation-timeout',
        timeoutMs: 30_000,
        lastReadbackError: expect.stringContaining('activeState='),
      },
    });
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
    expect(browserClient.getConversationContext).not.toHaveBeenCalled();
  });

  it('fails instead of falling back to URL readback when the submitted tab id is missing', async () => {
    const { createGeminiBrowserMediaGenerationExecutor } = await import('../src/media/geminiBrowserExecutor.js');
    browserClient.runPrompt.mockResolvedValueOnce({
      text: '',
      conversationId: 'gemini-conversation-missing-tab',
      url: 'https://gemini.google.com/app/gemini-conversation-missing-tab',
    });

    const executor = createGeminiBrowserMediaGenerationExecutor({} as never);

    await expect(
      executor({
        id: 'medgen_test',
        createdAt: '2026-04-23T12:00:00.000Z',
        artifactDir: '/tmp/auracall-media-artifacts',
        request: {
          provider: 'gemini',
          mediaType: 'image',
          prompt: 'Generate an image',
          transport: 'browser',
        },
      }),
    ).rejects.toMatchObject({
      code: 'media_generation_readback_failed',
      details: {
        conversationId: 'gemini-conversation-missing-tab',
      },
    });
    expect(browserClient.getConversationContext).not.toHaveBeenCalled();
    expect(browserClient.readActiveConversationArtifacts).not.toHaveBeenCalled();
  });

  it('reports a media-specific timeout when submitted Gemini music artifacts never appear', async () => {
    vi.useFakeTimers();
    const { createGeminiBrowserMediaGenerationExecutor } = await import('../src/media/geminiBrowserExecutor.js');
    browserClient.runPrompt.mockResolvedValueOnce({
      text: '',
      conversationId: 'gemini-music-timeout',
      url: 'https://gemini.google.com/app/gemini-music-timeout',
      tabTargetId: 'gemini-music-timeout-tab',
    });
    browserClient.readActiveConversationArtifacts.mockResolvedValue([]);
    const executor = createGeminiBrowserMediaGenerationExecutor({} as never);

    const resultPromise = executor({
      id: 'medgen_test',
      createdAt: '2026-04-23T12:00:00.000Z',
      artifactDir: '/tmp/auracall-media-artifacts',
      request: {
        provider: 'gemini',
        mediaType: 'music',
        prompt: 'Create spy music',
        transport: 'browser',
        metadata: {
          timeoutMs: 30_000,
          artifactPollIntervalMs: 250,
        },
      },
    });

    const assertion = expect(resultPromise).rejects.toMatchObject({
      code: 'media_generation_provider_timeout',
      details: {
        conversationId: 'gemini-music-timeout',
        timeoutMs: 30_000,
      },
    });
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });
});
