import { ExecutionResponseOutputItemSchema } from './apiSchema.js';
import type { ExecutionResponseOutputItem } from './apiTypes.js';
import type { TeamRunStructuredOutput } from '../teams/types.js';

const RESPONSE_OUTPUT_KEY = 'response.output';

export function normalizeExecutionResponseOutputItems(value: unknown): ExecutionResponseOutputItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate) => {
    const parsed = ExecutionResponseOutputItemSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

export function normalizeRuntimeStructuredOutputs(value: unknown): TeamRunStructuredOutput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.key !== 'string') {
      return [];
    }
    if (candidate.key !== RESPONSE_OUTPUT_KEY) {
      return [
        {
          key: candidate.key,
          value: candidate.value,
        },
      ];
    }

    const output = normalizeExecutionResponseOutputItems(candidate.value);
    return output.length > 0
      ? [
          {
            key: RESPONSE_OUTPUT_KEY,
            value: output,
          },
        ]
      : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
