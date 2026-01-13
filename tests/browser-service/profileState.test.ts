import { describe, expect, test, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as profileState from '../../packages/browser-service/src/profileState.js';
import * as processCheck from '../../packages/browser-service/src/processCheck.js';

vi.mock('../../packages/browser-service/src/processCheck.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/processCheck.js')>();
  return {
    ...actual,
    isChromeAlive: vi.fn(async () => false),
    findChromePidUsingUserDataDir: vi.fn(async () => null),
  };
});

describe('profileState (package)', () => {
  test('writes and reads DevToolsActivePort', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'browser-service-profile-'));
    try {
      await profileState.writeDevToolsActivePort(dir, 23456);
      const root = path.join(dir, 'DevToolsActivePort');
      const nested = path.join(dir, 'Default', 'DevToolsActivePort');
      expect(existsSync(root)).toBe(true);
      expect(existsSync(nested)).toBe(true);
      expect((await readFile(root, 'utf8')).split('\n')[0]?.trim()).toBe('23456');
      await expect(profileState.readDevToolsPort(dir)).resolves.toBe(23456);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('removes lock files when recorded pid is dead', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'browser-service-profile-'));
    const lockFiles = [
      path.join(dir, 'lockfile'),
      path.join(dir, 'SingletonLock'),
      path.join(dir, 'SingletonSocket'),
      path.join(dir, 'SingletonCookie'),
    ];
    try {
      await profileState.writeDevToolsActivePort(dir, 12345);
      await profileState.writeChromePid(dir, 99999);
      for (const lock of lockFiles) {
        await writeFile(lock, 'x');
      }

      await profileState.cleanupStaleProfileState(dir, undefined, { lockRemovalMode: 'if_recorded_pid_dead' });

      for (const lock of lockFiles) {
        expect(existsSync(lock)).toBe(false);
      }
      expect(processCheck.isChromeAlive).toHaveBeenCalled();
      expect(processCheck.findChromePidUsingUserDataDir).toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
