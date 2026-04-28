import {
  ExecutionRequestSchema,
  ExecutionResponseArtifactOutputItemSchema,
  ExecutionResponseFromRunRecordInputSchema,
  ExecutionResponseMessageOutputItemSchema,
  ExecutionResponseSchema,
} from './apiSchema.js';
import { normalizeTaskTransfer } from './taskTransfer.js';
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

function applyRequestedOutputPolicyToResponseStatus(input: {
  runStatus: ExecutionResponseFromRunRecordInput['runRecord']['run']['status'];
  requestedOutputPolicy:
    | {
        status: 'satisfied' | 'missing-required';
        message: string;
        missingRequiredLabels: string[];
      }
    | null;
}): ExecutionResponse['status'] {
  const baseStatus = mapRunStatusToResponseStatus(input.runStatus);
  if (baseStatus === 'completed' && input.requestedOutputPolicy?.status === 'missing-required') {
    return 'failed';
  }
  return baseStatus;
}

export function createExecutionResponse(input: ExecutionResponse): ExecutionResponse {
  return ExecutionResponseSchema.parse(input);
}

export function createExecutionResponseFromRunRecord(
  input: ExecutionResponseFromRunRecordInput,
): ExecutionResponse {
  const parsed = ExecutionResponseFromRunRecordInputSchema.parse(input);
  const taskRunSpecId =
    parsed.runRecord.run.sourceKind === 'team-run' ? parsed.runRecord.run.taskRunSpecId ?? null : null;
  const taskRunSpecSummary = taskRunSpecId ? parsed.taskRunSpecSummary ?? null : null;
  const terminalStep =
    parsed.runRecord.steps.find((step) => step.status === 'failed') ??
    parsed.runRecord.steps
      .slice()
      .sort((left, right) => right.order - left.order)
      .find((step) => step.status === 'succeeded' || step.status === 'cancelled');
  const requestedOutputSummary = readExecutionRunRequestedOutputSummary(parsed.runRecord, parsed.output, terminalStep);
  const requestedOutputPolicy = readExecutionRunRequestedOutputPolicySummary(requestedOutputSummary);
  const browserRunSummary = readExecutionRunBrowserRunSummary(parsed.runRecord, terminalStep?.id ?? null);
  return createExecutionResponse({
    id: parsed.responseId,
    object: 'response',
    status: applyRequestedOutputPolicyToResponseStatus({
      runStatus: parsed.runRecord.run.status,
      requestedOutputPolicy,
    }),
    model: parsed.model ?? null,
    output: parsed.output,
    metadata: {
      runId: parsed.runRecord.run.id,
      taskRunSpecId,
      taskRunSpecSummary,
      runtimeProfile: parsed.runtimeProfile ?? null,
      service: parsed.service ?? null,
      executionSummary: {
        terminalStepId: terminalStep?.id ?? null,
        completedAt: terminalStep?.completedAt ?? null,
        lastUpdatedAt: parsed.runRecord.run.updatedAt ?? parsed.runRecord.sharedState.lastUpdatedAt ?? null,
        stepSummaries: readExecutionRunStepSummaries(parsed.runRecord),
        localActionSummary: readExecutionRunLocalActionSummary(parsed.runRecord, terminalStep?.id ?? null),
        requestedOutputSummary,
        requestedOutputPolicy,
        inputArtifactSummary: readExecutionRunInputArtifactSummary(parsed.runRecord, terminalStep?.id ?? null),
        handoffTransferSummary: readExecutionRunHandoffTransferSummary(parsed.runRecord, terminalStep?.id ?? null),
        providerUsageSummary: readExecutionRunProviderUsageSummary(parsed.runRecord, terminalStep?.id ?? null),
        ...(browserRunSummary ? { browserRunSummary } : {}),
        cancellationSummary: readExecutionRunCancellationSummary(parsed.runRecord),
        operatorControlSummary: readExecutionRunOperatorControlSummary(parsed.runRecord),
        orchestrationTimelineSummary: readExecutionRunOrchestrationTimelineSummary(parsed.runRecord),
        failureSummary:
          terminalStep?.failure
            ? {
                code: terminalStep.failure.code ?? null,
                message: terminalStep.failure.message ?? null,
                ...(terminalStep.failure.details ? { details: terminalStep.failure.details } : {}),
              }
            : requestedOutputPolicy?.status === 'missing-required'
              ? {
                  code: 'requested_output_required_missing',
                  message: requestedOutputPolicy.message,
                }
            : null,
      },
    },
  });
}

