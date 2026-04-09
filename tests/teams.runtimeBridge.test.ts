import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createTeamRuntimeBridge } from '../src/teams/runtimeBridge.js';

describe('team runtime bridge', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('executes a resolved team through the current runtime substrate sequentially', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-09T12:00:00.000Z',
    });

    const result = await bridge.executeFromConfig({
      config: {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          analyst: { runtimeProfile: 'default' },
          reviewer: { runtimeProfile: 'default' },
        },
        teams: {
          ops: { agents: ['analyst', 'reviewer'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_success',
      createdAt: '2026-04-09T12:00:00.000Z',
      trigger: 'service',
      entryPrompt: 'Investigate then review.',
    });

    expect(result.teamPlan.teamRun.teamId).toBe('ops');
    expect(result.createdRuntimeRecord.bundle.run.sourceKind).toBe('team-run');
    expect(result.hostDrainResults.map((entry) => entry.executedRunIds)).toEqual([
      ['team_bridge_success', 'team_bridge_success'],
    ]);
    expect(result.executionSummary).toMatchObject({
      teamRunId: 'team_bridge_success',
      runtimeRunId: 'team_bridge_success',
      runtimeSourceKind: 'team-run',
      runtimeRunStatus: 'succeeded',
      stepSummaries: [
        {
          teamStepId: 'team_bridge_success:step:1',
          teamStepOrder: 1,
          teamStepStatus: 'succeeded',
          runtimeStepId: 'team_bridge_success:step:1',
          runtimeStepStatus: 'succeeded',
          runtimeStepFailure: null,
        },
        {
          teamStepId: 'team_bridge_success:step:2',
          teamStepOrder: 2,
          teamStepStatus: 'succeeded',
          runtimeStepId: 'team_bridge_success:step:2',
          runtimeStepStatus: 'succeeded',
          runtimeStepFailure: null,
        },
      ],
    });
    expect(result.finalRuntimeRecord.bundle.run.status).toBe('succeeded');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.status).toBe('succeeded');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.status).toBe('succeeded');
  });

  it('preserves fail-fast behavior when the first projected team step fails', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-09T12:05:00.000Z',
      executeStoredRunStep: async () => {
        throw new Error('team step exploded');
      },
    });

    const result = await bridge.executeFromConfig({
      config: {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          analyst: { runtimeProfile: 'default' },
          reviewer: { runtimeProfile: 'default' },
        },
        teams: {
          ops: { agents: ['analyst', 'reviewer'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_failure',
      createdAt: '2026-04-09T12:05:00.000Z',
      trigger: 'service',
    });

    expect(result.hostDrainResults.map((entry) => entry.executedRunIds)).toEqual([['team_bridge_failure']]);
    expect(result.executionSummary).toMatchObject({
      teamRunId: 'team_bridge_failure',
      runtimeRunId: 'team_bridge_failure',
      runtimeSourceKind: 'team-run',
      runtimeRunStatus: 'failed',
      stepSummaries: [
        {
          teamStepId: 'team_bridge_failure:step:1',
          teamStepOrder: 1,
          teamStepStatus: 'failed',
          runtimeStepId: 'team_bridge_failure:step:1',
          runtimeStepStatus: 'failed',
          runtimeStepFailure: 'team step exploded',
        },
        {
          teamStepId: 'team_bridge_failure:step:2',
          teamStepOrder: 2,
          teamStepStatus: 'planned',
          runtimeStepId: 'team_bridge_failure:step:2',
          runtimeStepStatus: 'planned',
          runtimeStepFailure: null,
        },
      ],
    });
    expect(result.finalRuntimeRecord.bundle.run.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.status).toBe('failed');
    expect(result.finalRuntimeRecord.bundle.steps[1]?.status).toBe('planned');
    expect(result.finalRuntimeRecord.bundle.steps[0]?.failure?.message).toBe('team step exploded');
  });

  it('keeps blocked unresolved team members from producing runnable runtime work', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-team-runtime-bridge-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const bridge = createTeamRuntimeBridge({
      now: () => '2026-04-09T12:10:00.000Z',
    });

    const result = await bridge.executeFromConfig({
      config: {
        defaultRuntimeProfile: 'default',
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'chatgpt' },
        },
        agents: {
          analyst: { runtimeProfile: 'default' },
        },
        teams: {
          ops: { agents: ['missing-agent'] },
        },
      },
      teamId: 'ops',
      runId: 'team_bridge_blocked',
      createdAt: '2026-04-09T12:10:00.000Z',
      trigger: 'service',
    });

    expect(result.teamPlan.blockedStepIds).toEqual(['team_bridge_blocked:step:1']);
    expect(result.hostDrainResults.map((entry) => entry.executedRunIds)).toEqual([[]]);
    expect(result.hostDrainResults[0]?.drained).toEqual([
      expect.objectContaining({
        runId: 'team_bridge_blocked',
        result: 'skipped',
        reason: 'no-runnable-step',
      }),
    ]);
    expect(result.executionSummary).toMatchObject({
      teamRunId: 'team_bridge_blocked',
      runtimeRunId: 'team_bridge_blocked',
      runtimeSourceKind: 'team-run',
      runtimeRunStatus: 'planned',
      stepSummaries: [
        {
          teamStepId: 'team_bridge_blocked:step:1',
          teamStepOrder: 1,
          teamStepStatus: 'blocked',
          runtimeStepId: 'team_bridge_blocked:step:1',
          runtimeStepStatus: 'blocked',
          runtimeStepFailure: null,
        },
      ],
    });
    expect(result.finalRuntimeRecord.bundle.steps[0]?.status).toBe('blocked');
  });
});
