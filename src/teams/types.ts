export type TeamRunStatus = 'planned' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type TeamRunTrigger = 'cli' | 'service' | 'api' | 'mcp' | 'scheduled' | 'internal';

export type TeamRunExecutionMode = 'sequential';

export type TeamRunFailPolicy = 'fail-fast';

export type TeamRunParallelismMode = 'disabled';

export type TeamRunHandoffRequirement = 'explicit';

export type TeamRunStepKind = 'prompt' | 'analysis' | 'handoff' | 'review' | 'synthesis';

export type TeamRunStepStatus =
  | 'planned'
  | 'ready'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'cancelled';

export type TeamRunHandoffStatus = 'prepared' | 'delivered' | 'consumed' | 'failed';

export type TeamRunLocalActionRequestStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'failed'
  | 'cancelled';

export type TeamRunSharedStateStatus = 'active' | 'succeeded' | 'failed' | 'cancelled';

export type TeamRunHistoryEventType =
  | 'step-planned'
  | 'step-started'
  | 'step-succeeded'
  | 'step-failed'
  | 'handoff-created'
  | 'handoff-consumed'
  | 'artifact-added'
  | 'note-added';

export type TeamRunServiceId = 'chatgpt' | 'gemini' | 'grok' | null;

export type TaskRunSpecTrigger = TeamRunTrigger;

export type TaskRunSpecLocalActionMode = 'forbidden' | 'allowed' | 'approval-required';
export type TaskRunSpecLocalActionComplexityStage = 'bounded-command' | 'repo-automation' | 'extended';

export type TaskRunSpecHumanDefaultBehavior = 'pause' | 'fail' | 'continue';
export type TaskRunSpecRequestedOutputKind =
  | 'final-response'
  | 'patch'
  | 'artifact-bundle'
  | 'review-note'
  | 'structured-report';
export type TaskRunSpecRequestedOutputFormat = 'text' | 'markdown' | 'json' | 'diff' | 'bundle';
export type TaskRunSpecRequestedOutputDestination = 'response-body' | 'artifact-store' | 'handoff';
export type TaskRunSpecInputArtifactKind =
  | 'file'
  | 'directory'
  | 'doc'
  | 'bundle'
  | 'prior-artifact'
  | 'url';
export type TaskRunSpecTurnStopStatus = 'succeeded' | 'failed' | 'cancelled' | 'needs-human';
export type TaskRunSpecHumanRequiredOn = 'needs-approval' | 'missing-info' | 'needs-human';
export type TaskRunSpecLocalActionResultReportingMode = 'summary-only' | 'summary-and-payload';

export interface TaskRunSpecRequestedOutput {
  kind: TaskRunSpecRequestedOutputKind;
  label: string;
  format: TaskRunSpecRequestedOutputFormat;
  required: boolean;
  schemaHint?: string | null;
  destination: TaskRunSpecRequestedOutputDestination;
}

export interface TaskRunSpecInputArtifact {
  id: string;
  kind: TaskRunSpecInputArtifactKind;
  title: string;
  path?: string | null;
  uri?: string | null;
  mediaType?: string | null;
  notes: string[];
  required: boolean;
}

export interface TaskRunSpecTurnPolicy {
  maxTurns?: number | null;
  stopOnStatus: TaskRunSpecTurnStopStatus[];
  allowTeamInitiatedStop: boolean;
  allowHumanEscalation: boolean;
}

export interface TaskRunSpecHumanInteractionPolicy {
  requiredOn: TaskRunSpecHumanRequiredOn[];
  allowClarificationRequests: boolean;
  allowApprovalRequests: boolean;
  defaultBehavior: TaskRunSpecHumanDefaultBehavior;
}

export interface TaskRunSpecLocalActionPolicy {
  mode: TaskRunSpecLocalActionMode;
  complexityStage: TaskRunSpecLocalActionComplexityStage;
  allowedActionKinds: string[];
  allowedCommands: string[];
  allowedCwdRoots: string[];
  resultReportingMode: TaskRunSpecLocalActionResultReportingMode;
}

export interface TaskRunSpecConstraints {
  allowedServices?: TeamRunServiceId[] | null;
  blockedServices?: Exclude<TeamRunServiceId, null>[] | null;
  maxRuntimeMinutes?: number | null;
  maxTurns?: number | null;
  providerBudget?: {
    maxRequests?: number | null;
    maxTokens?: number | null;
  } | null;
}

export interface TaskRunSpecOverrides {
  runtimeProfileId?: string | null;
  browserProfileId?: string | null;
  agentIds?: string[] | null;
  promptAppend?: string | null;
  structuredContext?: Record<string, unknown> | null;
}

export interface TaskRunSpecRequestedBy {
  kind: TaskRunSpecTrigger;
  id?: string | null;
  label?: string | null;
}

