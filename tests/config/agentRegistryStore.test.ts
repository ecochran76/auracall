import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEffectiveAgentCatalog } from '../../src/config/agentRegistryCatalog.js';
import { createAgentRegistryStore } from '../../src/config/agentRegistryStore.js';

describe('agent registry store', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('persists registry agents and teams with revision metadata', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-agent-registry-'));
    cleanup.push(dir);
    const store = createAgentRegistryStore({
      rootDir: dir,
      now: () => new Date('2026-05-10T18:00:00.000Z'),
    });

    await store.upsertAgent({
      id: 'researcher',
      config: {
        runtimeProfile: 'default',
        service: 'chatgpt',
        modelSelector: 'chatgpt:pro-extended',
      },
      createdBy: 'test',
      tags: ['core'],
    });
    const updated = await store.upsertAgent({
      id: 'researcher',
      config: {
        runtimeProfile: 'default',
        service: 'chatgpt',
        modelSelector: 'chatgpt:thinking-standard',
      },
      updatedBy: 'test-update',
      now: '2026-05-10T18:05:00.000Z',
    });
    await store.upsertTeam({
      id: 'ops',
      config: {
        agents: ['researcher'],
      },
    });

    expect(updated).toMatchObject({
      id: 'researcher',
      kind: 'agent',
      revision: 2,
      createdAt: '2026-05-10T18:00:00.000Z',
      updatedAt: '2026-05-10T18:05:00.000Z',
      updatedBy: 'test-update',
      config: {
        modelSelector: 'chatgpt:thinking-standard',
      },
    });
    await expect(store.listAgents()).resolves.toEqual([
      expect.objectContaining({
        id: 'researcher',
        revision: 2,
      }),
    ]);
    await expect(store.listTeams()).resolves.toEqual([
      expect.objectContaining({
        id: 'ops',
        config: {
          agents: ['researcher'],
        },
      }),
    ]);
  });

  it('omits disabled registry records unless requested', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-agent-registry-disabled-'));
    cleanup.push(dir);
    const store = createAgentRegistryStore({
      rootDir: dir,
      forceJsonFallbackForTest: true,
      now: () => new Date('2026-05-10T18:00:00.000Z'),
    });

    await store.upsertAgent({
      id: 'retired',
      config: {
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
    });
    await store.setAgentEnabled('retired', false, {
      updatedBy: 'test',
      now: '2026-05-10T18:02:00.000Z',
    });

    await expect(store.listAgents()).resolves.toEqual([]);
    await expect(store.listAgents({ includeDisabled: true })).resolves.toEqual([
      expect.objectContaining({
        id: 'retired',
        enabled: false,
        revision: 2,
      }),
    ]);
  });
});

describe('effective agent catalog', () => {
  it('merges config and registry records with deterministic config-wins conflicts', () => {
    const catalog = createEffectiveAgentCatalog({
      config: {
        browserProfiles: { default: {} },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          researcher: {
            runtimeProfile: 'default',
            service: 'chatgpt',
            modelSelector: 'chatgpt:pro-standard',
          },
        },
        teams: {
          core: {
            agents: ['researcher'],
          },
        },
      },
      registryAgents: [
        {
          kind: 'agent',
          id: 'builder',
          config: {
            runtimeProfile: 'default',
            service: 'gemini',
          },
          source: 'registry',
          enabled: true,
          createdAt: '2026-05-10T18:00:00.000Z',
          updatedAt: '2026-05-10T18:00:00.000Z',
          revision: 1,
        },
        {
          kind: 'agent',
          id: 'researcher',
          config: {
            runtimeProfile: 'default',
            service: 'grok',
          },
          source: 'registry',
          enabled: true,
          createdAt: '2026-05-10T18:00:00.000Z',
          updatedAt: '2026-05-10T18:00:00.000Z',
          revision: 3,
        },
        {
          kind: 'agent',
          id: 'disabled',
          config: {
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
          source: 'registry',
          enabled: false,
          createdAt: '2026-05-10T18:00:00.000Z',
          updatedAt: '2026-05-10T18:00:00.000Z',
          revision: 1,
        },
      ],
      registryTeams: [
        {
          kind: 'team',
          id: 'registry-team',
          config: {
            agents: ['builder'],
          },
          source: 'registry',
          enabled: true,
          createdAt: '2026-05-10T18:00:00.000Z',
          updatedAt: '2026-05-10T18:00:00.000Z',
          revision: 1,
        },
      ],
    });

    expect(catalog.agents).toEqual([
      expect.objectContaining({
        id: 'builder',
        source: 'registry',
        revision: 1,
        service: 'gemini',
      }),
      expect.objectContaining({
        id: 'researcher',
        source: 'config',
        modelSelector: 'chatgpt:pro-standard',
        service: 'chatgpt',
      }),
    ]);
    expect(catalog.teams).toEqual([
      expect.objectContaining({
        id: 'core',
        source: 'config',
        agentIds: ['researcher'],
      }),
      expect.objectContaining({
        id: 'registry-team',
        source: 'registry',
        revision: 1,
        agentIds: ['builder'],
      }),
    ]);
    expect(catalog.conflicts).toEqual([
      {
        kind: 'agent',
        id: 'researcher',
        configSource: 'config',
        registrySource: 'registry',
        resolution: 'config-wins',
      },
    ]);
  });

  it('projects tenant identity separately from the runtime execution binding', () => {
    const catalog = createEffectiveAgentCatalog({
      config: {
        browserProfiles: {
          default: {},
          consulting: {},
        },
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            defaultService: 'chatgpt',
            services: {
              chatgpt: {
                identity: { email: 'operator@example.com' },
                projectId: 'provider-project-default',
                projectName: 'Default Project',
              },
            },
          },
          work: {
            browserProfile: 'consulting',
            defaultService: 'chatgpt',
            services: {
              chatgpt: {
                identity: { email: 'consult@polymerconsultinggroup.com' },
                projectId: 'provider-project-service',
                projectName: 'Service Project',
              },
            },
          },
        },
        agents: {
          explicit: {
            runtimeProfile: 'work',
            service: 'chatgpt',
            tenantKey: 'service-account:chatgpt:consult@polymerconsultinggroup.com',
            bindingId: 'chatgpt-consult-primary',
            projectBinding: {
              mode: 'alias',
              id: 'consulting-main',
              providerProjectId: 'provider-project-explicit',
              label: 'Consulting Main',
            },
          },
          inherited: {
            runtimeProfile: 'default',
          },
        },
      },
    });

    expect(catalog.agents).toEqual([
      expect.objectContaining({
        id: 'explicit',
        tenantKey: 'service-account:chatgpt:consult@polymerconsultinggroup.com',
        bindingId: 'chatgpt-consult-primary',
        bindingKey: 'binding:chatgpt:work:consulting',
        runtimeProfileId: 'work',
        browserProfileId: 'consulting',
        projectBinding: {
          mode: 'alias',
          source: 'agent',
          id: 'consulting-main',
          providerProjectId: 'provider-project-explicit',
          label: 'Consulting Main',
        },
      }),
      expect.objectContaining({
        id: 'inherited',
        tenantKey: 'service-account:chatgpt:operator@example.com',
        bindingId: 'binding:chatgpt:default:default',
        bindingKey: 'binding:chatgpt:default:default',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        projectBinding: {
          mode: 'fixed',
          source: 'service',
          providerProjectId: 'provider-project-default',
          label: 'Default Project',
        },
      }),
    ]);
  });
});
