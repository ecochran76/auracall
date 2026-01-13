import { describe, expect, test, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as registry from '../../packages/browser-service/src/service/stateRegistry.js';

vi.mock('../../packages/browser-service/src/processCheck.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/processCheck.js')>();
  return {
    ...actual,
    isChromeAlive: vi.fn(async () => true),
  };
});

describe('stateRegistry (package)', () => {
  test('registers and resolves active instances', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'browser-service-registry-'));
    const registryPath = path.join(dir, 'browser-state.json');
    try {
      await registry.registerInstance(
        { registryPath },
        {
          pid: 1234,
          port: 9222,
          host: '127.0.0.1',
          profilePath: '/tmp/profile',
          profileName: 'Default',
          type: 'chrome',
          launchedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
      );
      const instance = await registry.findActiveInstance({ registryPath }, '/tmp/profile', 'Default');
      expect(instance?.port).toBe(9222);
      expect(instance?.profileName).toBe('Default');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('prunes dead instances', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'browser-service-registry-'));
    const registryPath = path.join(dir, 'browser-state.json');
    try {
      await registry.registerInstance(
        { registryPath },
        {
          pid: 9999,
          port: 9223,
          host: '127.0.0.1',
          profilePath: '/tmp/profile',
          profileName: 'Default',
          type: 'chrome',
          launchedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
      );
      const processCheck = await import('../../packages/browser-service/src/processCheck.js');
      vi.mocked(processCheck.isChromeAlive).mockResolvedValueOnce(false);
      await registry.pruneRegistry({ registryPath });

      const raw = await readFile(registryPath, 'utf8');
      const parsed = JSON.parse(raw) as registry.BrowserStateRegistry;
      expect(Object.keys(parsed.instances)).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
