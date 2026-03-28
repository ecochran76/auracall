import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import type { ResolvedUserConfig } from '../../src/config.js';
import type { BrowserProviderListOptions } from '../../src/browser/providers/types.js';
import type { FileRef } from '../../src/browser/providers/domain.js';
import type { ProviderCacheContext } from '../../src/browser/providers/cache.js';
import { JsonCacheStore } from '../../src/browser/llmService/cache/store.js';
import { LlmService } from '../../src/browser/llmService/llmService.js';
import type { CacheStore } from '../../src/browser/llmService/cache/store.js';
import type { LlmServiceAdapter } from '../../src/browser/llmService/types.js';

class TestLlmService extends LlmService {
  constructor(
    provider: LlmServiceAdapter,
    cacheStore: CacheStore,
    private readonly fixedCacheContext: ProviderCacheContext,
  ) {
    super({ browser: { cache: {} } } as ResolvedUserConfig, provider, {} as never, { cacheStore });
  }

  override async buildListOptions(
    overrides: BrowserProviderListOptions = {},
  ): Promise<BrowserProviderListOptions> {
    return { ...overrides };
  }

  override async resolveCacheContext(): Promise<ProviderCacheContext> {
    return this.fixedCacheContext;
  }

  async listProjects(): Promise<[]> {
    return [];
  }

  async listConversations(): Promise<[]> {
    return [];
  }

  async renameConversation(): Promise<void> {}

  async deleteConversation(): Promise<void> {}

  async getUserIdentity() {
    return null;
  }
}

class BuildListOptionsLlmService extends LlmService {
  constructor(provider: LlmServiceAdapter, browserService: unknown) {
    super({ browser: { cache: {} } } as ResolvedUserConfig, provider, browserService as never, {});
  }

  async listProjects(): Promise<[]> {
    return [];
  }

  async listConversations(): Promise<[]> {
    return [];
  }

  async renameConversation(): Promise<void> {}

  async deleteConversation(): Promise<void> {}

  async getUserIdentity() {
    return null;
  }
}

