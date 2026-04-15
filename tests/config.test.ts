import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadUserConfig, scaffoldDefaultConfigFile } from '../src/config.js';
import { resolveHostLocalActionExecutionPolicy } from '../src/config/model.js';
import { ComposedConfigSchema } from '../src/config/schema.js';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';

describe('loadUserConfig', () => {
  let tempDir: string;
  let previousUserConfigPath: string | undefined;
  let previousSystemConfigPath: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oracle-config-'));
    setAuracallHomeDirOverrideForTest(tempDir);
    previousUserConfigPath = process.env.AURACALL_CONFIG_PATH;
    previousSystemConfigPath = process.env.AURACALL_SYSTEM_CONFIG_PATH;
    process.env.AURACALL_CONFIG_PATH = path.join(tempDir, 'config.json');
    process.env.AURACALL_SYSTEM_CONFIG_PATH = path.join(tempDir, 'system.json');
  });

  afterEach(() => {
    if (previousUserConfigPath === undefined) {
      delete process.env.AURACALL_CONFIG_PATH;
    } else {
      process.env.AURACALL_CONFIG_PATH = previousUserConfigPath;
    }
    if (previousSystemConfigPath === undefined) {
      delete process.env.AURACALL_SYSTEM_CONFIG_PATH;
    } else {
      process.env.AURACALL_SYSTEM_CONFIG_PATH = previousSystemConfigPath;
    }
  });

  it('parses JSON5 config with comments', async () => {
    const configPath = path.join(tempDir, 'config.json');
    await fs.writeFile(
      configPath,
      `// comment\n{
        engine: "browser",
        notify: { sound: true },
        heartbeatSeconds: 15,
        remote: { host: "host:1234", token: "abc" },
      }`,
      'utf8',
    );

    const result = await loadUserConfig(tempDir);
    expect(result.loaded).toBe(true);
    expect(result.config.engine).toBe('browser');
    expect(result.config.notify?.sound).toBe(true);
    expect(result.config.heartbeatSeconds).toBe(15);
    expect(result.config.remote?.host).toBe('host:1234');
    expect(result.config.remote?.token).toBe('abc');
  });

  it('parses reserved agents and teams blocks without affecting current config loading', async () => {
    const configPath = path.join(tempDir, 'config.json');
    await fs.writeFile(
      configPath,
      `{
        auracallProfile: "default",
        profiles: {
          default: { engine: "browser", defaultService: "chatgpt" }
        },
        agents: {
          researcher: {
            runtimeProfile: "default",
            description: "Reserved future agent config"
          }
        },
        teams: {
          ops: {
            agents: ["researcher"],
            description: "Reserved future team config"
          }
        }
      }`,
      'utf8',
    );

    const result = await loadUserConfig(tempDir);
    expect(result.loaded).toBe(true);
    expect(result.config.agents?.researcher?.runtimeProfile).toBe('default');
    expect(result.config.teams?.ops?.agents).toEqual(['researcher']);
    expect(result.config.profiles?.default?.defaultService).toBe('chatgpt');
  });

  it('parses optional team role metadata for future task-aware planning', async () => {
    const configPath = path.join(tempDir, 'config.json');
    await fs.writeFile(
      configPath,
      `{
        agents: {
          orchestrator: { runtimeProfile: "default" },
          engineer: { runtimeProfile: "default" }
        },
        teams: {
          vibeCode: {
            agents: ["orchestrator", "engineer"],
            instructions: "Use unattended multi-turn automation carefully.",
            roles: {
              orchestrator: {
                agent: "orchestrator",
                order: 1,
                instructions: "Frame the work and steer the engineer.",
                stepKind: "analysis",
                handoffToRole: "engineer"
              },
              engineer: {
                agent: "engineer",
                order: 2,
                instructions: "Produce the work-product bundle.",
                stepKind: "synthesis",
                responseShape: {
                  format: "json",
                  artifact: "zip"
                }
              }
            }
          }
        }
      }`,
      'utf8',
    );

    const result = await loadUserConfig(tempDir);
    expect(result.loaded).toBe(true);
    expect(result.config.teams?.vibeCode?.instructions).toBe(
      'Use unattended multi-turn automation carefully.',
    );
    expect(result.config.teams?.vibeCode?.roles?.orchestrator?.agent).toBe('orchestrator');
    expect(result.config.teams?.vibeCode?.roles?.engineer?.responseShape).toEqual({
      format: 'json',
      artifact: 'zip',
    });
  });

  it('supports top-level remoteHost/remoteToken aliases', async () => {
    const configPath = path.join(tempDir, 'config.json');
    await fs.writeFile(
      configPath,
      `{
        remoteHost: "alias:9999",
        remoteToken: "secret"
      }`,
      'utf8',
    );

    const result = await loadUserConfig(tempDir);
    expect(result.loaded).toBe(true);
    expect(result.config.remoteHost).toBe('alias:9999');
    expect(result.config.remoteToken).toBe('secret');
  });

  it('scaffolds a default config when file is missing', async () => {
    const result = await loadUserConfig(tempDir);
    expect(result.loaded).toBe(true);
    expect(result.config.version).toBe(3);
    expect(result.config.defaultRuntimeProfile).toBe('default');
    expect(result.config.auracallProfile).toBeUndefined();
    expect(result.config.browserProfiles?.default).toBeDefined();
    expect(result.config.runtimeProfiles?.default?.browserProfile).toBe('default');
    expect(result.config.browserFamilies).toBeUndefined();
    expect(result.config.profiles).toBeUndefined();
  });

  it('accepts the runtime-profile browserFamily bridge through the composed schema', () => {
    const parsed = ComposedConfigSchema.parse({
      browserFamilies: {
        consulting: {
          chromePath: '/usr/bin/google-chrome',
        },
      },
      profiles: {
        consulting: {
          browserFamily: 'consulting',
          defaultService: 'chatgpt',
        },
      },
    });

    expect(parsed.browserFamilies?.consulting?.chromePath).toBe('/usr/bin/google-chrome');
    expect(parsed.profiles?.consulting?.browserFamily).toBe('consulting');
  });

  it('accepts target-shape browserProfiles/runtimeProfiles input through the composed schema', () => {
    const parsed = ComposedConfigSchema.parse({
      defaultRuntimeProfile: 'consulting',
      browserProfiles: {
        consulting: {
          chromePath: '/usr/bin/google-chrome',
        },
      },
      runtimeProfiles: {
        consulting: {
          browserProfile: 'consulting',
          defaultService: 'chatgpt',
        },
      },
    });

    expect(parsed.defaultRuntimeProfile).toBe('consulting');
    expect(parsed.browserProfiles?.consulting?.chromePath).toBe('/usr/bin/google-chrome');
    expect(parsed.runtimeProfiles?.consulting?.browserProfile).toBe('consulting');
  });

  it('accepts and resolves host runtime local-action shell policy config', () => {
    const parsed = ComposedConfigSchema.parse({
      runtime: {
        localActions: {
          shell: {
            complexityStage: 'repo-automation',
            allowedCommands: ['node', 'git'],
            allowedCwdRoots: ['/repo', '/repo/tmp'],
            defaultShellActionTimeoutMs: '30s',
            maxShellActionTimeoutMs: 120000,
            maxCaptureChars: 12000,
          },
        },
      },
    });

    expect(parsed.runtime?.localActions?.shell).toEqual({
      complexityStage: 'repo-automation',
      allowedCommands: ['node', 'git'],
      allowedCwdRoots: ['/repo', '/repo/tmp'],
      defaultShellActionTimeoutMs: 30000,
      maxShellActionTimeoutMs: 120000,
      maxCaptureChars: 12000,
    });
    expect(resolveHostLocalActionExecutionPolicy(parsed as Record<string, unknown>)).toEqual({
      complexityStage: 'repo-automation',
      allowedShellCommands: ['node', 'git'],
      allowedCwdRoots: ['/repo', '/repo/tmp'],
      defaultShellActionTimeoutMs: 30000,
      maxShellActionTimeoutMs: 120000,
      maxCaptureChars: 12000,
    });
  });

  it('scaffolds target-shape config output by default', async () => {
    const configPath = path.join(tempDir, 'target-config.json');
    const result = await scaffoldDefaultConfigFile({
      path: configPath,
      force: true,
    });

    expect(result?.config.version).toBe(3);
    expect(result?.config.defaultRuntimeProfile).toBe('default');
    expect(result?.config.auracallProfile).toBeUndefined();
    expect(result?.config.browserProfiles?.default).toBeDefined();
    expect(result?.config.runtimeProfiles?.default?.browserProfile).toBe('default');
    expect(result?.config.browserFamilies).toBeUndefined();
    expect(result?.config.profiles).toBeUndefined();
  });

  it('can still scaffold compatibility bridge output when requested', async () => {
    const configPath = path.join(tempDir, 'bridge-config.json');
    const result = await scaffoldDefaultConfigFile({
      path: configPath,
      force: true,
      targetShape: false,
    });

    expect(result?.config.version).toBe(2);
    expect(result?.config.auracallProfile).toBe('default');
    expect(result?.config.defaultRuntimeProfile).toBeUndefined();
    expect(result?.config.browserFamilies?.default).toBeDefined();
    expect(result?.config.profiles?.default?.browserFamily).toBe('default');
    expect(result?.config.browserProfiles).toBeUndefined();
    expect(result?.config.runtimeProfiles).toBeUndefined();
  });

  afterAll(() => {
    setAuracallHomeDirOverrideForTest(null);
  });
});
