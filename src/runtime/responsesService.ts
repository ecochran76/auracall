import { randomUUID } from 'node:crypto';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../teams/types.js';
import {
  createExecutionRequest,
  createExecutionResponseArtifact,
  createExecutionResponseFromRunRecord,
} from './apiModel.js';
import { ExecutionResponseOutputItemSchema } from './apiSchema.js';
import type {
  ExecutionRequest,
  ExecutionResponse,
  ExecutionResponseArtifactType,
  ExecutionResponseOutputItem,
} from './apiTypes.js';
import type { ExecutionRuntimeControlContract } from './contract.js';
import { createExecutionRuntimeControl } from './control.js';
import {
  createExecutionRun,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from './model.js';
import type { ExecuteStoredRunStepResult } from './runner.js';
import { createExecutionServiceHost } from './serviceHost.js';
import type { ExecutionRunRecordBundle, ExecutionRunServiceId } from './types.js';

const StructuredResponseOutputSchema = ExecutionResponseOutputItemSchema.array();

export interface ExecutionResponsesServiceDeps {
  control?: ExecutionRuntimeControlContract;
  now?: () => Date;
  generateResponseId?: () => string;
  executeStoredRunStep?: (request: ExecutionRequest) => Promise<ExecuteStoredRunStepResult | void>;
}

export interface ExecutionResponsesService {
  createResponse(request: ExecutionRequest): Promise<ExecutionResponse>;
  readResponse(responseId: string): Promise<ExecutionResponse | null>;
}

export function createExecutionResponsesService(
  deps: ExecutionResponsesServiceDeps = {},
): ExecutionResponsesService {
  const control = deps.control ?? createExecutionRuntimeControl();
  const now = deps.now ?? (() => new Date());
  const generateResponseId = deps.generateResponseId ?? (() => `resp_${randomUUID().replace(/-/g, '')}`);

  return {
    async createResponse(requestInput) {
      const request = createExecutionRequest(requestInput);
      const createdAt = now().toISOString();
      const responseId = generateResponseId();
      const bundle = createDirectExecutionBundle({
        responseId,
        request,
        createdAt,
      });
      await control.createRun(bundle);
      const host = createExecutionServiceHost({
        control,
        now: () => now().toISOString(),
        ownerId: 'host:http-responses',
        executeStoredRunStep: async () => deps.executeStoredRunStep?.(request),
      });
      const drained = await host.drainRunsOnce({
        runId: responseId,
        maxRuns: 1,
      });
      const executed = drained.drained[0]?.record;
      if (!executed) {
        throw new Error(`Execution response ${responseId} was not drained after creation`);
      }
      return createExecutionResponseForStoredRecord(executed.bundle);
    },

    async readResponse(responseId) {
      const record = await control.readRun(responseId);
      if (!record) return null;
      return createExecutionResponseForStoredRecord(record.bundle);
    },
  };
}

export function createExecutionResponseForStoredRecord(bundle: ExecutionRunRecordBundle): ExecutionResponse {
  return createExecutionResponseFromRunRecord({
    responseId: bundle.run.id,
    runRecord: bundle,
    model: getStoredModel(bundle),
    output: getStoredResponseOutput(bundle),
    runtimeProfile: getStoredRuntimeProfile(bundle),
    service: getStoredService(bundle),
  });
}

function createDirectExecutionBundle(input: {
  responseId: string;
  request: ExecutionRequest;
  createdAt: string;
}): ExecutionRunRecordBundle {
  const sharedStateId = `${input.responseId}:shared-state`;
  const stepId = `${input.responseId}:step:1`;
  const runtimeProfile = input.request.auracall?.runtimeProfile ?? null;
  const service = normalizeExecutionServiceId(input.request.auracall?.service);
  const prompt = normalizeExecutionPrompt(input.request.input);

  const run = createExecutionRun({
    id: input.responseId,
    sourceKind: 'direct',
    sourceId: null,
    status: 'planned',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    trigger: 'api',
    requestedBy: null,
    entryPrompt: prompt,
    initialInputs: {
      model: input.request.model,
      instructions: input.request.instructions ?? null,
      metadata: input.request.metadata ?? {},
      tools: input.request.tools ?? [],
      attachments: input.request.attachments ?? [],
      auracall: input.request.auracall ?? null,
      requestInput: input.request.input,
      runtimeProfile,
      service,
      agent: input.request.auracall?.agent ?? null,
      team: input.request.auracall?.team ?? null,
    },
    sharedStateId,
    stepIds: [stepId],
    policy: DEFAULT_TEAM_RUN_EXECUTION_POLICY,
  });

  const step = createExecutionRunStep({
    id: stepId,
    runId: input.responseId,
    agentId: input.request.auracall?.agent ?? 'api-responses',
    runtimeProfileId: runtimeProfile,
    browserProfileId: null,
    service,
    kind: 'prompt',
    status: 'runnable',
    order: 1,
    dependsOnStepIds: [],
    input: {
      prompt,
      handoffIds: [],
      artifacts: [],
      structuredData: {
        requestInput: input.request.input,
        metadata: input.request.metadata ?? {},
        tools: input.request.tools ?? [],
      },
      notes: input.request.instructions ? [input.request.instructions] : [],
    },
  });

  const events = [
    createExecutionRunEvent({
      id: `${input.responseId}:event:run-created`,
      runId: input.responseId,
      type: 'run-created',
      createdAt: input.createdAt,
      note: 'created from HTTP responses adapter request',
      payload: {
        model: input.request.model,
      },
    }),
    createExecutionRunEvent({
      id: `${input.responseId}:event:${stepId}:runnable`,
      runId: input.responseId,
      stepId,
      type: 'step-runnable',
      createdAt: input.createdAt,
      note: 'initial direct prompt step is runnable',
      payload: {
        order: 1,
      },
    }),
  ];

  const sharedState = createExecutionRunSharedState({
    id: sharedStateId,
    runId: input.responseId,
    status: 'active',
    artifacts: [],
    structuredOutputs: [],
    notes: [],
    history: events,
    lastUpdatedAt: input.createdAt,
  });

  return createExecutionRunRecordBundle({
    run,
    steps: [step],
    sharedState,
    events,
  });
}

function getStoredResponseOutput(bundle: ExecutionRunRecordBundle): ExecutionResponseOutputItem[] {
  const structured = bundle.sharedState.structuredOutputs.find((entry) => entry.key === 'response.output');
  if (structured) {
    const parsed = StructuredResponseOutputSchema.safeParse(structured.value);
    if (parsed.success) return parsed.data;
  }

  return bundle.sharedState.artifacts.map((artifact) =>
    createExecutionResponseArtifact({
      type: 'artifact',
      id: artifact.id,
      artifact_type: normalizeResponseArtifactType(artifact.kind),
      title: artifact.title ?? null,
      mime_type: null,
      uri: artifact.uri ?? artifact.path ?? null,
      disposition: artifact.path ? 'attachment' : 'inline',
      metadata: null,
    }),
  );
}

function getStoredModel(bundle: ExecutionRunRecordBundle): string | null {
  const model = bundle.run.initialInputs.model;
  return typeof model === 'string' ? model : null;
}

function getStoredRuntimeProfile(bundle: ExecutionRunRecordBundle): string | null {
  const runtimeProfile = bundle.run.initialInputs.runtimeProfile;
  if (typeof runtimeProfile === 'string') return runtimeProfile;
  return bundle.steps.find((step) => typeof step.runtimeProfileId === 'string')?.runtimeProfileId ?? null;
}

function getStoredService(bundle: ExecutionRunRecordBundle): ExecutionRunServiceId {
  return (
    normalizeExecutionServiceId(bundle.run.initialInputs.service) ??
    bundle.steps.find((step) => step.service !== null)?.service ??
    null
  );
}

function normalizeExecutionPrompt(input: ExecutionRequest['input']): string {
  if (typeof input === 'string') return input;
  return input.map((message) => `${message.role}: ${message.content}`).join('\n');
}

function normalizeExecutionServiceId(value: unknown): ExecutionRunServiceId {
  return value === 'chatgpt' || value === 'gemini' || value === 'grok' ? value : null;
}

function normalizeResponseArtifactType(kind: string): ExecutionResponseArtifactType {
  switch (kind) {
    case 'file':
    case 'image':
    case 'music':
    case 'video':
    case 'canvas':
    case 'document':
    case 'generated':
      return kind;
    default:
      return 'generated';
  }
}
