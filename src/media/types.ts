export type MediaGenerationProvider = 'gemini' | 'grok';

export type MediaGenerationType = 'image' | 'music' | 'video';

export type MediaGenerationTransport = 'api' | 'browser' | 'auto';

export type MediaGenerationSource = 'cli' | 'api' | 'mcp';

export type MediaGenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type MediaGenerationTimelineEventName =
  | 'running_persisted'
  | 'capability_discovered'
  | 'capability_unavailable'
  | 'executor_started'
  | 'browser_operation_queued'
  | 'browser_operation_acquired'
  | 'browser_target_attached'
  | 'provider_auth_preflight'
  | 'gemini_surface_ready'
  | 'capability_selected'
  | 'composer_ready'
  | 'prompt_inserted'
  | 'send_attempted'
  | 'submit_path_observed'
  | 'submitted_state_observed'
  | 'prompt_submitted'
  | 'run_state_observed'
  | 'artifact_poll'
  | 'image_visible'
  | 'music_visible'
  | 'video_visible'
  | 'no_generated_media'
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
  workbenchCapability?: import('../workbench/types.js').WorkbenchCapability | null;
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

export interface MediaGenerationMaterializeOptions {
  count?: number | null;
  compareFullQuality?: boolean | null;
  source?: MediaGenerationSource | null;
  metadata?: Record<string, unknown> | null;
}

export interface MediaGenerationMaterializerInput {
  response: MediaGenerationResponse;
  artifactDir: string;
  options?: MediaGenerationMaterializeOptions;
  emitTimeline?: MediaGenerationTimelineEmitter;
}

export interface MediaGenerationMaterializerResult {
  artifacts: MediaGenerationArtifact[];
  model?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type MediaGenerationMaterializer = (
  input: MediaGenerationMaterializerInput,
) => Promise<MediaGenerationMaterializerResult>;
