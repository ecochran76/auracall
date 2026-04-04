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
  resolveConfigDoctorExitCode,
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
      selectorKeys: {
        target: 'defaultRuntimeProfile',
        compatibility: 'auracallProfile',
        targetPresent: false,
        compatibilityPresent: false,
      },
      selectionPolicy: {
        runtimeSelectorPrecedence: ['profile', 'agent', 'config'],
        planningOnlySelectors: ['team'],
        activeRuntimeSelector: 'config',
        teamSelectionAffectsRuntime: false,
      },
      active: {
        agent: null,
        auracallRuntimeProfile: 'work',
        browserProfile: 'wsl-chrome-2',
        defaultService: 'grok',
        resolvedBrowserTarget: 'grok',
      },
      available: {
        browserProfiles: ['default', 'wsl-chrome-2'],
        auracallRuntimeProfiles: ['default', 'work'],
        agents: [],
        teams: [],
        legacyRuntimeProfiles: [],
      },
      resolvedAgents: [],
      resolvedTeams: [],
      selectedTeam: null,
      bridgeKeys: {
        browserProfiles: 'browserFamilies',
        auracallRuntimeProfiles: 'profiles',
        runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily',
      },
      targetKeys: {
        browserProfiles: 'browserProfiles',
        auracallRuntimeProfiles: 'runtimeProfiles',
        runtimeProfileBrowserProfile: 'runtimeProfiles.<name>.browserProfile',
      },
      targetState: {
        browserProfilesPresent: false,
        runtimeProfilesPresent: false,
      },
      bridgeState: {
        browserProfilesPresent: true,
        auracallRuntimeProfilesPresent: true,
        legacyRuntimeProfilesPresent: false,
      },
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
      plannedTeamRun: null,
    });
  });

  it('formats a readable summary including bridge-key presence', () => {
    const text = formatConfigShowReport({
      configPath: '/tmp/config.json',
      loaded: true,
      selectorKeys: {
        target: 'defaultRuntimeProfile',
        compatibility: 'auracallProfile',
        targetPresent: false,
        compatibilityPresent: false,
      },
      selectionPolicy: {
        runtimeSelectorPrecedence: ['profile', 'agent', 'config'],
        planningOnlySelectors: ['team'],
        activeRuntimeSelector: 'config',
        teamSelectionAffectsRuntime: false,
      },
      active: {
        agent: null,
        auracallRuntimeProfile: 'default',
        browserProfile: 'default',
        defaultService: 'chatgpt',
        resolvedBrowserTarget: 'chatgpt',
      },
      available: {
        browserProfiles: ['default'],
        auracallRuntimeProfiles: ['default'],
        agents: [],
        teams: [],
        legacyRuntimeProfiles: [],
      },
      resolvedAgents: [],
      resolvedTeams: [],
      selectedTeam: null,
      bridgeKeys: {
        browserProfiles: 'browserFamilies',
        auracallRuntimeProfiles: 'profiles',
        runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily',
      },
      targetKeys: {
        browserProfiles: 'browserProfiles',
        auracallRuntimeProfiles: 'runtimeProfiles',
        runtimeProfileBrowserProfile: 'runtimeProfiles.<name>.browserProfile',
      },
      targetState: {
        browserProfilesPresent: false,
        runtimeProfilesPresent: false,
      },
      bridgeState: {
        browserProfilesPresent: true,
        auracallRuntimeProfilesPresent: true,
        legacyRuntimeProfilesPresent: false,
      },
      projectedModel: {
        activeRuntimeProfileId: 'default',
        activeBrowserProfileId: 'default',
        browserProfiles: [{ id: 'default' }],
        runtimeProfiles: [{ id: 'default', browserProfileId: 'default', defaultService: 'chatgpt' }],
        agents: [],
        teams: [],
      },
      plannedTeamRun: null,
    });

    expect(text).toContain('AuraCall runtime profile: default');
    expect(text).toContain('Selected agent: (none)');
    expect(text).toContain('Selected team: (none)');
    expect(text).toContain('Browser profile: default');
    expect(text).toContain('Runtime profile selector -> defaultRuntimeProfile (missing)');
    expect(text).toContain('Compatibility selector -> auracallProfile (missing)');
    expect(text).toContain('Selector precedence: runtime uses profile > agent > config; team is planning-only');
    expect(text).toContain('Active runtime selector: config');
    expect(text).toContain('Available agents: (none)');
    expect(text).toContain('Available teams: (none)');
    expect(text).toContain('Resolved agents: (none)');
    expect(text).toContain('Resolved teams: (none)');
    expect(text).toContain('Selected team runtime plan: (none)');
    expect(text).toContain('Planned team run: (none)');
    expect(text).toContain('browser profiles -> browserProfiles (missing)');
    expect(text).toContain('AuraCall runtime profiles -> runtimeProfiles (missing)');
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

  it('surfaces resolved agents directly in config show output', () => {
    const report = buildConfigShowReport({
      rawConfig: {
        defaultRuntimeProfile: 'default',
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
      },
      resolvedConfig: {
        auracallProfile: 'default',
        browser: { target: 'chatgpt' },
      } as never,
      configPath: '/tmp/config.json',
      loaded: true,
      explicitAgentId: 'analyst',
    });

    expect(report.selectionPolicy).toEqual({
      runtimeSelectorPrecedence: ['profile', 'agent', 'config'],
      planningOnlySelectors: ['team'],
      activeRuntimeSelector: 'agent',
      teamSelectionAffectsRuntime: false,
    });
    expect(report.active.agent).toEqual({
      agentId: 'analyst',
      runtimeProfileId: 'work',
      browserProfileId: 'consulting',
      defaultService: 'grok',
      exists: true,
    });
    expect(report.resolvedAgents).toEqual([
      {
        agentId: 'analyst',
        runtimeProfileId: 'work',
        browserProfileId: 'consulting',
        defaultService: 'grok',
        exists: true,
      },
      {
        agentId: 'researcher',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        defaultService: 'chatgpt',
        exists: true,
      },
    ]);
    expect(report.resolvedTeams).toEqual([]);
    expect(report.selectedTeam).toBeNull();
    expect(report.plannedTeamRun).toBeNull();

    const text = formatConfigShowReport(report);
    expect(text).toContain('Active runtime selector: agent');
    expect(text).toContain('Selected agent: analyst -> resolved');
    expect(text).toContain('Resolved agents:');
    expect(text).toContain('- analyst -> resolved -> runtime profile work -> browser profile consulting -> default service grok');
    expect(text).toContain('- researcher -> resolved -> runtime profile default -> browser profile default -> default service chatgpt');
    expect(text).toContain('Resolved teams: (none)');
    expect(text).toContain('Selected team: (none)');
    expect(text).toContain('Selected team runtime plan: (none)');
    expect(text).toContain('Planned team run: (none)');
  });

  it('surfaces resolved teams directly in config show output', () => {
    const report = buildConfigShowReport({
      rawConfig: {
        defaultRuntimeProfile: 'default',
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
      },
      resolvedConfig: {
        auracallProfile: 'default',
        browser: { target: 'chatgpt' },
      } as never,
      configPath: '/tmp/config.json',
      loaded: true,
    });

    expect(report.resolvedTeams).toEqual([
      {
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
      },
    ]);
    expect(report.selectedTeam).toBeNull();
    expect(report.plannedTeamRun).toBeNull();

    const text = formatConfigShowReport(report);
    expect(text).toContain('Resolved teams:');
    expect(text).toContain('- ops -> resolved -> agents researcher, missing-agent, analyst');
    expect(text).toContain('member researcher -> resolved -> runtime profile default -> browser profile default -> default service chatgpt');
    expect(text).toContain('member missing-agent -> missing -> runtime profile (none) -> browser profile (none) -> default service (none)');
    expect(text).toContain('member analyst -> resolved -> runtime profile work -> browser profile consulting -> default service grok');
    expect(text).toContain('Selected team: (none)');
    expect(text).toContain('Selected team runtime plan: (none)');
    expect(text).toContain('Planned team run: (none)');
  });

  it('surfaces selected team planning without changing the active runtime selection', () => {
    const report = buildConfigShowReport({
      rawConfig: {
        defaultRuntimeProfile: 'default',
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
      },
      resolvedConfig: {
        auracallProfile: 'default',
        browser: { target: 'chatgpt' },
      } as never,
      configPath: '/tmp/config.json',
      loaded: true,
      explicitTeamId: 'ops',
    });

    expect(report.active.auracallRuntimeProfile).toBe('default');
    expect(report.active.browserProfile).toBe('default');
    expect(report.selectionPolicy).toEqual({
      runtimeSelectorPrecedence: ['profile', 'agent', 'config'],
      planningOnlySelectors: ['team'],
      activeRuntimeSelector: 'config',
      teamSelectionAffectsRuntime: false,
    });
    expect(report.selectedTeam).toEqual({
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
      runtimeMembers: [
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
    expect(report.plannedTeamRun).toEqual({
      teamRun: {
        id: 'plan:ops',
        teamId: 'ops',
        status: 'planned',
        trigger: 'internal',
        stepIds: ['plan:ops:step:1', 'plan:ops:step:2', 'plan:ops:step:3'],
      },
      steps: [
        {
          id: 'plan:ops:step:1',
          agentId: 'researcher',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          status: 'planned',
          order: 1,
          dependsOnStepIds: [],
        },
        {
          id: 'plan:ops:step:2',
          agentId: 'missing-agent',
          runtimeProfileId: null,
          browserProfileId: null,
          service: null,
          status: 'blocked',
          order: 2,
          dependsOnStepIds: ['plan:ops:step:1'],
        },
        {
          id: 'plan:ops:step:3',
          agentId: 'analyst',
          runtimeProfileId: 'work',
          browserProfileId: 'consulting',
          service: 'grok',
          status: 'planned',
          order: 3,
          dependsOnStepIds: ['plan:ops:step:2'],
        },
      ],
      sharedState: {
        id: 'plan:ops:state',
        status: 'active',
        historyCount: 0,
      },
    });

    const text = formatConfigShowReport(report);
    expect(text).toContain('Active runtime selector: config');
    expect(text).toContain('Selected team: ops -> resolved (planning-only)');
    expect(text).toContain('Selected team runtime plan:');
    expect(text).toContain('- ops -> resolved -> agents researcher, missing-agent, analyst');
    expect(text).toContain('member missing-agent -> missing -> runtime profile (none) -> browser profile (none) -> default service (none)');
    expect(text).toContain('Planned team run:');
    expect(text).toContain('plan:ops -> team ops -> status planned -> trigger internal');
    expect(text).toContain('step plan:ops:step:2 -> agent missing-agent -> status blocked -> runtime profile (none) -> browser profile (none) -> default service (none) -> depends on plan:ops:step:1');
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
      agents: [],
      teams: [],
      bridgeKeys: {
        browserProfiles: 'browserFamilies',
        auracallRuntimeProfiles: 'profiles',
        runtimeProfileBrowserProfile: 'profiles.<name>.browserFamily',
      },
      projectedModel: {
        activeRuntimeProfileId: 'work',
        activeBrowserProfileId: 'wsl-chrome-2',
        browserProfiles: [{ id: 'default' }, { id: 'wsl-chrome-2' }],
        runtimeProfiles: [
          {
            id: 'default',
            browserProfileId: 'default',
            defaultService: 'chatgpt',
          },
          {
            id: 'work',
            browserProfileId: 'wsl-chrome-2',
            defaultService: 'grok',
          },
        ],
        agents: [],
        teams: [],
      },
    });

    const text = formatProfileListReport(report);
    expect(text).toContain('Active AuraCall runtime profile: work');
    expect(text).toContain('Available browser profiles: default, wsl-chrome-2');
    expect(text).toContain('- default -> browser profile default -> default service chatgpt');
    expect(text).toContain('* work -> browser profile wsl-chrome-2 -> default service grok');
    expect(text).toContain('Agents: (none)');
    expect(text).toContain('Teams: (none)');
  });

  it('surfaces projected agents and teams directly in the inventory report', () => {
    const report = buildProfileListReport(
      {
        defaultRuntimeProfile: 'default',
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
      },
      { explicitProfileName: 'default' },
    );

    expect(report.agents).toEqual([
      {
        name: 'analyst',
        runtimeProfile: 'work',
        browserProfile: 'consulting',
        defaultService: 'grok',
      },
      {
        name: 'researcher',
        runtimeProfile: 'default',
        browserProfile: 'default',
        defaultService: 'chatgpt',
      },
    ]);
    expect(report.teams).toEqual([
      {
        name: 'ops',
        agents: ['researcher', 'analyst'],
        members: [
          {
            agent: 'researcher',
            exists: true,
            runtimeProfile: 'default',
            browserProfile: 'default',
            defaultService: 'chatgpt',
          },
          {
            agent: 'analyst',
            exists: true,
            runtimeProfile: 'work',
            browserProfile: 'consulting',
            defaultService: 'grok',
          },
        ],
      },
    ]);

    const text = formatProfileListReport(report);
    expect(text).toContain('Agents:');
    expect(text).toContain('- analyst -> runtime profile work -> browser profile consulting -> default service grok');
    expect(text).toContain('- researcher -> runtime profile default -> browser profile default -> default service chatgpt');
    expect(text).toContain('Teams:');
    expect(text).toContain('- ops -> agents researcher, analyst');
    expect(text).toContain('member researcher -> resolved -> runtime profile default -> browser profile default -> default service chatgpt');
    expect(text).toContain('member analyst -> resolved -> runtime profile work -> browser profile consulting -> default service grok');
  });

  it('shows unresolved team members explicitly in the inventory report', () => {
    const report = buildProfileListReport(
      {
        defaultRuntimeProfile: 'default',
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
      },
      { explicitProfileName: 'default' },
    );

    expect(report.teams).toEqual([
      {
        name: 'ops',
        agents: ['researcher', 'missing-agent'],
        members: [
          {
            agent: 'researcher',
            exists: true,
            runtimeProfile: 'default',
            browserProfile: 'default',
            defaultService: 'chatgpt',
          },
          {
            agent: 'missing-agent',
            exists: false,
            runtimeProfile: null,
            browserProfile: null,
            defaultService: null,
          },
        ],
      },
    ]);

    const text = formatProfileListReport(report);
    expect(text).toContain('member missing-agent -> missing -> runtime profile (none) -> browser profile (none) -> default service (none)');
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
    expect(report.selectorKeys).toEqual({
      target: 'defaultRuntimeProfile',
      compatibility: 'auracallProfile',
      targetPresent: false,
      compatibilityPresent: true,
    });
    expect(report.selectionPolicy).toEqual({
      runtimeSelectorPrecedence: ['profile', 'agent', 'config'],
      planningOnlySelectors: ['team'],
      activeRuntimeSelector: 'profile',
      teamSelectionAffectsRuntime: false,
    });
    expect(report.selectedAgent).toBeNull();
    expect(report.selectedTeam).toBeNull();
    expect(report.plannedTeamRun).toBeNull();
    expect(report.targetState).toEqual({
      browserProfilesPresent: false,
      runtimeProfilesPresent: false,
    });
    expect(report.precedence).toEqual({
      browserProfiles: 'bridge',
      runtimeProfiles: 'bridge',
      runtimeProfileBrowserProfileReference: 'bridge',
    });
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
    expect(text).toContain('Selected agent: (none)');
    expect(text).toContain('Selected team: (none)');
    expect(text).toContain('Runtime profile selector -> defaultRuntimeProfile (missing)');
    expect(text).toContain('Compatibility selector -> auracallProfile (present)');
    expect(text).toContain('Selector precedence: runtime uses profile > agent > config; team is planning-only');
    expect(text).toContain('Active runtime selector: profile');
    expect(text).toContain('Active AuraCall runtime profile: default');
    expect(text).toContain('Active browser profile: (none)');
    expect(text).toContain('Target browserProfiles present: no');
    expect(text).toContain('Target runtimeProfiles present: no');
    expect(text).toContain('Precedence: browser profiles=bridge, runtime profiles=bridge, runtime->browser reference=bridge');
    expect(text).toContain('Planned team run: (none)');
    expect(text).toContain('[warning] AuraCall runtime profile "default" does not explicitly reference a browser profile.');
    expect(text).toContain('[info] Browser profile "orphaned" is defined but no AuraCall runtime profile references it.');
  });

  it('surfaces reserved agent and team reference warnings in config doctor output', () => {
    const report = buildConfigDoctorReport(
      {
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
      },
      { explicitProfileName: 'default', explicitAgentId: 'researcher' },
    );

    expect(report.ok).toBe(false);
    expect(report.selectedAgent).toEqual({
      agentId: 'researcher',
      runtimeProfileId: null,
      browserProfileId: null,
      defaultService: null,
      exists: true,
    });
    expect(report.selectedTeam).toBeNull();
    expect(report.plannedTeamRun).toBeNull();
    expect(report.selectionPolicy).toEqual({
      runtimeSelectorPrecedence: ['profile', 'agent', 'config'],
      planningOnlySelectors: ['team'],
      activeRuntimeSelector: 'profile',
      teamSelectionAffectsRuntime: false,
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'agent-missing-runtime-profile',
          agent: 'researcher',
        }),
        expect.objectContaining({
          code: 'agent-runtime-profile-missing',
          agent: 'analyst',
          auracallRuntimeProfile: 'missing-runtime',
        }),
        expect.objectContaining({
          code: 'team-agent-missing',
          team: 'ops',
          agent: 'missing-agent',
        }),
      ]),
    );

    const text = formatConfigDoctorReport(report);
    expect(text).toContain('Selected agent: researcher -> resolved');
    expect(text).toContain('Selected team: (none)');
    expect(text).toContain('Active runtime selector: profile');
    expect(text).toContain('Planned team run: (none)');
    expect(text).toContain('[warning] Agent "researcher" does not explicitly reference an AuraCall runtime profile.');
    expect(text).toContain('[warning] Agent "analyst" references missing AuraCall runtime profile "missing-runtime".');
    expect(text).toContain('[warning] Team "ops" references missing agent "missing-agent".');
  });

  it('surfaces selected team planning in config doctor without enabling team execution semantics', () => {
    const report = buildConfigDoctorReport(
      {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
          consulting: {},
        },
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            defaultService: 'chatgpt',
          },
          work: {
            browserProfile: 'consulting',
            defaultService: 'grok',
          },
        },
        agents: {
          researcher: { runtimeProfile: 'default' },
          analyst: { runtimeProfile: 'work' },
        },
        teams: {
          ops: { agents: ['researcher', 'missing-agent', 'analyst'] },
        },
      },
      { explicitProfileName: 'default', explicitTeamId: 'ops' },
    );

    expect(report.selectedAgent).toBeNull();
    expect(report.selectionPolicy).toEqual({
      runtimeSelectorPrecedence: ['profile', 'agent', 'config'],
      planningOnlySelectors: ['team'],
      activeRuntimeSelector: 'profile',
      teamSelectionAffectsRuntime: false,
    });
    expect(report.selectedTeam).toEqual({
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
      runtimeMembers: [
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
    expect(report.plannedTeamRun).toEqual({
      teamRun: {
        id: 'plan:ops',
        teamId: 'ops',
        status: 'planned',
        trigger: 'internal',
        stepIds: ['plan:ops:step:1', 'plan:ops:step:2', 'plan:ops:step:3'],
      },
      steps: [
        {
          id: 'plan:ops:step:1',
          agentId: 'researcher',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          status: 'planned',
          order: 1,
          dependsOnStepIds: [],
        },
        {
          id: 'plan:ops:step:2',
          agentId: 'missing-agent',
          runtimeProfileId: null,
          browserProfileId: null,
          service: null,
          status: 'blocked',
          order: 2,
          dependsOnStepIds: ['plan:ops:step:1'],
        },
        {
          id: 'plan:ops:step:3',
          agentId: 'analyst',
          runtimeProfileId: 'work',
          browserProfileId: 'consulting',
          service: 'grok',
          status: 'planned',
          order: 3,
          dependsOnStepIds: ['plan:ops:step:2'],
        },
      ],
      sharedState: {
        id: 'plan:ops:state',
        status: 'active',
        historyCount: 0,
      },
    });

    const text = formatConfigDoctorReport(report);
    expect(text).toContain('Selected team: ops -> resolved (planning-only)');
    expect(text).toContain('Selected team runtime plan:');
    expect(text).toContain('- ops -> resolved -> agents researcher, missing-agent, analyst');
    expect(text).toContain('member analyst -> resolved -> runtime profile work -> browser profile consulting -> default service grok');
    expect(text).toContain('Planned team run:');
    expect(text).toContain('plan:ops -> team ops -> status planned -> trigger internal');
    expect(text).toContain('step plan:ops:step:2 -> agent missing-agent -> status blocked -> runtime profile (none) -> browser profile (none) -> default service (none) -> depends on plan:ops:step:1');
  });

  it('surfaces target-key presence and target precedence when target-shape keys are active', () => {
    const showReport = buildConfigShowReport({
      rawConfig: {
        defaultRuntimeProfile: 'work',
        browserProfiles: {
          work: {},
        },
        runtimeProfiles: {
          work: {
            browserProfile: 'work',
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

    expect(showReport.targetState).toEqual({
      browserProfilesPresent: true,
      runtimeProfilesPresent: true,
    });
    expect(showReport.selectorKeys).toEqual({
      target: 'defaultRuntimeProfile',
      compatibility: 'auracallProfile',
      targetPresent: true,
      compatibilityPresent: false,
    });
    expect(formatConfigShowReport(showReport)).toContain('Runtime profile selector -> defaultRuntimeProfile (present)');
    expect(formatConfigShowReport(showReport)).toContain('browser profiles -> browserProfiles (present)');

    const doctorReport = buildConfigDoctorReport(
      {
        defaultRuntimeProfile: 'work',
        browserProfiles: {
          work: {},
        },
        runtimeProfiles: {
          work: {
            browserProfile: 'work',
            defaultService: 'grok',
          },
        },
      },
      { explicitProfileName: 'work' },
    );

    expect(doctorReport.targetState).toEqual({
      browserProfilesPresent: true,
      runtimeProfilesPresent: true,
    });
    expect(doctorReport.selectorKeys).toEqual({
      target: 'defaultRuntimeProfile',
      compatibility: 'auracallProfile',
      targetPresent: true,
      compatibilityPresent: false,
    });
    expect(doctorReport.precedence).toEqual({
      browserProfiles: 'target',
      runtimeProfiles: 'target',
      runtimeProfileBrowserProfileReference: 'target',
    });
    expect(doctorReport.plannedTeamRun).toBeNull();
    expect(formatConfigDoctorReport(doctorReport)).toContain(
      'Runtime profile selector -> defaultRuntimeProfile (present)',
    );
    expect(formatConfigDoctorReport(doctorReport)).toContain(
      'Precedence: browser profiles=target, runtime profiles=target, runtime->browser reference=target',
    );
    expect(formatConfigDoctorReport(doctorReport)).toContain('Planned team run: (none)');
  });

  it('returns a nonzero exit code only when strict mode is enabled and warnings are present', () => {
    const okReport = buildConfigDoctorReport({
      profiles: {
        default: {
          browserFamily: 'default',
          defaultService: 'chatgpt',
        },
      },
      browserFamilies: {
        default: {},
      },
    });
    const warningReport = buildConfigDoctorReport({
      profiles: {
        default: {
          defaultService: 'chatgpt',
        },
      },
    });

    expect(resolveConfigDoctorExitCode(okReport, { strict: false })).toBe(0);
    expect(resolveConfigDoctorExitCode(okReport, { strict: true })).toBe(0);
    expect(resolveConfigDoctorExitCode(warningReport, { strict: false })).toBe(0);
    expect(resolveConfigDoctorExitCode(warningReport, { strict: true })).toBe(1);
  });
});
