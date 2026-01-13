import { describe, expect, test } from 'vitest';
import net from 'node:net';
import { pickAvailableDebugPort } from '../../packages/browser-service/src/portSelection.js';

function listenEphemeral(): Promise<net.Server & { port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to acquire ephemeral port'));
        return;
      }
      resolve(Object.assign(server, { port: address.port }));
    });
  });
}

describe('portSelection', () => {
  test('falls back when the requested range is fully occupied', async () => {
    const server = await listenEphemeral();
    const logs: string[] = [];
    try {
      const chosen = await pickAvailableDebugPort(
        server.port,
        (message) => logs.push(message),
        [server.port, server.port],
      );
      expect(chosen).not.toBe(server.port);
      expect(logs.some((line) => line.includes('DevTools ports'))).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('chooses the first free port in the range', async () => {
    const server = await listenEphemeral();
    const logs: string[] = [];
    try {
      const chosen = await pickAvailableDebugPort(
        server.port,
        (message) => logs.push(message),
        [server.port, server.port + 2],
      );
      expect(chosen).toBe(server.port + 1);
      expect(logs.length).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
