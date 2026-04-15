import { resolveConfiguredServiceAccountId } from '../config/serviceAccountIdentity.js';
import { createExecutionRunAffinityRecord } from './model.js';
import type { ExecutionRunInspection } from './contract.js';
import type { ExecutionRunAffinityRecord, ExecutionRunnerServiceId } from './types.js';

function asRunnerServiceId(value: unknown): ExecutionRunnerServiceId | null {
  return value === 'chatgpt' || value === 'gemini' || value === 'grok' ? value : null;
}

export function createConfiguredExecutionRunAffinity(
  config: Record<string, unknown> | undefined,
  inspection: ExecutionRunInspection,
): ExecutionRunAffinityRecord | null {
  if (!config) return null;

  const activeStep =
    inspection.dispatchPlan.steps.find((step) => step.id === inspection.dispatchPlan.nextRunnableStepId) ??
    inspection.dispatchPlan.steps.find((step) => inspection.dispatchPlan.runningStepIds.includes(step.id)) ??
    null;
  if (!activeStep) return null;

  const service = asRunnerServiceId(activeStep.service);
  const serviceAccountId = resolveConfiguredServiceAccountId(config, {
    serviceId: service,
    runtimeProfileId: activeStep.runtimeProfileId,
  });
  if (!serviceAccountId) return null;

  return createExecutionRunAffinityRecord({
    service,
    serviceAccountId,
    browserRequired: Boolean(activeStep.browserProfileId),
    runtimeProfileId: activeStep.runtimeProfileId,
    browserProfileId: activeStep.browserProfileId,
    hostRequirement: 'any',
    requiredHostId: null,
    eligibilityNote: `requires configured service account ${serviceAccountId}`,
  });
}
