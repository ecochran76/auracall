import { describe, expect, test, vi } from 'vitest';
import { readBoundedAttachmentInventory } from '../../src/accountMirror/chatgptMetadataCollector.js';

describe('ChatGPT account mirror metadata collector', () => {
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
    });
    expect(client.listProjectFiles).toHaveBeenCalledTimes(1);
    expect(client.listConversationFiles).not.toHaveBeenCalled();
    expect(client.getConversationContext).not.toHaveBeenCalled();
  });
});
