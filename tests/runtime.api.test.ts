import { describe, expect, it } from 'vitest';
import {
  createExecutionRequest,
  createExecutionResponseArtifact,
  createExecutionResponseFromRunRecord,
  createExecutionResponseMessage,
} from '../src/runtime/apiModel.js';
import { createExecutionRunRecordBundleFromTeamRun } from '../src/runtime/model.js';
import { createTeamRunBundle } from '../src/teams/model.js';
import { createChatgptDeepResearchStatusFixture } from './fixtures/chatgptDeepResearchStatusFixture.js';

describe('runtime api model', () => {
  it('creates a compatibility-first execution request with optional AuraCall hints', () => {
    const request = createExecutionRequest({
      model: 'gpt-5.2',
      input: 'Investigate the artifact regression',
      instructions: 'Be concise.',
      auracall: {
        runtimeProfile: 'default',
        agent: 'analyst',
        transport: 'browser',
      },
    });

    expect(request).toEqual({
      model: 'gpt-5.2',
      input: 'Investigate the artifact regression',
      instructions: 'Be concise.',
      auracall: {
        runtimeProfile: 'default',
        agent: 'analyst',
        transport: 'browser',
      },
    });
  });

  it('preserves ordered mixed text and artifacts in one response output timeline', () => {
    const teamBundle = createTeamRunBundle({
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
          service: 'gemini',
          kind: 'analysis',
          status: 'ready',
          order: 1,
          input: {
            prompt: 'Create a plan and a canvas artifact.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        },
      ],
    });

    const runRecord = createExecutionRunRecordBundleFromTeamRun({
      ...teamBundle,
      teamRun: {
        ...teamBundle.teamRun,
        status: 'succeeded',
      },
    });

    const response = createExecutionResponseFromRunRecord({
      responseId: 'resp_1',
      runRecord,
      model: 'gemini-3-pro',
      runtimeProfile: 'default',
      service: 'gemini',
      output: [
        createExecutionResponseMessage('I created a short plan and a canvas draft.'),
        createExecutionResponseArtifact({
          type: 'artifact',
          id: 'art_1',
          artifact_type: 'canvas',
          title: 'Draft Plan',
          mime_type: 'text/plain',
          uri: 'gemini://canvas/59b6f9ac9e510adc',
          disposition: 'inline',
          metadata: {
            createdAt: 'Apr 6, 9:44 PM',
          },
        }),
      ],
    });

    expect(response.status).toBe('completed');
    expect(response.output).toEqual([
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'I created a short plan and a canvas draft.' }],
      },
      {
        type: 'artifact',
        id: 'art_1',
        artifact_type: 'canvas',
        title: 'Draft Plan',
        mime_type: 'text/plain',
        uri: 'gemini://canvas/59b6f9ac9e510adc',
        disposition: 'inline',
        metadata: {
          createdAt: 'Apr 6, 9:44 PM',
        },
      },
    ]);
    expect(response.metadata).toEqual({
      runId: 'team_run_1',
      taskRunSpecId: null,
      taskRunSpecSummary: null,
      runtimeProfile: 'default',
      service: 'gemini',
      executionSummary: {
        terminalStepId: null,
        completedAt: null,
        lastUpdatedAt: '2026-04-07T00:00:00.000Z',
        stepSummaries: [
          {
            stepId: 'team_run_1:step:1',
            order: 1,
            agentId: 'analyst',
            status: 'runnable',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            service: 'gemini',
          },
        ],
        localActionSummary: null,
        requestedOutputSummary: null,
        requestedOutputPolicy: null,
        inputArtifactSummary: null,
        handoffTransferSummary: null,
        providerUsageSummary: null,
        cancellationSummary: null,
        operatorControlSummary: null,
        orchestrationTimelineSummary: null,
        failureSummary: null,
      },
    });
  });

  it('projects ChatGPT Deep Research review evidence from stored browser-run output', () => {
    const fixture = createChatgptDeepResearchStatusFixture();

    const response = createExecutionResponseFromRunRecord({
      responseId: fixture.runId,
      runRecord: fixture.bundle,
      model: 'gpt-5.2-thinking',
      runtimeProfile: 'wsl-chrome-3',
      service: 'chatgpt',
      output: [],
    });

    expect(response.metadata?.executionSummary?.browserRunSummary).toMatchObject({
      ownerStepId: fixture.stepId,
      provider: 'chatgpt',
      service: 'chatgpt',
      conversationId: '69f0bbc4-62c4-83ea-bb10-2c83b7f83b38',
      tabUrl: fixture.conversationUrl,
      runtimeProfileId: 'wsl-chrome-3',
      browserProfileId: 'wsl-chrome-3',
      chatgptDeepResearchStage: 'plan-edit-opened',
      chatgptDeepResearchPlanAction: 'edit',
      chatgptDeepResearchModifyPlanLabel: 'Update',
      chatgptDeepResearchModifyPlanVisible: true,
      chatgptDeepResearchReviewEvidence: {
        stage: 'plan-edit-opened',
        editTargetKind: 'iframe-coordinate',
        screenshotPath: fixture.screenshotPath,
      },
    });
  });

  it('derives bounded requested-output fulfillment evidence from stored response output', () => {
    const teamBundle = createTeamRunBundle({
      runId: 'team_run_requested_outputs_1',
      teamId: 'ops',
      createdAt: '2026-04-07T00:00:00.000Z',
      trigger: 'service',
      steps: [
        {
          id: 'team_run_requested_outputs_1:step:1',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'gemini',
          kind: 'synthesis',
          status: 'succeeded',
          order: 1,
          input: {
            prompt: 'Produce a final response and one artifact bundle.',
            handoffIds: [],
            artifacts: [],
            structuredData: {
              requestedOutputs: [
                {
                  kind: 'final-response',
                  label: 'final answer',
                  format: 'markdown',
                  required: true,
                  destination: 'response-body',
                },
                {
                  kind: 'artifact-bundle',
                  label: 'work bundle',
                  format: 'bundle',
                  required: true,
                  destination: 'artifact-store',
                },
              ],
            },
            notes: [],
          },
        },
      ],
    });

    const runRecord = createExecutionRunRecordBundleFromTeamRun({
      ...teamBundle,
      teamRun: {
        ...teamBundle.teamRun,
        status: 'succeeded',
        updatedAt: '2026-04-07T00:01:00.000Z',
      },
      steps: teamBundle.steps.map((step) => ({
        ...step,
        status: 'succeeded',
        output: {
          summary: 'done',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
        startedAt: '2026-04-07T00:00:10.000Z',
        completedAt: '2026-04-07T00:01:00.000Z',
      })),
      sharedState: {
        ...teamBundle.sharedState,
        artifacts: [
          {
            id: 'artifact_bundle_1',
            kind: 'bundle',
            title: 'work bundle',
            path: '/tmp/work.zip',
            uri: null,
          },
        ],
        lastUpdatedAt: '2026-04-07T00:01:00.000Z',
      },
    });

    const response = createExecutionResponseFromRunRecord({
      responseId: 'resp_requested_outputs_1',
      runRecord,
      model: 'gemini-3-pro',
      runtimeProfile: 'default',
      service: 'gemini',
      output: [
        createExecutionResponseMessage('Here is the final answer.'),
        createExecutionResponseArtifact({
          type: 'artifact',
          id: 'artifact_bundle_1',
          artifact_type: 'file',
          title: 'work bundle',
          mime_type: 'application/zip',
          uri: 'file:///tmp/work.zip',
          disposition: 'attachment',
          metadata: null,
        }),
      ],
    });

    expect(response.metadata?.executionSummary?.requestedOutputSummary).toEqual({
      total: 2,
      fulfilledCount: 2,
      missingRequiredCount: 0,
      items: [
        {
          label: 'final answer',
          kind: 'final-response',
          format: 'markdown',
          destination: 'response-body',
          required: true,
          fulfilled: true,
          evidence: 'message',
        },
        {
          label: 'work bundle',
          kind: 'artifact-bundle',
          format: 'bundle',
          destination: 'artifact-store',
          required: true,
          fulfilled: true,
          evidence: 'artifact',
        },
      ],
    });
    expect(response.metadata?.executionSummary?.requestedOutputPolicy).toEqual({
      status: 'satisfied',
      message: 'all required requested outputs were fulfilled',
      missingRequiredLabels: [],
    });
    expect(response.status).toBe('completed');
  });

  it('derives bounded input-artifact summary from stored step input artifacts', () => {
    const teamBundle = createTeamRunBundle({
      runId: 'team_run_input_artifacts_1',
      teamId: 'ops',
      createdAt: '2026-04-07T00:00:00.000Z',
      trigger: 'service',
      steps: [
        {
          id: 'team_run_input_artifacts_1:step:1',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'gemini',
          kind: 'synthesis',
          status: 'succeeded',
          order: 1,
          input: {
            prompt: 'Use the supplied assignment artifacts.',
            handoffIds: [],
            artifacts: [
              {
                id: 'artifact-readme',
                kind: 'file',
                path: '/repo/README.md',
                title: 'README',
              },
              {
                id: 'artifact-spec',
                kind: 'url',
                uri: 'https://example.test/spec',
                title: 'Spec',
              },
            ],
            structuredData: {},
            notes: [],
          },
        },
      ],
    });

    const runRecord = createExecutionRunRecordBundleFromTeamRun({
      ...teamBundle,
      teamRun: {
        ...teamBundle.teamRun,
        status: 'succeeded',
        updatedAt: '2026-04-07T00:01:00.000Z',
      },
      steps: teamBundle.steps.map((step) => ({
        ...step,
        status: 'succeeded',
        output: {
          summary: 'done',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
        startedAt: '2026-04-07T00:00:10.000Z',
        completedAt: '2026-04-07T00:01:00.000Z',
      })),
      sharedState: {
        ...teamBundle.sharedState,
        artifacts: [],
        lastUpdatedAt: '2026-04-07T00:01:00.000Z',
      },
    });

    const response = createExecutionResponseFromRunRecord({
      responseId: 'resp_input_artifacts_1',
      runRecord,
      model: 'gemini-3-pro',
      runtimeProfile: 'default',
      service: 'gemini',
      output: [createExecutionResponseMessage('Used the assignment artifacts.')],
    });

    expect(response.metadata?.executionSummary?.inputArtifactSummary).toEqual({
      total: 2,
      items: [
        {
          id: 'artifact-readme',
          kind: 'file',
          title: 'README',
          path: '/repo/README.md',
          uri: null,
        },
        {
          id: 'artifact-spec',
          kind: 'url',
          title: 'Spec',
          path: null,
          uri: 'https://example.test/spec',
        },
      ],
    });
  });

  it('derives bounded handoff-transfer summary from incoming planned handoffs', () => {
    const teamBundle = createTeamRunBundle({
      runId: 'team_run_handoff_transfer_1',
      teamId: 'ops',
      createdAt: '2026-04-07T00:00:00.000Z',
      trigger: 'service',
      steps: [
        {
          id: 'team_run_handoff_transfer_1:step:1',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'gemini',
          kind: 'analysis',
          status: 'succeeded',
          order: 1,
          input: {
            prompt: 'Prepare the transfer.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        },
        {
          id: 'team_run_handoff_transfer_1:step:2',
          agentId: 'reviewer',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'gemini',
          kind: 'synthesis',
          status: 'succeeded',
          order: 2,
          dependsOnStepIds: ['team_run_handoff_transfer_1:step:1'],
          input: {
            prompt: 'Consume the handoff transfer.',
            handoffIds: ['team_run_handoff_transfer_1:handoff:team_run_handoff_transfer_1:step:2:1'],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        },
      ],
    });

    const runRecord = createExecutionRunRecordBundleFromTeamRun({
      ...teamBundle,
      teamRun: {
        ...teamBundle.teamRun,
        status: 'succeeded',
        updatedAt: '2026-04-07T00:01:00.000Z',
      },
      steps: teamBundle.steps.map((step) => ({
        ...step,
        status: 'succeeded',
        output: {
          summary: 'done',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
        startedAt: '2026-04-07T00:00:10.000Z',
        completedAt: '2026-04-07T00:01:00.000Z',
      })),
      handoffs: [
        {
          id: 'team_run_handoff_transfer_1:handoff:team_run_handoff_transfer_1:step:2:1',
          teamRunId: 'team_run_handoff_transfer_1',
          fromStepId: 'team_run_handoff_transfer_1:step:1',
          toStepId: 'team_run_handoff_transfer_1:step:2',
          fromAgentId: 'analyst',
          toAgentId: 'reviewer',
          summary: 'Planned handoff for team_run_handoff_transfer_1',
          artifacts: [],
          structuredData: {
            taskRunSpecId: null,
            toRoleId: null,
            taskTransfer: {
              title: 'Drive dependency handoff transfer',
              objective: 'Ensure the next step gets bounded transfer context.',
              successCriteria: ['transfer consumed'],
              requestedOutputs: [
                {
                  label: 'handoff brief',
                  kind: 'structured-report',
                  destination: 'handoff',
                  required: true,
                },
              ],
              inputArtifacts: [
                {
                  id: 'artifact-spec',
                  kind: 'file',
                  title: 'Spec',
                  path: '/repo/spec.md',
                  uri: null,
                },
              ],
            },
          },
          notes: ['planned handoff derived from team step dependencies'],
          status: 'prepared',
          createdAt: '2026-04-07T00:00:30.000Z',
        },
      ],
      sharedState: {
        ...teamBundle.sharedState,
        artifacts: [],
        lastUpdatedAt: '2026-04-07T00:01:00.000Z',
      },
    });

    const response = createExecutionResponseFromRunRecord({
      responseId: 'resp_handoff_transfer_1',
      runRecord,
      model: 'gemini-3-pro',
      runtimeProfile: 'default',
      service: 'gemini',
      output: [createExecutionResponseMessage('Consumed the handoff transfer.')],
    });

    expect(response.metadata?.executionSummary?.handoffTransferSummary).toEqual({
      total: 1,
      items: [
        {
          handoffId: 'team_run_handoff_transfer_1:handoff:team_run_handoff_transfer_1:step:2:1',
          fromStepId: 'team_run_handoff_transfer_1:step:1',
          fromAgentId: 'analyst',
          title: 'Drive dependency handoff transfer',
          objective: 'Ensure the next step gets bounded transfer context.',
          requestedOutputCount: 1,
          inputArtifactCount: 1,
        },
      ],
    });
  });

  it('prefers stored consumed-transfer summary over planned-handoff re-derivation', () => {
    const teamBundle = createTeamRunBundle({
      runId: 'team_run_handoff_transfer_stored_1',
      teamId: 'ops',
      createdAt: '2026-04-07T00:00:00.000Z',
      trigger: 'service',
      steps: [
        {
          id: 'team_run_handoff_transfer_stored_1:step:1',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'gemini',
          kind: 'analysis',
          status: 'succeeded',
          order: 1,
          input: {
            prompt: 'Prepare the transfer.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        },
        {
          id: 'team_run_handoff_transfer_stored_1:step:2',
          agentId: 'reviewer',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'gemini',
          kind: 'synthesis',
          status: 'succeeded',
          order: 2,
          dependsOnStepIds: ['team_run_handoff_transfer_stored_1:step:1'],
          input: {
            prompt: 'Consume the handoff transfer.',
            handoffIds: ['team_run_handoff_transfer_stored_1:handoff:team_run_handoff_transfer_stored_1:step:2:1'],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        },
      ],
    });

    const runRecord = createExecutionRunRecordBundleFromTeamRun({
      ...teamBundle,
      teamRun: {
        ...teamBundle.teamRun,
        status: 'succeeded',
        updatedAt: '2026-04-07T00:01:00.000Z',
      },
      steps: teamBundle.steps.map((step) => ({
        ...step,
        status: 'succeeded',
        output: {
          summary: 'done',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
        startedAt: '2026-04-07T00:00:10.000Z',
        completedAt: '2026-04-07T00:01:00.000Z',
      })),
      handoffs: [
        {
          id: 'team_run_handoff_transfer_stored_1:handoff:team_run_handoff_transfer_stored_1:step:2:1',
          teamRunId: 'team_run_handoff_transfer_stored_1',
          fromStepId: 'team_run_handoff_transfer_stored_1:step:1',
          toStepId: 'team_run_handoff_transfer_stored_1:step:2',
          fromAgentId: 'analyst',
          toAgentId: 'reviewer',
          summary: 'Planned handoff for team_run_handoff_transfer_stored_1',
          artifacts: [],
          structuredData: {
            taskRunSpecId: null,
            toRoleId: null,
            taskTransfer: {
              title: 'Planned handoff title',
              objective: 'This planned value should lose to stored consumed state.',
              successCriteria: ['transfer consumed'],
              requestedOutputs: [
                {
                  label: 'handoff brief',
                  kind: 'structured-report',
                  destination: 'handoff',
                  required: true,
                },
              ],
              inputArtifacts: [],
            },
          },
          notes: ['planned handoff derived from team step dependencies'],
          status: 'prepared',
          createdAt: '2026-04-07T00:00:30.000Z',
        },
      ],
      sharedState: {
        ...teamBundle.sharedState,
        artifacts: [],
        structuredOutputs: [
          {
            key: 'step.consumedTaskTransfers.team_run_handoff_transfer_stored_1:step:2',
            value: {
              ownerStepId: 'team_run_handoff_transfer_stored_1:step:2',
              generatedAt: '2026-04-07T00:01:00.000Z',
              total: 1,
              items: [
                {
                  handoffId: 'team_run_handoff_transfer_stored_1:handoff:team_run_handoff_transfer_stored_1:step:2:1',
                  fromStepId: 'team_run_handoff_transfer_stored_1:step:1',
                  fromAgentId: 'analyst',
                  title: 'Stored consumed transfer title',
                  objective: 'Stored consumed state should drive detailed readback.',
                  requestedOutputCount: 2,
                  inputArtifactCount: 3,
                },
              ],
            },
          },
        ],
        lastUpdatedAt: '2026-04-07T00:01:00.000Z',
      },
    });

    const response = createExecutionResponseFromRunRecord({
      responseId: 'resp_handoff_transfer_stored_1',
      runRecord,
      model: 'gemini-3-pro',
      runtimeProfile: 'default',
      service: 'gemini',
      output: [createExecutionResponseMessage('Consumed the handoff transfer.')],
    });

    expect(response.metadata?.executionSummary?.handoffTransferSummary).toEqual({
      total: 1,
      items: [
        {
          handoffId: 'team_run_handoff_transfer_stored_1:handoff:team_run_handoff_transfer_stored_1:step:2:1',
          fromStepId: 'team_run_handoff_transfer_stored_1:step:1',
          fromAgentId: 'analyst',
          title: 'Stored consumed transfer title',
          objective: 'Stored consumed state should drive detailed readback.',
          requestedOutputCount: 2,
          inputArtifactCount: 3,
        },
      ],
    });
  });

  it('derives bounded orchestration timeline summary from durable shared-state history', () => {
    const teamBundle = createTeamRunBundle({
      runId: 'team_run_timeline_1',
      teamId: 'ops',
      createdAt: '2026-04-07T00:00:00.000Z',
      trigger: 'service',
      steps: [
        {
          id: 'team_run_timeline_1:step:1',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'gemini',
          kind: 'analysis',
          status: 'succeeded',
          order: 1,
          input: {
            prompt: 'Run once.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        },
      ],
    });

    const runRecord = createExecutionRunRecordBundleFromTeamRun({
      ...teamBundle,
      teamRun: {
        ...teamBundle.teamRun,
        status: 'succeeded',
        updatedAt: '2026-04-07T00:01:00.000Z',
      },
      steps: teamBundle.steps.map((step) => ({
        ...step,
        status: 'succeeded',
        output: {
          summary: 'done',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
        startedAt: '2026-04-07T00:00:10.000Z',
        completedAt: '2026-04-07T00:01:00.000Z',
      })),
      sharedState: {
        ...teamBundle.sharedState,
        history: [
          {
            id: 'team_run_timeline_1:event:step-started',
            teamRunId: 'team_run_timeline_1',
            type: 'step-started',
            createdAt: '2026-04-07T00:00:10.000Z',
            stepId: 'team_run_timeline_1:step:1',
            note: 'step started by local runner',
            payload: null,
          },
          {
            id: 'team_run_timeline_1:event:step-succeeded',
            teamRunId: 'team_run_timeline_1',
            type: 'step-succeeded',
            createdAt: '2026-04-07T00:01:00.000Z',
            stepId: 'team_run_timeline_1:step:1',
            note: 'step completed by local runner',
            payload: null,
          },
          {
            id: 'team_run_timeline_1:event:handoff-consumed',
            teamRunId: 'team_run_timeline_1',
            type: 'handoff-consumed',
            createdAt: '2026-04-07T00:01:05.000Z',
            stepId: 'team_run_timeline_1:step:2',
            note: 'handoff consumed from team_run_timeline_1:step:1 by team_run_timeline_1:step:2',
            payload: {
              handoffId: 'handoff_1',
            },
          },
          {
            id: 'team_run_timeline_1:event:operator-note',
            teamRunId: 'team_run_timeline_1',
            type: 'note-added',
            createdAt: '2026-04-07T00:01:10.000Z',
            stepId: null,
            note: 'targeted drain executed',
            payload: {
              source: 'operator',
              action: 'drain-run',
            },
          },
        ],
        lastUpdatedAt: '2026-04-07T00:01:10.000Z',
      },
    });

    const response = createExecutionResponseFromRunRecord({
      responseId: 'resp_timeline_1',
      runRecord,
      model: 'gemini-3-pro',
      runtimeProfile: 'default',
      service: 'gemini',
      output: [createExecutionResponseMessage('Done.')],
    });

    expect(response.metadata?.executionSummary?.orchestrationTimelineSummary).toEqual({
      total: 4,
      items: [
        {
          type: 'step-started',
          createdAt: '2026-04-07T00:00:10.000Z',
          stepId: 'team_run_timeline_1:step:1',
          note: 'step started by local runner',
          handoffId: null,
        },
        {
          type: 'step-succeeded',
          createdAt: '2026-04-07T00:01:00.000Z',
          stepId: 'team_run_timeline_1:step:1',
          note: 'step completed by local runner',
          handoffId: null,
        },
        {
          type: 'handoff-consumed',
          createdAt: '2026-04-07T00:01:05.000Z',
          stepId: 'team_run_timeline_1:step:2',
          note: 'handoff consumed from team_run_timeline_1:step:1 by team_run_timeline_1:step:2',
          handoffId: 'handoff_1',
        },
        {
          type: 'note-added',
          createdAt: '2026-04-07T00:01:10.000Z',
          stepId: null,
          note: 'targeted drain executed',
          handoffId: null,
        },
      ],
    });
  });

  it('escalates terminal readback when required requested outputs are still missing', () => {
    const teamBundle = createTeamRunBundle({
      runId: 'team_run_requested_outputs_missing_1',
      teamId: 'ops',
      createdAt: '2026-04-07T00:00:00.000Z',
      trigger: 'service',
      steps: [
        {
          id: 'team_run_requested_outputs_missing_1:step:1',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'gemini',
          kind: 'synthesis',
          status: 'succeeded',
          order: 1,
          input: {
            prompt: 'Produce a final response and one artifact bundle.',
            handoffIds: [],
            artifacts: [],
            structuredData: {
              requestedOutputs: [
                {
                  kind: 'final-response',
                  label: 'final answer',
                  format: 'markdown',
                  required: true,
                  destination: 'response-body',
                },
                {
                  kind: 'artifact-bundle',
                  label: 'work bundle',
                  format: 'bundle',
                  required: true,
                  destination: 'artifact-store',
                },
              ],
            },
            notes: [],
          },
        },
      ],
    });

    const runRecord = createExecutionRunRecordBundleFromTeamRun({
      ...teamBundle,
      teamRun: {
        ...teamBundle.teamRun,
        status: 'succeeded',
        updatedAt: '2026-04-07T00:01:00.000Z',
      },
      steps: teamBundle.steps.map((step) => ({
        ...step,
        status: 'succeeded',
        output: {
          summary: 'done',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
        startedAt: '2026-04-07T00:00:10.000Z',
        completedAt: '2026-04-07T00:01:00.000Z',
      })),
      sharedState: {
        ...teamBundle.sharedState,
        artifacts: [],
        lastUpdatedAt: '2026-04-07T00:01:00.000Z',
      },
    });

    const response = createExecutionResponseFromRunRecord({
      responseId: 'resp_requested_outputs_missing_1',
      runRecord,
      model: 'gemini-3-pro',
      runtimeProfile: 'default',
      service: 'gemini',
      output: [createExecutionResponseMessage('Here is the final answer.')],
    });

    expect(response.status).toBe('failed');
    expect(response.metadata?.executionSummary?.requestedOutputPolicy).toEqual({
      status: 'missing-required',
      message: 'missing required requested outputs: work bundle',
      missingRequiredLabels: ['work bundle'],
    });
    expect(response.metadata?.executionSummary?.failureSummary).toEqual({
      code: 'requested_output_required_missing',
      message: 'missing required requested outputs: work bundle',
    });
  });
});
