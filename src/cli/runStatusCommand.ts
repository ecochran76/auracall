import { createMediaGenerationService } from '../media/service.js';
import { createExecutionResponsesService } from '../runtime/responsesService.js';
import {
  readAuraCallRunStatus,
  type AuraCallRunStatus,
  type AuraCallRunStatusArtifactSummary,
  type AuraCallRunStatusStepSummary,
} from '../runStatus.js';

export async function readRunStatusForCli(id: string): Promise<AuraCallRunStatus | null> {
  return readAuraCallRunStatus(id, {
    responsesService: createExecutionResponsesService({ drainAfterCreate: false }),
    mediaGenerationService: createMediaGenerationService(),
  });
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

  for (const artifact of status.artifacts) {
    lines.push(`- ${formatRunStatusArtifact(artifact)}`);
  }

  const failure = formatRunStatusFailure(status.failure);
  if (failure) {
    lines.push(`Failure: ${failure}`);
  }

  return lines.join('\n');
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
