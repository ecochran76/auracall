import type { MediaGenerationService } from './media/service.js';
import { summarizeMediaGenerationStatus, type MediaGenerationStatusSummary } from './media/statusSummary.js';
import type { ExecutionResponsesService } from './runtime/responsesService.js';
import type { ExecutionResponse, ExecutionResponseStatus } from './runtime/apiTypes.js';
import type { RuntimeRunInspectionBrowserDiagnosticsSummary } from './runtime/inspection.js';

export type AuraCallRunStatusKind = 'response' | 'media_generation';

export interface AuraCallRunStatusStepSummary {
  stepId?: string | null;
  order?: number;
  agentId?: string | null;
  status?: string | null;
  runtimeProfileId?: string | null;
  browserProfileId?: string | null;
  service?: string | null;
}

export interface AuraCallRunStatusArtifactSummary {
  id: string;
  type: string;
  title?: string | null;
  fileName?: string | null;
  path?: string | null;
  uri?: string | null;
  mimeType?: string | null;
  materialization?: string | null;
  remoteUrl?: string | null;
  checksumSha256?: string | null;
  previewArtifactId?: string | null;
  previewSize?: number | null;
  previewChecksumSha256?: string | null;
  fullQualityDiffersFromPreview?: boolean | null;
  downloadLabel?: string | null;
  downloadVariant?: string | null;
  downloadOptions?: string[] | null;
}

export interface AuraCallRunStatus {
  id: string;
  object: 'auracall_run_status';
  kind: AuraCallRunStatusKind;
  status: ExecutionResponseStatus | MediaGenerationStatusSummary['status'];
  updatedAt?: string | null;
  completedAt?: string | null;
  lastEvent?: unknown | null;
  stepCount?: number;
  steps?: AuraCallRunStatusStepSummary[];
  artifactCount: number;
  artifacts: AuraCallRunStatusArtifactSummary[];
  browserDiagnostics?: RuntimeRunInspectionBrowserDiagnosticsSummary;
  metadata: Record<string, unknown>;
  failure?: unknown | null;
}

export interface ReadAuraCallRunStatusDeps {
  responsesService: Pick<ExecutionResponsesService, 'readResponse'>;
  mediaGenerationService: Pick<MediaGenerationService, 'readGeneration'>;
}

export async function readAuraCallRunStatus(
  id: string,
  deps: ReadAuraCallRunStatusDeps,
): Promise<AuraCallRunStatus | null> {
  const response = await deps.responsesService.readResponse(id);
  if (response) {
    return summarizeResponseRunStatus(response);
  }

  const mediaGeneration = await deps.mediaGenerationService.readGeneration(id);
  if (mediaGeneration) {
    return summarizeMediaRunStatus(summarizeMediaGenerationStatus(mediaGeneration));
  }

  return null;
}

export function summarizeResponseRunStatus(response: ExecutionResponse): AuraCallRunStatus {
  const executionSummary = response.metadata?.executionSummary ?? null;
  const steps = executionSummary?.stepSummaries ?? [];
  const artifacts = response.output
    .filter((item) => item.type === 'artifact')
    .map((artifact) => ({
      id: artifact.id,
      type: artifact.artifact_type,
      title: artifact.title ?? null,
      uri: artifact.uri ?? null,
      mimeType: artifact.mime_type ?? null,
      materialization: stringOrNull(artifact.metadata?.materialization),
    }));
  return {
    id: response.id,
    object: 'auracall_run_status',
    kind: 'response',
    status: response.status,
    updatedAt: executionSummary?.lastUpdatedAt ?? null,
    completedAt: executionSummary?.completedAt ?? null,
    lastEvent: executionSummary?.orchestrationTimelineSummary?.items?.slice(-1)[0] ?? null,
    stepCount: steps.length,
    steps,
    artifactCount: artifacts.length,
    artifacts,
    metadata: {
      runId: response.metadata?.runId ?? response.id,
      taskRunSpecId: response.metadata?.taskRunSpecId ?? null,
      runtimeProfile: response.metadata?.runtimeProfile ?? null,
      service: response.metadata?.service ?? null,
      model: response.model ?? null,
    },
    failure: executionSummary?.failureSummary ?? null,
  };
}

function summarizeMediaRunStatus(summary: MediaGenerationStatusSummary): AuraCallRunStatus {
  return {
    id: summary.id,
    object: 'auracall_run_status',
    kind: 'media_generation',
    status: summary.status,
    updatedAt: summary.updatedAt,
    completedAt: summary.completedAt ?? null,
    lastEvent: summary.lastEvent ?? null,
    stepCount: 0,
    steps: [],
    artifactCount: summary.artifactCount,
    artifacts: summary.artifacts.map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      fileName: artifact.fileName ?? null,
      path: artifact.path ?? null,
      uri: artifact.uri ?? null,
      mimeType: artifact.mimeType ?? null,
      materialization: artifact.materialization ?? null,
      remoteUrl: artifact.remoteUrl ?? null,
      checksumSha256: artifact.checksumSha256 ?? null,
      previewArtifactId: artifact.previewArtifactId ?? null,
      previewSize: artifact.previewSize ?? null,
      previewChecksumSha256: artifact.previewChecksumSha256 ?? null,
      fullQualityDiffersFromPreview: artifact.fullQualityDiffersFromPreview ?? null,
      downloadLabel: artifact.downloadLabel ?? null,
      downloadVariant: artifact.downloadVariant ?? null,
      downloadOptions: artifact.downloadOptions ?? null,
    })),
    metadata: {
      ...summary.metadata,
      mediaDiagnostics: summary.diagnostics,
    },
    failure: summary.failure ?? null,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
