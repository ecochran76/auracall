import type {
  MediaGenerationArtifact,
  MediaGenerationResponse,
  MediaGenerationStatus,
  MediaGenerationTimelineEvent,
} from './types.js';

export interface MediaGenerationArtifactStatusSummary {
  id: string;
  type: MediaGenerationArtifact['type'];
  fileName?: string | null;
  path?: string | null;
  uri?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  materialization?: string | null;
  remoteUrl?: string | null;
}

export interface MediaGenerationStatusSummary {
  id: string;
  object: 'media_generation_status';
  status: MediaGenerationStatus;
  provider: MediaGenerationResponse['provider'];
  mediaType: MediaGenerationResponse['mediaType'];
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  lastEvent?: MediaGenerationTimelineEvent | null;
  timeline: MediaGenerationTimelineEvent[];
  artifactCount: number;
  artifacts: MediaGenerationArtifactStatusSummary[];
  failure?: MediaGenerationResponse['failure'];
  metadata: {
    source?: unknown;
    transport?: unknown;
    runtimeProfile?: unknown;
    conversationId?: unknown;
    tabTargetId?: unknown;
    capabilityId?: unknown;
    artifactPollCount?: unknown;
    generatedArtifactCount?: unknown;
  };
}

export function summarizeMediaGenerationStatus(
  response: MediaGenerationResponse,
): MediaGenerationStatusSummary {
  const timeline = response.timeline ?? [];
  return {
    id: response.id,
    object: 'media_generation_status',
    status: response.status,
    provider: response.provider,
    mediaType: response.mediaType,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
    completedAt: response.completedAt ?? null,
    lastEvent: timeline[timeline.length - 1] ?? null,
    timeline,
    artifactCount: response.artifacts.length,
    artifacts: response.artifacts.map(summarizeArtifact),
    failure: response.failure ?? null,
    metadata: summarizeMetadata(response.metadata ?? null),
  };
}

function summarizeArtifact(artifact: MediaGenerationArtifact): MediaGenerationArtifactStatusSummary {
  const metadata = artifact.metadata ?? {};
  return {
    id: artifact.id,
    type: artifact.type,
    fileName: artifact.fileName ?? null,
    path: artifact.path ?? null,
    uri: artifact.uri ?? null,
    mimeType: artifact.mimeType ?? null,
    width: artifact.width ?? null,
    height: artifact.height ?? null,
    durationSeconds: artifact.durationSeconds ?? null,
    materialization: stringOrNull(metadata.materialization),
    remoteUrl: stringOrNull(metadata.remoteUrl),
  };
}

function summarizeMetadata(metadata: Record<string, unknown> | null): MediaGenerationStatusSummary['metadata'] {
  return {
    source: metadata?.source ?? null,
    transport: metadata?.transport ?? null,
    runtimeProfile: metadata?.runtimeProfile ?? null,
    conversationId: metadata?.conversationId ?? null,
    tabTargetId: metadata?.tabTargetId ?? null,
    capabilityId: metadata?.capabilityId ?? null,
    artifactPollCount: metadata?.artifactPollCount ?? null,
    generatedArtifactCount: metadata?.generatedArtifactCount ?? null,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
