import { z } from 'zod';
import { PromptValidationError } from '../oracle/errors.js';
import type {
  TeamRunArtifactRef,
  TeamRunLocalActionRequest,
  TeamRunStructuredOutput,
  TeamRunStepOutput,
} from '../teams/types.js';
import { createExecutionResponseArtifact, createExecutionResponseMessage } from './apiModel.js';

export const AURACALL_STEP_OUTPUT_CONTRACT_VERSION = 'auracall.step-output.v1';

const StepOutputArtifactRefSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  title: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
});

const StepOutputLocalActionRequestSchema = z.object({
  kind: z.literal('shell'),
  summary: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  structuredPayload: z.record(z.string(), z.unknown()).optional(),
  notes: z.array(z.string()).optional(),
});

const StepOutputHandoffSchema = z.object({
  toRoleId: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  artifacts: z.array(StepOutputArtifactRefSchema).optional(),
  structuredData: z.record(z.string(), z.unknown()).optional(),
  notes: z.array(z.string()).optional(),
});

const StepOutputMessageSchema = z.object({
  text: z.string().nullable().optional(),
  markdown: z.string().nullable().optional(),
});

const StepOutputErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  recoverable: z.boolean().optional(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const AuraCallStepOutputEnvelopeSchema = z
  .object({
    version: z.literal(AURACALL_STEP_OUTPUT_CONTRACT_VERSION),
    status: z.enum(['succeeded', 'needs_local_action', 'handoff', 'failed']),
    message: StepOutputMessageSchema.nullable().optional(),
    routing: z
      .object({
        action: z.enum(['complete', 'local_action', 'handoff', 'error']),
        handoffToRoleId: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    artifacts: z.array(StepOutputArtifactRefSchema).optional(),
    localActionRequests: z.array(StepOutputLocalActionRequestSchema).optional(),
    handoffs: z.array(StepOutputHandoffSchema).optional(),
    error: StepOutputErrorSchema.nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'failed' && !value.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['error'],
        message: 'failed step outputs must include error',
      });
    }
    if (value.status === 'needs_local_action' && (value.localActionRequests?.length ?? 0) === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['localActionRequests'],
        message: 'needs_local_action step outputs must include at least one local action request',
      });
    }
  });

export type AuraCallStepOutputEnvelope = z.infer<typeof AuraCallStepOutputEnvelopeSchema>;

export interface AuraCallStepOutputContractResult {
  output: TeamRunStepOutput;
  sharedState: {
    artifacts: TeamRunArtifactRef[];
    structuredOutputs: TeamRunStructuredOutput[];
    notes: string[];
  };
}

export function shouldUseAuraCallStepOutputContract(structuredData: Record<string, unknown>): boolean {
  const responseShape = isRecord(structuredData.responseShape) ? structuredData.responseShape : null;
  return (
    structuredData.outputContract === AURACALL_STEP_OUTPUT_CONTRACT_VERSION ||
    structuredData.contract === AURACALL_STEP_OUTPUT_CONTRACT_VERSION ||
    responseShape?.contract === AURACALL_STEP_OUTPUT_CONTRACT_VERSION ||
    responseShape?.version === AURACALL_STEP_OUTPUT_CONTRACT_VERSION ||
    responseShape?.format === AURACALL_STEP_OUTPUT_CONTRACT_VERSION
  );
}

export function prependAuraCallStepOutputContractPrompt(prompt: string): string {
  return `${buildAuraCallStepOutputContractPrompt()}\n\nUser assignment:\n${prompt}`;
}

export function buildAuraCallStepOutputContractPrompt(): string {
  return [
    'AuraCall step-output contract:',
    `Return exactly one JSON object using version "${AURACALL_STEP_OUTPUT_CONTRACT_VERSION}".`,
    'Do not wrap the JSON in markdown fences. Do not add prose before or after it.',
    'Required top-level fields: version, status.',
    'Allowed status values: succeeded, needs_local_action, handoff, failed.',
    'Use message.markdown or message.text for human-readable assistant output.',
    'Use artifacts[] for durable outputs that must pass to the host or later team steps.',
    'Use localActionRequests[] only when the local host must execute an action; shell actions require kind, summary, command, and optional args, structuredPayload, notes.',
    'Use handoffs[] for explicit team handoff payloads; include toRoleId, summary, artifacts, structuredData, and notes when relevant.',
    'Use error when status is failed; include code, message, recoverable, and details when relevant.',
    'Example:',
    JSON.stringify({
      version: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
      status: 'succeeded',
      routing: { action: 'complete' },
      message: { markdown: 'Final answer.' },
      artifacts: [],
      localActionRequests: [],
      handoffs: [],
      metadata: {},
    }),
  ].join('\n');
}

