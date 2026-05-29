import { MODEL_CONFIGS } from '../oracle/config.js';
import { SEMANTIC_MODEL_SELECTORS } from './modelSelector.js';
import {
  getCurrentRuntimeProfiles,
  getRuntimeProfileBrowserProfileId,
  projectConfigModel,
  type ProjectedAgent,
  type ProjectedTeam,
} from './model.js';
import { createConfiguredServiceAccountId } from './serviceAccountIdentity.js';

type MutableRecord = Record<string, unknown>;
type ServiceId = 'chatgpt' | 'gemini' | 'grok';

const SERVICE_IDS: readonly ServiceId[] = ['chatgpt', 'gemini', 'grok'];

export interface AgentConfigChoiceService {
  id: ServiceId;
  label: string;
}

export interface AgentConfigChoiceTenant {
  tenantKey: string;
  service: ServiceId;
  runtimeProfileId: string;
  browserProfileId: string | null;
  bindingKey: string;
  identity: Record<string, string>;
  source: 'runtimeProfile';
}

export interface AgentConfigChoiceBinding {
  bindingKey: string;
  bindingId: string;
  service: ServiceId;
  tenantKey: string | null;
  runtimeProfileId: string;
  browserProfileId: string | null;
  ready: boolean;
}

export interface AgentConfigChoiceModelSelector {
  id: string;
  service: ServiceId;
  label: string;
  executionReady: boolean;
}

export interface AgentConfigChoiceModel {
  id: string;
  provider: string;
}

export interface AgentConfigChoiceExtras {
  modelStrategy: string[];
  thinkingTime: string[];
  composerTool: string[];
  deepResearchPlanAction: string[];
}

export interface AgentConfigChoiceProjectBinding {
  key: string;
  service: ServiceId | null;
  tenantKey: string | null;
  bindingKey: string | null;
  runtimeProfileId: string | null;
  mode: 'none' | 'fixed' | 'alias';
  source: 'none' | 'agent' | 'service' | 'override-ready';
  id?: string;
  providerProjectId?: string;
  label?: string;
}

export interface AgentConfigChoiceValidationIssue {
  severity: 'info' | 'warning';
  code: string;
  message: string;
}

export interface AgentConfigChoiceAgentValidation {
  agentId: string;
  valid: boolean;
  issues: AgentConfigChoiceValidationIssue[];
}

export interface AgentConfigChoices {
  object: 'auracall_agent_config_choices';
  services: AgentConfigChoiceService[];
  tenants: AgentConfigChoiceTenant[];
  bindings: AgentConfigChoiceBinding[];
  modelSelectors: AgentConfigChoiceModelSelector[];
  models: AgentConfigChoiceModel[];
  extras: AgentConfigChoiceExtras;
  projectBindings: AgentConfigChoiceProjectBinding[];
  agents: ProjectedAgent[];
  teams: ProjectedTeam[];
  validation: {
    ok: boolean;
    agents: AgentConfigChoiceAgentValidation[];
  };
}

export function createAgentConfigChoices(config: MutableRecord, agents: ProjectedAgent[]): AgentConfigChoices {
  const projected = projectConfigModel(config);
  const tenants = collectTenantChoices(config);
  const bindings = collectBindingChoices(config, tenants);
  const projectBindings = collectProjectBindingChoices(projected.agents);
  const validationAgents = projected.agents.map((agent) =>
    validateAgentChoice(agent, {
      bindings,
      modelSelectors: SEMANTIC_MODEL_SELECTORS,
    }),
  );
  return {
    object: 'auracall_agent_config_choices',
    services: SERVICE_IDS.map((id) => ({ id, label: serviceLabel(id) })),
    tenants,
    bindings,
    modelSelectors: SEMANTIC_MODEL_SELECTORS.map((selector) => ({
      id: selector.id,
      service: selector.service,
      label: selector.label,
      executionReady: selector.executionReady,
    })),
    models: Object.entries(MODEL_CONFIGS)
      .map(([id, model]) => ({
        id,
        provider: model.provider ?? 'other',
      }))
      .sort((left, right) => left.provider.localeCompare(right.provider) || left.id.localeCompare(right.id)),
    extras: {
      modelStrategy: ['select', 'current', 'ignore'],
      thinkingTime: ['standard', 'extended', 'light', 'heavy'],
      composerTool: ['web-search', 'deep-research'],
      deepResearchPlanAction: ['start', 'edit'],
    },
    projectBindings,
    agents,
    teams: projected.teams,
    validation: {
      ok: validationAgents.every((agent) => agent.valid),
      agents: validationAgents,
    },
  };
}

