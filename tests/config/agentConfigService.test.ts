import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgentTeamConfigService } from '../../src/config/agentConfigService.js';

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
});
