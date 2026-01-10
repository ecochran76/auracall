import net from 'node:net';
import type { BrowserLogger } from './types.js';

export const DEFAULT_DEBUG_PORT = 9222;
export const DEFAULT_DEBUG_PORT_RANGE: [number, number] = [45000, 45100];

export async function pickAvailableDebugPort(
  preferredPort: number,
  logger: BrowserLogger,
  range: [number, number] | null,
): Promise<number> {
  if (range) {
    const [start, end] = range;
    for (let port = start; port <= end; port++) {
      if (await isPortAvailable(port)) {
        return port;
      }
    }
    const fallback = await findEphemeralPort();
    logger(`DevTools ports ${start}-${end} are occupied; falling back to ${fallback}.`);
    return fallback;
  }
  const start = Number.isFinite(preferredPort) && preferredPort > 0 ? preferredPort : DEFAULT_DEBUG_PORT;
  for (let offset = 0; offset < 10; offset++) {
    const candidate = start + offset;
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }
  const fallback = await findEphemeralPort();
  logger(`DevTools ports ${start}-${start + 9} are occupied; falling back to ${fallback}.`);
  return fallback;
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      server.close();
      reject(error);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to acquire ephemeral port')));
      }
    });
  });
}
