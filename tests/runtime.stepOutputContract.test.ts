import { describe, expect, it } from 'vitest';
import {
  AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
  createStepOutputContractResult,
  parseAuraCallStepOutputEnvelope,
  prependAuraCallStepOutputContractPrompt,
  shouldUseAuraCallStepOutputContract,
} from '../src/runtime/stepOutputContract.js';
import { PromptValidationError } from '../src/oracle/errors.js';

describe('AuraCall step output contract', () => {
  it('detects opt-in response shape hints and prepends deterministic instructions', () => {
    expect(
      shouldUseAuraCallStepOutputContract({
        responseShape: {
          contract: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
        },
      }),
    ).toBe(true);
    expect(
      shouldUseAuraCallStepOutputContract({
        taskOverrideStructuredContext: {
          outputContract: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
        },
      }),
    ).toBe(true);
    expect(shouldUseAuraCallStepOutputContract({ responseShape: { format: 'json' } })).toBe(false);

    const prompt = prependAuraCallStepOutputContractPrompt('Do the work.');
    expect(prompt).toContain(`version "${AURACALL_STEP_OUTPUT_CONTRACT_VERSION}"`);
    expect(prompt).toContain('Do not wrap the JSON in markdown fences.');
    expect(prompt).toContain('User assignment:\nDo the work.');
  });

  it('parses a valid completed envelope into step output and response output', () => {
    const envelope = parseAuraCallStepOutputEnvelope(JSON.stringify({
      version: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
      status: 'succeeded',
      routing: { action: 'complete' },
      message: { markdown: 'Contract final answer.' },
      artifacts: [
        {
          id: 'artifact_1',
          kind: 'file',
          title: 'report.md',
          path: '/tmp/report.md',
        },
      ],
      localActionRequests: [],
      handoffs: [],
      metadata: { confidence: 'high' },
    }));

    const result = createStepOutputContractResult(envelope);
    expect(result.output).toMatchObject({
      summary: 'Contract final answer.',
      artifacts: [
        {
          id: 'artifact_1',
          kind: 'file',
          title: 'report.md',
          path: '/tmp/report.md',
        },
      ],
      structuredData: {
        routing: { action: 'complete' },
      },
    });
    expect(result.sharedState.structuredOutputs).toContainEqual({
      key: 'response.output',
      value: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Contract final answer.' }],
        },
      ],
    });
  });

  it('rejects invalid contract output with machine-readable validation details', () => {
    expect(() => parseAuraCallStepOutputEnvelope('plain text')).toThrow(PromptValidationError);
    try {
      parseAuraCallStepOutputEnvelope(JSON.stringify({
        version: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
        status: 'needs_local_action',
      }));
    } catch (error) {
      expect(error).toBeInstanceOf(PromptValidationError);
      expect((error as PromptValidationError).details).toMatchObject({
        contractVersion: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
        reason: 'schema-validation-failed',
      });
    }
  });
});
