import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import { MODEL_CONFIGS } from '../oracle/config.js';
import { DEFAULT_TEAM_RUN_EXECUTION_POLICY } from '../teams/types.js';
import { getCliVersion } from '../version.js';
import {
  createExecutionRequest,
  createExecutionResponseArtifact,
  createExecutionResponseFromRunRecord,
} from '../runtime/apiModel.js';
import { ExecutionResponseOutputItemSchema } from '../runtime/apiSchema.js';
import type {
  ExecutionRequest,
  ExecutionRequestExtensionHints,
  ExecutionResponse,
  ExecutionResponseArtifactType,
  ExecutionResponseOutputItem,
} from '../runtime/apiTypes.js';
import type { ExecutionRuntimeControlContract } from '../runtime/contract.js';
import { createExecutionRuntimeControl } from '../runtime/control.js';
import {
  createExecutionRun,
  createExecutionRunEvent,
  createExecutionRunRecordBundle,
  createExecutionRunSharedState,
  createExecutionRunStep,
} from '../runtime/model.js';
import type { ExecutionRunRecordBundle, ExecutionRunServiceId } from '../runtime/types.js';

export interface ResponsesHttpServerOptions {
  host?: string;
  port?: number;
  logger?: (message: string) => void;
}

export interface ResponsesHttpServerDeps {
  control?: ExecutionRuntimeControlContract;
  now?: () => Date;
  generateResponseId?: () => string;
}

export interface ResponsesHttpServerInstance {
  port: number;
  close(): Promise<void>;
}

export interface ServeResponsesHttpOptions extends ResponsesHttpServerOptions {
  listenPublic?: boolean;
}

interface HttpErrorPayload {
  error: {
    message: string;
    type: string;
  };
}

