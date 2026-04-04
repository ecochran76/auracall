export type TeamRunStatus = 'planned' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type TeamRunTrigger = 'cli' | 'service' | 'api' | 'scheduled' | 'internal';

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

export const DEFAULT_TEAM_RUN_EXECUTION_POLICY: TeamRunExecutionPolicy = {
  executionMode: 'sequential',
  failPolicy: 'fail-fast',
  parallelismMode: 'disabled',
  handoffRequirement: 'explicit',
};
