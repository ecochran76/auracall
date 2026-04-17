import type { RuntimeRunInspectionServiceStateProbeResult } from './inspection.js';
import type { ExecutionRunnerServiceId } from './types.js';

type LiveRuntimeRunServiceStateRecord = RuntimeRunInspectionServiceStateProbeResult & {
  runId: string;
  stepId: string;
  service: ExecutionRunnerServiceId;
};

const liveRuntimeRunServiceStateRegistry = new Map<string, LiveRuntimeRunServiceStateRecord>();

function buildRegistryKey(runId: string, stepId: string): string {
  return `${runId}:${stepId}`;
}

export function recordLiveRuntimeRunServiceState(input: {
  runId: string;
  stepId: string;
  service: ExecutionRunnerServiceId;
  state: RuntimeRunInspectionServiceStateProbeResult['state'];
  source: RuntimeRunInspectionServiceStateProbeResult['source'];
  evidenceRef?: string | null;
  confidence: RuntimeRunInspectionServiceStateProbeResult['confidence'];
  observedAt?: string;
}): void {
  liveRuntimeRunServiceStateRegistry.set(buildRegistryKey(input.runId, input.stepId), {
    runId: input.runId,
    stepId: input.stepId,
    service: input.service,
    state: input.state,
    source: input.source,
    evidenceRef: input.evidenceRef ?? null,
    confidence: input.confidence,
    observedAt: input.observedAt ?? new Date().toISOString(),
  });
}

export function readLiveRuntimeRunServiceState(input: {
  runId: string;
  stepId: string;
  service?: ExecutionRunnerServiceId | null;
}): RuntimeRunInspectionServiceStateProbeResult | null {
  const match = liveRuntimeRunServiceStateRegistry.get(buildRegistryKey(input.runId, input.stepId));
  if (!match) {
    return null;
  }
  if (input.service && match.service !== input.service) {
    return null;
  }
  return {
    service: match.service,
    ownerStepId: match.stepId,
    state: match.state,
    source: match.source,
    observedAt: match.observedAt,
    evidenceRef: match.evidenceRef ?? null,
    confidence: match.confidence,
  };
}

export function clearLiveRuntimeRunServiceState(input: {
  runId: string;
  stepId?: string | null;
}): void {
  if (typeof input.stepId === 'string' && input.stepId.trim().length > 0) {
    liveRuntimeRunServiceStateRegistry.delete(buildRegistryKey(input.runId, input.stepId.trim()));
    return;
  }
  for (const key of liveRuntimeRunServiceStateRegistry.keys()) {
    if (key.startsWith(`${input.runId}:`)) {
      liveRuntimeRunServiceStateRegistry.delete(key);
    }
  }
}

export function resetLiveRuntimeRunServiceStateRegistryForTests(): void {
  liveRuntimeRunServiceStateRegistry.clear();
}
