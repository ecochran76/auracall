import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';

test('the dedicated desktop app serves an owned inventory and passive frames through the operator HTTP boundary', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-http-desktops-'));
  setAuracallHomeDirOverrideForTest(home);
  const calls: string[] = [];
  const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0, tabAffinityMaintenanceIntervalMs: 0 }, { config: { api: { auth: { required: true, keys: [{ id: 'operator', secret: 'fixture-api-key' }] } } }, desktopClient: {
    list: async () => ({ desktops: [{ name: 'research', label: 'Research', state: 'ready' as const, browsers: [{ browserId: 'owned-browser', handoffUrl: 'https://browser.example.test/remote-view/owned' }] }] }),
    capture: async (name, browserId) => { calls.push(`${name}:${browserId}`); return { imageBase64: 'iVBORw0KGgo=', width: 1920, height: 1080 }; },
  } });
  try {
    const base = `http://127.0.0.1:${server.port}`;
    const page = await fetch(`${base}/desktops`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('AuraCall Desktops');
    expect((await fetch(`${base}/v1/desktops`)).status).toBe(401);
    const operatorHeaders = { referer: `${base}/desktops` };
    expect((await (await fetch(`${base}/v1/desktops`, { headers: operatorHeaders })).json()).desktops[0].name).toBe('research');
    const frame = await fetch(`${base}/v1/desktops/research/frame?browser=owned-browser`, { headers: operatorHeaders });
    expect(frame.status).toBe(200);
    expect(frame.headers.get('cache-control')).toBe('no-store');
    expect((await frame.json()).width).toBe(1920);
    expect(calls).toEqual(['research:owned-browser']);
  } finally { await server.close(); setAuracallHomeDirOverrideForTest(null); await fs.rm(home, { recursive: true, force: true }); }
});
