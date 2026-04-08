import { describe, expect, it } from 'vitest';
import { createExecutionRunRecordBundleFromTeamRun } from '../src/runtime/model.js';
import { createExecutionRunDispatchPlan } from '../src/runtime/dispatcher.js';
import { createTeamRunBundle } from '../src/teams/model.js';

describe('runtime dispatcher plan', () => {
  it('selects only one next runnable step under sequential execution', () => {
    const bundle = createExecutionRunRecordBundleFromTeamRun(
      createTeamRunBundle({
        runId: 'team_run_1',
        teamId: 'ops',
        createdAt: '2026-04-07T00:00:00.000Z',
        trigger: 'service',
        steps: [
          {
            id: 'team_run_1:step:1',
            agentId: 'analyst',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'chatgpt',
            kind: 'analysis',
            status: 'ready',
            order: 1,
            input: {
              prompt: 'First',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          },
          {
            id: 'team_run_1:step:2',
            agentId: 'reviewer',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'gemini',
            kind: 'review',
            status: 'ready',
            order: 2,
            input: {
              prompt: 'Second',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          },
        ],
      }),
    );

    const plan = createExecutionRunDispatchPlan(bundle);

    expect(plan.nextRunnableStepId).toBe('team_run_1:step:1');
    expect(plan.runnableStepIds).toEqual(['team_run_1:step:1']);
    expect(plan.deferredStepIds).toEqual(['team_run_1:step:2']);
    expect(plan.waitingStepIds).toEqual([]);
  });

  it('holds runnable work when a step is already running', () => {
    const base = createExecutionRunRecordBundleFromTeamRun(
      createTeamRunBundle({
        runId: 'team_run_2',
        teamId: 'ops',
        createdAt: '2026-04-07T00:00:00.000Z',
        trigger: 'service',
        steps: [
          {
            id: 'team_run_2:step:1',
            agentId: 'analyst',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'chatgpt',
            kind: 'analysis',
            status: 'ready',
            order: 1,
            input: {
              prompt: 'First',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          },
          {
            id: 'team_run_2:step:2',
            agentId: 'reviewer',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'gemini',
            kind: 'review',
            status: 'ready',
            order: 2,
            input: {
              prompt: 'Second',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          },
        ],
      }),
    );

    const runningBundle = {
      ...base,
      steps: base.steps.map((step) =>
        step.id === 'team_run_2:step:1' ? { ...step, status: 'running' as const } : step,
      ),
    };

    const plan = createExecutionRunDispatchPlan(runningBundle);

    expect(plan.runningStepIds).toEqual(['team_run_2:step:1']);
    expect(plan.nextRunnableStepId).toBeNull();
    expect(plan.runnableStepIds).toEqual([]);
    expect(plan.deferredStepIds).toEqual(['team_run_2:step:2']);
  });

  it('applies fail-fast blocking after a terminal failure', () => {
    const base = createExecutionRunRecordBundleFromTeamRun(
      createTeamRunBundle({
        runId: 'team_run_3',
        teamId: 'ops',
        createdAt: '2026-04-07T00:00:00.000Z',
        trigger: 'service',
        steps: [
          {
            id: 'team_run_3:step:1',
            agentId: 'analyst',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'chatgpt',
            kind: 'analysis',
            status: 'ready',
            order: 1,
            input: {
              prompt: 'First',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          },
          {
            id: 'team_run_3:step:2',
            agentId: 'reviewer',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'gemini',
            kind: 'review',
            status: 'ready',
            order: 2,
            dependsOnStepIds: ['team_run_3:step:1'],
            input: {
              prompt: 'Second',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          },
        ],
      }),
    );

    const failedBundle = {
      ...base,
      run: {
        ...base.run,
        status: 'failed' as const,
      },
      steps: base.steps.map((step) =>
        step.id === 'team_run_3:step:1'
          ? {
              ...step,
              status: 'failed' as const,
              failure: {
                code: 'provider_error',
                message: 'provider failed',
              },
            }
          : step,
      ),
    };

    const plan = createExecutionRunDispatchPlan(failedBundle);

    expect(plan.terminalStepIds).toEqual(['team_run_3:step:1']);
    expect(plan.blockedByFailureStepIds).toEqual(['team_run_3:step:2']);
    expect(plan.nextRunnableStepId).toBeNull();
  });

  it('tracks missing dependencies without promoting the step', () => {
    const bundle = createExecutionRunRecordBundleFromTeamRun(
      createTeamRunBundle({
        runId: 'team_run_4',
        teamId: 'ops',
        createdAt: '2026-04-07T00:00:00.000Z',
        trigger: 'service',
        steps: [
          {
            id: 'team_run_4:step:1',
            agentId: 'reviewer',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'gemini',
            kind: 'review',
            status: 'planned',
            order: 1,
            dependsOnStepIds: ['missing-step'],
            input: {
              prompt: 'Wait for missing dependency',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          },
        ],
      }),
    );

    const plan = createExecutionRunDispatchPlan(bundle);

    expect(plan.missingDependencyStepIds).toEqual(['missing-step']);
    expect(plan.waitingStepIds).toEqual(['team_run_4:step:1']);
    expect(plan.nextRunnableStepId).toBeNull();
  });
});
