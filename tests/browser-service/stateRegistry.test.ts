import { describe, expect, test, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as registry from '../../packages/browser-service/src/service/stateRegistry.js';
import {
  explainTabResolution,
  resolveTab,
  summarizeTabResolution,
} from '../../packages/browser-service/src/service/instanceScanner.js';

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
          args: ['--remote-debugging-port=9222'],
          services: ['grok'],
        },
      );
      const instance = await registry.findActiveInstance({ registryPath }, '/tmp/profile', 'Default');
      expect(instance?.port).toBe(9222);
      expect(instance?.profileName).toBe('Default');
      expect(instance?.args).toEqual(['--remote-debugging-port=9222']);
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
      expect(parsed.version).toBe(2);
      expect(Object.keys(parsed.instances)).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('resolveTab prefers matching URL', () => {
    const tabs = [
      { targetId: 'a', url: 'https://example.com', title: 'Example', type: 'page' },
      { targetId: 'b', url: 'https://grok.com', title: 'Grok', type: 'page' },
    ];
    const tab = resolveTab(tabs, { matchUrl: (url) => url.includes('grok.com') });
    expect(tab?.targetId).toBe('b');
  });

  test('resolveTab normalizes legacy id-only targets', () => {
    const tabs = [
      { id: 'legacy-a', url: 'https://example.com', title: 'Example', type: 'page' },
      { id: 'legacy-b', url: 'https://grok.com', title: 'Grok', type: 'page' },
    ];
    const tab = resolveTab(tabs, { matchUrl: (url) => url.includes('grok.com') });
    expect(tab?.targetId).toBe('legacy-b');
  });

  test('explainTabResolution reports score and reasons for the winner', () => {
    const tabs = [
      { targetId: 'a', url: 'https://example.com', title: 'Docs', type: 'page' },
      { id: 'legacy-b', url: 'https://grok.com/project', title: 'Grok', type: 'page' },
      { targetId: 'c', url: 'https://grok.com/settings', title: 'Settings', type: 'other' },
    ];

    const result = explainTabResolution(tabs, {
      matchUrl: (url) => url.includes('grok.com'),
      matchTitle: (title) => title === 'Grok',
      preferTypes: ['page'],
    });

    expect(result.tab?.targetId).toBe('legacy-b');
    expect(result.score).toBe(6);
    expect(result.candidates[1]).toMatchObject({
      selected: true,
      score: 6,
      reasons: ['match-url', 'match-title', 'preferred-type'],
      tab: { targetId: 'legacy-b' },
    });
    expect(result.candidates[2]).toMatchObject({
      selected: false,
      score: 3,
      reasons: ['match-url'],
    });
  });

  test('summarizeTabResolution formats the winner and nearest losers', () => {
    const result = explainTabResolution(
      [
        { targetId: 'a', url: 'https://example.com', title: 'Docs', type: 'page' },
        { targetId: 'b', url: 'https://grok.com/project', title: 'Grok', type: 'page' },
        { targetId: 'c', url: 'https://grok.com/settings', title: 'Settings', type: 'page' },
      ],
      {
        matchUrl: (url) => url.includes('grok.com'),
        matchTitle: (title) => title === 'Grok',
      },
    );

    expect(summarizeTabResolution(result)).toContain('Selected tab=b type=page url=https://grok.com/project score=5');
    expect(summarizeTabResolution(result)).toContain('tab=c type=page url=https://grok.com/settings score=3');
  });
});
