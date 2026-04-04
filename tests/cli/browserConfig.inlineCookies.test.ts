import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, afterEach } from 'vitest';
import { buildBrowserConfig } from '../../src/cli/browserConfig.js';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';

const model = 'gpt-5.1' as const;

describe('buildBrowserConfig inline cookies', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
    delete process.env.AURACALL_BROWSER_COOKIES_JSON;
    delete process.env.AURACALL_BROWSER_COOKIES_FILE;
  });

  test('loads inline cookies from explicit file flag', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oracle-inline-'));
    try {
      const file = path.join(tmp, 'cookies.json');
      await fs.writeFile(
        file,
        JSON.stringify([{ name: '__Secure-next-auth.session-token', value: 'abc', domain: 'chatgpt.com' }]),
      );
      const config = await buildBrowserConfig({ browserInlineCookiesFile: file, model });
      const inline = Array.isArray(config.inlineCookies) ? config.inlineCookies : [];
      expect(inline[0]?.name).toBe('__Secure-next-auth.session-token');
      expect(config.inlineCookiesSource).toBe('inline-file');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test('treats inline payload value as file path when it exists', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oracle-inline-arg-'));
    try {
      const file = path.join(tmp, 'cookies.json');
      await fs.writeFile(file, JSON.stringify([{ name: '_account', value: 'personal', domain: 'chatgpt.com' }]));
      const config = await buildBrowserConfig({ browserInlineCookies: file, model });
      const inline = Array.isArray(config.inlineCookies) ? config.inlineCookies : [];
      expect(inline[0]?.name).toBe('_account');
      expect(config.inlineCookiesSource).toBe('inline-arg');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test('ignores ~/.auracall/cookies.json when cookie sync is enabled', async () => {
    const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'oracle-home-'));
    const oracleDir = path.join(fakeHome, '.auracall');
    setAuracallHomeDirOverrideForTest(oracleDir);
    await fs.mkdir(oracleDir, { recursive: true });
    const homeFile = path.join(oracleDir, 'cookies.json');
    await fs.writeFile(homeFile, JSON.stringify([{ name: 'cf_clearance', value: 'token', domain: 'chatgpt.com' }]));
    const config = await buildBrowserConfig({ model });
    expect(config.inlineCookies).toBeUndefined();
    expect(config.inlineCookiesSource).toBeNull();
  });

  test('uses ~/.auracall/cookies.json when cookie sync is disabled', async () => {
    const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'oracle-home-'));
    const oracleDir = path.join(fakeHome, '.auracall');
    setAuracallHomeDirOverrideForTest(oracleDir);
    await fs.mkdir(oracleDir, { recursive: true });
    const homeFile = path.join(oracleDir, 'cookies.json');
    await fs.writeFile(homeFile, JSON.stringify([{ name: 'cf_clearance', value: 'token', domain: 'chatgpt.com' }]));
    const config = await buildBrowserConfig({ model, browserNoCookieSync: true });
    const inline = Array.isArray(config.inlineCookies) ? config.inlineCookies : [];
    expect(inline[0]?.name).toBe('cf_clearance');
    expect(config.inlineCookiesSource).toBe('home:cookies.json');
  });

  test('prefers runtime-profile-scoped Gemini exported cookies before the legacy home fallback', async () => {
    const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'oracle-home-'));
    const oracleDir = path.join(fakeHome, '.auracall');
    setAuracallHomeDirOverrideForTest(oracleDir);
    const scopedDir = path.join(oracleDir, 'browser-profiles', 'default', 'gemini');
    await fs.mkdir(scopedDir, { recursive: true });
    await fs.writeFile(
      path.join(scopedDir, 'cookies.json'),
      JSON.stringify([{ name: '__Secure-1PSID', value: 'scoped', domain: '.google.com' }]),
    );
    await fs.writeFile(
      path.join(oracleDir, 'cookies.json'),
      JSON.stringify([{ name: '__Secure-1PSID', value: 'legacy', domain: '.google.com' }]),
    );

    const config = await buildBrowserConfig({
      model: 'gemini-3-pro',
      auracallProfileName: 'default',
      browserManualLoginProfileDir: scopedDir,
    });
    const inline = Array.isArray(config.inlineCookies) ? config.inlineCookies : [];
    expect(inline[0]?.value).toBe('scoped');
    expect(config.inlineCookiesSource).toBe('scoped:cookies.json');
    expect(config.manualLoginProfileDir).toMatch(/browser-profiles\/default\/gemini$/);
  });
});
