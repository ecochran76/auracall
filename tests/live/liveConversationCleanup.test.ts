import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import {
  enqueueLiveConversationCleanup,
  readDisposableLiveTeamConversations,
  type LiveConversationCleanupEntry,
} from './liveConversationCleanup.js';

describe('live conversation cleanup', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  it('reads exact disposable provider conversations from stored team steps', async () => {
    const refs = await readDisposableLiveTeamConversations(
      'grok',
      'teamrun_1',
      {
        readRun: async () => ({
          revision: 1,
          bundle: {
            steps: [
              {
                id: 'teamrun_1:step:1',
                output: {
                  structuredData: {
                    browserRun: {
                      service: 'grok',
                      conversationId: 'grok-convo-1',
                      tabUrl: 'https://grok.com/c/grok-convo-1',
                    },
                  },
                },
              },
              {
                id: 'teamrun_1:step:2',
                output: {
                  structuredData: {
                    browserRun: {
                      service: 'gemini',
                      conversationId: 'gemini-convo-1',
                      tabUrl: 'https://gemini.google.com/app/gemini-convo-1',
                    },
                  },
                },
              },
            ],
          },
        }) as never,
      },
      new Date('2026-04-12T12:00:00.000Z'),
    );

    expect(refs).toEqual([
      {
        provider: 'grok',
        conversationId: 'grok-convo-1',
        runId: 'teamrun_1',
        stepId: 'teamrun_1:step:1',
        tabUrl: 'https://grok.com/c/grok-convo-1',
        capturedAt: '2026-04-12T12:00:00.000Z',
      },
    ]);
  });

  it('reads exact disposable ChatGPT conversations from stored team steps', async () => {
    const refs = await readDisposableLiveTeamConversations(
      'chatgpt',
      'teamrun_chatgpt_1',
      {
        readRun: async () => ({
          revision: 1,
          bundle: {
            steps: [
              {
                id: 'teamrun_chatgpt_1:step:1',
                output: {
                  structuredData: {
                    browserRun: {
                      service: 'chatgpt',
                      conversationId: 'chatgpt-convo-1',
                      tabUrl: 'https://chatgpt.com/c/chatgpt-convo-1',
                    },
                  },
                },
              },
            ],
          },
        }) as never,
      },
      new Date('2026-04-12T12:05:00.000Z'),
    );

    expect(refs).toEqual([
      {
        provider: 'chatgpt',
        conversationId: 'chatgpt-convo-1',
        runId: 'teamrun_chatgpt_1',
        stepId: 'teamrun_chatgpt_1:step:1',
        tabUrl: 'https://chatgpt.com/c/chatgpt-convo-1',
        capturedAt: '2026-04-12T12:05:00.000Z',
      },
    ]);
  });

  it('caps exact-id pruning work per enqueue while still moving the ledger back down', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-live-cleanup-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const deleteCalls: LiveConversationCleanupEntry[] = [];

    await fs.mkdir(path.join(homeDir, 'live-test-cleanup'), { recursive: true });
    await fs.writeFile(
      path.join(homeDir, 'live-test-cleanup', 'grok-team-conversations.json'),
      JSON.stringify({
        provider: 'grok',
        threshold: 6,
        retainNewest: 3,
        items: [
          { provider: 'grok', conversationId: 'c1', runId: 'r1', stepId: 's1', tabUrl: null, capturedAt: '2026-04-12T00:00:01.000Z' },
          { provider: 'grok', conversationId: 'c2', runId: 'r2', stepId: 's2', tabUrl: null, capturedAt: '2026-04-12T00:00:02.000Z' },
          { provider: 'grok', conversationId: 'c3', runId: 'r3', stepId: 's3', tabUrl: null, capturedAt: '2026-04-12T00:00:03.000Z' },
          { provider: 'grok', conversationId: 'c4', runId: 'r4', stepId: 's4', tabUrl: null, capturedAt: '2026-04-12T00:00:04.000Z' },
          { provider: 'grok', conversationId: 'c5', runId: 'r5', stepId: 's5', tabUrl: null, capturedAt: '2026-04-12T00:00:05.000Z' },
        ],
      }, null, 2),
      'utf8',
    );

    const result = await enqueueLiveConversationCleanup({
      provider: 'grok',
      runId: 'teamrun_2',
      threshold: 6,
      retainNewest: 3,
      now: new Date('2026-04-12T12:00:00.000Z'),
      control: {
        readRun: async () => ({
          revision: 1,
          bundle: {
            steps: [
              {
                id: 'teamrun_2:step:1',
                output: {
                  structuredData: {
                    browserRun: {
                      service: 'grok',
                      conversationId: 'c6',
                      tabUrl: 'https://grok.com/c/c6',
                    },
                  },
                },
              },
              {
                id: 'teamrun_2:step:2',
                output: {
                  structuredData: {
                    browserRun: {
                      service: 'grok',
                      conversationId: 'c7',
                      tabUrl: 'https://grok.com/c/c7',
                    },
                  },
                },
              },
            ],
          },
        }) as never,
      },
      deleteConversation: async (entry) => {
        deleteCalls.push(entry);
      },
    });

    expect(result.enqueuedConversationIds).toEqual(['c6', 'c7']);
    expect(result.deletedConversationIds).toEqual(['c1', 'c2']);
    expect(result.retainedConversationIds).toEqual(['c3', 'c4', 'c5', 'c6', 'c7']);

    const stored = JSON.parse(
      await fs.readFile(path.join(homeDir, 'live-test-cleanup', 'grok-team-conversations.json'), 'utf8'),
    ) as { items: Array<{ conversationId: string }> };
    expect(stored.items.map((item) => item.conversationId)).toEqual(['c3', 'c4', 'c5', 'c6', 'c7']);
    expect(deleteCalls.map((item) => item.conversationId)).toEqual(['c1', 'c2']);
  });
});
