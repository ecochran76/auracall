import { randomUUID } from 'node:crypto';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../teams/types.js';
import {
  createTaskRunSpecRecordStore,
  type TaskRunSpecInspectionSummary,
  type TaskRunSpecRecordStore,
  summarizeTaskRunSpecStoredRecord,
} from '../teams/store.js';
import type { ExecutionRunStep } from './types.js';
import {
  createExecutionRequest,
  createExecutionResponseArtifact,
  createExecutionResponseFromRunRecord,
} from './apiModel.js';
import { ExecutionResponseOutputItemSchema } from './apiSchema.js';
import type {
  ExecutionRequest,
  ExecutionResponse,
  ExecutionTransport,
  ExecutionResponseArtifactType,
  ExecutionResponseOutputItem,
} from './apiTypes.js';
import type { ExecutionRuntimeControlContract } from './contract.js';
import { createExecutionRuntimeControl } from './control.js';
import type { ExecutionRunStoredRecord } from './store.js';
import {
  createExecutionRun,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from './model.js';
import type { ExecuteStoredRunStepResult } from './runner.js';
import { createExecutionServiceHost } from './serviceHost.js';
import type { ExecutionServiceHost } from './serviceHost.js';
import type { LocalActionExecutionPolicy } from './localActions.js';
import type { ExecutionRunRecordBundle, ExecutionRunServiceId } from './types.js';

const StructuredResponseOutputSchema = ExecutionResponseOutputItemSchema.array();

export interface ExecutionResponsesServiceDeps {
  control?: ExecutionRuntimeControlContract;
  taskRunSpecStore?: TaskRunSpecRecordStore;
  now?: () => Date;
  generateResponseId?: () => string;
  executionHost?: ExecutionServiceHost;
  drainAfterCreate?: boolean;
  localActionExecutionPolicy?: Partial<LocalActionExecutionPolicy>;
  executeStoredRunStep?: (
    request: ExecutionRequest,
    context: {
      record: ExecutionRunStoredRecord;
      step: ExecutionRunStep;
    },
  ) => Promise<ExecuteStoredRunStepResult | void>;
}

export interface ExecutionResponsesService {
  createResponse(request: ExecutionRequest): Promise<ExecutionResponse>;
  readResponse(responseId: string): Promise<ExecutionResponse | null>;
}

export function createExecutionResponsesService(
  deps: ExecutionResponsesServiceDeps = {},
): ExecutionResponsesService {
  const control = deps.control ?? createExecutionRuntimeControl();
  const taskRunSpecStore = deps.taskRunSpecStore ?? createTaskRunSpecRecordStore();
  const now = deps.now ?? (() => new Date());
  const generateResponseId = deps.generateResponseId ?? (() => `resp_${randomUUID().replace(/-/g, '')}`);
  const drainAfterCreate = deps.drainAfterCreate ?? true;
  const host =
    deps.executionHost ??
    createExecutionServiceHost({
      control,
      now: () => now().toISOString(),
      ownerId: 'host:http-responses',
      localActionExecutionPolicy: deps.localActionExecutionPolicy,
      executeStoredRunStep: async (context) => {
        if (!deps.executeStoredRunStep) return;
        const request = createExecutionRequestFromRecord(context.record);
        return deps.executeStoredRunStep(request, context);
      },
    });

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
      const createdRecord = await control.createRun(bundle);
      if (!drainAfterCreate) {
        return createExecutionResponseForStoredRecord(createdRecord.bundle, taskRunSpecStore);
      }
      const drained = await host.drainRunsOnce({
        runId: responseId,
        maxRuns: 1,
      });
      const executed = drained.drained[0]?.record;
      if (!executed) {
        throw new Error(`Execution response ${responseId} was not drained after creation`);
      }
      return createExecutionResponseForStoredRecord(executed.bundle, taskRunSpecStore);
    },

    async readResponse(responseId) {
      const record = await control.readRun(responseId);
      if (!record) return null;
      return createExecutionResponseForStoredRecord(record.bundle, taskRunSpecStore);
    },
  };
}

export async function createExecutionResponseForStoredRecord(
  bundle: ExecutionRunRecordBundle,
  taskRunSpecStore: TaskRunSpecRecordStore = createTaskRunSpecRecordStore(),
): Promise<ExecutionResponse> {
  const taskRunSpecSummary = await readStoredTaskRunSpecSummary(taskRunSpecStore, bundle.run.taskRunSpecId ?? null);
  return createExecutionResponseFromRunRecord({
    responseId: bundle.run.id,
    runRecord: bundle,
    model: getStoredModel(bundle),
    output: getStoredResponseOutput(bundle),
    runtimeProfile: getStoredRuntimeProfile(bundle),
    service: getStoredService(bundle),
    taskRunSpecSummary,
  });
}

async function readStoredTaskRunSpecSummary(
  store: TaskRunSpecRecordStore,
  taskRunSpecId: string | null,
): Promise<TaskRunSpecInspectionSummary | null> {
  if (!taskRunSpecId) return null;
  const record = await store.readRecord(taskRunSpecId);
  return record ? summarizeTaskRunSpecStoredRecord(record) : null;
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

export function createExecutionRequestFromRecord(record: ExecutionRunStoredRecord): ExecutionRequest {
  const initialInputs = record.bundle.run.initialInputs as Record<string, unknown>;

  const requestInput = initialInputs.requestInput ?? initialInputs.input ?? '';
  const input =
    typeof requestInput === 'string' || Array.isArray(requestInput) ? requestInput : requestInput === '' ? '' : '';

  const request: ExecutionRequest = {
    model:
      typeof initialInputs.model === 'string'
        ? initialInputs.model
        : typeof record.bundle.steps[0]?.input?.prompt === 'string'
          ? record.bundle.steps[0].input.prompt
          : '',
    input,
    metadata: isObject(initialInputs.metadata) ? initialInputs.metadata : {},
  };

  if (typeof initialInputs.instructions === 'string' || initialInputs.instructions === null) {
    request.instructions = initialInputs.instructions;
  }
  if (Array.isArray(initialInputs.tools)) {
    request.tools = initialInputs.tools as ExecutionRequest['tools'];
  }
  if (Array.isArray(initialInputs.attachments)) {
    request.attachments = initialInputs.attachments as ExecutionRequest['attachments'];
  }

  const auracall = normalizeAuracallFromRecord(initialInputs.auracall);
  if (Object.keys(auracall).length > 0) {
    request.auracall = auracall;
  }

  return createExecutionRequest(request);
}

function normalizeAuracallFromRecord(input: unknown): NonNullable<ExecutionRequest['auracall']> {
  const next: NonNullable<ExecutionRequest['auracall']> = {};
  if (!isObject(input)) {
    return next;
  }

  const runtimeProfile = normalizeNullableString(input.runtimeProfile);
  if (runtimeProfile !== null) next.runtimeProfile = runtimeProfile;

  const agent = normalizeNullableString(input.agent);
  if (agent !== null) next.agent = agent;

  const team = normalizeNullableString(input.team);
  if (team !== null) next.team = team;

  const service = normalizeExecutionServiceId(input.service);
  if (service !== null) next.service = service;

  const transport = normalizeExecutionTransport(input.transport);
  if (transport !== null) next.transport = transport;

  return next;
}

function normalizeExecutionTransport(value: unknown): ExecutionTransport | null {
  if (value === 'api' || value === 'browser' || value === 'auto') return value;
  return null;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
