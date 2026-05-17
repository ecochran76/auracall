import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createResponsesHttpServer } from '../src/http/responsesServer.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { readRunArchiveIndex } from '../src/runtime/archiveIndexStore.js';
import {
  createExecutionRun,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

describe('http run archive routes', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
  });

  test('serves read-only archive list and item detail without browser work', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-http-archive-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const control = createExecutionRuntimeControl();
    const uploadPath = path.join(homeDir, 'assignment.pdf');
    const generatedPath = path.join(homeDir, 'first_pass_readout.json');
    await writeFile(uploadPath, 'assignment packet', 'utf8');
    await writeFile(generatedPath, '{"ok":true}', 'utf8');
    await control.createRun(createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: 'resp_http_archive',
        sourceKind: 'direct',
        sourceId: null,
        status: 'succeeded',
        createdAt: '2026-05-16T16:00:00.000Z',
        updatedAt: '2026-05-16T16:01:00.000Z',
        trigger: 'api',
        requestedBy: null,
        entryPrompt: 'HTTP archive run',
        initialInputs: {
          model: 'agent:instant-chatgpt-ecochran76',
          runtimeProfile: 'default',
          service: 'chatgpt',
        },
        sharedStateId: 'resp_http_archive:state',
        stepIds: ['resp_http_archive:step:1'],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: 'resp_http_archive:step:1',
          runId: 'resp_http_archive',
          agentId: 'instant-chatgpt-ecochran76',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'prompt',
          status: 'succeeded',
          order: 1,
          input: {
            prompt: 'HTTP archive run',
            handoffIds: [],
            artifacts: [
              {
                id: 'artifact_http_upload',
                kind: 'file',
                title: 'assignment.pdf',
                path: uploadPath,
                uri: `file://${uploadPath}`,
              },
            ],
            structuredData: {},
            notes: [],
          },
          output: {
            summary: 'done',
            artifacts: [],
            structuredData: {
              browserRun: {
                provider: 'chatgpt',
                conversationId: 'conv_http_archive',
                tabUrl: 'https://chatgpt.com/c/conv_http_archive',
                projectId: 'project_http_archive',
                boundIdentityKey: 'service-account:chatgpt:ecochran76@gmail.com',
              },
            },
            notes: [],
          },
          completedAt: '2026-05-16T16:01:00.000Z',
        }),
      ],
      sharedState: createExecutionRunSharedState({
        id: 'resp_http_archive:state',
        runId: 'resp_http_archive',
        status: 'succeeded',
        artifacts: [
          {
            id: 'generated-artifact-slash:download:sandbox:/mnt/data/first_pass_readout.json',
            kind: 'generated',
            title: 'first_pass_readout.json',
            path: generatedPath,
            uri: 'sandbox:/mnt/data/first_pass_readout.json',
            metadata: {
              providerArtifactId: 'sandbox:/mnt/data/first_pass_readout.json',
              fileName: 'first_pass_readout.json',
            },
          },
        ],
        structuredOutputs: [],
        notes: [],
        history: [],
        lastUpdatedAt: '2026-05-16T16:01:00.000Z',
      }),
      events: [],
    }));

    const server = await createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control });
    try {
      const listResponse = await fetch(`http://127.0.0.1:${server.port}/v1/archive?kind=provider_conversation&limit=5`);
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json() as {
        object: string;
        items: Array<{ id: string; kind: string; providerConversationId: string }>;
      };
      expect(list.object).toBe('run_archive');
      expect(list.items).toEqual([
        expect.objectContaining({
          id: 'provider-conversation:resp_http_archive:chatgpt:conv_http_archive',
          kind: 'provider_conversation',
          providerConversationId: 'conv_http_archive',
          projectId: 'project_http_archive',
        }),
      ]);

      const projectListResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/archive?kind=provider_conversation&projectId=project_http_archive&limit=5`,
      );
      expect(projectListResponse.status).toBe(200);
      const projectList = await projectListResponse.json() as { items: Array<{ id: string; projectId: string }> };
      expect(projectList.items).toEqual([
        expect.objectContaining({
          id: 'provider-conversation:resp_http_archive:chatgpt:conv_http_archive',
          projectId: 'project_http_archive',
        }),
      ]);

      const itemResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/archive/items/${encodeURIComponent('provider-conversation:resp_http_archive:chatgpt:conv_http_archive')}`,
      );
      expect(itemResponse.status).toBe(200);
      const item = await itemResponse.json() as { object: string; item: { links: Record<string, string> } };
      expect(item.object).toBe('run_archive_item_detail');
      expect(item.item.links.catalogItem).toContain('/v1/account-mirrors/catalog/items/conv_http_archive');

      const index = await readRunArchiveIndex();
      expect(index?.items.some((entry) => entry.id === 'provider-conversation:resp_http_archive:chatgpt:conv_http_archive')).toBe(true);

      const backfillResponse = await fetch(`http://127.0.0.1:${server.port}/v1/archive/backfill`, {
        method: 'POST',
      });
      expect(backfillResponse.status).toBe(200);
      const backfill = await backfillResponse.json() as { object: string; index: { itemCount: number } };
      expect(backfill).toMatchObject({
        object: 'run_archive_backfill',
        index: {
          itemCount: expect.any(Number),
        },
      });

      const assetResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/archive/items/${encodeURIComponent('upload:resp_http_archive:resp_http_archive:step:1:artifact_http_upload')}/asset`,
      );
      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers.get('content-type')).toBe('application/pdf');
      expect(assetResponse.headers.get('content-disposition')).toBe('attachment; filename="assignment.pdf"');
      await expect(assetResponse.text()).resolves.toBe('assignment packet');

      const uploadItemResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/archive/items/${encodeURIComponent('upload:resp_http_archive:resp_http_archive:step:1:artifact_http_upload')}`,
      );
      expect(uploadItemResponse.status).toBe(200);
      const uploadItem = await uploadItemResponse.json() as { item: { checksumSha256: string; links: Record<string, string> } };
      expect(uploadItem.item).toMatchObject({
        links: {
          asset: expect.stringContaining('/v1/archive/items/b64/'),
        },
      });
      const lookupResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/archive/assets/lookup?checksumSha256=${encodeURIComponent(uploadItem.item.checksumSha256)}`,
      );
      expect(lookupResponse.status).toBe(200);
      const lookup = await lookupResponse.json() as { object: string; canonicalItem: { id: string } | null; metrics: { total: number } };
      expect(lookup).toMatchObject({
        object: 'run_archive_asset_lookup',
        canonicalItem: {
          id: 'upload:resp_http_archive:resp_http_archive:step:1:artifact_http_upload',
        },
        metrics: {
          total: 1,
        },
      });

      const nonAssetResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/archive/items/${encodeURIComponent('response:resp_http_archive')}/asset`,
      );
      expect(nonAssetResponse.status).toBe(404);

      const slashGeneratedId = 'generated-artifact:resp_http_archive:generated-artifact-slash:download:sandbox:/mnt/data/first_pass_readout.json';
      const slashGeneratedRouteId = `b64/${Buffer.from(slashGeneratedId, 'utf8').toString('base64url')}`;
      const slashGeneratedItemResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/archive/items/${slashGeneratedRouteId}`,
      );
      expect(slashGeneratedItemResponse.status).toBe(200);
      const slashGeneratedItem = await slashGeneratedItemResponse.json() as { item: { id: string; links: Record<string, string> } };
      expect(slashGeneratedItem.item.id).toBe(slashGeneratedId);
      expect(slashGeneratedItem.item.links.asset).toBe(`/v1/archive/items/${slashGeneratedRouteId}/asset`);

      const slashGeneratedAssetResponse = await fetch(
        `http://127.0.0.1:${server.port}/v1/archive/items/${slashGeneratedRouteId}/asset`,
      );
      expect(slashGeneratedAssetResponse.status).toBe(200);
      expect(slashGeneratedAssetResponse.headers.get('content-type')).toBe('application/json');
      expect(slashGeneratedAssetResponse.headers.get('content-disposition')).toBe('attachment; filename="first_pass_readout.json"');
      await expect(slashGeneratedAssetResponse.text()).resolves.toBe('{"ok":true}');

      const evidenceResponse = await fetch(`http://127.0.0.1:${server.port}/v1/archive/evidence`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: 'score_review',
          producer: 'course-agent',
          schema: 'grading-review.v1',
          status: 'pass',
          title: 'Score review',
          summary: 'All score rows passed.',
          responseId: 'resp_http_archive',
          archiveItemId: 'upload:resp_http_archive:resp_http_archive:step:1:artifact_http_upload',
          data: {
            validRows: 22,
          },
        }),
      });
      expect(evidenceResponse.status).toBe(201);
      const evidence = await evidenceResponse.json() as { object: string; item: { id: string; kind: string; status: string } };
      expect(evidence).toMatchObject({
        object: 'run_archive_evidence_result',
        item: {
          id: 'evidence:score_review',
          kind: 'evidence',
          status: 'pass',
        },
      });

      const evidenceListResponse = await fetch(`http://127.0.0.1:${server.port}/v1/archive?kind=evidence&q=grading-review`);
      expect(evidenceListResponse.status).toBe(200);
      const evidenceList = await evidenceListResponse.json() as { items: Array<{ id: string; kind: string }> };
      expect(evidenceList.items).toEqual([
        expect.objectContaining({
          id: 'evidence:score_review',
          kind: 'evidence',
        }),
      ]);
    } finally {
      await server.close();
    }
  });
});
