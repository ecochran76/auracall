import { describe, expect, test, vi } from 'vitest';
import { runBrowserMode, CHATGPT_URL } from '../../src/browserMode.js';
import { resolveBrowserConfig } from '../../src/browser/config.js';
import {
  buildThinkingStatusExpressionForTest,
  buildChatgptProjectDispatchProbeExpressionForTest,
  formatChatgptBlockingSurfaceErrorForTest,
  logChatgptUnexpectedStateForTest,
  resolveBrowserRuntimeEntryContextForTest,
  resolveChatgptProviderSessionProcessIdForTest,
  acquireBrowserExecutionOperationForTest,
  releaseBrowserExecutionOperationAfterPreflightFailureForTest,
  sanitizeThinkingTextForTest,
  shouldPreserveBrowserForObservationExpiryForTest,
  shouldPreserveBrowserOnErrorForTest,
  shouldKeepManagedChatgptBrowserOpenForTest,
  shouldTreatChatgptAssistantResponseAsStaleForTest,
  extractParseableJsonObjectTextForTest,
} from '../../src/browser/index.js';
import { resolveBrowserLaunchPlan } from '../../src/browser/service/browserLaunchPlan.js';
import { BrowserAutomationError } from '../../src/oracle/errors.js';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import type { BrowserAutomationConfig, BrowserLogger, ChromeClient } from '../../src/browser/types.js';
import {
  clearBrowserOperationQueueObservationsForTest,
  summarizeBrowserOperationQueueObservations,
} from '../../src/browser/operationQueueObservations.js';
import { createFileBackedBrowserOperationDispatcher } from '../../packages/browser-service/src/service/operationDispatcher.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };

function runtimeFixture(runtime: Pick<ChromeClient['Runtime'], 'evaluate'>): ChromeClient['Runtime'] {
  return runtime as ChromeClient['Runtime'];
}

function parseJsonObject(raw: string): JsonObject {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected JSON object');
  }
  return parsed as JsonObject;
}

function resolvedBrowserConfig(config: BrowserAutomationConfig) {
  return resolveBrowserConfig(config);
}

