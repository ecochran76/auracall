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
    browserClient.runPrompt.mockResolvedValueOnce({
      text: 'Done',
      conversationId: 'gemini-conversation-1',
      url: 'https://gemini.google.com/app/gemini-conversation-1',
      tabTargetId: 'gemini-tab-1',
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
    const result = await executor({
      id: 'medgen_test',
      createdAt: '2026-04-23T12:00:00.000Z',
      artifactDir,
      request: {
        provider: 'gemini',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        transport: 'browser',
        count: 1,
      },
    });

    expect(fromConfig).toHaveBeenCalledWith({}, { target: 'gemini' });
    expect(browserClient.runPrompt).toHaveBeenCalledWith({
      prompt: 'Generate an image of an asphalt secret agent',
      capabilityId: 'gemini.media.create_image',
      completionMode: 'prompt_submitted',
      noProject: true,
      timeoutMs: 300000,
    });
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
    const resultPromise = executor({
      id: 'medgen_test',
      createdAt: '2026-04-23T12:00:00.000Z',
      artifactDir,
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
    browserClient.readActiveConversationArtifacts.mockResolvedValue([]);

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

  it('fails before prompt submission for non-image Gemini browser media', async () => {
    const { createGeminiBrowserMediaGenerationExecutor } = await import('../src/media/geminiBrowserExecutor.js');
    const executor = createGeminiBrowserMediaGenerationExecutor({} as never);

    await expect(
      executor({
        id: 'medgen_test',
        createdAt: '2026-04-23T12:00:00.000Z',
        artifactDir: '/tmp/auracall-media-artifacts',
        request: {
          provider: 'gemini',
          mediaType: 'music',
          prompt: 'Create spy music',
          transport: 'browser',
        },
      }),
    ).rejects.toMatchObject({
      code: 'media_provider_not_implemented',
    });
  });
});
