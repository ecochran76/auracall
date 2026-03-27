import net from 'node:net';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isWslEnvironment, normalizeComparablePath } from './platformPaths.js';
import { resolveChromeEndpoint, resolveWindowsPowerShellPath, WINDOWS_LOOPBACK_REMOTE_HOST } from './windowsLoopbackRelay.js';

const execFileAsync = promisify(execFile);

type ChromeProcessMatch = {
  pid: number;
  port: number | null;
  commandLine: string;
};

export function isProcessAlive(pid: number | undefined | null): boolean {
  if (pid == null || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means "exists but no permission"; treat as alive.
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'EPERM') {
      return true;
    }
    return false;
  }
}

export async function isPortOpen(host: string, port: number): Promise<boolean> {
  if (!port || port <= 0 || port > 65535) {
    return false;
  }
  const endpoint = await resolveChromeEndpoint(host, port);
  try {
    return await new Promise((resolve) => {
      const socket = net.createConnection({ host: endpoint.host, port: endpoint.port });
      let settled = false;
      const cleanup = (result: boolean) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        socket.end();
        socket.destroy();
        socket.unref();
        resolve(result);
      };
      const timer = setTimeout(() => cleanup(false), 1000);
      socket.once('connect', () => {
        clearTimeout(timer);
        cleanup(true);
      });
      socket.once('error', () => {
        clearTimeout(timer);
        cleanup(false);
      });
    });
  } finally {
    await endpoint.dispose?.().catch(() => undefined);
  }
}

export async function isDevToolsResponsive({
  port,
  host = '127.0.0.1',
  attempts = 1,
  timeoutMs = 1000,
}: {
  port: number;
  host?: string;
  attempts?: number;
  timeoutMs?: number;
}): Promise<boolean> {
  const endpoint = await resolveChromeEndpoint(host, port);
  const versionUrl = `http://${endpoint.host}:${endpoint.port}/json/version`;
  try {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(versionUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          return true;
        }
      } catch {
        // ignore errors until final attempt
      }
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    return false;
  } finally {
    await endpoint.dispose?.().catch(() => undefined);
  }
}

/**
 * Robustly checks if a Chrome process is alive and matches the expected profile.
 * Prevents false positives from PID reuse.
 */
export async function isChromeAlive(
  pid: number | undefined | null,
  userDataDir: string,
  port?: number,
  allChromeProcesses?: Map<string, number>,
  host = '127.0.0.1',
): Promise<boolean> {
  if (isWsl() && isWindowsUserDataDir(userDataDir)) {
    if (port && await probeWindowsLocalDevToolsPort(port)) {
      return true;
    }
    if (!pid || !await isWindowsProcessAlive(pid)) {
      return false;
    }
    if (port) {
      const effectiveHost =
        host && host !== '127.0.0.1'
          ? host
          : WINDOWS_LOOPBACK_REMOTE_HOST;
      return isDevToolsResponsive({ port, host: effectiveHost });
    }
    return true;
  }
  // 1. Fast, cheap check: does the PID exist?
  if (!isProcessAlive(pid)) {
    return false;
  }

  // 2. Robust check: does the PID belong to a Chrome using our profile?
  const verifiedPid = allChromeProcesses
    ? allChromeProcesses.get(userDataDir)
    : await findChromePidUsingUserDataDir(userDataDir);
  
  // verifiedPid is the PID of the Chrome process running with this userDataDir.
  // If null, no Chrome is running with this profile -> our PID is a zombie/reused.
  if (!verifiedPid) {
    return false;
  }
  
  // If we found a Chrome, but it has a DIFFERENT PID, then our PID is definitely stale.
  // (The user might have restarted Chrome manually or a new session started).
  if (pid !== verifiedPid) {
    return false;
  }

  // 3. Optional Service check: is the DevTools port actually responsive?
  if (port) {
    // If the port is specified, we expect it to be open and speaking DevTools protocol.
    // We trust the process check more, but this confirms the service is ready/healthy.
    return isDevToolsResponsive({ port, host });
  }

  return true;
}

