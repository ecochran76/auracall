import { describe, expect, it } from 'vitest';
import {
  CONFIG_MODEL_BRIDGE_KEYS,
  analyzeConfigModelBridgeHealth,
  getAgent,
  getAgentRuntimeProfile,
  getAgentRuntimeProfileId,
  getBrowserProfile,
  ensureBrowserProfiles,
  ensureRuntimeProfiles,
  getActiveRuntimeProfile,
  getActiveRuntimeProfileName,
  getBrowserProfiles,
  getBridgeRuntimeProfiles,
  getLegacyRuntimeProfiles,
  getCurrentRuntimeProfiles,
  getTargetRuntimeProfiles,
  getPreferredRuntimeProfile,
  getPreferredRuntimeProfileName,
  inspectConfigModel,
  projectConfigModel,
  resolveAgentSelection,
  resolveRuntimeSelectionPolicy,
  resolveTeamSelection,
  resolveTeamRuntimeSelections,
  resolveRuntimeSelection,
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

  it('prefers target-shape browser and runtime profiles over bridge keys when both exist', () => {
    const config = {
      browserFamilies: {
        default: { chromePath: '/bridge/chrome' },
      },
      browserProfiles: {
        default: { chromePath: '/target/chrome' },
      },
      profiles: {
        default: { browserFamily: 'bridge-default', defaultService: 'chatgpt' },
      },
      runtimeProfiles: {
        default: { browserProfile: 'target-default', defaultService: 'grok' },
      },
    };

    expect(getBrowserProfiles(config)).toEqual({
      default: { chromePath: '/target/chrome' },
    });
    expect(getCurrentRuntimeProfiles(config)).toEqual({
      default: { browserProfile: 'target-default', defaultService: 'grok' },
    });
    expect(getTargetRuntimeProfiles(config)).toEqual({
      default: { browserProfile: 'target-default', defaultService: 'grok' },
    });
    expect(getRuntimeProfileBrowserProfileId(getCurrentRuntimeProfiles(config).default)).toBe('target-default');
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

  it('projects agent inheritance through runtime profiles without reopening browser-profile lookup', () => {
    const config = {
      browserProfiles: {
        default: {},
        consulting: {},
      },
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
        work: { browserProfile: 'consulting', defaultService: 'grok' },
      },
      agents: {
        researcher: { runtimeProfile: 'default' },
        analyst: { runtimeProfile: 'work' },
      },
      teams: {
        ops: { agents: ['researcher', 'analyst'] },
      },
    };

    expect(getAgentRuntimeProfileId(config.agents.researcher)).toBe('default');
    expect(getAgentRuntimeProfile(config, config.agents.analyst)).toEqual({
      browserProfile: 'consulting',
      defaultService: 'grok',
    });
    expect(projectConfigModel(config)).toEqual({
      activeRuntimeProfileId: 'default',
      activeBrowserProfileId: 'default',
      browserProfiles: [{ id: 'consulting' }, { id: 'default' }],
      runtimeProfiles: [
        { id: 'default', browserProfileId: 'default', defaultService: 'chatgpt' },
        { id: 'work', browserProfileId: 'consulting', defaultService: 'grok' },
      ],
      agents: [
        { id: 'analyst', runtimeProfileId: 'work', browserProfileId: 'consulting', defaultService: 'grok' },
        { id: 'researcher', runtimeProfileId: 'default', browserProfileId: 'default', defaultService: 'chatgpt' },
      ],
      teams: [
        {
          id: 'ops',
          agentIds: ['researcher', 'analyst'],
          members: [
            {
              agentId: 'researcher',
              exists: true,
              runtimeProfileId: 'default',
              browserProfileId: 'default',
              defaultService: 'chatgpt',
            },
            {
              agentId: 'analyst',
              exists: true,
              runtimeProfileId: 'work',
              browserProfileId: 'consulting',
              defaultService: 'grok',
            },
          ],
        },
      ],
    });
  });

  it('projects unresolved team members explicitly in the shared target model', () => {
    const config = {
      browserProfiles: {
        default: {},
      },
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
      },
      agents: {
        researcher: { runtimeProfile: 'default' },
      },
      teams: {
        ops: { agents: ['researcher', 'missing-agent'] },
      },
    };

    expect(projectConfigModel(config).teams).toEqual([
      {
        id: 'ops',
        agentIds: ['researcher', 'missing-agent'],
        members: [
          {
            agentId: 'researcher',
            exists: true,
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            defaultService: 'chatgpt',
          },
          {
            agentId: 'missing-agent',
            exists: false,
            runtimeProfileId: null,
            browserProfileId: null,
            defaultService: null,
          },
        ],
      },
    ]);
  });

  it('resolves an agent selection through runtime and browser profile context', () => {
    const config = {
      browserProfiles: {
        default: {},
        consulting: {},
      },
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
        work: { browserProfile: 'consulting', defaultService: 'grok' },
      },
      agents: {
        researcher: { runtimeProfile: 'default' },
        analyst: { runtimeProfile: 'work' },
      },
    };

    expect(getAgent(config, 'analyst')).toEqual({ runtimeProfile: 'work' });
    expect(resolveAgentSelection(config, 'analyst')).toEqual({
      agentId: 'analyst',
      runtimeProfileId: 'work',
      browserProfileId: 'consulting',
      defaultService: 'grok',
      exists: true,
    });
    expect(resolveAgentSelection(config, 'missing-agent')).toEqual({
      agentId: 'missing-agent',
      runtimeProfileId: null,
      browserProfileId: null,
      defaultService: null,
      exists: false,
    });
  });

  it('resolves a team selection through agent, runtime-profile, and browser-profile context', () => {
    const config = {
      browserProfiles: {
        default: {},
        consulting: {},
      },
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
        work: { browserProfile: 'consulting', defaultService: 'grok' },
      },
      agents: {
        researcher: { runtimeProfile: 'default' },
        analyst: { runtimeProfile: 'work' },
      },
      teams: {
        ops: { agents: ['researcher', 'missing-agent', 'analyst'] },
      },
    };

    expect(resolveTeamSelection(config, 'ops')).toEqual({
      teamId: 'ops',
      agentIds: ['researcher', 'missing-agent', 'analyst'],
      members: [
        {
          agentId: 'researcher',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          defaultService: 'chatgpt',
          exists: true,
        },
        {
          agentId: 'missing-agent',
          runtimeProfileId: null,
          browserProfileId: null,
          defaultService: null,
          exists: false,
        },
        {
          agentId: 'analyst',
          runtimeProfileId: 'work',
          browserProfileId: 'consulting',
          defaultService: 'grok',
          exists: true,
        },
      ],
      exists: true,
    });
    expect(resolveTeamSelection(config, 'missing-team')).toEqual({
      teamId: 'missing-team',
      agentIds: [],
      members: [],
      exists: false,
    });
  });

  it('resolves the runtime/browser activation contexts for a team in one shared helper', () => {
    const config = {
      defaultRuntimeProfile: 'default',
      browserProfiles: {
        default: { chromePath: '/chrome/default' },
        consulting: { chromePath: '/chrome/consulting' },
      },
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
        work: { browserProfile: 'consulting', defaultService: 'grok' },
      },
      agents: {
        researcher: { runtimeProfile: 'default' },
        analyst: { runtimeProfile: 'work' },
      },
      teams: {
        ops: { agents: ['researcher', 'missing-agent', 'analyst'] },
      },
    };

    expect(resolveTeamRuntimeSelections(config, 'ops')).toEqual({
      teamId: 'ops',
      agentIds: ['researcher', 'missing-agent', 'analyst'],
      members: [
        {
          agentId: 'researcher',
          exists: true,
          agent: {
            agentId: 'researcher',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            defaultService: 'chatgpt',
            exists: true,
          },
          runtimeProfileId: 'default',
          runtimeProfile: {
            browserProfile: 'default',
            defaultService: 'chatgpt',
          },
          browserProfileId: 'default',
          browserProfile: {
            chromePath: '/chrome/default',
          },
          defaultService: 'chatgpt',
        },
        {
          agentId: 'missing-agent',
          exists: false,
          agent: {
            agentId: 'missing-agent',
            runtimeProfileId: null,
            browserProfileId: null,
            defaultService: null,
            exists: false,
          },
          runtimeProfileId: null,
          runtimeProfile: null,
          browserProfileId: null,
          browserProfile: null,
          defaultService: null,
        },
        {
          agentId: 'analyst',
          exists: true,
          agent: {
            agentId: 'analyst',
            runtimeProfileId: 'work',
            browserProfileId: 'consulting',
            defaultService: 'grok',
            exists: true,
          },
          runtimeProfileId: 'work',
          runtimeProfile: {
            browserProfile: 'consulting',
            defaultService: 'grok',
          },
          browserProfileId: 'consulting',
          browserProfile: {
            chromePath: '/chrome/consulting',
          },
          defaultService: 'grok',
        },
      ],
      exists: true,
    });
    expect(resolveTeamRuntimeSelections(config, 'missing-team')).toEqual({
      teamId: 'missing-team',
      agentIds: [],
      members: [],
      exists: false,
    });
  });

  it('resolves one shared runtime selection bundle for explicit agent-aware runtime use', () => {
    const config = {
      defaultRuntimeProfile: 'default',
      browserProfiles: {
        default: { chromePath: '/chrome/default' },
        consulting: { chromePath: '/chrome/consulting' },
      },
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
        work: { browserProfile: 'consulting', defaultService: 'grok' },
      },
      agents: {
        analyst: { runtimeProfile: 'work' },
      },
    };

    expect(resolveRuntimeSelection(config, { explicitAgentId: 'analyst' })).toEqual({
      agent: {
        agentId: 'analyst',
        runtimeProfileId: 'work',
        browserProfileId: 'consulting',
        defaultService: 'grok',
        exists: true,
      },
      runtimeProfileId: 'work',
      runtimeProfile: {
        browserProfile: 'consulting',
        defaultService: 'grok',
      },
      browserProfileId: 'consulting',
      browserProfile: {
        chromePath: '/chrome/consulting',
      },
      defaultService: 'grok',
    });
    expect(
      resolveRuntimeSelection(config, {
        explicitProfileName: 'default',
        explicitAgentId: 'analyst',
      }),
    ).toMatchObject({
      agent: {
        agentId: 'analyst',
        runtimeProfileId: 'work',
        browserProfileId: 'consulting',
        defaultService: 'grok',
        exists: true,
      },
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      defaultService: 'chatgpt',
    });
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

  it('prefers defaultRuntimeProfile over auracallProfile for top-level target-shape selection', () => {
    const config = {
      defaultRuntimeProfile: 'work',
      auracallProfile: 'legacy',
      runtimeProfiles: {
        work: { browserProfile: 'default', defaultService: 'chatgpt' },
      },
      auracallProfiles: {
        legacy: { defaultService: 'grok' },
      },
    };

    expect(getActiveRuntimeProfileName(config)).toBe('work');
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

  it('can resolve the preferred runtime profile from an explicit agent selection', () => {
    const config = {
      defaultRuntimeProfile: 'default',
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
        work: { browserProfile: 'consulting', defaultService: 'grok' },
      },
      agents: {
        analyst: { runtimeProfile: 'work' },
      },
    };

    expect(getPreferredRuntimeProfileName(config, { explicitAgentId: 'analyst' })).toBe('work');
    expect(getPreferredRuntimeProfile(config, { explicitAgentId: 'analyst' })).toEqual({
      browserProfile: 'consulting',
      defaultService: 'grok',
    });
  });

  it('keeps explicit runtime profile selection above explicit agent selection', () => {
    const config = {
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
        work: { browserProfile: 'consulting', defaultService: 'grok' },
      },
      agents: {
        analyst: { runtimeProfile: 'work' },
      },
    };

    expect(
      getPreferredRuntimeProfileName(config, {
        explicitProfileName: 'default',
        explicitAgentId: 'analyst',
      }),
    ).toBe('default');
  });

  it('makes selector precedence explicit without letting team selection affect runtime resolution', () => {
    expect(resolveRuntimeSelectionPolicy()).toEqual({
      runtimeSelectorPrecedence: ['profile', 'agent', 'config'],
      planningOnlySelectors: ['team'],
      activeRuntimeSelector: 'config',
      teamSelectionAffectsRuntime: false,
    });
    expect(resolveRuntimeSelectionPolicy({ explicitAgentId: 'analyst', explicitTeamId: 'ops' })).toEqual({
      runtimeSelectorPrecedence: ['profile', 'agent', 'config'],
      planningOnlySelectors: ['team'],
      activeRuntimeSelector: 'agent',
      teamSelectionAffectsRuntime: false,
    });
    expect(
      resolveRuntimeSelectionPolicy({
        explicitProfileName: 'default',
        explicitAgentId: 'analyst',
        explicitTeamId: 'ops',
      }),
    ).toEqual({
      runtimeSelectorPrecedence: ['profile', 'agent', 'config'],
      planningOnlySelectors: ['team'],
      activeRuntimeSelector: 'profile',
      teamSelectionAffectsRuntime: false,
    });
  });

  it('projects the target config model from bridge-key config', () => {
    const config = {
      auracallProfile: 'work',
      browserFamilies: {
        default: { chromePath: '/usr/bin/google-chrome' },
        'wsl-chrome-2': { chromePath: '/usr/bin/google-chrome' },
      },
      profiles: {
        default: { browserFamily: 'default', defaultService: 'chatgpt' },
        work: { browserFamily: 'wsl-chrome-2', defaultService: 'grok' },
      },
    };

    expect(projectConfigModel(config)).toEqual({
      activeRuntimeProfileId: 'work',
      activeBrowserProfileId: 'wsl-chrome-2',
      browserProfiles: [{ id: 'default' }, { id: 'wsl-chrome-2' }],
      runtimeProfiles: [
        { id: 'default', browserProfileId: 'default', defaultService: 'chatgpt' },
        { id: 'work', browserProfileId: 'wsl-chrome-2', defaultService: 'grok' },
      ],
      agents: [],
      teams: [],
    });
  });

  it('builds a shared inspection view for read-only config surfaces', () => {
    const config = {
      auracallProfile: 'work',
      browserFamilies: {
        default: { chromePath: '/usr/bin/google-chrome' },
        'wsl-chrome-2': { chromePath: '/usr/bin/google-chrome' },
      },
      profiles: {
        default: { browserFamily: 'default', defaultService: 'chatgpt' },
        work: { browserFamily: 'wsl-chrome-2', defaultService: 'grok' },
      },
    };

    expect(inspectConfigModel(config)).toEqual({
      activeRuntimeProfileId: 'work',
      activeBrowserProfileId: 'wsl-chrome-2',
      activeDefaultService: 'grok',
      browserProfileIds: ['default', 'wsl-chrome-2'],
      runtimeProfiles: [
        { id: 'default', browserProfileId: 'default', defaultService: 'chatgpt' },
        { id: 'work', browserProfileId: 'wsl-chrome-2', defaultService: 'grok' },
      ],
      agentIds: [],
      teamIds: [],
      legacyRuntimeProfileIds: [],
      targetState: {
        browserProfilesPresent: false,
        runtimeProfilesPresent: false,
      },
      bridgeState: {
        browserProfilesPresent: true,
        auracallRuntimeProfilesPresent: true,
        legacyRuntimeProfilesPresent: false,
      },
      bridgeKeys: CONFIG_MODEL_BRIDGE_KEYS,
      projectedModel: {
        activeRuntimeProfileId: 'work',
        activeBrowserProfileId: 'wsl-chrome-2',
        browserProfiles: [{ id: 'default' }, { id: 'wsl-chrome-2' }],
        runtimeProfiles: [
          { id: 'default', browserProfileId: 'default', defaultService: 'chatgpt' },
          { id: 'work', browserProfileId: 'wsl-chrome-2', defaultService: 'grok' },
        ],
        agents: [],
        teams: [],
      },
    });
  });

  it('analyzes bridge-health from the shared config model seam', () => {
    const config = {
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
    };

    expect(analyzeConfigModelBridgeHealth(config, { explicitProfileName: 'default' })).toEqual({
      ok: false,
      activeAuracallRuntimeProfile: 'default',
      activeBrowserProfile: null,
      targetState: {
        browserProfilesPresent: false,
        runtimeProfilesPresent: false,
      },
      precedence: {
        browserProfiles: 'bridge',
        runtimeProfiles: 'bridge',
        runtimeProfileBrowserProfileReference: 'bridge',
      },
      issueCount: 5,
      issues: expect.arrayContaining([
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
    });
  });

  it('reports missing reserved agent and team references through the shared doctor seam', () => {
    const config = {
      defaultRuntimeProfile: 'default',
      browserProfiles: {
        default: {},
      },
      runtimeProfiles: {
        default: {
          browserProfile: 'default',
          defaultService: 'chatgpt',
        },
      },
      agents: {
        researcher: {},
        analyst: { runtimeProfile: 'missing-runtime' },
      },
      teams: {
        ops: { agents: ['researcher', 'missing-agent'] },
      },
    };

    expect(analyzeConfigModelBridgeHealth(config, { explicitProfileName: 'default' })).toEqual({
      ok: false,
      activeAuracallRuntimeProfile: 'default',
      activeBrowserProfile: 'default',
      targetState: {
        browserProfilesPresent: true,
        runtimeProfilesPresent: true,
      },
      precedence: {
        browserProfiles: 'target',
        runtimeProfiles: 'target',
        runtimeProfileBrowserProfileReference: 'target',
      },
      issueCount: 3,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'agent-missing-runtime-profile',
          severity: 'warning',
          agent: 'researcher',
        }),
        expect.objectContaining({
          code: 'agent-runtime-profile-missing',
          severity: 'warning',
          agent: 'analyst',
          auracallRuntimeProfile: 'missing-runtime',
        }),
        expect.objectContaining({
          code: 'team-agent-missing',
          severity: 'warning',
          team: 'ops',
          agent: 'missing-agent',
        }),
      ]),
    });
  });

  it('reports mixed-key and conflicting dual-read diagnostics when target and bridge definitions disagree', () => {
    const config = {
      auracallProfile: 'default',
      browserFamilies: {
        default: { chromePath: '/bridge/chrome' },
      },
      browserProfiles: {
        default: { chromePath: '/target/chrome' },
      },
      profiles: {
        default: {
          browserFamily: 'bridge-default',
          defaultService: 'chatgpt',
        },
      },
      runtimeProfiles: {
        default: {
          browserProfile: 'target-default',
          browserFamily: 'bridge-default',
          defaultService: 'grok',
        },
      },
    };

    expect(analyzeConfigModelBridgeHealth(config, { explicitProfileName: 'default' })).toEqual({
      ok: false,
      activeAuracallRuntimeProfile: 'default',
      activeBrowserProfile: 'target-default',
      targetState: {
        browserProfilesPresent: true,
        runtimeProfilesPresent: true,
      },
      precedence: {
        browserProfiles: 'target',
        runtimeProfiles: 'target',
        runtimeProfileBrowserProfileReference: 'target',
      },
      issueCount: 7,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'mixed-browser-profile-keys',
          severity: 'info',
        }),
        expect.objectContaining({
          code: 'conflicting-browser-profile-definitions',
          severity: 'warning',
          browserProfile: 'default',
        }),
        expect.objectContaining({
          code: 'mixed-runtime-profile-keys',
          severity: 'info',
        }),
        expect.objectContaining({
          code: 'conflicting-runtime-profile-definitions',
          severity: 'warning',
          auracallRuntimeProfile: 'default',
        }),
        expect.objectContaining({
          code: 'mixed-runtime-profile-browser-reference',
          severity: 'warning',
          auracallRuntimeProfile: 'default',
          browserProfile: 'target-default',
        }),
        expect.objectContaining({
          code: 'runtime-profile-browser-profile-missing',
          severity: 'warning',
          auracallRuntimeProfile: 'default',
          browserProfile: 'target-default',
        }),
        expect.objectContaining({
          code: 'unused-browser-profile',
          severity: 'info',
          browserProfile: 'default',
        }),
      ]),
    });
  });

  it('warns when a runtime profile still carries browser-owned override fields', () => {
    const config = {
      defaultRuntimeProfile: 'default',
      browserProfiles: {
        default: { chromePath: '/usr/bin/google-chrome' },
      },
      runtimeProfiles: {
        default: {
          browserProfile: 'default',
          defaultService: 'chatgpt',
          keepBrowser: true,
          browser: {
            chromePath: '/custom/chrome',
            display: ':0.0',
          },
        },
      },
    };

    expect(analyzeConfigModelBridgeHealth(config, { explicitProfileName: 'default' })).toEqual({
      ok: false,
      activeAuracallRuntimeProfile: 'default',
      activeBrowserProfile: 'default',
      targetState: {
        browserProfilesPresent: true,
        runtimeProfilesPresent: true,
      },
      precedence: {
        browserProfiles: 'target',
        runtimeProfiles: 'target',
        runtimeProfileBrowserProfileReference: 'target',
      },
      issueCount: 1,
      issues: [
        expect.objectContaining({
          code: 'runtime-profile-browser-owned-overrides-present',
          severity: 'warning',
          auracallRuntimeProfile: 'default',
          message:
            'AuraCall runtime profile "default" still defines browser-owned override fields (browser.chromePath, browser.display, keepBrowser); move them to the referenced browser profile unless this is an intentional advanced escape hatch.',
        }),
      ],
    });
  });

  it('surfaces relocatable service-scoped fields separately from managed-profile escape hatches', () => {
    const config = {
      defaultRuntimeProfile: 'default',
      browserProfiles: {
        default: { chromePath: '/usr/bin/google-chrome' },
      },
      runtimeProfiles: {
        default: {
          browserProfile: 'default',
          defaultService: 'chatgpt',
          browser: {
            manualLogin: true,
            manualLoginProfileDir: '/tmp/managed/chatgpt',
            modelStrategy: 'current',
            thinkingTime: 'extended',
          },
        },
      },
    };

    expect(analyzeConfigModelBridgeHealth(config, { explicitProfileName: 'default' })).toEqual({
      ok: true,
      activeAuracallRuntimeProfile: 'default',
      activeBrowserProfile: 'default',
      targetState: {
        browserProfilesPresent: true,
        runtimeProfilesPresent: true,
      },
      precedence: {
        browserProfiles: 'target',
        runtimeProfiles: 'target',
        runtimeProfileBrowserProfileReference: 'target',
      },
      issueCount: 2,
      issues: [
        expect.objectContaining({
          code: 'runtime-profile-service-scoped-overrides-relocatable-present',
          severity: 'info',
          auracallRuntimeProfile: 'default',
          message:
            'AuraCall runtime profile "default" still defines relocatable service-scoped browser overrides (browser.modelStrategy, browser.thinkingTime); prefer runtimeProfiles.<name>.services.chatgpt, and keep runtimeProfiles.<name>.browser for non-service escape hatches only.',
        }),
        expect.objectContaining({
          code: 'runtime-profile-service-scoped-escape-hatches-present',
          severity: 'info',
          auracallRuntimeProfile: 'default',
          message:
            'AuraCall runtime profile "default" still defines service-scoped browser escape hatches (browser.manualLogin, browser.manualLoginProfileDir); keep them only when the managed-profile/account coupling is intentional, and do not auto-relocate them casually.',
        }),
      ],
    });
  });

  it('surfaces service-scoped overrides when they are misplaced on a browser profile', () => {
    const config = {
      defaultRuntimeProfile: 'default',
      browserProfiles: {
        default: {
          chromePath: '/usr/bin/google-chrome',
          modelStrategy: 'current',
          thinkingTime: 'extended',
        },
      },
      runtimeProfiles: {
        default: {
          browserProfile: 'default',
          defaultService: 'chatgpt',
        },
      },
    };

    expect(analyzeConfigModelBridgeHealth(config, { explicitProfileName: 'default' })).toEqual({
      ok: true,
      activeAuracallRuntimeProfile: 'default',
      activeBrowserProfile: 'default',
      targetState: {
        browserProfilesPresent: true,
        runtimeProfilesPresent: true,
      },
      precedence: {
        browserProfiles: 'target',
        runtimeProfiles: 'target',
        runtimeProfileBrowserProfileReference: 'target',
      },
      issueCount: 1,
      issues: [
        expect.objectContaining({
          code: 'browser-profile-service-scoped-overrides-present',
          severity: 'info',
          browserProfile: 'default',
          message:
            'Browser profile "default" still defines service-scoped overrides (modelStrategy, thinkingTime); keep browser profiles focused on browser/account-family state and move service defaults to runtimeProfiles.<name>.services.<service> instead.',
        }),
      ],
    });
  });

  it('surfaces redundant default-equivalent manualLoginProfileDir overrides', () => {
    const config = {
      defaultRuntimeProfile: 'default',
      browserProfiles: {
        default: {
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
      },
      runtimeProfiles: {
        default: {
          browserProfile: 'default',
          defaultService: 'chatgpt',
          browser: {
            manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
          },
          services: {
            grok: {
              manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/grok',
            },
          },
        },
      },
    };

    expect(analyzeConfigModelBridgeHealth(config, { explicitProfileName: 'default' })).toEqual({
      ok: true,
      activeAuracallRuntimeProfile: 'default',
      activeBrowserProfile: 'default',
      targetState: {
        browserProfilesPresent: true,
        runtimeProfilesPresent: true,
      },
      precedence: {
        browserProfiles: 'target',
        runtimeProfiles: 'target',
        runtimeProfileBrowserProfileReference: 'target',
      },
      issueCount: 2,
      issues: [
        expect.objectContaining({
          code: 'runtime-profile-service-scoped-escape-hatches-present',
          severity: 'info',
          auracallRuntimeProfile: 'default',
        }),
        expect.objectContaining({
          code: 'runtime-profile-manual-login-profile-dir-redundant',
          severity: 'info',
          auracallRuntimeProfile: 'default',
          message:
            'AuraCall runtime profile "default" still defines default-equivalent managed profile paths (browser.manualLoginProfileDir (chatgpt), services.grok.manualLoginProfileDir); remove them unless you intend a real external managed-profile override.',
        }),
      ],
    });
  });

  it('surfaces redundant default-equivalent runtime-profile service overrides', () => {
    const config = {
      defaultRuntimeProfile: 'default',
      browserProfiles: {
        default: { chromePath: '/usr/bin/google-chrome' },
      },
      services: {
        chatgpt: {
          modelStrategy: 'current',
          thinkingTime: 'extended',
        },
      },
      runtimeProfiles: {
        default: {
          browserProfile: 'default',
          defaultService: 'chatgpt',
          services: {
            chatgpt: {
              modelStrategy: 'current',
              thinkingTime: 'extended',
              composerTool: 'canvas',
            },
          },
        },
      },
    };

    expect(analyzeConfigModelBridgeHealth(config, { explicitProfileName: 'default' })).toEqual({
      ok: true,
      activeAuracallRuntimeProfile: 'default',
      activeBrowserProfile: 'default',
      targetState: {
        browserProfilesPresent: true,
        runtimeProfilesPresent: true,
      },
      precedence: {
        browserProfiles: 'target',
        runtimeProfiles: 'target',
        runtimeProfileBrowserProfileReference: 'target',
      },
      issueCount: 1,
      issues: [
        expect.objectContaining({
          code: 'runtime-profile-service-defaults-redundant',
          severity: 'info',
          auracallRuntimeProfile: 'default',
          message:
            'AuraCall runtime profile "default" still defines default-equivalent service overrides (services.chatgpt.modelStrategy, services.chatgpt.thinkingTime); remove them unless this runtime profile intentionally diverges from inherited service defaults.',
        }),
      ],
    });
  });
});
