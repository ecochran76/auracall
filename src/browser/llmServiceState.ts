import type { RuntimeRunInspectionServiceStateProbeResult } from '../runtime/inspection.js';

export type LlmServiceStateSource = RuntimeRunInspectionServiceStateProbeResult['source'];
export type LlmServiceStateConfidence = RuntimeRunInspectionServiceStateProbeResult['confidence'];
export type LlmServiceState = RuntimeRunInspectionServiceStateProbeResult['state'];

export interface LlmServiceStateObservationInput {
  service?: RuntimeRunInspectionServiceStateProbeResult['service'];
  ownerStepId?: string | null;
  state: LlmServiceState;
  source?: LlmServiceStateSource;
  evidenceRef: string;
  confidence: LlmServiceStateConfidence;
  observedAt?: string;
}

export function createLlmServiceStateObservation(
  input: LlmServiceStateObservationInput,
): RuntimeRunInspectionServiceStateProbeResult {
  return {
    service: input.service ?? null,
    ownerStepId: input.ownerStepId ?? null,
    state: input.state,
    source: input.source ?? 'provider-adapter',
    observedAt: input.observedAt ?? new Date().toISOString(),
    evidenceRef: input.evidenceRef,
    confidence: input.confidence,
  };
}

export function createLlmHardStopObservation(input: {
  state: Extract<LlmServiceState, 'captcha-or-human-verification' | 'login-required'>;
  evidenceRef: string;
  service?: RuntimeRunInspectionServiceStateProbeResult['service'];
}): RuntimeRunInspectionServiceStateProbeResult {
  return createLlmServiceStateObservation({
    service: input.service,
    state: input.state,
    evidenceRef: input.evidenceRef,
    confidence: 'high',
  });
}

export function createLlmUnknownObservation(input: {
  evidenceRef: string;
  service?: RuntimeRunInspectionServiceStateProbeResult['service'];
}): RuntimeRunInspectionServiceStateProbeResult {
  return createLlmServiceStateObservation({
    service: input.service,
    state: 'unknown',
    evidenceRef: input.evidenceRef,
    confidence: 'low',
  });
}

export function resolveVisibleAnswerServiceState(input: {
  isComplete: boolean;
  completeEvidenceRef: string;
  incomingEvidenceRef: string;
  completeConfidence?: LlmServiceStateConfidence;
  incomingConfidence?: LlmServiceStateConfidence;
  service?: RuntimeRunInspectionServiceStateProbeResult['service'];
}): RuntimeRunInspectionServiceStateProbeResult {
  return createLlmServiceStateObservation({
    service: input.service,
    state: input.isComplete ? 'response-complete' : 'response-incoming',
    evidenceRef: input.isComplete ? input.completeEvidenceRef : input.incomingEvidenceRef,
    confidence: input.isComplete ? input.completeConfidence ?? 'medium' : input.incomingConfidence ?? 'high',
  });
}
