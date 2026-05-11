import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAgentDiagnosticsCliReport,
  formatAgentDiagnosticsCliReport,
  resolveAgentDiagnosticsExitCode,
} from '../../src/cli/agentDiagnosticsCommand.js';
import { createAgentRegistryStore } from '../../src/config/agentRegistryStore.js';

describe('config agent-diagnostics CLI helpers', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('builds and formats a secret-free registry/API-key diagnostics report', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-agent-diagnostics-'));
    cleanup.push(dir);
    const configPath = path.join(dir, 'config.json');
    const envPath = path.join(dir, 'api.env');
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
    await fs.writeFile(
      envPath,
      [
        'AURACALL_API_KEY_IDS=ops,broken',
        'AURACALL_API_KEY_OPS_ID=ops',
        'AURACALL_API_KEY_OPS=secret-value',
        'AURACALL_API_KEY_OPS_TEAMS=ops',
        'AURACALL_API_KEY_BROKEN_ID=broken',
        'AURACALL_API_KEY_BROKEN_AGENTS=missing-agent',
        '',
      ].join('\n'),
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
    await registryStore.upsertTeam({
      id: 'ops',
      config: {
        agents: ['worker'],
      },
    });

    const report = await buildAgentDiagnosticsCliReport({
      configPath,
      envPath,
      registryStore,
    });
    const text = formatAgentDiagnosticsCliReport(report);

    expect(report).toMatchObject({
      object: 'auracall_agent_registry_diagnostics',
      ok: false,
      envPath,
      envFileExists: true,
      metrics: {
        effectiveAgents: 2,
        effectiveTeams: 1,
        apiKeys: 2,
        warnings: 2,
      },
      apiKeys: [
        expect.objectContaining({
          id: 'ops',
          hasSecret: true,
          effectiveAgents: ['worker'],
        }),
        expect.objectContaining({
          id: 'broken',
          hasSecret: false,
          missingAgents: ['missing-agent'],
        }),
      ],
    });
    expect(resolveAgentDiagnosticsExitCode(report, { strict: true })).toBe(1);
    expect(text).toContain('Status: warnings');
    expect(text).toContain('API env path:');
    expect(text).toContain('ops: scoped; secret=present; effective agents=worker');
    expect(text).toContain('missing agents: missing-agent');
    expect(text).not.toContain('secret-value');
  });
});
