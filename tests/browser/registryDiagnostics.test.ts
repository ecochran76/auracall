import { describe, expect, test, vi } from 'vitest';
import { collectReattachRegistryDiagnostics } from '../../src/browser/service/registryDiagnostics.js';
import type { ClassifiedBrowserInstance } from '../../packages/browser-service/src/service/stateRegistry.js';

function classifiedInstances(instances: ClassifiedBrowserInstance[]): ClassifiedBrowserInstance[] {
  return instances;
}

const stateRegistryMocks = vi.hoisted(() => ({
  listInstancesWithLiveness: vi.fn<() => Promise<ClassifiedBrowserInstance[]>>(async () => []),
}));

vi.mock('../../packages/browser-service/src/service/stateRegistry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/service/stateRegistry.js')>();
  return {
    ...actual,
    listInstancesWithLiveness: stateRegistryMocks.listInstancesWithLiveness,
  };
});

describe('collectReattachRegistryDiagnostics', () => {
  test('collects stale selected-port and expected-profile candidates for a reattach runtime', async () => {
    stateRegistryMocks.listInstancesWithLiveness.mockResolvedValueOnce(classifiedInstances([
      {
        instance: {
          pid: 9001,
          port: 9222,
          host: '127.0.0.1',
          profilePath: '/tmp/auracall/browser-profiles/default/chatgpt',
          profileName: 'Default',
          type: 'chrome',
          launchedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
        alive: false,
        liveness: 'dead-port',
        actualPid: 9001,
      },
      {
        instance: {
          pid: 9002,
          port: 4555,
          host: '127.0.0.1',
          profilePath: '/tmp/auracall/browser-profiles/default/chatgpt',
          profileName: 'Default',
          type: 'chrome',
          launchedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
        alive: false,
        liveness: 'profile-mismatch',
        actualPid: 7777,
      },
    ]));

    const result = await collectReattachRegistryDiagnostics({
      runtime: { chromePort: 9222, chromeHost: '127.0.0.1' },
      config: {
        target: 'chatgpt',
        manualLogin: true,
        manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
        chromeProfile: 'Default',
      },
      registryPath: '/tmp/browser-state.json',
    });

    expect(result?.discardedRegistryCandidates).toEqual([
      expect.objectContaining({ reason: 'expected-profile-stale', liveness: 'profile-mismatch', actualPid: 7777 }),
      expect.objectContaining({ reason: 'selected-port-stale', liveness: 'dead-port', actualPid: 9001 }),
    ]);
    expect(result?.selectedPortCandidates).toEqual([
      expect.objectContaining({
        profilePath: '/tmp/auracall/browser-profiles/default/chatgpt',
        profileName: 'Default',
        port: 9222,
        liveness: 'dead-port',
        actualPid: 9001,
      }),
    ]);
  });

  test('collects live selected-port owners for cross-profile reattach checks', async () => {
    stateRegistryMocks.listInstancesWithLiveness.mockResolvedValueOnce(classifiedInstances([
      {
        instance: {
          pid: 9010,
          port: 45013,
          host: '127.0.0.1',
          profilePath: '/tmp/auracall/browser-profiles/wsl-chrome-2/chatgpt',
          profileName: 'Profile 1',
          type: 'chrome',
          launchedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
        alive: true,
        liveness: 'live',
        actualPid: 9010,
      },
    ]));

    const result = await collectReattachRegistryDiagnostics({
      runtime: { chromePort: 45013, chromeHost: '127.0.0.1' },
      config: {
        target: 'chatgpt',
        manualLogin: true,
        manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
        chromeProfile: 'Default',
      },
      registryPath: '/tmp/browser-state.json',
    });

    expect(result?.selectedPortCandidates).toEqual([
      expect.objectContaining({
        profilePath: '/tmp/auracall/browser-profiles/wsl-chrome-2/chatgpt',
        profileName: 'Profile 1',
        port: 45013,
        liveness: 'live',
        actualPid: 9010,
      }),
    ]);
  });
});
