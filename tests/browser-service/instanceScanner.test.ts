import { describe, expect, test, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  registerInstance,
  type BrowserStateRegistry,
} from '../../packages/browser-service/src/service/stateRegistry.js';
import { scanRegisteredInstance } from '../../packages/browser-service/src/service/instanceScanner.js';

vi.mock('chrome-remote-interface', () => {
  const LIST = vi.fn();
  const mock = Object.assign(() => ({}), { List: LIST });
  return { default: mock };
});

describe('instanceScanner (package)', () => {
  test('scans targets and updates registry tabs', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'browser-service-registry-'));
    const registryPath = path.join(dir, 'browser-state.json');
    try {
      await registerInstance(
        { registryPath },
        {
          pid: 4321,
          port: 9222,
          host: '127.0.0.1',
          profilePath: '/tmp/profile',
          profileName: 'Default',
          type: 'chrome',
          launchedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
      );

      const { default: cdp } = await import('chrome-remote-interface');
      const cdpMock = cdp as unknown as { List: ReturnType<typeof vi.fn> };
      cdpMock.List.mockResolvedValue([
        { targetId: 'tab-1', type: 'page', url: 'https://grok.com', title: 'Grok' },
      ]);
      const scan = await scanRegisteredInstance(
        { registryPath },
        '/tmp/profile',
        'Default',
      );
      expect(scan?.tabs?.length).toBe(1);

      const raw = await readFile(registryPath, 'utf8');
      const parsed = JSON.parse(raw) as BrowserStateRegistry;
      const instance = Object.values(parsed.instances)[0];
      expect(instance?.tabs?.length).toBe(1);
      expect(instance?.lastKnownUrls).toEqual(['https://grok.com']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
