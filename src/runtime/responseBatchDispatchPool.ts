import { z } from 'zod';
import type { EffectiveAgentCatalog, EffectiveTeam } from '../config/agentRegistryCatalog.js';
import type { ExecutionRequest } from './apiTypes.js';
import type { ExecutionRuntimeControlContract } from './contract.js';
import type { ExecutionRunStoredRecord } from './store.js';

export type ResponseBatchDispatchMode = 'next_available';

export interface ResponseBatchDispatchRequest {
  team: string;
  mode: ResponseBatchDispatchMode;
  projectSync: 'none';
}

export interface ResponseBatchDispatchRecord {
  team: string;
  mode: ResponseBatchDispatchMode;
  projectSync: 'none';
  memberCount: number;
  projectName?: string | null;
  warnings: string[];
}

export interface ResponseBatchDispatchJobAssignment {
  team: string;
  mode: ResponseBatchDispatchMode;
  memberAgent: string;
  memberIndex: number;
}

export interface ResponseBatchDispatchResolution {
  requests: ExecutionRequest[];
  dispatch: ResponseBatchDispatchRecord;
  assignments: ResponseBatchDispatchJobAssignment[];
}

export interface ResolveResponseBatchDispatchPoolInput {
  dispatch: ResponseBatchDispatchRequest;
  requests: ExecutionRequest[];
  catalog: EffectiveAgentCatalog;
  control?: Pick<ExecutionRuntimeControlContract, 'listRuns'>;
}

// biome-ignore lint/style/useNamingConvention: exported schema names follow runtime API conventions.
export const ResponseBatchDispatchRequestSchema: z.ZodType<ResponseBatchDispatchRequest> = z.object({
  team: z.string().trim().min(1),
  mode: z.enum(['next_available']).default('next_available'),
  projectSync: z.literal('none').default('none'),
});

export function normalizeResponseBatchDispatchRequest(input: {
  dispatch?: ResponseBatchDispatchRequest | null;
  team?: string | null;
}): ResponseBatchDispatchRequest | null {
  const dispatch = input.dispatch ? ResponseBatchDispatchRequestSchema.parse(input.dispatch) : null;
  const team = typeof input.team === 'string' && input.team.trim().length > 0 ? input.team.trim() : null;
  if (dispatch && team && dispatch.team !== team) {
    throw new Error(`Response batch dispatch team "${dispatch.team}" conflicts with top-level team "${team}".`);
  }
  if (dispatch) return dispatch;
  if (!team) return null;
  return {
    team,
    mode: 'next_available',
    projectSync: 'none',
  };
}

export async function resolveResponseBatchDispatchPool(
  input: ResolveResponseBatchDispatchPoolInput,
): Promise<ResponseBatchDispatchResolution> {
  const team = input.catalog.teams.find((entry) => entry.id === input.dispatch.team) ?? null;
  if (!team) {
    throw new Error(`Dispatch-pool team "${input.dispatch.team}" was not found in the effective agent catalog.`);
  }
  if (team.type !== 'dispatch-pool') {
    throw new Error(`Team "${team.id}" is type "${team.type}" and cannot be used as a response-batch dispatch pool.`);
  }

  const members = resolveRunnableMembers(team, input.catalog);
  if (members.length === 0) {
    throw new Error(`Dispatch-pool team "${team.id}" has no runnable members.`);
  }

  const activeRuns = input.control ? await input.control.listRuns({ sourceKind: 'direct' }) : [];
  const baseLoads = members.map((member) => countActiveMemberRuns(activeRuns, member.agent.id));
  const assignedLoads = members.map(() => 0);
  const requests: ExecutionRequest[] = [];
  const assignments: ResponseBatchDispatchJobAssignment[] = [];
  let tieCursor = 0;

  for (const request of input.requests) {
    assertRequestIsDispatchable(request, team.id);
    const memberIndex = chooseNextMemberIndex(baseLoads, assignedLoads, tieCursor);
    tieCursor = (memberIndex + 1) % members.length;
    assignedLoads[memberIndex] += 1;
    const member = members[memberIndex];
    const assignment = {
      team: team.id,
      mode: input.dispatch.mode,
      memberAgent: member.agent.id,
      memberIndex,
    } satisfies ResponseBatchDispatchJobAssignment;
    assignments.push(assignment);
    requests.push(assignRequestToMember(request, member, team.id));
  }

  return {
    requests,
    dispatch: {
      team: team.id,
      mode: input.dispatch.mode,
      projectSync: 'none',
      memberCount: members.length,
      projectName: team.projectName ?? null,
      warnings: buildDispatchWarnings(team, members),
    },
    assignments,
  };
}

