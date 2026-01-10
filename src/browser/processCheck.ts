import net from 'node:net';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
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
  const versionUrl = `http://${host}:${port}/json/version`;
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
): Promise<boolean> {
  if (isWsl() && isWindowsUserDataDir(userDataDir)) {
    if (!pid || !await isWindowsProcessAlive(pid)) {
      return false;
    }
    if (port) {
      return isDevToolsResponsive({ port });
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
    return isDevToolsResponsive({ port });
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
  try {
    const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*chrome*' -or $_.Name -like '*chromium*' } | Select-Object ProcessId, CommandLine | ConvertTo-Json`;
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', script], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 5000,
    });
    
    if (!stdout || !stdout.trim()) return results;

    let processes: Array<{ ProcessId: number; CommandLine: string }> = [];
    try {
      const parsed = JSON.parse(stdout);
      processes = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return results;
    }

    for (const proc of processes) {
      if (!proc.CommandLine) continue;
      const cmd = proc.CommandLine;
      const dirMatch = cmd.match(/--(?:user-data-dir|user-data-dir)=["']?([^"'\s]+)["']?/);
      if (dirMatch?.[1]) {
        // Normalize slashes for consistency if needed, but here we store as-is from cmdline
        results.set(dirMatch[1], proc.ProcessId);
      }
    }
  } catch {
    // best effort
  }
  return results;
}

export async function findChromePidUsingUserDataDir(userDataDir: string): Promise<number | null> {
  if (isWsl() && isWindowsUserDataDir(userDataDir)) {
    return findWindowsChromePidUsingTasklist();
  }
  if (process.platform === 'win32') {
    return findChromePidWin32(userDataDir);
  }
  return findChromePidUnix(userDataDir);
}

export async function findWindowsChromePidUsingTasklist(): Promise<number | null> {
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
    return pids[0];
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
  const normalized = userDataDir.replace(/\\/g, '/').toLowerCase();
  return normalized.startsWith('/mnt/c/users/');
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

async function findChromePidUnix(userDataDir: string): Promise<number | null> {
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
        return pid;
      }
    }
  } catch {
    // best effort
  }
  return null;
}

async function findChromePidWin32(userDataDir: string): Promise<number | null> {
  try {
    const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*chrome*' -or $_.Name -like '*chromium*' } | Select-Object ProcessId, CommandLine | ConvertTo-Json`;
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', script], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 5000,
    });
    
    if (!stdout || !stdout.trim()) return null;

    let processes: Array<{ ProcessId: number; CommandLine: string }> = [];
    try {
      const parsed = JSON.parse(stdout);
      processes = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return null;
    }

    // Normalize slashes for comparison
    const needle = userDataDir.replace(/\\/g, '/').toLowerCase();

    for (const proc of processes) {
      if (!proc.CommandLine) continue;
      const cmd = proc.CommandLine.replace(/\\/g, '/').toLowerCase();
      if (cmd.includes(needle) && (cmd.includes('--user-data-dir') || cmd.includes('/user-data-dir'))) {
        return proc.ProcessId;
      }
    }
  } catch {
    // best effort
  }
  return null;
}
