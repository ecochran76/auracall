import net from 'node:net';
import os from 'node:os';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { BrowserLogger } from './types.js';

export const WINDOWS_LOOPBACK_REMOTE_HOST = 'windows-loopback';

export type ResolvedChromeEndpoint = {
  host: string;
  port: number;
  dispose?: () => Promise<void>;
};

type RelayConnector = {
  readable: NodeJS.ReadableStream;
  writable: NodeJS.WritableStream;
  close?: () => void | Promise<void>;
};

type RelayServer = {
  host: string;
  port: number;
  close: () => Promise<void>;
};

type RelayServerOptions = {
  host?: string;
  logger?: BrowserLogger;
};

export function isWindowsLoopbackRemoteHost(host: string): boolean {
  return host.trim().toLowerCase() === WINDOWS_LOOPBACK_REMOTE_HOST;
}

export async function resolveChromeEndpoint(
  host: string | undefined,
  port: number,
  logger: BrowserLogger = () => undefined,
): Promise<ResolvedChromeEndpoint> {
  const resolvedHost = host ?? '127.0.0.1';
  if (!isWindowsLoopbackRemoteHost(resolvedHost)) {
    return { host: resolvedHost, port };
  }
  if (!isWsl()) {
    throw new Error(`Remote Chrome host "${WINDOWS_LOOPBACK_REMOTE_HOST}" is only supported from WSL.`);
  }
  const relay = await createWindowsLoopbackRelay(port, logger);
  return {
    host: relay.host,
    port: relay.port,
    dispose: relay.close,
  };
}

export async function ensureDetachedWindowsLoopbackRelay(
  targetPort: number,
  logger: BrowserLogger,
  options: {
    listenPort?: number;
    listenHost?: string;
    targetHost?: string;
  } = {},
): Promise<{ host: string; port: number; pid?: number; reused: boolean }> {
  if (!isWsl()) {
    throw new Error('Detached Windows loopback relay is only supported from WSL.');
  }
  const listenHost = options.listenHost ?? '127.0.0.1';
  const listenPort = options.listenPort ?? targetPort;
  const targetHost = options.targetHost ?? '127.0.0.1';
  if (await waitForLocalPort(listenHost, listenPort, 250)) {
    return { host: listenHost, port: listenPort, reused: true };
  }

  const powershellPath = resolveWindowsPowerShellPath();
  const relayChild = spawn(process.execPath, ['-e', buildDetachedWindowsLoopbackRelayScript()], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      AURACALL_WINDOWS_LOOPBACK_LISTEN_HOST: listenHost,
      AURACALL_WINDOWS_LOOPBACK_LISTEN_PORT: String(listenPort),
      AURACALL_WINDOWS_LOOPBACK_TARGET_HOST: targetHost,
      AURACALL_WINDOWS_LOOPBACK_TARGET_PORT: String(targetPort),
      AURACALL_WINDOWS_LOOPBACK_POWERSHELL: powershellPath,
      AURACALL_WINDOWS_LOOPBACK_POWERSHELL_COMMAND: Buffer.from(
        buildWindowsLoopbackConnectorScript(targetHost, targetPort),
        'utf16le',
      ).toString('base64'),
    },
  });
  relayChild.unref();

  if (!await waitForLocalPort(listenHost, listenPort, 2_000)) {
    throw new Error(`Detached Windows loopback relay did not start on ${listenHost}:${listenPort}.`);
  }
  logger(`Started detached Windows loopback relay on ${listenHost}:${listenPort} -> ${targetHost}:${targetPort}`);
  return {
    host: listenHost,
    port: listenPort,
    pid: relayChild.pid ?? undefined,
    reused: false,
  };
}

export async function createTcpRelayServer(
  createConnector: () => Promise<RelayConnector>,
  options: RelayServerOptions = {},
): Promise<RelayServer> {
  const host = options.host ?? '127.0.0.1';
  const logger = options.logger ?? (() => undefined);
  const server = net.createServer();
  const activeSockets = new Set<net.Socket>();
  const activeClosers = new Set<() => void | Promise<void>>();

  server.on('connection', async (socket) => {
    activeSockets.add(socket);
    socket.setNoDelay(true);

    let connector: RelayConnector | null = null;
    let settled = false;

    const cleanup = async () => {
      if (settled) return;
      settled = true;
      activeSockets.delete(socket);
      socket.removeAllListeners();
      socket.destroy();
      if (connector?.close) {
        activeClosers.delete(connector.close);
        await Promise.resolve(connector.close()).catch(() => undefined);
      }
    };

    try {
      connector = await createConnector();
      if (connector.close) {
        activeClosers.add(connector.close);
      }
      socket.pipe(connector.writable);
      connector.readable.pipe(socket);

      socket.once('error', () => void cleanup());
      socket.once('close', () => void cleanup());
      connector.readable.once('error', () => void cleanup());
      connector.writable.once?.('error', () => void cleanup());
      connector.readable.once('close', () => void cleanup());
      connector.readable.once('end', () => void cleanup());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`Windows loopback relay connection failed: ${message}`);
      await cleanup();
    }
  });

  server.listen(0, host);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('Relay server failed to acquire a local listening port.');
  }

  const close = async () => {
    for (const socket of activeSockets) {
      socket.destroy();
    }
    activeSockets.clear();
    for (const closer of Array.from(activeClosers)) {
      await Promise.resolve(closer()).catch(() => undefined);
    }
    activeClosers.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return {
    host,
    port: address.port,
    close,
  };
}

