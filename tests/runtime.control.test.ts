import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { getActiveExecutionRunLease } from '../src/runtime/contract.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { createExecutionRunRecordBundleFromTeamRun } from '../src/runtime/model.js';
import { createTeamRunBundle } from '../src/teams/model.js';

function createBundle(runId = 'team_run_control') {
  return createExecutionRunRecordBundleFromTeamRun(
    createTeamRunBundle({
      runId,
      teamId: 'ops',
      createdAt: '2026-04-08T00:00:00.000Z',
      trigger: 'service',
      steps: [
        {
          id: `${runId}:step:1`,
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
          id: `${runId}:step:2`,
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
}

describe('runtime control module', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('creates and inspects a persisted run through one control seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const created = await control.createRun(createBundle());
    expect(created.revision).toBe(1);

    const inspection = await control.inspectRun('team_run_control');
    expect(inspection?.record.revision).toBe(1);
    expect(inspection?.dispatchPlan.nextRunnableStepId).toBe('team_run_control:step:1');
    expect(inspection?.dispatchPlan.deferredStepIds).toEqual(['team_run_control:step:2']);
  });

  it('persists lease transitions through the control seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createBundle('team_run_leases'));

    const acquired = await control.acquireLease({
      runId: 'team_run_leases',
      leaseId: 'lease_1',
      ownerId: 'runner:local-1',
      acquiredAt: '2026-04-08T00:01:00.000Z',
      expiresAt: '2026-04-08T00:02:00.000Z',
    });
    expect(acquired.revision).toBe(2);
    expect(getActiveExecutionRunLease(acquired)?.id).toBe('lease_1');

    const heartbeated = await control.heartbeatLease({
      runId: 'team_run_leases',
      leaseId: 'lease_1',
      heartbeatAt: '2026-04-08T00:01:30.000Z',
      expiresAt: '2026-04-08T00:02:30.000Z',
    });
    expect(heartbeated.revision).toBe(3);

    const released = await control.releaseLease({
      runId: 'team_run_leases',
      leaseId: 'lease_1',
      releasedAt: '2026-04-08T00:01:45.000Z',
      releaseReason: 'completed',
    });
    expect(released.revision).toBe(4);
    expect(getActiveExecutionRunLease(released)).toBeNull();
    expect(released.bundle.leases[0]?.status).toBe('released');
  });

  it('lists persisted runs through the contract-shaped control seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    await control.createRun(createBundle('team_run_alpha'));
    await control.createRun(createBundle('team_run_beta'));

    const listed = await control.listRuns({ limit: 10 });
    expect(listed.map((record) => record.runId).sort()).toEqual(['team_run_alpha', 'team_run_beta']);
  });

  it('persists patched run bundles via the control persist route', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const created = await control.createRun(createBundle('team_run_persist'));

    const patchedBundle = {
      ...created.bundle,
      run: {
        ...created.bundle.run,
        status: 'failed' as const,
      },
    };

    const persisted = await control.persistRun({
      runId: 'team_run_persist',
      bundle: patchedBundle,
      expectedRevision: created.revision,
    });
    expect(persisted.revision).toBe(2);
    expect(persisted.bundle.run.status).toBe('failed');

    await expect(
      control.persistRun({
        runId: 'team_run_persist',
        bundle: patchedBundle,
        expectedRevision: 1,
      }),
    ).rejects.toThrow();
  });

  it('resumes a cancelled human-escalation run through the control seam', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-control-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const control = createExecutionRuntimeControl();
    const created = await control.createRun(createBundle('team_run_resume'));
    const pausedBundle = {
      ...created.bundle,
      run: {
        ...created.bundle.run,
        status: 'cancelled' as const,
        updatedAt: '2026-04-10T14:00:00.000Z',
      },
      steps: created.bundle.steps.map((step, index) =>
        index === 1
          ? {
              ...step,
              status: 'cancelled' as const,
              completedAt: '2026-04-10T14:00:00.000Z',
              output: {
                summary: 'paused for human escalation',
                artifacts: [],
                structuredData: {
                  humanEscalation: {
                    requestedAt: '2026-04-10T14:00:00.000Z',
                    guidance: { action: 'escalate' },
                  },
                },
                notes: ['dependency host-action guidance escalated; runner paused for human input'],
              },
              failure: null,
            }
          : step,
      ),
      sharedState: {
        ...created.bundle.sharedState,
        status: 'cancelled' as const,
        structuredOutputs: [
          ...created.bundle.sharedState.structuredOutputs,
          {
            key: 'human.escalation.team_run_resume:step:2',
            value: {
              stepId: 'team_run_resume:step:2',
              requestedAt: '2026-04-10T14:00:00.000Z',
              reason: 'dependency-local-action-escalate',
              guidance: { action: 'escalate' },
            },
          },
        ],
        notes: [...created.bundle.sharedState.notes, 'run paused for human escalation'],
        lastUpdatedAt: '2026-04-10T14:00:00.000Z',
      },
    };
    const paused = await control.persistRun({
      runId: 'team_run_resume',
      bundle: pausedBundle,
      expectedRevision: created.revision,
    });

    const resumed = await control.resumeHumanEscalation({
      runId: 'team_run_resume',
      resumedAt: '2026-04-10T14:05:00.000Z',
      note: 'human approved resume',
      guidance: {
        action: 'retry-with-guidance',
        instruction: 'use the approved repo path and continue',
      },
      override: {
        promptAppend: 'Retry the same step with the approved repo path.',
        structuredContext: {
          approvedPath: '/repo/approved',
          reviewerDecision: 'continue',
        },
      },
    });

    expect(resumed.revision).toBe(paused.revision + 1);
    expect(resumed.bundle.run.status).toBe('running');
    expect(resumed.bundle.sharedState.status).toBe('active');
    expect(resumed.bundle.steps[1]).toMatchObject({
      id: 'team_run_resume:step:2',
      status: 'runnable',
      completedAt: null,
      output: null,
      failure: null,
    });
    expect(resumed.bundle.sharedState.structuredOutputs).toContainEqual({
      key: 'human.resume.team_run_resume:step:2',
      value: {
        stepId: 'team_run_resume:step:2',
        resumedAt: '2026-04-10T14:05:00.000Z',
        note: 'human approved resume',
        guidance: {
          action: 'retry-with-guidance',
          instruction: 'use the approved repo path and continue',
        },
        override: {
          promptAppend: 'Retry the same step with the approved repo path.',
          structuredContext: {
            approvedPath: '/repo/approved',
            reviewerDecision: 'continue',
          },
        },
      },
    });
    expect(resumed.bundle.sharedState.notes).toContain('human approved resume');
    expect(resumed.bundle.steps[1]?.input.structuredData.humanEscalationResume).toEqual({
      resumedAt: '2026-04-10T14:05:00.000Z',
      note: 'human approved resume',
      guidance: {
        action: 'retry-with-guidance',
        instruction: 'use the approved repo path and continue',
      },
      override: {
        promptAppend: 'Retry the same step with the approved repo path.',
        structuredContext: {
          approvedPath: '/repo/approved',
          reviewerDecision: 'continue',
        },
      },
    });
  });
});
