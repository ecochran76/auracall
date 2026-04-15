import type {
  TeamRunArtifactRef,
  TeamRunExecutionPolicy,
  TeamRunFailure,
  TeamRunHandoff,
  TeamRunLocalActionRequest,
  TeamRunStepInput,
  TeamRunStepKind,
  TeamRunStepOutput,
  TeamRunStructuredOutput,
  TeamRunTrigger,
} from '../teams/types.js';

export type ExecutionRunStatus = 'planned' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type ExecutionRunSourceKind = 'team-run' | 'direct';

export type ExecutionRunStepStatus =
  | 'planned'
  | 'runnable'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'cancelled';

export type ExecutionRunEventType =
  | 'run-created'
  | 'step-planned'
  | 'step-runnable'
  | 'step-started'
  | 'step-succeeded'
  | 'step-failed'
  | 'handoff-consumed'
  | 'lease-acquired'
  | 'lease-released'
  | 'note-added';

export type ExecutionRunLeaseStatus = 'active' | 'released' | 'expired';

export type ExecutionRunServiceId = 'chatgpt' | 'gemini' | 'grok' | null;
export type ExecutionRunnerServiceId = Exclude<ExecutionRunServiceId, null>;

export type ExecutionRunAffinityHostRequirement = 'any' | 'same-host';
export type ExecutionRunnerStatus = 'active' | 'stale';

export interface ExecutionRun {
  id: string;
  sourceKind: ExecutionRunSourceKind;
  sourceId: string | null;
  taskRunSpecId?: string | null;
  status: ExecutionRunStatus;
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

export interface ExecutionRunStep {
  id: string;
  runId: string;
  sourceStepId: string | null;
  agentId: string;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  service: ExecutionRunServiceId;
  kind: TeamRunStepKind;
  status: ExecutionRunStepStatus;
  order: number;
  dependsOnStepIds: string[];
  input: TeamRunStepInput;
  output: TeamRunStepOutput | null;
  startedAt: string | null;
  completedAt: string | null;
  failure: TeamRunFailure | null;
}

export interface ExecutionRunEvent {
  id: string;
  runId: string;
  type: ExecutionRunEventType;
  createdAt: string;
  stepId?: string | null;
  leaseId?: string | null;
  note?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface ExecutionRunLease {
  id: string;
  runId: string;
  ownerId: string;
  status: ExecutionRunLeaseStatus;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  releasedAt?: string | null;
  releaseReason?: string | null;
}

export interface ExecutionRunAffinityRecord {
  service: ExecutionRunServiceId;
  serviceAccountId: string | null;
  browserRequired: boolean;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  hostRequirement: ExecutionRunAffinityHostRequirement;
  requiredHostId: string | null;
  eligibilityNote: string | null;
}

export interface ExecutionRunnerRecord {
  id: string;
  hostId: string;
  status: ExecutionRunnerStatus;
  startedAt: string;
  lastHeartbeatAt: string;
  expiresAt: string;
  lastActivityAt: string | null;
  lastClaimedRunId: string | null;
  serviceIds: ExecutionRunnerServiceId[];
  runtimeProfileIds: string[];
  browserProfileIds: string[];
  serviceAccountIds: string[];
  browserCapable: boolean;
  eligibilityNote: string | null;
}

export interface ExecutionRunSharedState {
  id: string;
  runId: string;
  status: 'active' | 'succeeded' | 'failed' | 'cancelled';
  artifacts: TeamRunArtifactRef[];
  structuredOutputs: TeamRunStructuredOutput[];
  notes: string[];
  history: ExecutionRunEvent[];
  lastUpdatedAt: string;
}

export interface ExecutionRunRecordBundle {
  run: ExecutionRun;
  steps: ExecutionRunStep[];
  handoffs: TeamRunHandoff[];
  localActionRequests: TeamRunLocalActionRequest[];
  sharedState: ExecutionRunSharedState;
  events: ExecutionRunEvent[];
  leases: ExecutionRunLease[];
}
