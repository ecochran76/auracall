import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadUserConfig } from '../src/config.js';
import { setOracleHomeDirOverrideForTest } from '../src/oracleHome.js';

describe('loadUserConfig', () => {
  let tempDir: string;
  let previousUserConfigPath: string | undefined;
  let previousSystemConfigPath: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oracle-config-'));
    setOracleHomeDirOverrideForTest(tempDir);
    previousUserConfigPath = process.env.ORACLE_CONFIG_PATH;
    previousSystemConfigPath = process.env.ORACLE_SYSTEM_CONFIG_PATH;
    process.env.ORACLE_CONFIG_PATH = path.join(tempDir, 'config.json');
    process.env.ORACLE_SYSTEM_CONFIG_PATH = path.join(tempDir, 'system.json');
  });

  afterEach(() => {
    if (previousUserConfigPath === undefined) {
      delete process.env.ORACLE_CONFIG_PATH;
    } else {
      process.env.ORACLE_CONFIG_PATH = previousUserConfigPath;
    }
    if (previousSystemConfigPath === undefined) {
      delete process.env.ORACLE_SYSTEM_CONFIG_PATH;
    } else {
      process.env.ORACLE_SYSTEM_CONFIG_PATH = previousSystemConfigPath;
    }
  });

  it('parses JSON5 config with comments', async () => {
    const configPath = path.join(tempDir, 'config.json');
    await fs.writeFile(
      configPath,
      `// comment\n{
        engine: "browser",
        notify: { sound: true },
        heartbeatSeconds: 15,
        remote: { host: "host:1234", token: "abc" },
      }`,
      'utf8',
    );

    const result = await loadUserConfig(tempDir);
    expect(result.loaded).toBe(true);
    expect(result.config.engine).toBe('browser');
    expect(result.config.notify?.sound).toBe(true);
    expect(result.config.heartbeatSeconds).toBe(15);
    expect(result.config.remote?.host).toBe('host:1234');
    expect(result.config.remote?.token).toBe('abc');
  });

  it('supports top-level remoteHost/remoteToken aliases', async () => {
    const configPath = path.join(tempDir, 'config.json');
    await fs.writeFile(
      configPath,
      `{
        remoteHost: "alias:9999",
        remoteToken: "secret"
      }`,
      'utf8',
    );

    const result = await loadUserConfig(tempDir);
    expect(result.loaded).toBe(true);
    expect(result.config.remoteHost).toBe('alias:9999');
    expect(result.config.remoteToken).toBe('secret');
  });

  it('returns empty config when file is missing', async () => {
    const result = await loadUserConfig(tempDir);
    expect(result.loaded).toBe(false);
    expect(result.config).toEqual({});
  });

  afterAll(() => {
    setOracleHomeDirOverrideForTest(null);
  });
});
