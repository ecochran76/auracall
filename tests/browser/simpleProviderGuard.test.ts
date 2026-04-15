import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import {
  readSimpleProviderGuardState,
  resolveSimpleProviderGuardProfileName,
  resolveSimpleProviderGuardStatePath,
  writeSimpleProviderGuardState,
} from '../../src/browser/simpleProviderGuard.js';

describe('simpleProviderGuard', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('derives the guard profile name from a managed browser profile path', () => {
    expect(
      resolveSimpleProviderGuardProfileName({
        managedProfileDir: '/home/test/.auracall/browser-profiles/default/grok',
        managedProfileRoot: '/home/test/.auracall/browser-profiles',
      }),
    ).toBe('default');
  });

  test('persists and reloads Grok guard state under the provider runtime cache root', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-simple-provider-guard-'));
    setAuracallHomeDirOverrideForTest(homeDir);

    try {
      const statePath = resolveSimpleProviderGuardStatePath({
        provider: 'grok',
        profileName: 'default',
      });
      expect(statePath).toBe(path.join(homeDir, 'cache', 'providers', 'grok', '__runtime__', 'rate-limit-default.json'));

      await writeSimpleProviderGuardState(
        {
          provider: 'grok',
          profile: 'default',
          updatedAt: 123,
          lastMutationAt: 120,
          cooldownUntil: 456,
          cooldownDetectedAt: 234,
          cooldownReason: 'Too many requests.',
          cooldownAction: 'browserRun',
        },
        {
          provider: 'grok',
          profileName: 'default',
        },
      );

      const reloaded = await readSimpleProviderGuardState({
        provider: 'grok',
        profileName: 'default',
      });

      expect(reloaded).toEqual({
        provider: 'grok',
        profile: 'default',
        updatedAt: 123,
        lastMutationAt: 120,
        cooldownUntil: 456,
        cooldownDetectedAt: 234,
        cooldownReason: 'Too many requests.',
        cooldownAction: 'browserRun',
      });

      const raw = JSON.parse(await readFile(statePath, 'utf8')) as Record<string, unknown>;
      expect(raw.provider).toBe('grok');
      expect(raw.cooldownAction).toBe('browserRun');
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
