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
  expectedPostures: Array<'disabled' | 'scheduled' | 'waiting'>;
  args: string[];
}

interface Options {
  mode: SmokeMode;
  port: number;
  auracallBin: string;
  mcpBin: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function stopProcess(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  proc.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => proc.once('exit', () => resolve(true))),
    sleep(5_000).then(() => false),
  ]);
  if (!exited && proc.exitCode === null && proc.signalCode === null) {
    proc.kill('SIGKILL');
    await new Promise((resolve) => proc.once('exit', resolve));
  }
}

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
    expectedPostures: ['disabled'],
    args: [
      'api',
      'serve',
      '--port',
      String(options.port),
      '--no-recover-runs-on-start',
      '--account-mirror-scheduler-interval-ms',
      '0',
    ],
  };
  const enabledPort = options.mode === 'enabled' ? options.port : options.port + 1;
  const enabled: SmokeCase = {
    name: 'enabled',
    port: enabledPort,
    expectedPostures: ['scheduled', 'waiting'],
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
  expectedPostures: SmokeCase['expectedPostures'];
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
    const tools = await client.listTools(undefined, { timeout: 10_000 });
    if (!tools.tools.some((tool) => tool.name === 'api_status')) {
      throw new Error('Installed MCP did not list api_status.');
    }
    if (!tools.tools.some((tool) => tool.name === 'api_log_tail')) {
      throw new Error('Installed MCP did not list api_log_tail.');
    }
    const apiStatus = await client.callTool({
      name: 'api_status',
      arguments: {
        port: input.port,
        ...(input.expectedPostures.length === 1
          ? { expectedAccountMirrorPosture: input.expectedPostures[0] }
          : {}),
      },
    }, undefined, { timeout: 10_000 });
    const apiLogTail = await client.callTool({
      name: 'api_log_tail',
      arguments: {
        port: input.port,
        maxBytes: 4096,
      },
    }, undefined, { timeout: 10_000 });
    return { apiStatus, apiLogTail };
  } finally {
    await client.close().catch(() => {});
    transport.close?.();
  }
}

