import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('gemini-web upload metadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends image uploads with an image mime type', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-gemini-upload-'));
    const filePath = path.join(tempDir, 'input.png');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/Pm2zXwAAAABJRU5ErkJggg==',
      'base64',
    );
    await writeFile(filePath, png);

    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = String(url);
      if (target === 'https://gemini.google.com/app') {
        return new Response('<html>"SNlM0e":"token"</html>', { status: 200 });
      }
      if (target === 'https://content-push.googleapis.com/upload') {
        const form = init?.body as FormData;
        const uploaded = form.get('file');
        expect(uploaded).toBeInstanceOf(File);
        expect((uploaded as File).type).toBe('image/png');
        return new Response('upload-id', { status: 200 });
      }
      if (target.includes('/StreamGenerate')) {
        const params = new URLSearchParams(String(init?.body ?? ''));
        const freq = params.get('f.req');
        expect(freq).toBeTruthy();
        const outer = JSON.parse(freq!) as [unknown, string];
        const inner = JSON.parse(outer[1]) as unknown[];
        const promptPayload = inner[0] as unknown[];
        expect(promptPayload[3]).toEqual([[['upload-id', 1, null, 'image/png'], 'input.png']]);
        return new Response('[[null,null,"[null,[null],null,null,[["ok"]]]"]]', { status: 200 });
      }
      throw new Error(`Unexpected fetch target: ${target}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { runGeminiWebOnce } = await import('../../src/gemini-web/client.js');

    await runGeminiWebOnce({
      prompt: 'Describe the uploaded image.',
      files: [filePath],
      model: 'gemini-3-pro',
      cookieMap: {
        '__Secure-1PSID': 'psid',
        '__Secure-1PSIDTS': 'psidts',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://content-push.googleapis.com/upload',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('classifies control-only upload responses as attachment failures', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-gemini-upload-'));
    const filePath = path.join(tempDir, 'input.png');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/Pm2zXwAAAABJRU5ErkJggg==',
      'base64',
    );
    await writeFile(filePath, png);

    const fetchMock = vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target === 'https://gemini.google.com/app') {
        return new Response('<html>"SNlM0e":"token"</html>', { status: 200 });
      }
      if (target === 'https://content-push.googleapis.com/upload') {
        return new Response('/contrib_service/ttl_1d/example-upload-token', { status: 200 });
      }
      if (target.includes('/StreamGenerate')) {
        return new Response(
          `)]}'\n\n${JSON.stringify([
            ['wrb.fr', null, null, null, null, [13]],
            ['di', 95],
            ['af.httprm', 95, '8263098893679973246', 24],
          ])}`,
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch target: ${target}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { runGeminiWebOnce } = await import('../../src/gemini-web/client.js');
    const out = await runGeminiWebOnce({
      prompt: 'Describe the uploaded image.',
      files: [filePath],
      model: 'gemini-3-pro',
      cookieMap: {
        '__Secure-1PSID': 'psid',
        '__Secure-1PSIDTS': 'psidts',
      },
    });

    expect(out.text).toBe('');
    expect(out.errorMessage).toBe(
      'Gemini accepted the attachment request but returned control frames only and never materialized a response body.',
    );
  });
});
