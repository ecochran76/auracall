import net from 'node:net';
import { once } from 'node:events';
import { afterEach, describe, expect, test } from 'vitest';
import {
  createTcpRelayServer,
  isWindowsLoopbackRemoteHost,
  WINDOWS_LOOPBACK_REMOTE_HOST,
} from '../../packages/browser-service/src/windowsLoopbackRelay.js';

const cleanupTasks: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanupTasks.length > 0) {
    const task = cleanupTasks.pop();
    await task?.();
  }
});

describe('windowsLoopbackRelay', () => {
  test('recognizes the Windows loopback remote host alias', () => {
    expect(isWindowsLoopbackRemoteHost(WINDOWS_LOOPBACK_REMOTE_HOST)).toBe(true);
    expect(isWindowsLoopbackRemoteHost('WINDOWS-LOOPBACK')).toBe(true);
    expect(isWindowsLoopbackRemoteHost('127.0.0.1')).toBe(false);
  });

  test('createTcpRelayServer proxies bidirectional traffic', async () => {
    const upstreamServer = net.createServer((socket) => {
      socket.on('data', (chunk) => {
        socket.write(chunk);
      });
    });
    upstreamServer.listen(0, '127.0.0.1');
    await once(upstreamServer, 'listening');
    const upstreamAddress = upstreamServer.address();
    if (!upstreamAddress || typeof upstreamAddress !== 'object') {
      throw new Error('Upstream server did not expose a TCP address');
    }
    cleanupTasks.push(() => new Promise<void>((resolve) => upstreamServer.close(() => resolve())));

    const relay = await createTcpRelayServer(async () => {
      const upstream = net.createConnection({ host: '127.0.0.1', port: upstreamAddress.port });
      await once(upstream, 'connect');
      return {
        readable: upstream,
        writable: upstream,
        close: () => { upstream.destroy(); },
      };
    });
    cleanupTasks.push(() => relay.close());

    const client = net.createConnection({ host: relay.host, port: relay.port });
    await once(client, 'connect');
    cleanupTasks.push(() => { client.destroy(); });

    client.write('ping');
    const [chunk] = await once(client, 'data');
    expect(String(chunk)).toBe('ping');
  });
});
