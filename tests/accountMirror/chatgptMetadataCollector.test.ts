import { describe, expect, test, vi } from 'vitest';
import {
  mapChatgptLibraryFilesToArtifacts,
  mapGrokAccountFilesToMediaManifest,
  readBoundedAttachmentInventory,
  readBoundedChatgptDetailInventory,
  readBoundedChatgptLibraryInventory,
  readBoundedGrokAccountFileInventory,
} from '../../src/accountMirror/chatgptMetadataCollector.js';

describe('ChatGPT account mirror metadata collector', () => {
  test('reads ChatGPT library files as account files and artifacts', async () => {
    const client = {
      listAccountFiles: vi.fn(async () => [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Library report.pdf',
          provider: 'chatgpt' as const,
          source: 'account' as const,
          remoteUrl: 'https://chatgpt.com/library/files/123e4567-e89b-12d3-a456-426614174000',
          metadata: {
            source: 'chatgpt-library',
            artifactId: 'chatgpt-library:123e4567-e89b-12d3-a456-426614174000',
            artifactKind: 'download',
          },
        },
      ]),
    };

    const inventory = await readBoundedChatgptLibraryInventory(client, 8);

    expect(inventory).toMatchObject({
      truncated: false,
      files: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          source: 'account',
        },
      ],
      artifacts: [
        {
          id: 'chatgpt-library:123e4567-e89b-12d3-a456-426614174000',
          title: 'Library report.pdf',
          kind: 'download',
          metadata: {
            fileId: '123e4567-e89b-12d3-a456-426614174000',
            fileSource: 'account',
          },
        },
      ],
    });
  });

  test('uses ChatGPT library inventory instead of slower conversation attachment inventory when available', async () => {
    const client = {
      listAccountFiles: vi.fn(async () => [
        {
          id: '223e4567-e89b-12d3-a456-426614174111',
          name: 'Library sheet.xlsx',
          provider: 'chatgpt' as const,
          source: 'account' as const,
          metadata: {
            source: 'chatgpt-library',
            artifactKind: 'spreadsheet',
          },
        },
      ]),
      listProjectFiles: vi.fn(async () => []),
      listConversationFiles: vi.fn(async (conversationId: string) => [
        {
          id: `conversation-file-${conversationId}`,
          name: 'User upload.png',
          provider: 'chatgpt' as const,
          source: 'conversation' as const,
        },
      ]),
      getConversationContext: vi.fn(async () => ({
        provider: 'chatgpt' as const,
        conversationId: 'conv_1',
        messages: [],
        artifacts: [],
      })),
    };

    const inventory = await readBoundedChatgptDetailInventory(
      client,
      [],
      [{ id: 'conv_1', title: 'Conversation 1', provider: 'chatgpt' }],
      4,
      2,
    );

    expect(inventory.files.map((file) => file.id)).toEqual(['223e4567-e89b-12d3-a456-426614174111']);
    expect(inventory.artifacts.map((artifact) => artifact.id)).toEqual([
      'chatgpt-library:223e4567-e89b-12d3-a456-426614174111',
    ]);
    expect(inventory.truncated).toBe(false);
    expect(client.listConversationFiles).not.toHaveBeenCalled();
  });

  test('maps only ChatGPT library files into account artifacts', () => {
    const artifacts = mapChatgptLibraryFilesToArtifacts([
      {
        id: 'library-file',
        name: 'Library canvas',
        provider: 'chatgpt',
        source: 'account',
        metadata: {
          source: 'chatgpt-library',
          artifactKind: 'canvas',
        },
      },
      {
        id: 'conversation-file',
        name: 'Conversation upload',
        provider: 'chatgpt',
        source: 'conversation',
      },
    ]);

    expect(artifacts).toEqual([
      {
        id: 'chatgpt-library:library-file',
        title: 'Library canvas',
        kind: 'canvas',
        uri: undefined,
        metadata: {
          source: 'chatgpt-library',
          artifactKind: 'canvas',
          fileId: 'library-file',
          fileSource: 'account',
        },
      },
    ]);
  });

  test('builds a bounded file and artifact inventory from project and conversation indexes', async () => {
    const client = {
      listProjectFiles: vi.fn(async (projectId: string) => [
        {
          id: `project-file-${projectId}`,
          name: 'Project source.pdf',
          provider: 'chatgpt' as const,
          source: 'project' as const,
        },
      ]),
      listConversationFiles: vi.fn(async (conversationId: string) => [
        {
          id: `conversation-file-${conversationId}`,
          name: 'User upload.png',
          provider: 'chatgpt' as const,
          source: 'conversation' as const,
        },
      ]),
      getConversationContext: vi.fn(async (conversationId: string) => ({
        provider: 'chatgpt' as const,
        conversationId,
        messages: [],
        artifacts: [
          {
            id: `artifact-${conversationId}`,
            title: 'Generated report',
            kind: 'document' as const,
          },
        ],
      })),
    };

    const inventory = await readBoundedAttachmentInventory(
      client,
      [{ id: 'project_1', name: 'Project 1', provider: 'chatgpt' }],
      [{ id: 'conv_1', title: 'Conversation 1', provider: 'chatgpt', projectId: 'project_1' }],
      3,
    );

    expect(inventory).toMatchObject({
      truncated: false,
      cursor: {
        nextProjectIndex: 0,
        nextConversationIndex: 0,
        scannedProjects: 1,
        scannedConversations: 1,
      },
      files: [
        {
          id: 'project-file-project_1',
          name: 'Project source.pdf',
          source: 'project',
          metadata: {
            projectId: 'project_1',
          },
        },
        {
          id: 'conversation-file-conv_1',
          name: 'User upload.png',
          source: 'conversation',
          metadata: {
            conversationId: 'conv_1',
            projectId: 'project_1',
          },
        },
      ],
      artifacts: [
        {
          id: 'artifact-conv_1',
          title: 'Generated report',
          metadata: {
            conversationId: 'conv_1',
            projectId: 'project_1',
          },
        },
      ],
    });
  });

  test('marks attachment inventory truncated when the artifact budget is exhausted', async () => {
    const client = {
      listProjectFiles: vi.fn(async () => [
        {
          id: 'project-file-1',
          name: 'Project source.pdf',
          provider: 'chatgpt' as const,
          source: 'project' as const,
        },
      ]),
      listConversationFiles: vi.fn(async () => []),
      getConversationContext: vi.fn(async (conversationId: string) => ({
        provider: 'chatgpt' as const,
        conversationId,
        messages: [],
        artifacts: [],
      })),
    };

    const inventory = await readBoundedAttachmentInventory(
      client,
      [
        { id: 'project_1', name: 'Project 1', provider: 'chatgpt' },
        { id: 'project_2', name: 'Project 2', provider: 'chatgpt' },
      ],
      [],
      1,
    );

    expect(inventory.files).toHaveLength(1);
    expect(inventory.truncated).toBe(true);
    expect(client.listProjectFiles).toHaveBeenCalledTimes(1);
  });

  test('uses a small detail-read budget separate from the artifact row budget', async () => {
    const client = {
      listProjectFiles: vi.fn(async (projectId: string) => [
        {
          id: `project-file-${projectId}`,
          name: 'Project source.pdf',
          provider: 'chatgpt' as const,
          source: 'project' as const,
        },
      ]),
      listConversationFiles: vi.fn(async () => []),
      getConversationContext: vi.fn(async (conversationId: string) => ({
        provider: 'chatgpt' as const,
        conversationId,
        messages: [],
        artifacts: [],
      })),
    };

    const inventory = await readBoundedAttachmentInventory(
      client,
      [
        { id: 'project_1', name: 'Project 1', provider: 'chatgpt' },
        { id: 'project_2', name: 'Project 2', provider: 'chatgpt' },
      ],
      [{ id: 'conv_1', title: 'Conversation 1', provider: 'chatgpt' }],
      80,
      2,
    );

    expect(inventory.files).toHaveLength(2);
    expect(inventory.truncated).toBe(true);
    expect(client.listProjectFiles).toHaveBeenCalledTimes(2);
    expect(client.listConversationFiles).not.toHaveBeenCalled();
    expect(client.getConversationContext).not.toHaveBeenCalled();
  });

  test('continues attachment inventory from the prior cursor', async () => {
    const client = {
      listProjectFiles: vi.fn(async (projectId: string) => [
        {
          id: `project-file-${projectId}`,
          name: 'Project source.pdf',
          provider: 'chatgpt' as const,
          source: 'project' as const,
        },
      ]),
      listConversationFiles: vi.fn(async (conversationId: string) => [
        {
          id: `conversation-file-${conversationId}`,
          name: 'User upload.png',
          provider: 'chatgpt' as const,
          source: 'conversation' as const,
        },
      ]),
      getConversationContext: vi.fn(async (conversationId: string) => ({
        provider: 'chatgpt' as const,
        conversationId,
        messages: [],
        artifacts: [],
      })),
    };

    const inventory = await readBoundedAttachmentInventory(
      client,
      [
        { id: 'project_1', name: 'Project 1', provider: 'chatgpt' },
        { id: 'project_2', name: 'Project 2', provider: 'chatgpt' },
      ],
      [
        { id: 'conv_1', title: 'Conversation 1', provider: 'chatgpt' },
        { id: 'conv_2', title: 'Conversation 2', provider: 'chatgpt' },
      ],
      80,
      {
        maxDetailReads: 2,
        cursor: {
          nextProjectIndex: 1,
          nextConversationIndex: 0,
          detailReadLimit: 2,
          scannedProjects: 1,
          scannedConversations: 0,
        },
      },
    );

    expect(inventory.files.map((file) => file.id)).toEqual([
      'project-file-project_2',
      'conversation-file-conv_1',
    ]);
    expect(inventory.cursor).toMatchObject({
      nextProjectIndex: 2,
      nextConversationIndex: 1,
      detailReadLimit: 2,
      scannedProjects: 1,
      scannedConversations: 1,
    });
    expect(inventory.truncated).toBe(true);
    expect(client.listProjectFiles).toHaveBeenCalledWith('project_2');
    expect(client.listConversationFiles).toHaveBeenCalledWith('conv_1', { projectId: undefined });
  });

  test('yields between detail reads when higher-priority work is waiting', async () => {
    const shouldYield = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const client = {
      listProjectFiles: vi.fn(async (projectId: string) => [
        {
          id: `project-file-${projectId}`,
          name: 'Project source.pdf',
          provider: 'chatgpt' as const,
          source: 'project' as const,
        },
      ]),
      listConversationFiles: vi.fn(async () => []),
      getConversationContext: vi.fn(async () => ({
        provider: 'chatgpt' as const,
        conversationId: 'conv_1',
        messages: [],
        artifacts: [],
      })),
    };

    const inventory = await readBoundedAttachmentInventory(
      client,
      [
        { id: 'project_1', name: 'Project 1', provider: 'chatgpt' },
        { id: 'project_2', name: 'Project 2', provider: 'chatgpt' },
      ],
      [{ id: 'conv_1', title: 'Conversation 1', provider: 'chatgpt' }],
      80,
      {
        maxDetailReads: 6,
        shouldYield,
      },
    );

    expect(inventory.truncated).toBe(true);
    expect(inventory.files.map((file) => file.id)).toEqual(['project-file-project_1']);
    expect(inventory.cursor).toMatchObject({
      nextProjectIndex: 1,
      nextConversationIndex: 0,
      scannedProjects: 1,
      scannedConversations: 0,
      yielded: true,
    });
    expect(client.listProjectFiles).toHaveBeenCalledTimes(1);
    expect(client.listConversationFiles).not.toHaveBeenCalled();
    expect(client.getConversationContext).not.toHaveBeenCalled();
  });

  test('builds a bounded Grok account-file inventory with media manifests', async () => {
    const client = {
      listAccountFiles: vi.fn(async () => [
        {
          id: 'grok_image_1',
          name: 'asphalt-agent.jpg',
          provider: 'grok' as const,
          source: 'account' as const,
          remoteUrl: 'https://assets.grok.com/generated/asphalt-agent/image.jpg?cache=1',
        },
        {
          id: 'grok_video_1',
          name: 'handoff.mp4',
          provider: 'grok' as const,
          source: 'account' as const,
          remoteUrl: 'https://assets.grok.com/generated/handoff/video.mp4?cache=1',
        },
        {
          id: 'grok_doc_1',
          name: 'notes.txt',
          provider: 'grok' as const,
          source: 'account' as const,
        },
      ]),
    };

    const inventory = await readBoundedGrokAccountFileInventory(client, 2);

    expect(client.listAccountFiles).toHaveBeenCalledTimes(1);
    expect(inventory).toMatchObject({
      artifacts: [],
      truncated: true,
      cursor: null,
      files: [
        { id: 'grok_image_1', name: 'asphalt-agent.jpg', source: 'account' },
        { id: 'grok_video_1', name: 'handoff.mp4', source: 'account' },
      ],
      media: [
        {
          id: 'grok-account-file:grok_image_1',
          title: 'asphalt-agent.jpg',
          mediaType: 'image',
          uri: 'https://assets.grok.com/generated/asphalt-agent/image.jpg?cache=1',
          provider: 'grok',
          metadata: {
            source: 'grok-account-files',
            fileId: 'grok_image_1',
            fileSource: 'account',
          },
        },
        {
          id: 'grok-account-file:grok_video_1',
          title: 'handoff.mp4',
          mediaType: 'video',
          provider: 'grok',
        },
      ],
    });
  });

  test('tolerates Grok account-files drift without failing metadata collection', async () => {
    const client = {
      listAccountFiles: vi.fn(async () => {
        throw new Error('files page changed');
      }),
    };

    const inventory = await readBoundedGrokAccountFileInventory(client, 8);

    expect(inventory).toEqual({
      artifacts: [],
      files: [],
      media: [],
      truncated: false,
      cursor: null,
    });
  });

  test('infers Grok media type from URL and MIME type', () => {
    const media = mapGrokAccountFilesToMediaManifest([
      {
        id: 'asset_png',
        name: 'asset',
        provider: 'grok',
        source: 'account',
        remoteUrl: 'https://assets.grok.com/generated/asset/image.png?cache=1',
      },
      {
        id: 'asset_audio',
        name: 'track',
        provider: 'grok',
        source: 'account',
        mimeType: 'audio/mpeg',
      },
      {
        id: 'asset_unknown',
        name: 'prompt.json',
        provider: 'grok',
        source: 'account',
      },
    ]);

    expect(media.map((entry) => [entry.id, entry.mediaType])).toEqual([
      ['grok-account-file:asset_png', 'image'],
      ['grok-account-file:asset_audio', 'audio'],
    ]);
  });
});
