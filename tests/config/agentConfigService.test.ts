import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgentTeamConfigService } from '../../src/config/agentConfigService.js';
import { createAgentRegistryStore } from '../../src/config/agentRegistryStore.js';

describe('agent and team config service', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('upserts agents and teams into the writable user config and active config object', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-agent-config-service-'));
    cleanup.push(dir);
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        browserProfiles: { default: {} },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
      }),
      'utf8',
    );
    const activeConfig: Record<string, unknown> = {};
    const service = createAgentTeamConfigService({ configPath, activeConfig });

    const agentResult = await service.upsertAgent({
      id: 'researcher',
      config: {
        runtimeProfile: 'default',
        service: 'chatgpt',
        modelSelector: 'chatgpt:pro-extended',
        projectId: 'proj_123',
      },
    });
    const teamResult = await service.upsertTeam({
      id: 'ops',
      config: {
        agents: ['researcher'],
        instructions: 'Coordinate one configured agent.',
      },
    });

    const saved = JSON.parse(await fs.readFile(configPath, 'utf8')) as Record<string, unknown>;
    expect(saved).toMatchObject({
      agents: {
        researcher: {
          runtimeProfile: 'default',
          service: 'chatgpt',
          modelSelector: 'chatgpt:pro-extended',
          projectId: 'proj_123',
        },
      },
      teams: {
        ops: {
          agents: ['researcher'],
        },
      },
    });
    expect(activeConfig).toMatchObject(saved);
    expect(agentResult.agents).toEqual([
      expect.objectContaining({
        id: 'researcher',
        modelSelector: 'chatgpt:pro-extended',
        projectId: 'proj_123',
      }),
    ]);
    expect(teamResult.teams).toEqual([
      expect.objectContaining({
        id: 'ops',
        agentIds: ['researcher'],
      }),
    ]);
  });

  it('lists effective config and registry agents with source metadata and conflicts', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-agent-config-registry-service-'));
    cleanup.push(dir);
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        browserProfiles: { default: {} },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          pinned: {
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
        },
      }),
      'utf8',
    );
    const registryStore = createAgentRegistryStore({
      rootDir: dir,
      forceJsonFallbackForTest: true,
    });
    await registryStore.upsertAgent({
      id: 'worker',
      config: {
        runtimeProfile: 'default',
        service: 'gemini',
      },
    });
    await registryStore.upsertAgent({
      id: 'pinned',
      config: {
        runtimeProfile: 'default',
        service: 'grok',
      },
    });
    const service = createAgentTeamConfigService({ configPath, registryStore });

    const result = await service.list('agent');
    const effectiveConfig = await service.effectiveConfig();

    expect(result.registryPath).toBe(registryStore.dbPath);
    expect(result.agents).toEqual([
      expect.objectContaining({
        id: 'pinned',
        source: 'config',
        service: 'chatgpt',
      }),
      expect.objectContaining({
        id: 'worker',
        source: 'registry',
        revision: 1,
        service: 'gemini',
      }),
    ]);
    expect(result.conflicts).toEqual([
      {
        kind: 'agent',
        id: 'pinned',
        configSource: 'config',
        registrySource: 'registry',
        resolution: 'config-wins',
      },
    ]);
    expect(effectiveConfig.agents).toEqual({
      pinned: {
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
      worker: {
        runtimeProfile: 'default',
        service: 'gemini',
      },
    });
  });

  it('diagnoses registry overlays, disabled records, and scoped API keys without secrets', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-agent-config-diagnostics-'));
    cleanup.push(dir);
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        browserProfiles: { default: {} },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          pinned: {
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
        },
      }),
      'utf8',
    );
    const registryStore = createAgentRegistryStore({
      rootDir: dir,
      forceJsonFallbackForTest: true,
    });
    await registryStore.upsertAgent({
      id: 'worker',
      config: {
        runtimeProfile: 'default',
        service: 'gemini',
      },
    });
    await registryStore.upsertAgent({
      id: 'pinned',
      config: {
        runtimeProfile: 'default',
        service: 'grok',
      },
    });
    await registryStore.upsertAgent({
      id: 'disabled-worker',
      config: {
        runtimeProfile: 'default',
        service: 'grok',
      },
      enabled: false,
    });
    await registryStore.upsertTeam({
      id: 'ops',
      config: {
        agents: ['worker'],
      },
    });
    const service = createAgentTeamConfigService({ configPath, registryStore });

    const diagnostics = await service.diagnostics({
      apiKeys: [
        {
          id: 'ops-key',
          teams: ['ops'],
          agents: ['missing-agent'],
          runtimeProfiles: ['missing-profile'],
        },
      ],
    });

    expect(diagnostics).toMatchObject({
      object: 'auracall_agent_registry_diagnostics',
      ok: false,
      registryPath: registryStore.dbPath,
      metrics: {
        effectiveAgents: 2,
        effectiveTeams: 1,
        disabledRegistryAgents: 1,
        conflicts: 1,
        apiKeys: 1,
        warnings: 2,
      },
      disabledRegistryAgents: ['disabled-worker'],
      apiKeys: [
        expect.objectContaining({
          id: 'ops-key',
          scoped: true,
          hasSecret: true,
          effectiveAgents: ['worker'],
          missingAgents: ['missing-agent'],
          missingRuntimeProfiles: ['missing-profile'],
        }),
      ],
    });
    expect(diagnostics.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'registry-record-shadowed-by-config',
        id: 'pinned',
      }),
      expect.objectContaining({
        code: 'disabled-registry-agent',
        id: 'disabled-worker',
      }),
      expect.objectContaining({
        code: 'api-key-agent-scope-missing',
        keyId: 'ops-key',
        id: 'missing-agent',
      }),
    ]));
  });

  it('writes agents and teams to the registry when a registry store is configured', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-agent-config-registry-write-'));
    cleanup.push(dir);
    const configPath = path.join(dir, 'config.json');
    const initialConfig = {
      browserProfiles: { default: {} },
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
      },
    };
    await fs.writeFile(configPath, JSON.stringify(initialConfig), 'utf8');
    const registryStore = createAgentRegistryStore({
      rootDir: dir,
      forceJsonFallbackForTest: true,
    });
    const service = createAgentTeamConfigService({ configPath, registryStore });

    const agentResult = await service.upsertAgent({
      id: 'registry-agent',
      config: {
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
    });
    const teamResult = await service.upsertTeam({
      id: 'registry-team',
      config: {
        agents: ['registry-agent'],
      },
    });

    expect(agentResult).toMatchObject({
      mutationTarget: 'registry',
      agents: [
        expect.objectContaining({
          id: 'registry-agent',
          source: 'registry',
          revision: 1,
        }),
      ],
    });
    expect(teamResult).toMatchObject({
      mutationTarget: 'registry',
      teams: [
        expect.objectContaining({
          id: 'registry-team',
          source: 'registry',
          revision: 1,
        }),
      ],
    });
    expect(JSON.parse(await fs.readFile(configPath, 'utf8'))).toEqual(initialConfig);
  });

  it('exports and imports reviewable agent registry snapshots', async () => {
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-agent-config-snapshot-source-'));
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-agent-config-snapshot-target-'));
    cleanup.push(sourceDir, targetDir);
    const sourceConfigPath = path.join(sourceDir, 'config.json');
    const targetConfigPath = path.join(targetDir, 'config.json');
    const baseConfig = {
      browserProfiles: { default: {} },
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
      },
    };
    await fs.writeFile(sourceConfigPath, JSON.stringify(baseConfig), 'utf8');
    await fs.writeFile(targetConfigPath, JSON.stringify({
      ...baseConfig,
      agents: {
        pinned: {
          runtimeProfile: 'default',
          service: 'chatgpt',
        },
      },
    }), 'utf8');
    const sourceStore = createAgentRegistryStore({
      rootDir: sourceDir,
      forceJsonFallbackForTest: true,
    });
    const targetStore = createAgentRegistryStore({
      rootDir: targetDir,
      forceJsonFallbackForTest: true,
    });
    const sourceService = createAgentTeamConfigService({ configPath: sourceConfigPath, registryStore: sourceStore });
    const targetService = createAgentTeamConfigService({ configPath: targetConfigPath, registryStore: targetStore });
    await sourceService.upsertAgent({
      id: 'worker',
      config: {
        runtimeProfile: 'default',
        service: 'gemini',
      },
    });
    await sourceService.upsertAgent({
      id: 'pinned',
      config: {
        runtimeProfile: 'default',
        service: 'grok',
      },
    });
    await sourceService.upsertTeam({
      id: 'ops',
      config: {
        agents: ['worker'],
      },
    });

    const snapshot = await sourceService.exportSnapshot({
      agents: ['worker', 'pinned'],
      teams: ['ops'],
      now: new Date('2026-05-11T12:00:00.000Z'),
    });
    const dryRun = await targetService.importSnapshot({ snapshot, dryRun: true });
    const imported = await targetService.importSnapshot({ snapshot });

    expect(snapshot).toEqual({
      object: 'auracall_agent_registry_snapshot',
      version: 1,
      exportedAt: '2026-05-11T12:00:00.000Z',
      agents: [
        {
          id: 'pinned',
          config: {
            runtimeProfile: 'default',
            service: 'grok',
          },
        },
        {
          id: 'worker',
          config: {
            runtimeProfile: 'default',
            service: 'gemini',
          },
        },
      ],
      teams: [
        {
          id: 'ops',
          config: {
            agents: ['worker'],
          },
        },
      ],
    });
    expect(dryRun).toMatchObject({
      dryRun: true,
      importedAgents: ['worker'],
      importedTeams: ['ops'],
      blockedAgents: ['pinned'],
    });
    expect(imported).toMatchObject({
      dryRun: false,
      importedAgents: ['worker'],
      importedTeams: ['ops'],
      blockedAgents: ['pinned'],
    });
    expect(await targetStore.listAgents()).toEqual([
      expect.objectContaining({
        id: 'worker',
        config: expect.objectContaining({
          service: 'gemini',
        }),
      }),
    ]);
    expect(await targetStore.listTeams()).toEqual([
      expect.objectContaining({
        id: 'ops',
      }),
    ]);
  });

  it('blocks registry mutations for config-defined overlay ids', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-agent-config-registry-block-'));
    cleanup.push(dir);
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        browserProfiles: { default: {} },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          pinned: {
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
        },
      }),
      'utf8',
    );
    const registryStore = createAgentRegistryStore({
      rootDir: dir,
      forceJsonFallbackForTest: true,
    });
    const service = createAgentTeamConfigService({ configPath, registryStore });

    const upsertResult = await service.upsertAgent({
      id: 'pinned',
      config: {
        runtimeProfile: 'default',
        service: 'grok',
      },
    });
    const deleteResult = await service.deleteAgent('pinned');

    expect(upsertResult).toMatchObject({
      mutationTarget: 'blocked',
      blockedReason: 'Agent pinned is defined in config and shadows registry records.',
    });
    expect(deleteResult).toMatchObject({
      mutationTarget: 'blocked',
      blockedReason: 'Agent pinned is defined in config and cannot be deleted through the registry write path.',
    });
    expect(await registryStore.listAgents({ includeDisabled: true })).toEqual([]);
  });
});
