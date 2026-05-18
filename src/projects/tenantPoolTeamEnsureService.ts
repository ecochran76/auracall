import { z } from 'zod';
import type { AgentTeamConfigService } from '../config/agentConfigService.js';
import type { EffectiveTeam } from '../config/agentRegistryCatalog.js';
import { TeamConfigSchema } from '../schema/types.js';
import type {
  ProjectEnsureResult,
  ProjectEnsureService,
} from './projectEnsureService.js';

const PROVIDER_ID_SCHEMA = z.enum(['chatgpt', 'gemini', 'grok']);
const PROJECT_MEMORY_MODE_SCHEMA = z.enum(['global', 'project']);

// biome-ignore lint/style/useNamingConvention: exported Zod schemas use the repo's stable Schema suffix convention.
export const TenantPoolTeamEnsureMemberSchema = z.object({
  agentId: z.string().trim().min(1),
  runtimeProfile: z.string().trim().min(1).nullable().optional(),
  service: PROVIDER_ID_SCHEMA.optional(),
  agentDescription: z.string().nullable().optional(),
  agentInstructions: z.string().nullable().optional(),
  agentPrePrompt: z.string().nullable().optional(),
  agentPostPrompt: z.string().nullable().optional(),
  agentModel: z.string().trim().min(1).nullable().optional(),
  agentModelSelector: z.string().trim().min(1).nullable().optional(),
  agentMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

// biome-ignore lint/style/useNamingConvention: exported Zod schemas use the repo's stable Schema suffix convention.
export const TenantPoolTeamEnsureInputSchema = z.object({
  teamId: z.string().trim().min(1),
  service: PROVIDER_ID_SCHEMA.default('chatgpt'),
  projectName: z.string().trim().min(1),
  createIfMissing: z.boolean().optional(),
  timeoutMs: z.number().int().positive().nullable().optional(),
  instructions: z.string().nullable().optional(),
  modelLabel: z.string().trim().min(1).nullable().optional(),
  files: z.array(z.string().trim().min(1)).optional(),
  memoryMode: PROJECT_MEMORY_MODE_SCHEMA.nullable().optional(),
  agentModel: z.string().trim().min(1).nullable().optional(),
  agentModelSelector: z.string().trim().min(1).nullable().optional(),
  teamDescription: z.string().nullable().optional(),
  teamInstructions: z.string().nullable().optional(),
  teamMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  members: z.array(TenantPoolTeamEnsureMemberSchema).min(1),
});

export type TenantPoolTeamEnsureInput = z.infer<typeof TenantPoolTeamEnsureInputSchema>;
export type TenantPoolTeamEnsureMemberInput = z.infer<typeof TenantPoolTeamEnsureMemberSchema>;

export interface TenantPoolTeamEnsureMemberResult {
  agentId: string;
  service: 'chatgpt' | 'gemini' | 'grok';
  runtimeProfile: string | null;
  project: {
    status: ProjectEnsureResult['status'];
    id: string | null;
    name: string | null;
    created: boolean;
  };
  agent: ProjectEnsureResult['agent'];
}

export interface TenantPoolTeamEnsureResult {
  object: 'auracall_tenant_pool_team_ensure';
  status: 'created' | 'found' | 'blocked';
  teamId: string;
  projectName: string;
  projectSync: 'none';
  teamCreated: boolean;
  team: {
    id: string;
    exists: boolean;
    type: EffectiveTeam['type'] | null;
    agentIds: string[];
    mutationTarget: 'config' | 'registry' | 'blocked' | null;
    blockedReason: string | null;
  };
  members: TenantPoolTeamEnsureMemberResult[];
  warnings: string[];
  blockedReason: string | null;
}

export interface TenantPoolTeamEnsureService {
  ensureTeam(input: TenantPoolTeamEnsureInput): Promise<TenantPoolTeamEnsureResult>;
}

export interface TenantPoolTeamEnsureServiceDeps {
  projectEnsureService: ProjectEnsureService;
  agentTeamConfigService: AgentTeamConfigService;
}

export function createTenantPoolTeamEnsureService(
  deps: TenantPoolTeamEnsureServiceDeps,
): TenantPoolTeamEnsureService {
  return {
    async ensureTeam(input) {
      const payload = TenantPoolTeamEnsureInputSchema.parse(input);
      const catalogBefore = await deps.agentTeamConfigService.effectiveCatalog();
      const existingTeam = catalogBefore.teams.find((team) => team.id === payload.teamId) ?? null;
      if (existingTeam && existingTeam.type !== 'dispatch-pool') {
        return createBlockedResult({
          payload,
          existingTeam,
          members: [],
          blockedReason: `Team ${payload.teamId} already exists as type "${existingTeam.type}" and cannot be reused as a dispatch-pool team.`,
          warnings: buildPoolWarnings(payload, existingTeam),
        });
      }

      const members: TenantPoolTeamEnsureMemberResult[] = [];
      for (const member of payload.members) {
        const service = member.service ?? payload.service;
        const project = await deps.projectEnsureService.ensureProject({
          service,
          runtimeProfile: member.runtimeProfile ?? null,
          projectName: payload.projectName,
          createIfMissing: payload.createIfMissing,
          timeoutMs: payload.timeoutMs,
          instructions: payload.instructions,
          modelLabel: payload.modelLabel,
          files: payload.files,
          memoryMode: payload.memoryMode,
          agentId: member.agentId,
          agentDescription: member.agentDescription,
          agentInstructions: member.agentInstructions,
          agentPrePrompt: member.agentPrePrompt,
          agentPostPrompt: member.agentPostPrompt,
          agentModel: member.agentModel ?? payload.agentModel,
          agentModelSelector: member.agentModelSelector ?? payload.agentModelSelector,
          agentMetadata: member.agentMetadata,
        });
        members.push({
          agentId: member.agentId,
          service,
          runtimeProfile: member.runtimeProfile ?? null,
          project: {
            status: project.status,
            id: project.project?.id ?? null,
            name: project.project?.name ?? project.projectName,
            created: project.created,
          },
          agent: project.agent,
        });
      }

      const blockedMember = members.find((member) =>
        member.project.status === 'missing' ||
        member.agent === null ||
        member.agent.mutationTarget === 'blocked'
      );
      const warnings = buildPoolWarnings(payload, existingTeam);
      if (blockedMember) {
        return createBlockedResult({
          payload,
          existingTeam,
          members,
          blockedReason:
            blockedMember.agent?.blockedReason ??
            `Project "${payload.projectName}" was not available for agent ${blockedMember.agentId}.`,
          warnings,
        });
      }

      if (existingTeam) {
        return {
          object: 'auracall_tenant_pool_team_ensure',
          status: 'found',
          teamId: payload.teamId,
          projectName: payload.projectName,
          projectSync: 'none',
          teamCreated: false,
          team: {
            id: existingTeam.id,
            exists: true,
            type: existingTeam.type,
            agentIds: existingTeam.agentIds,
            mutationTarget: null,
            blockedReason: null,
          },
          members,
          warnings,
          blockedReason: null,
        };
      }

      const mutation = await deps.agentTeamConfigService.upsertTeam({
        id: payload.teamId,
        config: TeamConfigSchema.parse({
          type: 'dispatch-pool',
          agents: payload.members.map((member) => member.agentId),
          description: payload.teamDescription ?? undefined,
          instructions: payload.teamInstructions ?? undefined,
          dispatch: {
            mode: 'next_available',
            projectSync: 'none',
          },
          project: {
            name: payload.projectName,
            createIfMissing: payload.createIfMissing ?? true,
            sync: 'none',
          },
          metadata: payload.teamMetadata ?? undefined,
        }),
      });
      if (mutation.mutationTarget === 'blocked') {
        return createBlockedResult({
          payload,
          existingTeam: null,
          members,
          blockedReason: mutation.blockedReason ?? `Team ${payload.teamId} creation was blocked.`,
          warnings,
        });
      }

      return {
        object: 'auracall_tenant_pool_team_ensure',
        status: 'created',
        teamId: payload.teamId,
        projectName: payload.projectName,
        projectSync: 'none',
        teamCreated: true,
        team: {
          id: payload.teamId,
          exists: true,
          type: 'dispatch-pool',
          agentIds: payload.members.map((member) => member.agentId),
          mutationTarget: mutation.mutationTarget,
          blockedReason: mutation.blockedReason,
        },
        members,
        warnings,
        blockedReason: null,
      };
    },
  };
}

function createBlockedResult(input: {
  payload: TenantPoolTeamEnsureInput;
  existingTeam: EffectiveTeam | null;
  members: TenantPoolTeamEnsureMemberResult[];
  blockedReason: string;
  warnings: string[];
}): TenantPoolTeamEnsureResult {
  return {
    object: 'auracall_tenant_pool_team_ensure',
    status: 'blocked',
    teamId: input.payload.teamId,
    projectName: input.payload.projectName,
    projectSync: 'none',
    teamCreated: false,
    team: {
      id: input.payload.teamId,
      exists: Boolean(input.existingTeam),
      type: input.existingTeam?.type ?? null,
      agentIds: input.existingTeam?.agentIds ?? input.payload.members.map((member) => member.agentId),
      mutationTarget: 'blocked',
      blockedReason: input.blockedReason,
    },
    members: input.members,
    warnings: input.warnings,
    blockedReason: input.blockedReason,
  };
}

function buildPoolWarnings(
  payload: TenantPoolTeamEnsureInput,
  existingTeam: EffectiveTeam | null,
): string[] {
  const warnings = [
    `Tenant-pool team "${payload.teamId}" uses projectSync=none; AuraCall will not reconcile project instructions, files, settings, or history between tenants.`,
  ];
  const services = new Set(payload.members.map((member) => member.service ?? payload.service));
  if (services.size > 1) {
    warnings.push(
      `Tenant-pool team "${payload.teamId}" includes multiple services; consistent output requires equivalent provider/model/project behavior.`,
    );
  }
  const modelBindings = new Set(
    payload.members
      .map((member) => member.agentModelSelector ?? payload.agentModelSelector ?? member.agentModel ?? payload.agentModel ?? null)
      .filter((model): model is string => typeof model === 'string' && model.trim().length > 0),
  );
  if (modelBindings.size > 1) {
    warnings.push(
      `Tenant-pool team "${payload.teamId}" includes multiple model bindings; consistent output requires equivalent models.`,
    );
  }
  if (existingTeam && !sameOrderedMembers(existingTeam.agentIds, payload.members.map((member) => member.agentId))) {
    warnings.push(
      `Team "${payload.teamId}" already exists, so AuraCall left its membership unchanged instead of rewriting the dispatch pool.`,
    );
  }
  return warnings;
}

function sameOrderedMembers(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
