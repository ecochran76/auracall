import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createDefaultRuntimeRunBrowserDiagnosticsProbe,
  createDefaultRuntimeRunServiceStateProbe,
} from '../../http/responsesServer.js';
import { inspectRuntimeRun, type InspectRuntimeRunInput } from '../../runtime/inspection.js';

const runtimeInspectInputShape = {
  runId: z.string().min(1).optional(),
  runtimeRunId: z.string().min(1).optional(),
  teamRunId: z.string().min(1).optional(),
  taskRunSpecId: z.string().min(1).optional(),
  runnerId: z.string().min(1).optional(),
  probe: z.enum(['service-state']).optional(),
  diagnostics: z.enum(['browser-state']).optional(),
} satisfies z.ZodRawShape;

const runtimeInspectOutputShape = {
  object: z.literal('runtime_run_inspection'),
  inspection: z.unknown(),
} satisfies z.ZodRawShape;

export function registerRuntimeInspectTool(server: McpServer): void {
  server.registerTool(
    'runtime_inspect',
    {
      title: 'Inspect Aura-Call runtime run',
      description:
        'Read one bounded runtime-run inspection, optionally including live service-state or browser-state diagnostics for an active browser-backed run.',
      inputSchema: runtimeInspectInputShape,
      outputSchema: runtimeInspectOutputShape,
    },
    createRuntimeInspectToolHandler(),
  );
}

export interface RegisterRuntimeInspectToolDeps {
  inspect?: (input: InspectRuntimeRunInput) => ReturnType<typeof inspectRuntimeRun>;
}

export function createRuntimeInspectToolHandler(deps: RegisterRuntimeInspectToolDeps = {}) {
  const inspect = deps.inspect ?? inspectRuntimeRun;
  return async (input: unknown) => {
    const payload = z.object(runtimeInspectInputShape).parse(input);
    const includeServiceState = payload.probe === 'service-state';
    const includeBrowserDiagnostics = payload.diagnostics === 'browser-state';
    const inspection = await inspect({
      runId: payload.runId ?? null,
      runtimeRunId: payload.runtimeRunId ?? null,
      teamRunId: payload.teamRunId ?? null,
      taskRunSpecId: payload.taskRunSpecId ?? null,
      runnerId: payload.runnerId ?? null,
      includeServiceState,
      includeBrowserDiagnostics,
      probeServiceState: includeServiceState ? createDefaultRuntimeRunServiceStateProbe() : undefined,
      probeBrowserDiagnostics: includeBrowserDiagnostics
        ? createDefaultRuntimeRunBrowserDiagnosticsProbe()
        : undefined,
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: `Runtime run ${inspection.runtime.runId} is ${inspection.runtime.runStatus}; queue ${inspection.runtime.queueProjection.queueState}.`,
        },
      ],
      structuredContent: {
        object: 'runtime_run_inspection',
        inspection,
      },
    };
  };
}
