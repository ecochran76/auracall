import http from 'node:http';
import { z, ZodError } from 'zod';
import { MODEL_CONFIGS } from '../oracle/config.js';
import { getCliVersion } from '../version.js';
import { loadUserConfig } from '../config.js';
import { resolveConfig } from '../schema/resolver.js';
import { resolveHostLocalActionExecutionPolicy } from '../config/model.js';
import {
  inspectTeamRunLinkage,
  TeamRunInspectionError,
  type TeamRunInspectionPayload,
} from '../teams/inspection.js';
import type {
  ExecutionRequest,
  ExecutionRequestExtensionHints,
  ExecutionResponse,
} from '../runtime/apiTypes.js';
import {
  inspectRuntimeRun,
  type RuntimeRunInspectionServiceStateProbeResult,
  type ProbeRuntimeRunServiceStateInput,
  RuntimeRunInspectionError,
  type RuntimeRunInspectionPayload,
} from '../runtime/inspection.js';
import type { ExecutionRuntimeControlContract } from '../runtime/contract.js';
import { createExecutionRuntimeControl } from '../runtime/control.js';
import { createConfiguredExecutionRunAffinity } from '../runtime/configuredAffinity.js';
import {
  createLocalRunnerCapabilitySummary,
  createLocalRunnerEligibilityNote,
} from '../runtime/localRunnerCapabilities.js';
import { createExecutionRequest } from '../runtime/apiModel.js';
import {
  createExecutionResponsesService,
  createExecutionRequestFromRecord,
  type ExecutionResponsesServiceDeps,
} from '../runtime/responsesService.js';
import { createConfiguredStoredStepExecutor } from '../runtime/configuredExecutor.js';
import { createExecutionRunnerRecord } from '../runtime/model.js';
import { readLiveRuntimeRunServiceState } from '../runtime/liveServiceStateRegistry.js';
import {
  createExecutionRunnerControl,
  type ExecutionRunnerControlContract,
} from '../runtime/runnersControl.js';
import {
  createExecutionServiceHost,
  type ExecutionServiceHostCancelActionResult,
  type ExecutionServiceHostDrainActionResult,
  type ExecutionServiceHostLocalActionResolveResult,
  type ExecutionServiceHostResumeHumanEscalationResult,
  type ExecutionServiceHostRecoveryDetail,
  type ExecutionServiceHostRecoverySummary,
  type ExecutionServiceHostLocalClaimSummary,
  type ExecutionServiceHostStaleHeartbeatActionResult,
  type DrainStoredExecutionRunsUntilIdleResult,
  type ExecutionServiceHost,
  type ExecutionServiceHostDeps,
} from '../runtime/serviceHost.js';
import type { ExecutionRunSourceKind, ExecutionRunnerStatus } from '../runtime/types.js';
import {
  probeChatgptBrowserServiceState,
  probeGeminiBrowserServiceState,
  probeGrokBrowserServiceState,
} from '../browser/liveServiceState.js';

export interface ResponsesHttpServerOptions {
  host?: string;
  port?: number;
  logger?: (message: string) => void;
  recoverRunsOnStart?: boolean;
  recoverRunsOnStartMaxRuns?: number;
  recoverRunsOnStartSourceKind?: ExecutionRunSourceKind | 'all';
  backgroundDrainIntervalMs?: number;
}

export interface ResponsesHttpServerDeps {
  control?: ExecutionRuntimeControlContract;
  runnersControl?: ExecutionRunnerControlContract;
  config?: Record<string, unknown>;
  now?: () => Date;
  generateResponseId?: () => string;
  executeStoredRunStep?: ExecutionResponsesServiceDeps['executeStoredRunStep'];
  executionHost?: ExecutionServiceHost;
  localActionExecutionPolicy?: ExecutionServiceHostDeps['localActionExecutionPolicy'];
  probeRuntimeRunServiceState?: (
    input: ProbeRuntimeRunServiceStateInput,
  ) => Promise<RuntimeRunInspectionServiceStateProbeResult | null>;
}

export interface ResponsesHttpServerInstance {
  port: number;
  close(): Promise<void>;
}

interface ServerOwnedDrainOptions {
  runId?: string;
  sourceKind?: ExecutionRunSourceKind;
  maxRuns?: number;
}

