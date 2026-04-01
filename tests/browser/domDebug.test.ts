import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  logBrowserPostmortemSnapshot,
  logDomFailure,
  logConversationSnapshot,
  persistBrowserPostmortemRecord,
  logStructuredDebugEvent,
} from '../../src/browser/domDebug.js';
import type { ChromeClient } from '../../src/browser/types.js';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';

const makeRuntime = (value: unknown) =>
  ({
    evaluate: vi.fn().mockResolvedValue({ result: { value } }),
  }) as unknown as ChromeClient['Runtime'];

describe('domDebug utilities', () => {
  test('logDomFailure captures snapshot when verbose', async () => {
    const runtime = makeRuntime([{ role: 'assistant', text: 'Hello', testid: 'assistant-1' }]);
    const logger = Object.assign(vi.fn(), { verbose: true, sessionLog: vi.fn() });
    await logDomFailure(runtime, logger, 'test-context');
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('Browser automation failure'));
    expect(logger.sessionLog).toHaveBeenCalled();
  });

  test('logConversationSnapshot emits recent entries', async () => {
    const value = [
      { role: 'user', text: 'Hi', testid: 'u1' },
      { role: 'assistant', text: 'Hello', testid: 'a1' },
    ];
    const runtime = makeRuntime(value);
    const logger = vi.fn();
    await logConversationSnapshot(runtime, logger);
    expect(runtime.evaluate).toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('Conversation snapshot'));
  });

  test('logDomFailure skips when verbose disabled', async () => {
    const runtime = makeRuntime([]);
    const logger = Object.assign(vi.fn(), { verbose: false });
    await logDomFailure(runtime, logger, 'quiet');
    expect(runtime.evaluate).not.toHaveBeenCalled();
    expect(logger).not.toHaveBeenCalled();
  });

  test('logStructuredDebugEvent mirrors to session log when verbose', () => {
    const logger = Object.assign(vi.fn(), { verbose: true, sessionLog: vi.fn() });
    logStructuredDebugEvent(logger, 'chatgpt-stale-send-blocked', {
      surface: { kind: 'retry-affordance', summary: 'retry' },
      policy: 'fail-fast-no-auto-retry-click',
    });
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('Browser debug (chatgpt-stale-send-blocked):'),
    );
    expect(logger.sessionLog).toHaveBeenCalledWith(
      expect.stringContaining('"policy":"fail-fast-no-auto-retry-click"'),
    );
  });

  test('logBrowserPostmortemSnapshot emits a machine-readable DOM/browser snapshot', async () => {
    const runtime = makeRuntime({
      href: 'https://chatgpt.com/c/example',
      title: 'ChatGPT',
      readyState: 'complete',
      activeElement: { tag: 'INPUT', text: '', attrs: { name: 'prompt-textarea' } },
      overlays: [{ role: 'dialog', text: 'Server connection failed', buttons: ['Retry'] }],
      retryButtons: ['Retry'],
      recentTurns: [{ role: 'assistant', text: 'failure', testid: 'assistant-1' }],
    });
    const logger = Object.assign(vi.fn(), { verbose: true, sessionLog: vi.fn() });
    await logBrowserPostmortemSnapshot(runtime, logger, 'chatgpt-stale-send-blocked');
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('Browser postmortem (chatgpt-stale-send-blocked):'),
    );
    expect(logger.sessionLog).toHaveBeenCalledWith(
      expect.stringContaining('"retryButtons":["Retry"]'),
    );
  });

  test('persistBrowserPostmortemRecord writes a bounded json bundle under auracall home', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-postmortem-'));
    setAuracallHomeDirOverrideForTest(tempRoot);
    try {
      const saved = await persistBrowserPostmortemRecord({
        context: 'chatgpt-read-context-error',
        payload: {
          provider: 'chatgpt',
          snapshot: { href: 'https://chatgpt.com/c/example' },
        },
      });
      const stored = JSON.parse(await fs.readFile(saved, 'utf8')) as Record<string, unknown>;
      expect(saved).toContain(path.join('postmortems', 'browser'));
      expect(stored.provider).toBe('chatgpt');
      expect(stored.snapshot).toEqual({ href: 'https://chatgpt.com/c/example' });
    } finally {
      setAuracallHomeDirOverrideForTest(null);
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