export function parseAuraCallStepOutputEnvelope(text: string): AuraCallStepOutputEnvelope {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    throw new PromptValidationError(
      'AuraCall step output contract violation: expected exactly one JSON object.',
      {
        contractVersion: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
        reason: 'missing-json-object',
      },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new PromptValidationError(
      'AuraCall step output contract violation: output was not valid JSON.',
      {
        contractVersion: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
        reason: 'invalid-json',
      },
      error,
    );
  }

  const result = AuraCallStepOutputEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    throw new PromptValidationError(
      'AuraCall step output contract violation: JSON did not match auracall.step-output.v1.',
      {
        contractVersion: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
        reason: 'schema-validation-failed',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      result.error,
    );
  }

  return result.data;
}

export function createStepOutputContractResult(
  envelope: AuraCallStepOutputEnvelope,
): AuraCallStepOutputContractResult {
  if (envelope.status === 'failed') {
    throw new PromptValidationError(envelope.error?.message ?? 'AuraCall step reported failure.', {
      contractVersion: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
      reason: 'model-reported-failure',
      error: envelope.error ?? null,
    });
  }

  const messageText = normalizeMessageText(envelope);
  const artifacts = (envelope.artifacts ?? []).map((artifact) => ({
    id: artifact.id,
    kind: artifact.kind,
    title: artifact.title ?? null,
    path: artifact.path ?? null,
    uri: artifact.uri ?? null,
  }));
  const localActionRequests = (envelope.localActionRequests ?? []).map((request) => ({
    kind: request.kind,
    summary: request.summary,
    command: request.command,
    args: request.args ?? [],
    structuredPayload: request.structuredPayload ?? {},
    notes: request.notes ?? [],
  })) satisfies Array<Pick<TeamRunLocalActionRequest, 'kind' | 'summary' | 'command' | 'args' | 'structuredPayload' | 'notes'>>;
  const structuredData: Record<string, unknown> = {
    auracallStepOutput: envelope,
    routing: envelope.routing ?? { action: envelope.status === 'handoff' ? 'handoff' : 'complete' },
    ...(localActionRequests.length > 0 ? { localActionRequests } : {}),
    ...(envelope.handoffs && envelope.handoffs.length > 0 ? { handoffs: envelope.handoffs } : {}),
  };

  const summary = summarizeContractOutput({
    messageText,
    localActionRequests,
    artifacts,
    status: envelope.status,
  });

  return {
    output: {
      summary,
      artifacts,
      structuredData,
      notes: [],
    },
    sharedState: {
      artifacts,
      structuredOutputs: [
        {
          key: 'auracall.stepOutput',
          value: envelope,
        },
        ...(messageText
          ? [
              {
                key: 'response.output',
                value: [createExecutionResponseMessage(messageText)],
              } satisfies TeamRunStructuredOutput,
            ]
          : []),
        ...artifacts.map((artifact) => ({
          key: `response.artifact.${artifact.id}`,
          value: createExecutionResponseArtifact({
            type: 'artifact',
            id: artifact.id,
            artifact_type: 'file',
            title: artifact.title ?? null,
            mime_type: null,
            uri: artifact.uri ?? artifact.path ?? null,
            disposition: artifact.path ? 'attachment' : 'inline',
            metadata: {
              kind: artifact.kind,
            },
          }),
        })),
      ],
      notes: [],
    },
  };
}

function summarizeContractOutput(input: {
  messageText: string | null;
  localActionRequests: Array<Pick<TeamRunLocalActionRequest, 'summary'>>;
  artifacts: TeamRunArtifactRef[];
  status: AuraCallStepOutputEnvelope['status'];
}): string {
  if (input.messageText) {
    const normalized = input.messageText.trim().replace(/\s+/g, ' ');
    return normalized.length <= 240 ? normalized : `${normalized.slice(0, 237)}...`;
  }
  if (input.localActionRequests.length > 0) {
    return input.localActionRequests.map((request) => request.summary).join('; ');
  }
  if (input.artifacts.length > 0) {
    return `Produced ${input.artifacts.length} artifact${input.artifacts.length === 1 ? '' : 's'}.`;
  }
  return `AuraCall step output status: ${input.status}`;
}

function normalizeMessageText(envelope: AuraCallStepOutputEnvelope): string | null {
  const candidate = envelope.message?.markdown ?? envelope.message?.text ?? null;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  return fenced?.[1]?.trim() ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
