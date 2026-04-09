import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createExecutionResponsesService } from '../src/runtime/responsesService.js';

describe('runtime responses service', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('creates and reads a completed direct response through the runtime service seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const service = createExecutionResponsesService({
      now: () => new Date('2026-04-08T14:00:00.000Z'),
      generateResponseId: () => 'resp_service_1',
    });

    const created = await service.createResponse({
      model: 'gpt-5.2',
      input: 'Run once.',
      auracall: {
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
    });

    expect(created).toMatchObject({
      id: 'resp_service_1',
      object: 'response',
      status: 'completed',
      model: 'gpt-5.2',
      metadata: {
        runId: 'resp_service_1',
        runtimeProfile: 'default',
        service: 'chatgpt',
        executionSummary: {
          terminalStepId: 'resp_service_1:step:1',
          completedAt: '2026-04-08T14:00:00.000Z',
          lastUpdatedAt: '2026-04-08T14:00:00.000Z',
          failureSummary: null,
        },
      },
    });

    const reread = await service.readResponse('resp_service_1');
    expect(reread).toMatchObject({
      id: 'resp_service_1',
      status: 'completed',
    });
  });

  it('returns failed response state when the bounded runner callback throws', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-responses-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const service = createExecutionResponsesService({
      now: () => new Date('2026-04-08T14:05:00.000Z'),
      generateResponseId: () => 'resp_service_fail_1',
      executeStoredRunStep: async () => {
        throw new Error('service seam failed');
      },
    });

    const created = await service.createResponse({
      model: 'gpt-5.2',
      input: 'Fail once.',
    });

    expect(created).toMatchObject({
      id: 'resp_service_fail_1',
      status: 'failed',
      model: 'gpt-5.2',
      metadata: {
        executionSummary: {
          terminalStepId: 'resp_service_fail_1:step:1',
          completedAt: '2026-04-08T14:05:00.000Z',
          lastUpdatedAt: '2026-04-08T14:05:00.000Z',
          failureSummary: {
            code: 'runner_execution_failed',
            message: 'service seam failed',
          },
        },
      },
    });
  });
});
