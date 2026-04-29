import { createMediaGenerationService } from '../media/service.js';
import { createExecutionResponsesService } from '../runtime/responsesService.js';
import {
  readAuraCallRunStatus,
  type AuraCallRunStatus,
  type AuraCallRunStatusArtifactSummary,
  type AuraCallRunStatusStepSummary,
} from '../runStatus.js';

export interface RunStatusCliExpectation {
  expectedStatus?: string | null;
  expectedMinArtifacts?: number | null;
  expectedMediaRunState?: string | null;
}

export async function readRunStatusForCli(id: string): Promise<AuraCallRunStatus | null> {
  return readAuraCallRunStatus(id, {
    responsesService: createExecutionResponsesService({ drainAfterCreate: false }),
    mediaGenerationService: createMediaGenerationService(),
  });
}

export function assertRunStatusForCli(
  status: AuraCallRunStatus,
  expectation: RunStatusCliExpectation = {},
): void {
  const expectedStatus = nonEmptyStringOrNull(expectation.expectedStatus);
  if (expectedStatus && status.status !== expectedStatus) {
    throw new Error(`Expected run ${status.id} status to be ${expectedStatus}, got ${status.status}.`);
  }

  const expectedMinArtifacts = normalizeMinArtifacts(expectation.expectedMinArtifacts);
  if (expectedMinArtifacts !== null && status.artifactCount < expectedMinArtifacts) {
    throw new Error(
      `Expected run ${status.id} to have at least ${expectedMinArtifacts} artifacts, got ${status.artifactCount}.`,
    );
  }

  const expectedMediaRunState = nonEmptyStringOrNull(expectation.expectedMediaRunState);
  if (expectedMediaRunState) {
    const actualMediaRunState = readMediaRunState(status);
    if (actualMediaRunState !== expectedMediaRunState) {
      throw new Error(
        `Expected run ${status.id} media run state to be ${expectedMediaRunState}, got ${actualMediaRunState ?? 'unknown'}.`,
      );
    }
  }
}

export function formatRunStatusCli(status: AuraCallRunStatus): string {
  const lines = [
    `Run ${status.id} (${status.kind}) is ${status.status}`,
    `Updated: ${status.updatedAt ?? 'n/a'}`,
    `Completed: ${status.completedAt ?? 'n/a'}`,
    `Last event: ${formatRunStatusLastEvent(status.lastEvent)}`,
    `Steps: ${formatRunStatusSteps(status.steps ?? [], status.stepCount ?? 0)}`,
    `Artifacts: ${status.artifactCount}`,
  ];

  const mediaDiagnostics = formatMediaDiagnostics(status);
  if (mediaDiagnostics.length > 0) {
    lines.push(...mediaDiagnostics);
  }

  for (const artifact of status.artifacts) {
    lines.push(`- ${formatRunStatusArtifact(artifact)}`);
  }

  const failure = formatRunStatusFailure(status.failure);
  if (failure) {
    lines.push(`Failure: ${failure}`);
  }

  return lines.join('\n');
}

function formatMediaDiagnostics(status: AuraCallRunStatus): string[] {
  if (status.kind !== 'media_generation') return [];
  const diagnostics = readMediaDiagnostics(status);
  if (!diagnostics) return [];
  const runState = isRecord(diagnostics.runState) ? diagnostics.runState : {};
  const materialization = isRecord(diagnostics.materialization) ? diagnostics.materialization : {};
  const provider = isRecord(diagnostics.provider) ? diagnostics.provider : {};
  const lines = [
    `Media run state: ${firstString(runState, ['runState']) ?? 'unknown'}`,
    `Materialization: ${firstString(materialization, ['materialization']) ?? 'unknown'}`,
  ];
  const materializedPath = firstString(materialization, ['path']);
  if (materializedPath) {
    lines.push(`Materialized path: ${materializedPath}`);
  }
  const latestHref = firstString(provider, ['latestHref']);
  if (latestHref) {
    lines.push(`Provider href: ${latestHref}`);
  }
  return lines;
}

function formatRunStatusSteps(steps: AuraCallRunStatusStepSummary[], stepCount: number): string {
  if (stepCount <= 0) return '0';
  const counts = new Map<string, number>();
  for (const step of steps) {
    const key = stringOrFallback(step.status, 'unknown');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return String(stepCount);
  const summary = Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  return `${stepCount} (${summary})`;
}

function formatRunStatusArtifact(artifact: AuraCallRunStatusArtifactSummary): string {
  const label = artifact.fileName ?? artifact.title ?? artifact.id;
  const location = artifact.path ?? artifact.uri ?? null;
  const materialization = artifact.materialization ? ` [${artifact.materialization}]` : '';
  return `${artifact.type}: ${label}${location ? ` -> ${location}` : ''}${materialization}`;
}

function formatRunStatusLastEvent(lastEvent: unknown): string {
  if (!isRecord(lastEvent)) return 'none';
  const eventName = firstString(lastEvent, ['event', 'type', 'name']) ?? 'unknown';
  const at = firstString(lastEvent, ['at', 'createdAt', 'updatedAt']);
  return at ? `${eventName} at ${at}` : eventName;
}

function formatRunStatusFailure(failure: unknown): string | null {
  if (!isRecord(failure)) return null;
  const code = firstString(failure, ['code', 'errorCode']);
  const message = firstString(failure, ['message', 'error']);
  if (code && message) return `${code}: ${message}`;
  return code ?? message ?? null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function readMediaRunState(status: AuraCallRunStatus): string | null {
  const diagnostics = readMediaDiagnostics(status);
  if (!diagnostics || !isRecord(diagnostics.runState)) return null;
  return firstString(diagnostics.runState, ['runState']);
}

function readMediaDiagnostics(status: AuraCallRunStatus): Record<string, unknown> | null {
  const diagnostics = status.metadata.mediaDiagnostics;
  return isRecord(diagnostics) ? diagnostics : null;
}

function normalizeMinArtifacts(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Expected minimum artifact count must be a non-negative number.');
  }
  return Math.trunc(value);
}

function nonEmptyStringOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
