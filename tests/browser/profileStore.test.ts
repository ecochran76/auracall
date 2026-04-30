import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  bootstrapManagedProfile,
  findBrowserCookieFile,
  inferSourceProfileFromCookiePath,
  resolveManagedProfileDir,
  resolveManagedProfileDirForUserConfig,
  resolveManagedProfileName,
} from '../../src/browser/profileStore.js';

describe('profileStore', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanup.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it('infers source profile information from a cookie path', () => {
    const inferred = inferSourceProfileFromCookiePath(
      '/home/test/.config/google-chrome/Default/Network/Cookies',
    );
    expect(inferred).toEqual({
      userDataDir: '/home/test/.config/google-chrome',
      profileName: 'Default',
    });
  });

  it('infers source profile information from a direct profile Cookies path', () => {
    const inferred = inferSourceProfileFromCookiePath(
      '/home/test/.config/google-chrome/Default/Cookies',
    );
    expect(inferred).toEqual({
      userDataDir: '/home/test/.config/google-chrome',
      profileName: 'Default',
    });
  });

  it('ignores a stale inherited manualLoginProfileDir from a different Aura-Call profile', () => {
    expect(
      resolveManagedProfileDir({
        configuredDir: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok',
        managedProfileRoot: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles',
        auracallProfileName: 'wizard-grok-test',
        target: 'grok',
      }),
    ).toBe('/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/wizard-grok-test/grok');
  });

  it('keeps an explicit external manualLoginProfileDir override', () => {
    expect(
      resolveManagedProfileDirForUserConfig({
        auracallProfile: 'wizard-grok-test',
        browser: {
          managedProfileRoot: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles',
          manualLoginProfileDir: '/tmp/custom-grok-profile',
        },
      }),
    ).toBe('/tmp/custom-grok-profile');
  });

  it('prefers the managed profile last_used subprofile when Default is unsigned', async () => {
    const managedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-managed-last-used-'));
    cleanup.push(managedRoot);

    await fs.mkdir(path.join(managedRoot, 'Default'), { recursive: true });
    await fs.mkdir(path.join(managedRoot, 'Profile 1'), { recursive: true });
    await fs.writeFile(
      path.join(managedRoot, 'Local State'),
      JSON.stringify({
        profile: {
          last_used: 'Profile 1',
          info_cache: {
            // biome-ignore lint/complexity/useLiteralKeys: quoted Chrome profile key would trip naming-convention diagnostics.
            ['Default']: {
              name: 'Your Chrome',
              user_name: '',
              is_consented_primary_account: false,
            },
            'Profile 1': {
              name: 'Person 1',
              user_name: 'consult@polymerconsultinggroup.com',
              is_consented_primary_account: true,
            },
          },
        },
      }),
      'utf8',
    );

    expect(resolveManagedProfileName(managedRoot, 'Default')).toBe('Profile 1');
  });

  it('keeps the configured managed subprofile when it is already explicit', async () => {
    const managedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-managed-explicit-'));
    cleanup.push(managedRoot);

    await fs.mkdir(path.join(managedRoot, 'Default'), { recursive: true });
    await fs.mkdir(path.join(managedRoot, 'Profile 1'), { recursive: true });
    await fs.writeFile(
      path.join(managedRoot, 'Local State'),
      JSON.stringify({
        profile: {
          last_used: 'Profile 1',
          info_cache: {
            // biome-ignore lint/complexity/useLiteralKeys: quoted Chrome profile key would trip naming-convention diagnostics.
            ['Default']: {
              name: 'Your Chrome',
              user_name: '',
              is_consented_primary_account: false,
            },
            'Profile 1': {
              name: 'Person 1',
              user_name: 'consult@polymerconsultinggroup.com',
              is_consented_primary_account: true,
            },
          },
        },
      }),
      'utf8',
    );

    expect(resolveManagedProfileName(managedRoot, 'Profile 1')).toBe('Profile 1');
  });

  it('bootstraps a managed profile from an existing source profile', async () => {
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-source-'));
    const managedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-managed-'));
    cleanup.push(sourceRoot, managedRoot);

    await fs.mkdir(path.join(sourceRoot, 'Default', 'Network'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'Default', 'Network', 'Cookies'), 'cookie-db', 'utf8');
    await fs.writeFile(
      path.join(sourceRoot, 'Default', 'Preferences'),
      JSON.stringify({
        account: 'grok',
        profile: {
          exit_type: 'Crashed',
          exited_cleanly: false,
        },
      }),
      'utf8',
    );
    await fs.mkdir(path.join(sourceRoot, 'Default', 'Local Storage', 'leveldb'), { recursive: true });
    await fs.writeFile(
      path.join(sourceRoot, 'Default', 'Local Storage', 'leveldb', 'auth.log'),
      'storage',
      'utf8',
    );
    await fs.writeFile(
      path.join(sourceRoot, 'Default', 'Local Storage', 'leveldb', 'LOCK'),
      'locked',
      'utf8',
    );
    await fs.mkdir(
      path.join(sourceRoot, 'Default', 'IndexedDB', 'https_grok.com_0.indexeddb.leveldb'),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(sourceRoot, 'Default', 'IndexedDB', 'https_grok.com_0.indexeddb.leveldb', 'LOCK'),
      'locked',
      'utf8',
    );
    await fs.mkdir(path.join(sourceRoot, 'Default', 'Extensions', 'abc123'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'Default', 'Extensions', 'abc123', 'huge.bin'), 'ignore', 'utf8');
    await fs.writeFile(
      path.join(sourceRoot, 'Local State'),
      JSON.stringify({
        browser: { enabled_labs_experiments: [] },
        exited_cleanly: false,
      }),
      'utf8',
    );
    await fs.writeFile(path.join(sourceRoot, 'lockfile'), 'locked', 'utf8');
    await fs.writeFile(path.join(sourceRoot, 'Default', 'SingletonLock'), 'locked', 'utf8');
    await fs.mkdir(path.join(sourceRoot, 'Default', 'Cache'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'Default', 'Cache', 'blob'), 'ignore-me', 'utf8');
    await fs.mkdir(path.join(sourceRoot, 'Default', 'Sessions'), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, 'Default', 'Sessions', 'Session_1'), 'stale-session', 'utf8');
    await fs.writeFile(path.join(sourceRoot, 'Default', 'Current Session'), 'stale-current', 'utf8');
    await fs.writeFile(path.join(sourceRoot, 'Default', 'Last Tabs'), 'stale-tabs', 'utf8');

    const managedProfileDir = path.join(managedRoot, 'default', 'grok');
    const result = await bootstrapManagedProfile({
      managedProfileDir,
      managedProfileName: 'Default',
      sourceCookiePath: path.join(sourceRoot, 'Default', 'Network', 'Cookies'),
    });

    expect(result).toMatchObject({
      cloned: true,
      sourceUserDataDir: sourceRoot,
      sourceProfileName: 'Default',
    });
    expect(findBrowserCookieFile(managedProfileDir, 'Default')).toBe(
      path.join(managedProfileDir, 'Default', 'Network', 'Cookies'),
    );
    await expect(fs.readFile(path.join(managedProfileDir, 'Default', 'Preferences'), 'utf8')).resolves.toContain('grok');
    await expect(
      fs.readFile(path.join(managedProfileDir, 'Default', 'Local Storage', 'leveldb', 'auth.log'), 'utf8'),
    ).resolves.toBe('storage');
    const preferences = JSON.parse(
      await fs.readFile(path.join(managedProfileDir, 'Default', 'Preferences'), 'utf8'),
    ) as { profile?: { exit_type?: string; exited_cleanly?: boolean } };
    expect(preferences.profile?.exit_type).toBe('Normal');
    expect(preferences.profile?.exited_cleanly).toBe(true);
    const localState = JSON.parse(
      await fs.readFile(path.join(managedProfileDir, 'Local State'), 'utf8'),
    ) as { exited_cleanly?: boolean; browser?: { enabled_labs_experiments?: unknown[] } };
    expect(localState.browser?.enabled_labs_experiments).toEqual([]);
    expect(localState.exited_cleanly).toBe(true);
    await expect(
      fs.stat(path.join(managedProfileDir, 'Default', 'Local Storage', 'leveldb', 'LOCK')),
    ).rejects.toThrow();
    await expect(
      fs.stat(path.join(managedProfileDir, 'Default', 'IndexedDB', 'https_grok.com_0.indexeddb.leveldb', 'LOCK')),
    ).rejects.toThrow();
    await expect(fs.stat(path.join(managedProfileDir, 'lockfile'))).rejects.toThrow();
    await expect(fs.stat(path.join(managedProfileDir, 'Default', 'SingletonLock'))).rejects.toThrow();
    await expect(fs.stat(path.join(managedProfileDir, 'Default', 'Cache'))).rejects.toThrow();
    await expect(fs.stat(path.join(managedProfileDir, 'Default', 'Extensions'))).rejects.toThrow();
    await expect(fs.stat(path.join(managedProfileDir, 'Default', 'Sessions'))).rejects.toThrow();
    await expect(fs.stat(path.join(managedProfileDir, 'Default', 'Current Session'))).rejects.toThrow();
    await expect(fs.stat(path.join(managedProfileDir, 'Default', 'Last Tabs'))).rejects.toThrow();
  });

  it('reseeds a managed profile when the source cookies are newer', async () => {
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-source-refresh-'));
    const managedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-managed-refresh-'));
    cleanup.push(sourceRoot, managedRoot);

    const sourceCookiePath = path.join(sourceRoot, 'Default', 'Network', 'Cookies');
    const managedProfileDir = path.join(managedRoot, 'default', 'grok');
    const managedCookiePath = path.join(managedProfileDir, 'Default', 'Network', 'Cookies');
    await fs.mkdir(path.join(sourceRoot, 'Default', 'Network'), { recursive: true });
    await fs.writeFile(sourceCookiePath, 'source-cookie-v1', 'utf8');
    await fs.writeFile(path.join(sourceRoot, 'Default', 'Preferences'), '{"account":"source-v1"}', 'utf8');

    await bootstrapManagedProfile({
      managedProfileDir,
      managedProfileName: 'Default',
      sourceCookiePath,
    });

    await fs.writeFile(managedCookiePath, 'managed-cookie-v1', 'utf8');
    await fs.writeFile(path.join(managedProfileDir, 'Default', 'Preferences'), '{"account":"managed-old"}', 'utf8');
    await fs.writeFile(path.join(managedProfileDir, 'Default', 'stale-marker.txt'), 'stale', 'utf8');

    await fs.writeFile(sourceCookiePath, 'source-cookie-v2', 'utf8');
    await fs.writeFile(path.join(sourceRoot, 'Default', 'Preferences'), '{"account":"source-v2"}', 'utf8');
    const older = new Date('2026-03-25T12:00:00.000Z');
    const newer = new Date('2026-03-25T12:00:03.000Z');
    await fs.utimes(managedCookiePath, older, older);
    await fs.utimes(sourceCookiePath, newer, newer);

    const result = await bootstrapManagedProfile({
      managedProfileDir,
      managedProfileName: 'Default',
      sourceCookiePath,
      seedPolicy: 'reseed-if-source-newer',
    });

    expect(result).toMatchObject({
      cloned: false,
      reseeded: true,
      sourceUserDataDir: sourceRoot,
      sourceProfileName: 'Default',
    });
    await expect(fs.readFile(path.join(managedProfileDir, 'Default', 'Preferences'), 'utf8')).resolves.toContain('source-v2');
    await expect(fs.stat(path.join(managedProfileDir, 'Default', 'stale-marker.txt'))).rejects.toThrow();
  });

  it('skips unreadable auth-state files without aborting the bootstrap', async () => {
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-source-unreadable-'));
    const managedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-managed-unreadable-'));
    cleanup.push(sourceRoot, managedRoot);

    const sourceCookiePath = path.join(sourceRoot, 'Default', 'Network', 'Cookies');
    const readablePath = path.join(sourceRoot, 'Default', 'Preferences');
    const unreadablePath = path.join(sourceRoot, 'Default', 'Secure Preferences');
    await fs.mkdir(path.join(sourceRoot, 'Default', 'Network'), { recursive: true });
    await fs.writeFile(sourceCookiePath, 'cookie-db', 'utf8');
    await fs.writeFile(readablePath, '{"account":"grok"}', 'utf8');
    await fs.writeFile(unreadablePath, '{"secret":true}', 'utf8');
    await fs.chmod(unreadablePath, 0o000);

    const managedProfileDir = path.join(managedRoot, 'default', 'grok');
    try {
      const result = await bootstrapManagedProfile({
        managedProfileDir,
        managedProfileName: 'Default',
        sourceCookiePath,
      });

      expect(result.cloned).toBe(true);
      await expect(fs.readFile(path.join(managedProfileDir, 'Default', 'Preferences'), 'utf8')).resolves.toContain('grok');
      await expect(fs.stat(path.join(managedProfileDir, 'Default', 'Secure Preferences'))).rejects.toThrow();
    } finally {
      await fs.chmod(unreadablePath, 0o600);
    }
  });
});
