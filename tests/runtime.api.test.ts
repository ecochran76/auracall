import { describe, expect, it } from 'vitest';
import {
  createExecutionRequest,
  createExecutionResponseArtifact,
  createExecutionResponseFromRunRecord,
  createExecutionResponseMessage,
} from '../src/runtime/apiModel.js';
import { createExecutionRunRecordBundleFromTeamRun } from '../src/runtime/model.js';
import { createTeamRunBundle } from '../src/teams/model.js';

describe('runtime api model', () => {
  it('creates a compatibility-first execution request with optional AuraCall hints', () => {
    const request = createExecutionRequest({
      model: 'gpt-5.2',
      input: 'Investigate the artifact regression',
      instructions: 'Be concise.',
      auracall: {
        runtimeProfile: 'default',
        agent: 'analyst',
        transport: 'browser',
      },
    });

    expect(request).toEqual({
      model: 'gpt-5.2',
      input: 'Investigate the artifact regression',
      instructions: 'Be concise.',
      auracall: {
        runtimeProfile: 'default',
        agent: 'analyst',
        transport: 'browser',
      },
    });
  });

  it('preserves ordered mixed text and artifacts in one response output timeline', () => {
    const teamBundle = createTeamRunBundle({
      runId: 'team_run_1',
      teamId: 'ops',
      createdAt: '2026-04-07T00:00:00.000Z',
      trigger: 'service',
      steps: [
        {
          id: 'team_run_1:step:1',
          agentId: 'analyst',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          service: 'gemini',
          kind: 'analysis',
          status: 'ready',
          order: 1,
          input: {
            prompt: 'Create a plan and a canvas artifact.',
            handoffIds: [],
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        },
      ],
    });

    const runRecord = createExecutionRunRecordBundleFromTeamRun({
      ...teamBundle,
      teamRun: {
        ...teamBundle.teamRun,
        status: 'succeeded',
      },
    });

    const response = createExecutionResponseFromRunRecord({
      responseId: 'resp_1',
      runRecord,
      model: 'gemini-3-pro',
      runtimeProfile: 'default',
      service: 'gemini',
      output: [
        createExecutionResponseMessage('I created a short plan and a canvas draft.'),
        createExecutionResponseArtifact({
          type: 'artifact',
          id: 'art_1',
          artifact_type: 'canvas',
          title: 'Draft Plan',
          mime_type: 'text/plain',
          uri: 'gemini://canvas/59b6f9ac9e510adc',
          disposition: 'inline',
          metadata: {
            createdAt: 'Apr 6, 9:44 PM',
          },
        }),
      ],
    });

    expect(response.status).toBe('completed');
    expect(response.output).toEqual([
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'I created a short plan and a canvas draft.' }],
      },
      {
        type: 'artifact',
        id: 'art_1',
        artifact_type: 'canvas',
        title: 'Draft Plan',
        mime_type: 'text/plain',
        uri: 'gemini://canvas/59b6f9ac9e510adc',
        disposition: 'inline',
        metadata: {
          createdAt: 'Apr 6, 9:44 PM',
        },
      },
    ]);
    expect(response.metadata).toEqual({
      runId: 'team_run_1',
      runtimeProfile: 'default',
      service: 'gemini',
    });
  });
});
