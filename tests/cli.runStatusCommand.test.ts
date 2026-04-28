import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { formatRunStatusCli, readRunStatusForCli } from '../src/cli/runStatusCommand.js';
import { createMediaGenerationService } from '../src/media/service.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { createExecutionResponsesService } from '../src/runtime/responsesService.js';
import { createChatgptDeepResearchStatusFixture } from './fixtures/chatgptDeepResearchStatusFixture.js';

vi.setConfig({ testTimeout: 10000 });

describe('run status CLI helpers', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('reads persisted response run status through the CLI service wiring', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-run-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const service = createExecutionResponsesService({
      now: () => new Date('2026-04-23T12:00:00.000Z'),
      generateResponseId: () => 'resp_cli_status_1',
    });
    await service.createResponse({
      model: 'gpt-5.2',
      input: 'Report status.',
      auracall: {
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
    });

    const status = await readRunStatusForCli('resp_cli_status_1');

    expect(status).toMatchObject({
      id: 'resp_cli_status_1',
      object: 'auracall_run_status',
      kind: 'response',
      status: 'completed',
      stepCount: 1,
      artifactCount: 0,
      metadata: {
        runtimeProfile: 'default',
        service: 'chatgpt',
        model: 'gpt-5.2',
      },
    });
    expect(formatRunStatusCli(status!)).toContain('Run resp_cli_status_1 (response) is completed');
  });

  it('falls through to media-generation run status through the CLI service wiring', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-run-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const service = createMediaGenerationService({
      now: () => new Date('2026-04-23T12:05:00.000Z'),
      generateId: () => 'medgen_cli_status_1',
      executor: async ({ artifactDir }) => ({
        artifacts: [
          {
            id: 'artifact_cli_status_1',
            type: 'image',
            fileName: 'asphalt-secret-agent.png',
            path: path.join(artifactDir, 'asphalt-secret-agent.png'),
            mimeType: 'image/png',
            metadata: {
              materialization: 'visible-image-screenshot',
              checksumSha256: 'preview-sha',
              previewArtifactId: 'preview-artifact',
              previewSize: 123,
              previewChecksumSha256: 'source-sha',
              fullQualityDiffersFromPreview: true,
            },
          },
        ],
      }),
    });
    await service.createGeneration({
      provider: 'gemini',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      transport: 'browser',
    });

    const status = await readRunStatusForCli('medgen_cli_status_1');

    expect(status).toMatchObject({
      id: 'medgen_cli_status_1',
      object: 'auracall_run_status',
      kind: 'media_generation',
      status: 'succeeded',
      artifactCount: 1,
      artifacts: [
        {
          id: 'artifact_cli_status_1',
          type: 'image',
          fileName: 'asphalt-secret-agent.png',
          materialization: 'visible-image-screenshot',
          checksumSha256: 'preview-sha',
          previewArtifactId: 'preview-artifact',
          previewSize: 123,
          previewChecksumSha256: 'source-sha',
          fullQualityDiffersFromPreview: true,
        },
      ],
    });
    expect(formatRunStatusCli(status!)).toContain('Artifacts: 1');
  });

  it('reads ChatGPT Deep Research review evidence through generic CLI status wiring', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-cli-deep-research-status-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    const fixture = createChatgptDeepResearchStatusFixture({
      screenshotPath: path.join(homeDir, 'diagnostics', 'chatgpt-deep-research', 'review.png'),
    });
    await createExecutionRuntimeControl().createRun(fixture.bundle);

    const status = await readRunStatusForCli(fixture.runId);

    expect(status).toMatchObject({
      id: fixture.runId,
      object: 'auracall_run_status',
      kind: 'response',
      status: 'completed',
      metadata: {
        browserRunSummary: {
          ownerStepId: fixture.stepId,
          tabUrl: fixture.conversationUrl,
          chatgptDeepResearchStage: 'plan-edit-opened',
          chatgptDeepResearchReviewEvidence: {
            editTargetKind: 'iframe-coordinate',
            screenshotPath: fixture.screenshotPath,
          },
        },
      },
    });
    expect(formatRunStatusCli(status!)).toContain(`Run ${fixture.runId} (response) is completed`);
  });
});
