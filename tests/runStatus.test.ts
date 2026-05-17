import { describe, expect, it } from 'vitest';
import { summarizeResponseRunStatus } from '../src/runStatus.js';

describe('run status summaries', () => {
  it('exposes running duration and poll guidance for in-progress response runs', () => {
    const status = summarizeResponseRunStatus(
      {
        id: 'resp_long_running',
        object: 'response',
        status: 'in_progress',
        model: 'gpt-5.5-pro',
        output: [],
        metadata: {
          runId: 'run_long_running',
          runtimeProfile: 'soylei',
          service: 'chatgpt',
          executionSummary: {
            createdAt: '2026-05-14T13:00:00.000Z',
            completedAt: null,
            lastUpdatedAt: '2026-05-14T13:10:00.000Z',
            stepSummaries: [],
          },
        },
      },
      () => new Date('2026-05-14T13:30:00.000Z'),
    );

    expect(status).toMatchObject({
      status: 'in_progress',
      timing: {
        createdAt: '2026-05-14T13:00:00.000Z',
        updatedAt: '2026-05-14T13:10:00.000Z',
        completedAt: null,
        elapsedMs: 1_800_000,
        runningForMs: 1_800_000,
      },
      polling: {
        recommendedPollMs: 15_000,
        reason: 'provider-backed runs may legitimately stay active for minutes to hours',
      },
    });
  });
});
