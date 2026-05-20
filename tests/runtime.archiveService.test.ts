import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createRunArchiveService, type RunArchiveItem } from '../src/runtime/archiveService.js';
import { readRunArchiveIndex, writeRunArchiveIndex } from '../src/runtime/archiveIndexStore.js';
import { createExecutionRunRecordStore } from '../src/runtime/store.js';
import { createExecutionResponsesService } from '../src/runtime/responsesService.js';
import {
  createExecutionRun,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';
import { createResponseBatchService, createResponseBatchStore } from '../src/runtime/responseBatchService.js';
import { writeMediaGenerationResponse } from '../src/media/store.js';
import { createMediaGenerationService } from '../src/media/service.js';

describe('run archive service', () => {
  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  test('projects existing runtime, batch, media, upload, artifact, and provider conversation records', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-run-archive-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const runStore = createExecutionRunRecordStore();
    const batchStore = createResponseBatchStore();
    const createdAt = '2026-05-16T15:00:00.000Z';
    const updatedAt = '2026-05-16T15:05:00.000Z';
    const packetPath = path.join(homeDir, 'packet.pdf');
    await writeFile(packetPath, 'packet content', 'utf8');
    const generatedArtifactPath = path.join(homeDir, 'feedback-draft.json');
    await writeFile(generatedArtifactPath, '{"score":5}', 'utf8');

    await runStore.writeRecord(createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: 'resp_archive_1',
        sourceKind: 'direct',
        sourceId: null,
        status: 'succeeded',
        createdAt,
        updatedAt,
        trigger: 'api',
        requestedBy: null,
        entryPrompt: 'Archive this run',
        initialInputs: {
          model: 'agent:pro-extended-chatgpt-soylei',
          runtimeProfile: 'wsl-chrome-3',
          service: 'chatgpt',
          metadata: {
            batchId: 'batch_archive_1',
            batchIndex: 0,
          },
        },
        sharedStateId: 'resp_archive_1:state',
        stepIds: ['resp_archive_1:step:1'],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: 'resp_archive_1:step:1',
          runId: 'resp_archive_1',
          sourceStepId: null,
          agentId: 'pro-extended-chatgpt-soylei',
          runtimeProfileId: 'wsl-chrome-3',
          browserProfileId: 'wsl-chrome-3',
          service: 'chatgpt',
          kind: 'prompt',
          status: 'succeeded',
          order: 1,
          dependsOnStepIds: [],
          input: {
            prompt: 'Archive this run',
            handoffIds: [],
            artifacts: [
              {
                id: 'upload_packet',
                kind: 'file',
                title: 'packet.pdf',
                path: packetPath,
                uri: `file://${packetPath}`,
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
                conversationId: 'conv_archive_1',
                tabUrl: 'https://chatgpt.com/c/conv_archive_1',
                runtimeProfileId: 'wsl-chrome-3',
                browserProfileId: 'wsl-chrome-3',
                projectId: 'project_archive_1',
                boundIdentityKey: 'service-account:chatgpt:eric.cochran@soylei.com',
              },
            },
            notes: [],
          },
          startedAt: createdAt,
          completedAt: updatedAt,
          failure: null,
        }),
      ],
      sharedState: createExecutionRunSharedState({
        id: 'resp_archive_1:state',
        runId: 'resp_archive_1',
        status: 'succeeded',
        artifacts: [
          {
            id: 'feedback_json',
            kind: 'generated',
            title: 'feedback-draft.json',
            path: generatedArtifactPath,
            uri: 'sandbox:/mnt/data/feedback-draft.json',
            metadata: {
              providerArtifactId: 'sandbox:/mnt/data/feedback-draft.json',
              fileName: 'feedback-draft.json',
            },
          },
        ],
        structuredOutputs: [],
        notes: [],
        history: [],
        lastUpdatedAt: updatedAt,
      }),
      events: [],
    }));

    await batchStore.writeBatch({
      id: 'batch_archive_1',
      object: 'response_batch',
      createdAt,
      updatedAt,
      metadata: { course: 'example' },
      limits: {
        maxConcurrentRuns: 1,
        maxBrowserInteractionsPerMinute: 4,
      },
      jobs: [
        {
          index: 0,
          responseId: 'resp_archive_1',
          model: 'agent:pro-extended-chatgpt-soylei',
          agent: 'pro-extended-chatgpt-soylei',
          service: 'chatgpt',
          runtimeProfile: 'wsl-chrome-3',
          createdAt,
        },
      ],
    });

    await writeMediaGenerationResponse({
      id: 'media_archive_1',
      object: 'media_generation',
      status: 'succeeded',
      provider: 'gemini',
      mediaType: 'image',
      prompt: 'Generate asphalt secret agent',
      createdAt,
      updatedAt,
      completedAt: updatedAt,
      artifacts: [
        {
          id: 'image_1',
          type: 'image',
          fileName: 'image.png',
          mimeType: 'image/png',
          path: '/tmp/image.png',
        },
      ],
      metadata: {
        conversationId: 'gemini_conv_1',
        tabUrl: 'https://gemini.google.com/app/gemini_conv_1',
      },
    });

    const service = createRunArchiveService({
      now: () => new Date('2026-05-16T15:10:00.000Z'),
    });
    const archive = await service.listItems({
      limit: 50,
    });

    expect(archive.object).toBe('run_archive');
    expect(archive.metrics.byKind.response).toBe(1);
    expect(archive.metrics.byKind.response_batch).toBe(1);
    expect(archive.metrics.byKind.upload).toBe(1);
    expect(archive.metrics.byKind.generated_artifact).toBe(2);
    expect(archive.metrics.byKind.provider_conversation).toBe(2);
    expect(archive.items.map((item) => item.id)).toEqual(expect.arrayContaining([
      'response:resp_archive_1',
      'response-batch:batch_archive_1',
      'upload:resp_archive_1:resp_archive_1:step:1:upload_packet',
      'generated-artifact:resp_archive_1:feedback_json',
      'provider-conversation:resp_archive_1:chatgpt:conv_archive_1',
      'media-generation:media_archive_1',
      'generated-artifact:media_archive_1:image_1',
      'provider-conversation:media_archive_1:gemini:gemini_conv_1',
    ]));
    expect(archive.items.find((item) => item.id === 'response:resp_archive_1')).toMatchObject({
      status: 'succeeded',
      runtimeState: 'terminal',
    });

    const uploadOnly = await service.listItems({
      kind: 'upload',
      responseId: 'resp_archive_1',
    });
    expect(uploadOnly.items).toHaveLength(1);
    expect(uploadOnly.items[0]).toMatchObject({
      kind: 'upload',
      localPath: packetPath,
      fileAvailable: true,
      batchId: 'batch_archive_1',
      batchIndex: 0,
      runtimeState: 'terminal',
    });
    expect(uploadOnly.items[0]?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    const item = await service.readItem('provider-conversation:resp_archive_1:chatgpt:conv_archive_1');
    expect(item?.item.links.catalogItem).toContain('/v1/account-mirrors/catalog/items/conv_archive_1');
    expect(item?.item).toMatchObject({
      projectId: 'project_archive_1',
      boundIdentityKey: 'service-account:chatgpt:eric.cochran@soylei.com',
    });

    const projectOnly = await service.listItems({
      kind: 'provider_conversation',
      projectId: 'project_archive_1',
    });
    expect(projectOnly.items.map((entry) => entry.id)).toContain('provider-conversation:resp_archive_1:chatgpt:conv_archive_1');

    const generatedArtifact = await service.readItem('generated-artifact:resp_archive_1:feedback_json');
    expect(generatedArtifact?.item).toMatchObject({
      localPath: generatedArtifactPath,
      fileAvailable: true,
      runtimeState: 'terminal',
      providerConversationId: 'conv_archive_1',
      providerConversationUrl: 'https://chatgpt.com/c/conv_archive_1',
      metadata: expect.objectContaining({
        providerArtifactId: 'sandbox:/mnt/data/feedback-draft.json',
        fileSizeBytes: Buffer.byteLength('{"score":5}'),
      }),
    });
    expect(generatedArtifact?.item.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    const generatedChecksum = generatedArtifact?.item.checksumSha256;
    expect(generatedChecksum).toBeTruthy();
    await expect(service.lookupAsset({
      checksumSha256: generatedChecksum,
    })).resolves.toMatchObject({
      object: 'run_archive_asset_lookup',
      canonicalItem: expect.objectContaining({
        id: 'generated-artifact:resp_archive_1:feedback_json',
        localPath: generatedArtifactPath,
      }),
      metrics: {
        total: 1,
        fileAvailable: 1,
      },
    });
    await expect(service.lookupAsset({
      providerArtifactId: 'sandbox:/mnt/data/feedback-draft.json',
    })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          id: 'generated-artifact:resp_archive_1:feedback_json',
        }),
      ],
    });
    await expect(service.readItem('generated-artifact:media_archive_1:image_1')).resolves.toMatchObject({
      item: {
        localPath: '/tmp/image.png',
        fileAvailable: false,
        metadata: expect.objectContaining({
          unavailableReason: 'media-artifact-local-file-missing',
          missingLocalPath: '/tmp/image.png',
          materialization: expect.objectContaining({
            status: 'unavailable',
            source: 'archive-read-refresh',
            method: 'media-artifact-local-file-missing',
          }),
        }),
      },
    });

    await expect(service.readAsset(`upload:resp_archive_1:resp_archive_1:step:1:upload_packet`)).resolves.toMatchObject({
      object: 'run_archive_asset',
      path: packetPath,
      fileName: 'packet.pdf',
      mimeType: 'application/pdf',
      size: Buffer.byteLength('packet content'),
    });
    await expect(service.readAsset('response:resp_archive_1')).resolves.toBeNull();

    const evidence = await service.attachEvidence({
      id: 'score_review',
      producer: 'course-agent',
      schema: 'grading-review.v1',
      status: 'pass',
      title: 'Score review',
      responseId: 'resp_archive_1',
      batchId: 'batch_archive_1',
      archiveItemId: 'generated-artifact:resp_archive_1:feedback_json',
      data: {
        validRows: 22,
      },
    });
    expect(evidence.item).toMatchObject({
      id: 'evidence:score_review',
      kind: 'evidence',
      status: 'pass',
      responseId: 'resp_archive_1',
      batchId: 'batch_archive_1',
    });
    await expect(service.listItems({ kind: 'evidence', query: 'grading-review' })).resolves.toMatchObject({
      metrics: {
        total: 1,
      },
      items: [
        expect.objectContaining({
          id: 'evidence:score_review',
        }),
      ],
    });

    for (let index = 0; index < 60; index += 1) {
      await writeMediaGenerationResponse({
        id: `media_newer_${index}`,
        object: 'media_generation',
        status: 'succeeded',
        provider: 'grok',
        mediaType: 'image',
        prompt: `newer ${index}`,
        createdAt: `2026-05-16T16:${String(index).padStart(2, '0')}:00.000Z`,
        updatedAt: `2026-05-16T16:${String(index).padStart(2, '0')}:00.000Z`,
        completedAt: `2026-05-16T16:${String(index).padStart(2, '0')}:00.000Z`,
        artifacts: [],
        metadata: {},
      });
    }

    await service.backfillIndex();
    const defaultList = await service.listItems();
    expect(defaultList.metrics.total).toBeGreaterThan(defaultList.items.length);
    expect(defaultList.items.some((entry) => entry.id === 'response:resp_archive_1')).toBe(false);
    await expect(service.readItem('response:resp_archive_1')).resolves.toMatchObject({
      item: {
        id: 'response:resp_archive_1',
      },
    });
  });

  test('write-through service paths refresh the archive index without explicit backfill', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-run-archive-write-through-'));
    setAuracallHomeDirOverrideForTest(homeDir);

    const responsesService = createExecutionResponsesService({
      drainAfterCreate: false,
      now: () => new Date('2026-05-16T18:00:00.000Z'),
      generateResponseId: () => 'resp_write_through_1',
    });
    await responsesService.createResponse({
      model: 'agent:instant-chatgpt-ecochran76',
      input: 'Archive write-through response',
      auracall: {
        agent: 'instant-chatgpt-ecochran76',
        service: 'chatgpt',
        runtimeProfile: 'default',
      },
    });
    await expect(readRunArchiveIndex()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: 'response:resp_write_through_1',
        }),
      ]),
    });

    const batchResponsesService = createExecutionResponsesService({
      drainAfterCreate: false,
      now: () => new Date('2026-05-16T18:02:00.000Z'),
      generateResponseId: () => 'resp_write_through_batch_child_1',
    });
    const responseBatchService = createResponseBatchService({
      responsesService: batchResponsesService,
      now: () => new Date('2026-05-16T18:03:00.000Z'),
      generateBatchId: () => 'batch_write_through_1',
    });
    await responseBatchService.createBatch({
      requests: [
        {
          model: 'agent:instant-chatgpt-ecochran76',
          input: 'Archive write-through batch child',
          auracall: {
            agent: 'instant-chatgpt-ecochran76',
            service: 'chatgpt',
            runtimeProfile: 'default',
          },
        },
      ],
    });
    await expect(readRunArchiveIndex()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: 'response-batch:batch_write_through_1',
        }),
      ]),
    });

    const mediaService = createMediaGenerationService({
      now: () => new Date('2026-05-16T18:05:00.000Z'),
      generateId: () => 'media_write_through_1',
      executor: async () => ({
        artifacts: [],
        model: 'image-test',
        metadata: {},
      }),
    });
    await mediaService.createGeneration({
      provider: 'gemini',
      mediaType: 'image',
      prompt: 'archive media write-through',
    });
    await expect(readRunArchiveIndex()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: 'media-generation:media_write_through_1',
        }),
        expect.objectContaining({
          id: 'response:resp_write_through_1',
        }),
      ]),
    });
  });

  test('targeted response archive upsert preserves unrelated items and removes stale response items', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-run-archive-upsert-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const runStore = createExecutionRunRecordStore();
    const timestamp = '2026-05-16T19:00:00.000Z';

    await writeRunArchiveIndex([
      createArchiveItemFixture({
        id: 'response:unrelated',
        responseId: 'unrelated',
      }),
      createArchiveItemFixture({
        id: 'upload:resp_target:old-step:old-upload',
        kind: 'upload',
        responseId: 'resp_target',
        artifactId: 'old-upload',
      }),
    ], {
      updatedAt: timestamp,
    });

    await runStore.writeRecord(createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: 'resp_target',
        sourceKind: 'direct',
        sourceId: null,
        status: 'succeeded',
        createdAt: timestamp,
        updatedAt: timestamp,
        trigger: 'api',
        requestedBy: null,
        entryPrompt: 'Targeted upsert',
        initialInputs: {
          model: 'agent:instant-chatgpt-ecochran76',
          runtimeProfile: 'default',
          service: 'chatgpt',
        },
        sharedStateId: 'resp_target:state',
        stepIds: ['resp_target:step:1'],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: 'resp_target:step:1',
          runId: 'resp_target',
          sourceStepId: null,
          agentId: 'instant-chatgpt-ecochran76',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'prompt',
          status: 'succeeded',
          order: 1,
          dependsOnStepIds: [],
          input: {
            prompt: 'Targeted upsert',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
          output: {
            summary: 'done',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
          startedAt: timestamp,
          completedAt: timestamp,
          failure: null,
        }),
      ],
      sharedState: createExecutionRunSharedState({
        id: 'resp_target:state',
        runId: 'resp_target',
        status: 'succeeded',
        artifacts: [],
        structuredOutputs: [],
        notes: [],
        history: [],
        lastUpdatedAt: timestamp,
      }),
      events: [],
    }));

    const service = createRunArchiveService({
      now: () => new Date('2026-05-16T19:05:00.000Z'),
    });
    await service.upsertResponseItems('resp_target');

    await expect(readRunArchiveIndex()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: 'response:unrelated' }),
        expect.objectContaining({ id: 'response:resp_target' }),
      ]),
    });
    const indexedIds = (await readRunArchiveIndex())?.items.map((item) => item.id) ?? [];
    expect(indexedIds).not.toContain('upload:resp_target:old-step:old-upload');
  });

  test('matches transient runtime state through archive status filters', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-run-archive-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    await writeRunArchiveIndex([
      createArchiveItemFixture({
        id: 'response:resp_finalizing_archive',
        status: 'running',
        runtimeState: 'finalizing',
        responseId: 'resp_finalizing_archive',
      }),
    ]);

    const service = createRunArchiveService({
      now: () => new Date('2026-05-16T19:10:00.000Z'),
    });

    await expect(service.listItems({ status: 'finalizing' })).resolves.toMatchObject({
      metrics: {
        total: 1,
      },
      items: [
        expect.objectContaining({
          id: 'response:resp_finalizing_archive',
          status: 'running',
          runtimeState: 'finalizing',
        }),
      ],
    });
  });

  test('refreshes indexed upload and generated artifact file metadata on archive reads', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'auracall-run-archive-file-refresh-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const uploadPath = path.join(homeDir, 'late-upload.txt');
    const generatedPath = path.join(homeDir, 'late-generated.json');
    const materializedOnlyId = 'generated-artifact:resp_file_refresh:artifact_2:download:sandbox:/mnt/data/materialized-only.json';
    const materializedOnlyPath = path.join(
      homeDir,
      'runtime',
      'archive',
      'materialized',
      sanitizeArchiveItemPathSegment(materializedOnlyId),
      'materialized-only.json',
    );
    const cachedAttachmentId = 'generated-artifact:resp_file_refresh:user-message:download:sandbox:/mnt/data/cached-attachment.json';
    const cachedAttachmentPath = path.join(
      homeDir,
      'cache',
      'providers',
      'chatgpt',
      'eric.cochran@soylei.com',
      'conversation-attachments',
      'conv_file_refresh',
      'files',
      'download-dom-turn-0',
      'cached-attachment.json',
    );
    const skippedAttachmentId = 'generated-artifact:resp_file_refresh:user-message:download:sandbox:/mnt/data/skipped-attachment.json';
    const noPathMediaArtifactId = 'generated-artifact:media_file_refresh:image_without_path';

    await writeRunArchiveIndex([
      createArchiveItemFixture({
        id: 'upload:resp_file_refresh:step:upload_1',
        kind: 'upload',
        responseId: 'resp_file_refresh',
        artifactId: 'upload_1',
        fileName: 'late-upload.txt',
        localPath: uploadPath,
        fileAvailable: false,
        links: {},
        metadata: {
          fileAvailable: false,
        },
      }),
      createArchiveItemFixture({
        id: 'generated-artifact:resp_file_refresh:artifact_1',
        kind: 'generated_artifact',
        responseId: 'resp_file_refresh',
        artifactId: 'artifact_1',
        fileName: 'late-generated.json',
        localPath: generatedPath,
        fileAvailable: false,
        links: {},
        metadata: {
          fileAvailable: false,
        },
      }),
      createArchiveItemFixture({
        id: materializedOnlyId,
        kind: 'generated_artifact',
        responseId: 'resp_file_refresh',
        artifactId: 'artifact_2:download:sandbox:/mnt/data/materialized-only.json',
        fileName: 'materialized-only.json',
        localPath: null,
        uri: 'sandbox:/mnt/data/materialized-only.json',
        fileAvailable: null,
        links: {},
        metadata: {
          artifactType: 'generated',
        },
      }),
      createArchiveItemFixture({
        id: cachedAttachmentId,
        kind: 'generated_artifact',
        responseId: 'resp_file_refresh',
        providerConversationId: 'conv_file_refresh',
        artifactId: 'user-message:download:sandbox:/mnt/data/cached-attachment.json',
        fileName: 'cached-attachment.json',
        localPath: null,
        uri: 'sandbox:/mnt/data/cached-attachment.json',
        fileAvailable: null,
        links: {},
        metadata: {
          artifactType: 'generated',
        },
      }),
      createArchiveItemFixture({
        id: skippedAttachmentId,
        kind: 'generated_artifact',
        responseId: 'resp_file_refresh',
        providerConversationId: 'conv_file_refresh',
        artifactId: 'user-message:download:sandbox:/mnt/data/skipped-attachment.json',
        fileName: 'skipped-attachment.json',
        localPath: null,
        uri: 'sandbox:/mnt/data/skipped-attachment.json',
        fileAvailable: null,
        links: {},
        metadata: {
          artifactType: 'generated',
        },
      }),
      createArchiveItemFixture({
        id: noPathMediaArtifactId,
        kind: 'generated_artifact',
        source: 'media_generation',
        provider: 'gemini',
        responseId: null,
        mediaGenerationId: 'media_file_refresh',
        providerConversationId: null,
        artifactId: 'image_without_path',
        fileName: null,
        localPath: null,
        uri: null,
        fileAvailable: null,
        links: {},
        metadata: {
          mediaType: 'image',
          mimeType: 'image/png',
        },
      }),
    ]);

    await writeFile(uploadPath, 'uploaded bytes', 'utf8');
    await writeFile(generatedPath, '{"ready":true}', 'utf8');
    await mkdir(path.dirname(materializedOnlyPath), { recursive: true });
    await writeFile(materializedOnlyPath, '{"materialized":true}', 'utf8');
    await mkdir(path.dirname(cachedAttachmentPath), { recursive: true });
    await writeFile(cachedAttachmentPath, '{"cached":true}', 'utf8');
    await writeFile(
      path.join(
        homeDir,
        'cache',
        'providers',
        'chatgpt',
        'eric.cochran@soylei.com',
        'conversation-attachments',
        'conv_file_refresh',
        'artifact-fetch-manifest.json',
      ),
      JSON.stringify({
        provider: 'chatgpt',
        conversationId: 'conv_file_refresh',
        entries: [
          {
            artifactId: 'download-dom:assistant-turn:0',
            title: 'cached-attachment.json',
            kind: 'download',
            uri: 'chatgpt://download-button/assistant-turn/0',
            status: 'materialized',
            fileId: 'download-dom:assistant-turn:0',
            fileName: 'cached-attachment.json',
            localPath: cachedAttachmentPath,
            remoteUrl: 'https://chatgpt.com/backend-api/estuary/content?id=file_2',
            mimeType: 'application/json',
            size: Buffer.byteLength('{"cached":true}'),
          },
          {
            artifactId: 'user-message:download:sandbox:/mnt/data/skipped-attachment.json',
            title: 'skipped-attachment.json',
            kind: 'download',
            uri: 'sandbox:/mnt/data/skipped-attachment.json',
            status: 'skipped',
          },
        ],
      }),
      'utf8',
    );

    const service = createRunArchiveService({
      now: () => new Date('2026-05-16T20:00:00.000Z'),
    });

    await expect(service.listItems({ kind: 'upload' })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          id: 'upload:resp_file_refresh:step:upload_1',
          fileAvailable: true,
          cacheKey: expect.stringMatching(/^sha256:/),
          checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          links: expect.objectContaining({
            asset: expect.stringContaining('/asset'),
          }),
          metadata: expect.objectContaining({
            fileAvailable: true,
            fileSizeBytes: Buffer.byteLength('uploaded bytes'),
          }),
        }),
      ],
    });
    await expect(service.readItem('generated-artifact:resp_file_refresh:artifact_1')).resolves.toMatchObject({
      item: {
        fileAvailable: true,
        cacheKey: expect.stringMatching(/^sha256:/),
        checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        links: expect.objectContaining({
          asset: expect.stringContaining('/asset'),
        }),
        metadata: expect.objectContaining({
          fileAvailable: true,
          fileSizeBytes: Buffer.byteLength('{"ready":true}'),
        }),
      },
    });
    await expect(service.readItem(materializedOnlyId)).resolves.toMatchObject({
      item: {
        localPath: materializedOnlyPath,
        fileAvailable: true,
        mimeType: 'application/json; charset=utf-8',
        cacheKey: expect.stringMatching(/^sha256:/),
        checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        links: expect.objectContaining({
          asset: expect.stringContaining('/asset'),
        }),
        metadata: expect.objectContaining({
          localPath: materializedOnlyPath,
          path: materializedOnlyPath,
          fileAvailable: true,
          fileSizeBytes: Buffer.byteLength('{"materialized":true}'),
        }),
      },
    });
    await expect(service.readItem(cachedAttachmentId)).resolves.toMatchObject({
      item: {
        localPath: cachedAttachmentPath,
        uri: 'https://chatgpt.com/backend-api/estuary/content?id=file_2',
        fileAvailable: true,
        mimeType: 'application/json',
        cacheKey: expect.stringMatching(/^sha256:/),
        checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        links: expect.objectContaining({
          asset: expect.stringContaining('/asset'),
        }),
        metadata: expect.objectContaining({
          materialization: 'cached-conversation-attachment',
          sourceArtifactFetchManifest: true,
          localPath: cachedAttachmentPath,
          path: cachedAttachmentPath,
          remoteUrl: 'https://chatgpt.com/backend-api/estuary/content?id=file_2',
          fileAvailable: true,
          fileSizeBytes: Buffer.byteLength('{"cached":true}'),
        }),
      },
    });
    await expect(service.readItem(skippedAttachmentId)).resolves.toMatchObject({
      item: {
        localPath: null,
        fileAvailable: false,
        links: expect.not.objectContaining({
          asset: expect.any(String),
        }),
        metadata: expect.objectContaining({
          sourceArtifactFetchManifest: true,
          sourceArtifactFetchStatus: 'skipped',
          sourceArtifactFetchReason: 'artifact-fetch-entry-not-materialized',
          fileAvailable: false,
          materialization: expect.objectContaining({
            status: 'unavailable',
            source: 'archive-read-refresh',
            method: 'artifact-fetch-entry-not-materialized',
          }),
        }),
      },
    });
    await expect(service.readItem(noPathMediaArtifactId)).resolves.toMatchObject({
      item: {
        localPath: null,
        fileAvailable: false,
        metadata: expect.objectContaining({
          unavailableReason: 'media-artifact-missing-local-path',
          fileAvailable: false,
          materialization: expect.objectContaining({
            status: 'unavailable',
            source: 'archive-read-refresh',
            method: 'media-artifact-missing-local-path',
          }),
        }),
      },
    });
    await expect(readRunArchiveIndex()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: 'upload:resp_file_refresh:step:upload_1',
          fileAvailable: true,
          cacheKey: expect.stringMatching(/^sha256:/),
        }),
        expect.objectContaining({
          id: 'generated-artifact:resp_file_refresh:artifact_1',
          fileAvailable: true,
          cacheKey: expect.stringMatching(/^sha256:/),
        }),
        expect.objectContaining({
          id: materializedOnlyId,
          localPath: materializedOnlyPath,
          fileAvailable: true,
          cacheKey: expect.stringMatching(/^sha256:/),
        }),
        expect.objectContaining({
          id: cachedAttachmentId,
          localPath: cachedAttachmentPath,
          fileAvailable: true,
          cacheKey: expect.stringMatching(/^sha256:/),
        }),
        expect.objectContaining({
          id: skippedAttachmentId,
          localPath: null,
          fileAvailable: false,
          metadata: expect.objectContaining({
            sourceArtifactFetchStatus: 'skipped',
          }),
        }),
        expect.objectContaining({
          id: noPathMediaArtifactId,
          localPath: null,
          fileAvailable: false,
          metadata: expect.objectContaining({
            unavailableReason: 'media-artifact-missing-local-path',
          }),
        }),
      ]),
    });
  });
});

function createArchiveItemFixture(overrides: Partial<RunArchiveItem>): RunArchiveItem {
  return {
    id: 'response:fixture',
    object: 'run_archive_item',
    kind: 'response',
    source: 'runtime',
    createdAt: '2026-05-16T19:00:00.000Z',
    updatedAt: '2026-05-16T19:00:00.000Z',
    title: 'Fixture',
    status: 'succeeded',
    runtimeState: 'terminal',
    provider: 'chatgpt',
    runtimeProfile: 'default',
    browserProfile: null,
    projectId: null,
    boundIdentityKey: null,
    agentId: null,
    teamId: null,
    responseId: null,
    batchId: null,
    batchIndex: null,
    mediaGenerationId: null,
    providerConversationId: null,
    providerConversationUrl: null,
    artifactId: null,
    fileName: null,
    mimeType: null,
    localPath: null,
    uri: null,
    cacheKey: null,
    checksumSha256: null,
    fileAvailable: null,
    metadata: {},
    links: {},
    ...overrides,
  };
}

function sanitizeArchiveItemPathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180) || 'archive-item';
}