async function runCase(options: Options, smokeCase: SmokeCase): Promise<void> {
  let apiProcess: ChildProcess | null = null;
  let stoppingApiProcess = false;
  try {
    const proc = spawn(options.auracallBin, smokeCase.args, {
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    apiProcess = proc;
    proc.stderr?.resume();
    proc.on('exit', (code, signal) => {
      if (stoppingApiProcess) return;
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
      expectedPostures: smokeCase.expectedPostures,
    });
    if (result.apiStatus.isError) {
      throw new Error(`MCP api_status returned an error for ${smokeCase.name}: ${readMcpTextContent(result.apiStatus.content)}`);
    }
    const structuredContent = result.apiStatus.structuredContent as {
      api?: {
        process?: { pid?: unknown };
        managedService?: { logPath?: unknown };
        logTailRoute?: unknown;
      };
      scheduler?: {
        state?: unknown;
        operatorStatus?: { posture?: unknown };
      };
    } | undefined;
    const scheduler = structuredContent?.scheduler as {
      state?: unknown;
      operatorStatus?: { posture?: unknown };
    } | undefined;
    const diagnosticsHints = readSchedulerDiagnosticsHints(structuredContent);
    const statusText = readMcpTextContent(result.apiStatus.content);
    const posture = scheduler?.operatorStatus?.posture;
    const state = scheduler?.state;
    if (!smokeCase.expectedPostures.includes(posture as SmokeCase['expectedPostures'][number])) {
      throw new Error(
        `Expected ${smokeCase.expectedPostures.join('/')} posture for ${smokeCase.name}, got ${String(posture)}.`,
      );
    }
    const pid = structuredContent?.api?.process?.pid;
    const logPath = structuredContent?.api?.managedService?.logPath;
    const logTailRoute = structuredContent?.api?.logTailRoute;
    if (typeof pid !== 'number' || pid <= 0) {
      throw new Error(`Expected api.process.pid for ${smokeCase.name}, got ${String(pid)}.`);
    }
    if (typeof logPath !== 'string' || !logPath.includes(`api-${smokeCase.port}.log`)) {
      throw new Error(`Expected api.managedService.logPath for ${smokeCase.name}, got ${String(logPath)}.`);
    }
    if (logTailRoute !== '/v1/api/logs/tail[?maxBytes=32768]') {
      throw new Error(`Expected api.logTailRoute for ${smokeCase.name}, got ${String(logTailRoute)}.`);
    }
    assertSchedulerDiagnosticsText({
      caseName: smokeCase.name,
      hints: diagnosticsHints,
      text: statusText,
    });
    const logTail = result.apiLogTail.structuredContent as {
      logTail?: {
        logPath?: unknown;
        exists?: unknown;
        maxBytes?: unknown;
        content?: unknown;
      };
    } | undefined;
    if (typeof logTail?.logTail?.exists !== 'boolean') {
      throw new Error(`Expected api_log_tail exists boolean for ${smokeCase.name}, got ${String(logTail?.logTail?.exists)}.`);
    }
    if (logTail.logTail.maxBytes !== 4096) {
      throw new Error(`Expected api_log_tail maxBytes=4096 for ${smokeCase.name}, got ${String(logTail.logTail.maxBytes)}.`);
    }
    if (typeof logTail.logTail.logPath !== 'string' || !logTail.logTail.logPath.includes(`api-${smokeCase.port}.log`)) {
      throw new Error(`Expected api_log_tail logPath for ${smokeCase.name}, got ${String(logTail.logTail.logPath)}.`);
    }
    console.log(`${smokeCase.name}: posture=${String(posture)} state=${String(state)} port=${smokeCase.port} pid=${pid} log=${logPath} schedulerDiagnostics=${diagnosticsHints.length} logTail=ok`);
  } finally {
    if (apiProcess) {
      stoppingApiProcess = true;
      await stopProcess(apiProcess);
    }
  }
}

function readMcpTextContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((item): item is { type: string; text: string } =>
      Boolean(item)
      && typeof item === 'object'
      && (item as { type?: unknown }).type === 'text'
      && typeof (item as { text?: unknown }).text === 'string')
    .map((item) => item.text)
    .join('\n');
}

function readSchedulerDiagnosticsHints(structuredContent: unknown): Array<{
  provider: string | null;
  runtimeProfileId: string | null;
  command: string;
}> {
  const hints = (structuredContent as { schedulerDiagnosticsHints?: unknown } | undefined)?.schedulerDiagnosticsHints;
  if (!Array.isArray(hints)) {
    throw new Error('Expected MCP api_status structuredContent.schedulerDiagnosticsHints array.');
  }
  return hints.map((hint, index) => {
    if (!hint || typeof hint !== 'object') {
      throw new Error(`Expected schedulerDiagnosticsHints[${index}] object.`);
    }
    const record = hint as {
      provider?: unknown;
      runtimeProfileId?: unknown;
      command?: unknown;
    };
    if (record.provider !== null && typeof record.provider !== 'string') {
      throw new Error(`Expected schedulerDiagnosticsHints[${index}].provider string/null.`);
    }
    if (record.runtimeProfileId !== null && typeof record.runtimeProfileId !== 'string') {
      throw new Error(`Expected schedulerDiagnosticsHints[${index}].runtimeProfileId string/null.`);
    }
    if (typeof record.command !== 'string' || !record.command.includes('auracall api scheduler-diagnostics')) {
      throw new Error(`Expected schedulerDiagnosticsHints[${index}].command diagnostics CLI command.`);
    }
    return {
      provider: record.provider ?? null,
      runtimeProfileId: record.runtimeProfileId ?? null,
      command: record.command,
    };
  });
}

function assertSchedulerDiagnosticsText(input: {
  caseName: string;
  hints: Array<{
    provider: string | null;
    runtimeProfileId: string | null;
    command: string;
  }>;
  text: string;
}): void {
  if (!input.hints.length) {
    if (input.text.includes('Scheduler diagnostics:')) {
      throw new Error(`Expected no scheduler diagnostics text for ${input.caseName} without hints.`);
    }
    return;
  }
  const countLine = `Scheduler diagnostics: available=${input.hints.length}`;
  if (!input.text.includes(countLine)) {
    throw new Error(`Expected MCP api_status text to include ${JSON.stringify(countLine)} for ${input.caseName}.`);
  }
  input.hints.forEach((hint, index) => {
    const label = [hint.provider, hint.runtimeProfileId].filter(Boolean).join('/');
    const commandLine = `Scheduler diagnostics command ${index + 1}${label ? ` (${label})` : ''}: ${JSON.stringify(hint.command)}`;
    if (!input.text.includes(commandLine)) {
      throw new Error(`Expected MCP api_status text to include ${JSON.stringify(commandLine)} for ${input.caseName}.`);
    }
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  for (const smokeCase of createCases(options)) {
    await runCase(options, smokeCase);
  }
}

main().then(() => {
  process.exit(0);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