/**
 * Returns a map of userDataDir to PID for all running Chrome/Chromium processes.
 * Used to optimize session listing.
 */
export async function findAllChromeProcesses(): Promise<Map<string, number>> {
  if (process.platform === 'win32') {
    return findAllChromeProcessesWin32();
  }
  return findAllChromeProcessesUnix();
}

async function findAllChromeProcessesUnix(): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  try {
    const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'pid,args'], { maxBuffer: 10 * 1024 * 1024 });
    const lines = String(stdout ?? '').split('\n');
    for (const line of lines) {
      if (!line) continue;
      const match = line.match(/^\s*(\d+)\s+(.*)$/);
      if (!match) continue;
      
      const pid = parseInt(match[1], 10);
      const cmd = match[2];
      const lower = cmd.toLowerCase();
      
      if (!lower.includes('chrome') && !lower.includes('chromium')) continue;
      
      // Extract --user-data-dir=...
      const dirMatch = cmd.match(/--(?:user-data-dir|user-data-dir)=["']?([^"'\s]+)["']?/);
      if (dirMatch?.[1]) {
        results.set(dirMatch[1], pid);
      }
    }
  } catch {
    // best effort
  }
  return results;
}

async function findAllChromeProcessesWin32(): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  const processes = await listChromeProcessesViaPowerShell('powershell');
  for (const proc of processes) {
    const userDataDir = extractUserDataDirFromCommandLine(proc.commandLine);
    if (userDataDir) {
      results.set(userDataDir, proc.processId);
    }
  }
  return results;
}

export async function findChromePidUsingUserDataDir(userDataDir: string): Promise<number | null> {
  const match = await findChromeProcessUsingUserDataDir(userDataDir);
  return match?.pid ?? null;
}

export async function findChromeProcessUsingUserDataDir(userDataDir: string): Promise<ChromeProcessMatch | null> {
  if (isWsl() && isWindowsUserDataDir(userDataDir)) {
    return findWindowsChromeProcessUsingUserDataDir(userDataDir);
  }
  if (process.platform === 'win32') {
    return findChromeProcessWin32(userDataDir);
  }
  return findChromeProcessUnix(userDataDir);
}

export async function findWindowsChromePidUsingTasklist(): Promise<number | null> {
  const match = await findWindowsChromeProcessUsingTasklist();
  return match?.pid ?? null;
}

async function findWindowsChromeProcessUsingTasklist(): Promise<ChromeProcessMatch | null> {
  if (!isWsl()) {
    return null;
  }
  try {
    const { stdout } = await execFileAsync('tasklist.exe', [
      '/FI', 'IMAGENAME eq chrome.exe',
      '/FO', 'CSV',
      '/NH',
    ], { timeout: 5000, maxBuffer: 1024 * 1024 });
    const lines = String(stdout ?? '').trim().split('\n').filter(Boolean);
    const pids = lines
      .map((line) => line.trim())
      .filter((line) => !line.toLowerCase().includes('no tasks'))
      .map((line) => {
        const parts = line.split('","').map((chunk) => chunk.replace(/^"|"$/g, ''));
        const pidValue = Number.parseInt(parts[1] ?? '', 10);
        return Number.isFinite(pidValue) ? pidValue : null;
      })
      .filter((value): value is number => typeof value === 'number');
    if (pids.length === 0) {
      return null;
    }
    return { pid: pids[0], port: null, commandLine: '' };
  } catch {
    return null;
  }
}

