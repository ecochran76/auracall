import type { Conversation, ConversationContext, FileRef, Project } from '../../providers/domain.js';
import type { CacheReadResult, ProviderCacheContext } from '../../providers/cache.js';
import {
  readProjectCache,
  readConversationCache,
  readConversationContextCache,
  readConversationFilesCache,
  writeProjectCache,
  writeConversationCache,
  writeConversationContextCache,
  writeConversationFilesCache,
} from '../../providers/cache.js';

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
}

export class JsonCacheStore implements CacheStore {
  async readProjects(context: ProviderCacheContext): Promise<CacheReadResult<Project[]>> {
    return readProjectCache(context);
  }

  async writeProjects(context: ProviderCacheContext, items: Project[]): Promise<void> {
    await writeProjectCache(context, items);
  }

  async readConversations(
    context: ProviderCacheContext,
  ): Promise<CacheReadResult<Conversation[]>> {
    return readConversationCache(context);
  }

  async writeConversations(context: ProviderCacheContext, items: Conversation[]): Promise<void> {
    await writeConversationCache(context, items);
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
  }
}

export type CacheStoreKind = 'json';

export function createCacheStore(kind: CacheStoreKind = 'json'): CacheStore {
  if (kind === 'json') {
    return new JsonCacheStore();
  }
  return new JsonCacheStore();
}