function resolveRunnableMembers(team: EffectiveTeam, catalog: EffectiveAgentCatalog) {
  const agentsById = new Map(catalog.agents.map((agent) => [agent.id, agent]));
  return team.agentIds.flatMap((agentId) => {
    const agent = agentsById.get(agentId) ?? null;
    if (!agent || !agent.enabled) return [];
    const service = agent.service ?? agent.defaultService ?? null;
    if (!service || !agent.runtimeProfileId) return [];
    return [{
      agent,
      service,
      runtimeProfile: agent.runtimeProfileId,
    }];
  });
}

function countActiveMemberRuns(records: ExecutionRunStoredRecord[], agentId: string): number {
  return records.filter((record) => {
    if (record.bundle.run.initialInputs.agent !== agentId) return false;
    if (['succeeded', 'failed', 'cancelled'].includes(record.bundle.run.status)) return false;
    if (record.bundle.leases.some((lease) => lease.status === 'active')) return true;
    return record.bundle.steps.some((step) => step.status === 'running');
  }).length;
}

function chooseNextMemberIndex(baseLoads: number[], assignedLoads: number[], tieCursor: number): number {
  const totalLoads = baseLoads.map((load, index) => load + assignedLoads[index]);
  const lowestLoad = Math.min(...totalLoads);
  for (let offset = 0; offset < totalLoads.length; offset += 1) {
    const index = (tieCursor + offset) % totalLoads.length;
    if (totalLoads[index] === lowestLoad) return index;
  }
  return 0;
}

function assertRequestIsDispatchable(request: ExecutionRequest, teamId: string): void {
  const explicitAgent = request.auracall?.agent;
  if (typeof explicitAgent === 'string' && explicitAgent.trim().length > 0) {
    throw new Error(
      `Response-batch dispatch pool "${teamId}" cannot dispatch a child request that already pins auracall.agent "${explicitAgent}".`,
    );
  }
  if (request.model.startsWith('agent:')) {
    throw new Error(
      `Response-batch dispatch pool "${teamId}" cannot dispatch a child request that already pins model "${request.model}".`,
    );
  }
}

function assignRequestToMember(
  request: ExecutionRequest,
  member: ReturnType<typeof resolveRunnableMembers>[number],
  teamId: string,
): ExecutionRequest {
  return {
    ...request,
    model: `agent:${member.agent.id}`,
    auracall: {
      ...(request.auracall ?? {}),
      team: teamId,
      agent: member.agent.id,
      service: member.service,
      runtimeProfile: member.runtimeProfile,
    },
  };
}

function buildDispatchWarnings(
  team: EffectiveTeam,
  members: ReturnType<typeof resolveRunnableMembers>,
): string[] {
  const warnings: string[] = [];
  const services = [...new Set(members.map((member) => member.service))].sort();
  if (services.length > 1) {
    warnings.push(
      `Dispatch-pool team "${team.id}" spans multiple services (${services.join(', ')}); AuraCall dispatches the batch, but output consistency is caller-owned.`,
    );
  }

  const modelBindings = [...new Set(
    members.flatMap((member) => {
      const model = member.agent.modelSelector ?? member.agent.model;
      return model ? [model] : [];
    }),
  )].sort();
  if (modelBindings.length > 1) {
    warnings.push(
      `Dispatch-pool team "${team.id}" has mixed member model bindings (${modelBindings.join(', ')}); use equivalent models for consistent results.`,
    );
  }

  if (team.projectName) {
    warnings.push(
      `Dispatch-pool team "${team.id}" is project-bound to "${team.projectName}" with projectSync=none; AuraCall does not reconcile project instructions, files, or settings between tenants.`,
    );
  }

  const projectNames = [...new Set(
    members.flatMap((member) => {
      const projectName = member.agent.projectName ?? null;
      return projectName ? [projectName] : [];
    }),
  )].sort();
  if (team.projectName && (!projectNames.includes(team.projectName) || projectNames.length > 1)) {
    warnings.push(
      `Dispatch-pool team "${team.id}" member agents do not all point at project name "${team.projectName}"; dispatch continues, but project divergence can change results.`,
    );
  }

  return warnings;
}
