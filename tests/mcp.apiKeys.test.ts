import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgentTeamConfigService } from '../src/config/agentConfigService.js';
import {
  createApiKeyDiagnosticsToolHandler,
  createApiKeyIssueToolHandler,
} from '../src/mcp/tools/apiKeys.js';

describe('mcp api key tools', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('issues an agent-scoped API key into a user env file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-mcp-api-key-'));
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
          researcher: {
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
        },
      }),
      'utf8',
    );
    const service = createAgentTeamConfigService({ configPath });

    const result = await createApiKeyIssueToolHandler(service)({
      agentId: 'researcher',
      keyId: 'agent-researcher',
      services: ['chatgpt'],
      runtimeProfiles: ['default'],
      envPath,
    });

    expect(result.structuredContent).toMatchObject({
      object: 'auracall_api_key_issue',
      keyId: 'agent-researcher',
      envPath,
      openaiBaseUrl: 'http://127.0.0.1:18095/v1',
      model: 'agent:researcher',
      scopes: {
        agents: ['researcher'],
        services: ['chatgpt'],
        runtimeProfiles: ['default'],
      },
      restartRequired: true,
    });
    const env = await fs.readFile(envPath, 'utf8');
    expect(env).toContain('AURACALL_API_AUTH_REQUIRED=1');
    expect(env).toContain('AURACALL_API_KEY_IDS=agent-researcher');
    expect(env).toContain('AURACALL_API_KEY_AGENT_RESEARCHER_ID=agent-researcher');
    expect(env).toContain('AURACALL_API_KEY_AGENT_RESEARCHER_AGENTS=researcher');
    expect(env).toContain('AURACALL_API_KEY_AGENT_RESEARCHER_SERVICES=chatgpt');
    expect(env).toContain('AURACALL_API_KEY_AGENT_RESEARCHER_RUNTIME_PROFILES=default');
  });

  it('diagnoses env-file API key scopes without returning secrets', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-mcp-api-key-diagnostics-'));
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
          researcher: {
            runtimeProfile: 'default',
            service: 'chatgpt',
          },
        },
        teams: {
          research: {
            agents: ['researcher'],
          },
        },
      }),
      'utf8',
    );
    await fs.writeFile(
      envPath,
      [
        'AURACALL_API_AUTH_REQUIRED=1',
        'AURACALL_API_KEY_IDS=research,broken',
        'AURACALL_API_KEY_RESEARCH_ID=research',
        'AURACALL_API_KEY_RESEARCH=secret-value',
        'AURACALL_API_KEY_RESEARCH_TEAMS=research',
        'AURACALL_API_KEY_BROKEN_ID=broken',
        'AURACALL_API_KEY_BROKEN_AGENTS=missing-agent',
        '',
      ].join('\n'),
      'utf8',
    );
    const service = createAgentTeamConfigService({ configPath });

    const result = await createApiKeyDiagnosticsToolHandler(service)({ envPath });

    expect(result.structuredContent).toMatchObject({
      object: 'auracall_agent_registry_diagnostics',
      envPath,
      ok: false,
      metrics: {
        apiKeys: 2,
        warnings: 2,
      },
      apiKeys: [
        expect.objectContaining({
          id: 'research',
          hasSecret: true,
          effectiveAgents: ['researcher'],
        }),
        expect.objectContaining({
          id: 'broken',
          hasSecret: false,
          missingAgents: ['missing-agent'],
        }),
      ],
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain('secret-value');
  });
});
