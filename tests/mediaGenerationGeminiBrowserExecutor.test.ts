import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const browserClient = {
  runPrompt: vi.fn(),
  getConversationContext: vi.fn(),
  materializeConversationArtifact: vi.fn(),
};

const fromConfig = vi.fn(async () => browserClient);

vi.mock('../src/browser/client.js', () => ({
  BrowserAutomationClient: {
    fromConfig,
  },
}));

describe('Gemini browser media generation executor', () => {
  it('selects Create image, reads generated artifacts, and maps the materialized file', async () => {
    const { createGeminiBrowserMediaGenerationExecutor } = await import('../src/media/geminiBrowserExecutor.js');
    const artifactDir = '/tmp/auracall-media-artifacts';
    const filePath = path.join(artifactDir, 'generated.png');
    browserClient.runPrompt.mockResolvedValueOnce({
      text: 'Done',
      conversationId: 'gemini-conversation-1',
      url: 'https://gemini.google.com/app/gemini-conversation-1',
    });
    browserClient.getConversationContext.mockResolvedValueOnce({
      provider: 'gemini',
      conversationId: 'gemini-conversation-1',
      messages: [{ role: 'assistant', text: 'Done' }],
      artifacts: [
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
      ],
    });
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
      noProject: true,
      timeoutMs: 300000,
    });
    expect(browserClient.materializeConversationArtifact).toHaveBeenCalledWith(
      'gemini-conversation-1',
      expect.objectContaining({ id: 'artifact-image-1' }),
      artifactDir,
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
        capabilityId: 'gemini.media.create_image',
        generatedArtifactCount: 1,
      },
    });
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
