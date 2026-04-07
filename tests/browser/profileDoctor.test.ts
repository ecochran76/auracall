import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const browserAutomationClientMocks = vi.hoisted(() => ({
  fromConfig: vi.fn(),
}));

vi.mock('../../src/browser/client.js', () => ({
  BrowserAutomationClient: {
    fromConfig: browserAutomationClientMocks.fromConfig,
  },
}));

import {
  createAuracallBrowserFeaturesContract,
  createAuracallBrowserDoctorContract,
  inspectBrowserDoctorIdentity,
  inspectBrowserDoctorState,
} from '../../src/browser/profileDoctor.js';

describe('profileDoctor', () => {
  const cleanup: string[] = [];

  beforeEach(() => {
    browserAutomationClientMocks.fromConfig.mockReset();
  });

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it('reports managed-profile and source bootstrap details', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-doctor-'));
    cleanup.push(root);

    const sourceUserDataDir = path.join(root, 'source');
    const managedRoot = path.join(root, 'managed');
    const registryPath = path.join(root, 'browser-state.json');
    await fs.mkdir(path.join(sourceUserDataDir, 'Default', 'Network'), { recursive: true });
    await fs.writeFile(path.join(sourceUserDataDir, 'Default', 'Network', 'Cookies'), 'cookie-db', 'utf8');

    const report = await inspectBrowserDoctorState(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
          chromeProfile: 'Default',
          chromeCookiePath: path.join(sourceUserDataDir, 'Default', 'Network', 'Cookies'),
          managedProfileRoot: managedRoot,
          manualLogin: true,
        } as never,
      },
      {
        target: 'grok',
        registryPath,
      },
    );

    expect(report.managedProfileDir).toBe(path.join(managedRoot, 'default', 'grok'));
    expect(report.managedProfileExists).toBe(false);
    expect(report.sourceCookiePath).toBe(path.join(sourceUserDataDir, 'Default', 'Network', 'Cookies'));
    expect(report.sourceProfile).toEqual({
      userDataDir: sourceUserDataDir,
      profileName: 'Default',
    });
    expect(report.registryEntries).toEqual([]);
    expect(report.chromeGoogleAccount).toBeNull();
    expect(report.warnings).toContain('Managed browser profile has not been initialized yet.');
  });

  it('prefers bootstrapCookiePath over runtime chromeCookiePath when reporting the source profile', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-doctor-bootstrap-'));
    cleanup.push(root);

    const sourceUserDataDir = path.join(root, 'brave-source');
    const runtimeUserDataDir = path.join(root, 'chrome-source');
    const managedRoot = path.join(root, 'managed');
    const registryPath = path.join(root, 'browser-state.json');
    const bootstrapCookiePath = path.join(sourceUserDataDir, 'Default', 'Network', 'Cookies');
    const runtimeCookiePath = path.join(runtimeUserDataDir, 'Default', 'Network', 'Cookies');
    await fs.mkdir(path.dirname(bootstrapCookiePath), { recursive: true });
    await fs.mkdir(path.dirname(runtimeCookiePath), { recursive: true });
    await fs.writeFile(bootstrapCookiePath, 'brave-cookie-db', 'utf8');
    await fs.writeFile(runtimeCookiePath, 'chrome-cookie-db', 'utf8');

    const report = await inspectBrowserDoctorState(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
          chromeProfile: 'Default',
          chromeCookiePath: runtimeCookiePath,
          bootstrapCookiePath,
          managedProfileRoot: managedRoot,
          manualLogin: true,
        } as never,
      },
      {
        target: 'grok',
        registryPath,
      },
    );

    expect(report.sourceCookiePath).toBe(bootstrapCookiePath);
    expect(report.sourceProfile).toEqual({
      userDataDir: sourceUserDataDir,
      profileName: 'Default',
    });
  });

  it('uses the selected Aura-Call profile path when a stale inherited manualLoginProfileDir points at another profile', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-doctor-profile-select-'));
    cleanup.push(root);

    const managedRoot = path.join(root, 'managed');
    const registryPath = path.join(root, 'browser-state.json');

    const report = await inspectBrowserDoctorState(
      {
        auracallProfile: 'wizard-grok-test',
        browser: {
          target: 'grok',
          chromeProfile: 'Default',
          managedProfileRoot: managedRoot,
          manualLoginProfileDir: path.join(managedRoot, 'default', 'grok'),
          manualLogin: true,
        } as never,
      },
      {
        target: 'grok',
        registryPath,
      },
    );

    expect(report.managedProfileDir).toBe(path.join(managedRoot, 'wizard-grok-test', 'grok'));
  });

  it('flags and prunes stale legacy browser-state entries', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-doctor-registry-'));
    cleanup.push(root);

    const managedRoot = path.join(root, 'managed');
    const registryPath = path.join(root, 'browser-state.json');
    await fs.mkdir(managedRoot, { recursive: true });
    await fs.writeFile(
      registryPath,
      JSON.stringify(
        {
          version: 2,
          instances: {
            legacy: {
              pid: 999999,
              port: 45000,
              host: '127.0.0.1',
              profilePath: '/tmp/auracall-browser-old',
              profileName: 'Default',
              type: 'chrome',
              launchedAt: new Date(0).toISOString(),
              lastSeenAt: new Date(0).toISOString(),
            },
            managed: {
              pid: 999998,
              port: 45001,
              host: '127.0.0.1',
              profilePath: path.join(managedRoot, 'default', 'grok'),
              profileName: 'Default',
              type: 'chrome',
              launchedAt: new Date(0).toISOString(),
              lastSeenAt: new Date(0).toISOString(),
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const before = await inspectBrowserDoctorState(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
          chromeProfile: 'Default',
          managedProfileRoot: managedRoot,
          manualLogin: true,
        } as never,
      },
      {
        target: 'grok',
        registryPath,
      },
    );

    expect(before.registryEntries).toHaveLength(2);
    expect(before.staleRegistryEntries).toHaveLength(2);
    expect(before.legacyRegistryEntries).toHaveLength(1);

    const after = await inspectBrowserDoctorState(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
          chromeProfile: 'Default',
          managedProfileRoot: managedRoot,
          manualLogin: true,
        } as never,
      },
      {
        target: 'grok',
        registryPath,
        pruneDeadRegistryEntries: true,
      },
    );

    expect(after.prunedRegistryEntries).toBe(2);
    expect(after.prunedRegistryEntryReasons).toEqual({ 'dead-process': 2 });
    expect(after.registryEntries).toEqual([]);
    expect(after.staleRegistryEntries).toEqual([]);
  });

  it('does not flag managed browser-profiles paths as legacy', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-doctor-managed-'));
    cleanup.push(root);

    const registryPath = path.join(root, 'browser-state.json');
    const managedProfilePath = path.join(root, '.auracall', 'browser-profiles', 'default', 'grok');
    await fs.mkdir(managedProfilePath, { recursive: true });
    await fs.writeFile(
      registryPath,
      JSON.stringify(
        {
          version: 2,
          instances: {
            managed: {
              pid: 999997,
              port: 45002,
              host: '127.0.0.1',
              profilePath: managedProfilePath,
              profileName: 'Default',
              type: 'chrome',
              launchedAt: new Date(0).toISOString(),
              lastSeenAt: new Date(0).toISOString(),
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const report = await inspectBrowserDoctorState(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
          chromeProfile: 'Default',
          managedProfileRoot: path.join(root, '.auracall', 'browser-profiles'),
          manualLogin: true,
        } as never,
      },
      {
        target: 'grok',
        registryPath,
      },
    );

    expect(report.registryEntries).toHaveLength(1);
    expect(report.registryEntries[0]?.managed).toBe(true);
    expect(report.registryEntries[0]?.legacy).toBe(false);
    expect(report.legacyRegistryEntries).toEqual([]);
  });

  it('warns when the source cookies are newer than the managed profile', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-doctor-refresh-'));
    cleanup.push(root);

    const sourceUserDataDir = path.join(root, 'source');
    const managedRoot = path.join(root, 'managed');
    const registryPath = path.join(root, 'browser-state.json');
    const sourceCookiePath = path.join(sourceUserDataDir, 'Default', 'Network', 'Cookies');
    const managedCookiePath = path.join(managedRoot, 'default', 'grok', 'Default', 'Network', 'Cookies');
    await fs.mkdir(path.dirname(sourceCookiePath), { recursive: true });
    await fs.mkdir(path.dirname(managedCookiePath), { recursive: true });
    await fs.writeFile(sourceCookiePath, 'source-cookie', 'utf8');
    await fs.writeFile(managedCookiePath, 'managed-cookie', 'utf8');
    const older = new Date('2026-03-25T12:00:00.000Z');
    const newer = new Date('2026-03-25T12:00:03.000Z');
    await fs.utimes(managedCookiePath, older, older);
    await fs.utimes(sourceCookiePath, newer, newer);

    const report = await inspectBrowserDoctorState(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
          chromeProfile: 'Default',
          chromeCookiePath: sourceCookiePath,
          managedProfileRoot: managedRoot,
          manualLogin: true,
        } as never,
      },
      {
        target: 'grok',
        registryPath,
      },
    );

    expect(report.warnings).toContain(
      'Source browser cookies are newer than the managed browser profile for grok. Rerun "auracall login --target grok" or "auracall setup --target grok" to refresh the managed browser profile.',
    );
  });

  it('reports Chrome-level Google account state from Local State', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-doctor-google-account-'));
    cleanup.push(root);

    const managedRoot = path.join(root, 'managed');
    const managedProfileDir = path.join(managedRoot, 'default', 'grok');
    const registryPath = path.join(root, 'browser-state.json');
    await fs.mkdir(managedProfileDir, { recursive: true });
    await fs.writeFile(
      path.join(managedProfileDir, 'Local State'),
      JSON.stringify(
        {
          signin: {
            active_accounts: {
              abc: '1',
            },
          },
          profile: {
            info_cache: {
              Default: {
                name: 'Personal',
                user_name: 'ecochran76@gmail.com',
                gaia_name: 'Eric Cochran',
                gaia_given_name: 'Eric',
                gaia_id: '108150140934027970801',
                is_consented_primary_account: false,
              },
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const report = await inspectBrowserDoctorState(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
          chromeProfile: 'Default',
          managedProfileRoot: managedRoot,
          manualLogin: true,
        } as never,
      },
      {
        target: 'grok',
        registryPath,
      },
    );

    expect(report.chromeGoogleAccount).toEqual({
      provider: 'google',
      source: 'local-state',
      status: 'signed-in',
      chromeProfile: 'Default',
      profileName: 'Personal',
      displayName: 'Eric Cochran',
      givenName: 'Eric',
      email: 'ecochran76@gmail.com',
      gaiaId: '108150140934027970801',
      consentedPrimaryAccount: false,
      explicitBrowserSignin: false,
      activeAccounts: 1,
      localStatePath: path.join(managedProfileDir, 'Local State'),
      preferencesPath: null,
    });
  });

  it('marks copied Google active-account markers without profile identity as inconclusive', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-doctor-google-inconclusive-'));
    cleanup.push(root);

    const managedRoot = path.join(root, 'managed');
    const managedProfileDir = path.join(managedRoot, 'default', 'grok');
    const registryPath = path.join(root, 'browser-state.json');
    await fs.mkdir(managedProfileDir, { recursive: true });
    await fs.writeFile(
      path.join(managedProfileDir, 'Local State'),
      JSON.stringify(
        {
          signin: {
            active_accounts: {
              abc: '1',
            },
          },
          profile: {
            info_cache: {
              Default: {
                name: 'Eric',
                user_name: '',
                gaia_name: '',
                gaia_given_name: '',
                gaia_id: '',
                is_consented_primary_account: false,
              },
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const report = await inspectBrowserDoctorState(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
          chromeProfile: 'Default',
          managedProfileRoot: managedRoot,
          manualLogin: true,
        } as never,
      },
      {
        target: 'grok',
        registryPath,
      },
    );

    expect(report.chromeGoogleAccount).toEqual({
      provider: 'google',
      source: 'local-state',
      status: 'inconclusive',
      chromeProfile: 'Default',
      profileName: 'Eric',
      displayName: null,
      givenName: null,
      email: null,
      gaiaId: null,
      consentedPrimaryAccount: false,
      explicitBrowserSignin: false,
      activeAccounts: 1,
      localStatePath: path.join(managedProfileDir, 'Local State'),
      preferencesPath: null,
    });
  });

  it('falls back to Preferences account_info when Local State has not flushed identity yet', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-profile-doctor-google-preferences-'));
    cleanup.push(root);

    const managedRoot = path.join(root, 'managed');
    const managedProfileDir = path.join(managedRoot, 'default', 'grok');
    const registryPath = path.join(root, 'browser-state.json');
    await fs.mkdir(path.join(managedProfileDir, 'Default'), { recursive: true });
    await fs.writeFile(
      path.join(managedProfileDir, 'Local State'),
      JSON.stringify(
        {
          signin: {
            active_accounts: {
              abc: '1',
            },
          },
          profile: {
            info_cache: {
              Default: {
                name: 'Eric',
                user_name: '',
                gaia_name: '',
                gaia_given_name: '',
                gaia_id: '',
                is_consented_primary_account: false,
              },
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    await fs.writeFile(
      path.join(managedProfileDir, 'Default', 'Preferences'),
      JSON.stringify(
        {
          signin: {
            explicit_browser_signin: true,
          },
          google: {
            services: {
              last_gaia_id: '108150140934027970801',
            },
          },
          account_info: [
            {
              email: 'ecochran76@gmail.com',
              full_name: 'Eric Cochran',
              given_name: 'Eric',
              gaia: '108150140934027970801',
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const report = await inspectBrowserDoctorState(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
          chromeProfile: 'Default',
          managedProfileRoot: managedRoot,
          manualLogin: true,
        } as never,
      },
      {
        target: 'grok',
        registryPath,
      },
    );

    expect(report.chromeGoogleAccount).toEqual({
      provider: 'google',
      source: 'preferences',
      status: 'signed-in',
      chromeProfile: 'Default',
      profileName: 'Eric',
      displayName: 'Eric Cochran',
      givenName: 'Eric',
      email: 'ecochran76@gmail.com',
      gaiaId: '108150140934027970801',
      consentedPrimaryAccount: false,
      explicitBrowserSignin: true,
      activeAccounts: 1,
      localStatePath: path.join(managedProfileDir, 'Local State'),
      preferencesPath: path.join(managedProfileDir, 'Default', 'Preferences'),
    });
  });

  it('reports the signed-in managed account identity when a supported browser instance is alive', async () => {
    browserAutomationClientMocks.fromConfig.mockResolvedValue({
      getUserIdentity: vi.fn(async () => ({
        name: 'Eric C',
        handle: '@SwantonDoug',
        email: 'ez86944@gmail.com',
        source: 'next-flight',
      })),
    });

    const identity = await inspectBrowserDoctorIdentity(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
        },
      } as never,
      {
        target: 'grok',
        localReport: {
          target: 'grok',
          registryPath: '/tmp/browser-state.json',
          managedProfileRoot: '/tmp/managed',
          managedProfileDir: '/tmp/managed/default/grok',
          chromeProfile: 'Default',
          sourceCookiePath: null,
          sourceProfile: null,
          managedProfileExists: true,
          managedCookiePath: null,
          managedPreferencesPath: null,
          managedLocalStatePath: null,
          chromeGoogleAccount: null,
          registryEntries: [],
          staleRegistryEntries: [],
          legacyRegistryEntries: [],
          managedRegistryEntry: {
            key: 'managed',
            profilePath: '/tmp/managed/default/grok',
            profileName: 'Default',
            pid: 1234,
            port: 45000,
            host: '127.0.0.1',
            alive: true,
            liveness: 'live',
            actualPid: 1234,
            managed: true,
            legacy: false,
            services: ['grok'],
          },
          prunedRegistryEntries: 0,
          prunedRegistryEntryReasons: {},
          warnings: [],
        },
      },
    );

    expect(identity).toEqual({
      target: 'grok',
      supported: true,
      attempted: true,
      identity: {
        name: 'Eric C',
        handle: '@SwantonDoug',
        email: 'ez86944@gmail.com',
        source: 'next-flight',
      },
      error: null,
      reason: null,
    });
  });

  it('skips identity detection when no active managed browser instance is present', async () => {
    const identity = await inspectBrowserDoctorIdentity(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
        },
      } as never,
      {
        target: 'grok',
        localReport: {
          target: 'grok',
          registryPath: '/tmp/browser-state.json',
          managedProfileRoot: '/tmp/managed',
          managedProfileDir: '/tmp/managed/default/grok',
          chromeProfile: 'Default',
          sourceCookiePath: null,
          sourceProfile: null,
          managedProfileExists: true,
          managedCookiePath: null,
          managedPreferencesPath: null,
          managedLocalStatePath: null,
          chromeGoogleAccount: null,
          registryEntries: [],
          staleRegistryEntries: [],
          legacyRegistryEntries: [],
          managedRegistryEntry: null,
          prunedRegistryEntries: 0,
          prunedRegistryEntryReasons: {},
          warnings: [],
        },
      },
    );

    expect(identity).toEqual({
      target: 'grok',
      supported: true,
      attempted: false,
      identity: null,
      error: null,
      reason: null,
    });
    expect(browserAutomationClientMocks.fromConfig).not.toHaveBeenCalled();
  });

  it('probes Gemini account identity when a managed session is alive', async () => {
    browserAutomationClientMocks.fromConfig.mockResolvedValue({
      getUserIdentity: vi.fn(async () => ({
        name: 'Eric Cochran',
        email: 'ecochran76@gmail.com',
        source: 'google-account-label',
      })),
    });

    const identity = await inspectBrowserDoctorIdentity(
      {
        auracallProfile: 'default',
        browser: {
          target: 'gemini',
        },
      } as never,
      {
        target: 'gemini',
        localReport: {
          target: 'gemini',
          registryPath: '/tmp/browser-state.json',
          managedProfileRoot: '/tmp/managed',
          managedProfileDir: '/tmp/managed/default/gemini',
          chromeProfile: 'Default',
          sourceCookiePath: null,
          sourceProfile: null,
          managedProfileExists: true,
          managedCookiePath: null,
          managedPreferencesPath: null,
          managedLocalStatePath: null,
          chromeGoogleAccount: null,
          registryEntries: [],
          staleRegistryEntries: [],
          legacyRegistryEntries: [],
          managedRegistryEntry: {
            key: '/tmp/managed/default/gemini::default',
            profilePath: '/tmp/managed/default/gemini',
            profileName: 'Default',
            pid: 123,
            port: 45011,
            host: '127.0.0.1',
            alive: true,
            liveness: 'live',
            actualPid: 123,
            managed: true,
            legacy: false,
            services: ['gemini'],
          },
          prunedRegistryEntries: 0,
          prunedRegistryEntryReasons: {},
          warnings: [],
        },
      },
    );

    expect(identity).toEqual({
      target: 'gemini',
      supported: true,
      attempted: true,
      identity: {
        name: 'Eric Cochran',
        email: 'ecochran76@gmail.com',
        source: 'google-account-label',
      },
      error: null,
      reason: null,
    });
    expect(browserAutomationClientMocks.fromConfig).toHaveBeenCalledTimes(1);
  });

  it('wraps doctor output in a versioned Aura-Call contract', async () => {
    const contract = createAuracallBrowserDoctorContract(
      {
        target: 'grok',
        localReport: {
          target: 'grok',
          registryPath: '/tmp/browser-state.json',
          managedProfileRoot: '/tmp/managed',
          managedProfileDir: '/tmp/managed/default/grok',
          chromeProfile: 'Default',
          sourceCookiePath: '/tmp/source/Default/Network/Cookies',
          sourceProfile: {
            userDataDir: '/tmp/source',
            profileName: 'Default',
          },
          managedProfileExists: true,
          managedCookiePath: '/tmp/managed/default/grok/Default/Network/Cookies',
          managedPreferencesPath: '/tmp/managed/default/grok/Default/Preferences',
          managedLocalStatePath: '/tmp/managed/default/grok/Local State',
          chromeGoogleAccount: null,
          registryEntries: [],
          staleRegistryEntries: [],
          legacyRegistryEntries: [],
          managedRegistryEntry: null,
          prunedRegistryEntries: 0,
          prunedRegistryEntryReasons: {},
          warnings: [],
        },
        identityStatus: {
          target: 'grok',
          supported: true,
          attempted: true,
          identity: {
            name: 'Eric C',
            handle: '@SwantonDoug',
            email: 'ez86944@gmail.com',
            source: 'next-flight',
          },
          error: null,
          reason: null,
        },
        featureStatus: {
          target: 'grok',
          supported: true,
          attempted: true,
          featureSignature: '{"detector":"grok-feature-probe-v1"}',
          detected: {
            detector: 'grok-feature-probe-v1',
          },
          error: null,
          reason: null,
        },
        browserTools: {
          contract: 'browser-tools.doctor-report',
          version: 1,
          generatedAt: '2026-03-25T22:00:00.000Z',
          report: {
            census: {
              selectedIndex: 0,
              selectedReason: 'url-contains',
              selectedTab: {
                index: 0,
                url: 'https://grok.com/',
                focused: true,
                title: 'Grok',
                readyState: 'complete',
                visibilityState: 'visible',
                selected: true,
                matchesUrlContains: true,
                selectionReasons: ['url-contains', 'focused', 'non-internal-page', 'last-page'],
                isBlank: false,
                isBrowserInternal: false,
              },
              tabs: [],
              candidates: [],
            },
            pageProbe: null,
            uiList: null,
          },
        },
        selectorDiagnosis: {
          port: 45000,
          report: {
            url: 'https://grok.com/',
            providerId: 'grok',
            checks: [],
            allPassed: true,
          },
        },
      },
      { generatedAt: '2026-03-25T22:00:05.000Z' },
    );

    expect(contract).toEqual({
      contract: 'auracall.browser-doctor',
      version: 1,
      generatedAt: '2026-03-25T22:00:05.000Z',
      target: 'grok',
      localReport: {
        target: 'grok',
        registryPath: '/tmp/browser-state.json',
        managedProfileRoot: '/tmp/managed',
        managedProfileDir: '/tmp/managed/default/grok',
        chromeProfile: 'Default',
        sourceCookiePath: '/tmp/source/Default/Network/Cookies',
        sourceProfile: {
          userDataDir: '/tmp/source',
          profileName: 'Default',
        },
        managedProfileExists: true,
        managedCookiePath: '/tmp/managed/default/grok/Default/Network/Cookies',
        managedPreferencesPath: '/tmp/managed/default/grok/Default/Preferences',
        managedLocalStatePath: '/tmp/managed/default/grok/Local State',
        chromeGoogleAccount: null,
        registryEntries: [],
        staleRegistryEntries: [],
        legacyRegistryEntries: [],
        managedRegistryEntry: null,
        prunedRegistryEntries: 0,
        prunedRegistryEntryReasons: {},
        warnings: [],
      },
      identityStatus: {
        target: 'grok',
        supported: true,
        attempted: true,
        identity: {
          name: 'Eric C',
          handle: '@SwantonDoug',
          email: 'ez86944@gmail.com',
          source: 'next-flight',
        },
        error: null,
        reason: null,
      },
      featureStatus: {
        target: 'grok',
        supported: true,
        attempted: true,
        featureSignature: '{"detector":"grok-feature-probe-v1"}',
        detected: {
          detector: 'grok-feature-probe-v1',
        },
        error: null,
        reason: null,
      },
      runtime: {
        browserTools: {
          contract: 'browser-tools.doctor-report',
          version: 1,
          generatedAt: '2026-03-25T22:00:00.000Z',
          report: {
            census: {
              selectedIndex: 0,
              selectedReason: 'url-contains',
              selectedTab: {
                index: 0,
                url: 'https://grok.com/',
                focused: true,
                title: 'Grok',
                readyState: 'complete',
                visibilityState: 'visible',
                selected: true,
                matchesUrlContains: true,
                selectionReasons: ['url-contains', 'focused', 'non-internal-page', 'last-page'],
                isBlank: false,
                isBrowserInternal: false,
              },
              tabs: [],
              candidates: [],
            },
            pageProbe: null,
            uiList: null,
          },
        },
        browserToolsError: null,
        selectorDiagnosis: {
          port: 45000,
          report: {
            url: 'https://grok.com/',
            providerId: 'grok',
            checks: [],
            allPassed: true,
          },
        },
        selectorDiagnosisError: null,
      },
    });
  });

  it('wraps browser feature discovery output in a versioned Aura-Call contract', () => {
    const contract = createAuracallBrowserFeaturesContract(
      {
        target: 'gemini',
        featureStatus: {
          target: 'gemini',
          supported: true,
          attempted: true,
          featureSignature: '{"detector":"gemini-feature-probe-v1","modes":["canvas"]}',
          detected: {
            detector: 'gemini-feature-probe-v1',
            modes: ['canvas'],
          },
          error: null,
          reason: null,
        },
        browserTools: {
          contract: 'browser-tools.doctor-report',
          version: 1,
          generatedAt: '2026-04-06T20:00:00.000Z',
          report: {
            census: {
              selectedIndex: 0,
              selectedReason: 'url-contains',
              selectedTab: {
                index: 0,
                url: 'https://gemini.google.com/app',
                focused: true,
                title: 'Gemini',
                readyState: 'complete',
                visibilityState: 'visible',
                selected: true,
                matchesUrlContains: true,
                selectionReasons: ['url-contains'],
                isBlank: false,
                isBrowserInternal: false,
              },
              tabs: [],
              candidates: [],
            },
            pageProbe: null,
            uiList: null,
          },
        },
        browserToolsError: null,
      },
      { generatedAt: '2026-04-06T20:00:05.000Z' },
    );

    expect(contract).toEqual({
      contract: 'auracall.browser-features',
      version: 1,
      generatedAt: '2026-04-06T20:00:05.000Z',
      target: 'gemini',
      featureStatus: {
        target: 'gemini',
        supported: true,
        attempted: true,
        featureSignature: '{"detector":"gemini-feature-probe-v1","modes":["canvas"]}',
        detected: {
          detector: 'gemini-feature-probe-v1',
          modes: ['canvas'],
        },
        error: null,
        reason: null,
      },
      runtime: {
        browserTools: {
          contract: 'browser-tools.doctor-report',
          version: 1,
          generatedAt: '2026-04-06T20:00:00.000Z',
          report: {
            census: {
              selectedIndex: 0,
              selectedReason: 'url-contains',
              selectedTab: {
                index: 0,
                url: 'https://gemini.google.com/app',
                focused: true,
                title: 'Gemini',
                readyState: 'complete',
                visibilityState: 'visible',
                selected: true,
                matchesUrlContains: true,
                selectionReasons: ['url-contains'],
                isBlank: false,
                isBrowserInternal: false,
              },
              tabs: [],
              candidates: [],
            },
            pageProbe: null,
            uiList: null,
          },
        },
        browserToolsError: null,
      },
    });
  });
});
