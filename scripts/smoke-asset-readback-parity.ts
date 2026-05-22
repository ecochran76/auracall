#!/usr/bin/env tsx
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const execFileAsync = promisify(execFile);

const DEFAULT_MEDIA_GENERATION_ID = 'medgen_cf296426a263400bbd5a2690674052a5';

interface Options {
  mediaGenerationId: string;
  auracallBin: string;
  mcpBin: string;
  port: number | null;
}

function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    mediaGenerationId: DEFAULT_MEDIA_GENERATION_ID,
    auracallBin: path.join(os.homedir(), '.local', 'bin', 'auracall'),
    mcpBin: path.join(os.homedir(), '.local', 'bin', 'auracall-mcp'),
    port: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--media-generation-id') {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error('--media-generation-id requires a value.');
      options.mediaGenerationId = value;
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
    if (arg === '--port') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error('--port requires a positive integer.');
      options.port = value;
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
  console.log(`Smoke AuraCall asset readback parity across archive, search, and MCP search projection.

Usage:
  pnpm tsx scripts/smoke-asset-readback-parity.ts [options]

Options:
  --media-generation-id <id>  Media generation id to query.
                             Default: ${DEFAULT_MEDIA_GENERATION_ID}
  --auracall-bin <path>       AuraCall CLI binary. Default: ~/.local/bin/auracall
  --mcp-bin <path>            AuraCall MCP binary. Default: ~/.local/bin/auracall-mcp
  --port <port>               Local API port override for CLI calls.
  -h, --help                  Show this help
`);
}

async function runAuracallJson(input: {
  auracallBin: string;
  args: string[];
}): Promise<unknown> {
  const { stdout } = await execFileAsync(input.auracallBin, input.args, {
    env: {
      ...process.env,
      AURACALL_DISABLE_KEYTAR: '1',
    },
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function apiPortArgs(port: number | null): string[] {
  return port ? ['--port', String(port)] : [];
}

async function readArchiveViaCli(options: Options): Promise<unknown> {
  return runAuracallJson({
    auracallBin: options.auracallBin,
    args: [
      'api',
      'archive',
      ...apiPortArgs(options.port),
      '--kind',
      'generated_artifact',
      '--query',
      options.mediaGenerationId,
      '--file-available',
      'true',
      '--asset-availability',
      'available',
      '--limit',
      '5',
      '--json',
    ],
  });
}

async function readSearchViaCli(options: Options): Promise<unknown> {
  return runAuracallJson({
    auracallBin: options.auracallBin,
    args: [
      'api',
      'search',
      ...apiPortArgs(options.port),
      '--query',
      options.mediaGenerationId,
      '--kind',
      'artifact',
      '--file-available',
      'true',
      '--asset-availability',
      'available',
      '--limit',
      '5',
      '--json',
    ],
  });
}

async function readSearchProjectionViaMcp(options: Options): Promise<unknown> {
  const client = new Client({ name: 'auracall-asset-readback-parity-smoke', version: '0.0.0' });
  let stderr = '';
  const transport = new StdioClientTransport({
    command: options.mcpBin,
    env: {
      ...process.env,
      AURACALL_DISABLE_KEYTAR: '1',
    },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools({}, { timeout: 15_000 });
    if (!tools.tools.some((tool) => tool.name === 'search_projection')) {
      throw new Error('Installed MCP did not list search_projection.');
    }
    const result = await client.callTool({
      name: 'search_projection',
      arguments: {
        query: options.mediaGenerationId,
        kind: 'artifact',
        fileAvailable: true,
        assetAvailability: 'available',
        limit: 5,
      },
    }, undefined, { timeout: 20_000 });
    return result.structuredContent;
  } finally {
    await client.close().catch(() => {});
    transport.close?.();
    if (stderr.trim().length > 0 && process.env.AURACALL_SMOKE_DEBUG_STDERR === '1') {
      console.error(stderr.trim());
    }
  }
}

function assertArchiveResult(payload: unknown, mediaGenerationId: string): string {
  const record = asRecord(payload, 'archive payload');
  assertEqual(record.object, 'run_archive', 'archive object');
  const items = asArray(record.items, 'archive items');
  const item = items.map((entry) => asRecord(entry, 'archive item')).find((entry) =>
    String(entry.id ?? '').includes(mediaGenerationId)
      && entry.kind === 'generated_artifact'
      && entry.fileAvailable === true
      && asRecord(entry.links, 'archive item links').asset,
  );
  if (!item) {
    throw new Error(`Archive CLI did not return an available generated artifact for ${mediaGenerationId}.`);
  }
  return String(item.id);
}

function assertSearchResult(payload: unknown, mediaGenerationId: string, label: string): string {
  const record = asRecord(payload, `${label} payload`);
  assertEqual(record.object, 'search_results', `${label} object`);
  const rows = asArray(record.rows, `${label} rows`);
  const row = rows.map((entry) => asRecord(entry, `${label} row`)).find((entry) => {
    const metadata = asRecord(entry.metadata, `${label} row metadata`);
    return String(entry.itemId ?? '').includes(mediaGenerationId)
      && entry.kind === 'artifact'
      && metadata.fileAvailable === true
      && asRecord(entry.links, `${label} row links`).asset;
  });
  if (!row) {
    throw new Error(`${label} did not return an available artifact row for ${mediaGenerationId}.`);
  }
  return String(row.itemId);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}: expected object.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label}: expected array.`);
  }
  return value;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const archive = await readArchiveViaCli(options);
  const archiveItemId = assertArchiveResult(archive, options.mediaGenerationId);
  const search = await readSearchViaCli(options);
  const searchItemId = assertSearchResult(search, options.mediaGenerationId, 'CLI search');
  const mcpSearch = await readSearchProjectionViaMcp(options);
  const mcpItemId = assertSearchResult(mcpSearch, options.mediaGenerationId, 'MCP search_projection');
  if (searchItemId !== archiveItemId || mcpItemId !== archiveItemId) {
    throw new Error(`Parity mismatch: archive=${archiveItemId}, cliSearch=${searchItemId}, mcp=${mcpItemId}.`);
  }
  console.log(JSON.stringify({
    ok: true,
    mediaGenerationId: options.mediaGenerationId,
    archiveItemId,
    checks: {
      apiArchive: 'available',
      apiSearch: 'available',
      mcpSearchProjection: 'available',
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
