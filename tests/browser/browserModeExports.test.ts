import { describe, expect, test, vi } from 'vitest';
import { runBrowserMode, CHATGPT_URL } from '../../src/browserMode.js';
import {
  buildThinkingStatusExpressionForTest,
  formatChatgptBlockingSurfaceErrorForTest,
  logChatgptUnexpectedStateForTest,
  resolveBrowserRuntimeEntryContextForTest,
  acquireBrowserExecutionOperationForTest,
  sanitizeThinkingTextForTest,
  shouldPreserveBrowserOnErrorForTest,
  shouldTreatChatgptAssistantResponseAsStaleForTest,
  resolveManagedBrowserLaunchContextForTest,
} from '../../src/browser/index.js';
import { BrowserAutomationError } from '../../src/oracle/errors.js';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import {
  clearBrowserOperationQueueObservationsForTest,
  summarizeBrowserOperationQueueObservations,
} from '../../src/browser/operationQueueObservations.js';
import { createFileBackedBrowserOperationDispatcher } from '../../packages/browser-service/src/service/operationDispatcher.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('browserMode exports', () => {
  test('re-exports runBrowserMode and constants', () => {
    expect(typeof runBrowserMode).toBe('function');
    expect(typeof CHATGPT_URL).toBe('string');
  });

  test('preserves browser only for non-headless manual-clear challenges', () => {
    const cloudflare = new BrowserAutomationError('blocked', { stage: 'cloudflare-challenge' });
    const manualClear = new BrowserAutomationError('blocked', { stage: 'manual-clear-blocking-page' });
    const other = new BrowserAutomationError('failed', { stage: 'execute-browser' });

    expect(shouldPreserveBrowserOnErrorForTest(cloudflare, false)).toBe(true);
    expect(shouldPreserveBrowserOnErrorForTest(cloudflare, true)).toBe(false);
    expect(shouldPreserveBrowserOnErrorForTest(manualClear, false)).toBe(true);
    expect(shouldPreserveBrowserOnErrorForTest(manualClear, true)).toBe(false);
    expect(shouldPreserveBrowserOnErrorForTest(other, false)).toBe(false);
    expect(shouldPreserveBrowserOnErrorForTest(new Error('nope'), false)).toBe(false);
  });

  test('treats the same assistant message id as a stale reused response', () => {
    expect(
      shouldTreatChatgptAssistantResponseAsStaleForTest({
        baselineText: 'CHATGPT ACCEPT BASE ttpopv',
        baselineMessageId: 'assist-1',
        answerText: 'Thought for a few seconds CHATGPT ACCEPT BASE ttpopv',
        answerMessageId: 'assist-1',
      }),
    ).toBe(true);
  });

  test('treats an answer that only appends prelude text ahead of the baseline answer as stale', () => {
    expect(
      shouldTreatChatgptAssistantResponseAsStaleForTest({
        baselineText: 'CHATGPT ACCEPT BASE ttpopv',
        answerText: 'Thought for a few seconds CHATGPT ACCEPT BASE ttpopv',
      }),
    ).toBe(true);
  });

  test('does not treat a genuinely different assistant response as stale', () => {
    expect(
      shouldTreatChatgptAssistantResponseAsStaleForTest({
        baselineText: 'CHATGPT ACCEPT BASE ttpopv',
        baselineMessageId: 'assist-1',
        answerText: 'CHATGPT ACCEPT WEB kvspwp',
        answerMessageId: 'assist-2',
      }),
    ).toBe(false);
  });

  test('resolves managed browser launch context from the typed launch profile', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-browser-mode-launch-'));
    const sourceCookiePath = path.join(tempRoot, 'source', 'Default', 'Network', 'Cookies');
    const bootstrapCookiePath = path.join(tempRoot, 'bootstrap', 'Default', 'Network', 'Cookies');
    await fs.mkdir(path.dirname(sourceCookiePath), { recursive: true });
    await fs.mkdir(path.dirname(bootstrapCookiePath), { recursive: true });
    await fs.writeFile(sourceCookiePath, '');
    await fs.writeFile(bootstrapCookiePath, '');
    const context = resolveManagedBrowserLaunchContextForTest(
      {
        target: 'grok',
        chromeProfile: 'Default',
        chromeCookiePath: sourceCookiePath,
        bootstrapCookiePath,
        managedProfileRoot: path.join(tempRoot, 'managed-root'),
      } as any,
      'grok',
    );

    expect(context.userDataDir).toBe(path.join(tempRoot, 'managed-root', 'default', 'grok'));
    expect(context.defaultManagedProfileDir).toBe(path.join(tempRoot, 'managed-root', 'default', 'grok'));
    expect(context.chromeProfile).toBe('Default');
    expect(context.bootstrapCookiePath).toBe(bootstrapCookiePath);
  });

  test('resolves managed browser launch context within the selected AuraCall runtime profile', () => {
    const context = resolveManagedBrowserLaunchContextForTest(
      {
        target: 'chatgpt',
        chromeProfile: 'Profile 1',
        managedProfileRoot: '/home/test/.auracall/browser-profiles',
        manualLoginProfileDir: '/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt',
      } as any,
      'chatgpt',
      'wsl-chrome-2',
    );

    expect(context.userDataDir).toBe('/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt');
    expect(context.defaultManagedProfileDir).toBe('/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt');
    expect(context.chromeProfile).toBe('Profile 1');
  });

  test('resolves browser runtime entry config and injects a fixed debug port when needed', async () => {
    const logger = Object.assign(() => {}, { verbose: undefined as boolean | undefined });
    const pickDebugPort = async () => 45555;
    const result = await resolveBrowserRuntimeEntryContextForTest({
      config: {
        target: 'grok',
        debug: true,
        debugPortStrategy: 'fixed',
      } as any,
      log: logger,
      pickDebugPort: pickDebugPort as any,
    });

    expect(result.target).toBe('grok');
    expect(result.config.debugPort).toBe(45555);
    expect(result.logger.verbose).toBe(true);
  });

  test('browser execution operation queues behind an active same-profile probe lock', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-browser-operation-'));
    setAuracallHomeDirOverrideForTest(tempRoot);
    clearBrowserOperationQueueObservationsForTest();
    const managedProfileDir = path.join(tempRoot, 'browser-profiles', 'default', 'grok');
    const dispatcher = createFileBackedBrowserOperationDispatcher({
      lockRoot: path.join(tempRoot, 'browser-operations'),
      isOwnerAlive: () => true,
    });
    const active = await dispatcher.acquire({
      managedProfileDir,
      serviceTarget: 'grok',
      kind: 'doctor',
      operationClass: 'exclusive-probe',
      ownerPid: process.pid,
      ownerCommand: 'test-active-probe',
    });
    const loggerMessages: string[] = [];
    const logger = (message: string) => {
      loggerMessages.push(message);
    };

    try {
      if (!active.acquired) return;
      const queued = acquireBrowserExecutionOperationForTest({
        managedProfileDir,
        target: 'grok',
        logger,
        queueTimeoutMs: 100,
        queuePollMs: 5,
      });
      await vi.waitFor(() => {
        expect(loggerMessages.some((message) => message.includes('operation queued'))).toBe(true);
      });
      await active.release();
      const acquired = await queued;
      expect(acquired?.operation).toMatchObject({
        kind: 'browser-execution',
        operationClass: 'exclusive-mutating',
        serviceTarget: 'grok',
      });
      expect(loggerMessages.some((message) => message.includes('operation dispatcher key'))).toBe(true);
      const observations = summarizeBrowserOperationQueueObservations({
        managedProfileDir,
        serviceTarget: 'grok',
      });
      expect(observations.items.map((item) => item.event)).toEqual(['queued', 'acquired']);
      expect(observations.latest).toMatchObject({
        event: 'acquired',
        operation: {
          kind: 'browser-execution',
          operationClass: 'exclusive-mutating',
        },
      });
      await acquired?.release();
    } finally {
      if (active.acquired) {
        await active.release();
      }
      clearBrowserOperationQueueObservationsForTest();
      setAuracallHomeDirOverrideForTest(null);
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('browser execution operation can be skipped when caller already owns dispatch', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-browser-operation-owned-'));
    setAuracallHomeDirOverrideForTest(tempRoot);
    const managedProfileDir = path.join(tempRoot, 'browser-profiles', 'default', 'chatgpt');
    const dispatcher = createFileBackedBrowserOperationDispatcher({
      lockRoot: path.join(tempRoot, 'browser-operations'),
      isOwnerAlive: () => true,
    });
    const active = await dispatcher.acquire({
      managedProfileDir,
      serviceTarget: 'chatgpt',
      kind: 'media-generation',
      operationClass: 'exclusive-mutating',
      ownerPid: process.pid,
      ownerCommand: 'test-owned-media-operation',
    });
    const loggerMessages: string[] = [];

    try {
      if (!active.acquired) return;
      const acquired = await acquireBrowserExecutionOperationForTest({
        managedProfileDir,
        target: 'chatgpt',
        logger: (message) => loggerMessages.push(message),
        queueTimeoutMs: 1,
        queuePollMs: 1,
      }, true);

      expect(acquired).toBeNull();
      expect(loggerMessages.some((message) => message.includes('already owned by caller'))).toBe(true);
    } finally {
      if (active.acquired) {
        await active.release();
      }
      setAuracallHomeDirOverrideForTest(null);
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('browser execution operation reports busy after queued acquisition timeout', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-browser-operation-timeout-'));
    setAuracallHomeDirOverrideForTest(tempRoot);
    clearBrowserOperationQueueObservationsForTest();
    const managedProfileDir = path.join(tempRoot, 'browser-profiles', 'default', 'gemini');
    const dispatcher = createFileBackedBrowserOperationDispatcher({
      lockRoot: path.join(tempRoot, 'browser-operations'),
      isOwnerAlive: () => true,
    });
    const active = await dispatcher.acquire({
      managedProfileDir,
      serviceTarget: 'gemini',
      kind: 'setup',
      operationClass: 'exclusive-human',
      ownerPid: process.pid,
      ownerCommand: 'manual-verification',
    });

    try {
      await expect(
        acquireBrowserExecutionOperationForTest({
          managedProfileDir,
          target: 'gemini',
          logger: () => undefined,
          queueTimeoutMs: 1,
          queuePollMs: 1,
        }),
      ).rejects.toThrow(/Browser operation busy/);
      const observations = summarizeBrowserOperationQueueObservations({
        managedProfileDir,
        serviceTarget: 'gemini',
      });
      expect(observations.latest).toMatchObject({
        event: 'busy-timeout',
        blockedBy: {
          kind: 'setup',
          operationClass: 'exclusive-human',
          ownerCommand: 'manual-verification',
        },
      });
    } finally {
      if (active.acquired) {
        await active.release();
      }
      clearBrowserOperationQueueObservationsForTest();
      setAuracallHomeDirOverrideForTest(null);
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('retry affordance send failures stay explicit about no auto-click policy', () => {
    expect(
      formatChatgptBlockingSurfaceErrorForTest({
        kind: 'retry-affordance',
        summary: 'retry',
      }),
    ).toContain('auto-click disabled');
  });

  test('normalizes the ChatGPT thinking placeholder into a stable thinking label', () => {
    expect(sanitizeThinkingTextForTest('ChatGPT said:Thinking')).toBe('Thinking');
    expect(sanitizeThinkingTextForTest('  ChatGPT said: Thinking  ')).toBe('Thinking');
  });

  test('drops verbose conversation echoes from thinking-status reads', () => {
    expect(
      sanitizeThinkingTextForTest(
        'You said: Compare merge sort and quicksort in exactly 6 bullet points. ### File: README.md',
      ),
    ).toBe('');
    expect(sanitizeThinkingTextForTest('thinking for a few seconds while reading context')).toBe('Thinking');
  });

  test('thinking-status expression checks the placeholder assistant turn before generic status nodes', () => {
    const expression = buildThinkingStatusExpressionForTest();
    expect(expression).toContain('[data-message-author-role="assistant"], [data-turn="assistant"]');
    expect(expression).toContain('chatgpt said:\\s*thinking');
    expect(expression).toContain('lastAssistantTurn');
  });

  test('send-side unexpected-state logging persists a bounded postmortem bundle in verbose mode', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-send-postmortem-'));
    setAuracallHomeDirOverrideForTest(tempRoot);
    try {
      const logger = Object.assign(() => {}, { verbose: true, sessionLog: () => {} });
      const RUNTIME = {
        evaluate: async () => ({
          result: {
            value: {
              href: 'https://chatgpt.com/c/example',
              title: 'ChatGPT',
              readyState: 'complete',
              activeElement: null,
              overlays: [],
              retryButtons: ['Retry'],
              recentTurns: [],
            },
          },
        }),
      } as any;
      await logChatgptUnexpectedStateForTest({
        Runtime: RUNTIME,
        logger,
        context: 'chatgpt-stale-send-blocked',
        surface: { kind: 'retry-affordance', summary: 'retry', details: { source: 'button' } },
        extra: { policy: 'fail-fast-no-auto-retry-click' },
      });
      const dir = path.join(tempRoot, 'postmortems', 'browser');
      const files = await fs.readdir(dir);
      expect(files.some((name) => name.includes('chatgpt-stale-send-blocked'))).toBe(true);
      const filePath = path.join(dir, files[0]!);
      const stored = JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, any>;
      expect(stored.mode).toBe('send');
      expect(stored.surface.kind).toBe('retry-affordance');
      expect(stored.policy).toBe('fail-fast-no-auto-retry-click');
      expect(stored.snapshot.retryButtons).toEqual(['Retry']);
    } finally {
      setAuracallHomeDirOverrideForTest(null);
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
