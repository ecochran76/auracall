import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgentTeamConfigService } from '../src/config/agentConfigService.js';
import { createAgentRegistryStore } from '../src/config/agentRegistryStore.js';
import {
  createConfigEntitiesListToolHandler,
  createConfigAgentUpsertToolHandler,
  createConfigSnapshotExportToolHandler,
  createConfigSnapshotImportToolHandler,
  createConfigTeamUpsertToolHandler,
} from '../src/mcp/tools/configEntities.js';

describe('mcp config entity tools', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('configures AuraCall agents and teams through MCP handlers', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-mcp-config-entities-'));
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
    const service = createAgentTeamConfigService({ configPath });

    const agentResult = await createConfigAgentUpsertToolHandler(service)({
      id: 'researcher',
      config: {
        runtimeProfile: 'default',
        service: 'chatgpt',
        modelSelector: 'chatgpt:thinking-standard',
      },
    });
    const teamResult = await createConfigTeamUpsertToolHandler(service)({
      id: 'ops',
      config: {
        agents: ['researcher'],
      },
    });

    expect(agentResult).toMatchObject({
      isError: false,
      structuredContent: {
        object: 'auracall_config_entity',
        kind: 'agent',
        action: 'upsert',
        id: 'researcher',
      },
    });
    expect(teamResult).toMatchObject({
      isError: false,
      structuredContent: {
        object: 'auracall_config_entity',
        kind: 'team',
        action: 'upsert',
        id: 'ops',
        teams: [
          expect.objectContaining({
            id: 'ops',
            agentIds: ['researcher'],
          }),
        ],
      },
    });
  });

  it('lists registry-backed agents through MCP config entities', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-mcp-config-registry-'));
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
    const registryStore = createAgentRegistryStore({
      rootDir: dir,
      forceJsonFallbackForTest: true,
    });
    await registryStore.upsertAgent({
      id: 'registry-worker',
      config: {
        runtimeProfile: 'default',
        service: 'gemini',
      },
    });
    const service = createAgentTeamConfigService({ configPath, registryStore });

    const result = await createConfigEntitiesListToolHandler(service)({});

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        object: 'auracall_config_entity',
        action: 'list',
        registryPath: registryStore.dbPath,
        agents: [
          expect.objectContaining({
            id: 'registry-worker',
            source: 'registry',
            revision: 1,
            service: 'gemini',
          }),
        ],
      },
    });
  });

  it('writes registry-backed agents through MCP config entities', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-mcp-config-registry-write-'));
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
    const registryStore = createAgentRegistryStore({
      rootDir: dir,
      forceJsonFallbackForTest: true,
    });
    const service = createAgentTeamConfigService({ configPath, registryStore });

    const result = await createConfigAgentUpsertToolHandler(service)({
      id: 'registry-worker',
      config: {
        runtimeProfile: 'default',
        service: 'gemini',
      },
    });

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        object: 'auracall_config_entity',
        action: 'upsert',
        mutationTarget: 'registry',
        agents: [
          expect.objectContaining({
            id: 'registry-worker',
            source: 'registry',
            revision: 1,
            service: 'gemini',
          }),
        ],
      },
    });
  });

  it('exports and imports reviewable snapshots through MCP config entities', async () => {
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-mcp-config-snapshot-source-'));
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-mcp-config-snapshot-target-'));
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
    await fs.writeFile(targetConfigPath, JSON.stringify(baseConfig), 'utf8');
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
    await sourceService.upsertTeam({
      id: 'ops',
      config: {
        agents: ['worker'],
      },
    });

    const exported = await createConfigSnapshotExportToolHandler(sourceService)({
      agents: ['worker'],
      teams: ['ops'],
    });
    const imported = await createConfigSnapshotImportToolHandler(targetService)({
      snapshot: exported.structuredContent,
    });

    expect(exported).toMatchObject({
      isError: false,
      structuredContent: {
        object: 'auracall_agent_registry_snapshot',
        agents: [{ id: 'worker' }],
        teams: [{ id: 'ops' }],
      },
    });
    expect(imported).toMatchObject({
      isError: false,
      structuredContent: {
        object: 'auracall_agent_registry_snapshot_import',
        importedAgents: ['worker'],
        importedTeams: ['ops'],
      },
    });
    expect(await targetStore.listAgents()).toEqual([
      expect.objectContaining({
        id: 'worker',
      }),
    ]);
  });
});
