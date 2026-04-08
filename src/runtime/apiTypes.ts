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
    runtimeProfile?: string | null;
    service?: string | null;
  };
}

export interface ExecutionResponseFromRunRecordInput {
  responseId: string;
  runRecord: ExecutionRunRecordBundle;
  model?: string | null;
  output: ExecutionResponseOutputItem[];
  runtimeProfile?: string | null;
  service?: string | null;
}
