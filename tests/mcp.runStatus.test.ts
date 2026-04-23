import { describe, expect, it } from 'vitest';
import { createRunStatusToolHandler } from '../src/mcp/tools/runStatus.js';

describe('mcp run_status tool', () => {
  it('reads response run status through the shared status envelope', async () => {
    const handler = createRunStatusToolHandler({
      responsesService: {
        readResponse: async (id) => ({
          id,
          object: 'response',
          status: 'completed',
          model: 'gemini-3-pro',
          output: [],
          metadata: {
            runId: id,
            runtimeProfile: 'default',
            service: 'gemini',
            executionSummary: {
              completedAt: '2026-04-23T04:00:00.000Z',
              lastUpdatedAt: '2026-04-23T04:00:00.000Z',
              stepSummaries: [
                {
                  stepId: `${id}:step:1`,
                  order: 1,
                  agentId: 'api-responses',
                  status: 'succeeded',
                  runtimeProfileId: 'default',
                  browserProfileId: null,
                  service: 'gemini',
                },
              ],
              orchestrationTimelineSummary: {
                total: 1,
                items: [
                  {
                    type: 'step-succeeded',
                    createdAt: '2026-04-23T04:00:00.000Z',
                    stepId: `${id}:step:1`,
                    note: 'step completed by local runner',
                  },
                ],
              },
              failureSummary: null,
            },
          },
        }),
      },
      mediaGenerationService: {
        readGeneration: async () => null,
      },
    });

    const result = await handler({ id: 'resp_status_1' });

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        id: 'resp_status_1',
        object: 'auracall_run_status',
        kind: 'response',
        status: 'completed',
        stepCount: 1,
        artifactCount: 0,
        metadata: {
          runId: 'resp_status_1',
          runtimeProfile: 'default',
          service: 'gemini',
          model: 'gemini-3-pro',
        },
        lastEvent: {
          type: 'step-succeeded',
        },
      },
    });
  });

  it('falls through to media-generation status when no response run exists', async () => {
    const handler = createRunStatusToolHandler({
      responsesService: {
        readResponse: async () => null,
      },
      mediaGenerationService: {
        readGeneration: async (id) => ({
          id,
          object: 'media_generation',
          status: 'succeeded',
          provider: 'gemini',
          mediaType: 'image',
          prompt: 'Generate an image of an asphalt secret agent',
          createdAt: '2026-04-23T03:44:32.561Z',
          updatedAt: '2026-04-23T03:45:22.951Z',
          completedAt: '2026-04-23T03:45:22.951Z',
          artifacts: [
            {
              id: 'artifact_run_status_1',
              type: 'image',
              fileName: 'Generated image 1.png',
              path: '/tmp/Generated image 1.png',
              metadata: {
                materialization: 'visible-image-screenshot',
              },
            },
          ],
          timeline: [
            {
              event: 'completed',
              at: '2026-04-23T03:45:22.951Z',
            },
          ],
        }),
      },
    });

    const result = await handler({ id: 'medgen_status_1' });

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        id: 'medgen_status_1',
        object: 'auracall_run_status',
        kind: 'media_generation',
        status: 'succeeded',
        artifactCount: 1,
        artifacts: [
          {
            id: 'artifact_run_status_1',
            fileName: 'Generated image 1.png',
            path: '/tmp/Generated image 1.png',
            materialization: 'visible-image-screenshot',
          },
        ],
        lastEvent: {
          event: 'completed',
        },
      },
    });
  });
});
