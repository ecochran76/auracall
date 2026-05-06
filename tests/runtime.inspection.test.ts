import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { resolveConfiguredServiceAccountId } from '../src/config/serviceAccountIdentity.js';
import { selectStoredExecutionRunLocalClaim } from '../src/runtime/claims.js';
import { createConfiguredExecutionRunAffinity } from '../src/runtime/configuredAffinity.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { inspectRuntimeRun } from '../src/runtime/inspection.js';
import {
  createExecutionRunnerRecord,
  createExecutionRun,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import { createExecutionRunnerControl } from '../src/runtime/runnersControl.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

const CHATGPT_ACCOUNT_AFFINITY_CONFIG = {
  services: {
    chatgpt: {
      identity: {
        email: 'operator@example.com',
      },
    },
  },
  runtimeProfiles: {
    default: {
      engine: 'browser',
      defaultService: 'chatgpt',
      browserProfile: 'default',
    },
  },
};

function createBrowserBackedRuntimeBundle(runId: string, createdAt: string) {
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
      entryPrompt: 'Inspect configured account affinity.',
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
        browserProfileId: 'default',
        service: 'chatgpt',
        kind: 'prompt',
        status: 'runnable',
        order: 1,
        dependsOnStepIds: [],
        input: {
          prompt: 'Inspect configured account affinity.',
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
    events: [],
  });
}