function readExecutionRunBrowserRunSummary(
  runRecord: ExecutionResponseFromRunRecordInput['runRecord'],
  terminalStepId: string | null,
): Record<string, unknown> | null {
  const preferred = terminalStepId
    ? runRecord.steps.find((step) => step.id === terminalStepId)
    : null;
  const step = preferred ??
    runRecord.steps
      .slice()
      .reverse()
      .find((entry) => isRecord(entry.output?.structuredData?.browserRun));
  const browserRun = isRecord(step?.output?.structuredData?.browserRun)
    ? step?.output?.structuredData?.browserRun
    : null;
  if (!browserRun) {
    return null;
  }
  return {
    ownerStepId: step?.id ?? null,
    provider: readString(browserRun.provider) ?? readString(browserRun.service),
    service: readString(browserRun.service) ?? readString(browserRun.provider),
    conversationId: readString(browserRun.conversationId),
    tabUrl: readString(browserRun.tabUrl),
    runtimeProfileId: readString(browserRun.runtimeProfileId),
    browserProfileId: readString(browserRun.browserProfileId),
    chatgptDeepResearchStage: readString(browserRun.chatgptDeepResearchStage),
    chatgptDeepResearchPlanAction: readString(browserRun.chatgptDeepResearchPlanAction),
    chatgptDeepResearchStartMethod: readString(browserRun.chatgptDeepResearchStartMethod),
    chatgptDeepResearchModifyPlanLabel: readString(browserRun.chatgptDeepResearchModifyPlanLabel),
    chatgptDeepResearchModifyPlanVisible:
      typeof browserRun.chatgptDeepResearchModifyPlanVisible === 'boolean'
        ? browserRun.chatgptDeepResearchModifyPlanVisible
        : null,
    chatgptDeepResearchReviewEvidence: isRecord(browserRun.chatgptDeepResearchReviewEvidence)
      ? browserRun.chatgptDeepResearchReviewEvidence
      : null,
  };
}

function readExecutionRunStepSummaries(
  runRecord: ExecutionResponseFromRunRecordInput['runRecord'],
): Array<{
  stepId: string | null;
  order: number;
  agentId: string | null;
  status: string | null;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  service: string | null;
}> | null {
  if (runRecord.steps.length === 0) {
    return null;
  }

  return runRecord.steps
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((step) => ({
      stepId: step.id ?? null,
      order: step.order,
      agentId: step.agentId ?? null,
      status: step.status ?? null,
      runtimeProfileId: step.runtimeProfileId ?? null,
      browserProfileId: step.browserProfileId ?? null,
      service: step.service ?? null,
    }));
}

function readExecutionRunProviderUsageSummary(
  runRecord: ExecutionResponseFromRunRecordInput['runRecord'],
  terminalStepId: string | null,
): {
  ownerStepId: string | null;
  generatedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
} | null {
  const preferredKey = terminalStepId !== null ? `step.providerUsage.${terminalStepId}` : null;
  const structured =
    (preferredKey ? runRecord.sharedState.structuredOutputs.find((entry) => entry.key === preferredKey) : null) ??
    runRecord.sharedState.structuredOutputs
      .slice()
      .reverse()
      .find((entry) => entry.key.startsWith('step.providerUsage.'));

  if (!structured || !isRecord(structured.value)) {
    return null;
  }

  return {
    ownerStepId: typeof structured.value.ownerStepId === 'string' ? structured.value.ownerStepId : null,
    generatedAt: typeof structured.value.generatedAt === 'string' ? structured.value.generatedAt : null,
    inputTokens: readNonNegativeInt(structured.value.inputTokens),
    outputTokens: readNonNegativeInt(structured.value.outputTokens),
    reasoningTokens: readNonNegativeInt(structured.value.reasoningTokens),
    totalTokens: readNonNegativeInt(structured.value.totalTokens),
  };
}