describe('llmService project file cache writes', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('listProjectFiles writes Grok project files into project-knowledge cache', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-llm-files-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const cacheContext: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const store = new JsonCacheStore();
    const files: FileRef[] = [
      { id: 'notes.txt', name: 'notes.txt', provider: 'grok', source: 'project', size: 12 },
    ];
    const provider = {
      id: 'grok',
      config: { id: 'grok', selectors: {} as never },
      listProjectFiles: vi.fn(async () => files),
    };
    const service = new TestLlmService(provider as never, store, cacheContext);

    try {
      const result = await service.listProjectFiles('project-123', { listOptions: {} });
      expect(result).toEqual(files);
      const cached = await store.readProjectKnowledge(cacheContext, 'project-123');
      expect(cached.items).toEqual(files);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('listAccountFiles writes Grok account files into account-files cache', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-llm-files-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const cacheContext: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const store = new JsonCacheStore();
    const files: FileRef[] = [
      { id: 'file-123', name: 'notes.txt', provider: 'grok', source: 'account' },
    ];
    const provider = {
      id: 'grok',
      config: { id: 'grok', selectors: {} as never },
      listAccountFiles: vi.fn(async () => files),
    };
    const service = new TestLlmService(provider as never, store, cacheContext);

    try {
      const result = await service.listAccountFiles({ listOptions: {} });
      expect(result).toEqual(files);
      const cached = await store.readAccountFiles(cacheContext);
      expect(cached.items).toEqual(files);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('listConversationFiles writes conversation-files cache from provider listConversationFiles', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-llm-files-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const cacheContext: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const store = new JsonCacheStore();
    const files: FileRef[] = [
      { id: 'file-1', name: 'conversation-note.txt', provider: 'grok', source: 'conversation' },
    ];
    const provider = {
      id: 'grok',
      config: { id: 'grok', selectors: {} as never },
      listConversationFiles: vi.fn(async () => files),
    };
    const service = new TestLlmService(provider as never, store, cacheContext);

    try {
      const result = await service.listConversationFiles('conversation-123', { listOptions: {} });
      expect(result).toEqual(files);
      expect(provider.listConversationFiles).toHaveBeenCalledWith('conversation-123', {});
      const cached = await store.readConversationFiles(cacheContext, 'conversation-123');
      expect(cached.items).toEqual(files);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('listConversationFiles falls back to context files when provider lacks listConversationFiles', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-llm-files-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const cacheContext: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const store = new JsonCacheStore();
    const files: FileRef[] = [
      { id: 'file-ctx-1', name: 'context-note.txt', provider: 'grok', source: 'conversation' },
    ];
    const provider = {
      id: 'grok',
      config: { id: 'grok', selectors: {} as never },
      readConversationContext: vi.fn(async () => ({
        provider: 'grok',
        conversationId: 'conversation-ctx',
        messages: [{ role: 'user', text: 'ping' }],
        files,
      })),
    };
    const service = new TestLlmService(provider as never, store, cacheContext);

    try {
      const result = await service.listConversationFiles('conversation-ctx', { listOptions: {} });
      expect(result).toEqual(files);
      expect(provider.readConversationContext).toHaveBeenCalled();
      const cached = await store.readConversationFiles(cacheContext, 'conversation-ctx');
      expect(cached.items).toEqual(files);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('buildListOptions honors explicit host/port without rediscovering the browser target', async () => {
    const browserService = {
      resolveServiceTarget: vi.fn(async () => ({
        host: '127.0.0.1',
        port: 45011,
        tab: { targetId: 'should-not-be-used' },
      })),
    };
    const provider = {
      id: 'grok',
      config: { id: 'grok', selectors: {} as never },
    };
    const service = new BuildListOptionsLlmService(provider as never, browserService);

    const result = await service.buildListOptions({
      host: '127.0.0.1',
      port: 9222,
      configuredUrl: 'https://grok.com/c/conversation-123',
    });

    expect(browserService.resolveServiceTarget).not.toHaveBeenCalled();
    expect(result.host).toBe('127.0.0.1');
    expect(result.port).toBe(9222);
    expect(result.configuredUrl).toBe('https://grok.com/c/conversation-123');
  });

  test('uploadProjectFiles refreshes project-knowledge cache from the live list', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-llm-files-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const cacheContext: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const store = new JsonCacheStore();
    const files: FileRef[] = [
      { id: 'spec.md', name: 'spec.md', provider: 'grok', source: 'project', size: 21 },
    ];
    const provider = {
      id: 'grok',
      config: { id: 'grok', selectors: {} as never },
      uploadProjectFiles: vi.fn(async () => undefined),
      listProjectFiles: vi.fn(async () => files),
    };
    const service = new TestLlmService(provider as never, store, cacheContext);

    try {
      await service.uploadProjectFiles('project-123', ['/tmp/spec.md'], { listOptions: {} });
      expect(provider.uploadProjectFiles).toHaveBeenCalledWith('project-123', ['/tmp/spec.md'], {});
      expect(provider.listProjectFiles).toHaveBeenCalledWith('project-123', {});
      const cached = await store.readProjectKnowledge(cacheContext, 'project-123');
      expect(cached.items).toEqual(files);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('uploadAccountFiles refreshes account-files cache from the live list', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-llm-files-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const cacheContext: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const store = new JsonCacheStore();
    const files: FileRef[] = [
      { id: 'file-abc', name: 'spec.md', provider: 'grok', source: 'account' },
    ];
    const provider = {
      id: 'grok',
      config: { id: 'grok', selectors: {} as never },
      uploadAccountFiles: vi.fn(async () => undefined),
      listAccountFiles: vi.fn(async () => files),
    };
    const service = new TestLlmService(provider as never, store, cacheContext);

    try {
      await service.uploadAccountFiles(['/tmp/spec.md'], { listOptions: {} });
      expect(provider.uploadAccountFiles).toHaveBeenCalledWith(['/tmp/spec.md'], {});
      expect(provider.listAccountFiles).toHaveBeenCalledWith({});
      const cached = await store.readAccountFiles(cacheContext);
      expect(cached.items).toEqual(files);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('deleteProjectFile refreshes project-knowledge cache after removal', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-llm-files-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const cacheContext: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const store = new JsonCacheStore();
    const provider = {
      id: 'grok',
      config: { id: 'grok', selectors: {} as never },
      deleteProjectFile: vi.fn(async () => undefined),
      listProjectFiles: vi.fn(async () => [] as FileRef[]),
    };
    const service = new TestLlmService(provider as never, store, cacheContext);

    try {
      await service.deleteProjectFile('project-123', 'notes.txt', { listOptions: {} });
      expect(provider.deleteProjectFile).toHaveBeenCalledWith('project-123', 'notes.txt', {});
      expect(provider.listProjectFiles).toHaveBeenCalledWith('project-123', {});
      const cached = await store.readProjectKnowledge(cacheContext, 'project-123');
      expect(cached.items).toEqual([]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('deleteAccountFile refreshes account-files cache after removal', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-llm-files-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const cacheContext: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    const store = new JsonCacheStore();
    const provider = {
      id: 'grok',
      config: { id: 'grok', selectors: {} as never },
      deleteAccountFile: vi.fn(async () => undefined),
      listAccountFiles: vi.fn(async () => [] as FileRef[]),
    };
    const service = new TestLlmService(provider as never, store, cacheContext);

    try {
      await service.deleteAccountFile('file-123', { listOptions: {} });
      expect(provider.deleteAccountFile).toHaveBeenCalledWith('file-123', {});
      expect(provider.listAccountFiles).toHaveBeenCalledWith({});
      const cached = await store.readAccountFiles(cacheContext);
      expect(cached.items).toEqual([]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
