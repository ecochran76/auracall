import {
  createExecutionRun,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../../src/runtime/model.js';
import type { ExecutionRunRecordBundle } from '../../src/runtime/types.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../../src/teams/types.js';

export interface ChatgptDeepResearchStatusFixture {
  runId: string;
  stepId: string;
  conversationUrl: string;
  screenshotPath: string;
  bundle: ExecutionRunRecordBundle;
}

export function createChatgptDeepResearchStatusFixture(input: {
  runId?: string;
  createdAt?: string;
  screenshotPath?: string;
} = {}): ChatgptDeepResearchStatusFixture {
  const runId = input.runId ?? 'resp_chatgpt_deep_research_status_1';
  const stepId = `${runId}:step:1`;
  const createdAt = input.createdAt ?? '2026-04-28T14:15:00.000Z';
  const completedAt = '2026-04-28T14:15:08.000Z';
  const conversationUrl = 'https://chatgpt.com/c/69f0bbc4-62c4-83ea-bb10-2c83b7f83b38';
  const screenshotPath =
    input.screenshotPath ??
    '/tmp/auracall/diagnostics/chatgpt-deep-research/2026-04-28T14-15-08-000Z-plan-edit-opened.png';
  const reviewEvidence = {
    capturedAt: '2026-04-28T14:15:08.000Z',
    stage: 'plan-edit-opened',
    planAction: 'edit',
    tabUrl: conversationUrl,
    modifyPlanLabel: 'Update',
    modifyPlanVisible: true,
    editTargetKind: 'iframe-coordinate',
    editTargetX: 968,
    editTargetY: 232,
    screenshotPath,
    screenshotMimeType: 'image/png',
    screenshotBytes: 74040,
  };
  const bundle = createExecutionRunRecordBundle({
    run: createExecutionRun({
      id: runId,
      sourceKind: 'direct',
      sourceId: null,
      status: 'succeeded',
      createdAt,
      updatedAt: completedAt,
      trigger: 'api',
      requestedBy: null,
      entryPrompt: 'Use Deep Research and open the edit flow.',
      initialInputs: {
        model: 'gpt-5.2-thinking',
        runtimeProfile: 'wsl-chrome-3',
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
        runtimeProfileId: 'wsl-chrome-3',
        browserProfileId: 'wsl-chrome-3',
        service: 'chatgpt',
        kind: 'prompt',
        status: 'succeeded',
        order: 1,
        dependsOnStepIds: [],
        input: {
          prompt: 'Use Deep Research and open the edit flow.',
          handoffIds: [],
          artifacts: [],
          structuredData: {},
          notes: [],
        },
        output: {
          summary: 'Deep Research plan edit state opened.',
          artifacts: [],
          structuredData: {
            browserRun: {
              provider: 'chatgpt',
              service: 'chatgpt',
              conversationId: '69f0bbc4-62c4-83ea-bb10-2c83b7f83b38',
              tabUrl: conversationUrl,
              runtimeProfileId: 'wsl-chrome-3',
              browserProfileId: 'wsl-chrome-3',
              chatgptDeepResearchStage: 'plan-edit-opened',
              chatgptDeepResearchPlanAction: 'edit',
              chatgptDeepResearchStartMethod: null,
              chatgptDeepResearchModifyPlanLabel: 'Update',
              chatgptDeepResearchModifyPlanVisible: true,
              chatgptDeepResearchReviewEvidence: reviewEvidence,
            },
          },
          notes: [],
        },
        startedAt: createdAt,
        completedAt,
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
      lastUpdatedAt: completedAt,
    }),
    events: [
      createExecutionRunEvent({
        id: `${runId}:event:started`,
        runId,
        stepId,
        type: 'step-started',
        createdAt,
        note: 'step started by local runner',
      }),
      createExecutionRunEvent({
        id: `${runId}:event:succeeded`,
        runId,
        stepId,
        type: 'step-succeeded',
        createdAt: completedAt,
        note: 'step completed by local runner',
      }),
    ],
  });

  return {
    runId,
    stepId,
    conversationUrl,
    screenshotPath,
    bundle,
  };
}