function readExecutionRunOrchestrationTimelineSummary(
  runRecord: ExecutionResponseFromRunRecordInput['runRecord'],
): {
  total: number;
  items: Array<{
    type: 'step-started' | 'step-succeeded' | 'step-failed' | 'handoff-consumed' | 'note-added' | null;
    createdAt: string | null;
    stepId: string | null;
    note: string | null;
    handoffId: string | null;
  }>;
} | null {
  const relevantEvents = runRecord.sharedState.history.filter((event) => {
    if (
      event.type === 'step-started' ||
      event.type === 'step-succeeded' ||
      event.type === 'step-failed' ||
      event.type === 'handoff-consumed'
    ) {
      return true;
    }
    if (event.type !== 'note-added') {
      return false;
    }
    return isRecord(event.payload) && (typeof event.payload.source === 'string' || typeof event.payload.action === 'string');
  });

  if (relevantEvents.length === 0) {
    return null;
  }

  const items = relevantEvents.slice(-10).map((event) => ({
    type: narrowOrchestrationTimelineEventType(event.type),
    createdAt: event.createdAt ?? null,
    stepId: event.stepId ?? null,
    note: event.note ?? null,
    handoffId: isRecord(event.payload) && typeof event.payload.handoffId === 'string' ? event.payload.handoffId : null,
  }));

  return {
    total: relevantEvents.length,
    items,
  };
}

function narrowOrchestrationTimelineEventType(
  type: ExecutionResponseFromRunRecordInput['runRecord']['sharedState']['history'][number]['type'],
): 'step-started' | 'step-succeeded' | 'step-failed' | 'handoff-consumed' | 'note-added' | null {
  switch (type) {
    case 'step-started':
    case 'step-succeeded':
    case 'step-failed':
    case 'handoff-consumed':
    case 'note-added':
      return type;
    default:
      return null;
  }
}

function readExecutionRunInputArtifactSummary(
  runRecord: ExecutionResponseFromRunRecordInput['runRecord'],
  terminalStepId: string | null,
): {
  total: number;
  items: Array<{
    id: string | null;
    kind: string | null;
    title: string | null;
    path: string | null;
    uri: string | null;
  }>;
} | null {
  const terminalStep = terminalStepId ? runRecord.steps.find((step) => step.id === terminalStepId) : null;
  const selectedStep =
    terminalStep && terminalStep.input.artifacts.length > 0
      ? terminalStep
      : runRecord.steps
          .slice()
          .reverse()
          .find((step) => step.input.artifacts.length > 0);

  if (!selectedStep || selectedStep.input.artifacts.length === 0) {
    return null;
  }

  return {
    total: selectedStep.input.artifacts.length,
    items: selectedStep.input.artifacts.map((artifact) => ({
      id: typeof artifact.id === 'string' ? artifact.id : null,
      kind: typeof artifact.kind === 'string' ? artifact.kind : null,
      title: typeof artifact.title === 'string' ? artifact.title : null,
      path: typeof artifact.path === 'string' ? artifact.path : null,
      uri: typeof artifact.uri === 'string' ? artifact.uri : null,
    })),
  };
}

function readExecutionRunHandoffTransferSummary(
  runRecord: ExecutionResponseFromRunRecordInput['runRecord'],
  terminalStepId: string | null,
): {
  total: number;
  items: Array<{
    handoffId: string | null;
    fromStepId: string | null;
    fromAgentId: string | null;
    title: string | null;
    objective: string | null;
    requestedOutputCount: number;
    inputArtifactCount: number;
  }>;
  } | null {
  const selectedStep =
    (terminalStepId ? runRecord.steps.find((step) => step.id === terminalStepId) : null) ??
    runRecord.steps
      .slice()
      .reverse()
      .find((step) => step.dependsOnStepIds.length > 0);

  if (!selectedStep) {
    return null;
  }

  const storedSummary = readStoredConsumedTaskTransferSummary(runRecord, selectedStep.id);
  if (storedSummary) {
    return storedSummary;
  }

  const items = runRecord.handoffs
    .filter((handoff) => handoff.toStepId === selectedStep.id)
    .flatMap((handoff) => {
      const taskTransfer = normalizeTaskTransfer(handoff.structuredData.taskTransfer);
      if (!taskTransfer) {
        return [];
      }
      return {
        handoffId: handoff.id ?? null,
        fromStepId: handoff.fromStepId ?? null,
        fromAgentId: handoff.fromAgentId ?? null,
        title: taskTransfer.title,
        objective: taskTransfer.objective,
        requestedOutputCount: taskTransfer.requestedOutputs.length,
        inputArtifactCount: taskTransfer.inputArtifacts.length,
      };
    });

  if (items.length === 0) {
    return null;
  }

  return {
    total: items.length,
    items,
  };
}

