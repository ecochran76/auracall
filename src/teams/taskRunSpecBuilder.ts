import { createTaskRunSpec, type CreateTaskRunSpecInput } from './model.js';
import type { TaskRunSpec } from './types.js';

export type TeamRunResponseFormat = 'text' | 'markdown' | 'json';

export type TeamRunOutputContract = 'auracall.step-output.v1';

export interface TeamRunLocalActionPolicyInput {
  allowedShellCommands?: string[];
  allowedCwdRoots?: string[];
  mode?: 'allowed' | 'approval-required';
}

export interface BuildBoundedTeamTaskRunSpecInput {
  nowIso: string;
  taskRunSpecId: string;
  teamId: string;
  objective: string;
  title?: string | null;
  promptAppend?: string | null;
  structuredContext?: Record<string, unknown> | null;
  responseFormat?: TeamRunResponseFormat;
  outputContract?: TeamRunOutputContract | null;
  maxTurns?: number | null;
  localActionPolicy?: TeamRunLocalActionPolicyInput | null;
  context?: Record<string, unknown>;
  requestedBy?: TaskRunSpec['requestedBy'];
  trigger?: TaskRunSpec['trigger'];
}

export function buildBoundedTeamTaskRunSpec(
  input: BuildBoundedTeamTaskRunSpecInput,
): TaskRunSpec {
  const objective = input.objective.trim();
  const title =
    typeof input.title === 'string' && input.title.trim().length > 0
      ? input.title.trim()
      : objective.length <= 80
        ? objective
        : `${objective.slice(0, 77)}...`;
  const responseFormat = input.responseFormat ?? 'markdown';
  const structuredContext = mergeStructuredContextWithOutputContract({
    structuredContext: input.structuredContext,
    outputContract: input.outputContract,
  });

  const taskRunSpecInput: CreateTaskRunSpecInput = {
    id: input.taskRunSpecId,
    teamId: input.teamId,
    title,
    objective,
    createdAt: input.nowIso,
    successCriteria: [`Complete the assignment objective: ${objective}`],
    requestedOutputs: [
      {
        kind: 'final-response',
        label: 'final-response',
        format: responseFormat,
        required: true,
        destination: 'response-body',
      },
    ],
    inputArtifacts: [],
    context: input.context ?? {},
    overrides: {
      promptAppend: input.promptAppend ?? null,
      structuredContext,
    },
    turnPolicy:
      typeof input.maxTurns === 'number' && Number.isFinite(input.maxTurns) && input.maxTurns > 0
        ? { maxTurns: Math.trunc(input.maxTurns) }
        : undefined,
    localActionPolicy:
      input.localActionPolicy &&
      Array.isArray(input.localActionPolicy.allowedShellCommands) &&
      input.localActionPolicy.allowedShellCommands.length > 0
        ? {
            mode: input.localActionPolicy.mode === 'approval-required' ? 'approval-required' : 'allowed',
            complexityStage: 'bounded-command',
            allowedActionKinds: ['shell'],
            allowedCommands: input.localActionPolicy.allowedShellCommands,
            allowedCwdRoots: input.localActionPolicy.allowedCwdRoots ?? [],
            resultReportingMode: 'summary-only',
          }
        : undefined,
    requestedBy: input.requestedBy ?? null,
    trigger: input.trigger ?? 'service',
  };

  return createTaskRunSpec(taskRunSpecInput);
}

function mergeStructuredContextWithOutputContract(input: {
  structuredContext?: Record<string, unknown> | null;
  outputContract?: TeamRunOutputContract | null;
}): Record<string, unknown> | null {
  if (!input.outputContract) {
    return input.structuredContext ?? null;
  }
  return {
    ...(input.structuredContext ?? {}),
    outputContract: input.outputContract,
  };
}
