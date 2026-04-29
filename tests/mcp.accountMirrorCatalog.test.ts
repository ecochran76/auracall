import { describe, expect, it, vi } from 'vitest';
import type { AccountMirrorCatalogResult } from '../src/accountMirror/catalogService.js';
import { createAccountMirrorCatalogToolHandler } from '../src/mcp/tools/accountMirrorCatalog.js';

describe('mcp account_mirror_catalog tool', () => {
  it('reads cached manifest catalog through the shared catalog service', async () => {
    const mirrorCompleteness = {
      state: 'complete' as const,
      summary: 'Mirrored metadata indexes are complete within current provider surfaces.',
      remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
      signals: {
        projectsTruncated: false,
        conversationsTruncated: false,
        attachmentInventoryTruncated: false,
        attachmentCursorPresent: false,
      },
    };
    const response: AccountMirrorCatalogResult = {
      object: 'account_mirror_catalog',
      generatedAt: '2026-04-29T12:00:00.000Z',
      kind: 'projects',
      limit: 1,
      entries: [
        {
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          boundIdentityKey: 'ecochran76@gmail.com',
          status: 'eligible',
          reason: 'eligible',
          mirrorCompleteness,
          manifests: {
            projects: [{ id: 'project_1', name: 'Project 1', provider: 'chatgpt' }],
            conversations: [],
            artifacts: [],
            files: [],
            media: [],
          },
          counts: {
            projects: 1,
            conversations: 0,
            artifacts: 0,
            files: 0,
            media: 0,
          },
        },
      ],
      metrics: {
        targets: 1,
        projects: 1,
        conversations: 0,
        artifacts: 0,
        files: 0,
        media: 0,
      },
    };
    const readCatalog = vi.fn(async () => response);
    const handler = createAccountMirrorCatalogToolHandler({
      service: {
        readCatalog,
      },
    });

    const result = await handler({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      kind: 'projects',
      limit: 1,
    });

    expect(readCatalog).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      kind: 'projects',
      limit: 1,
    });
    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        object: 'account_mirror_catalog',
        kind: 'projects',
        metrics: {
          targets: 1,
          projects: 1,
        },
      },
    });
  });
});
