import os from 'node:os';
import { describe, expect, test, afterEach } from 'vitest';
import {
  buildChromeFlags,
  resolveUserDataBaseDir,
  resolveUserDataDirFlag,
  resolveWslHost,
} from '../../packages/browser-service/src/chromeLifecycle.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe('chromeLifecycle (package)', () => {
  test('resolveWslHost prefers explicit env override', () => {
    process.env.BROWSER_SERVICE_BROWSER_REMOTE_DEBUG_HOST = '10.0.0.5';
    expect(resolveWslHost()).toBe('10.0.0.5');
  });

  test('resolveUserDataBaseDir keeps WSL Chrome on the Linux temp root', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    await expect(resolveUserDataBaseDir('/usr/bin/google-chrome')).resolves.toBe(os.tmpdir());
  });

  test('resolveUserDataDirFlag wraps Windows WSL paths in quotes for chrome.exe', () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    expect(
      resolveUserDataDirFlag(
        '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
        '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      ),
    ).toBe('"C:\\Users\\ecoch\\AppData\\Local\\AuraCall\\browser-profiles\\windows-chrome-test\\grok"');
  });

  test('buildChromeFlags adds start-minimized when hideWindow launches headful Chrome', () => {
    expect(buildChromeFlags(false, null, 'Default', { startMinimized: true })).toContain('--start-minimized');
    expect(buildChromeFlags(true, null, 'Default', { startMinimized: true })).not.toContain('--start-minimized');
  });
});
