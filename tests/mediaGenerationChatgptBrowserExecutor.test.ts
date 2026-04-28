import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserClient = {
  runPrompt: vi.fn(),
  readActiveConversationArtifacts: vi.fn(),
  materializeConversationArtifact: vi.fn(),
};

const fromConfig = vi.fn(async () => browserClient);

vi.mock('../src/browser/client.js', () => ({
  BrowserAutomationClient: {
    fromConfig,
  },
}));

describe('ChatGPT browser media generation executor', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('selects Create image, passively reads active-tab image artifacts, and materializes without navigation', async () => {
    const { createChatgptBrowserMediaGenerationExecutor } = await import('../src/media/chatgptBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-media-artifacts';
    const filePath = path.join(artifactDir, 'chatgpt-image.png');
    browserClient.runPrompt.mockImplementationOnce(async (input) => {
      await input.onProgress?.({
        phase: 'submit_path_observed',
        details: {
          provider: 'chatgpt',
          message: 'Composer tool: create image',
        },
      });
      return {
        text: '',
        conversationId: 'chatgpt-conversation-1',
        url: 'https://chatgpt.com/c/chatgpt-conversation-1',
        tabTargetId: 'chatgpt-tab-1',
      };
    });
    browserClient.readActiveConversationArtifacts.mockResolvedValueOnce([
      {
        id: 'artifact-image-1',
        title: 'Generated image 1',
        kind: 'image',
        uri: 'https://chatgpt.com/backend-api/estuary/content/mock',
        metadata: {
          mimeType: 'image/png',
        },
      },
    ]);
    browserClient.materializeConversationArtifact.mockResolvedValueOnce({
      id: 'artifact-image-1',
      name: 'chatgpt-image.png',
      provider: 'chatgpt',
      source: 'conversation',
      size: 1234,
      mimeType: 'image/png',
      remoteUrl: 'https://chatgpt.com/backend-api/estuary/content/mock',
      localPath: filePath,
      metadata: {
        materialization: 'estuary-image-fetch',
      },
    });

    const executor = createChatgptBrowserMediaGenerationExecutor({} as never);
    const timelineEvents: string[] = [];
    const result = await executor({
      id: 'medgen_chatgpt_test',
      createdAt: '2026-04-27T12:00:00.000Z',
      artifactDir,
      emitTimeline: (event) => {
        timelineEvents.push(event.event);
      },
      request: {
        provider: 'chatgpt',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        transport: 'browser',
        count: 1,
      },
    });

    expect(fromConfig).toHaveBeenCalledWith({}, { target: 'chatgpt' });
    expect(browserClient.runPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Generate an image of an asphalt secret agent',
        capabilityId: 'chatgpt.media.create_image',
        completionMode: 'prompt_submitted',
        noProject: true,
        timeoutMs: 300000,
        onProgress: expect.any(Function),
      }),
      {
        preserveActiveTab: true,
        mutationSourcePrefix: 'media:chatgpt-image',
      },
    );
    expect(browserClient.readActiveConversationArtifacts).toHaveBeenCalledWith(
      'chatgpt-conversation-1',
      {
        configuredUrl: 'https://chatgpt.com/c/chatgpt-conversation-1',
        tabUrl: 'https://chatgpt.com/c/chatgpt-conversation-1',
        tabTargetId: 'chatgpt-tab-1',
        preserveActiveTab: true,
        mutationSourcePrefix: 'media:chatgpt-image',
      },
    );
    expect(browserClient.materializeConversationArtifact).toHaveBeenCalledWith(
      'chatgpt-conversation-1',
      expect.objectContaining({ id: 'artifact-image-1' }),
      artifactDir,
      {
        listOptions: {
          configuredUrl: 'https://chatgpt.com/c/chatgpt-conversation-1',
          tabUrl: 'https://chatgpt.com/c/chatgpt-conversation-1',
          tabTargetId: 'chatgpt-tab-1',
          preserveActiveTab: true,
          mutationSourcePrefix: 'media:chatgpt-image',
        },
      },
    );
    expect(result).toMatchObject({
      artifacts: [
        {
          id: 'artifact-image-1',
          type: 'image',
          mimeType: 'image/png',
          fileName: 'chatgpt-image.png',
          path: filePath,
          uri: `file://${filePath}`,
          metadata: {
            provider: 'chatgpt',
            providerArtifactId: 'artifact-image-1',
            remoteUrl: 'https://chatgpt.com/backend-api/estuary/content/mock',
            materialization: 'estuary-image-fetch',
          },
        },
      ],
      metadata: {
        executor: 'chatgpt-browser',
        conversationId: 'chatgpt-conversation-1',
        tabTargetId: 'chatgpt-tab-1',
        capabilityId: 'chatgpt.media.create_image',
        generatedArtifactCount: 1,
        artifactPollCount: 1,
      },
    });
    expect(timelineEvents).toEqual([
      'submit_path_observed',
      'prompt_submitted',
      'image_visible',
      'artifact_materialized',
    ]);
  });

  it('fails fast when prompt submission does not return a submitted tab target id', async () => {
    const { createChatgptBrowserMediaGenerationExecutor } = await import('../src/media/chatgptBrowserExecutor.js');
    browserClient.runPrompt.mockResolvedValueOnce({
      text: '',
      conversationId: 'chatgpt-conversation-1',
      url: 'https://chatgpt.com/c/chatgpt-conversation-1',
      tabTargetId: null,
    });

    const executor = createChatgptBrowserMediaGenerationExecutor({} as never);
    await expect(executor({
      id: 'medgen_chatgpt_no_tab',
      createdAt: '2026-04-27T12:00:00.000Z',
      artifactDir: '/tmp/auracall-media-artifacts',
      request: {
        provider: 'chatgpt',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        transport: 'browser',
      },
    })).rejects.toMatchObject({
      code: 'media_generation_readback_failed',
    });
    expect(browserClient.readActiveConversationArtifacts).not.toHaveBeenCalled();
  });
});
