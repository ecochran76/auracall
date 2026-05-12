import { z } from 'zod';
import { issueApiKey, type ApiKeyIssueResult } from '../config/apiKeyIssuer.js';
import type { AgentTeamConfigService } from '../config/agentConfigService.js';
import {
  ProjectEnsureInputSchema,
  type ProjectEnsureResult,
  type ProjectEnsureService,
} from './projectEnsureService.js';

// biome-ignore lint/style/useNamingConvention: exported Zod schemas use the repo's stable Schema suffix convention.
export const AgentSetupPackageInputSchema = ProjectEnsureInputSchema.extend({
  agentId: z.string().trim().min(1),
  keyId: z.string().trim().min(1).optional(),
  services: z.array(z.string().trim().min(1)).optional(),
  runtimeProfiles: z.array(z.string().trim().min(1)).optional(),
  apiBaseUrl: z.string().trim().min(1).optional(),
  envPath: z.string().trim().min(1).optional(),
  clientEnvPath: z.string().trim().min(1),
  overwrite: z.boolean().optional(),
});

export type AgentSetupPackageInput = z.infer<typeof AgentSetupPackageInputSchema>;

export interface AgentSetupPackageResult {
  object: 'auracall_agent_setup_package';
  agentId: string;
  model: string;
  project: ProjectEnsureResult;
  apiKey: ApiKeyIssueResult;
  clientEnvPath: string;
  restartRequired: boolean;
}

export interface AgentSetupHandoffResult {
  object: 'auracall_agent_setup_handoff';
  agentId: string;
  model: string;
  clientEnvPath: string;
  restartRequired: boolean;
  project: {
    status: ProjectEnsureResult['status'];
    id: string | null;
    name: string | null;
    service: ProjectEnsureResult['service'];
    runtimeProfile: string | null;
    created: boolean;
  };
  key: {
    keyId: string;
    envPath: string;
    apiBaseUrl: string;
    scopes: ApiKeyIssueResult['scopes'];
  };
  next: {
    restartService: string | null;
    sourceEnv: string;
  };
}

export interface AgentSetupPackageService {
  createPackage(input: AgentSetupPackageInput): Promise<AgentSetupPackageResult>;
  createHandoff(input: AgentSetupPackageInput): Promise<AgentSetupHandoffResult>;
}

export interface AgentSetupPackageServiceDeps {
  projectEnsureService: ProjectEnsureService;
  agentTeamConfigService: AgentTeamConfigService;
}

export function createAgentSetupPackageService(
  deps: AgentSetupPackageServiceDeps,
): AgentSetupPackageService {
  const createPackage = async (input: AgentSetupPackageInput): Promise<AgentSetupPackageResult> => {
    const payload = AgentSetupPackageInputSchema.parse(input);
    const project = await deps.projectEnsureService.ensureProject(payload);
    if (!project.project?.id) {
      throw new Error(`Project "${payload.projectName}" was not available for agent setup.`);
    }
    if (!project.agent || project.agent.id !== payload.agentId) {
      throw new Error(`Project ensure did not bind requested agent: ${payload.agentId}`);
    }
    if (project.agent.mutationTarget === 'blocked') {
      throw new Error(project.agent.blockedReason ?? `Agent setup was blocked for ${payload.agentId}.`);
    }

    const apiKey = await issueApiKey(deps.agentTeamConfigService, {
      agentId: payload.agentId,
      keyId: payload.keyId,
      services: payload.services ?? [payload.service],
      runtimeProfiles: payload.runtimeProfiles ?? (payload.runtimeProfile ? [payload.runtimeProfile] : []),
      apiBaseUrl: payload.apiBaseUrl,
      envPath: payload.envPath,
      clientEnvPath: payload.clientEnvPath,
      overwrite: payload.overwrite,
    });

    return {
      object: 'auracall_agent_setup_package',
      agentId: payload.agentId,
      model: apiKey.model,
      project,
      apiKey,
      clientEnvPath: apiKey.clientEnvPath ?? payload.clientEnvPath,
      restartRequired: apiKey.restartRequired,
    };
  };

  return {
    createPackage,
    async createHandoff(input) {
      return redactSetupPackage(await createPackage(input));
    },
  };
}

export function redactSetupPackage(packageResult: AgentSetupPackageResult): AgentSetupHandoffResult {
  return {
    object: 'auracall_agent_setup_handoff',
    agentId: packageResult.agentId,
    model: packageResult.model,
    clientEnvPath: packageResult.clientEnvPath,
    restartRequired: packageResult.restartRequired,
    project: {
      status: packageResult.project.status,
      id: packageResult.project.project?.id ?? null,
      name: packageResult.project.project?.name ?? packageResult.project.projectName,
      service: packageResult.project.service,
      runtimeProfile: packageResult.project.runtimeProfile,
      created: packageResult.project.created,
    },
    key: {
      keyId: packageResult.apiKey.keyId,
      envPath: packageResult.apiKey.envPath,
      apiBaseUrl: packageResult.apiKey.apiBaseUrl,
      scopes: packageResult.apiKey.scopes,
    },
    next: {
      restartService: packageResult.restartRequired ? 'auracall-api.service' : null,
      sourceEnv: packageResult.clientEnvPath,
    },
  };
}
