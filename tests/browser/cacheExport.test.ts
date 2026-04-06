import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import type { ProviderCacheContext } from '../../src/browser/providers/cache.js';
import { JsonCacheStore } from '../../src/browser/llmService/cache/store.js';
import { runCacheExport } from '../../src/browser/llmService/cache/export.js';

function makeContext(identityKey = 'cache-test@example.com'): ProviderCacheContext {
  return {
    provider: 'chatgpt',
    userConfig: { browser: { cache: { store: 'json' } } } as ProviderCacheContext['userConfig'],
    listOptions: {},
    identityKey,
  };
}

describe('cache export conversation surfaces', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('markdown/html/csv exports distinguish conversation files from provider artifacts', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-cache-export-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const context = makeContext();
    const store = new JsonCacheStore();

    try {
      await store.writeConversationContext(context, 'conversation-123', {
        provider: 'chatgpt',
        conversationId: 'conversation-123',
        messages: [{ role: 'assistant', text: 'done' }],
        sources: [
          {
            url: 'https://example.com/spec',
            title: 'Spec',
            domain: 'example.com',
          },
        ],
        files: [
          {
            id: 'upload-1',
            name: 'user-notes.md',
            provider: 'chatgpt',
            source: 'conversation',
            mimeType: 'text/markdown',
            localPath: '/tmp/user-notes.md',
          },
        ],
        artifacts: [
          {
            id: 'artifact-1',
            title: 'Model Export',
            kind: 'generated',
            uri: 'sandbox:/mnt/data/export.txt',
            metadata: { generatedBy: 'model' },
          },
        ],
      });
      await store.writeConversations(context, [
        {
          id: 'conversation-123',
          title: 'Inventory-backed export row',
          provider: 'chatgpt',
          url: 'https://chatgpt.com/c/conversation-123',
          updatedAt: '2026-04-06T12:00:00.000Z',
        },
      ]);

      const markdownDir = path.join(homeDir, 'md-out');
      const htmlDir = path.join(homeDir, 'html-out');
      const csvDir = path.join(homeDir, 'csv-out');
      const conversationsCsvDir = path.join(homeDir, 'csv-conversations-out');

      await runCacheExport(context, {
        format: 'md',
        scope: 'conversation',
        conversationId: 'conversation-123',
        outputDir: markdownDir,
      });
      await runCacheExport(context, {
        format: 'html',
        scope: 'conversation',
        conversationId: 'conversation-123',
        outputDir: htmlDir,
      });
      await runCacheExport(context, {
        format: 'csv',
        scope: 'conversation',
        conversationId: 'conversation-123',
        outputDir: csvDir,
      });
      await runCacheExport(context, {
        format: 'csv',
        scope: 'conversations',
        outputDir: conversationsCsvDir,
      });

      const markdown = await readFile(path.join(markdownDir, 'conversation-123.md'), 'utf8');
      const html = await readFile(path.join(htmlDir, 'conversation-123.html'), 'utf8');
      const csv = await readFile(path.join(csvDir, 'contexts.csv'), 'utf8');
      const conversationsCsv = await readFile(path.join(conversationsCsvDir, 'conversations.csv'), 'utf8');

      expect(markdown).toContain('## FILES');
      expect(markdown).toContain('user-notes.md [conversation] (text/markdown) -> /tmp/user-notes.md');
      expect(markdown).toContain('## ARTIFACTS');
      expect(markdown).toContain('Model Export (generated) -> sandbox:/mnt/data/export.txt');

      expect(html).toContain('<h2>Files</h2>');
      expect(html).toContain('User/provider-supplied files referenced in the conversation context.');
      expect(html).toContain('user-notes.md [conversation] (text/markdown) -&gt; /tmp/user-notes.md');
      expect(html).toContain('<h2>Artifacts</h2>');
      expect(html).toContain('Provider/model output artifacts discovered from the conversation.');
      expect(html).toContain('Model Export (generated)');

      expect(csv).toContain('conversationId,provider,messageCount,sourceCount,fileCount,artifactCount');
      expect(csv).toContain('conversation-123,chatgpt,1,1,1,1');
      expect(conversationsCsv).toContain(
        'id,title,provider,projectId,url,updatedAt,messageCount,sourceCount,fileCount,artifactCount',
      );
      expect(conversationsCsv).toContain(
        'conversation-123,Inventory-backed export row,chatgpt,,https://chatgpt.com/c/conversation-123,2026-04-06T12:00:00.000Z,1,1,1,1',
      );
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