function collectTenantChoices(config: MutableRecord): AgentConfigChoiceTenant[] {
  const tenants = new Map<string, AgentConfigChoiceTenant>();
  for (const [runtimeProfileId, runtimeProfile] of Object.entries(getCurrentRuntimeProfiles(config))) {
    const browserProfileId = getRuntimeProfileBrowserProfileId(runtimeProfile);
    for (const service of SERVICE_IDS) {
      const serviceConfig = readRuntimeProfileServiceConfig(config, runtimeProfile, service);
      const tenantKey = createTenantKey(service, serviceConfig);
      if (!tenantKey) continue;
      const bindingKey = createBindingKey(service, runtimeProfileId, browserProfileId);
      tenants.set(`${tenantKey}:${bindingKey}`, {
        tenantKey,
        service,
        runtimeProfileId,
        browserProfileId,
        bindingKey,
        identity: readIdentitySummary(serviceConfig),
        source: 'runtimeProfile',
      });
    }
  }
  return [...tenants.values()].sort(
    (left, right) =>
      left.service.localeCompare(right.service) ||
      left.tenantKey.localeCompare(right.tenantKey) ||
      left.runtimeProfileId.localeCompare(right.runtimeProfileId),
  );
}

function collectBindingChoices(
  config: MutableRecord,
  tenants: AgentConfigChoiceTenant[],
): AgentConfigChoiceBinding[] {
  const tenantByBinding = new Map(tenants.map((tenant) => [tenant.bindingKey, tenant]));
  return Object.entries(getCurrentRuntimeProfiles(config))
    .flatMap(([runtimeProfileId, runtimeProfile]) => {
      const browserProfileId = getRuntimeProfileBrowserProfileId(runtimeProfile);
      const defaultService = asServiceId(runtimeProfile.defaultService);
      const services = new Set<ServiceId>([
        ...SERVICE_IDS.filter((service) => readRuntimeProfileServiceConfig(config, runtimeProfile, service)),
        ...(defaultService ? [defaultService] : []),
      ]);
      return [...services].map((service) => {
        const bindingKey = createBindingKey(service, runtimeProfileId, browserProfileId);
        const tenant = tenantByBinding.get(bindingKey);
        return {
          bindingKey,
          bindingId: bindingKey,
          service,
          tenantKey: tenant?.tenantKey ?? null,
          runtimeProfileId,
          browserProfileId,
          ready: Boolean(tenant?.tenantKey),
        };
      });
    })
    .sort(
      (left, right) =>
        left.service.localeCompare(right.service) ||
        left.runtimeProfileId.localeCompare(right.runtimeProfileId) ||
        left.bindingKey.localeCompare(right.bindingKey),
    );
}

