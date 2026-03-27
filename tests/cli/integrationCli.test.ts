import { describe, expect, test } from 'vitest';
import { mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TSX_BIN = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_ENTRY = path.join(process.cwd(), 'bin', 'auracall.ts');
const CLIENT_FACTORY = path.join(process.cwd(), 'tests', 'fixtures', 'mockClientFactory.cjs');
const INTEGRATION_TIMEOUT = process.platform === 'win32' ? 60000 : 30000;

describe('oracle CLI integration', () => {
  test('stores session metadata using stubbed client factory', async () => {
    const auracallHome = await mkdtemp(path.join(os.tmpdir(), 'oracle-home-'));
    const testFile = path.join(auracallHome, 'notes.md');
    await writeFile(testFile, 'Integration dry run content', 'utf8');

    const env = {
      ...process.env,
      // biome-ignore lint/style/useNamingConvention: env var name
      OPENAI_API_KEY: 'sk-integration',
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_HOME_DIR: auracallHome,
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_CLIENT_FACTORY: CLIENT_FACTORY,
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_NO_DETACH: '1',
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_DISABLE_KEYTAR: '1',
    };

    await execFileAsync(
      process.execPath,
      [
        TSX_BIN,
        CLI_ENTRY,
        '--engine',
        'api',
        '--prompt',
        'Integration check',
        '--model',
        'gpt-5.1',
        '--file',
        testFile,
      ],
      { env },
    );

    const sessionsDir = path.join(auracallHome, 'sessions');
    const sessionIds = await readdir(sessionsDir);
    expect(sessionIds.length).toBe(1);
    const metadataPath = path.join(sessionsDir, sessionIds[0], 'meta.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    expect(metadata.status).toBe('completed');
    expect(metadata.response?.requestId).toBe('mock-req');
    expect(metadata.usage?.totalTokens).toBe(20);
    expect(metadata.options?.effectiveModelId).toBe('gpt-5.1');

    await rm(auracallHome, { recursive: true, force: true });
  }, INTEGRATION_TIMEOUT);

  test('rejects mixing --model and --models regardless of source', async () => {
    const auracallHome = await mkdtemp(path.join(os.tmpdir(), 'oracle-multi-conflict-'));
    const env = {
      ...process.env,
      // biome-ignore lint/style/useNamingConvention: env var name
      OPENAI_API_KEY: 'sk-integration',
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_HOME_DIR: auracallHome,
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_CLIENT_FACTORY: CLIENT_FACTORY,
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_DISABLE_KEYTAR: '1',
    };

	    await expect(
	      execFileAsync(
	        process.execPath,
	        [TSX_BIN, CLI_ENTRY, '--prompt', 'conflict', '--model', 'gpt-5.1', '--models', 'gpt-5.2-pro'],
	        { env },
	      ),
	    ).rejects.toThrow(/--models cannot be combined with --model/i);

    await rm(auracallHome, { recursive: true, force: true });
  }, INTEGRATION_TIMEOUT);

  test('runs gpt-5.1-codex via API-only path', async () => {
    const auracallHome = await mkdtemp(path.join(os.tmpdir(), 'oracle-codex-'));
    const env = {
      ...process.env,
      // biome-ignore lint/style/useNamingConvention: environment variable name
      OPENAI_API_KEY: 'sk-integration',
      // biome-ignore lint/style/useNamingConvention: environment variable name
      AURACALL_HOME_DIR: auracallHome,
      // biome-ignore lint/style/useNamingConvention: environment variable name
      AURACALL_CLIENT_FACTORY: CLIENT_FACTORY,
      // biome-ignore lint/style/useNamingConvention: environment variable name
      AURACALL_NO_DETACH: '1',
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_DISABLE_KEYTAR: '1',
    };

    await execFileAsync(
      process.execPath,
      [TSX_BIN, CLI_ENTRY, '--engine', 'api', '--prompt', 'Codex integration', '--model', 'gpt-5.1-codex'],
      { env },
    );

    const sessionsDir = path.join(auracallHome, 'sessions');
    const sessionIds = await readdir(sessionsDir);
    expect(sessionIds.length).toBe(1);
    const metadataPath = path.join(sessionsDir, sessionIds[0], 'meta.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    expect(metadata.model).toBe('gpt-5.1-codex');
    expect(metadata.mode).toBe('api');
    expect(metadata.usage?.totalTokens).toBe(20);

    await rm(auracallHome, { recursive: true, force: true });
  }, INTEGRATION_TIMEOUT);

  test('rejects gpt-5.1-codex-max until OpenAI ships the API', async () => {
    const auracallHome = await mkdtemp(path.join(os.tmpdir(), 'oracle-codex-max-'));
    const env = {
      ...process.env,
      // biome-ignore lint/style/useNamingConvention: environment variable name
      OPENAI_API_KEY: 'sk-integration',
      // biome-ignore lint/style/useNamingConvention: environment variable name
      AURACALL_HOME_DIR: auracallHome,
      // biome-ignore lint/style/useNamingConvention: environment variable name
      AURACALL_CLIENT_FACTORY: CLIENT_FACTORY,
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_DISABLE_KEYTAR: '1',
    };

    await expect(
      execFileAsync(
        process.execPath,
        [TSX_BIN, CLI_ENTRY, '--engine', 'api', '--prompt', 'Codex Max integration', '--model', 'gpt-5.1-codex-max'],
        { env },
      ),
    ).rejects.toThrow(/codex-max is not available yet/i);

    await rm(auracallHome, { recursive: true, force: true });
  }, INTEGRATION_TIMEOUT);

  test('runs multi-model across OpenAI and Gemini with custom factory', async () => {
    const auracallHome = await mkdtemp(path.join(os.tmpdir(), 'oracle-multi-'));
    const env = {
      ...process.env,
      // biome-ignore lint/style/useNamingConvention: env var name
      OPENAI_API_KEY: 'sk-integration',
      // biome-ignore lint/style/useNamingConvention: env var name
      GEMINI_API_KEY: 'gk-integration',
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_HOME_DIR: auracallHome,
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_CLIENT_FACTORY: path.join(process.cwd(), 'tests', 'fixtures', 'mockPolyClient.cjs'),
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_NO_DETACH: '1',
    };

    try {
      await execFileAsync(
        process.execPath,
        [
          TSX_BIN,
          CLI_ENTRY,
          '--engine',
          'api',
          '--wait',
          '--prompt',
          'Multi run test prompt long enough',
          '--models',
          'gpt-5.1,gemini-3-pro',
        ],
        { env },
      );
    } catch (err: unknown) {
      const error = err as { message?: string; stdout?: string; stderr?: string };
      console.error('CLI Execution Failed:', error.message ?? err);
      console.error('STDOUT:', error.stdout ?? '');
      console.error('STDERR:', error.stderr ?? '');
      throw err;
    }

    const sessionsDir = path.join(auracallHome, 'sessions');
    const sessionIds = await readdir(sessionsDir);
    expect(sessionIds.length).toBe(1);
    const sessionDir = path.join(sessionsDir, sessionIds[0]);
    const metadata = JSON.parse(await readFile(path.join(sessionDir, 'meta.json'), 'utf8'));
    const selectedModels = (metadata.models as Array<{ model: string }> | undefined)?.map(
      (m: { model: string }) => m.model,
    );
    expect(selectedModels).toEqual(
      expect.arrayContaining(['gpt-5.1', 'gemini-3-pro']),
    );
    expect(metadata.status).toBe('completed');

    await rm(auracallHome, { recursive: true, force: true });
  }, INTEGRATION_TIMEOUT);

  test('accepts shorthand multi-model list and normalizes to canonical IDs', async () => {
    const auracallHome = await mkdtemp(path.join(os.tmpdir(), 'oracle-multi-shorthand-'));
    const env = {
      ...process.env,
      // biome-ignore lint/style/useNamingConvention: env var name
      OPENAI_API_KEY: 'sk-integration',
      // biome-ignore lint/style/useNamingConvention: env var name
      GEMINI_API_KEY: 'gk-integration',
      // biome-ignore lint/style/useNamingConvention: env var name
      ANTHROPIC_API_KEY: 'ak-integration',
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_HOME_DIR: auracallHome,
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_CLIENT_FACTORY: path.join(process.cwd(), 'tests', 'fixtures', 'mockPolyClient.cjs'),
      // biome-ignore lint/style/useNamingConvention: env var name
      AURACALL_NO_DETACH: '1',
    };

    try {
      await execFileAsync(
        process.execPath,
        [
          TSX_BIN,
          CLI_ENTRY,
          '--engine',
          'api',
          '--wait',
          '--prompt',
          'Shorthand multi-model normalization prompt that is safely over twenty characters.',
          '--models',
          'gpt-5.1,gemini',
        ],
        { env },
      );
    } catch (err: unknown) {
      const error = err as { message?: string; stdout?: string; stderr?: string };
      console.error('CLI Execution Failed (Shorthand):', error.message ?? err);
      console.error('STDOUT:', error.stdout ?? '');
      console.error('STDERR:', error.stderr ?? '');
      throw err;
    }

    const sessionsDir = path.join(auracallHome, 'sessions');
    const sessionIds = await readdir(sessionsDir);
    expect(sessionIds.length).toBe(1);
    const sessionDir = path.join(sessionsDir, sessionIds[0]);
    const metadata = JSON.parse(await readFile(path.join(sessionDir, 'meta.json'), 'utf8'));
    const selectedModels = (metadata.models as Array<{ model: string }> | undefined)?.map(
      (m: { model: string }) => m.model,
    );
    expect(selectedModels).toEqual(
      expect.arrayContaining(['gpt-5.1', 'gemini-3-pro']),
    );
    expect(metadata.status).toBe('completed');

    await rm(auracallHome, { recursive: true, force: true });
  }, INTEGRATION_TIMEOUT);
});
