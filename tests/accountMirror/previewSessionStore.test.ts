import os from 'node:os';
import path from 'node:path';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import { createAccountMirrorPreviewSessionStore } from '../../src/accountMirror/previewSessionStore.js';

const manifest = {
  schema: 'auracall.preview-session-manifest.v1',
  generatedAt: '2026-05-04T22:00:00.000Z',
  count: 1,
  items: [
    {
      provider: 'chatgpt',
      runtimeProfile: 'default',
      kind: 'files',
      title: 'Smoke asset',
      itemId: 'smoke_1',
      boundIdentity: 'ecochran76@gmail.com',
      updatedAt: '2026-05-04T21:59:00.000Z',
      url: 'https://example.com/asset.png',
    },
  ],
};

describe('account mirror preview session store', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('persists named preview sessions in the account mirror SQLite cache', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-preview-session-sql-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const store = createAccountMirrorPreviewSessionStore({
      config: {
        browser: {
          cache: {
            store: 'sqlite',
          },
        },
      },
    });
    try {
      await store.writeSession({
        id: 'sqlite-smoke',
        name: 'SQLite smoke',
        manifest,
        now: '2026-05-04T22:01:00.000Z',
      });

      await expect(store.readSession('sqlite-smoke')).resolves.toMatchObject({
        id: 'sqlite-smoke',
        name: 'SQLite smoke',
        itemCount: 1,
        manifest: {
          schema: 'auracall.preview-session-manifest.v1',
          items: [{ url: 'https://example.com/asset.png' }],
        },
      });
      await expect(store.listSessions()).resolves.toMatchObject([
        {
          id: 'sqlite-smoke',
          name: 'SQLite smoke',
        },
      ]);

      const sqlitePath = path.join(homeDir, 'cache', 'account-mirror', 'cache.sqlite');
      await expect(access(sqlitePath)).resolves.toBeUndefined();
      await expect(
        access(path.join(homeDir, 'cache', 'account-mirror', 'preview-sessions', 'sqlite-smoke.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('reads legacy JSON preview sessions when the cache store is SQLite', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-preview-session-legacy-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const jsonStore = createAccountMirrorPreviewSessionStore({
      config: {
        browser: {
          cache: {
            store: 'json',
          },
        },
      },
    });
    const sqliteStore = createAccountMirrorPreviewSessionStore({
      config: {
        browser: {
          cache: {
            store: 'sqlite',
          },
        },
      },
    });
    try {
      await jsonStore.writeSession({
        id: 'legacy-json',
        name: 'Legacy JSON',
        manifest,
        now: '2026-05-04T22:01:00.000Z',
      });

      await expect(sqliteStore.readSession('legacy-json')).resolves.toMatchObject({
        id: 'legacy-json',
        name: 'Legacy JSON',
      });
      await expect(sqliteStore.listSessions()).resolves.toMatchObject([
        {
          id: 'legacy-json',
          name: 'Legacy JSON',
        },
      ]);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  test('renames and deletes saved preview sessions across sqlite and legacy json', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-preview-session-manage-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const jsonStore = createAccountMirrorPreviewSessionStore({
      config: {
        browser: {
          cache: {
            store: 'json',
          },
        },
      },
    });
    const sqliteStore = createAccountMirrorPreviewSessionStore({
      config: {
        browser: {
          cache: {
            store: 'sqlite',
          },
        },
      },
    });
    try {
      await jsonStore.writeSession({
        id: 'managed-session',
        name: 'Original name',
        manifest,
        now: '2026-05-04T22:01:00.000Z',
      });

      await expect(sqliteStore.renameSession({
        id: 'managed-session',
        name: 'Renamed session',
        now: '2026-05-04T22:02:00.000Z',
      })).resolves.toMatchObject({
        id: 'managed-session',
        name: 'Renamed session',
        updatedAt: '2026-05-04T22:02:00.000Z',
      });
      await expect(sqliteStore.readSession('managed-session')).resolves.toMatchObject({
        name: 'Renamed session',
      });

      await expect(sqliteStore.deleteSession('managed-session')).resolves.toBe(true);
      await expect(sqliteStore.readSession('managed-session')).resolves.toBeNull();
      await expect(sqliteStore.deleteSession('managed-session')).resolves.toBe(false);
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
