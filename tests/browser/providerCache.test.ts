import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { writeConversationContextCache } from '../../src/browser/providers/cache.js';
import type { ProviderCacheContext } from '../../src/browser/providers/cache.js';

describe('provider cache nested writes', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('creates nested directories for conversation context cache files', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-cache-home-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const context: ProviderCacheContext = {
      provider: 'grok',
      userConfig: {} as ProviderCacheContext['userConfig'],
      listOptions: {},
      identityKey: 'cache-test@example.com',
    };
    try {
      await writeConversationContextCache(context, 'conversation-123', {
        provider: 'grok',
        conversationId: 'conversation-123',
        messages: [{ role: 'user', text: 'hello' }],
      });
      const written = await readFile(
        path.join(
          homeDir,
          'cache',
          'providers',
          'grok',
          'cache-test@example.com',
          'contexts',
          'conversation-123.json',
        ),
        'utf8',
      );
      expect(JSON.parse(written)).toMatchObject({
        items: {
          provider: 'grok',
          conversationId: 'conversation-123',
        },
      });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
