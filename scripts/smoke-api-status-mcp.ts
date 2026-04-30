#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type SmokeMode = 'disabled' | 'enabled' | 'both';

interface SmokeCase {
  name: 'disabled' | 'enabled';
  port: number;
  expectedPosture: 'disabled' | 'scheduled';
  args: string[];
}

interface Options {
  mode: SmokeMode;
  port: number;
  auracallBin: string;
  mcpBin: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    mode: 'both',
    port: 18081,
    auracallBin: path.join(os.homedir(), '.local', 'bin', 'auracall'),
    mcpBin: path.join(os.homedir(), '.local', 'bin', 'auracall-mcp'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      const value = argv[index + 1] as SmokeMode | undefined;
      if (value !== 'disabled' && value !== 'enabled' && value !== 'both') {
        throw new Error('--mode must be disabled, enabled, or both.');
      }
      options.mode = value;
      index += 1;
      continue;
    }
    if (arg === '--port') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error('--port requires a positive integer.');
      options.port = value;
      index += 1;
      continue;
    }
    if (arg === '--auracall-bin') {
      const value = argv[index + 1];
      if (!value) throw new Error('--auracall-bin requires a path.');
      options.auracallBin = expandHome(value);
      index += 1;
      continue;
    }
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
  console.log(`Smoke local API /status through installed MCP api_status.

Usage:
  pnpm tsx scripts/smoke-api-status-mcp.ts [options]

Options:
  --mode <mode>          disabled, enabled, or both. Default: both
  --port <port>          First local API port. Default: 18081
  --auracall-bin <path>  AuraCall CLI binary. Default: ~/.local/bin/auracall
  --mcp-bin <path>       AuraCall MCP binary. Default: ~/.local/bin/auracall-mcp
  -h, --help             Show this help
`);
}

function createCases(options: Options): SmokeCase[] {
  const disabled: SmokeCase = {
    name: 'disabled',
    port: options.port,
    expectedPosture: 'disabled',
    args: ['api', 'serve', '--port', String(options.port), '--no-recover-runs-on-start'],
  };
  const enabledPort = options.mode === 'enabled' ? options.port : options.port + 1;
  const enabled: SmokeCase = {
    name: 'enabled',
    port: enabledPort,
    expectedPosture: 'scheduled',
    args: [
      'api',
      'serve',
      '--port',
      String(enabledPort),
      '--no-recover-runs-on-start',
      '--account-mirror-scheduler-interval-ms',
      '600000',
    ],
  };
  if (options.mode === 'disabled') return [disabled];
  if (options.mode === 'enabled') return [enabled];
  return [disabled, enabled];
}

async function waitForStatus(port: number): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/status`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for API status on port ${port}.`);
}

async function callApiStatusThroughMcp(input: {
  mcpBin: string;
  port: number;
  expectedPosture: SmokeCase['expectedPosture'];
}) {
  const client = new Client({ name: 'auracall-api-status-smoke', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: input.mcpBin,
    env: {
      ...process.env,
      AURACALL_DISABLE_KEYTAR: '1',
    },
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    return await client.callTool({
      name: 'api_status',
      arguments: {
        port: input.port,
        expectedAccountMirrorPosture: input.expectedPosture,
      },
    }, undefined, { timeout: 10_000 });
  } finally {
    await client.close().catch(() => {});
    transport.close?.();
  }
}

async function runCase(options: Options, smokeCase: SmokeCase): Promise<void> {
  let apiProcess: ChildProcess | null = null;
  try {
    const proc = spawn(options.auracallBin, smokeCase.args, {
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    apiProcess = proc;
    proc.stderr?.resume();
    proc.on('exit', (code, signal) => {
      if (code !== null && code !== 0) {
        console.error(`api serve exited early for ${smokeCase.name}: code=${code}`);
      }
      if (signal) {
        console.error(`api serve terminated for ${smokeCase.name}: signal=${signal}`);
      }
    });

    await waitForStatus(smokeCase.port);
    const result = await callApiStatusThroughMcp({
      mcpBin: options.mcpBin,
      port: smokeCase.port,
      expectedPosture: smokeCase.expectedPosture,
    });
    const structuredContent = result.structuredContent as {
      scheduler?: {
        state?: unknown;
        operatorStatus?: { posture?: unknown };
      };
    } | undefined;
    const scheduler = structuredContent?.scheduler as {
      state?: unknown;
      operatorStatus?: { posture?: unknown };
    } | undefined;
    const posture = scheduler?.operatorStatus?.posture;
    const state = scheduler?.state;
    if (posture !== smokeCase.expectedPosture) {
      throw new Error(`Expected ${smokeCase.expectedPosture} posture for ${smokeCase.name}, got ${String(posture)}.`);
    }
    console.log(`${smokeCase.name}: posture=${String(posture)} state=${String(state)} port=${smokeCase.port}`);
  } finally {
    if (apiProcess && !apiProcess.killed) {
      apiProcess.kill('SIGTERM');
      await new Promise((resolve) => apiProcess?.once('exit', resolve));
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  for (const smokeCase of createCases(options)) {
    await runCase(options, smokeCase);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
