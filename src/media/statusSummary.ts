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
  diagnostics: MediaGenerationStatusDiagnostics;
  metadata: {
    source?: unknown;
    transport?: unknown;
    runtimeProfile?: unknown;
    conversationId?: unknown;
    tabTargetId?: unknown;
    capabilityId?: unknown;
    capabilityAvailability?: unknown;
    failureCode?: unknown;
    artifactPollCount?: unknown;
    generatedArtifactCount?: unknown;
  };
}

export interface MediaGenerationStatusDiagnostics {
  capability: {
    id: string | null;
    availability: string | null;
    source: string | null;
    discoveryAction: string | null;
  };
  submittedTab: {
    targetId: string | null;
    initialUrl: string | null;
    submittedUrl: string | null;
  };
  provider: {
    latestHref: string | null;
    routeProgression: string[];
  };
  runState: {
    pollCount: number | null;
    runState: string | null;
    pending: boolean | null;
    terminalImage: boolean | null;
    terminalVideo: boolean | null;
    generatedImageCount: number | null;
    generatedVideoCount: number | null;
    generatedArtifactCount: number | null;
    materializationCandidateSource: string | null;
    decision: string | null;
  };
  materialization: {
    artifactId: string | null;
    path: string | null;
    mimeType: string | null;
    materialization: string | null;
    materializationSource: string | null;
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
    diagnostics: summarizeDiagnostics(response),
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
    capabilityAvailability: metadata?.capabilityAvailability ?? null,
    failureCode: metadata?.failureCode ?? null,
    artifactPollCount: metadata?.artifactPollCount ?? null,
    generatedArtifactCount: metadata?.generatedArtifactCount ?? null,
  };
}

function summarizeDiagnostics(response: MediaGenerationResponse): MediaGenerationStatusDiagnostics {
  const timeline = response.timeline ?? [];
  const capabilityEvent = findLastEvent(timeline, 'capability_discovered') ??
    findLastEvent(timeline, 'capability_unavailable');
  const attachedEvent = findLastEvent(timeline, 'browser_target_attached');
  const promptSubmittedEvent = findLastEvent(timeline, 'prompt_submitted');
  const runStateEvent = findLastEvent(timeline, 'run_state_observed') ??
    findLastEvent(timeline, 'video_visible') ??
    findLastEvent(timeline, 'image_visible') ??
    findLastEvent(timeline, 'submitted_state_observed') ??
    findLastEvent(timeline, 'submit_path_observed') ??
    findLastEvent(timeline, 'composer_ready');
  const materializedEvent = findLastEvent(timeline, 'artifact_materialized');
  const providerRouteEvents = timeline.filter((event) => {
    const details = event.details ?? {};
    return stringOrNull(details.providerHref) || stringOrNull(details.href) || stringOrNull(details.url);
  });
  const routeProgression = uniqueStrings(providerRouteEvents.flatMap((event) => {
    const details = event.details ?? {};
    return [
      stringOrNull(details.providerHref),
      stringOrNull(details.href),
      stringOrNull(details.url),
    ].filter((entry): entry is string => Boolean(entry));
  }));
  const latestHref = routeProgression[routeProgression.length - 1] ?? null;
  const capabilityDetails = capabilityEvent?.details ?? {};
  const capabilityMetadata = isRecord(capabilityDetails.workbenchCapability)
    ? capabilityDetails.workbenchCapability
    : isRecord(capabilityDetails.metadata)
      ? { metadata: capabilityDetails.metadata }
      : null;
  const metadataRecord = isRecord(capabilityMetadata?.metadata)
    ? capabilityMetadata.metadata
    : isRecord(capabilityDetails.metadata)
      ? capabilityDetails.metadata
      : null;
  const discoveryAction = isRecord(metadataRecord?.discoveryAction)
    ? metadataRecord.discoveryAction
    : null;
  const runStateDetails = runStateEvent?.details ?? {};
  const materializedDetails = materializedEvent?.details ?? {};

  return {
    capability: {
      id: stringOrNull(capabilityDetails.capabilityId) ?? stringOrNull(capabilityDetails.id),
      availability: stringOrNull(capabilityDetails.availability),
      source: stringOrNull(capabilityDetails.source),
      discoveryAction: stringOrNull(discoveryAction?.action),
    },
    submittedTab: {
      targetId: stringOrNull(promptSubmittedEvent?.details?.tabTargetId) ??
        stringOrNull(attachedEvent?.details?.targetId) ??
        stringOrNull(response.metadata?.tabTargetId),
      initialUrl: stringOrNull(attachedEvent?.details?.targetUrl),
      submittedUrl: stringOrNull(promptSubmittedEvent?.details?.url),
    },
    provider: {
      latestHref,
      routeProgression,
    },
    runState: {
      pollCount: numberOrNull(runStateDetails.pollCount),
      runState: stringOrNull(runStateDetails.runState),
      pending: booleanOrNull(runStateDetails.pending),
      terminalImage: booleanOrNull(runStateDetails.terminalImage),
      terminalVideo: booleanOrNull(runStateDetails.terminalVideo),
      generatedImageCount: numberOrNull(runStateDetails.generatedImageCount),
      generatedVideoCount: numberOrNull(runStateDetails.generatedVideoCount),
      generatedArtifactCount: numberOrNull(runStateDetails.generatedArtifactCount) ??
        numberOrNull(response.metadata?.generatedArtifactCount),
      materializationCandidateSource: stringOrNull(runStateDetails.materializationCandidateSource),
      decision: stringOrNull(runStateDetails.decision),
    },
    materialization: {
      artifactId: stringOrNull(materializedDetails.providerArtifactId),
      path: stringOrNull(materializedDetails.path),
      mimeType: stringOrNull(materializedDetails.mimeType),
      materialization: stringOrNull(materializedDetails.materialization),
      materializationSource: stringOrNull(materializedDetails.materializationSource),
    },
  };
}

function findLastEvent(
  timeline: MediaGenerationTimelineEvent[],
  eventName: MediaGenerationTimelineEvent['event'],
): MediaGenerationTimelineEvent | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    if (timeline[index]?.event === eventName) return timeline[index] ?? null;
  }
  return null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
