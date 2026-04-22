import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeConfiguredTeamRun } from '../../cli/teamRunCommand.js';
import { resolveConfig } from '../../schema/resolver.js';
import { AURACALL_STEP_OUTPUT_CONTRACT_VERSION } from '../../runtime/stepOutputContract.js';
import { TaskRunSpecSchema } from '../../teams/schema.js';
import { teamRunInputSchema } from '../types.js';

const localActionPolicyShape = z
  .object({
    allowedShellCommands: z.array(z.string().min(1)).optional(),
    allowedCwdRoots: z.array(z.string().min(1)).optional(),
    mode: z.enum(['allowed', 'approval-required']).optional(),
  })
  .nullable()
  .optional();

const teamRunInputShape = {
  teamId: z.string().min(1).optional(),
  objective: z.string().min(1).optional(),
  title: z.string().min(1).nullable().optional(),
  promptAppend: z.string().min(1).nullable().optional(),
  structuredContext: z.record(z.string(), z.unknown()).nullable().optional(),
  responseFormat: z.enum(['text', 'markdown', 'json']).optional(),
  outputContract: z.literal(AURACALL_STEP_OUTPUT_CONTRACT_VERSION).nullable().optional(),
  maxTurns: z.number().int().positive().nullable().optional(),
  localActionPolicy: localActionPolicyShape,
  taskRunSpec: TaskRunSpecSchema.optional(),
} satisfies z.ZodRawShape;

const teamRunStepSummaryShape = z.object({
  teamStepId: z.string(),
  teamStepOrder: z.number(),
  teamStepStatus: z.string(),
  runtimeStepId: z.string().nullable(),
  runtimeStepStatus: z.string().nullable(),
  runtimeStepFailure: z.string().nullable(),
  runtimeProfileId: z.string().nullable(),
  browserProfileId: z.string().nullable(),
  service: z.string().nullable(),
});

const teamRunExecutionShape = z.object({
  teamId: z.string(),
  taskRunSpecId: z.string(),
  teamRunId: z.string(),
  runtimeRunId: z.string(),
  runtimeSourceKind: z.string(),
  runtimeRunStatus: z.string(),
  runtimeUpdatedAt: z.string(),
  terminalStepCount: z.number(),
  finalOutputSummary: z.string().nullable(),
  sharedStateStatus: z.string(),
  sharedStateNotes: z.array(z.string()),
  stepSummaries: z.array(teamRunStepSummaryShape),
});

const teamRunOutputShape = {
  object: z.literal('team_run'),
  taskRunSpec: z.record(z.string(), z.unknown()),
  execution: teamRunExecutionShape,
} satisfies z.ZodRawShape;

export function registerTeamRunTool(server: McpServer): void {
  server.registerTool(
    'team_run',
    {
      title: 'Run an Aura-Call team',
      description:
        'Create and execute one bounded Aura-Call team run through the same taskRunSpec -> teamRun -> runtimeRun path as the CLI and local HTTP API.',
      inputSchema: teamRunInputShape,
      outputSchema: teamRunOutputShape,
    },
    async (input: unknown) => {
      const textContent = (text: string) => [{ type: 'text' as const, text }];
      const payload = teamRunInputSchema.parse(input);
      const config = await resolveConfig({}, process.cwd(), process.env);

      try {
        const result = await executeConfiguredTeamRun({
          config,
          ...payload,
          teamId: payload.taskRunSpec?.teamId ?? payload.teamId ?? '',
          objective: payload.taskRunSpec?.objective ?? payload.objective ?? '',
          contextCommand: payload.taskRunSpec ? undefined : 'auracall-mcp team_run',
          requestedBy: payload.taskRunSpec
            ? undefined
            : {
                kind: 'mcp',
                label: 'auracall-mcp team_run',
              },
          trigger: payload.taskRunSpec ? undefined : 'mcp',
          executionRequestedBy: payload.taskRunSpec ? undefined : 'auracall-mcp team_run',
        });
        const structuredContent = {
          object: 'team_run' as const,
          taskRunSpec: result.taskRunSpec,
          execution: result.payload,
        };
        return {
          content: textContent(
            [
              `Team run ${result.payload.teamRunId} (${result.payload.runtimeRunStatus})`,
              `TaskRunSpec: ${result.payload.taskRunSpecId}`,
              `Runtime run: ${result.payload.runtimeRunId}`,
              `Final output summary: ${result.payload.finalOutputSummary ?? '(none)'}`,
            ].join('\n'),
          ),
          structuredContent,
        };
      } catch (error) {
        return {
          isError: true,
          content: textContent(`Team run failed: ${error instanceof Error ? error.message : String(error)}`),
        };
      }
    },
  );
}
