import type { Conversation, ConversationContext, FileRef, Project } from '../../providers/domain.js';
import type { CacheReadResult, ProviderCacheContext } from '../../providers/cache.js';
import {
  readProjectCache,
  readConversationCache,
  readConversationContextCache,
  readConversationFilesCache,
  readConversationAttachmentsCache,
  readProjectKnowledgeCache,
  readProjectInstructionsCache,
  writeProjectCache,
  writeConversationCache,
  writeConversationContextCache,
  writeConversationFilesCache,
  writeConversationAttachmentsCache,
  writeProjectKnowledgeCache,
  writeProjectInstructionsCache,
} from '../../providers/cache.js';
import { resolveCacheEntryPath, upsertCacheIndexEntry } from './index.js';

export interface CacheStore {
  readProjects(context: ProviderCacheContext): Promise<CacheReadResult<Project[]>>;
  writeProjects(context: ProviderCacheContext, items: Project[]): Promise<void>;
  readConversations(context: ProviderCacheContext): Promise<CacheReadResult<Conversation[]>>;
  writeConversations(context: ProviderCacheContext, items: Conversation[]): Promise<void>;
  readConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<ConversationContext>>;
  writeConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
    payload: ConversationContext,
  ): Promise<void>;
  readConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>>;
  writeConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void>;
  readConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>>;
  writeConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void>;
  readProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<FileRef[]>>;
  writeProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
    files: FileRef[],
  ): Promise<void>;
  readProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<{ content: string; format: 'md' }>>;
  writeProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
    content: string,
  ): Promise<void>;
}

export class JsonCacheStore implements CacheStore {
  async readProjects(context: ProviderCacheContext): Promise<CacheReadResult<Project[]>> {
    return readProjectCache(context);
  }

  async writeProjects(context: ProviderCacheContext, items: Project[]): Promise<void> {
    await writeProjectCache(context, items);
    await upsertCacheIndexEntry(context, {
      kind: 'projects',
      path: resolveCacheEntryPath(context, 'projects.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversations(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<Conversation[]>> {
    return readConversationCache(context);
  }

  async writeConversations(context: ProviderCacheContext, items: Conversation[]): Promise<void> {
    await writeConversationCache(context, items);
    await upsertCacheIndexEntry(context, {
      kind: 'conversations',
      path: resolveCacheEntryPath(context, 'conversations.json'),
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<ConversationContext>> {
    return readConversationContextCache(context, conversationId);
  }

  async writeConversationContext(
    context: ProviderCacheContext,
    conversationId: string,
    payload: ConversationContext,
  ): Promise<void> {
    await writeConversationContextCache(context, conversationId, payload);
    await upsertCacheIndexEntry(context, {
      kind: 'context',
      path: resolveCacheEntryPath(context, `contexts/${conversationId}.json`),
      conversationId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return readConversationFilesCache(context, conversationId);
  }

  async writeConversationFiles(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void> {
    await writeConversationFilesCache(context, conversationId, files);
    await upsertCacheIndexEntry(context, {
      kind: 'conversation-files',
      path: resolveCacheEntryPath(context, `conversation-files/${conversationId}.json`),
      conversationId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return readConversationAttachmentsCache(context, conversationId);
  }

  async writeConversationAttachments(
    context: ProviderCacheContext,
    conversationId: string,
    files: FileRef[],
  ): Promise<void> {
    await writeConversationAttachmentsCache(context, conversationId, files);
    await upsertCacheIndexEntry(context, {
      kind: 'conversation-attachments',
      path: resolveCacheEntryPath(context, `conversation-attachments/${conversationId}/manifest.json`),
      conversationId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<FileRef[]>> {
    return readProjectKnowledgeCache(context, projectId);
  }

  async writeProjectKnowledge(
    context: ProviderCacheContext,
    projectId: string,
    files: FileRef[],
  ): Promise<void> {
    await writeProjectKnowledgeCache(context, projectId, files);
    await upsertCacheIndexEntry(context, {
      kind: 'project-knowledge',
      path: resolveCacheEntryPath(context, `project-knowledge/${projectId}/manifest.json`),
      projectId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }

  async readProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
  ): Promise<CacheReadResult<{ content: string; format: 'md' }>> {
    return readProjectInstructionsCache(context, projectId);
  }

  async writeProjectInstructions(
    context: ProviderCacheContext,
    projectId: string,
    content: string,
  ): Promise<void> {
    await writeProjectInstructionsCache(context, projectId, content);
    await upsertCacheIndexEntry(context, {
      kind: 'project-instructions',
      path: resolveCacheEntryPath(context, `project-instructions/${projectId}.md`),
      projectId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
    await upsertCacheIndexEntry(context, {
      kind: 'project-instructions',
      path: resolveCacheEntryPath(context, `project-instructions/${projectId}.json`),
      projectId,
      sourceUrl: context.listOptions.configuredUrl ?? null,
    });
  }
}

export type CacheStoreKind = 'json';

export function createCacheStore(kind: CacheStoreKind = 'json'): CacheStore {
  if (kind === 'json') {
    return new JsonCacheStore();
  }
  return new JsonCacheStore();
}
