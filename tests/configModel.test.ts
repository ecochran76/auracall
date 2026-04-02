import { describe, expect, it } from 'vitest';
import {
  getBrowserProfile,
  ensureBrowserProfiles,
  ensureRuntimeProfiles,
  getActiveRuntimeProfile,
  getActiveRuntimeProfileName,
  getBrowserProfiles,
  getBridgeRuntimeProfiles,
  getLegacyRuntimeProfiles,
  getCurrentRuntimeProfiles,
  getPreferredRuntimeProfile,
  getPreferredRuntimeProfileName,
  getRuntimeProfileBrowserProfile,
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
    expect(getBrowserProfile(config, 'consulting')).toEqual({
      chromePath: '/usr/bin/google-chrome',
    });
    expect(ensureBrowserProfiles(config)).toBe(config.browserFamilies);
  });

  it('treats profiles as the current runtime-profile bridge and reads browserFamily as the bridge reference', () => {
    const config: Record<string, unknown> = {};
    setBrowserProfile(config, 'consulting', { chromePath: '/usr/bin/google-chrome' });
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
    expect(getRuntimeProfileBrowserProfile(config, runtimeProfile)).toEqual({
      chromePath: '/usr/bin/google-chrome',
    });
    expect(ensureRuntimeProfiles(config)).toBe(config.profiles);
  });

  it('prefers legacy auracallProfiles when selecting the active runtime profile bridge', () => {
    const config = {
      auracallProfile: 'legacy',
      profiles: {
        current: { defaultService: 'chatgpt' },
      },
      auracallProfiles: {
        legacy: { defaultService: 'grok' },
      },
    };

    expect(getCurrentRuntimeProfiles(config)).toEqual({
      current: { defaultService: 'chatgpt' },
    });
    expect(getLegacyRuntimeProfiles(config)).toEqual({
      legacy: { defaultService: 'grok' },
    });
    expect(getBridgeRuntimeProfiles(config)).toEqual({
      legacy: { defaultService: 'grok' },
    });
    expect(getActiveRuntimeProfileName(config)).toBe('legacy');
    expect(getActiveRuntimeProfile(config)).toEqual({ defaultService: 'grok' });
  });

  it('prefers the explicit current runtime profile over legacy when both shapes exist', () => {
    const config = {
      auracallProfile: 'legacy',
      profiles: {
        work: { defaultService: 'chatgpt' },
      },
      auracallProfiles: {
        legacy: { defaultService: 'grok' },
        work: { defaultService: 'gemini' },
      },
    };

    expect(getPreferredRuntimeProfileName(config, { explicitProfileName: 'work' })).toBe('work');
    expect(getPreferredRuntimeProfile(config, { explicitProfileName: 'work' })).toEqual({
      defaultService: 'chatgpt',
    });
  });
});