function collectProjectBindingChoices(agents: ProjectedAgent[]): AgentConfigChoiceProjectBinding[] {
  const choices = new Map<string, AgentConfigChoiceProjectBinding>();
  for (const agent of agents) {
    const binding = agent.projectBinding;
    const service = agent.service ?? agent.defaultService ?? null;
    const key = [
      service ?? 'service:none',
      agent.tenantKey ?? 'tenant:none',
      agent.bindingKey ?? 'binding:none',
      binding.source,
      binding.mode,
      binding.providerProjectId ?? binding.id ?? binding.label ?? 'none',
    ].join(':');
    choices.set(key, {
      key,
      service,
      tenantKey: agent.tenantKey,
      bindingKey: agent.bindingKey,
      runtimeProfileId: agent.runtimeProfileId,
      mode: binding.mode,
      source: binding.source,
      ...(binding.id ? { id: binding.id } : {}),
      ...(binding.providerProjectId ? { providerProjectId: binding.providerProjectId } : {}),
      ...(binding.label ? { label: binding.label } : {}),
    });
    if (binding.source === 'service') {
      const overrideKey = `${key}:override-ready`;
      choices.set(overrideKey, {
        key: overrideKey,
        service,
        tenantKey: agent.tenantKey,
        bindingKey: agent.bindingKey,
        runtimeProfileId: agent.runtimeProfileId,
        mode: binding.mode,
        source: 'override-ready',
        ...(binding.id ? { id: binding.id } : {}),
        ...(binding.providerProjectId ? { providerProjectId: binding.providerProjectId } : {}),
        ...(binding.label ? { label: binding.label } : {}),
      });
    }
  }
  return [...choices.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function validateAgentChoice(
  agent: ProjectedAgent,
  options: {
    bindings: AgentConfigChoiceBinding[];
    modelSelectors: typeof SEMANTIC_MODEL_SELECTORS;
  },
): AgentConfigChoiceAgentValidation {
  const issues: AgentConfigChoiceValidationIssue[] = [];
  const service = agent.service ?? agent.defaultService ?? null;
  if (!service) {
    issues.push({
      severity: 'warning',
      code: 'agent-service-missing',
      message: 'Agent does not resolve to a browser service.',
    });
  }
  if (!agent.tenantKey) {
    issues.push({
      severity: 'warning',
      code: 'agent-tenant-unresolved',
      message: 'Agent does not resolve to a tenant identity.',
    });
  }
  if (!agent.bindingKey) {
    issues.push({
      severity: 'warning',
      code: 'agent-binding-unresolved',
      message: 'Agent does not resolve to a runtime execution binding.',
    });
  } else if (!options.bindings.some((binding) => binding.bindingKey === agent.bindingKey)) {
    issues.push({
      severity: 'warning',
      code: 'agent-binding-not-selectable',
      message: `Agent binding "${agent.bindingKey}" is not available in the current runtime profile choices.`,
    });
  }
  if (agent.modelSelector) {
    const selector = options.modelSelectors.find((entry) => entry.id === agent.modelSelector);
    if (!selector) {
      issues.push({
        severity: 'warning',
        code: 'agent-model-selector-unknown',
        message: `Agent model selector "${agent.modelSelector}" is not known to AuraCall.`,
      });
    } else if (service && selector.service !== service) {
      issues.push({
        severity: 'warning',
        code: 'agent-model-selector-service-mismatch',
        message: `Agent model selector "${agent.modelSelector}" is for ${selector.service}, not ${service}.`,
      });
    }
  }
  if (agent.projectBinding.source === 'none') {
    issues.push({
      severity: 'info',
      code: 'agent-project-binding-absent',
      message: 'Agent has no explicit or inherited provider project binding.',
    });
  }
  return {
    agentId: agent.id,
    valid: issues.every((issue) => issue.severity !== 'warning'),
    issues,
  };
}

function readRuntimeProfileServiceConfig(
  config: MutableRecord,
  runtimeProfile: MutableRecord,
  serviceId: ServiceId,
): MutableRecord | null {
  const globalServices = isRecord(config.services) ? config.services : {};
  const profileServices = isRecord(runtimeProfile.services) ? runtimeProfile.services : {};
  const globalService = isRecord(globalServices[serviceId]) ? globalServices[serviceId] : {};
  const profileService = isRecord(profileServices[serviceId]) ? profileServices[serviceId] : {};
  const merged = { ...globalService, ...profileService };
  return Object.keys(merged).length > 0 ? merged : null;
}

function createTenantKey(service: ServiceId, serviceConfig: MutableRecord | null): string | null {
  return createConfiguredServiceAccountId(service, serviceConfig);
}

function createBindingKey(
  service: ServiceId,
  runtimeProfileId: string,
  browserProfileId: string | null,
): string {
  return `binding:${service}:${runtimeProfileId || 'default'}:${browserProfileId || 'unbound-browser-profile'}`;
}

function readIdentitySummary(serviceConfig: MutableRecord | null): Record<string, string> {
  const identity = isRecord(serviceConfig?.identity) ? serviceConfig.identity : {};
  return [
    'id',
    'email',
    'handle',
    'accountId',
    'name',
    'accountLevel',
    'accountLabel',
    'accountPlanType',
    'accountStructure',
    'organizationId',
  ].reduce<Record<string, string>>((acc, key) => {
    const value = asNonEmptyString(identity[key]);
    if (value) acc[key] = value;
    return acc;
  }, {});
}

function serviceLabel(service: ServiceId): string {
  return service === 'chatgpt' ? 'ChatGPT' : service === 'gemini' ? 'Gemini' : 'Grok';
}

function asServiceId(value: unknown): ServiceId | null {
  return value === 'chatgpt' || value === 'gemini' || value === 'grok' ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
