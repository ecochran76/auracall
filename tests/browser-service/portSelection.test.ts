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

function isPortBindable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

describe('portSelection', () => {
  test('honors an available pinned port even when a range is configured', async () => {
    const server = await listenEphemeral();
    const preferred = await listenEphemeral();
    const logs: string[] = [];
    try {
      const preferredPort = preferred.port;
      await new Promise<void>((resolve) => preferred.close(() => resolve()));
      const chosen = await pickAvailableDebugPort(
        preferredPort,
        (message) => logs.push(message),
        [server.port, server.port + 2],
      );
      expect(chosen).toBe(preferredPort);
      expect(logs.length).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

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
      const expected = (await isPortBindable(server.port + 1)) ? server.port + 1 : server.port + 2;
      const chosen = await pickAvailableDebugPort(
        server.port,
        (message) => logs.push(message),
        [server.port, server.port + 2],
      );
      expect(chosen).toBe(expected);
      expect(logs.length).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('prefers the pinned port when it is inside the range and available', async () => {
    const server = await listenEphemeral();
    const logs: string[] = [];
    try {
      const chosen = await pickAvailableDebugPort(
        server.port + 1,
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
