import { describe, expect, test } from 'vitest';
import { runBrowserMode, CHATGPT_URL } from '../../src/browserMode.js';
import { shouldPreserveBrowserOnErrorForTest } from '../../src/browser/index.js';
import { BrowserAutomationError } from '../../src/oracle/errors.js';

describe('browserMode exports', () => {
  test('re-exports runBrowserMode and constants', () => {
    expect(typeof runBrowserMode).toBe('function');
    expect(typeof CHATGPT_URL).toBe('string');
  });

  test('preserves browser only for non-headless cloudflare challenges', () => {
    const cloudflare = new BrowserAutomationError('blocked', { stage: 'cloudflare-challenge' });
    const other = new BrowserAutomationError('failed', { stage: 'execute-browser' });

    expect(shouldPreserveBrowserOnErrorForTest(cloudflare, false)).toBe(true);
    expect(shouldPreserveBrowserOnErrorForTest(cloudflare, true)).toBe(false);
    expect(shouldPreserveBrowserOnErrorForTest(other, false)).toBe(false);
    expect(shouldPreserveBrowserOnErrorForTest(new Error('nope'), false)).toBe(false);
  });
});