interface HttpModelDescriptor {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

interface HttpModelListResponse {
  object: 'list';
  data: HttpModelDescriptor[];
}

interface HttpStatusResponse {
  object: 'status';
  ok: true;
  version: string;
  mode: 'development';
  binding: {
    host: string;
    port: number;
    localOnly: boolean;
    unauthenticated: boolean;
  };
  routes: {
    status: string;
    models: string;
    responsesCreate: string;
    responsesGetTemplate: string;
  };
  compatibility: {
    openai: true;
    chatCompletions: false;
    streaming: false;
    auth: false;
  };
  executionHints: {
    headerNames: string[];
    bodyObject: 'auracall';
  };
}

const StructuredResponseOutputSchema = z.array(ExecutionResponseOutputItemSchema);

export async function createResponsesHttpServer(
  options: ResponsesHttpServerOptions = {},
  deps: ResponsesHttpServerDeps = {},
): Promise<ResponsesHttpServerInstance> {
  const logger = options.logger ?? (() => {});
  const control = deps.control ?? createExecutionRuntimeControl();
  const now = deps.now ?? (() => new Date());
  const generateResponseId =
    deps.generateResponseId ?? (() => `resp_${randomUUID().replace(/-/g, '')}`);
  const boundHost = options.host ?? '127.0.0.1';
  const server = http.createServer();

  server.on('request', async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');

      if (req.method === 'GET' && url.pathname === '/status') {
        const address = server.address();
        const boundPort = address && typeof address !== 'string' ? address.port : options.port ?? 0;
        sendJson(res, 200, createHttpStatusResponse({ host: boundHost, port: boundPort }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/models') {
        sendJson(res, 200, createHttpModelListResponse());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/responses') {
        const body = await readRequestBody(req);
        const parsedBody = JSON.parse(body) as ExecutionRequest;
        const request = createExecutionRequest(mergeExecutionRequestHints(parsedBody, req.headers));
        const response = await createStoredExecutionResponse({ control, request, now, generateResponseId });
        sendJson(res, 200, response);
        return;
      }

      const responseId = matchResponseRoute(url.pathname);
      if (req.method === 'GET' && responseId) {
        const record = await control.readRun(responseId);
        if (!record) {
          sendJson(res, 404, {
            error: {
              message: `Response ${responseId} was not found`,
              type: 'not_found_error',
            },
          } satisfies HttpErrorPayload);
          return;
        }
        sendJson(res, 200, createExecutionResponseForStoredRecord(record.bundle));
        return;
      }

      sendJson(res, 404, {
        error: {
          message: 'Not found',
          type: 'invalid_request_error',
        },
      } satisfies HttpErrorPayload);
    } catch (error) {
      logger(error instanceof Error ? error.message : String(error));
      if (error instanceof SyntaxError || error instanceof ZodError) {
        sendJson(res, 400, {
          error: {
            message: error instanceof Error ? error.message : 'Invalid request body',
            type: 'invalid_request_error',
          },
        } satisfies HttpErrorPayload);
        return;
      }

      sendJson(res, 500, {
        error: {
          message: error instanceof Error ? error.message : 'Internal server error',
          type: 'server_error',
        },
      } satisfies HttpErrorPayload);
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, boundHost, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine server address');
  }

  return {
    port: address.port,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export async function serveResponsesHttp(options: ServeResponsesHttpOptions = {}): Promise<void> {
  assertResponsesHostAllowed(options.host, options.listenPublic ?? false);
  const logger = options.logger ?? console.log;
  const server = await createResponsesHttpServer(options, { now: () => new Date() });
  const host = options.host ?? '127.0.0.1';
  const bindAddress = `${host}:${server.port}`;
  const probeUrl = `http://${localProbeHost(host)}:${server.port}`;
  const localOnly = isLoopbackHost(host);
  logger(`AuraCall responses server bound on ${bindAddress}`);
  if (localOnly) {
    logger('Posture: local development only; bound to loopback and intentionally unauthenticated.');
  } else {
    logger(`Warning: ${host} is not loopback. This server is still unauthenticated and intended for local development only.`);
  }
  logger('Endpoints: GET /status, GET /v1/models, POST /v1/responses, GET /v1/responses/{response_id}');
  logger(`Local probe: curl ${probeUrl}/status`);
  logger('Leave this terminal running; press Ctrl+C to stop auracall api serve.');

  await new Promise<void>((resolve, reject) => {
    const handleSignal = () => {
      void server
        .close()
        .then(resolve)
        .catch(reject);
    };
    process.once('SIGINT', handleSignal);
    process.once('SIGTERM', handleSignal);
  });
}

export function assertResponsesHostAllowed(host: string | undefined, listenPublic: boolean): void {
  if (listenPublic || isLoopbackHost(host ?? '127.0.0.1')) {
    return;
  }
  throw new Error(
    `Refusing to bind responses server to non-loopback host "${host}". Re-run with --listen-public if you really want an unauthenticated development server on a public interface.`,
  );
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

async function createStoredExecutionResponse(input: {
  control: ExecutionRuntimeControlContract;
  request: ExecutionRequest;
  now: () => Date;
  generateResponseId: () => string;
}): Promise<ExecutionResponse> {
  const createdAt = input.now().toISOString();
  const responseId = input.generateResponseId();
  const bundle = createDirectExecutionBundle({
    responseId,
    request: input.request,
    createdAt,
  });
  const stored = await input.control.createRun(bundle);
  return createExecutionResponseForStoredRecord(stored.bundle);
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

function createHttpModelListResponse(): HttpModelListResponse {
  return {
    object: 'list',
    data: Object.entries(MODEL_CONFIGS).map(([id, config]) => ({
      id,
      object: 'model',
      created: 0,
      owned_by: config.provider ?? 'other',
    })),
  };
}

function createHttpStatusResponse(input: { host: string; port: number }): HttpStatusResponse {
  return {
    object: 'status',
    ok: true,
    version: getCliVersion(),
    mode: 'development',
    binding: {
      host: input.host,
      port: input.port,
      localOnly: isLoopbackHost(input.host),
      unauthenticated: true,
    },
    routes: {
      status: '/status',
      models: '/v1/models',
      responsesCreate: '/v1/responses',
      responsesGetTemplate: '/v1/responses/{response_id}',
    },
    compatibility: {
      openai: true,
      chatCompletions: false,
      streaming: false,
      auth: false,
    },
    executionHints: {
      headerNames: [
        'X-AuraCall-Runtime-Profile',
        'X-AuraCall-Agent',
        'X-AuraCall-Team',
        'X-AuraCall-Service',
      ],
      bodyObject: 'auracall',
    },
  };
}

function localProbeHost(host: string): string {
  return isLoopbackHost(host) ? host : '127.0.0.1';
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

function mergeExecutionRequestHints(
  request: ExecutionRequest,
  headers: http.IncomingHttpHeaders,
): ExecutionRequest {
  const headerHints = extractExecutionRequestHintsFromHeaders(headers);
  if (
    !headerHints.runtimeProfile &&
    !headerHints.agent &&
    !headerHints.team &&
    !headerHints.service &&
    !headerHints.transport
  ) {
    return request;
  }

  return {
    ...request,
    auracall: {
      ...(request.auracall ?? {}),
      ...headerHints,
    },
  };
}

function extractExecutionRequestHintsFromHeaders(
  headers: http.IncomingHttpHeaders,
): ExecutionRequestExtensionHints {
  return {
    runtimeProfile: readSingleHeader(headers['x-auracall-runtime-profile']),
    agent: readSingleHeader(headers['x-auracall-agent']),
    team: readSingleHeader(headers['x-auracall-team']),
    service: readSingleHeader(headers['x-auracall-service']),
    transport: normalizeTransportHeader(readSingleHeader(headers['x-auracall-transport'])),
  };
}

function readSingleHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeTransportHeader(value: string | null): ExecutionRequestExtensionHints['transport'] {
  return value === 'api' || value === 'browser' || value === 'auto' ? value : null;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
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

function matchResponseRoute(pathname: string): string | null {
  const match = /^\/v1\/responses\/([^/]+)$/.exec(pathname);
  return match?.[1] ?? null;
}

async function readRequestBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(`${JSON.stringify(payload)}\n`);
}
