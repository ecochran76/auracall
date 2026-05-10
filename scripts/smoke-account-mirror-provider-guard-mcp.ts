#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface Options {
  mcpBin: string;
}

function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    mcpBin: path.join(os.homedir(), '.local', 'bin', 'auracall-mcp'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mcp-bin') {
      const value = argv[index + 1];
      if (!value) throw new Error('--mcp-bin requires a path.');
      options.mcpBin = expandHome(value);
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp(): void {
  console.log(`Smoke account mirror provider guard clearance through installed MCP.

Usage:
  pnpm tsx scripts/smoke-account-mirror-provider-guard-mcp.ts [options]

Options:
  --mcp-bin <path>  AuraCall MCP binary. Default: ~/.local/bin/auracall-mcp
  -h, --help        Show this help
`);
}

async function writeFixtureConfig(homeDir: string): Promise<string> {
  const configPath = path.join(homeDir, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({
    version: 2,
    model: 'gpt-5.2-pro',
    engine: 'browser',
    auracallProfile: 'default',
    browser: {
      cache: {
        rootDir: path.join(homeDir, 'cache'),
        store: 'json',
      },
    },
    runtimeProfiles: {
      default: {
        engine: 'browser',
        browserProfile: 'default',
        defaultService: 'gemini',
        services: {
          gemini: {
            identity: {
              email: 'mcp-provider-guard-smoke@example.test',
            },
            liveFollow: {
              enabled: true,
              mode: 'metadata-first',
              priority: 'background',
            },
          },
        },
      },
    },
  }, null, 2));
  return configPath;
}

async function callInstalledMcp(input: {
  mcpBin: string;
  cwd: string;
  env: Record<string, string>;
}): Promise<void> {
  const client = new Client({ name: 'auracall-provider-guard-mcp-smoke', version: '0.0.0' });
  let stderr = '';
  const transport = new StdioClientTransport({
    command: input.mcpBin,
    cwd: input.cwd,
    env: input.env,
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools({}, { timeout: 10_000 });
    if (!tools.some((tool) => tool.name === 'account_mirror_provider_guard_clear')) {
      throw new Error('Installed MCP server did not expose account_mirror_provider_guard_clear.');
    }

    const before = await client.callTool({
      name: 'account_mirror_status',
      arguments: {
        provider: 'gemini',
        runtimeProfile: 'default',
      },
    }, undefined, { timeout: 10_000 });
    assertMirrorStatus(before.structuredContent, {
      providerGuardState: 'clear',
      reason: 'eligible',
      label: 'before clear',
    });

    const clearResult = await client.callTool({
      name: 'account_mirror_provider_guard_clear',
      arguments: {
        provider: 'gemini',
        runtimeProfile: 'default',
        cooldownMs: 600_000,
      },
    }, undefined, { timeout: 10_000 });
    assertProviderGuardClear(clearResult.structuredContent);

    const after = await client.callTool({
      name: 'account_mirror_status',
      arguments: {
        provider: 'gemini',
        runtimeProfile: 'default',
      },
    }, undefined, { timeout: 10_000 });
    assertMirrorStatus(after.structuredContent, {
      providerGuardState: 'cooldown',
      reason: 'provider-guard-cooldown',
      label: 'after clear',
    });
  } finally {
    await client.close().catch(() => {});
    transport.close?.();
    if (stderr.trim().length > 0 && process.env.AURACALL_SMOKE_DEBUG_STDERR === '1') {
      console.error(stderr.trim());
    }
  }
}

function assertProviderGuardClear(value: unknown): void {
  const record = asRecord(value, 'provider guard clear structuredContent');
  assertEqual(record.object, 'account_mirror_provider_guard_clear', 'clear object');
  assertEqual(record.kind, 'account-mirror-provider-guard', 'clear kind');
  assertEqual(record.action, 'clear', 'clear action');
  assertEqual(record.provider, 'gemini', 'clear provider');
  assertEqual(record.runtimeProfileId, 'default', 'clear runtime profile');
  if (typeof record.cooldownUntil !== 'string' || Number.isNaN(Date.parse(record.cooldownUntil))) {
    throw new Error(`clear cooldownUntil: expected ISO timestamp, got ${String(record.cooldownUntil)}.`);
  }
  const mirrorStatus = asRecord(record.mirrorStatus, 'clear mirrorStatus');
  assertEqual(mirrorStatus.reason, 'provider-guard-cooldown', 'clear mirror status reason');
  const providerGuard = asRecord(mirrorStatus.providerGuard, 'clear mirrorStatus.providerGuard');
  assertEqual(providerGuard.state, 'cooldown', 'clear provider guard state');
  assertEqual(providerGuard.action, 'operator-clear', 'clear provider guard action');
}

function assertMirrorStatus(
  value: unknown,
  expected: { providerGuardState: string; reason: string; label: string },
): void {
  const record = asRecord(value, `${expected.label} structuredContent`);
  assertEqual(record.object, 'account_mirror_status', `${expected.label} object`);
  const entries = Array.isArray(record.entries) ? record.entries : [];
  const entry = entries.find((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const candidateRecord = candidate as Record<string, unknown>;
    return candidateRecord.provider === 'gemini' && candidateRecord.runtimeProfileId === 'default';
  });
  const entryRecord = asRecord(entry, `${expected.label} entry`);
  assertEqual(entryRecord.reason, expected.reason, `${expected.label} reason`);
  const providerGuard = asRecord(entryRecord.providerGuard, `${expected.label} providerGuard`);
  assertEqual(providerGuard.state, expected.providerGuardState, `${expected.label} provider guard state`);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}: expected object, got ${String(value)}.`);
  }
  return value as Record<string, unknown>;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-provider-guard-mcp-smoke-'));
  const priorCwd = process.cwd();
  try {
    const configPath = await writeFixtureConfig(homeDir);
    process.chdir(homeDir);
    await callInstalledMcp({
      mcpBin: options.mcpBin,
      cwd: homeDir,
      env: {
        ...normalizeEnv(process.env),
        // biome-ignore lint/style/useNamingConvention: environment variables stay upper snake case
        AURACALL_DISABLE_KEYTAR: '1',
        // biome-ignore lint/style/useNamingConvention: environment variables stay upper snake case
        AURACALL_HOME_DIR: homeDir,
        // biome-ignore lint/style/useNamingConvention: environment variables stay upper snake case
        AURACALL_CONFIG_PATH: configPath,
        // biome-ignore lint/style/useNamingConvention: environment variables stay upper snake case
        AURACALL_SYSTEM_CONFIG_PATH: path.join(homeDir, 'missing-system-config.json'),
      },
    });
    console.log([
      'provider-guard MCP smoke: pass',
      'tool=account_mirror_provider_guard_clear',
      'listed=ok',
      'fixtureHome=isolated',
      'clearGuard=ok',
      'cooldown=ok',
      'providerWork=none',
    ].join('\n'));
  } finally {
    process.chdir(priorCwd);
    await fs.rm(homeDir, { recursive: true, force: true });
  }
}

function normalizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string'),
  );
}

main().then(() => {
  process.exit(0);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
