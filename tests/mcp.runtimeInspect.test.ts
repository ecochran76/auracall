import { describe, expect, it } from 'vitest';
import { createRuntimeInspectToolHandler } from '../src/mcp/tools/runtimeInspect.js';

describe('mcp runtime_inspect tool', () => {
  it('returns runtime inspection with browser diagnostics', async () => {
    const handler = createRuntimeInspectToolHandler({
      inspect: async (input) => ({
        resolvedBy: 'run-id',
        queryId: input.runId ?? 'runtime_mcp_diag_1',
        queryRunId: input.runId ?? 'runtime_mcp_diag_1',
        matchingRuntimeRunCount: 1,
        matchingRuntimeRunIds: [input.runId ?? 'runtime_mcp_diag_1'],
        taskRunSpecSummary: null,
        runtime: {
          runId: input.runId ?? 'runtime_mcp_diag_1',
          teamRunId: null,
          taskRunSpecId: null,
          sourceKind: 'direct',
          runStatus: 'running',
          updatedAt: '2026-04-23T18:30:00.000Z',
          queueProjection: {
            runId: input.runId ?? 'runtime_mcp_diag_1',
            sourceKind: 'direct',
            runStatus: 'running',
            createdAt: '2026-04-23T18:00:00.000Z',
            updatedAt: '2026-04-23T18:30:00.000Z',
            queueState: 'active-lease',
            claimState: 'held-by-lease',
            nextRunnableStepId: null,
            runningStepIds: ['runtime_mcp_diag_1:step:1'],
            waitingStepIds: [],
            deferredStepIds: [],
            blockedStepIds: [],
            blockedByFailureStepIds: [],
            terminalStepIds: [],
            missingDependencyStepIds: [],
            activeLeaseId: 'runtime_mcp_diag_1:lease:1',
            activeLeaseOwnerId: 'runner:mcp',
            affinity: {
              status: 'not-evaluated',
              reason: null,
              requiredService: 'gemini',
              requiredServiceAccountId: null,
              browserRequired: true,
              requiredRuntimeProfileId: 'auracall-gemini-pro',
              requiredBrowserProfileId: 'default',
              hostRequirement: 'any',
              requiredHostId: null,
              eligibilityNote: null,
            },
          },
        },
        runner: null,
        browserDiagnostics: {
          probeStatus: 'observed',
          service: 'gemini',
          ownerStepId: 'runtime_mcp_diag_1:step:1',
          observedAt: '2026-04-23T18:30:04.000Z',
          source: 'browser-service',
          reason: null,
          target: {
            host: '127.0.0.1',
            port: 9222,
            targetId: 'gemini-tab-mcp',
            url: 'https://gemini.google.com/app',
            title: 'Google Gemini',
          },
          document: {
            url: 'https://gemini.google.com/app',
            title: 'Google Gemini',
            readyState: 'complete',
            visibilityState: 'visible',
            focused: true,
            bodyTextLength: 700,
          },
          visibleCounts: {
            buttons: 10,
            links: 2,
            inputs: 0,
            textareas: 0,
            contenteditables: 1,
            modelResponses: 1,
          },
          providerEvidence: {
            hasActiveAvatarSpinner: true,
            isGenerating: true,
          },
          screenshot: {
            path: '/tmp/gemini-mcp-diagnostics.png',
            mimeType: 'image/png',
            bytes: 2048,
          },
        },
      }),
    });

    const result = await handler({
      runId: 'runtime_mcp_diag_1',
      diagnostics: 'browser-state',
    });

    expect(result).toMatchObject({
      structuredContent: {
        object: 'runtime_run_inspection',
        inspection: {
          runtime: {
            runId: 'runtime_mcp_diag_1',
          },
          browserDiagnostics: {
            probeStatus: 'observed',
            target: {
              targetId: 'gemini-tab-mcp',
            },
            providerEvidence: {
              hasActiveAvatarSpinner: true,
            },
          },
        },
      },
    });
  });
});
