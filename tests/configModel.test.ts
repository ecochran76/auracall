import { describe, expect, it } from 'vitest';
import {
  ensureBrowserProfiles,
  ensureRuntimeProfiles,
  getBrowserProfiles,
  getRuntimeProfileBrowserProfileId,
  getRuntimeProfiles,
  setBrowserProfile,
  setRuntimeProfile,
  setRuntimeProfileBrowserProfile,
} from '../src/config/model.js';

describe('config model helpers', () => {
  it('treats browserFamilies as the current browser-profile bridge', () => {
    const config: Record<string, unknown> = {};
    setBrowserProfile(config, 'consulting', { chromePath: '/usr/bin/google-chrome' });

    expect(getBrowserProfiles(config)).toEqual({
      consulting: { chromePath: '/usr/bin/google-chrome' },
    });
    expect(ensureBrowserProfiles(config)).toBe(config.browserFamilies);
  });

  it('treats profiles as the current runtime-profile bridge and reads browserFamily as the bridge reference', () => {
    const config: Record<string, unknown> = {};
    const runtimeProfile: Record<string, unknown> = {
      defaultService: 'chatgpt',
    };
    setRuntimeProfileBrowserProfile(runtimeProfile, 'consulting');
    setRuntimeProfile(config, 'consulting', runtimeProfile);

    expect(getRuntimeProfiles(config)).toEqual({
      consulting: {
        defaultService: 'chatgpt',
        browserFamily: 'consulting',
      },
    });
    expect(getRuntimeProfileBrowserProfileId(runtimeProfile)).toBe('consulting');
    expect(ensureRuntimeProfiles(config)).toBe(config.profiles);
  });
});
