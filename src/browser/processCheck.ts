import net from 'node:net';
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
    const timer = setTimeout(() => cleanup(false), 250);
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

export async function isChromeUsingUserDataDir(userDataDir: string): Promise<boolean> {
  if (process.platform === 'win32') {
    // On Windows, checking command lines is expensive/complex.
    // Ideally use `wmic process where "name='chrome.exe'" get commandline` but parsing is fragile.
    // For now, assume false and let the lockfile logic in profileState handle it (or let launch fail).
    return false;
  }

  try {
    const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'command='], { maxBuffer: 10 * 1024 * 1024 });
    const lines = String(stdout ?? '').split('\n');
    const needle = userDataDir;
    for (const line of lines) {
      if (!line) continue;
      const lower = line.toLowerCase();
      if (!lower.includes('chrome') && !lower.includes('chromium')) continue;
      // Exact check for user-data-dir flag to avoid partial matches
      if (line.includes(needle) && (lower.includes('--user-data-dir') || lower.includes('/user-data-dir'))) {
        return true;
      }
    }
  } catch {
    // best effort
  }
  return false;
}
