import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { RemoteViewApplication } from '../../src/browser/service/remoteViewApplication.js';

describe('native Remote View application boundary', () => {
  it('requests the configured application inventory and joins exact live assignment generations', async () => {
    const requests: unknown[] = [];
    const inventory = {
      schemaVersion: 1,
      registration: { consumerKey: 'auracall', registrationId: 'registration-a' },
      pools: [{ poolId: 'pool-a', registrationId: 'registration-a', name: 'main', desktopMembers: ['desktop-a', 'desktop-b'] }],
      assignments: [
        { assignmentId: 'assignment-a', registrationId: 'registration-a', poolId: 'pool-a', desktopId: 'desktop-a', generation: 2, state: 'active' },
        { assignmentId: 'assignment-b', registrationId: 'foreign', poolId: 'pool-a', desktopId: 'desktop-b', generation: 2, state: 'active' },
      ],
      desktops: ['desktop-a', 'desktop-b'].map(desktopId => ({ desktopId,
        lifecycle: { generation: 2, state: 'ready', readinessScope: 'live_resource', allocated: true },
        viewing: { lifecycleGeneration: 2, generation: 7, desktopId: `viewer-${desktopId}`, publicRoute: '/1' },
      })),
    };
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      requests.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks).toString()) });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(inventory));
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing fixture port');
      const app = new RemoteViewApplication({ origin: `http://127.0.0.1:${address.port}`, application: 'auracall' });
      expect(await app.listReadyAssignments('main')).toEqual([{ assignmentId: 'assignment-a', desktopId: 'desktop-a', generation: 2, viewingGeneration: 7 }]);
      expect(requests).toEqual([{ path: '/v1/consumer', body: { application: 'auracall', request: { operation: 'inventory' } } }]);
      const firstDesktop = inventory.desktops[0];
      if (!firstDesktop) throw new Error('missing fixture desktop');
      firstDesktop.viewing.lifecycleGeneration = 3;
      expect(await app.listReadyAssignments('main')).toEqual([]);
      inventory.registration.consumerKey = 'foreign';
      await expect(app.listReadyAssignments('main')).rejects.toThrow('application identity');
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });

  it('refuses control origins with remote hosts, credentials, paths or query state', () => {
    for (const origin of ['https://127.0.0.1', 'http://example.com', 'http://user@127.0.0.1', 'http://127.0.0.1/path', 'http://127.0.0.1?token=secret']) {
      expect(() => new RemoteViewApplication({ origin, application: 'auracall' })).toThrow('loopback HTTP origin');
    }
  });
});
