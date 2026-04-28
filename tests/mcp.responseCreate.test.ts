import { describe, expect, it, vi } from 'vitest';
import { createResponseCreateToolHandler } from '../src/mcp/tools/responseCreate.js';
import type { ExecutionRequest } from '../src/runtime/apiTypes.js';

describe('mcp response_create tool', () => {
  it('creates a durable response run with browser workbench hints', async () => {
    let capturedRequest: ExecutionRequest | null = null;
    const handler = createResponseCreateToolHandler({
      createResponse: vi.fn(async (request: ExecutionRequest) => {
        capturedRequest = request;
        return {
          id: 'resp_mcp_deep_research_1',
          object: 'response' as const,
          status: 'completed' as const,
          model: request.model,
          output: [],
          metadata: {
            runId: 'resp_mcp_deep_research_1',
            runtimeProfile: request.auracall?.runtimeProfile ?? null,
            service: request.auracall?.service ?? null,
            executionSummary: {
              browserRunSummary: {
                chatgptDeepResearchStage: 'plan-edit-opened',
                chatgptDeepResearchReviewEvidence: {
                  screenshotPath: '/tmp/deep-research-review.png',
                },
              },
            },
          },
        };
      }),
    });

    const result = await handler({
      model: 'gpt-5.2-thinking',
      input: 'Use Deep Research and open the plan editor.',
      runtimeProfile: 'wsl-chrome-3',
      service: 'chatgpt',
      transport: 'browser',
      composerTool: 'deep-research',
      deepResearchPlanAction: 'edit',
      metadata: {
        smoke: true,
      },
    });

    expect(capturedRequest).toEqual({
      model: 'gpt-5.2-thinking',
      input: 'Use Deep Research and open the plan editor.',
      metadata: {
        smoke: true,
      },
      auracall: {
        runtimeProfile: 'wsl-chrome-3',
        service: 'chatgpt',
        transport: 'browser',
        composerTool: 'deep-research',
        deepResearchPlanAction: 'edit',
      },
    });
    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Response resp_mcp_deep_research_1 completed.',
        },
      ],
      structuredContent: {
        id: 'resp_mcp_deep_research_1',
        object: 'response',
        status: 'completed',
        metadata: {
          executionSummary: {
            browserRunSummary: {
              chatgptDeepResearchStage: 'plan-edit-opened',
              chatgptDeepResearchReviewEvidence: {
                screenshotPath: '/tmp/deep-research-review.png',
              },
            },
          },
        },
      },
    });
  });

  it('returns a pollable message for in-progress response runs', async () => {
    const handler = createResponseCreateToolHandler({
      createResponse: vi.fn(async (request: ExecutionRequest) => ({
        id: 'resp_mcp_running_1',
        object: 'response' as const,
        status: 'in_progress' as const,
        model: request.model,
        output: [],
        metadata: {
          runId: 'resp_mcp_running_1',
        },
      })),
    });

    const result = await handler({
      model: 'gpt-5.2',
      input: 'Reply later.',
    });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Response resp_mcp_running_1 is in_progress. Poll run_status for updates.',
        },
      ],
      structuredContent: {
        id: 'resp_mcp_running_1',
        status: 'in_progress',
      },
    });
  });
});