function readStoredConsumedTaskTransferSummary(
  runRecord: ExecutionResponseFromRunRecordInput['runRecord'],
  stepId: string,
): {
  total: number;
  items: Array<{
    handoffId: string | null;
    fromStepId: string | null;
    fromAgentId: string | null;
    title: string | null;
    objective: string | null;
    requestedOutputCount: number;
    inputArtifactCount: number;
  }>;
} | null {
  const entry = runRecord.sharedState.structuredOutputs.find(
    (structuredOutput) => structuredOutput.key === `step.consumedTaskTransfers.${stepId}`,
  );
  if (!entry || !isRecord(entry.value) || !Array.isArray(entry.value.items)) {
    return null;
  }

  const items = entry.value.items
    .filter(isRecord)
    .map((item) => ({
      handoffId: typeof item.handoffId === 'string' ? item.handoffId : null,
      fromStepId: typeof item.fromStepId === 'string' ? item.fromStepId : null,
      fromAgentId: typeof item.fromAgentId === 'string' ? item.fromAgentId : null,
      title: typeof item.title === 'string' ? item.title : null,
      objective: typeof item.objective === 'string' ? item.objective : null,
      requestedOutputCount: readNonNegativeInt(item.requestedOutputCount),
      inputArtifactCount: readNonNegativeInt(item.inputArtifactCount),
    }));

  if (items.length === 0) {
    return null;
  }

  return {
    total: items.length,
    items,
  };
}

function readExecutionRunLocalActionSummary(
  runRecord: ExecutionResponseFromRunRecordInput['runRecord'],
  terminalStepId: string | null,
): {
  ownerStepId: string | null;
  generatedAt: string | null;
  total: number;
  counts: {
    requested: number;
    approved: number;
    rejected: number;
    executed: number;
    failed: number;
    cancelled: number;
  } | null;
  items: Array<{
    requestId: string | null;
    kind: string | null;
    status: string | null;
    summary: string | null;
    command: string | null;
    args: string[];
    resultSummary: string | null;
  }>;
} | null {
  const preferredKey =
    terminalStepId !== null ? `step.localActionOutcomes.${terminalStepId}` : null;
  const structured =
    (preferredKey
      ? runRecord.sharedState.structuredOutputs.find((entry) => entry.key === preferredKey)
      : null) ??
    runRecord.sharedState.structuredOutputs
      .slice()
      .reverse()
      .find((entry) => entry.key.startsWith('step.localActionOutcomes.'));

  if (!structured || !isRecord(structured.value)) {
    return null;
  }

  const countsValue = isRecord(structured.value.counts) ? structured.value.counts : null;
  const itemsValue = Array.isArray(structured.value.items) ? structured.value.items : [];
  return {
    ownerStepId: typeof structured.value.ownerStepId === 'string' ? structured.value.ownerStepId : null,
    generatedAt: typeof structured.value.generatedAt === 'string' ? structured.value.generatedAt : null,
    total:
      typeof structured.value.total === 'number' && Number.isFinite(structured.value.total)
        ? Math.max(0, Math.trunc(structured.value.total))
        : itemsValue.length,
    counts: countsValue
      ? {
          requested: readNonNegativeInt(countsValue.requested),
          approved: readNonNegativeInt(countsValue.approved),
          rejected: readNonNegativeInt(countsValue.rejected),
          executed: readNonNegativeInt(countsValue.executed),
          failed: readNonNegativeInt(countsValue.failed),
          cancelled: readNonNegativeInt(countsValue.cancelled),
        }
      : null,
    items: itemsValue.map((item) => {
      const candidate = isRecord(item) ? item : {};
      return {
        requestId: typeof candidate.requestId === 'string' ? candidate.requestId : null,
        kind: typeof candidate.kind === 'string' ? candidate.kind : null,
        status: typeof candidate.status === 'string' ? candidate.status : null,
        summary: typeof candidate.summary === 'string' ? candidate.summary : null,
        command: typeof candidate.command === 'string' ? candidate.command : null,
        args: Array.isArray(candidate.args)
          ? candidate.args.filter((value): value is string => typeof value === 'string')
          : [],
        resultSummary: typeof candidate.resultSummary === 'string' ? candidate.resultSummary : null,
      };
    }),
  };
}

function readNonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readExecutionRunCancellationSummary(runRecord: ExecutionResponseFromRunRecordInput['runRecord']): {
  cancelledAt: string | null;
  source: 'operator' | 'service-host' | null;
  reason: string | null;
} | null {
  if (runRecord.run.status !== 'cancelled') {
    return null;
  }

  for (let index = runRecord.events.length - 1; index >= 0; index -= 1) {
    const event = runRecord.events[index];
    if (!event || event.type !== 'note-added' || !isRecord(event.payload)) {
      continue;
    }
    if (event.payload.status !== 'cancelled') {
      continue;
    }
    const source =
      event.payload.source === 'operator' || event.payload.source === 'service-host'
        ? event.payload.source
        : null;
    return {
      cancelledAt: event.createdAt ?? runRecord.run.updatedAt ?? null,
      source,
      reason: event.note ?? null,
    };
  }

  return {
    cancelledAt: runRecord.run.updatedAt ?? null,
    source: null,
    reason: null,
  };
}

function readExecutionRunOperatorControlSummary(runRecord: ExecutionResponseFromRunRecordInput['runRecord']): {
  humanEscalationResume: {
    resumedAt: string | null;
    note: string | null;
  } | null;
  targetedDrain: {
    requestedAt: string | null;
    status: 'executed' | 'skipped' | null;
    reason: string | null;
    skipReason: string | null;
  } | null;
} | null {
  const latestHumanResume = runRecord.sharedState.structuredOutputs
    .slice()
    .reverse()
    .find((entry) => entry.key.startsWith('human.resume.'));
  const latestDrainEvent = runRecord.events
    .slice()
    .reverse()
    .find(
      (event) =>
        event.type === 'note-added' &&
        isRecord(event.payload) &&
        event.payload.source === 'operator' &&
        event.payload.action === 'drain-run',
    );

  const humanEscalationResume =
    latestHumanResume && isRecord(latestHumanResume.value)
      ? {
          resumedAt: typeof latestHumanResume.value.resumedAt === 'string' ? latestHumanResume.value.resumedAt : null,
          note: typeof latestHumanResume.value.note === 'string' ? latestHumanResume.value.note : null,
        }
      : null;
  let targetedDrain:
    | {
        requestedAt: string | null;
        status: 'executed' | 'skipped' | null;
        reason: string | null;
        skipReason: string | null;
      }
    | null = null;
  if (latestDrainEvent && isRecord(latestDrainEvent.payload)) {
    const rawStatus = latestDrainEvent.payload.status;
    const status: 'executed' | 'skipped' | null =
      rawStatus === 'executed' || rawStatus === 'skipped' ? rawStatus : null;
    targetedDrain = {
      requestedAt: latestDrainEvent.createdAt ?? null,
      status,
      reason: latestDrainEvent.note ?? null,
      skipReason: typeof latestDrainEvent.payload.skipReason === 'string' ? latestDrainEvent.payload.skipReason : null,
    };
  }

  if (!humanEscalationResume && !targetedDrain) {
    return null;
  }

  return {
    humanEscalationResume,
    targetedDrain,
  };
}

