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
        expiresAt: '2026-04-15T13:05:00.000Z',
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
        expiresAt: '2026-04-15T13:05:00.000Z',
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
});
