export type MediaGenerationProvider = 'gemini' | 'grok';

export type MediaGenerationType = 'image' | 'music' | 'video';

export type MediaGenerationTransport = 'api' | 'browser' | 'auto';

export type MediaGenerationSource = 'cli' | 'api' | 'mcp';

export type MediaGenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type MediaGenerationTimelineEventName =
  | 'running_persisted'
  | 'capability_discovered'
  | 'executor_started'
  | 'browser_target_attached'
  | 'gemini_surface_ready'
  | 'capability_selected'
  | 'composer_ready'
  | 'prompt_inserted'
  | 'send_attempted'
  | 'submitted_state_observed'
  | 'prompt_submitted'
  | 'artifact_poll'
  | 'image_visible'
  | 'artifact_materialized'
  | 'completed'
  | 'failed';

export interface MediaGenerationTimelineEvent {
  event: MediaGenerationTimelineEventName;
  at: string;
  details?: Record<string, unknown> | null;
}

export type MediaGenerationTimelineEmitter = (
  event: Omit<MediaGenerationTimelineEvent, 'at'> & { at?: string },
) => Promise<void> | void;

export interface MediaGenerationRequest {
  provider: MediaGenerationProvider;
  mediaType: MediaGenerationType;
  prompt: string;
  model?: string | null;
  transport?: MediaGenerationTransport | null;
  count?: number | null;
  size?: string | null;
  aspectRatio?: string | null;
  outputDir?: string | null;
  source?: MediaGenerationSource | null;
  metadata?: Record<string, unknown> | null;
}

export interface MediaGenerationArtifact {
  id: string;
  type: MediaGenerationType;
  mimeType?: string | null;
  fileName?: string | null;
  path?: string | null;
  uri?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface MediaGenerationFailure {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface MediaGenerationResponse {
  id: string;
  object: 'media_generation';
  status: MediaGenerationStatus;
  provider: MediaGenerationProvider;
  mediaType: MediaGenerationType;
  model?: string | null;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  artifacts: MediaGenerationArtifact[];
  timeline?: MediaGenerationTimelineEvent[];
  metadata?: Record<string, unknown> | null;
  failure?: MediaGenerationFailure | null;
}

export interface MediaGenerationStoredRecord {
  id: string;
  revision: number;
  persistedAt: string;
  response: MediaGenerationResponse;
}

export interface MediaGenerationExecutorInput {
  request: MediaGenerationRequest;
  id: string;
  createdAt: string;
  artifactDir: string;
  emitTimeline?: MediaGenerationTimelineEmitter;
}

export interface MediaGenerationExecutorResult {
  artifacts: MediaGenerationArtifact[];
  model?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type MediaGenerationExecutor = (
  input: MediaGenerationExecutorInput,
) => Promise<MediaGenerationExecutorResult>;
