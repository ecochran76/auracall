import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { discoverDefaultBrowserProfile } from '../../packages/browser-service/src/service/profileDiscovery.js';

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

describe('profileDiscovery (package)', () => {
  test('prefers the matching Windows browser family on WSL when a browser-path hint is provided', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-profile-discovery-'));
    const localAppData = path.join(tempDir, 'Users', 'ecoch', 'AppData', 'Local');
    const chromeDefault = path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Network');
    const braveDefault = path.join(
      localAppData,
      'BraveSoftware',
      'Brave-Browser',
      'User Data',
      'Default',
      'Network',
    );

    await mkdir(chromeDefault, { recursive: true });
    await mkdir(braveDefault, { recursive: true });
    await writeFile(path.join(chromeDefault, 'Cookies'), '', 'utf8');
    await writeFile(path.join(braveDefault, 'Cookies'), '', 'utf8');
    process.env.AURACALL_WINDOWS_LOCALAPPDATA = localAppData;

    try {
      const discovered = discoverDefaultBrowserProfile({
        preference: 'windows',
        chromePathHint: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      });

      expect(discovered).toMatchObject({
        userDataDir: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'),
        profileName: 'Default',
        cookiePath: path.join(braveDefault, 'Cookies'),
        source: 'windows',
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
