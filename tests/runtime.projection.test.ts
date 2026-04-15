import { describe, expect, it } from 'vitest';
import { createExecutionRunDispatchPlan } from '../src/runtime/dispatcher.js';
import { createExecutionRunQueueProjection } from '../src/runtime/projection.js';
import {
  createExecutionRun,
  createExecutionRunAffinityRecord,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunnerRecord,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

function createInspectableBundle(runId: string, createdAt: string) {
  const stepId = `${runId}:step:1`;
  return createExecutionRunRecordBundle({
    run: createExecutionRun({
      id: runId,
      sourceKind: 'direct',
      sourceId: null,
      status: 'planned',
      createdAt,
      updatedAt: createdAt,
      trigger: 'api',
      requestedBy: null,
      entryPrompt: 'queue projection',
      initialInputs: {
        model: 'gpt-5.2',
        runtimeProfile: 'default',
        service: 'chatgpt',
      },
      sharedStateId: `${runId}:state`,
      stepIds: [stepId],
      policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
    }),
    steps: [
      createExecutionRunStep({
        id: stepId,
        runId,
        agentId: 'api-responses',
        runtimeProfileId: 'default',
        browserProfileId: null,
        service: 'chatgpt',
        kind: 'prompt',
        status: 'runnable',
        order: 1,
        dependsOnStepIds: [],
        input: {
          prompt: 'queue projection',
          handoffIds: [],
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      }),
    ],
    sharedState: createExecutionRunSharedState({
      id: `${runId}:state`,
      runId,
      status: 'active',
      artifacts: [],
      structuredOutputs: [],
      notes: [],
      history: [],
      lastUpdatedAt: createdAt,
    }),
    events: [
      createExecutionRunEvent({
        id: `${runId}:event:run-created`,
        runId,
        type: 'run-created',
        createdAt,
      }),
    ],
  });
}

function createInspection(bundle: ReturnType<typeof createInspectableBundle>) {
  return {
    record: {
      runId: bundle.run.id,
      revision: 1,
      persistedAt: bundle.run.updatedAt,
      bundle,
    },
    dispatchPlan: createExecutionRunDispatchPlan(bundle),
  };
}

describe('runtime queue projection', () => {
  it('projects a claimable runnable run by default', () => {
    const inspection = createInspection(createInspectableBundle('run_projection_runnable', '2026-04-11T09:00:00.000Z'));

    const projection = createExecutionRunQueueProjection(inspection);

    expect(projection).toMatchObject({
      runId: 'run_projection_runnable',
      queueState: 'runnable',
      claimState: 'claimable',
      nextRunnableStepId: 'run_projection_runnable:step:1',
      activeLeaseId: null,
      activeLeaseOwnerId: null,
      affinity: {
        status: 'not-evaluated',
        requiredService: 'chatgpt',
        requiredServiceAccountId: null,
        browserRequired: false,
        requiredRuntimeProfileId: 'default',
        requiredBrowserProfileId: null,
        hostRequirement: 'any',
        requiredHostId: null,
        eligibilityNote: null,
      },
    });
  });

  it('projects active lease posture separately from queue state', () => {
    const bundle = createInspectableBundle('run_projection_busy', '2026-04-11T09:01:00.000Z');
    bundle.leases.push({
      id: 'run_projection_busy:lease:1',
      runId: 'run_projection_busy',
      ownerId: 'host:busy',
      status: 'active',
      acquiredAt: '2026-04-11T09:01:00.000Z',
      heartbeatAt: '2026-04-11T09:01:00.000Z',
      expiresAt: '2026-04-11T09:05:00.000Z',
      releasedAt: null,
      releaseReason: null,
    });
    const inspection = createInspection(bundle);

    const projection = createExecutionRunQueueProjection(inspection);

    expect(projection).toMatchObject({
      queueState: 'active-lease',
      claimState: 'held-by-lease',
      activeLeaseId: 'run_projection_busy:lease:1',
      activeLeaseOwnerId: 'host:busy',
    });
  });

  it('projects recoverable stranded work as claimable', () => {
    const bundle = createInspectableBundle('run_projection_stranded', '2026-04-11T09:02:00.000Z');
    bundle.run.status = 'running';
    bundle.steps[0] = {
      ...bundle.steps[0]!,
      status: 'running',
      startedAt: '2026-04-11T09:02:00.000Z',
    };
    const inspection = createInspection(bundle);

    const projection = createExecutionRunQueueProjection(inspection);

    expect(projection).toMatchObject({
      queueState: 'recoverable-stranded',
      claimState: 'claimable',
      runningStepIds: ['run_projection_stranded:step:1'],
    });
  });

  it('can express affinity-blocked runnable work without a second queue model', () => {
    const inspection = createInspection(createInspectableBundle('run_projection_affinity', '2026-04-11T09:03:00.000Z'));

    const projection = createExecutionRunQueueProjection(inspection, {
      evaluateAffinity: () => ({
        status: 'blocked-mismatch',
        reason: 'requires different browser-bearing service account',
      }),
    });

    expect(projection).toMatchObject({
      queueState: 'runnable',
      claimState: 'blocked-affinity',
      affinity: {
        status: 'blocked-mismatch',
        reason: 'requires different browser-bearing service account',
      },
    });
  });

  it('projects explicit durable affinity requirements into the derived queue view', () => {
    const inspection = createInspection(
      createInspectableBundle('run_projection_affinity_record', '2026-04-11T09:04:00.000Z'),
    );

    const projection = createExecutionRunQueueProjection(inspection, {
      affinity: createExecutionRunAffinityRecord({
        service: 'chatgpt',
        serviceAccountId: 'acct_chatgpt_default',
        browserRequired: true,
        runtimeProfileId: 'default',
        browserProfileId: 'wsl-chrome-2',
        hostRequirement: 'same-host',
        requiredHostId: 'host:wsl-dev-1',
        eligibilityNote: 'requires the signed-in WSL ChatGPT browser-bearing account',
      }),
      evaluateAffinity: () => ({
        status: 'blocked-mismatch',
        reason: 'runner is not attached to the required browser-bearing host',
      }),
    });

    expect(projection).toMatchObject({
      queueState: 'runnable',
      claimState: 'blocked-affinity',
      affinity: {
        status: 'blocked-mismatch',
        reason: 'runner is not attached to the required browser-bearing host',
        requiredService: 'chatgpt',
        requiredServiceAccountId: 'acct_chatgpt_default',
        browserRequired: true,
        requiredRuntimeProfileId: 'default',
        requiredBrowserProfileId: 'wsl-chrome-2',
        hostRequirement: 'same-host',
        requiredHostId: 'host:wsl-dev-1',
        eligibilityNote: 'requires the signed-in WSL ChatGPT browser-bearing account',
      },
    });
  });

  it('can mark runnable work eligible for a matching active runner record', () => {
    const inspection = createInspection(
      createInspectableBundle('run_projection_runner_match', '2026-04-11T09:05:00.000Z'),
    );

    const projection = createExecutionRunQueueProjection(inspection, {
      affinity: createExecutionRunAffinityRecord({
        service: 'chatgpt',
        serviceAccountId: 'acct_chatgpt_default',
        browserRequired: true,
        runtimeProfileId: 'default',
        browserProfileId: 'wsl-chrome-2',
        hostRequirement: 'same-host',
        requiredHostId: 'host:wsl-dev-1',
        eligibilityNote: 'requires the signed-in WSL ChatGPT browser-bearing account',
      }),
      runner: createExecutionRunnerRecord({
        id: 'runner:wsl-local-1',
        hostId: 'host:wsl-dev-1',
        startedAt: '2026-04-11T09:00:00.000Z',
        lastHeartbeatAt: '2026-04-11T09:05:00.000Z',
        expiresAt: '2026-04-11T09:06:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['wsl-chrome-2'],
        serviceAccountIds: ['acct_chatgpt_default'],
        browserCapable: true,
        eligibilityNote: 'WSL browser-bearing runner',
      }),
    });

    expect(projection).toMatchObject({
      queueState: 'runnable',
      claimState: 'claimable',
      affinity: {
        status: 'eligible',
        reason: null,
        requiredService: 'chatgpt',
        requiredServiceAccountId: 'acct_chatgpt_default',
        browserRequired: true,
        requiredRuntimeProfileId: 'default',
        requiredBrowserProfileId: 'wsl-chrome-2',
        hostRequirement: 'same-host',
        requiredHostId: 'host:wsl-dev-1',
      },
    });
  });

  it('blocks runnable work for a stale runner record', () => {
    const inspection = createInspection(
      createInspectableBundle('run_projection_runner_stale', '2026-04-11T09:06:00.000Z'),
    );

    const projection = createExecutionRunQueueProjection(inspection, {
      runner: createExecutionRunnerRecord({
        id: 'runner:wsl-local-stale',
        hostId: 'host:wsl-dev-1',
        status: 'stale',
        startedAt: '2026-04-11T09:00:00.000Z',
        lastHeartbeatAt: '2026-04-11T09:01:00.000Z',
        expiresAt: '2026-04-11T09:02:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: [],
        serviceAccountIds: [],
        browserCapable: false,
      }),
    });

    expect(projection).toMatchObject({
      queueState: 'runnable',
      claimState: 'blocked-affinity',
      affinity: {
        status: 'blocked-mismatch',
        reason: 'runner runner:wsl-local-stale heartbeat is not active',
      },
    });
  });
});
