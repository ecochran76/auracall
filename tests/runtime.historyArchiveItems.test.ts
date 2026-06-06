import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createRunArchiveService } from '../src/runtime/archiveService.js';

describe('history materialization archive items', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  it('persists account-mirror materialized assets and preserves them through archive backfill', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-history-archive-items-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const assetPath = path.join(homeDir, 'cache', 'providers', 'chatgpt', 'user@example.com', 'conversation-attachments', 'conv_1', 'files', 'artifact_1', 'readout.json');
    await fs.mkdir(path.dirname(assetPath), { recursive: true });
    const assetContents = '{"ok":true}\n';
    const checksumSha256 = createHash('sha256').update(assetContents).digest('hex');
    await fs.writeFile(assetPath, assetContents, 'utf8');
    const service = createRunArchiveService({
      now: sequenceNow([
        '2026-05-22T19:00:00.000Z',
        '2026-05-22T19:00:01.000Z',
        '2026-05-22T19:00:02.000Z',
      ]),
    });

    const upsert = await service.upsertHistoryMaterializationItems?.({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      browserProfile: 'default',
      projectId: 'project_1',
      boundIdentityKey: 'user@example.com',
      providerConversationId: 'conv_1',
      providerConversationUrl: 'https://chatgpt.com/c/conv_1',
      materializationJobId: 'hmj_archive_1',
      assets: [
        {
          kind: 'artifact',
          artifactId: 'artifact_1',
          title: 'readout.json',
          manifestPath: path.join(path.dirname(assetPath), '..', 'artifact-fetch-manifest.json'),
          materializationMethod: 'download-button',
          file: {
            id: 'artifact_1_file',
            name: 'readout.json',
            provider: 'chatgpt',
            source: 'conversation',
            localPath: assetPath,
            mimeType: 'application/json',
            metadata: {
              materialization: 'download-button',
            },
          },
        },
      ],
    });

    expect(upsert?.items[0]).toMatchObject({
      object: 'run_archive_item',
      kind: 'generated_artifact',
      source: 'account_mirror',
      provider: 'chatgpt',
      runtimeProfile: 'default',
      boundIdentityKey: 'user@example.com',
      providerConversationId: 'conv_1',
      cacheKey: `sha256:${checksumSha256}`,
      checksumSha256,
      fileAvailable: true,
      localPath: assetPath,
      links: {
        asset: expect.stringContaining('/v1/archive/items/'),
      },
      metadata: {
        historyMaterializationJobId: 'hmj_archive_1',
        materialization: {
          method: 'download-button',
        },
      },
    });

    const archive = await service.listItems({ kind: 'generated_artifact', assetAvailability: 'available' });
    expect(archive.metrics.total).toBe(1);
    expect(archive.items[0]?.source).toBe('account_mirror');
    expect(archive.items[0]).toMatchObject({
      boundIdentityKey: 'user@example.com',
      providerConversationId: 'conv_1',
      cacheKey: `sha256:${checksumSha256}`,
      checksumSha256,
    });
    const itemId = archive.items[0]?.id;
    expect(itemId).toBeTruthy();

    const asset = await service.readAsset(itemId ?? '');
    expect(asset?.path).toBe(assetPath);
    expect(asset?.mimeType).toContain('application/json');

    await service.backfillIndex();
    const afterBackfill = await service.listItems({ kind: 'generated_artifact', assetAvailability: 'available' });
    expect(afterBackfill.metrics.total).toBe(1);
    expect(afterBackfill.items[0]?.id).toBe(itemId);
  });
});

function sequenceNow(values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)] ?? values.at(-1) ?? new Date().toISOString());
}
