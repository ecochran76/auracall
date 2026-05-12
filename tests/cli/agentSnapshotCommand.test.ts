import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  exportAgentSnapshotForCli,
  formatAgentSnapshotImportCliResult,
  importAgentSnapshotForCli,
} from '../../src/cli/agentSnapshotCommand.js';
import { createAgentTeamConfigService } from '../../src/config/agentConfigService.js';
import { createAgentRegistryStore } from '../../src/config/agentRegistryStore.js';

describe('config agent snapshot CLI helpers', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('exports selected agents and imports them into another registry', async () => {
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-agent-export-source-'));
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-agent-export-target-'));
    cleanup.push(sourceDir, targetDir);
    const sourceConfigPath = path.join(sourceDir, 'config.json');
    const targetConfigPath = path.join(targetDir, 'config.json');
    const outputPath = path.join(sourceDir, 'snapshot.json');
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

    const exported = await exportAgentSnapshotForCli({
      configPath: sourceConfigPath,
      outputPath,
      agents: ['worker'],
      teams: ['ops'],
      registryStore: sourceStore,
      now: new Date('2026-05-11T12:30:00.000Z'),
    });
    const imported = await importAgentSnapshotForCli({
      configPath: targetConfigPath,
      inputPath: outputPath,
      registryStore: targetStore,
    });

    expect(exported.snapshot).toMatchObject({
      object: 'auracall_agent_registry_snapshot',
      exportedAt: '2026-05-11T12:30:00.000Z',
      agents: [{ id: 'worker' }],
      teams: [{ id: 'ops' }],
    });
    expect(JSON.parse(await fs.readFile(outputPath, 'utf8'))).toMatchObject({
      object: 'auracall_agent_registry_snapshot',
      agents: [{ id: 'worker' }],
    });
    expect(imported).toMatchObject({
      dryRun: false,
      importedAgents: ['worker'],
      importedTeams: ['ops'],
      blockedAgents: [],
      blockedTeams: [],
    });
    expect(formatAgentSnapshotImportCliResult(imported)).toContain('Imported agents: worker');
    expect(await targetStore.listAgents()).toEqual([
      expect.objectContaining({
        id: 'worker',
      }),
    ]);
  });

  it('requires an explicit selection or --all for export', async () => {
    await expect(exportAgentSnapshotForCli({
      configPath: '/tmp/unused-config.json',
      registryStore: null,
    })).rejects.toThrow('Select at least one --agent or --team, or pass --all.');
  });
});
