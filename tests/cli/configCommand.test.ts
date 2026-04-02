import { describe, expect, it } from 'vitest';
import {
  buildConfigDoctorReport,
  buildConfigShowReport,
  buildProfileListReport,
  buildRuntimeProfileBridgeSummary,
  formatConfigDoctorReport,
  formatConfigShowReport,
  formatProfileListReport,
  formatRuntimeProfileBridgeSummary,
} from '../../src/cli/configCommand.js';

describe('config show helpers', () => {
  it('builds a report in target-model terms from the bridge-key config', () => {
    const report = buildConfigShowReport({
      rawConfig: {
        browserFamilies: {
          default: { chromePath: '/usr/bin/google-chrome' },
          'wsl-chrome-2': { chromePath: '/usr/bin/google-chrome' },
        },
        profiles: {
          default: {
            browserFamily: 'default',
            defaultService: 'chatgpt',
          },
          work: {
            browserFamily: 'wsl-chrome-2',
            defaultService: 'grok',
          },
        },
      },
      resolvedConfig: {
        auracallProfile: 'work',
        browser: { target: 'grok' },
      } as never,
      configPath: '/tmp/config.json',
      loaded: true,
    });

    expect(report).toEqual({
      configPath: '/tmp/config.json',
      loaded: true,
      active: {
        auracallRuntimeProfile: 'work',
        browserProfile: 'wsl-chrome-2',
        defaultService: 'grok',
        resolvedBrowserTarget: 'grok',
      },
      available: {
        browserProfiles: ['default', 'wsl-chrome-2'],
        auracallRuntimeProfiles: ['default', 'work'],
        legacyRuntimeProfiles: [],
      },
      bridgeKeys: {
        browserProfiles: 'browserFamilies',
        auracallRuntimeProfiles: 'profiles',
        runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily',
      },
      bridgeState: {
        browserProfilesPresent: true,
        auracallRuntimeProfilesPresent: true,
        legacyRuntimeProfilesPresent: false,
      },
    });
  });

  it('formats a readable summary including bridge-key presence', () => {
    const text = formatConfigShowReport({
      configPath: '/tmp/config.json',
      loaded: true,
      active: {
        auracallRuntimeProfile: 'default',
        browserProfile: 'default',
        defaultService: 'chatgpt',
        resolvedBrowserTarget: 'chatgpt',
      },
      available: {
        browserProfiles: ['default'],
        auracallRuntimeProfiles: ['default'],
        legacyRuntimeProfiles: [],
      },
      bridgeKeys: {
        browserProfiles: 'browserFamilies',
        auracallRuntimeProfiles: 'profiles',
        runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily',
      },
      bridgeState: {
        browserProfilesPresent: true,
        auracallRuntimeProfilesPresent: true,
        legacyRuntimeProfilesPresent: false,
      },
    });

    expect(text).toContain('AuraCall runtime profile: default');
    expect(text).toContain('Browser profile: default');
    expect(text).toContain('browser profiles -> browserFamilies (present)');
    expect(text).toContain('AuraCall runtime profiles -> profiles (present)');
  });

  it('builds and formats a compact runtime-profile bridge summary', () => {
    const summary = buildRuntimeProfileBridgeSummary(
      {
        auracallProfile: 'work',
        profiles: {
          default: {
            browserFamily: 'default',
            defaultService: 'chatgpt',
          },
          work: {
            browserFamily: 'wsl-chrome-2',
            defaultService: 'grok',
          },
        },
      },
      { explicitProfileName: 'work' },
    );

    expect(summary).toEqual({
      auracallRuntimeProfile: 'work',
      browserProfile: 'wsl-chrome-2',
      defaultService: 'grok',
    });
    expect(formatRuntimeProfileBridgeSummary(summary)).toBe(
      'AuraCall runtime profile "work" -> browser profile "wsl-chrome-2" -> default service grok',
    );
  });

  it('builds and formats a runtime-profile inventory report', () => {
    const report = buildProfileListReport(
      {
        auracallProfile: 'work',
        browserFamilies: {
          default: {},
          'wsl-chrome-2': {},
        },
        profiles: {
          default: {
            browserFamily: 'default',
            defaultService: 'chatgpt',
          },
          work: {
            browserFamily: 'wsl-chrome-2',
            defaultService: 'grok',
          },
        },
      },
      { explicitProfileName: 'work' },
    );

    expect(report).toEqual({
      activeAuracallRuntimeProfile: 'work',
      browserProfiles: ['default', 'wsl-chrome-2'],
      auracallRuntimeProfiles: [
        {
          name: 'default',
          active: false,
          browserProfile: 'default',
          defaultService: 'chatgpt',
        },
        {
          name: 'work',
          active: true,
          browserProfile: 'wsl-chrome-2',
          defaultService: 'grok',
        },
      ],
      bridgeKeys: {
        browserProfiles: 'browserFamilies',
        auracallRuntimeProfiles: 'profiles',
        runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily',
      },
    });

    const text = formatProfileListReport(report);
    expect(text).toContain('Active AuraCall runtime profile: work');
    expect(text).toContain('Available browser profiles: default, wsl-chrome-2');
    expect(text).toContain('- default -> browser profile default -> default service chatgpt');
    expect(text).toContain('* work -> browser profile wsl-chrome-2 -> default service grok');
  });

  it('builds a bridge-health doctor report for missing and dangling browser-profile references', () => {
    const report = buildConfigDoctorReport(
      {
        auracallProfile: 'default',
        browserFamilies: {
          'wsl-chrome-2': {},
          orphaned: {},
        },
        profiles: {
          default: {
            defaultService: 'grok',
          },
          work: {
            browserFamily: 'missing-profile',
            defaultService: 'chatgpt',
          },
          consulting: {
            browserFamily: 'wsl-chrome-2',
            defaultService: 'chatgpt',
          },
        },
        auracallProfiles: {
          legacy: {
            defaultService: 'chatgpt',
          },
        },
      },
      { explicitProfileName: 'default' },
    );

    expect(report.ok).toBe(false);
    expect(report.activeAuracallRuntimeProfile).toBe('default');
    expect(report.activeBrowserProfile).toBeNull();
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'legacy-runtime-profiles-present',
          severity: 'info',
        }),
        expect.objectContaining({
          code: 'runtime-profile-missing-browser-profile',
          auracallRuntimeProfile: 'default',
        }),
        expect.objectContaining({
          code: 'runtime-profile-browser-profile-missing',
          auracallRuntimeProfile: 'work',
          browserProfile: 'missing-profile',
        }),
        expect.objectContaining({
          code: 'unused-browser-profile',
          browserProfile: 'orphaned',
        }),
        expect.objectContaining({
          code: 'active-runtime-profile-missing-browser-profile',
          auracallRuntimeProfile: 'default',
        }),
      ]),
    );

    const text = formatConfigDoctorReport(report);
    expect(text).toContain('Status: warnings');
    expect(text).toContain('Active AuraCall runtime profile: default');
    expect(text).toContain('Active browser profile: (none)');
    expect(text).toContain('[warning] AuraCall runtime profile "default" does not explicitly reference a browser profile.');
    expect(text).toContain('[info] Browser profile "orphaned" is defined but no AuraCall runtime profile references it.');
  });
});