export interface TaskRunSpec {
  id: string;
  teamId: string;
  title: string;
  objective: string;
  successCriteria: string[];
  requestedOutputs: TaskRunSpecRequestedOutput[];
  inputArtifacts: TaskRunSpecInputArtifact[];
  context: Record<string, unknown>;
  constraints: TaskRunSpecConstraints;
  overrides: TaskRunSpecOverrides;
  turnPolicy: TaskRunSpecTurnPolicy;
  humanInteractionPolicy: TaskRunSpecHumanInteractionPolicy;
  localActionPolicy: TaskRunSpecLocalActionPolicy;
  requestedBy: TaskRunSpecRequestedBy | null;
  trigger: TaskRunSpecTrigger;
  createdAt: string;
}

export interface TeamRunExecutionPolicy {
  executionMode: TeamRunExecutionMode;
  failPolicy: TeamRunFailPolicy;
  parallelismMode: TeamRunParallelismMode;
  handoffRequirement: TeamRunHandoffRequirement;
}

export interface TeamRunArtifactRef {
  id: string;
  kind: string;
  path?: string | null;
  uri?: string | null;
  title?: string | null;
}

export interface TeamRunStructuredOutput {
  key: string;
  value: unknown;
}

export interface TeamRunFailure {
  code: string;
  message: string;
  ownerStepId?: string | null;
  details?: Record<string, unknown> | null;
}

export interface TeamRunStepInput {
  prompt?: string | null;
  handoffIds: string[];
  artifacts: TeamRunArtifactRef[];
  structuredData: Record<string, unknown>;
  notes: string[];
}

export interface TeamRunStepOutput {
  summary?: string | null;
  artifacts: TeamRunArtifactRef[];
  structuredData: Record<string, unknown>;
  notes: string[];
}

export interface TeamRun {
  id: string;
  teamId: string;
  taskRunSpecId?: string | null;
  status: TeamRunStatus;
  createdAt: string;
  updatedAt: string;
  trigger: TeamRunTrigger;
  requestedBy: string | null;
  entryPrompt: string | null;
  initialInputs: Record<string, unknown>;
  sharedStateId: string;
  stepIds: string[];
  policy: TeamRunExecutionPolicy;
}

export interface TeamRunStep {
  id: string;
  teamRunId: string;
  agentId: string;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  service: TeamRunServiceId;
  kind: TeamRunStepKind;
  status: TeamRunStepStatus;
  order: number;
  dependsOnStepIds: string[];
  input: TeamRunStepInput;
  output: TeamRunStepOutput | null;
  startedAt: string | null;
  completedAt: string | null;
  failure: TeamRunFailure | null;
}

export interface TeamRunHandoff {
  id: string;
  teamRunId: string;
  fromStepId: string;
  toStepId: string;
  fromAgentId: string;
  toAgentId: string;
  summary: string;
  artifacts: TeamRunArtifactRef[];
  structuredData: Record<string, unknown>;
  notes: string[];
  status: TeamRunHandoffStatus;
  createdAt: string;
}

export interface TeamRunLocalActionRequest {
  id: string;
  teamRunId: string;
  ownerStepId: string;
  kind: string;
  summary: string;
  command?: string | null;
  args: string[];
  structuredPayload: Record<string, unknown>;
  notes: string[];
  status: TeamRunLocalActionRequestStatus;
  createdAt: string;
  approvedAt?: string | null;
  completedAt?: string | null;
  resultSummary?: string | null;
  resultPayload?: Record<string, unknown> | null;
}

export interface TeamRunHistoryEvent {
  id: string;
  teamRunId: string;
  type: TeamRunHistoryEventType;
  createdAt: string;
  stepId?: string | null;
  handoffId?: string | null;
  artifactId?: string | null;
  note?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface TeamRunSharedState {
  id: string;
  teamRunId: string;
  status: TeamRunSharedStateStatus;
  artifacts: TeamRunArtifactRef[];
  structuredOutputs: TeamRunStructuredOutput[];
  notes: string[];
  history: TeamRunHistoryEvent[];
  lastUpdatedAt: string;
}

export interface TeamRunBundle {
  teamRun: TeamRun;
  steps: TeamRunStep[];
  handoffs: TeamRunHandoff[];
  localActionRequests: TeamRunLocalActionRequest[];
  sharedState: TeamRunSharedState;
}

export const DEFAULT_TEAM_RUN_EXECUTION_POLICY: TeamRunExecutionPolicy = {
  executionMode: 'sequential',
  failPolicy: 'fail-fast',
  parallelismMode: 'disabled',
  handoffRequirement: 'explicit',
};

export const DEFAULT_TASK_RUN_SPEC_TURN_POLICY: TaskRunSpecTurnPolicy = {
  maxTurns: null,
  stopOnStatus: [],
  allowTeamInitiatedStop: true,
  allowHumanEscalation: true,
};

export const DEFAULT_TASK_RUN_SPEC_HUMAN_INTERACTION_POLICY: TaskRunSpecHumanInteractionPolicy = {
  requiredOn: [],
  allowClarificationRequests: true,
  allowApprovalRequests: true,
  defaultBehavior: 'pause',
};

export const DEFAULT_TASK_RUN_SPEC_LOCAL_ACTION_POLICY: TaskRunSpecLocalActionPolicy = {
  mode: 'forbidden',
  complexityStage: 'bounded-command',
  allowedActionKinds: [],
  allowedCommands: [],
  allowedCwdRoots: [],
  resultReportingMode: 'summary-only',
};
