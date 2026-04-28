import type { ExecutionRunRecordBundle } from './types.js';

export type ExecutionTransport = 'api' | 'browser' | 'auto';

export type ExecutionResponseStatus = 'in_progress' | 'completed' | 'failed' | 'cancelled';

export type ExecutionResponseOutputContentPartType = 'output_text';

export type ExecutionResponseOutputItemType = 'message' | 'artifact';

export type ExecutionResponseArtifactType =
  | 'file'
  | 'image'
  | 'music'
  | 'video'
  | 'canvas'
  | 'document'
  | 'generated';

export interface ExecutionRequestExtensionHints {
  runtimeProfile?: string | null;
  agent?: string | null;
  team?: string | null;
  service?: string | null;
  transport?: ExecutionTransport | null;
  outputContract?: string | null;
  composerTool?: string | null;
  deepResearchPlanAction?: 'start' | 'edit' | null;
}

export interface ExecutionRequestInputMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ExecutionRequestArtifactInput {
  id: string;
  mimeType?: string | null;
  fileName?: string | null;
  uri?: string | null;
}

export interface ExecutionRequest {
  model: string;
  input: string | ExecutionRequestInputMessage[];
  instructions?: string | null;
  metadata?: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
  attachments?: ExecutionRequestArtifactInput[];
  auracall?: ExecutionRequestExtensionHints;
}

export interface ExecutionResponseOutputTextPart {
  type: ExecutionResponseOutputContentPartType;
  text: string;
}

export interface ExecutionResponseMessageOutputItem {
  type: 'message';
  role: 'assistant';
  content: ExecutionResponseOutputTextPart[];
}

export interface ExecutionResponseArtifactOutputItem {
  type: 'artifact';
  id: string;
  artifact_type: ExecutionResponseArtifactType;
  title?: string | null;
  mime_type?: string | null;
  uri?: string | null;
  disposition?: 'inline' | 'attachment' | null;
  metadata?: Record<string, unknown> | null;
}

export type ExecutionResponseOutputItem =
  | ExecutionResponseMessageOutputItem
  | ExecutionResponseArtifactOutputItem;

export interface ExecutionResponse {
  id: string;
  object: 'response';
  status: ExecutionResponseStatus;
  model?: string | null;
  output: ExecutionResponseOutputItem[];
  metadata?: {
    runId?: string | null;
    taskRunSpecId?: string | null;
    taskRunSpecSummary?: {
      id?: string | null;
      teamId?: string | null;
      title?: string | null;
      objective?: string | null;
      createdAt?: string | null;
      persistedAt?: string | null;
      requestedOutputCount?: number;
      inputArtifactCount?: number;
    } | null;
    runtimeProfile?: string | null;
    service?: string | null;
    executionSummary?: {
      terminalStepId?: string | null;
      completedAt?: string | null;
      lastUpdatedAt?: string | null;
      stepSummaries?: Array<{
        stepId?: string | null;
        order?: number;
        agentId?: string | null;
        status?: string | null;
        runtimeProfileId?: string | null;
        browserProfileId?: string | null;
        service?: string | null;
      }> | null;
      localActionSummary?: {
        ownerStepId?: string | null;
        generatedAt?: string | null;
        total?: number;
        counts?: {
          requested?: number;
          approved?: number;
          rejected?: number;
          executed?: number;
          failed?: number;
          cancelled?: number;
        } | null;
        items?: Array<{
          requestId?: string | null;
          kind?: string | null;
          status?: string | null;
          summary?: string | null;
          command?: string | null;
          args?: string[];
          resultSummary?: string | null;
        }>;
      } | null;
      requestedOutputSummary?: {
        total?: number;
        fulfilledCount?: number;
        missingRequiredCount?: number;
        items?: Array<{
          label?: string | null;
          kind?: string | null;
          format?: string | null;
          destination?: string | null;
          required?: boolean;
          fulfilled?: boolean;
          evidence?: 'message' | 'artifact' | 'structured-output' | null;
        }>;
      } | null;
      requestedOutputPolicy?: {
        status?: 'satisfied' | 'missing-required' | null;
        message?: string | null;
        missingRequiredLabels?: string[];
      } | null;
      inputArtifactSummary?: {
        total?: number;
        items?: Array<{
          id?: string | null;
          kind?: string | null;
          title?: string | null;
          path?: string | null;
          uri?: string | null;
        }>;
      } | null;
      handoffTransferSummary?: {
        total?: number;
        items?: Array<{
          handoffId?: string | null;
          fromStepId?: string | null;
          fromAgentId?: string | null;
          title?: string | null;
          objective?: string | null;
          requestedOutputCount?: number;
          inputArtifactCount?: number;
        }>;
      } | null;
      providerUsageSummary?: {
        ownerStepId?: string | null;
        generatedAt?: string | null;
        inputTokens?: number;
        outputTokens?: number;
        reasoningTokens?: number;
        totalTokens?: number;
      } | null;
      browserRunSummary?: Record<string, unknown> | null;
      cancellationSummary?: {
        cancelledAt?: string | null;
        source?: 'operator' | 'service-host' | null;
        reason?: string | null;
      } | null;
      operatorControlSummary?: {
        humanEscalationResume?: {
          resumedAt?: string | null;
          note?: string | null;
        } | null;
        targetedDrain?: {
          requestedAt?: string | null;
          status?: 'executed' | 'skipped' | null;
          reason?: string | null;
          skipReason?: string | null;
        } | null;
      } | null;
      orchestrationTimelineSummary?: {
        total?: number;
        items?: Array<{
          type?: 'step-started' | 'step-succeeded' | 'step-failed' | 'handoff-consumed' | 'note-added' | null;
          createdAt?: string | null;
          stepId?: string | null;
          note?: string | null;
          handoffId?: string | null;
        }>;
      } | null;
      failureSummary?: {
        code?: string | null;
        message?: string | null;
        details?: Record<string, unknown> | null;
      } | null;
    } | null;
  };
}

export interface ExecutionResponseFromRunRecordInput {
  responseId: string;
  runRecord: ExecutionRunRecordBundle;
  model?: string | null;
  output: ExecutionResponseOutputItem[];
  runtimeProfile?: string | null;
  service?: string | null;
  taskRunSpecSummary?: {
    id?: string | null;
    teamId?: string | null;
    title?: string | null;
    objective?: string | null;
    createdAt?: string | null;
    persistedAt?: string | null;
    requestedOutputCount?: number;
    inputArtifactCount?: number;
  } | null;
}