async function isWindowsProcessAlive(pid: number): Promise<boolean> {
  if (!isWsl() || !pid) {
    return false;
  }
  try {
    const { stdout } = await execFileAsync('tasklist.exe', [
      '/FI', `PID eq ${pid}`,
      '/FO', 'CSV',
      '/NH',
    ], { timeout: 5000, maxBuffer: 1024 * 1024 });
    const output = String(stdout ?? '').trim();
    if (!output) return false;
    if (output.toLowerCase().includes('no tasks')) return false;
    return true;
  } catch {
    return false;
  }
}

function isWindowsUserDataDir(userDataDir: string): boolean {
  return /^\/mnt\/[a-z]\/users\//.test(normalizeComparablePath(userDataDir));
}

function isWsl(): boolean {
  return isWslEnvironment();
}

async function findChromeProcessUnix(userDataDir: string): Promise<ChromeProcessMatch | null> {
  try {
    // -o pid,args to get PID and command line
    const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'pid,args'], { maxBuffer: 10 * 1024 * 1024 });
    const lines = String(stdout ?? '').split('\n');
    const needle = userDataDir;
    for (const line of lines) {
      if (!line) continue;
      // Line format: "  PID COMMAND..."
      const match = line.match(/^\s*(\d+)\s+(.*)$/);
      if (!match) continue;
      
      const pid = parseInt(match[1], 10);
      const cmd = match[2];
      const lower = cmd.toLowerCase();
      
      if (!lower.includes('chrome') && !lower.includes('chromium')) continue;
      if (cmd.includes(needle) && (lower.includes('--user-data-dir') || lower.includes('/user-data-dir'))) {
        return {
          pid,
          port: extractRemoteDebugPort(cmd),
          commandLine: cmd,
        };
      }
    }
  } catch {
    // best effort
  }
  return null;
}

async function findChromeProcessWin32(userDataDir: string): Promise<ChromeProcessMatch | null> {
  const processes = await listChromeProcessesViaPowerShell('powershell');
  return findChromeProcessMatchForUserDataDir(processes, userDataDir);
}

async function findWindowsChromeProcessUsingUserDataDir(userDataDir: string): Promise<ChromeProcessMatch | null> {
  const processes = await listChromeProcessesViaPowerShell(resolveWindowsPowerShellPathForWsl());
  return findChromeProcessMatchForUserDataDir(processes, userDataDir);
}

function findChromeProcessMatchForUserDataDir(
  processes: Array<{ processId: number; commandLine: string }>,
  userDataDir: string,
): ChromeProcessMatch | null {
  return findChromeProcessMatchesForUserDataDir(processes, userDataDir)[0] ?? null;
}

function findChromeProcessMatchesForUserDataDir(
  processes: Array<{ processId: number; commandLine: string }>,
  userDataDir: string,
): ChromeProcessMatch[] {
  const needle = normalizeChromeUserDataDir(userDataDir);
  const matches: ChromeProcessMatch[] = [];
  for (const proc of processes) {
    const parsedUserDataDir = extractUserDataDirFromCommandLine(proc.commandLine);
    if (!parsedUserDataDir) {
      continue;
    }
    if (normalizeChromeUserDataDir(parsedUserDataDir) !== needle) {
      continue;
    }
    matches.push({
      pid: proc.processId,
      port: extractRemoteDebugPort(proc.commandLine),
      commandLine: proc.commandLine,
    });
  }
  return matches;
}

async function listChromeProcessesViaPowerShell(
  executable: string,
): Promise<Array<{ processId: number; commandLine: string }>> {
  try {
    const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*chrome*' -or $_.Name -like '*chromium*' } | Select-Object ProcessId, CommandLine | ConvertTo-Json`;
    const { stdout } = await execFileAsync(executable, ['-NoProfile', '-Command', script], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 5000,
    });

    if (!stdout || !stdout.trim()) {
      return [];
    }

    const parsed = JSON.parse(stdout) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .map((row) => {
        const record = row as Record<string, unknown>;
        const processId = Number(record.ProcessId ?? record.processId);
        const commandLine =
          typeof record.CommandLine === 'string'
            ? record.CommandLine
            : typeof record.commandLine === 'string'
              ? record.commandLine
              : '';
        return { processId, commandLine };
      })
      .filter((proc) => Number.isFinite(proc.processId) && proc.processId > 0 && proc.commandLine.length > 0);
  } catch {
    return [];
  }
}