describe('runtime inspection', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('projects a compact conversation transcript from runtime step input and output', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-inspection-conversation-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'runtime_inspect_conversation';
    const createdAt = '2026-05-06T12:00:00.000Z';
    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'succeeded',
          createdAt,
          updatedAt: '2026-05-06T12:02:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Summarize runtime inspection.',
          initialInputs: {},
          sharedStateId: `${runId}:state`,
          stepIds: [`${runId}:step:1`],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: `${runId}:step:1`,
            runId,
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'succeeded',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Summarize runtime inspection.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            output: {
              summary: 'Runtime inspection is healthy.',
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            completedAt: '2026-05-06T12:02:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: `${runId}:state`,
          runId,
          status: 'succeeded',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-05-06T12:02:00.000Z',
        }),
        events: [],
      }),
    );

    const payload = await inspectRuntimeRun({ runId, control });

    expect(payload.conversation).toMatchObject({
      turnCount: 2,
      turns: [
        {
          id: `${runId}:step:1:input`,
          role: 'user',
          content: 'Summarize runtime inspection.',
          status: 'succeeded',
          agentId: 'api-responses',
          service: 'chatgpt',
          runtimeProfileId: 'default',
        },
        {
          id: `${runId}:step:1:output`,
          role: 'assistant',
          content: 'Runtime inspection is healthy.',
          status: 'succeeded',
          agentId: 'api-responses',
          service: 'chatgpt',
          runtimeProfileId: 'default',
          createdAt: '2026-05-06T12:02:00.000Z',
        },
      ],
    });
  });

  it('keeps configured service-account affinity consistent with local claim evaluation', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-inspection-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'runtime_inspect_account_affinity';
    const createdAt = '2026-04-15T13:00:00.000Z';
    const serviceAccountId = resolveConfiguredServiceAccountId(CHATGPT_ACCOUNT_AFFINITY_CONFIG, {
      serviceId: 'chatgpt',
      runtimeProfileId: 'default',
    });
    if (!serviceAccountId) throw new Error('Expected configured ChatGPT service account id');

    await control.createRun(createBrowserBackedRuntimeBundle(runId, createdAt));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:runtime-inspect-missing-account',
        hostId: 'host:runtime-inspect',
        startedAt: createdAt,
        lastHeartbeatAt: '2026-04-15T13:01:00.000Z',
        expiresAt: '2099-04-15T13:05:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['default'],
        browserCapable: true,
      }),
    });
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: 'runner:runtime-inspect-matching-account',
        hostId: 'host:runtime-inspect',
        startedAt: createdAt,
        lastHeartbeatAt: '2026-04-15T13:01:00.000Z',
        expiresAt: '2099-04-15T13:05:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['default'],
        serviceAccountIds: [serviceAccountId],
        browserCapable: true,
      }),
    });

    const missingPayload = await inspectRuntimeRun({
      runId,
      runnerId: 'runner:runtime-inspect-missing-account',
      control,
      runnersControl,
      createRunAffinity: (inspection) =>
        createConfiguredExecutionRunAffinity(CHATGPT_ACCOUNT_AFFINITY_CONFIG, inspection),
    });
    const runtimeInspection = await control.inspectRun(runId);
    if (!runtimeInspection) throw new Error(`Expected runtime inspection for ${runId}`);
    const missingLocalClaim = await selectStoredExecutionRunLocalClaim(
      {
        runId,
        runnerId: 'runner:runtime-inspect-missing-account',
        now: '2026-04-15T13:02:00.000Z',
        affinity: createConfiguredExecutionRunAffinity(CHATGPT_ACCOUNT_AFFINITY_CONFIG, runtimeInspection),
      },
      { control, runnersControl },
    );

    expect(missingPayload.runtime.queueProjection).toMatchObject({
      queueState: 'runnable',
      claimState: 'blocked-affinity',
      affinity: {
        status: 'blocked-mismatch',
        requiredService: 'chatgpt',
        requiredRuntimeProfileId: 'default',
        requiredBrowserProfileId: 'default',
        requiredServiceAccountId: serviceAccountId,
        browserRequired: true,
        eligibilityNote: `requires configured service account ${serviceAccountId}`,
        reason:
          'runner runner:runtime-inspect-missing-account does not expose service account service-account:chatgpt:operator@example.com',
      },
    });
    expect(missingLocalClaim).toMatchObject({
      status: 'blocked-affinity',
      affinityStatus: 'blocked-mismatch',
      affinityReason: missingPayload.runtime.queueProjection.affinity.reason,
      reason: missingPayload.runtime.queueProjection.affinity.reason,
    });

    const matchingPayload = await inspectRuntimeRun({
      runId,
      runnerId: 'runner:runtime-inspect-matching-account',
      control,
      runnersControl,
      createRunAffinity: (inspection) =>
        createConfiguredExecutionRunAffinity(CHATGPT_ACCOUNT_AFFINITY_CONFIG, inspection),
    });
    const matchingLocalClaim = await selectStoredExecutionRunLocalClaim(
      {
        runId,
        runnerId: 'runner:runtime-inspect-matching-account',
        now: '2026-04-15T13:02:00.000Z',
        affinity: createConfiguredExecutionRunAffinity(CHATGPT_ACCOUNT_AFFINITY_CONFIG, runtimeInspection),
      },
      { control, runnersControl },
    );

    expect(matchingPayload.runtime.queueProjection).toMatchObject({
      queueState: 'runnable',
      claimState: 'claimable',
      affinity: {
        status: 'eligible',
        reason: null,
        requiredServiceAccountId: serviceAccountId,
        browserRequired: true,
        eligibilityNote: `requires configured service account ${serviceAccountId}`,
      },
    });
    expect(matchingLocalClaim).toMatchObject({
      status: 'eligible',
      affinityStatus: 'eligible',
      affinityReason: null,
      reason: null,
    });
  });

  it('returns an opt-in service-state probe summary for an active running step', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-inspection-service-state-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'runtime_inspect_service_state';
    const stepId = `${runId}:step:1`;
    const createdAt = '2026-04-16T18:00:00.000Z';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Probe active service state.',
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
            browserProfileId: 'default',
            service: 'chatgpt',
            kind: 'prompt',
            status: 'running',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Probe active service state.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: createdAt,
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
        events: [],
      }),
    );
    await control.acquireLease({
      runId,
      leaseId: `${runId}:lease:1`,
      ownerId: 'runner:runtime-inspect-service-state',
      acquiredAt: createdAt,
      heartbeatAt: createdAt,
      expiresAt: '2026-04-16T18:05:00.000Z',
    });

    const payload = await inspectRuntimeRun({
      runId,
      includeServiceState: true,
      control,
      probeServiceState: async ({ step }) => ({
        service: step.service,
        ownerStepId: step.id,
        state: 'thinking',
        source: 'provider-adapter',
        observedAt: '2026-04-16T18:00:05.000Z',
        evidenceRef: 'chatgpt-placeholder-turn',
        confidence: 'high',
      }),
    });

    expect(payload.serviceState).toMatchObject({
      probeStatus: 'observed',
      service: 'chatgpt',
      ownerStepId: stepId,
      state: 'thinking',
      source: 'provider-adapter',
      observedAt: '2026-04-16T18:00:05.000Z',
      evidenceRef: 'chatgpt-placeholder-turn',
      confidence: 'high',
      reason: null,
    });
  });

  it('returns an opt-in browser diagnostics summary for an active running step', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-inspection-browser-diagnostics-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runId = 'runtime_inspect_browser_diagnostics';
    const stepId = `${runId}:step:1`;
    const createdAt = '2026-04-23T18:00:00.000Z';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: runId,
          sourceKind: 'direct',
          sourceId: null,
          status: 'running',
          createdAt,
          updatedAt: createdAt,
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Probe browser diagnostics.',
          initialInputs: {
            model: 'gemini-3-pro',
            runtimeProfile: 'auracall-gemini-pro',
            service: 'gemini',
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
            runtimeProfileId: 'auracall-gemini-pro',
            browserProfileId: 'default',
            service: 'gemini',
            kind: 'prompt',
            status: 'running',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Probe browser diagnostics.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: createdAt,
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
        events: [],
      }),
    );

    const payload = await inspectRuntimeRun({
      runId,
      includeBrowserDiagnostics: true,
      control,
      probeBrowserDiagnostics: async ({ step }) => ({
        service: step.service,
        ownerStepId: step.id,
        observedAt: '2026-04-23T18:00:05.000Z',
        source: 'browser-service',
        target: {
          host: '127.0.0.1',
          port: 9222,
          targetId: 'gemini-tab-1',
          url: 'https://gemini.google.com/app',
          title: 'Google Gemini',
        },
        document: {
          url: 'https://gemini.google.com/app',
          title: 'Google Gemini',
          readyState: 'complete',
          visibilityState: 'visible',
          focused: true,
          bodyTextLength: 500,
        },
        visibleCounts: {
          buttons: 12,
          links: 3,
          inputs: 0,
          textareas: 0,
          contenteditables: 1,
          modelResponses: 1,
        },
        providerEvidence: {
          hasActiveAvatarSpinner: true,
          hasGeneratedMedia: false,
          hasStopControl: true,
          isGenerating: true,
        },
        screenshot: {
          path: '/tmp/gemini-diagnostics.png',
          mimeType: 'image/png',
          bytes: 1024,
        },
      }),
    });

    expect(payload.browserDiagnostics).toMatchObject({
      probeStatus: 'observed',
      service: 'gemini',
      ownerStepId: stepId,
      observedAt: '2026-04-23T18:00:05.000Z',
      source: 'browser-service',
      reason: null,
      target: {
        targetId: 'gemini-tab-1',
        url: 'https://gemini.google.com/app',
      },
      providerEvidence: {
        hasActiveAvatarSpinner: true,
        isGenerating: true,
      },
      screenshot: {
        path: '/tmp/gemini-diagnostics.png',
        bytes: 1024,
      },
    });
  });

  it('resolves task-run-spec runtime inspection against team-run sources only', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-inspection-task-spec-team-only-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const taskRunSpecId = 'task_spec_runtime_team_only';

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'runtime_team_task_spec_old',
          sourceKind: 'team-run',
          sourceId: 'teamrun_runtime_task_spec_old',
          taskRunSpecId,
          status: 'running',
          createdAt: '2026-04-16T17:00:00.000Z',
          updatedAt: '2026-04-16T17:05:00.000Z',
          trigger: 'cli',
          requestedBy: 'auracall teams run',
          entryPrompt: 'Inspect team-backed runtime.',
          initialInputs: {},
          sharedStateId: 'runtime_team_task_spec_old:state',
          stepIds: ['runtime_team_task_spec_old:step:1'],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: 'runtime_team_task_spec_old:step:1',
            runId: 'runtime_team_task_spec_old',
            sourceStepId: 'teamrun_runtime_task_spec_old:step:1',
            agentId: 'agent:inspect',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'running',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Inspect team-backed runtime.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
            startedAt: '2026-04-16T17:01:00.000Z',
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'runtime_team_task_spec_old:state',
          runId: 'runtime_team_task_spec_old',
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-16T17:05:00.000Z',
        }),
        events: [],
      }),
    );

    await control.createRun(
      createExecutionRunRecordBundle({
        run: createExecutionRun({
          id: 'runtime_direct_task_spec_new',
          sourceKind: 'direct',
          sourceId: null,
          taskRunSpecId,
          status: 'planned',
          createdAt: '2026-04-16T17:10:00.000Z',
          updatedAt: '2026-04-16T17:20:00.000Z',
          trigger: 'api',
          requestedBy: null,
          entryPrompt: 'Direct run should not win task-run-spec lookup.',
          initialInputs: {},
          sharedStateId: 'runtime_direct_task_spec_new:state',
          stepIds: ['runtime_direct_task_spec_new:step:1'],
          policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
        }),
        steps: [
          createExecutionRunStep({
            id: 'runtime_direct_task_spec_new:step:1',
            runId: 'runtime_direct_task_spec_new',
            agentId: 'api-responses',
            runtimeProfileId: 'default',
            browserProfileId: null,
            service: 'chatgpt',
            kind: 'prompt',
            status: 'runnable',
            order: 1,
            dependsOnStepIds: [],
            input: {
              prompt: 'Direct run should not win task-run-spec lookup.',
              handoffIds: [],
              artifacts: [],
              structuredData: {},
              notes: [],
            },
          }),
        ],
        sharedState: createExecutionRunSharedState({
          id: 'runtime_direct_task_spec_new:state',
          runId: 'runtime_direct_task_spec_new',
          status: 'active',
          artifacts: [],
          structuredOutputs: [],
          notes: [],
          history: [],
          lastUpdatedAt: '2026-04-16T17:20:00.000Z',
        }),
        events: [],
      }),
    );

    const payload = await inspectRuntimeRun({
      taskRunSpecId,
      control,
    });

    expect(payload).toMatchObject({
      resolvedBy: 'task-run-spec-id',
      queryId: taskRunSpecId,
      queryRunId: 'runtime_team_task_spec_old',
      matchingRuntimeRunCount: 1,
      matchingRuntimeRunIds: ['runtime_team_task_spec_old'],
      runtime: {
        runId: 'runtime_team_task_spec_old',
        teamRunId: 'teamrun_runtime_task_spec_old',
        taskRunSpecId,
        sourceKind: 'team-run',
        runStatus: 'running',
      },
    });
  });

  it('expires an inspected runner heartbeat before evaluating runtime inspection affinity', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-inspection-expired-runner-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const runnersControl = createExecutionRunnerControl();
    const runId = 'runtime_inspect_expired_runner';
    const createdAt = '2026-04-16T18:30:00.000Z';
    const runnerId = 'runner:runtime-inspect-expired';

    await control.createRun(createBrowserBackedRuntimeBundle(runId, createdAt));
    await runnersControl.registerRunner({
      runner: createExecutionRunnerRecord({
        id: runnerId,
        hostId: 'host:runtime-inspect',
        startedAt: createdAt,
        lastHeartbeatAt: '2026-04-16T18:31:00.000Z',
        expiresAt: '2026-04-16T18:32:00.000Z',
        serviceIds: ['chatgpt'],
        runtimeProfileIds: ['default'],
        browserProfileIds: ['default'],
        browserCapable: true,
      }),
    });

    const payload = await inspectRuntimeRun({
      runId,
      runnerId,
      now: '2026-04-16T18:35:00.000Z',
      control,
      runnersControl,
    });

    expect(payload.runtime.queueProjection).toMatchObject({
      queueState: 'runnable',
      claimState: 'blocked-affinity',
      affinity: {
        status: 'blocked-mismatch',
        reason: `runner ${runnerId} heartbeat is not active`,
      },
    });
    expect(payload.runner).toMatchObject({
      selectedBy: 'query-runner-id',
      runnerId,
      status: 'stale',
      eligibilityNote: 'runtime inspection liveness sweep',
    });
  });
});
