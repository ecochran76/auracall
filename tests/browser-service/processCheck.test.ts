import os from 'node:os';
import path from 'node:path';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';

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

function createWindowsProcessPayload(processId: number, commandLine: string) {
  return {
    // biome-ignore lint/style/useNamingConvention: mirrors Win32_Process JSON field names.
    ProcessId: processId,
    // biome-ignore lint/style/useNamingConvention: mirrors Win32_Process JSON field names.
    CommandLine: commandLine,
  };
}

describe('processCheck (package)', () => {
  test('matches the requested Windows user-data-dir exactly on WSL and extracts the debug port', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-processcheck-'));
    const fakePowerShell = path.join(tempDir, 'powershell.exe');
    const payload = JSON.stringify([
      createWindowsProcessPayload(
        111,
        '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ' +
          '--remote-debugging-port=45000 ' +
          '--user-data-dir=C:\\Users\\ecoch\\AppData\\Local\\AuraCall\\browser-profiles\\other\\grok about:blank',
      ),
      createWindowsProcessPayload(
        222,
        '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ' +
          '--remote-debugging-port=45879 ' +
          '--user-data-dir=C:\\Users\\ecoch\\AppData\\Local\\AuraCall\\browser-profiles\\default\\grok about:blank',
      ),
    ]);

    await writeFile(fakePowerShell, `#!/bin/sh\nprintf '%s' '${payload}'\n`, 'utf8');
    await chmod(fakePowerShell, 0o755);
    process.env.AURACALL_WINDOWS_POWERSHELL_PATH = fakePowerShell;

    try {
      const processCheck = await import('../../packages/browser-service/src/processCheck.js');
      await expect(
        processCheck.findChromeProcessUsingUserDataDir(
          '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok',
        ),
      ).resolves.toEqual({
        pid: 222,
        port: 45879,
        commandLine:
          '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ' +
          '--remote-debugging-port=45879 ' +
          '--user-data-dir=C:\\Users\\ecoch\\AppData\\Local\\AuraCall\\browser-profiles\\default\\grok about:blank',
      });
      await expect(
        processCheck.findChromePidUsingUserDataDir(
          '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok',
        ),
      ).resolves.toBe(222);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 15_000);

  test('discovers a responsive Windows DevTools port for a user-data-dir when the advertised port is dead', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-processcheck-'));
    const fakePowerShell = path.join(tempDir, 'powershell.exe');
    const payload = JSON.stringify([
      createWindowsProcessPayload(
        222,
        '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ' +
          '--remote-debugging-port=45894 ' +
          '--user-data-dir=C:\\Users\\ecoch\\AppData\\Local\\AuraCall\\browser-profiles\\default\\grok about:blank',
      ),
    ]);

    await writeFile(
      fakePowerShell,
      `#!/bin/sh
case "$*" in
  *"Get-CimInstance Win32_Process"*)
    printf '%s' '${payload}'
    ;;
  *"http://127.0.0.1:45894/json/version"*)
    exit 1
    ;;
  *"Get-NetTCPConnection"*)
    printf '%s' '45921'
    ;;
  *)
    exit 1
    ;;
esac
`,
      'utf8',
    );
    await chmod(fakePowerShell, 0o755);
    process.env.AURACALL_WINDOWS_POWERSHELL_PATH = fakePowerShell;

    try {
      const processCheck = await import('../../packages/browser-service/src/processCheck.js');
      await expect(
        processCheck.findResponsiveWindowsDevToolsPortForUserDataDir(
          '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok',
        ),
      ).resolves.toBe(45921);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 15_000);

  test('treats a responsive Windows-local DevTools endpoint as alive even when the original PID path is unreliable', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-processcheck-'));
    const fakePowerShell = path.join(tempDir, 'powershell.exe');

    await writeFile(
      fakePowerShell,
      `#!/bin/sh
case "$*" in
  *"http://127.0.0.1:49926/json/version"*)
    exit 0
    ;;
  *"tasklist.exe"*)
    printf '%s' 'INFO: No tasks are running which match the specified criteria.'
    exit 0
    ;;
  *)
    exit 1
    ;;
esac
`,
      'utf8',
    );
    await chmod(fakePowerShell, 0o755);
    process.env.AURACALL_WINDOWS_POWERSHELL_PATH = fakePowerShell;

    try {
      const processCheck = await import('../../packages/browser-service/src/processCheck.js');
      await expect(
        processCheck.isChromeAlive(
          239008,
          '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
          49926,
          undefined,
          'windows-loopback',
        ),
      ).resolves.toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 15_000);
});
