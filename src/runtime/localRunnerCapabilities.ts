import {
  getCurrentRuntimeProfiles,
  projectConfigModel,
} from '../config/model.js';
import { resolveConfiguredServiceAccountId } from '../config/serviceAccountIdentity.js';
import type { ExecutionRunnerServiceId } from './types.js';

export interface LocalRunnerCapabilitySummary {
  serviceIds: ExecutionRunnerServiceId[];
  runtimeProfileIds: string[];
  browserProfileIds: string[];
  serviceAccountIds: string[];
  browserCapable: boolean;
}

const KNOWN_RUNNER_SERVICE_IDS: ExecutionRunnerServiceId[] = ['chatgpt', 'gemini', 'grok'];

export function createLocalRunnerCapabilitySummary(
  config: Record<string, unknown> | undefined,
): LocalRunnerCapabilitySummary {
  const configRecord = config ?? {};
  const projectedModel = projectConfigModel(configRecord);
  if (projectedModel.runtimeProfiles.length === 0) {
    return {
      serviceIds: [...KNOWN_RUNNER_SERVICE_IDS],
      runtimeProfileIds: ['default'],
      browserProfileIds: [],
      serviceAccountIds: [],
      browserCapable: true,
    };
  }

  const serviceIds = new Set<ExecutionRunnerServiceId>();
  const browserProfileIds = new Set<string>();
  const serviceAccountIds = new Set<string>();
  const runtimeProfiles = getCurrentRuntimeProfiles(configRecord);
  let browserCapable = false;

  for (const runtimeProfile of projectedModel.runtimeProfiles) {
    if (runtimeProfile.defaultService) {
      serviceIds.add(runtimeProfile.defaultService);
      const serviceAccountId = resolveConfiguredServiceAccountId(configRecord, {
        serviceId: runtimeProfile.defaultService,
        runtimeProfileId: runtimeProfile.id,
      });
      if (serviceAccountId) {
        serviceAccountIds.add(serviceAccountId);
      }
    }

    if (runtimeProfile.browserProfileId) {
      browserProfileIds.add(runtimeProfile.browserProfileId);
      browserCapable = true;
    }

    const rawRuntimeProfile = runtimeProfiles[runtimeProfile.id];
    if (!isRecord(rawRuntimeProfile)) {
      continue;
    }

    if (rawRuntimeProfile.engine === 'browser' || isRecord(rawRuntimeProfile.browser)) {
      browserCapable = true;
    }

    const rawServices = isRecord(rawRuntimeProfile.services) ? rawRuntimeProfile.services : null;
    if (!rawServices) {
      continue;
    }

    for (const serviceId of KNOWN_RUNNER_SERVICE_IDS) {
      if (!isRecord(rawServices[serviceId])) {
        continue;
      }
      serviceIds.add(serviceId);
      const serviceAccountId = resolveConfiguredServiceAccountId(configRecord, {
        serviceId,
        runtimeProfileId: runtimeProfile.id,
      });
      if (serviceAccountId) {
        serviceAccountIds.add(serviceAccountId);
      }
    }
  }

  return {
    serviceIds: [...serviceIds].sort(),
    runtimeProfileIds: projectedModel.runtimeProfiles.map((runtimeProfile) => runtimeProfile.id),
    browserProfileIds: [...browserProfileIds].sort(),
    serviceAccountIds: [...serviceAccountIds].sort(),
    browserCapable,
  };
}

export function createLocalRunnerEligibilityNote(input: {
  phase: 'register' | 'heartbeat' | 'shutdown';
  baseLabel: string;
  heartbeatLabel?: string;
  shutdownLabel?: string;
  capabilitySummary: Pick<LocalRunnerCapabilitySummary, 'serviceIds' | 'serviceAccountIds' | 'browserCapable'>;
}): string {
  const base =
    input.phase === 'register'
      ? input.baseLabel
      : input.phase === 'heartbeat'
        ? (input.heartbeatLabel ?? `${input.baseLabel} heartbeat`)
        : (input.shutdownLabel ?? `${input.baseLabel} shutdown`);

  if (!input.capabilitySummary.browserCapable) {
    return base;
  }
  if (input.capabilitySummary.serviceAccountIds.length === 0) {
    return `${base}; service-account affinity not projected`;
  }

  const accountServices = new Set(
    input.capabilitySummary.serviceAccountIds
      .map((accountId) => accountId.match(/^service-account:([^:]+):/)?.[1])
      .filter((serviceId): serviceId is ExecutionRunnerServiceId =>
        KNOWN_RUNNER_SERVICE_IDS.includes(serviceId as ExecutionRunnerServiceId),
      ),
  );
  const missingAccountService = input.capabilitySummary.serviceIds.find(
    (serviceId) => !accountServices.has(serviceId),
  );
  return missingAccountService
    ? `${base}; service-account affinity partially projected`
    : base;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