function extractUserDataDirFromCommandLine(commandLine: string): string | null {
  const match = commandLine.match(/--user-data-dir(?:=|\s+)(?:\"([^\"]+)\"|'([^']+)'|([^\s]+))/i);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function extractRemoteDebugPort(commandLine: string): number | null {
  const match = commandLine.match(/--remote-debugging-port(?:=|\s+)(\d+)/i);
  const value = Number.parseInt(match?.[1] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeChromeUserDataDir(value: string): string {
  return normalizeComparablePath(value);
}

function resolveWindowsPowerShellPathForWsl(): string {
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

export async function probeWindowsLocalDevToolsPort(
  port: number,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<boolean> {
  if (!isWsl() || !port || port <= 0 || port > 65535) {
    return false;
  }
  const attempts = Math.max(1, options.attempts ?? 1);
  const delayMs = Math.max(0, options.delayMs ?? 0);
  const script = `
$ProgressPreference = 'SilentlyContinue'
$uri = 'http://127.0.0.1:${port}/json/version'
for ($i = 0; $i -lt ${attempts}; $i++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $uri -TimeoutSec 1
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
      exit 0
    }
  } catch {
  }
  if ($i -lt ${attempts - 1}) {
    Start-Sleep -Milliseconds ${delayMs}
  }
}
exit 1
`;
  try {
    await execFileAsync(
      resolveWindowsPowerShellPath(),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: attempts * (delayMs + 1_500) + 2_000, maxBuffer: 1024 * 1024 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function findResponsiveWindowsDevToolsPortForUserDataDir(
  userDataDir: string,
): Promise<number | null> {
  if (!isWsl() || !isWindowsUserDataDir(userDataDir)) {
    return null;
  }
  const processes = await listChromeProcessesViaPowerShell(resolveWindowsPowerShellPathForWsl());
  const matches = findChromeProcessMatchesForUserDataDir(processes, userDataDir);
  const candidatePorts = Array.from(new Set(
    matches
      .map((match) => match.port)
      .filter((port): port is number => typeof port === 'number' && Number.isFinite(port) && port > 0),
  ));

  for (const port of candidatePorts) {
    if (await probeWindowsLocalDevToolsPort(port)) {
      return port;
    }
  }

  const candidatePids = Array.from(new Set(
    matches
      .map((match) => match.pid)
      .filter((pid) => Number.isFinite(pid) && pid > 0),
  ));
  if (candidatePids.length === 0) {
    return null;
  }

  const pidList = candidatePids.join(',');
  const script = `
$ProgressPreference = 'SilentlyContinue'
$candidatePids = @(${pidList})
$candidatePorts = [System.Collections.Generic.List[int]]::new()
foreach ($pidValue in $candidatePids) {
  try {
    Get-NetTCPConnection -State Listen -OwningProcess $pidValue -ErrorAction Stop |
      ForEach-Object {
        if ($_.LocalPort -gt 0 -and -not $candidatePorts.Contains([int]$_.LocalPort)) {
          $candidatePorts.Add([int]$_.LocalPort)
        }
      }
  } catch {
  }
}
foreach ($port in $candidatePorts) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing ('http://127.0.0.1:' + $port + '/json/version') -TimeoutSec 1
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
      Write-Output $port
      exit 0
    }
  } catch {
  }
}
exit 1
`;
  try {
    const { stdout } = await execFileAsync(
      resolveWindowsPowerShellPath(),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 10_000, maxBuffer: 1024 * 1024 },
    );
    const value = Number.parseInt(String(stdout ?? '').trim().split(/\r?\n/u).at(-1) ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
