import { describe, expect, test, vi } from 'vitest';
import { collectReattachRegistryDiagnostics } from '../../src/browser/service/registryDiagnostics.js';

const stateRegistryMocks = vi.hoisted(() => ({
  listInstancesWithLiveness: vi.fn(async () => []),
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
    stateRegistryMocks.listInstancesWithLiveness.mockResolvedValueOnce([
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
    ] as any);

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
  });
});
