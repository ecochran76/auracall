import http from 'node:http';
import { z, ZodError } from 'zod';
import { MODEL_CONFIGS } from '../oracle/config.js';
import { getCliVersion } from '../version.js';
import type {
  ExecutionRequest,
  ExecutionRequestExtensionHints,
  ExecutionResponse,
} from '../runtime/apiTypes.js';
import type { ExecutionRuntimeControlContract } from '../runtime/contract.js';
import { createExecutionRuntimeControl } from '../runtime/control.js';
import { createExecutionRequest } from '../runtime/apiModel.js';
import {
  createExecutionResponsesService,
  createExecutionRequestFromRecord,
  type ExecutionResponsesServiceDeps,
} from '../runtime/responsesService.js';
import {
  createExecutionServiceHost,
  type DrainStoredExecutionRunsUntilIdleResult,
  type ExecutionServiceHost,
} from '../runtime/serviceHost.js';

export interface ResponsesHttpServerOptions {
  host?: string;
  port?: number;
  logger?: (message: string) => void;
  recoverRunsOnStart?: boolean;
  recoverRunsOnStartMaxRuns?: number;
}

export interface ResponsesHttpServerDeps {
  control?: ExecutionRuntimeControlContract;
  now?: () => Date;
  generateResponseId?: () => string;
  executeStoredRunStep?: ExecutionResponsesServiceDeps['executeStoredRunStep'];
  executionHost?: ExecutionServiceHost;
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

export async function createResponsesHttpServer(
  options: ResponsesHttpServerOptions = {},
  deps: ResponsesHttpServerDeps = {},
): Promise<ResponsesHttpServerInstance> {
  const logger = options.logger ?? (() => {});
  const control = deps.control ?? createExecutionRuntimeControl();
  const now = deps.now ?? (() => new Date());
  const boundHost = options.host ?? '127.0.0.1';
  const recoverRunsOnStart = options.recoverRunsOnStart ?? false;
  const recoverRunsOnStartMaxRuns = options.recoverRunsOnStartMaxRuns ?? 100;
  const host =
    deps.executionHost ??
    createExecutionServiceHost({
      control,
      now: () => now().toISOString(),
      ownerId: 'host:http-responses',
      executeStoredRunStep: deps.executeStoredRunStep
        ? async (context) => {
            const request = createExecutionRequestFromRecord(context.record);
            return deps.executeStoredRunStep?.(request, context);
          }
        : undefined,
    });
  const responsesService = createExecutionResponsesService({
    control,
    now,
    generateResponseId: deps.generateResponseId,
    executionHost: host,
    executeStoredRunStep: deps.executeStoredRunStep,
  });
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
        const response = await responsesService.createResponse(request);
        sendJson(res, 200, response);
        return;
      }

      const responseId = matchResponseRoute(url.pathname);
      if (req.method === 'GET' && responseId) {
        const response = await responsesService.readResponse(responseId);
        if (!response) {
          sendJson(res, 404, {
            error: {
              message: `Response ${responseId} was not found`,
              type: 'not_found_error',
            },
          } satisfies HttpErrorPayload);
          return;
        }
        sendJson(res, 200, response);
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

  if (recoverRunsOnStart) {
    const recoveryResult = await host.drainRunsUntilIdle({
      sourceKind: 'direct',
      maxRuns: recoverRunsOnStartMaxRuns,
    });
    logger(
      createStartupRecoveryLog(recoveryResult, {
        sourceKind: 'direct',
        maxRuns: recoverRunsOnStartMaxRuns,
      }),
    );
  }

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
  const { listenPublic: _unusedListenPublic, ...serverOptions } = options;
  const server = await createResponsesHttpServer(
    {
      ...serverOptions,
      recoverRunsOnStart: true,
    },
    {
      now: () => new Date(),
    },
  );
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

function createStartupRecoveryLog(
  result: DrainStoredExecutionRunsUntilIdleResult,
  options: { sourceKind: string; maxRuns: number },
): string {
  const skipCounts: Record<string, number> = {};
  for (const entry of result.drained) {
    if (entry.result === 'skipped' && entry.reason) {
      skipCounts[entry.reason] = (skipCounts[entry.reason] ?? 0) + 1;
    }
  }

  const skipSummary = Object.entries(skipCounts)
    .map(([reason, count]) => `${reason}:${count}`)
    .join(', ');

  const parts: string[] = [
    `Startup recovery (${options.sourceKind}) completed in ${result.iterations} iteration(s).`,
    `scanned ${result.drained.length} candidate run(s),`,
    `${result.executedRunIds.length} executed,`,
    `${result.expiredLeaseRunIds.length} expired lease(s) reclaimed.`,
  ];

  if (skipSummary.length > 0) {
    parts.push(`skips=${skipSummary}`);
  }

  if (result.executedRunIds.length > 0) {
    parts.push(`executed=${result.executedRunIds.slice(0, 5).join(',')}`);
  }

  if (result.drained.length > options.maxRuns) {
    parts.push(`cap=${options.maxRuns} hits reached`);
  }

  return parts.join(' ');
}

function localProbeHost(host: string): string {
  return isLoopbackHost(host) ? host : '127.0.0.1';
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
    !headerHints.service
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
  };
}

function readSingleHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
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