export interface ServeResponsesHttpOptions extends ResponsesHttpServerOptions {
  listenPublic?: boolean;
  executeStoredRunStep?: ResponsesHttpServerDeps['executeStoredRunStep'];
  probeRuntimeRunServiceState?: ResponsesHttpServerDeps['probeRuntimeRunServiceState'];
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

interface HttpRecoveryDetailResponse {
  object: 'recovery_detail';
  detail: ExecutionServiceHostRecoveryDetail;
}

interface HttpTeamRunInspectionResponse {
  object: 'team_run_inspection';
  inspection: TeamRunInspectionPayload;
}

interface HttpRuntimeRunInspectionResponse {
  object: 'runtime_run_inspection';
  inspection: RuntimeRunInspectionPayload;
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
    recoveryDetailTemplate: string;
    teamRunInspection: string;
    runtimeRunInspection: string;
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
  recoverySummary?: ExecutionServiceHostRecoverySummary;
  localClaimSummary?: ExecutionServiceHostLocalClaimSummary;
  runner: {
    id: string | null;
    hostId: string | null;
    status: ExecutionRunnerStatus | 'inactive' | 'registering';
    lastHeartbeatAt: string | null;
    expiresAt: string | null;
    lastActivityAt: string | null;
    lastClaimedRunId: string | null;
  };
  backgroundDrain: {
    enabled: boolean;
    intervalMs: number | null;
    state: 'disabled' | 'idle' | 'scheduled' | 'running' | 'paused';
    paused: boolean;
    lastTrigger: 'startup-recovery' | 'request-create' | 'background-timer' | null;
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
  };
  executionHints: {
    headerNames: string[];
    bodyObject: 'auracall';
  };
  controlResult?:
    | {
        kind: 'background-drain';
        action: 'pause' | 'resume';
      }
    | ({
        kind: 'local-action-control';
      } & ExecutionServiceHostLocalActionResolveResult)
    | ({
        kind: 'run-control';
      } & (
        | ExecutionServiceHostCancelActionResult
        | ExecutionServiceHostResumeHumanEscalationResult
        | ExecutionServiceHostDrainActionResult
      ))
    | ({
        kind: 'lease-repair';
      } & ExecutionServiceHostStaleHeartbeatActionResult);
}

export async function createResponsesHttpServer(
  options: ResponsesHttpServerOptions = {},
  deps: ResponsesHttpServerDeps = {},
): Promise<ResponsesHttpServerInstance> {
  const logger = options.logger ?? (() => {});
  const control = deps.control ?? createExecutionRuntimeControl();
  const runnersControl = deps.runnersControl ?? createExecutionRunnerControl();
  const now = deps.now ?? (() => new Date());
  const boundHost = options.host ?? '127.0.0.1';
  const recoverRunsOnStart = options.recoverRunsOnStart ?? false;
  const recoverRunsOnStartMaxRuns = options.recoverRunsOnStartMaxRuns ?? 100;
  const recoverRunsOnStartSourceKind = options.recoverRunsOnStartSourceKind ?? 'direct';
  const backgroundDrainIntervalMs = Math.max(0, options.backgroundDrainIntervalMs ?? 0);
  const configuredRuntimeConfig = deps.config;
  const localRunnerCapabilitySummary = createLocalRunnerCapabilitySummary(configuredRuntimeConfig);
  const createRunAffinity = configuredRuntimeConfig
    ? (inspection: Parameters<typeof createConfiguredExecutionRunAffinity>[1]) =>
        createConfiguredExecutionRunAffinity(configuredRuntimeConfig, inspection)
    : undefined;
  const runnerHeartbeatIntervalMs = 5_000;
  const runnerHeartbeatTtlMs = 15_000;
  let host: ExecutionServiceHost;
  let responsesService: ReturnType<typeof createExecutionResponsesService>;
  let drainQueue = Promise.resolve<DrainStoredExecutionRunsUntilIdleResult | null>(null);
  const runnerState: HttpStatusResponse['runner'] = {
    id: null,
    hostId: null,
    status: 'inactive',
    lastHeartbeatAt: null,
    expiresAt: null,
    lastActivityAt: null,
    lastClaimedRunId: null,
  };
  const backgroundDrainState: HttpStatusResponse['backgroundDrain'] = {
    enabled: backgroundDrainIntervalMs > 0,
    intervalMs: backgroundDrainIntervalMs > 0 ? backgroundDrainIntervalMs : null,
    state: backgroundDrainIntervalMs > 0 ? 'idle' : 'disabled',
    paused: false,
    lastTrigger: null,
    lastStartedAt: null,
    lastCompletedAt: null,
  };
  let backgroundDrainPaused = false;
  let runnerHeartbeatTimer: NodeJS.Timeout | null = null;
  let closed = false;
  const drainThroughServerHost = (
    drainOptions: ServerOwnedDrainOptions & { trigger?: HttpStatusResponse['backgroundDrain']['lastTrigger'] } = {},
  ) => {
    if (backgroundDrainState.state !== 'disabled') {
      backgroundDrainState.state = 'scheduled';
    }
    const nextDrain = drainQueue.catch(() => null).then(async () => {
      if (backgroundDrainState.state !== 'disabled') {
        backgroundDrainState.state = 'running';
        backgroundDrainState.lastTrigger = drainOptions.trigger ?? null;
        backgroundDrainState.lastStartedAt = now().toISOString();
      }
      try {
        return await host.drainRunsUntilIdle({
          runId: drainOptions.runId,
          sourceKind: drainOptions.sourceKind,
          maxRuns: drainOptions.maxRuns,
        });
      } finally {
        if (backgroundDrainState.state !== 'disabled') {
          backgroundDrainState.state = closed ? 'disabled' : backgroundDrainPaused ? 'paused' : 'idle';
          backgroundDrainState.lastCompletedAt = now().toISOString();
        }
      }
    });
    drainQueue = nextDrain.then((result) => result, () => null);
    return nextDrain;
  };
  let backgroundDrainTimer: NodeJS.Timeout | null = null;
  let backgroundDrainScheduled = false;
  const scheduleBackgroundDrain = (delayMs = backgroundDrainIntervalMs) => {
    if (closed || backgroundDrainIntervalMs <= 0 || backgroundDrainPaused || backgroundDrainScheduled) {
      if (closed || backgroundDrainIntervalMs <= 0 || backgroundDrainPaused) {
        return;
      }
      if (backgroundDrainScheduled && delayMs === 0 && backgroundDrainTimer) {
        clearTimeout(backgroundDrainTimer);
        backgroundDrainTimer = null;
        backgroundDrainScheduled = false;
      } else {
        return;
      }
    }
    backgroundDrainScheduled = true;
    backgroundDrainTimer = setTimeout(async () => {
      backgroundDrainScheduled = false;
      backgroundDrainTimer = null;
      if (closed) {
        return;
      }
      await drainThroughServerHost({
        maxRuns: 1,
        trigger: 'background-timer',
      }).catch((error) => {
        logger(error instanceof Error ? error.message : String(error));
        return null;
      });
      scheduleBackgroundDrain(backgroundDrainIntervalMs);
    }, delayMs);
  };
  const server = http.createServer();

  server.on('request', async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');

      if (req.method === 'GET' && url.pathname === '/status') {
        const statusQuery = parseStatusQuery(url.searchParams);
        await syncRunnerStateFromStore();
        const address = server.address();
        const boundPort = address && typeof address !== 'string' ? address.port : options.port ?? 0;
        const statusSourceKind = statusQuery.sourceKindSummary === 'all'
          ? undefined
          : statusQuery.sourceKindSummary ?? 'direct';
        const statusResponseRecoverySummary = statusQuery.recovery
          ? await host.summarizeRecoveryState({
              sourceKind: statusSourceKind,
            })
          : undefined;
        const statusResponseLocalClaimSummary = await host.summarizeLocalClaimState({
          sourceKind: 'direct',
        });
        const statusResponse = await createHttpStatusResponse({
          host: boundHost,
          port: boundPort,
          recoverySummary: statusResponseRecoverySummary,
          localClaimSummary: statusResponseLocalClaimSummary,
          runner: runnerState,
          backgroundDrain: backgroundDrainState,
        });
        sendJson(res, 200, statusResponse);
        return;
      }

      const recoveryDetailRunId = matchStatusRecoveryDetailRoute(url.pathname);
      if (req.method === 'GET' && recoveryDetailRunId) {
        const detail = await host.readRecoveryDetail(recoveryDetailRunId);
        if (!detail) {
          sendJson(res, 404, {
            error: {
              message: `Recovery detail for run ${recoveryDetailRunId} was not found`,
              type: 'not_found_error',
            },
          } satisfies HttpErrorPayload);
          return;
        }
        sendJson(res, 200, {
          object: 'recovery_detail',
          detail,
        } satisfies HttpRecoveryDetailResponse);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/team-runs/inspect') {
        try {
          const inspection = await inspectTeamRunLinkage({
            taskRunSpecId: url.searchParams.get('taskRunSpecId'),
            teamRunId: url.searchParams.get('teamRunId'),
            runtimeRunId: url.searchParams.get('runtimeRunId'),
            control,
          });
          sendJson(res, 200, {
            object: 'team_run_inspection',
            inspection,
          } satisfies HttpTeamRunInspectionResponse);
          return;
        } catch (error) {
          if (error instanceof TeamRunInspectionError) {
            sendJson(res, error.status === 'not-found' ? 404 : 400, {
              error: {
                message: error.message,
                type: error.status === 'not-found' ? 'not_found_error' : 'invalid_request_error',
              },
            } satisfies HttpErrorPayload);
            return;
          }
          throw error;
        }
      }

      if (req.method === 'GET' && url.pathname === '/v1/runtime-runs/inspect') {
        try {
          const runtimeInspectQuery = parseRuntimeInspectionQuery(url.searchParams);
          const inspection = await inspectRuntimeRun({
            runId: url.searchParams.get('runId'),
            runtimeRunId: url.searchParams.get('runtimeRunId'),
            teamRunId: url.searchParams.get('teamRunId'),
            taskRunSpecId: url.searchParams.get('taskRunSpecId'),
            runnerId: url.searchParams.get('runnerId'),
            includeServiceState: runtimeInspectQuery.probe === 'service-state',
            probeServiceState: deps.probeRuntimeRunServiceState,
            control,
            runnersControl,
            createRunAffinity,
          });
          sendJson(res, 200, {
            object: 'runtime_run_inspection',
            inspection,
          } satisfies HttpRuntimeRunInspectionResponse);
          return;
        } catch (error) {
          if (error instanceof RuntimeRunInspectionError) {
            sendJson(res, error.status === 'not-found' ? 404 : 400, {
              error: {
                message: error.message,
                type: error.status === 'not-found' ? 'not_found_error' : 'invalid_request_error',
              },
            } satisfies HttpErrorPayload);
            return;
          }
          throw error;
        }
      }

      if (req.method === 'POST' && url.pathname === '/status') {
        const body = await readRequestBody(req);
        const payload = StatusControlRequestSchema.parse(JSON.parse(body || '{}'));
        let controlResult: HttpStatusResponse['controlResult'];
        if ('backgroundDrain' in payload) {
          const action = payload.backgroundDrain.action;
          if (backgroundDrainIntervalMs <= 0) {
            sendJson(res, 409, {
              error: {
                message: 'background drain is not enabled for this server',
                type: 'invalid_request_error',
              },
            } satisfies HttpErrorPayload);
            return;
          }
          if (action === 'pause') {
            backgroundDrainPaused = true;
            backgroundDrainState.paused = true;
            if (backgroundDrainTimer) {
              clearTimeout(backgroundDrainTimer);
              backgroundDrainTimer = null;
            }
            backgroundDrainScheduled = false;
            if (backgroundDrainState.state !== 'running') {
              backgroundDrainState.state = 'paused';
            }
          } else {
            backgroundDrainPaused = false;
            backgroundDrainState.paused = false;
            if (backgroundDrainState.state !== 'running') {
              backgroundDrainState.state = 'idle';
            }
            scheduleBackgroundDrain(0);
          }
          controlResult = {
            kind: 'background-drain',
            action,
          };
        } else {
          if ('leaseRepair' in payload) {
            const result = await host.repairStaleHeartbeatLease(payload.leaseRepair.runId);
            if (result.status !== 'repaired') {
              sendJson(res, result.status === 'not-found' ? 404 : 409, {
                error: {
                  message: result.reason,
                  type: result.status === 'not-found' ? 'not_found_error' : 'invalid_request_error',
                },
              } satisfies HttpErrorPayload);
              return;
            }
            controlResult = {
              kind: 'lease-repair',
              ...result,
            };
          } else if ('localActionControl' in payload) {
            const result = await host.resolveLocalActionRequest(
              payload.localActionControl.runId,
              payload.localActionControl.requestId,
              payload.localActionControl.resolution,
              payload.localActionControl.note ?? null,
            );
            if (result.status !== 'resolved') {
              sendJson(res, result.status === 'not-found' ? 404 : 409, {
                error: {
                  message: result.reason,
                  type: result.status === 'not-found' ? 'not_found_error' : 'invalid_request_error',
                },
              } satisfies HttpErrorPayload);
              return;
            }
            controlResult = {
              kind: 'local-action-control',
              ...result,
            };
          } else {
            const result =
              payload.runControl.action === 'resume-human-escalation'
                ? await host.resumeHumanEscalation(payload.runControl.runId, {
                    note: payload.runControl.note ?? null,
                    guidance: payload.runControl.guidance ?? null,
                    override: payload.runControl.override ?? null,
                  })
                : payload.runControl.action === 'drain-run'
                  ? await host.drainRun(payload.runControl.runId)
                : await host.cancelOwnedRun(payload.runControl.runId, payload.runControl.note ?? null);
            if (
              !(
                (result.action === 'cancel-run' && result.status === 'cancelled') ||
                (result.action === 'resume-human-escalation' && result.status === 'resumed') ||
                (result.action === 'drain-run' && result.status === 'executed')
              )
            ) {
              sendJson(res, result.status === 'not-found' ? 404 : 409, {
                error: {
                  message: result.reason,
                  type: result.status === 'not-found' ? 'not_found_error' : 'invalid_request_error',
                },
              } satisfies HttpErrorPayload);
              return;
            }
            controlResult = {
              kind: 'run-control',
              ...result,
            };
          }
        }
        const address = server.address();
        const boundPort = address && typeof address !== 'string' ? address.port : options.port ?? 0;
        await syncRunnerStateFromStore();
        const statusResponse = await createHttpStatusResponse({
          host: boundHost,
          port: boundPort,
          localClaimSummary: await host.summarizeLocalClaimState({ sourceKind: 'direct' }),
          runner: runnerState,
          backgroundDrain: backgroundDrainState,
          controlResult,
        });
        sendJson(res, 200, statusResponse);
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
        const createdResponse = await responsesService.createResponse(request);
        if (backgroundDrainIntervalMs > 0) {
          scheduleBackgroundDrain(0);
          sendJson(res, 200, createdResponse);
        } else {
          await drainThroughServerHost({
            runId: createdResponse.id,
            maxRuns: 1,
            trigger: 'request-create',
          });
          const drainedResponse = await responsesService.readResponse(createdResponse.id);
          sendJson(res, 200, drainedResponse ?? createdResponse);
        }
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

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine server address');
  }

  const localRunnerId = `runner:http-responses:${boundHost}:${address.port}`;
  const localRunnerHostId = `host:http-responses:${boundHost}:${address.port}`;
  const updateRunnerState = (
    runner: {
      id: string;
      hostId: string;
      status: HttpStatusResponse['runner']['status'];
      lastHeartbeatAt: string;
      expiresAt: string;
      lastActivityAt: string | null;
      lastClaimedRunId: string | null;
    },
  ) => {
    runnerState.id = runner.id;
    runnerState.hostId = runner.hostId;
    runnerState.status = runner.status;
    runnerState.lastHeartbeatAt = runner.lastHeartbeatAt;
    runnerState.expiresAt = runner.expiresAt;
    runnerState.lastActivityAt = runner.lastActivityAt;
    runnerState.lastClaimedRunId = runner.lastClaimedRunId;
  };
  const syncRunnerStateFromStore = async () => {
    if (!runnerState.id) return;
    const storedRunner = await runnersControl.readRunner(runnerState.id);
    if (!storedRunner) return;
    updateRunnerState({
      id: storedRunner.runner.id,
      hostId: storedRunner.runner.hostId,
      status: storedRunner.runner.status,
      lastHeartbeatAt: storedRunner.runner.lastHeartbeatAt,
      expiresAt: storedRunner.runner.expiresAt,
      lastActivityAt: storedRunner.runner.lastActivityAt,
      lastClaimedRunId: storedRunner.runner.lastClaimedRunId,
    });
  };
  const registerLocalRunner = async () => {
    const heartbeatAt = now().toISOString();
    const expiresAt = new Date(now().getTime() + runnerHeartbeatTtlMs).toISOString();
    runnerState.id = localRunnerId;
    runnerState.hostId = localRunnerHostId;
    runnerState.status = 'registering';
    runnerState.lastHeartbeatAt = heartbeatAt;
    runnerState.expiresAt = expiresAt;
    const existingRunner = await runnersControl.readRunner(localRunnerId);
    if (existingRunner) {
      const heartbeatedRunner = await runnersControl.heartbeatRunner({
        runnerId: localRunnerId,
        heartbeatAt,
        expiresAt,
        eligibilityNote: createLocalRunnerEligibilityNote({
          phase: 'register',
          baseLabel: 'api serve local runner',
          heartbeatLabel: 'api serve runner heartbeat',
          shutdownLabel: 'api serve shutdown',
          capabilitySummary: localRunnerCapabilitySummary,
        }),
      });
      updateRunnerState({
        id: heartbeatedRunner.runner.id,
        hostId: heartbeatedRunner.runner.hostId,
        status: heartbeatedRunner.runner.status,
        lastHeartbeatAt: heartbeatedRunner.runner.lastHeartbeatAt,
        expiresAt: heartbeatedRunner.runner.expiresAt,
        lastActivityAt: heartbeatedRunner.runner.lastActivityAt,
        lastClaimedRunId: heartbeatedRunner.runner.lastClaimedRunId,
      });
    } else {
      const registeredRunner = await runnersControl.registerRunner({
        runner: createExecutionRunnerRecord({
          id: localRunnerId,
          hostId: localRunnerHostId,
          startedAt: heartbeatAt,
          lastHeartbeatAt: heartbeatAt,
          expiresAt,
          serviceIds: localRunnerCapabilitySummary.serviceIds,
          runtimeProfileIds: localRunnerCapabilitySummary.runtimeProfileIds,
          browserProfileIds: localRunnerCapabilitySummary.browserProfileIds,
          serviceAccountIds: localRunnerCapabilitySummary.serviceAccountIds,
          browserCapable: localRunnerCapabilitySummary.browserCapable,
          eligibilityNote: createLocalRunnerEligibilityNote({
            phase: 'register',
            baseLabel: 'api serve local runner',
            heartbeatLabel: 'api serve runner heartbeat',
            shutdownLabel: 'api serve shutdown',
            capabilitySummary: localRunnerCapabilitySummary,
          }),
        }),
      });
      updateRunnerState({
        id: registeredRunner.runner.id,
        hostId: registeredRunner.runner.hostId,
        status: registeredRunner.runner.status,
        lastHeartbeatAt: registeredRunner.runner.lastHeartbeatAt,
        expiresAt: registeredRunner.runner.expiresAt,
        lastActivityAt: registeredRunner.runner.lastActivityAt,
        lastClaimedRunId: registeredRunner.runner.lastClaimedRunId,
      });
    }
  };
  const heartbeatLocalRunner = async () => {
    if (closed || !runnerState.id) return;
    const heartbeatAt = now().toISOString();
    const expiresAt = new Date(now().getTime() + runnerHeartbeatTtlMs).toISOString();
    const heartbeatedRunner = await runnersControl.heartbeatRunner({
      runnerId: localRunnerId,
      heartbeatAt,
      expiresAt,
      eligibilityNote: createLocalRunnerEligibilityNote({
        phase: 'heartbeat',
        baseLabel: 'api serve local runner',
        heartbeatLabel: 'api serve runner heartbeat',
        shutdownLabel: 'api serve shutdown',
        capabilitySummary: localRunnerCapabilitySummary,
      }),
    });
    updateRunnerState({
      id: heartbeatedRunner.runner.id,
      hostId: heartbeatedRunner.runner.hostId,
      status: heartbeatedRunner.runner.status,
      lastHeartbeatAt: heartbeatedRunner.runner.lastHeartbeatAt,
      expiresAt: heartbeatedRunner.runner.expiresAt,
      lastActivityAt: heartbeatedRunner.runner.lastActivityAt,
      lastClaimedRunId: heartbeatedRunner.runner.lastClaimedRunId,
    });
  };
  const scheduleRunnerHeartbeat = () => {
    if (closed) return;
    runnerHeartbeatTimer = setTimeout(async () => {
      runnerHeartbeatTimer = null;
      try {
        await heartbeatLocalRunner();
      } catch (error) {
        logger(error instanceof Error ? error.message : String(error));
      } finally {
        scheduleRunnerHeartbeat();
      }
    }, runnerHeartbeatIntervalMs);
  };

  host =
    deps.executionHost ??
    createExecutionServiceHost({
      control,
      runnersControl,
      now: () => now().toISOString(),
      ownerId: localRunnerId,
      runnerId: localRunnerId,
      localActionExecutionPolicy: deps.localActionExecutionPolicy,
      createRunAffinity,
      executeStoredRunStep: deps.executeStoredRunStep
        ? async (context) => {
            const request = createExecutionRequestFromRecord(context.record);
            return deps.executeStoredRunStep?.(request, context);
          }
        : undefined,
    });
  responsesService = createExecutionResponsesService({
    control,
    now,
    generateResponseId: deps.generateResponseId,
    executionHost: host,
    drainAfterCreate: false,
    executeStoredRunStep: deps.executeStoredRunStep,
  });

  if (!deps.executionHost) {
    await registerLocalRunner();
    scheduleRunnerHeartbeat();
  }

  if (recoverRunsOnStart) {
    const sourceKind = recoverRunsOnStartSourceKind === 'all' ? undefined : recoverRunsOnStartSourceKind;
    const recoveryResult = await drainThroughServerHost({
      sourceKind,
      maxRuns: recoverRunsOnStartMaxRuns,
      trigger: 'startup-recovery',
    });
    const recoverySummary = await host.summarizeRecoveryState({
      sourceKind,
    });
    logger(
      createStartupRecoveryLog(recoveryResult, {
        sourceKind: recoverRunsOnStartSourceKind,
        maxRuns: recoverRunsOnStartMaxRuns,
        staleHeartbeatInspectOnlyCount:
          recoverySummary.attention.metrics.staleHeartbeatInspectOnlyCount,
        suspiciouslyIdleCount: recoverySummary.activeLeaseHealth.metrics.suspiciousIdleCount,
      }),
    );
  }
  scheduleBackgroundDrain();

  return {
    port: address.port,
    async close() {
      closed = true;
      if (runnerHeartbeatTimer) {
        clearTimeout(runnerHeartbeatTimer);
        runnerHeartbeatTimer = null;
      }
      if (backgroundDrainTimer) {
        clearTimeout(backgroundDrainTimer);
        backgroundDrainTimer = null;
      }
      backgroundDrainPaused = false;
      backgroundDrainState.paused = false;
      backgroundDrainState.state = 'disabled';
      await drainQueue.catch(() => null);
      if (!deps.executionHost && runnerState.id) {
        const staleAt = now().toISOString();
        const staleRunner = await runnersControl.markRunnerStale({
          runnerId: localRunnerId,
          staleAt,
          eligibilityNote: createLocalRunnerEligibilityNote({
            phase: 'shutdown',
            baseLabel: 'api serve local runner',
            heartbeatLabel: 'api serve runner heartbeat',
            shutdownLabel: 'api serve shutdown',
            capabilitySummary: localRunnerCapabilitySummary,
          }),
        });
        updateRunnerState({
          id: staleRunner.runner.id,
          hostId: staleRunner.runner.hostId,
          status: staleRunner.runner.status,
          lastHeartbeatAt: staleRunner.runner.lastHeartbeatAt,
          expiresAt: staleRunner.runner.expiresAt,
          lastActivityAt: staleRunner.runner.lastActivityAt,
          lastClaimedRunId: staleRunner.runner.lastClaimedRunId,
        });
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export async function serveResponsesHttp(options: ServeResponsesHttpOptions = {}): Promise<void> {
  assertResponsesHostAllowed(options.host, options.listenPublic ?? false);
  const logger = options.logger ?? console.log;
  const {
    listenPublic: _unusedListenPublic,
    executeStoredRunStep: overrideExecuteStoredRunStep,
    probeRuntimeRunServiceState: overrideProbeRuntimeRunServiceState,
    ...serverOptions
  } = options;
  const loadedConfig = await loadUserConfig(process.cwd());
  const configuredStoredStepExecutor = createConfiguredStoredStepExecutor(
    loadedConfig.config as Record<string, unknown>,
  );
  if (!configuredStoredStepExecutor) {
    throw new Error('Configured stored-step executor was not created for api serve.');
  }
  const server = await createResponsesHttpServer(
    {
      ...serverOptions,
      recoverRunsOnStart: serverOptions.recoverRunsOnStart ?? true,
      recoverRunsOnStartSourceKind: serverOptions.recoverRunsOnStartSourceKind,
      backgroundDrainIntervalMs: serverOptions.backgroundDrainIntervalMs ?? 250,
    },
    {
      config: loadedConfig.config as Record<string, unknown>,
      now: () => new Date(),
      localActionExecutionPolicy: resolveHostLocalActionExecutionPolicy(
        loadedConfig.config as Record<string, unknown>,
      ),
      executeStoredRunStep:
        overrideExecuteStoredRunStep ??
        (async (_request, context) => configuredStoredStepExecutor(context)),
      probeRuntimeRunServiceState:
        overrideProbeRuntimeRunServiceState ?? createDefaultRuntimeRunServiceStateProbe(),
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
  logger(
    'Endpoints: GET /status, GET /status/recovery/{run_id}, GET /v1/team-runs/inspect, GET /v1/runtime-runs/inspect, GET /v1/models, POST /v1/responses, GET /v1/responses/{response_id}',
  );
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

type DefaultRuntimeRunServiceStateProbeDeps = {
  resolveConfigImpl?: typeof resolveConfig;
  probeChatgptBrowserServiceStateImpl?: typeof probeChatgptBrowserServiceState;
  probeGeminiBrowserServiceStateImpl?: typeof probeGeminiBrowserServiceState;
  probeGrokBrowserServiceStateImpl?: typeof probeGrokBrowserServiceState;
  readLiveRuntimeRunServiceStateImpl?: typeof readLiveRuntimeRunServiceState;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export function createDefaultRuntimeRunServiceStateProbe(
  deps: DefaultRuntimeRunServiceStateProbeDeps = {},
): ResponsesHttpServerDeps['probeRuntimeRunServiceState'] {
  const resolveConfigImpl = deps.resolveConfigImpl ?? resolveConfig;
  const probeChatgptBrowserServiceStateImpl =
    deps.probeChatgptBrowserServiceStateImpl ?? probeChatgptBrowserServiceState;
  const probeGeminiBrowserServiceStateImpl =
    deps.probeGeminiBrowserServiceStateImpl ?? probeGeminiBrowserServiceState;
  const probeGrokBrowserServiceStateImpl =
    deps.probeGrokBrowserServiceStateImpl ?? probeGrokBrowserServiceState;
  const readLiveRuntimeRunServiceStateImpl =
    deps.readLiveRuntimeRunServiceStateImpl ?? readLiveRuntimeRunServiceState;
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;

  return async ({ inspection, step }) => {
    if (step.service !== 'chatgpt' && step.service !== 'gemini' && step.service !== 'grok') {
      return null;
    }

    let transientLiveState: RuntimeRunInspectionServiceStateProbeResult | null = null;
    if (step.service === 'gemini' || step.service === 'grok') {
      const inspectionRunId =
        typeof inspection?.record?.runId === 'string' && inspection.record.runId.trim().length > 0
          ? inspection.record.runId.trim()
          : null;
      if (inspectionRunId) {
        transientLiveState = readLiveRuntimeRunServiceStateImpl({
          runId: inspectionRunId,
          stepId: step.id,
          service: step.service,
        });
        if (transientLiveState && step.service === 'gemini') {
          return transientLiveState;
        }
      }
    }

    const runtimeProfileId =
      typeof step.runtimeProfileId === 'string' && step.runtimeProfileId.trim().length > 0
        ? step.runtimeProfileId.trim()
        : null;
    const resolvedConfig = await resolveConfigImpl(
      runtimeProfileId ? { profile: runtimeProfileId } : {},
      cwd,
      env,
    );

    if (runtimeProfileId && resolvedConfig.auracallProfile !== runtimeProfileId) {
      return null;
    }

    if (step.service === 'chatgpt') {
      return probeChatgptBrowserServiceStateImpl(resolvedConfig);
    }

    if (resolvedConfig.engine !== 'browser') {
      return null;
    }

    if (step.service === 'gemini') {
      return probeGeminiBrowserServiceStateImpl(resolvedConfig, {
        prompt: typeof step.input?.prompt === 'string' ? step.input.prompt : null,
      });
    }

    const grokState = await probeGrokBrowserServiceStateImpl(resolvedConfig);
    if (grokState && grokState.state !== 'unknown' && grokState.state !== 'thinking') {
      return grokState;
    }
    if (transientLiveState) {
      return transientLiveState;
    }
    return grokState;
  };
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

function createHttpStatusResponse(input: {
  host: string;
  port: number;
  recoverySummary?: ExecutionServiceHostRecoverySummary;
  localClaimSummary?: ExecutionServiceHostLocalClaimSummary;
  runner: HttpStatusResponse['runner'];
  backgroundDrain: HttpStatusResponse['backgroundDrain'];
  controlResult?: HttpStatusResponse['controlResult'];
}): HttpStatusResponse {
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
      recoveryDetailTemplate: '/status/recovery/{run_id}',
      teamRunInspection:
        '/v1/team-runs/inspect?taskRunSpecId={task_run_spec_id}|teamRunId={team_run_id}|runtimeRunId={runtime_run_id}',
      runtimeRunInspection:
        '/v1/runtime-runs/inspect?runId={run_id}|teamRunId={team_run_id}|taskRunSpecId={task_run_spec_id}|runtimeRunId={runtime_run_id}[&runnerId={runner_id}][&probe=service-state]',
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
    recoverySummary: input.recoverySummary,
    localClaimSummary: input.localClaimSummary,
    runner: input.runner,
    backgroundDrain: input.backgroundDrain,
    executionHints: {
      headerNames: [
        'X-AuraCall-Runtime-Profile',
        'X-AuraCall-Agent',
        'X-AuraCall-Team',
        'X-AuraCall-Service',
      ],
      bodyObject: 'auracall',
    },
    controlResult: input.controlResult,
  };
}

function createStartupRecoveryLog(
  result: DrainStoredExecutionRunsUntilIdleResult,
  options: {
    sourceKind: string;
    maxRuns: number;
    staleHeartbeatInspectOnlyCount?: number;
    suspiciouslyIdleCount?: number;
  },
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

  const deferredByBudget = skipCounts['limit-reached'] ?? 0;
  const activeLeaseCount = skipCounts['active-lease'] ?? 0;
  const staleHeartbeatCount = skipCounts['stale-heartbeat'] ?? 0;
  const strandedCount = skipCounts['stranded-running-no-lease'] ?? 0;
  const idleCount = skipCounts['no-runnable-step'] ?? 0;
  parts.push(
    `metrics=deferred-by-budget:${deferredByBudget}, active-lease:${activeLeaseCount}, stale-heartbeat:${staleHeartbeatCount}, stranded:${strandedCount}, idle:${idleCount}`,
  );

  if (result.executedRunIds.length > 0) {
    parts.push(`executed=${result.executedRunIds.slice(0, 5).join(',')}`);
  }

  const attentionEntries: string[] = [];
  if ((options.staleHeartbeatInspectOnlyCount ?? 0) > 0) {
    attentionEntries.push(
      `stale-heartbeat-inspect-only:${options.staleHeartbeatInspectOnlyCount}`,
    );
  }
  if ((options.suspiciouslyIdleCount ?? 0) > 0) {
    attentionEntries.push(`suspiciously-idle:${options.suspiciouslyIdleCount}`);
  }
  if (attentionEntries.length > 0) {
    parts.push(`attention=${attentionEntries.join(',')}`);
  }

  if (result.drained.length > options.maxRuns) {
    parts.push(`cap=${options.maxRuns} hits reached`);
  }

  return parts.join(' ');
}

const StatusControlRequestSchema = z.union([
  z.object({
    backgroundDrain: z.object({
      action: z.enum(['pause', 'resume']),
    }),
  }),
  z.object({
    localActionControl: z.object({
      action: z.literal('resolve-request'),
      runId: z.string().min(1),
      requestId: z.string().min(1),
      resolution: z.enum(['approved', 'rejected', 'cancelled']),
      note: z.string().min(1).nullable().optional(),
    }),
  }),
  z.object({
    runControl: z.union([
      z.object({
        action: z.literal('cancel-run'),
        runId: z.string().min(1),
        note: z.string().min(1).nullable().optional(),
      }),
      z.object({
        action: z.literal('drain-run'),
        runId: z.string().min(1),
      }),
      z.object({
        action: z.literal('resume-human-escalation'),
        runId: z.string().min(1),
        note: z.string().min(1).nullable().optional(),
        guidance: z.record(z.string(), z.unknown()).nullable().optional(),
        override: z
          .object({
            promptAppend: z.string().min(1).nullable().optional(),
            structuredContext: z.record(z.string(), z.unknown()).nullable().optional(),
          })
          .nullable()
          .optional(),
      }),
    ]),
  }),
  z.object({
    leaseRepair: z.object({
      action: z.literal('repair-stale-heartbeat'),
      runId: z.string().min(1),
    }),
  }),
]);

interface ParsedStatusQuery {
  recovery: boolean;
  sourceKindSummary?: ExecutionRunSourceKind | 'all';
}

interface ParsedRuntimeInspectionQuery {
  probe?: 'service-state';
}

function parseStatusQuery(searchParams: URLSearchParams): ParsedStatusQuery {
  const raw: Record<string, string> = Object.fromEntries(searchParams.entries());
  const parsed = z
    .object({
      recovery: z
        .enum(['0', '1', 'true', 'false'])
        .transform((value) => value === '1' || value.toLowerCase() === 'true')
        .optional(),
      sourceKind: z.enum(['direct', 'team-run', 'all']).optional(),
    })
    .superRefine((value, ctx) => {
      if (!value.recovery && value.sourceKind !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'sourceKind can only be used with recovery=true',
          path: ['sourceKind'],
        });
      }
    })
    .parse(raw);

  return {
    recovery: parsed.recovery ?? false,
    sourceKindSummary: parsed.sourceKind,
  };
}

function parseRuntimeInspectionQuery(searchParams: URLSearchParams): ParsedRuntimeInspectionQuery {
  const raw: Record<string, string> = Object.fromEntries(searchParams.entries());
  const parsed = z.object({
    probe: z.enum(['service-state']).optional(),
  }).parse(raw);

  return {
    probe: parsed.probe,
  };
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

function matchStatusRecoveryDetailRoute(pathname: string): string | null {
  const match = /^\/status\/recovery\/([^/]+)$/.exec(pathname);
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
