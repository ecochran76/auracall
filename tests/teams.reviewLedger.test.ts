import { describe, expect, it } from 'vitest';
import {
  createExecutionRun,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../src/runtime/model.js';
import type { ExecutionRuntimeControlContract } from '../src/runtime/contract.js';
import {
  createTeamRunReviewLedgerFromBundle,
  reviewTeamRunLedger,
} from '../src/teams/reviewLedger.js';
import type { TaskRunSpecRecordStore } from '../src/teams/store.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../src/teams/types.js';

describe('team run review ledger', () => {
  it('projects a deterministic serial review ledger from an existing runtime bundle', () => {
    const createdAt = '2026-04-15T18:00:00.000Z';
    const runId = 'team_review_serial';
    const analystStepId = `${runId}:step:1`;
    const reviewerStepId = `${runId}:step:2`;
    const bundle = createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: runId,
        sourceKind: 'team-run',
        sourceId: runId,
        taskRunSpecId: 'task_review_1',
        status: 'succeeded',
        createdAt,
        updatedAt: '2026-04-15T18:05:00.000Z',
        trigger: 'service',
        requestedBy: 'operator',
        entryPrompt: 'Investigate and review.',
        initialInputs: {},
        sharedStateId: `${runId}:state`,
        stepIds: [analystStepId, reviewerStepId],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: reviewerStepId,
          runId,
          sourceStepId: reviewerStepId,
          agentId: 'reviewer',
          runtimeProfileId: 'review-runtime',
          browserProfileId: 'review-browser',
          service: 'gemini',
          kind: 'review',
          status: 'succeeded',
          order: 2,
          dependsOnStepIds: [analystStepId],
          input: {
            prompt: 'Review the analysis.',
            handoffIds: [`${runId}:handoff:1`],
            artifacts: [],
            structuredData: {
              structuredContext: {
                reviewMode: 'strict',
              },
            },
            notes: [],
          },
          output: {
            summary: 'review complete',
            artifacts: [
              {
                id: 'artifact_review',
                kind: 'doc',
                uri: 'artifact://review',
                title: 'Review note',
              },
            ],
            structuredData: {
              browserRun: {
                provider: 'gemini',
                conversationId: 'gemini-conversation-1',
                tabUrl: 'https://gemini.google.com/app/gemini-conversation-1',
                service: 'gemini',
                runtimeProfileId: 'review-runtime',
                browserProfileId: 'review-browser',
                agentId: 'reviewer',
                configuredUrl: 'https://gemini.google.com/app',
                desiredModel: 'Gemini 3 Pro',
                cachePath: null,
                cachePathStatus: 'unavailable',
                cachePathReason: 'provider cache identity is not resolved during stored-step execution',
              },
              text: 'Looks consistent.',
            },
            notes: [],
          },
          startedAt: '2026-04-15T18:03:00.000Z',
          completedAt: '2026-04-15T18:05:00.000Z',
        }),
        createExecutionRunStep({
          id: analystStepId,
          runId,
          sourceStepId: analystStepId,
          agentId: 'analyst',
          runtimeProfileId: 'analysis-runtime',
          browserProfileId: 'analysis-browser',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'succeeded',
          order: 1,
          dependsOnStepIds: [],
          input: {
            prompt: 'Analyze the request.',
            handoffIds: [],
            artifacts: [
              {
                id: 'artifact_input',
                kind: 'file',
                path: '/tmp/input.md',
                title: 'Input notes',
              },
            ],
            structuredData: {
              serviceAccountId: 'service-account:chatgpt:operator@example.com',
              taskOverrideStructuredContext: {
                focus: 'review ledger',
              },
            },
            notes: [],
          },
          output: {
            summary: 'analysis complete',
            artifacts: [
              {
                id: 'artifact_analysis',
                kind: 'doc',
                uri: 'artifact://analysis',
                title: 'Analysis',
              },
            ],
            structuredData: {
              browserRun: {
                provider: 'chatgpt',
                conversationId: 'chatgpt-conversation-1',
                tabUrl: 'https://chatgpt.com/c/chatgpt-conversation-1',
                service: 'chatgpt',
                runtimeProfileId: 'analysis-runtime',
                browserProfileId: 'analysis-browser',
                agentId: 'analyst',
                projectId: 'g-p-review-ledger',
                configuredUrl: 'https://chatgpt.com/g/g-p-review-ledger',
                desiredModel: 'GPT-5.2',
                cachePath: null,
                cachePathStatus: 'unavailable',
                cachePathReason: 'provider cache identity is not resolved during stored-step execution',
              },
              responseText: 'Analysis result.',
            },
            notes: [],
          },
          startedAt: '2026-04-15T18:01:00.000Z',
          completedAt: '2026-04-15T18:02:00.000Z',
        }),
      ],
      handoffs: [
        {
          id: `${runId}:handoff:1`,
          teamRunId: runId,
          fromStepId: analystStepId,
          toStepId: reviewerStepId,
          fromAgentId: 'analyst',
          toAgentId: 'reviewer',
          summary: 'Analysis ready for review.',
          artifacts: [
            {
              id: 'artifact_handoff',
              kind: 'doc',
              uri: 'artifact://handoff',
              title: 'Handoff packet',
            },
          ],
          structuredData: {},
          notes: [],
          status: 'consumed',
          createdAt: '2026-04-15T18:02:30.000Z',
        },
      ],
      sharedState: createExecutionRunSharedState({
        id: `${runId}:state`,
        runId,
        status: 'succeeded',
        artifacts: [
          {
            id: 'artifact_shared',
            kind: 'bundle',
            uri: 'artifact://shared',
            title: 'Shared bundle',
          },
        ],
        structuredOutputs: [],
        notes: [],
        history: [],
        lastUpdatedAt: '2026-04-15T18:05:00.000Z',
      }),
      events: [],
    });

    const ledger = createTeamRunReviewLedgerFromBundle(bundle);

    expect(ledger).toMatchObject({
      id: `${runId}:review-ledger`,
      teamRunId: runId,
      taskRunSpecId: 'task_review_1',
      runtimeRunId: runId,
      status: 'succeeded',
      observations: [],
    });
    expect(ledger.sequence.map((step) => step.stepId)).toEqual([analystStepId, reviewerStepId]);
    expect(ledger.sequence[0]).toMatchObject({
      stepId: analystStepId,
      order: 1,
      parentStepIds: [],
      agentId: 'analyst',
      runtimeProfileId: 'analysis-runtime',
      browserProfileId: 'analysis-browser',
      service: 'chatgpt',
      serviceAccountId: 'service-account:chatgpt:operator@example.com',
      providerConversationRef: {
        service: 'chatgpt',
        conversationId: 'chatgpt-conversation-1',
        cachePath: null,
        cachePathStatus: 'unavailable',
        cachePathReason: 'provider cache identity is not resolved during stored-step execution',
        url: 'https://chatgpt.com/c/chatgpt-conversation-1',
        configuredUrl: 'https://chatgpt.com/g/g-p-review-ledger',
        projectId: 'g-p-review-ledger',
        runtimeProfileId: 'analysis-runtime',
        browserProfileId: 'analysis-browser',
        agentId: 'analyst',
        model: 'GPT-5.2',
      },
      inputSnapshot: {
        prompt: 'Analyze the request.',
        structuredContext: {
          focus: 'review ledger',
        },
        artifactIds: ['artifact_input'],
      },
      outputSnapshot: {
        summary: 'analysis complete',
        text: 'Analysis result.',
        artifactIds: ['artifact_analysis'],
      },
      status: 'succeeded',
      failure: null,
    });
    expect(ledger.sequence[1]).toMatchObject({
      stepId: reviewerStepId,
      order: 2,
      parentStepIds: [analystStepId],
      providerConversationRef: {
        service: 'gemini',
        conversationId: 'gemini-conversation-1',
        url: 'https://gemini.google.com/app/gemini-conversation-1',
        configuredUrl: 'https://gemini.google.com/app',
        runtimeProfileId: 'review-runtime',
        browserProfileId: 'review-browser',
        agentId: 'reviewer',
        model: 'Gemini 3 Pro',
        cachePathStatus: 'unavailable',
      },
      inputSnapshot: {
        structuredContext: {
          reviewMode: 'strict',
        },
      },
    });
    expect(ledger.handoffs).toEqual([
      {
        id: `${runId}:handoff:1`,
        fromStepId: analystStepId,
        toStepId: reviewerStepId,
        fromAgentId: 'analyst',
        toAgentId: 'reviewer',
        status: 'consumed',
        summary: 'Analysis ready for review.',
        artifactIds: ['artifact_handoff'],
        createdAt: '2026-04-15T18:02:30.000Z',
      },
    ]);
    expect(ledger.artifacts.map((artifact) => [artifact.id, artifact.source, artifact.stepId, artifact.handoffId])).toEqual([
      ['artifact_analysis', 'step-output', analystStepId, null],
      ['artifact_handoff', 'handoff', null, `${runId}:handoff:1`],
      ['artifact_input', 'step-input', analystStepId, null],
      ['artifact_review', 'step-output', reviewerStepId, null],
      ['artifact_shared', 'shared-state', null, null],
    ]);
  });

  it('represents unavailable provider conversation references as null instead of inferring them', () => {
    const createdAt = '2026-04-15T18:10:00.000Z';
    const runId = 'team_review_missing_provider_ref';
    const stepId = `${runId}:step:1`;
    const bundle = createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: runId,
        sourceKind: 'team-run',
        sourceId: runId,
        taskRunSpecId: null,
        status: 'planned',
        createdAt,
        updatedAt: createdAt,
        trigger: 'service',
        requestedBy: null,
        entryPrompt: 'Plan only.',
        initialInputs: {},
        sharedStateId: `${runId}:state`,
        stepIds: [stepId],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: stepId,
          runId,
          sourceStepId: stepId,
          agentId: 'planner',
          runtimeProfileId: null,
          browserProfileId: null,
          service: 'grok',
          kind: 'prompt',
          status: 'runnable',
          order: 1,
          dependsOnStepIds: [],
          input: {
            prompt: 'Prepare.',
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

    const ledger = createTeamRunReviewLedgerFromBundle(bundle);

    expect(ledger.sequence).toHaveLength(1);
    expect(ledger.sequence[0]).toMatchObject({
      stepId,
      status: 'runnable',
      providerConversationRef: null,
      serviceAccountId: null,
      outputSnapshot: null,
      failure: null,
    });
    expect(ledger.observations).toEqual([]);
  });

  it('projects minimal hard-stop observations from durable step failures', () => {
    const createdAt = '2026-04-15T18:20:00.000Z';
    const runId = 'team_review_hard_stops';
    const captchaStepId = `${runId}:step:1`;
    const loginStepId = `${runId}:step:2`;
    const humanStepId = `${runId}:step:3`;
    const genericStepId = `${runId}:step:4`;
    const bundle = createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: runId,
        sourceKind: 'team-run',
        sourceId: runId,
        taskRunSpecId: 'task_review_hard_stops',
        status: 'failed',
        createdAt,
        updatedAt: '2026-04-15T18:24:00.000Z',
        trigger: 'service',
        requestedBy: 'operator',
        entryPrompt: 'Exercise hard stops.',
        initialInputs: {},
        sharedStateId: `${runId}:state`,
        stepIds: [captchaStepId, loginStepId, humanStepId, genericStepId],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: captchaStepId,
          runId,
          sourceStepId: captchaStepId,
          agentId: 'gemini-worker',
          runtimeProfileId: 'gemini-runtime',
          browserProfileId: 'default',
          service: 'gemini',
          kind: 'analysis',
          status: 'failed',
          order: 1,
          dependsOnStepIds: [],
          input: {
            prompt: 'Run Gemini.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
          output: {
            summary: 'captcha detected',
            artifacts: [],
            structuredData: {
              browserRun: {
                conversationId: null,
                tabUrl: 'https://google.com/sorry/index',
                service: 'gemini',
              },
            },
            notes: [],
          },
          startedAt: '2026-04-15T18:20:10.000Z',
          completedAt: '2026-04-15T18:20:30.000Z',
          failure: {
            code: 'runner_execution_failed',
            message: 'Gemini reached google.com/sorry human-verification page.',
            ownerStepId: captchaStepId,
            details: {
              providerState: 'captcha-or-human-verification',
            },
          },
        }),
        createExecutionRunStep({
          id: loginStepId,
          runId,
          sourceStepId: loginStepId,
          agentId: 'chatgpt-worker',
          runtimeProfileId: 'chatgpt-runtime',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'failed',
          order: 2,
          dependsOnStepIds: [],
          input: {
            prompt: 'Run ChatGPT.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
          startedAt: '2026-04-15T18:21:00.000Z',
          completedAt: '2026-04-15T18:21:15.000Z',
          failure: {
            code: 'runner_execution_failed',
            message: 'Login required before continuing.',
            ownerStepId: loginStepId,
            details: null,
          },
        }),
        createExecutionRunStep({
          id: humanStepId,
          runId,
          sourceStepId: humanStepId,
          agentId: 'tool-worker',
          runtimeProfileId: 'tool-runtime',
          browserProfileId: null,
          service: 'grok',
          kind: 'prompt',
          status: 'failed',
          order: 3,
          dependsOnStepIds: [],
          input: {
            prompt: 'Request local action.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
          startedAt: '2026-04-15T18:22:00.000Z',
          completedAt: '2026-04-15T18:22:05.000Z',
          failure: {
            code: 'human_escalation_required',
            message: 'Operator approval required.',
            ownerStepId: humanStepId,
            details: {
              guidance: 'approve or reject local action',
            },
          },
        }),
        createExecutionRunStep({
          id: genericStepId,
          runId,
          sourceStepId: genericStepId,
          agentId: 'generic-worker',
          runtimeProfileId: 'generic-runtime',
          browserProfileId: null,
          service: 'grok',
          kind: 'analysis',
          status: 'failed',
          order: 4,
          dependsOnStepIds: [],
          input: {
            prompt: 'Fail generically.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
          startedAt: '2026-04-15T18:23:00.000Z',
          completedAt: '2026-04-15T18:23:05.000Z',
          failure: {
            code: 'runner_execution_failed',
            message: 'Unexpected local exception.',
            ownerStepId: genericStepId,
            details: null,
          },
        }),
      ],
      sharedState: createExecutionRunSharedState({
        id: `${runId}:state`,
        runId,
        status: 'failed',
        artifacts: [],
        structuredOutputs: [],
        notes: [],
        history: [],
        lastUpdatedAt: '2026-04-15T18:24:00.000Z',
      }),
      events: [],
    });

    const ledger = createTeamRunReviewLedgerFromBundle(bundle);

    expect(ledger.observations).toEqual([
      {
        id: `${captchaStepId}:observation:captcha-or-human-verification`,
        stepId: captchaStepId,
        state: 'captcha-or-human-verification',
        source: 'provider-adapter',
        observedAt: '2026-04-15T18:20:30.000Z',
        evidenceRef: 'https://google.com/sorry/index',
        confidence: 'high',
      },
      {
        id: `${loginStepId}:observation:login-required`,
        stepId: loginStepId,
        state: 'login-required',
        source: 'runtime',
        observedAt: '2026-04-15T18:21:15.000Z',
        evidenceRef: `step:${loginStepId}:failure:runner_execution_failed`,
        confidence: 'medium',
      },
      {
        id: `${humanStepId}:observation:awaiting-human`,
        stepId: humanStepId,
        state: 'awaiting-human',
        source: 'runtime',
        observedAt: '2026-04-15T18:22:05.000Z',
        evidenceRef: `step:${humanStepId}:failure:human_escalation_required`,
        confidence: 'high',
      },
    ]);
  });

  it('projects stored passive provider observations from browser-run metadata', () => {
    const createdAt = '2026-04-15T21:25:00.000Z';
    const runId = 'team_review_passive_observations';
    const stepId = `${runId}:step:1`;
    const bundle = createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: runId,
        sourceKind: 'team-run',
        sourceId: runId,
        taskRunSpecId: 'task_review_passive_observations',
        status: 'succeeded',
        createdAt,
        updatedAt: '2026-04-15T21:26:00.000Z',
        trigger: 'service',
        requestedBy: 'operator',
        entryPrompt: 'Observe passive states.',
        initialInputs: {},
        sharedStateId: `${runId}:state`,
        stepIds: [stepId],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: stepId,
          runId,
          sourceStepId: stepId,
          agentId: 'analyst',
          runtimeProfileId: 'chatgpt-observer',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'succeeded',
          order: 1,
          dependsOnStepIds: [],
          input: {
            prompt: 'Observe passive states.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
          output: {
            summary: 'observation complete',
            artifacts: [],
            structuredData: {
              browserRun: {
                conversationId: 'chatgpt-conversation-passive',
                tabUrl: 'https://chatgpt.com/c/chatgpt-conversation-passive',
                service: 'chatgpt',
                passiveObservations: [
                  {
                    state: 'thinking',
                    source: 'browser-service',
                    observedAt: '2026-04-15T21:25:10.000Z',
                    evidenceRef: 'Thinking about response',
                    confidence: 'medium',
                  },
                  {
                    state: 'response-incoming',
                    source: 'browser-service',
                    observedAt: '2026-04-15T21:25:14.000Z',
                    evidenceRef: 'chatgpt-assistant-snapshot',
                    confidence: 'high',
                  },
                  {
                    state: 'response-complete',
                    source: 'browser-service',
                    observedAt: '2026-04-15T21:25:18.000Z',
                    evidenceRef: 'chatgpt-response-finished',
                    confidence: 'high',
                  },
                ],
              },
              responseText: 'Observation result.',
            },
            notes: [],
          },
          startedAt: '2026-04-15T21:25:05.000Z',
          completedAt: '2026-04-15T21:25:20.000Z',
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
        lastUpdatedAt: '2026-04-15T21:26:00.000Z',
      }),
      events: [],
    });

    const ledger = createTeamRunReviewLedgerFromBundle(bundle);

    expect(ledger.observations).toEqual([
      {
        id: `${stepId}:stored-observation:1:thinking`,
        stepId,
        state: 'thinking',
        source: 'browser-service',
        observedAt: '2026-04-15T21:25:10.000Z',
        evidenceRef: 'Thinking about response',
        confidence: 'medium',
      },
      {
        id: `${stepId}:stored-observation:2:response-incoming`,
        stepId,
        state: 'response-incoming',
        source: 'browser-service',
        observedAt: '2026-04-15T21:25:14.000Z',
        evidenceRef: 'chatgpt-assistant-snapshot',
        confidence: 'high',
      },
      {
        id: `${stepId}:stored-observation:3:response-complete`,
        stepId,
        state: 'response-complete',
        source: 'browser-service',
        observedAt: '2026-04-15T21:25:18.000Z',
        evidenceRef: 'chatgpt-response-finished',
        confidence: 'high',
      },
    ]);
  });

  it('keeps taskRunSpecId review lookup scoped to team-run history', async () => {
    const taskRunSpecId = 'task_review_team_only';
    const teamRunId = 'teamrun_review_team_only';
    const olderTeamRun = createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: 'runtime_review_team_only_old',
        sourceKind: 'team-run',
        sourceId: teamRunId,
        taskRunSpecId,
        status: 'failed',
        createdAt: '2026-04-19T14:00:00.000Z',
        updatedAt: '2026-04-19T14:01:00.000Z',
        trigger: 'cli',
        requestedBy: 'auracall teams run',
        entryPrompt: null,
        initialInputs: {},
        sharedStateId: 'runtime_review_team_only_old:state',
        stepIds: ['runtime_review_team_only_old:step:1'],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: 'runtime_review_team_only_old:step:1',
          runId: 'runtime_review_team_only_old',
          sourceStepId: `${teamRunId}:step:1`,
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'failed',
          order: 1,
          dependsOnStepIds: [],
          input: {
            prompt: 'First attempt.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        }),
      ],
      sharedState: createExecutionRunSharedState({
        id: 'runtime_review_team_only_old:state',
        runId: 'runtime_review_team_only_old',
        status: 'failed',
        artifacts: [],
        structuredOutputs: [],
        notes: [],
        history: [],
        lastUpdatedAt: '2026-04-19T14:01:00.000Z',
      }),
      events: [],
    });
    const newerDirectRun = createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: 'runtime_review_team_only_direct',
        sourceKind: 'direct',
        sourceId: null,
        taskRunSpecId,
        status: 'succeeded',
        createdAt: '2026-04-19T14:05:00.000Z',
        updatedAt: '2026-04-19T14:06:00.000Z',
        trigger: 'cli',
        requestedBy: 'operator',
        entryPrompt: 'Direct retry.',
        initialInputs: {},
        sharedStateId: 'runtime_review_team_only_direct:state',
        stepIds: ['runtime_review_team_only_direct:step:1'],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: 'runtime_review_team_only_direct:step:1',
          runId: 'runtime_review_team_only_direct',
          sourceStepId: 'runtime_review_team_only_direct:step:1',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'analysis',
          status: 'succeeded',
          order: 1,
          dependsOnStepIds: [],
          input: {
            prompt: 'Direct attempt.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        }),
      ],
      sharedState: createExecutionRunSharedState({
        id: 'runtime_review_team_only_direct:state',
        runId: 'runtime_review_team_only_direct',
        status: 'succeeded',
        artifacts: [],
        structuredOutputs: [],
        notes: [],
        history: [],
        lastUpdatedAt: '2026-04-19T14:06:00.000Z',
      }),
      events: [],
    });
    const newerTeamRetry = createExecutionRunRecordBundle({
      run: createExecutionRun({
        id: 'runtime_review_team_only_retry',
        sourceKind: 'team-run',
        sourceId: teamRunId,
        taskRunSpecId,
        status: 'succeeded',
        createdAt: '2026-04-19T14:07:00.000Z',
        updatedAt: '2026-04-19T14:08:00.000Z',
        trigger: 'cli',
        requestedBy: 'auracall teams run',
        entryPrompt: null,
        initialInputs: {},
        sharedStateId: 'runtime_review_team_only_retry:state',
        stepIds: ['runtime_review_team_only_retry:step:1'],
        policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
      }),
      steps: [
        createExecutionRunStep({
          id: 'runtime_review_team_only_retry:step:1',
          runId: 'runtime_review_team_only_retry',
          sourceStepId: `${teamRunId}:step:1`,
          agentId: 'reviewer',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'chatgpt',
          kind: 'review',
          status: 'succeeded',
          order: 1,
          dependsOnStepIds: [],
          input: {
            prompt: 'Retried team attempt.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        }),
      ],
      sharedState: createExecutionRunSharedState({
        id: 'runtime_review_team_only_retry:state',
        runId: 'runtime_review_team_only_retry',
        status: 'succeeded',
        artifacts: [],
        structuredOutputs: [],
        notes: [],
        history: [],
        lastUpdatedAt: '2026-04-19T14:08:00.000Z',
      }),
      events: [],
    });
    const control: ExecutionRuntimeControlContract = {
      async createRun() {
        throw new Error('not used');
      },
      async readRun() {
        throw new Error('not used');
      },
      async inspectRun() {
        throw new Error('not used');
      },
      async listRuns(options) {
        expect(options).toEqual({ sourceKind: 'team-run' });
        return [
          {
            runId: olderTeamRun.run.id,
            revision: 1,
            persistedAt: olderTeamRun.run.updatedAt,
            bundle: olderTeamRun,
          },
          {
            runId: newerTeamRetry.run.id,
            revision: 1,
            persistedAt: newerTeamRetry.run.updatedAt,
            bundle: newerTeamRetry,
          },
        ];
      },
      async acquireLease() {
        throw new Error('not used');
      },
      async heartbeatLease() {
        throw new Error('not used');
      },
      async releaseLease() {
        throw new Error('not used');
      },
      async expireLeases() {
        throw new Error('not used');
      },
      async persistRun() {
        throw new Error('not used');
      },
      async resumeHumanEscalation() {
        throw new Error('not used');
      },
    };
    const taskRunSpecStore: TaskRunSpecRecordStore = {
      async ensureStorage() {
        throw new Error('not used');
      },
      async writeSpec() {
        throw new Error('not used');
      },
      async readSpec() {
        throw new Error('not used');
      },
      async readRecord(candidateTaskRunSpecId) {
        if (candidateTaskRunSpecId !== taskRunSpecId) {
          return null;
        }
        return {
          taskRunSpecId,
          revision: 1,
          persistedAt: '2026-04-19T13:59:00.000Z',
          spec: {
            id: taskRunSpecId,
            teamId: 'auracall-solo',
            title: 'Review selection lock',
            objective: 'Keep review lookup team scoped.',
            createdAt: '2026-04-19T13:58:00.000Z',
            successCriteria: [],
            requestedOutputs: [],
            inputArtifacts: [],
            context: {},
            overrides: {},
            requestedBy: { kind: 'cli', label: 'auracall teams run' },
            trigger: 'cli',
          } as never,
        };
      },
      async writeRecord() {
        throw new Error('not used');
      },
    };

    const payload = await reviewTeamRunLedger({
      taskRunSpecId,
      control,
      taskRunSpecStore,
    });

    expect(newerDirectRun.run.sourceKind).toBe('direct');
    expect(payload).toMatchObject({
      resolvedBy: 'task-run-spec-id',
      queryId: taskRunSpecId,
      matchingRuntimeRunCount: 2,
      matchingRuntimeRunIds: ['runtime_review_team_only_retry', 'runtime_review_team_only_old'],
      taskRunSpecSummary: {
        id: taskRunSpecId,
        teamId: 'auracall-solo',
      },
      ledger: {
        teamRunId,
        runtimeRunId: 'runtime_review_team_only_retry',
        taskRunSpecId,
        status: 'succeeded',
      },
    });
  });
});
