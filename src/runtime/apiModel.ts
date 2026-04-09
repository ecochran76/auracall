import {
  ExecutionRequestSchema,
  ExecutionResponseArtifactOutputItemSchema,
  ExecutionResponseFromRunRecordInputSchema,
  ExecutionResponseMessageOutputItemSchema,
  ExecutionResponseSchema,
} from './apiSchema.js';
import type {
  ExecutionRequest,
  ExecutionResponse,
  ExecutionResponseArtifactOutputItem,
  ExecutionResponseFromRunRecordInput,
  ExecutionResponseMessageOutputItem,
} from './apiTypes.js';

export function createExecutionRequest(input: ExecutionRequest): ExecutionRequest {
  return ExecutionRequestSchema.parse(input);
}

export function createExecutionResponseMessage(text: string): ExecutionResponseMessageOutputItem {
  return ExecutionResponseMessageOutputItemSchema.parse({
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'output_text',
        text,
      },
    ],
  });
}

export function createExecutionResponseArtifact(
  input: ExecutionResponseArtifactOutputItem,
): ExecutionResponseArtifactOutputItem {
  return ExecutionResponseArtifactOutputItemSchema.parse(input);
}

function mapRunStatusToResponseStatus(
  status: ExecutionResponseFromRunRecordInput['runRecord']['run']['status'],
): ExecutionResponse['status'] {
  switch (status) {
    case 'planned':
    case 'running':
      return 'in_progress';
    case 'succeeded':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'in_progress';
  }
}

export function createExecutionResponse(input: ExecutionResponse): ExecutionResponse {
  return ExecutionResponseSchema.parse(input);
}

export function createExecutionResponseFromRunRecord(
  input: ExecutionResponseFromRunRecordInput,
): ExecutionResponse {
  const parsed = ExecutionResponseFromRunRecordInputSchema.parse(input);
  const terminalStep =
    parsed.runRecord.steps.find((step) => step.status === 'failed') ??
    parsed.runRecord.steps
      .slice()
      .sort((left, right) => right.order - left.order)
      .find((step) => step.status === 'succeeded' || step.status === 'cancelled');
  return createExecutionResponse({
    id: parsed.responseId,
    object: 'response',
    status: mapRunStatusToResponseStatus(parsed.runRecord.run.status),
    model: parsed.model ?? null,
    output: parsed.output,
    metadata: {
      runId: parsed.runRecord.run.id,
      runtimeProfile: parsed.runtimeProfile ?? null,
      service: parsed.service ?? null,
      executionSummary: {
        terminalStepId: terminalStep?.id ?? null,
        completedAt: terminalStep?.completedAt ?? null,
        lastUpdatedAt: parsed.runRecord.run.updatedAt ?? parsed.runRecord.sharedState.lastUpdatedAt ?? null,
        failureSummary:
          terminalStep?.failure
            ? {
                code: terminalStep.failure.code ?? null,
                message: terminalStep.failure.message ?? null,
              }
            : null,
      },
    },
  });
}
