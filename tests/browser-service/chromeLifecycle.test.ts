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

  test('buildChromeFlags anchors visible minimal login windows on screen', () => {
    const visibleFlags = buildChromeFlags(false, null, 'Profile 1', { minimal: true });
    expect(visibleFlags).toContain('--window-position=0,0');
    expect(visibleFlags).toContain('--window-size=1400,1000');

    const minimizedFlags = buildChromeFlags(false, null, 'Profile 1', {
      minimal: true,
      startMinimized: true,
    });
    expect(minimizedFlags).toContain('--start-minimized');
    expect(minimizedFlags).not.toContain('--window-position=0,0');
  });

  test.runIf(process.platform !== 'win32')(
    'buildChromeFlags uses the basic password store for minimal managed launches',
    () => {
      const flags = buildChromeFlags(false, null, 'Profile 1', { minimal: true });

      expect(flags).toContain('--password-store=basic');
      expect(flags.filter((flag) => flag === '--password-store=basic')).toHaveLength(1);
    },
  );

  test.runIf(process.platform !== 'win32')(
    'buildChromeFlags keeps basic password store enabled inside WSL',
    () => {
      process.env.WSL_DISTRO_NAME = 'Ubuntu';

      const flags = buildChromeFlags(false, null, 'Profile 1', { minimal: true });

      expect(flags).toContain('--password-store=basic');
    },
  );
});
