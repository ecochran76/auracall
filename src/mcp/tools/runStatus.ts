import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createMediaGenerationService, type MediaGenerationService } from '../../media/service.js';
import { probeMediaGenerationBrowserDiagnostics } from '../../media/browserDiagnostics.js';
import { createExecutionResponsesService, type ExecutionResponsesService } from '../../runtime/responsesService.js';
import {
  createDefaultRuntimeRunBrowserDiagnosticsProbe,
} from '../../http/responsesServer.js';
import { readAuraCallRunStatus } from '../../runStatus.js';
import { inspectRuntimeRun } from '../../runtime/inspection.js';

const runStatusInputShape = {
  id: z.string().min(1),
  diagnostics: z.enum(['browser-state']).optional(),
} satisfies z.ZodRawShape;

const runStatusArtifactShape = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  materialization: z.string().nullable().optional(),
});

const runStatusStepShape = z.object({
  stepId: z.string().nullable().optional(),
  order: z.number().optional(),
  agentId: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  runtimeProfileId: z.string().nullable().optional(),
  browserProfileId: z.string().nullable().optional(),
  service: z.string().nullable().optional(),
});

const runStatusOutputShape = {
  id: z.string(),
  object: z.literal('auracall_run_status'),
  kind: z.enum(['response', 'media_generation']),
  status: z.string(),
  updatedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  lastEvent: z.unknown().nullable().optional(),
  stepCount: z.number().int().nonnegative().optional(),
  steps: z.array(runStatusStepShape).optional(),
  artifactCount: z.number().int().nonnegative(),
  artifacts: z.array(runStatusArtifactShape),
  browserDiagnostics: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()),
  failure: z.unknown().nullable().optional(),
} satisfies z.ZodRawShape;

export interface RegisterRunStatusToolDeps {
  responsesService?: Pick<ExecutionResponsesService, 'readResponse'>;
  mediaGenerationService?: Pick<MediaGenerationService, 'readGeneration'>;
}

export function registerRunStatusTool(
  server: McpServer,
  deps: RegisterRunStatusToolDeps = {},
): void {
  const responsesService = deps.responsesService ?? createExecutionResponsesService();
  const mediaGenerationService = deps.mediaGenerationService ?? createMediaGenerationService();
  server.registerTool(
    'run_status',
    {
      title: 'Read Aura-Call run status',
      description:
        'Read compact status for one Aura-Call run id across response/team chats and media generations without re-invoking the provider.',
      inputSchema: runStatusInputShape,
      outputSchema: runStatusOutputShape,
    },
    createRunStatusToolHandler({ responsesService, mediaGenerationService }),
  );
}

export function createRunStatusToolHandler(deps: Required<RegisterRunStatusToolDeps>) {
  return async (input: unknown) => {
    const textContent = (text: string) => [{ type: 'text' as const, text }];
    const payload = z.object(runStatusInputShape).parse(input);
    const status = await readAuraCallRunStatus(payload.id, {
      responsesService: deps.responsesService,
      mediaGenerationService: deps.mediaGenerationService,
    });
    if (!status) {
      throw new Error(`Run "${payload.id}" not found.`);
    }
    if (payload.diagnostics === 'browser-state') {
      if (status.kind === 'response') {
        const inspection = await inspectRuntimeRun({
          runId: status.id,
          includeBrowserDiagnostics: true,
          probeBrowserDiagnostics: createDefaultRuntimeRunBrowserDiagnosticsProbe(),
        });
        status.browserDiagnostics = inspection.browserDiagnostics;
      } else {
        const mediaGeneration = await deps.mediaGenerationService.readGeneration(status.id);
        if (mediaGeneration) {
          status.browserDiagnostics = await probeMediaGenerationBrowserDiagnostics(mediaGeneration);
        }
      }
    }
    const lastEvent = readLastEventLabel(status.lastEvent);
    return {
      isError: status.status === 'failed',
      content: textContent(
        `Run ${status.id} (${status.kind}) is ${status.status}; last event ${lastEvent}; artifacts ${status.artifactCount}.`,
      ),
      structuredContent: status as typeof status & Record<string, unknown>,
    };
  };
}

function readLastEventLabel(lastEvent: unknown): string {
  if (!lastEvent || typeof lastEvent !== 'object') return 'none';
  const record = lastEvent as Record<string, unknown>;
  return stringOrNull(record.event) ?? stringOrNull(record.type) ?? 'unknown';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