describe('browserMode exports', () => {
  test('re-exports runBrowserMode and constants', () => {
    expect(typeof runBrowserMode).toBe('function');
    expect(typeof CHATGPT_URL).toBe('string');
  });

  test('recovers live managed-profile pid for reused-browser provider provenance', async () => {
    const readChromePid = vi.fn().mockResolvedValue(58728);
    const isChromeAlive = vi.fn().mockResolvedValue(true);

    await expect(
      resolveChatgptProviderSessionProcessIdForTest({
        launchedPid: undefined,
        userDataDir: '/managed/chatgpt',
        readChromePid,
        isChromeAlive,
      }),
    ).resolves.toBe(58728);
    expect(readChromePid).toHaveBeenCalledWith('/managed/chatgpt');
    expect(isChromeAlive).toHaveBeenCalledWith(58728, '/managed/chatgpt');
  });

  test('rejects stale managed-profile pid for provider provenance', async () => {
    await expect(
      resolveChatgptProviderSessionProcessIdForTest({
        launchedPid: undefined,
        userDataDir: '/managed/chatgpt',
        readChromePid: vi.fn().mockResolvedValue(58728),
        isChromeAlive: vi.fn().mockResolvedValue(false),
      }),
    ).resolves.toBeNull();
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

  test('preserves the exact browser after an observation lease expires during active generation', () => {
    const activeGenerationExpiry = Object.assign(
      new Error('AuraCall session timed out after 3600 seconds.'),
      {
        name: 'SessionRunTimeoutError',
        browserResponseProgress: {
          state: 'assistant-text',
          assistantTextChars: 33_688,
          stopVisible: true,
          completionVisible: false,
          dialogVisible: false,
        },
      },
    );
    const completedAtExpiry = Object.assign(
      new Error('AuraCall session timed out after 3600 seconds.'),
      {
        name: 'SessionRunTimeoutError',
        browserResponseProgress: {
          state: 'assistant-text',
          assistantTextChars: 33_688,
          stopVisible: false,
          completionVisible: true,
          dialogVisible: false,
        },
      },
    );
    const preAnswerGenerationExpiry = Object.assign(
      new Error('AuraCall session timed out after 45 seconds.'),
      {
        name: 'SessionRunTimeoutError',
        browserResponseProgress: {
          state: 'no-assistant-turn',
          assistantTextChars: 0,
          stopVisible: true,
          completionVisible: false,
          dialogVisible: false,
        },
      },
    );

    expect(shouldPreserveBrowserForObservationExpiryForTest(activeGenerationExpiry)).toBe(true);
    expect(shouldPreserveBrowserForObservationExpiryForTest(preAnswerGenerationExpiry)).toBe(true);
    expect(shouldPreserveBrowserForObservationExpiryForTest(completedAtExpiry)).toBe(false);
    expect(shouldPreserveBrowserOnErrorForTest(activeGenerationExpiry, false)).toBe(false);
  });

  test('does not treat browser-operation lock release as a keep-browser request', () => {
    expect(
      shouldKeepManagedChatgptBrowserOpenForTest({
        keepBrowser: false,
        preserveBrowserOnError: false,
        browserOperationReleased: true,
      }),
    ).toBe(false);
    expect(
      shouldKeepManagedChatgptBrowserOpenForTest({
        keepBrowser: true,
        preserveBrowserOnError: false,
        browserOperationReleased: false,
      }),
    ).toBe(true);
    expect(
      shouldKeepManagedChatgptBrowserOpenForTest({
        keepBrowser: false,
        preserveBrowserOnError: true,
        browserOperationReleased: false,
      }),
    ).toBe(true);
  });

  test('holds the ChatGPT managed-profile operation through terminal cleanup', async () => {
    const source = await fs.readFile(path.resolve('src/browser/index.ts'), 'utf8');

    expect(source).not.toContain('releaseBrowserOperationLock("ChatGPT prompt dispatch")');
    expect(source).not.toContain('releaseBrowserOperationLock("ChatGPT prompt submission")');
    expect(source).toContain('releaseBrowserOperationLock("ChatGPT cleanup")');
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

  test('extracts parseable JSON objects from ChatGPT DOM text', () => {
    expect(parseJsonObject(extractParseableJsonObjectTextForTest('```json\n{"ok":true}\n```') ?? '{}')).toEqual({
      ok: true,
    });
    expect(
      parseJsonObject(
        extractParseableJsonObjectTextForTest('ChatGPT said:\n{"title":"A {literal}","items":[{"n":1}]}\nDone') ?? '{}',
      ),
    ).toEqual({
      title: 'A {literal}',
      items: [{ n: 1 }],
    });
    expect(extractParseableJsonObjectTextForTest('{"title":"unfinished"')).toBeNull();
  });

  test('builds ChatGPT project dispatch probes that accept UUID project routes', () => {
    const expression = buildChatgptProjectDispatchProbeExpressionForTest(
      '133ad4c5-b857-4a30-bf17-d951db57c33f',
      false,
    );

    expect(expression).toContain('133ad4c5-b857-4a30-bf17-d951db57c33f');
    expect(expression).toContain('[0-9a-f]{8}-[0-9a-f]{4}');
    expect(expression).toContain('/project');
    expect(expression).toContain('/c\\/');
  });

  test('resolves managed browser launch context from the typed launch profile', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-browser-mode-launch-'));
    const sourceCookiePath = path.join(tempRoot, 'source', 'Default', 'Network', 'Cookies');
    const bootstrapCookiePath = path.join(tempRoot, 'bootstrap', 'Default', 'Network', 'Cookies');
    await fs.mkdir(path.dirname(sourceCookiePath), { recursive: true });
    await fs.mkdir(path.dirname(bootstrapCookiePath), { recursive: true });
    await fs.writeFile(sourceCookiePath, '');
    await fs.writeFile(bootstrapCookiePath, '');
    const context = resolveBrowserLaunchPlan({
      source: {
        kind: 'session-config',
        config: resolvedBrowserConfig({
          target: 'grok',
          chromeProfile: 'Default',
          chromeCookiePath: sourceCookiePath,
          bootstrapCookiePath,
          managedProfileRoot: path.join(tempRoot, 'managed-root'),
        }),
      },
      intent: { provider: 'grok' },
    });

    expect(context.managedBrowserProfile.directory).toBe(path.join(tempRoot, 'managed-root', 'default', 'grok'));
    expect(context.managedBrowserProfile.defaultDirectory).toBe(path.join(tempRoot, 'managed-root', 'default', 'grok'));
    expect(context.managedBrowserProfile.configuredProfileName).toBe('Default');
    expect(context.sourceBrowserProfile.bootstrapCookiePath).toBe(bootstrapCookiePath);
  });

  test('resolves managed browser launch context within the selected AuraCall runtime profile', () => {
    const context = resolveBrowserLaunchPlan({
      source: {
        kind: 'session-config',
        config: resolvedBrowserConfig({
          target: 'chatgpt',
          chromeProfile: 'Profile 1',
          managedProfileRoot: '/home/test/.auracall/browser-profiles',
          manualLoginProfileDir: '/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt',
          auracallProfileName: 'wsl-chrome-2',
        }),
      },
      intent: { provider: 'chatgpt' },
    });

    expect(context.managedBrowserProfile.directory).toBe('/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt');
    expect(context.managedBrowserProfile.defaultDirectory).toBe('/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt');
    expect(context.managedBrowserProfile.configuredProfileName).toBe('Profile 1');
  });

  test('resolves browser runtime entry config and injects a fixed debug port when needed', async () => {
    const logger: BrowserLogger = Object.assign(() => {}, { verbose: undefined as boolean | undefined });
    const pickDebugPort: NonNullable<Parameters<typeof resolveBrowserRuntimeEntryContextForTest>[0]['pickDebugPort']> = async () => 45555;
    const result = await resolveBrowserRuntimeEntryContextForTest({
      config: {
        target: 'grok',
        debug: true,
        debugPortStrategy: 'fixed',
      } satisfies BrowserAutomationConfig,
      log: logger,
      pickDebugPort,
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
        queueTimeoutMs: 2_000,
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
        ownerCommand: 'browser-execution',
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

  test('browser execution operation records caller owner command for real work attribution', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-browser-operation-owner-'));
    setAuracallHomeDirOverrideForTest(tempRoot);
    const managedProfileDir = path.join(tempRoot, 'browser-profiles', 'default', 'chatgpt');

    try {
      const acquired = await acquireBrowserExecutionOperationForTest({
        managedProfileDir,
        target: 'chatgpt',
        logger: () => undefined,
        ownerCommand: 'response-run:resp_123:agent_abc',
      });

      expect(acquired?.operation).toMatchObject({
        kind: 'browser-execution',
        operationClass: 'exclusive-mutating',
        serviceTarget: 'chatgpt',
        ownerCommand: 'response-run:resp_123:agent_abc',
      });
      await acquired?.release();
    } finally {
      setAuracallHomeDirOverrideForTest(null);
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('account mirror cannot acquire the profile during foreground post-submit ownership', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-post-submit-operation-'));
    const managedProfileDir = path.join(tempRoot, 'browser-profiles', 'wsl-chrome-3', 'chatgpt');
    const dispatcher = createFileBackedBrowserOperationDispatcher({
      lockRoot: path.join(tempRoot, 'browser-operations'),
      isOwnerAlive: () => true,
    });
    const foreground = await dispatcher.acquire({
      managedProfileDir,
      serviceTarget: 'chatgpt',
      kind: 'browser-execution',
      operationClass: 'exclusive-mutating',
      ownerPid: process.pid,
      ownerCommand: 'browser-execution',
    });
    let foregroundReleased = false;

    try {
      expect(foreground.acquired).toBe(true);
      const blockedMirror = await dispatcher.acquire({
        managedProfileDir,
        serviceTarget: 'chatgpt',
        kind: 'browser-execution',
        operationClass: 'exclusive-probe',
        ownerPid: process.pid + 1,
        ownerCommand: 'account-mirror-refresh:chatgpt:wsl-chrome-3',
      });
      expect(blockedMirror.acquired).toBe(false);

      if (foreground.acquired) {
        await foreground.release();
        foregroundReleased = true;
      }
      const admittedMirror = await dispatcher.acquire({
        managedProfileDir,
        serviceTarget: 'chatgpt',
        kind: 'browser-execution',
        operationClass: 'exclusive-probe',
        ownerPid: process.pid + 1,
        ownerCommand: 'account-mirror-refresh:chatgpt:wsl-chrome-3',
      });
      expect(admittedMirror.acquired).toBe(true);
      if (admittedMirror.acquired) {
        await admittedMirror.release();
      }
    } finally {
      if (foreground.acquired && !foregroundReleased) {
        await foreground.release();
      }
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('browser execution operation can be released after launch preflight failure', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-browser-operation-preflight-'));
    setAuracallHomeDirOverrideForTest(tempRoot);
    const managedProfileDir = path.join(tempRoot, 'browser-profiles', 'default', 'chatgpt');
    const loggerMessages: string[] = [];

    try {
      const acquired = await acquireBrowserExecutionOperationForTest({
        managedProfileDir,
        target: 'chatgpt',
        logger: (message) => loggerMessages.push(message),
        ownerCommand: 'response-run:resp_preflight:agent_test',
      });
      expect(acquired?.operation.ownerCommand).toBe('response-run:resp_preflight:agent_test');

      await releaseBrowserExecutionOperationAfterPreflightFailureForTest(
        acquired,
        (message) => loggerMessages.push(message),
        'test launch',
      );

      const replacement = await acquireBrowserExecutionOperationForTest({
        managedProfileDir,
        target: 'chatgpt',
        logger: (message) => loggerMessages.push(message),
        queueTimeoutMs: 1,
        queuePollMs: 1,
      });

      expect(replacement?.operation.kind).toBe('browser-execution');
      expect(loggerMessages.some((message) => message.includes('released operation dispatcher lock after test launch failure'))).toBe(true);
      await replacement?.release();
    } finally {
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
      const logger: BrowserLogger = Object.assign(() => {}, { verbose: true, sessionLog: () => {} });
      const runtime = runtimeFixture({
        evaluate: async () => ({
          result: {
            type: 'object',
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
      });
      await logChatgptUnexpectedStateForTest({
        // biome-ignore lint/style/useNamingConvention: CDP domain name matches the production helper contract.
        Runtime: runtime,
        logger,
        context: 'chatgpt-stale-send-blocked',
        surface: { kind: 'retry-affordance', summary: 'retry', details: { source: 'button' } },
        extra: { policy: 'fail-fast-no-auto-retry-click' },
      });
      const dir = path.join(tempRoot, 'postmortems', 'browser');
      const files = await fs.readdir(dir);
      expect(files.some((name) => name.includes('chatgpt-stale-send-blocked'))).toBe(true);
      const firstFile = files[0];
      if (!firstFile) {
        throw new Error('Expected browser postmortem file');
      }
      const filePath = path.join(dir, firstFile);
      const stored = parseJsonObject(await fs.readFile(filePath, 'utf8'));
      expect(stored.mode).toBe('send');
      expect((stored.surface as JsonObject).kind).toBe('retry-affordance');
      expect(stored.policy).toBe('fail-fast-no-auto-retry-click');
      expect((stored.snapshot as JsonObject).retryButtons).toEqual(['Retry']);
    } finally {
      setAuracallHomeDirOverrideForTest(null);
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