export async function createWindowsLoopbackRelay(
  targetPort: number,
  logger: BrowserLogger,
  targetHost = '127.0.0.1',
): Promise<RelayServer> {
  return createTcpRelayServer(async () => {
    const child = spawnWindowsLoopbackConnector(targetHost, targetPort);
    const cleanup = createChildCleanup(child);
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        const text = String(chunk ?? '').trim();
        if (text) {
          logger(`[windows-loopback-relay] ${text}`);
        }
      });
    }
    child.once('error', () => void cleanup());
    child.once('exit', () => void cleanup());
    return {
      readable: child.stdout,
      writable: child.stdin,
      close: cleanup,
    };
  }, { logger });
}

function spawnWindowsLoopbackConnector(targetHost: string, targetPort: number): ChildProcessWithoutNullStreams {
  const powershellPath = resolveWindowsPowerShellPath();
  const script = buildWindowsLoopbackConnectorScript(targetHost, targetPort);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return spawn(
    powershellPath,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
}

function createChildCleanup(child: ChildProcessWithoutNullStreams): () => Promise<void> {
  let cleaned = false;
  return async () => {
    if (cleaned) return;
    cleaned = true;
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
    if (!child.killed) {
      child.kill();
    }
    await once(child, 'exit').catch(() => undefined);
  };
}

export function resolveWindowsPowerShellPath(): string {
  const override = process.env.AURACALL_WINDOWS_POWERSHELL_PATH?.trim();
  if (override) {
    return override;
  }
  const candidates = [
    '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/pwsh.exe',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return 'powershell.exe';
}

function buildWindowsLoopbackConnectorScript(targetHost: string, targetPort: number): string {
  const hostLiteral = targetHost.replace(/'/g, "''");
  return `
$ErrorActionPreference = 'Stop'
$targetHost = '${hostLiteral}'
$targetPort = ${targetPort}
$client = [System.Net.Sockets.TcpClient]::new()
$client.NoDelay = $true
$client.Connect($targetHost, $targetPort)
$stream = $client.GetStream()
$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()
$copyIn = $stdin.CopyToAsync($stream)
$copyOut = $stream.CopyToAsync($stdout)
try {
  [System.Threading.Tasks.Task]::WaitAny(@($copyIn, $copyOut)) | Out-Null
} catch {
}
try {
  $client.Client.Shutdown([System.Net.Sockets.SocketShutdown]::Both) | Out-Null
} catch {
}
try {
  $copyIn.Wait(250)
} catch {
}
try {
  $copyOut.Wait(250)
} catch {
}
try {
  $stream.Dispose()
} catch {
}
try {
  $client.Close()
} catch {
}
`.trim();
}

function buildDetachedWindowsLoopbackRelayScript(): string {
  return `
const net = require('node:net');
const { spawn } = require('node:child_process');

const listenHost = process.env.AURACALL_WINDOWS_LOOPBACK_LISTEN_HOST || '127.0.0.1';
const listenPort = Number.parseInt(process.env.AURACALL_WINDOWS_LOOPBACK_LISTEN_PORT || '', 10);
const powershellPath = process.env.AURACALL_WINDOWS_LOOPBACK_POWERSHELL || 'powershell.exe';
const encodedCommand = process.env.AURACALL_WINDOWS_LOOPBACK_POWERSHELL_COMMAND || '';

if (!Number.isFinite(listenPort) || listenPort <= 0) {
  throw new Error('Missing relay listen port');
}

const server = net.createServer((socket) => {
  socket.setNoDelay(true);
  const child = spawn(
    powershellPath,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
    {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    },
  );

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    socket.removeAllListeners();
    socket.destroy();
    child.stdin.destroy();
    child.stdout.destroy();
    if (!child.killed) {
      child.kill();
    }
  };

  socket.pipe(child.stdin);
  child.stdout.pipe(socket);

  socket.once('error', cleanup);
  socket.once('close', cleanup);
  child.stdout.once('error', cleanup);
  child.stdout.once('close', cleanup);
  child.stdout.once('end', cleanup);
  child.once('error', cleanup);
  child.once('exit', cleanup);
});

server.listen(listenPort, listenHost);

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
`.trim();
}

async function waitForLocalPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const opened = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      const cleanup = (result: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(result);
      };
      socket.once('connect', () => cleanup(true));
      socket.once('error', () => cleanup(false));
    });
    if (opened) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

function isWsl(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }
  return os.release().toLowerCase().includes('microsoft');
}
