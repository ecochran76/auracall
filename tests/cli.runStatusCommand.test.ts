import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { formatRunStatusCli, readRunStatusForCli } from '../src/cli/runStatusCommand.js';
import { createMediaGenerationService } from '../src/media/service.js';
import { createExecutionResponsesService } from '../src/runtime/responsesService.js';

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
        },
      ],
    });
    expect(formatRunStatusCli(status!)).toContain('Artifacts: 1');
  });
});