function readExecutionRunRequestedOutputSummary(
  runRecord: ExecutionResponseFromRunRecordInput['runRecord'],
  output: ExecutionResponseFromRunRecordInput['output'],
  terminalStep:
    | ExecutionResponseFromRunRecordInput['runRecord']['steps'][number]
    | undefined,
): {
  total: number;
  fulfilledCount: number;
  missingRequiredCount: number;
  items: Array<{
    label: string | null;
    kind: string | null;
    format: string | null;
    destination: string | null;
    required: boolean;
    fulfilled: boolean;
    evidence: 'message' | 'artifact' | 'structured-output' | null;
  }>;
} | null {
  const requestedOutputs = Array.isArray(terminalStep?.input.structuredData.requestedOutputs)
    ? terminalStep.input.structuredData.requestedOutputs
    : [];
  if (requestedOutputs.length === 0) {
    return null;
  }

  const hasMessageOutput = output.some((item) => item.type === 'message');
  const hasArtifactOutput = output.some((item) => item.type === 'artifact') || runRecord.sharedState.artifacts.length > 0;
  const hasStructuredOutput = runRecord.sharedState.structuredOutputs.some(
    (entry) => !isInternalStructuredOutputKey(entry.key),
  );

  const items = requestedOutputs.map((requestedOutput) => {
    const candidate = isRecord(requestedOutput) ? requestedOutput : {};
    const kind = typeof candidate.kind === 'string' ? candidate.kind : null;
    const format = typeof candidate.format === 'string' ? candidate.format : null;
    const destination = typeof candidate.destination === 'string' ? candidate.destination : null;
    const required = candidate.required === true;
    const fulfillment = resolveRequestedOutputFulfillment({
      kind,
      format,
      destination,
      hasMessageOutput,
      hasArtifactOutput,
      hasStructuredOutput,
    });
    return {
      label: typeof candidate.label === 'string' ? candidate.label : null,
      kind,
      format,
      destination,
      required,
      fulfilled: fulfillment.fulfilled,
      evidence: fulfillment.evidence,
    };
  });

  return {
    total: items.length,
    fulfilledCount: items.filter((item) => item.fulfilled).length,
    missingRequiredCount: items.filter((item) => item.required && !item.fulfilled).length,
    items,
  };
}

function readExecutionRunRequestedOutputPolicySummary(
  requestedOutputSummary:
    | {
        total: number;
        fulfilledCount: number;
        missingRequiredCount: number;
        items: Array<{
          label: string | null;
          kind: string | null;
          format: string | null;
          destination: string | null;
          required: boolean;
          fulfilled: boolean;
          evidence: 'message' | 'artifact' | 'structured-output' | null;
        }>;
      }
    | null,
): {
  status: 'satisfied' | 'missing-required';
  message: string;
  missingRequiredLabels: string[];
} | null {
  if (!requestedOutputSummary) {
    return null;
  }

  const missingRequiredLabels = requestedOutputSummary.items
    .filter((item) => item.required && !item.fulfilled)
    .map((item) => item.label ?? item.kind ?? 'unnamed-output');

  if (missingRequiredLabels.length === 0) {
    return {
      status: 'satisfied',
      message: 'all required requested outputs were fulfilled',
      missingRequiredLabels: [],
    };
  }

  return {
    status: 'missing-required',
    message: `missing required requested outputs: ${missingRequiredLabels.join(', ')}`,
    missingRequiredLabels,
  };
}

function resolveRequestedOutputFulfillment(input: {
  kind: string | null;
  format: string | null;
  destination: string | null;
  hasMessageOutput: boolean;
  hasArtifactOutput: boolean;
  hasStructuredOutput: boolean;
}): {
  fulfilled: boolean;
  evidence: 'message' | 'artifact' | 'structured-output' | null;
} {
  if (input.kind === 'artifact-bundle' || input.destination === 'artifact-store' || input.format === 'bundle') {
    return input.hasArtifactOutput
      ? { fulfilled: true, evidence: 'artifact' }
      : { fulfilled: false, evidence: null };
  }
  if (input.kind === 'structured-report' || input.format === 'json') {
    if (input.hasStructuredOutput) {
      return { fulfilled: true, evidence: 'structured-output' };
    }
    if (input.hasMessageOutput) {
      return { fulfilled: true, evidence: 'message' };
    }
    return { fulfilled: false, evidence: null };
  }
  if (input.hasMessageOutput) {
    return { fulfilled: true, evidence: 'message' };
  }
  if (input.hasArtifactOutput) {
    return { fulfilled: true, evidence: 'artifact' };
  }
  if (input.hasStructuredOutput) {
    return { fulfilled: true, evidence: 'structured-output' };
  }
  return { fulfilled: false, evidence: null };
}

function isInternalStructuredOutputKey(key: string): boolean {
  return (
    key === 'response.output' ||
    key.startsWith('step.localActionOutcomes.') ||
    key.startsWith('human.resume.')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
