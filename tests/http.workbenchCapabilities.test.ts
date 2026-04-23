import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';

describe('http workbench capability adapter', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('lists filtered workbench capabilities through the local API', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-workbench-capabilities-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const server = await createResponsesHttpServer(
      { host: '127.0.0.1', port: 0 },
      {
        now: () => new Date('2026-04-23T12:00:00.000Z'),
      },
    );

    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/v1/workbench-capabilities?provider=chatgpt&category=app`,
      );
      expect(response.status).toBe(200);
      const report = (await response.json()) as Record<string, unknown>;
      expect(report).toMatchObject({
        object: 'workbench_capability_report',
        generatedAt: '2026-04-23T12:00:00.000Z',
        provider: 'chatgpt',
        category: 'app',
        summary: {
          total: 1,
          accountGated: 1,
        },
        capabilities: [
          {
            id: 'chatgpt.apps',
            provider: 'chatgpt',
            category: 'app',
            availability: 'account_gated',
          },
        ],
      });
    } finally {
      await server.close();
    }
  });

  it('advertises workbench capability discovery in status routes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-workbench-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/status`);
      const status = (await response.json()) as Record<string, { workbenchCapabilitiesList?: string }>;
      expect(status.routes.workbenchCapabilitiesList).toContain('/v1/workbench-capabilities');
    } finally {
      await server.close();
    }
  });
});
