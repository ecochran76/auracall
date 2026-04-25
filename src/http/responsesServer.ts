import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { OptionValues } from 'commander';
import { MODEL_CONFIGS } from '../oracle/config.js';
import { getCliVersion } from '../version.js';
import type { ResolvedUserConfig } from '../config.js';
import { resolveConfig } from '../schema/resolver.js';
import { resolveHostLocalActionExecutionPolicy } from '../config/model.js';
import {
  inspectTeamRunLinkage,
  TeamRunInspectionError,
  type TeamRunInspectionPayload,
} from '../teams/inspection.js';
import { createTeamRuntimeBridge, type TeamRuntimeBridge } from '../teams/runtimeBridge.js';
import { buildBoundedTeamTaskRunSpec } from '../teams/taskRunSpecBuilder.js';
import { buildTeamRunExecutionPayload, type TeamRunExecutionPayload } from '../teams/executionPayload.js';
import { TaskRunSpecSchema } from '../teams/schema.js';
import type { TaskRunSpec } from '../teams/types.js';
import type {
  ExecutionRequest,
  ExecutionRequestExtensionHints,
} from '../runtime/apiTypes.js';
import {
  inspectRuntimeRun,
  type InspectRuntimeRunInput,
  type RuntimeRunInspectionBrowserDiagnosticsSummary,
  type RuntimeRunInspectionBrowserDiagnosticsProbeResult,
  type RuntimeRunInspectionServiceStateProbeResult,
  type ProbeRuntimeRunBrowserDiagnosticsInput,
  type ProbeRuntimeRunServiceStateInput,
  RuntimeRunInspectionError,
  type RuntimeRunInspectionPayload,
} from '../runtime/inspection.js';
import type { ExecutionRuntimeControlContract } from '../runtime/contract.js';
import { createExecutionRuntimeControl } from '../runtime/control.js';
import { createConfiguredExecutionRunAffinity } from '../runtime/configuredAffinity.js';
import { createLocalRunnerCapabilitySummary } from '../runtime/localRunnerCapabilities.js';
import { createExecutionRequest } from '../runtime/apiModel.js';
import {
  createExecutionResponsesService,
  createExecutionRequestFromRecord,
  type ExecutionResponsesServiceDeps,
} from '../runtime/responsesService.js';
import { createConfiguredStoredStepExecutor } from '../runtime/configuredExecutor.js';
import { readLiveRuntimeRunServiceState } from '../runtime/liveServiceStateRegistry.js';
import { AURACALL_STEP_OUTPUT_CONTRACT_VERSION } from '../runtime/stepOutputContract.js';
import {
  createExecutionRunnerControl,
  type ExecutionRunnerControlContract,
} from '../runtime/runnersControl.js';
import {
  createExecutionServiceHost,
  type ExecutionServiceHostOperatorControlInput,
  type ExecutionServiceHostOperatorControlResult,
  type ExecutionServiceHostRecoveryDetail,
  type ExecutionServiceHostRecoverySummary,
  type ExecutionServiceHostLocalClaimSummary,
  type ExecutionServiceHostRunnerTopologySummary,
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
import {
  probeBrowserRunDiagnostics,
  type BrowserDiagnosticsService,
} from '../browser/liveDiagnostics.js';
import {
  createMediaGenerationService,
  type MediaGenerationServiceDeps,
} from '../media/service.js';
import { createBrowserMediaGenerationExecutor } from '../media/browserExecutor.js';
import { probeMediaGenerationBrowserDiagnostics } from '../media/browserDiagnostics.js';
import type { MediaGenerationRequest } from '../media/types.js';
import { summarizeMediaGenerationStatus } from '../media/statusSummary.js';
import {
  createWorkbenchCapabilityService,
  type WorkbenchCapabilityServiceDeps,
} from '../workbench/service.js';
import { WorkbenchCapabilityReportRequestSchema } from '../workbench/schema.js';
import { createBrowserWorkbenchCapabilityDiscovery } from '../workbench/browserDiscovery.js';
import { createBrowserWorkbenchCapabilityDiagnostics } from '../workbench/browserDiagnostics.js';
import { readAuraCallRunStatus } from '../runStatus.js';
import type { AuraCallRunStatus } from '../runStatus.js';

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
  mediaGenerationExecutor?: MediaGenerationServiceDeps['executor'];
  workbenchCapabilityCatalog?: WorkbenchCapabilityServiceDeps['catalog'];
  discoverWorkbenchCapabilities?: WorkbenchCapabilityServiceDeps['discoverCapabilities'];
  diagnoseWorkbenchCapabilities?: WorkbenchCapabilityServiceDeps['diagnoseCapabilities'];
  executionHost?: ExecutionServiceHost;
  localActionExecutionPolicy?: ExecutionServiceHostDeps['localActionExecutionPolicy'];
  probeRuntimeRunServiceState?: (
    input: ProbeRuntimeRunServiceStateInput,
  ) => Promise<RuntimeRunInspectionServiceStateProbeResult | null>;
  probeRuntimeRunBrowserDiagnostics?: (
    input: ProbeRuntimeRunBrowserDiagnosticsInput,
  ) => Promise<RuntimeRunInspectionBrowserDiagnosticsProbeResult | null>;
  probeMediaGenerationBrowserDiagnostics?: typeof probeMediaGenerationBrowserDiagnostics;
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
  cliOptions?: OptionValues;
  executeStoredRunStep?: ResponsesHttpServerDeps['executeStoredRunStep'];
  mediaGenerationExecutor?: ResponsesHttpServerDeps['mediaGenerationExecutor'];
  probeRuntimeRunServiceState?: ResponsesHttpServerDeps['probeRuntimeRunServiceState'];
  probeRuntimeRunBrowserDiagnostics?: ResponsesHttpServerDeps['probeRuntimeRunBrowserDiagnostics'];
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

interface HttpTeamRunCreateResponse {
  object: 'team_run';
  taskRunSpec: TaskRunSpec;
  execution: TeamRunExecutionPayload;
  links: {
    teamInspection: string;
    runtimeInspection: string;
    responseReadback: string;
  };
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
    teamRunsCreate: string;
    teamRunInspection: string;
    runtimeRunInspection: string;
    models: string;
    responsesCreate: string;
    responsesGetTemplate: string;
    mediaGenerationsCreate: string;
    mediaGenerationsGetTemplate: string;
    mediaGenerationsStatusTemplate: string;
    runStatusTemplate: string;
    workbenchCapabilitiesList: string;
  };
  compatibility: {
    openai: true;
    chatCompletions: false;
    streaming: false;
    auth: false;
  };
  recoverySummary?: ExecutionServiceHostRecoverySummary;
  localClaimSummary?: ExecutionServiceHostLocalClaimSummary;
  runnerTopology: ExecutionServiceHostRunnerTopologySummary;
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
    | ExecutionServiceHostOperatorControlResult;
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
  const resolvedUserConfig = asResolvedUserConfig(configuredRuntimeConfig);
  const workbenchCapabilityService = createWorkbenchCapabilityService({
    now,
    catalog: deps.workbenchCapabilityCatalog,
    discoverCapabilities: deps.discoverWorkbenchCapabilities,
    diagnoseCapabilities: deps.diagnoseWorkbenchCapabilities,
  });
  const probeMediaGenerationBrowserDiagnosticsImpl =
    deps.probeMediaGenerationBrowserDiagnostics ?? probeMediaGenerationBrowserDiagnostics;
  const mediaGenerationService = createMediaGenerationService({
    now,
    executor:
      deps.mediaGenerationExecutor ??
      (resolvedUserConfig ? createBrowserMediaGenerationExecutor(resolvedUserConfig) : undefined),
    capabilityReporter: workbenchCapabilityService,
    runtimeProfile:
      typeof resolvedUserConfig?.auracallProfile === 'string'
        ? resolvedUserConfig.auracallProfile
        : null,
  });
  const localRunnerCapabilitySummary = createLocalRunnerCapabilitySummary(configuredRuntimeConfig);
  const createRunAffinity = configuredRuntimeConfig
    ? (inspection: Parameters<typeof createConfiguredExecutionRunAffinity>[1]) =>
        createConfiguredExecutionRunAffinity(configuredRuntimeConfig, inspection)
    : undefined;
  const runnerHeartbeatIntervalMs = 5_000;
  const runnerHeartbeatTtlMs = 15_000;
  let host: ExecutionServiceHost;
  let responsesService: ReturnType<typeof createExecutionResponsesService>;
  let teamRuntimeBridge: TeamRuntimeBridge;
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
    return host.drainRunsUntilIdleQueued({
      runId: drainOptions.runId,
      sourceKind: drainOptions.sourceKind,
      maxRuns: drainOptions.maxRuns,
      onStart: () => {
        if (backgroundDrainState.state !== 'disabled') {
          backgroundDrainState.state = 'running';
          backgroundDrainState.lastTrigger = drainOptions.trigger ?? null;
          backgroundDrainState.lastStartedAt = now().toISOString();
        }
      },
    }).finally(() => {
      if (backgroundDrainState.state !== 'disabled') {
        backgroundDrainState.state = closed ? 'disabled' : backgroundDrainPaused ? 'paused' : 'idle';
        backgroundDrainState.lastCompletedAt = now().toISOString();
      }
    });
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
        const runnerTopology = compactRunnerTopologyForStatus(
          await host.summarizeRunnerTopology(),
          statusQuery.runnerTopologyMode,
        );
        const statusResponse = await createHttpStatusResponse({
          host: boundHost,
          port: boundPort,
          recoverySummary: statusResponseRecoverySummary,
          localClaimSummary: statusResponseLocalClaimSummary,
          runnerTopology,
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
            includeBrowserDiagnostics: runtimeInspectQuery.diagnostics === 'browser-state',
            includeSchedulerAuthority: runtimeInspectQuery.authority === 'scheduler',
            schedulerAuthorityLocalRunnerId: url.searchParams.get('runnerId') ?? runnerState.id,
            probeServiceState: deps.probeRuntimeRunServiceState,
            probeBrowserDiagnostics: deps.probeRuntimeRunBrowserDiagnostics,
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
          const result = await host.controlOperatorAction(createServiceHostOperatorControlInput(payload));
          if (!isSuccessfulServiceHostOperatorControlResult(result)) {
            sendJson(res, result.status === 'not-found' ? 404 : 409, {
              error: {
                message: result.reason,
                type: result.status === 'not-found' ? 'not_found_error' : 'invalid_request_error',
              },
            } satisfies HttpErrorPayload);
            return;
          }
          controlResult = result;
        }
        const address = server.address();
        const boundPort = address && typeof address !== 'string' ? address.port : options.port ?? 0;
        await syncRunnerStateFromStore();
        const statusResponse = await createHttpStatusResponse({
          host: boundHost,
          port: boundPort,
          localClaimSummary: await host.summarizeLocalClaimState({ sourceKind: 'direct' }),
          runnerTopology: await host.summarizeRunnerTopology(),
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

      if (req.method === 'GET' && url.pathname === '/v1/workbench-capabilities') {
        const request = parseWorkbenchCapabilityQuery(url.searchParams);
        const response = await workbenchCapabilityService.listCapabilities(request);
        sendJson(res, 200, response);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/team-runs') {
        const body = await readRequestBody(req);
        const payload = TeamRunCreateRequestSchema.parse(JSON.parse(body || '{}'));
        const prebuiltTaskRunSpec = payload.taskRunSpec ?? null;
        const teamId = (prebuiltTaskRunSpec?.teamId ?? payload.teamId ?? '').trim();
        const nowIso = now().toISOString();
        const suffix = createTeamRunIdSuffix();
        const teamRunId = `teamrun_${teamId}_${suffix}`;
        const taskRunSpec =
          prebuiltTaskRunSpec ??
          buildBoundedTeamTaskRunSpec({
            nowIso,
            taskRunSpecId: `taskrun_${teamId}_${suffix}`,
            teamId,
            objective: payload.objective ?? '',
            title: payload.title,
            promptAppend: payload.promptAppend,
            structuredContext: payload.structuredContext,
            responseFormat: payload.responseFormat,
            outputContract: payload.outputContract,
            maxTurns: payload.maxTurns,
            localActionPolicy: payload.localActionPolicy,
            context: {
              command: 'auracall api serve',
            },
            requestedBy: {
              kind: 'api',
              label: 'auracall api serve',
            },
            trigger: 'api',
          });
        const bridgeResult = await teamRuntimeBridge.executeFromConfigTaskRunSpec({
          config: configuredRuntimeConfig ?? {},
          teamId,
          runId: teamRunId,
          createdAt: nowIso,
          trigger: prebuiltTaskRunSpec ? undefined : 'api',
          requestedBy: prebuiltTaskRunSpec ? undefined : 'auracall api serve',
          taskRunSpec,
        });
        if (backgroundDrainIntervalMs > 0) {
          scheduleBackgroundDrain(0);
        }
        const execution = buildTeamRunExecutionPayload({
          teamId,
          bridgeResult,
          taskRunSpec,
        });
        const address = server.address();
        const boundPort = address && typeof address !== 'string' ? address.port : options.port ?? 0;
        sendJson(res, 200, {
          object: 'team_run',
          taskRunSpec,
          execution,
          links: createTeamRunCreateLinks({
            host: boundHost,
            port: boundPort,
            teamRunId: execution.teamRunId,
            runtimeRunId: execution.runtimeRunId,
          }),
        } satisfies HttpTeamRunCreateResponse);
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

      if (req.method === 'POST' && url.pathname === '/v1/media-generations') {
        const body = await readRequestBody(req);
        const parsedBody = JSON.parse(body || '{}') as MediaGenerationRequest & { wait?: unknown };
        const mediaRequest = {
          ...parsedBody,
          source: parsedBody.source ?? 'api',
        };
        const createQuery = parseMediaGenerationCreateQuery(url.searchParams);
        const wait = resolveMediaGenerationWait(createQuery, parsedBody);
        const response =
          !wait && mediaGenerationService.createGenerationAsync
            ? await mediaGenerationService.createGenerationAsync(mediaRequest)
            : await mediaGenerationService.createGeneration(mediaRequest);
        sendJson(res, wait && response.status === 'failed' ? 502 : wait ? 200 : 202, response);
        return;
      }

      const runStatusId = matchRunStatusRoute(url.pathname);
      if (req.method === 'GET' && runStatusId) {
        const runStatusQuery = parseRunStatusQuery(url.searchParams);
        const response = await readAuraCallRunStatus(runStatusId, {
          responsesService,
          mediaGenerationService,
        });
        if (!response) {
          sendJson(res, 404, {
            error: {
              message: `Run ${runStatusId} was not found`,
              type: 'not_found_error',
            },
          } satisfies HttpErrorPayload);
          return;
        }
        if (runStatusQuery.diagnostics === 'browser-state') {
          response.browserDiagnostics = await readRunStatusBrowserDiagnostics({
            status: response,
            responsesService,
            mediaGenerationService,
            probeRuntimeRunBrowserDiagnostics: deps.probeRuntimeRunBrowserDiagnostics,
            probeMediaGenerationBrowserDiagnostics: probeMediaGenerationBrowserDiagnosticsImpl,
            control,
            runnersControl,
            createRunAffinity,
          });
        }
        sendJson(res, 200, response);
        return;
      }

      const mediaGenerationStatusId = matchMediaGenerationStatusRoute(url.pathname);
      if (req.method === 'GET' && mediaGenerationStatusId) {
        const runStatusQuery = parseRunStatusQuery(url.searchParams);
        const response = await mediaGenerationService.readGeneration(mediaGenerationStatusId);
        if (!response) {
          sendJson(res, 404, {
            error: {
              message: `Media generation ${mediaGenerationStatusId} was not found`,
              type: 'not_found_error',
            },
          } satisfies HttpErrorPayload);
          return;
        }
        const summary = summarizeMediaGenerationStatus(response);
        if (runStatusQuery.diagnostics === 'browser-state') {
          sendJson(res, 200, {
            ...summary,
            browserDiagnostics: await probeMediaGenerationBrowserDiagnosticsImpl(response),
          });
          return;
        }
        sendJson(res, 200, summary);
        return;
      }

      const mediaGenerationId = matchMediaGenerationRoute(url.pathname);
      if (req.method === 'GET' && mediaGenerationId) {
        const response = await mediaGenerationService.readGeneration(mediaGenerationId);
        if (!response) {
          sendJson(res, 404, {
            error: {
              message: `Media generation ${mediaGenerationId} was not found`,
              type: 'not_found_error',
            },
          } satisfies HttpErrorPayload);
          return;
        }
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

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine server address');
  }

  const localRunnerId = `runner:http-responses:${boundHost}:${address.port}`;
  const localRunnerHostId = `host:http-responses:${boundHost}:${address.port}`;
  const localRunnerLifecycleOptions = {
    hostId: localRunnerHostId,
    heartbeatTtlMs: runnerHeartbeatTtlMs,
    capabilitySummary: localRunnerCapabilitySummary,
    baseLabel: 'api serve local runner',
    heartbeatLabel: 'api serve runner heartbeat',
    shutdownLabel: 'api serve shutdown',
  };
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
    const registeredRunner = await host.registerLocalRunner(localRunnerLifecycleOptions);
    if (registeredRunner) {
      updateRunnerState(registeredRunner);
    }
  };
  const heartbeatLocalRunner = async () => {
    if (closed || !runnerState.id) return;
    const heartbeatedRunner = await host.heartbeatLocalRunner(localRunnerLifecycleOptions);
    if (heartbeatedRunner) {
      updateRunnerState(heartbeatedRunner);
    }
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
  teamRuntimeBridge = createTeamRuntimeBridge({
    control,
    host,
    now: () => now().toISOString(),
    drainAfterCreate: backgroundDrainIntervalMs <= 0,
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
      await host.waitForDrainQueue().catch(() => null);
      if (!deps.executionHost && runnerState.id) {
        const staleRunner = await host.markLocalRunnerStale(localRunnerLifecycleOptions);
        if (staleRunner) {
          updateRunnerState(staleRunner);
        }
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
    cliOptions: _unusedCliOptions,
    executeStoredRunStep: overrideExecuteStoredRunStep,
    mediaGenerationExecutor: overrideMediaGenerationExecutor,
    probeRuntimeRunServiceState: overrideProbeRuntimeRunServiceState,
    ...serverOptions
  } = options;
  const resolvedUserConfig = await resolveConfig(options.cliOptions ?? {}, process.cwd(), process.env);
  const configuredStoredStepExecutor = createConfiguredStoredStepExecutor(
    resolvedUserConfig as Record<string, unknown>,
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
      config: resolvedUserConfig as Record<string, unknown>,
      now: () => new Date(),
      localActionExecutionPolicy: resolveHostLocalActionExecutionPolicy(
        resolvedUserConfig as Record<string, unknown>,
      ),
      executeStoredRunStep:
        overrideExecuteStoredRunStep ??
        (async (_request, context) => configuredStoredStepExecutor(context)),
      mediaGenerationExecutor: overrideMediaGenerationExecutor,
      probeRuntimeRunServiceState:
        overrideProbeRuntimeRunServiceState ?? createDefaultRuntimeRunServiceStateProbe(),
      probeRuntimeRunBrowserDiagnostics:
        options.probeRuntimeRunBrowserDiagnostics ?? createDefaultRuntimeRunBrowserDiagnosticsProbe(),
      discoverWorkbenchCapabilities: createBrowserWorkbenchCapabilityDiscovery(
        resolvedUserConfig as ResolvedUserConfig,
      ),
      diagnoseWorkbenchCapabilities: createBrowserWorkbenchCapabilityDiagnostics(
        resolvedUserConfig as ResolvedUserConfig,
      ),
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
  logger(`Active AuraCall runtime profile: ${resolvedUserConfig.auracallProfile ?? 'default'}`);
  logger(
    'Endpoints: GET /status, GET /status/recovery/{run_id}, POST /v1/team-runs, GET /v1/team-runs/inspect, GET /v1/runtime-runs/inspect, GET /v1/models, GET /v1/workbench-capabilities, POST /v1/responses, GET /v1/responses/{response_id}, POST /v1/media-generations, GET /v1/media-generations/{media_generation_id}',
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
      const geminiState = await probeGeminiBrowserServiceStateImpl(resolvedConfig, {
        prompt: typeof step.input?.prompt === 'string' ? step.input.prompt : null,
      });
      if (geminiState && geminiState.state !== 'unknown') {
        return geminiState;
      }
      if (transientLiveState) {
        return transientLiveState;
      }
      return geminiState;
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

type DefaultRuntimeRunBrowserDiagnosticsProbeDeps = {
  resolveConfigImpl?: typeof resolveConfig;
  probeBrowserRunDiagnosticsImpl?: typeof probeBrowserRunDiagnostics;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export function createDefaultRuntimeRunBrowserDiagnosticsProbe(
  deps: DefaultRuntimeRunBrowserDiagnosticsProbeDeps = {},
): ResponsesHttpServerDeps['probeRuntimeRunBrowserDiagnostics'] {
  const resolveConfigImpl = deps.resolveConfigImpl ?? resolveConfig;
  const probeBrowserRunDiagnosticsImpl = deps.probeBrowserRunDiagnosticsImpl ?? probeBrowserRunDiagnostics;
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;

  return async ({ inspection, step }) => {
    if (step.service !== 'chatgpt' && step.service !== 'gemini' && step.service !== 'grok') {
      return null;
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

    if (resolvedConfig.engine !== 'browser') {
      return null;
    }

    return probeBrowserRunDiagnosticsImpl(resolvedConfig, {
      service: step.service as BrowserDiagnosticsService,
      runId: inspection.record.runId,
      stepId: step.id,
    });
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
  runnerTopology: ExecutionServiceHostRunnerTopologySummary;
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
      teamRunsCreate: '/v1/team-runs',
      teamRunInspection:
        '/v1/team-runs/inspect?taskRunSpecId={task_run_spec_id}|teamRunId={team_run_id}|runtimeRunId={runtime_run_id}',
      runtimeRunInspection:
        '/v1/runtime-runs/inspect?runId={run_id}|teamRunId={team_run_id}|taskRunSpecId={task_run_spec_id}|runtimeRunId={runtime_run_id}[&runnerId={runner_id}][&probe=service-state][&diagnostics=browser-state][&authority=scheduler]',
      models: '/v1/models',
      responsesCreate: '/v1/responses',
      responsesGetTemplate: '/v1/responses/{response_id}',
      mediaGenerationsCreate: '/v1/media-generations',
      mediaGenerationsGetTemplate: '/v1/media-generations/{media_generation_id}',
      mediaGenerationsStatusTemplate: '/v1/media-generations/{media_generation_id}/status[?diagnostics=browser-state]',
      runStatusTemplate: '/v1/runs/{run_id}/status[?diagnostics=browser-state]',
      workbenchCapabilitiesList:
        '/v1/workbench-capabilities?provider={chatgpt|gemini|grok}&category={category}[&entrypoint=grok-imagine][&diagnostics=browser-state][&discoveryAction=grok-imagine-video-mode]',
    },
    compatibility: {
      openai: true,
      chatCompletions: false,
      streaming: false,
      auth: false,
    },
    recoverySummary: input.recoverySummary,
    localClaimSummary: input.localClaimSummary,
    runnerTopology: input.runnerTopology,
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

const CompactTeamRunCreateRequestSchema = z.object({
  teamId: z.string().min(1).optional(),
  objective: z.string().min(1).optional(),
  title: z.string().min(1).nullable().optional(),
  promptAppend: z.string().min(1).nullable().optional(),
  structuredContext: z.record(z.string(), z.unknown()).nullable().optional(),
  responseFormat: z.enum(['text', 'markdown', 'json']).optional(),
  outputContract: z.literal(AURACALL_STEP_OUTPUT_CONTRACT_VERSION).nullable().optional(),
  maxTurns: z.number().int().positive().nullable().optional(),
  localActionPolicy: z
    .object({
      allowedShellCommands: z.array(z.string().min(1)).optional(),
      allowedCwdRoots: z.array(z.string().min(1)).optional(),
      mode: z.enum(['allowed', 'approval-required']).optional(),
    })
    .nullable()
    .optional(),
});

const TeamRunCreateRequestSchema = CompactTeamRunCreateRequestSchema.extend({
  taskRunSpec: TaskRunSpecSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.taskRunSpec) {
    if (!value.teamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'teamId is required when taskRunSpec is not provided',
        path: ['teamId'],
      });
    }
    if (!value.objective) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'objective is required when taskRunSpec is not provided',
        path: ['objective'],
      });
    }
    return;
  }

  if (value.teamId && value.teamId.trim() !== value.taskRunSpec.teamId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'teamId must match taskRunSpec.teamId when both are provided',
      path: ['teamId'],
    });
  }

  const compactAssignmentFieldNames = [
    'objective',
    'title',
    'promptAppend',
    'structuredContext',
    'responseFormat',
    'outputContract',
    'maxTurns',
    'localActionPolicy',
  ] as const;
  const conflictingFields = compactAssignmentFieldNames.filter((field) => value[field] !== undefined);
  if (conflictingFields.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `taskRunSpec cannot be combined with compact assignment fields: ${conflictingFields.join(', ')}`,
      path: ['taskRunSpec'],
    });
  }
});

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
  z.object({
    schedulerControl: z.object({
      action: z.literal('claim-local-run'),
      runId: z.string().min(1),
      schedulerId: z.string().min(1).default('operator'),
    }),
  }),
]);

type StatusControlRequest = z.infer<typeof StatusControlRequestSchema>;

function createServiceHostOperatorControlInput(payload: Exclude<StatusControlRequest, { backgroundDrain: unknown }>): ExecutionServiceHostOperatorControlInput {
  if ('leaseRepair' in payload) {
    return {
      kind: 'lease-repair',
      action: payload.leaseRepair.action,
      runId: payload.leaseRepair.runId,
    };
  }
  if ('localActionControl' in payload) {
    return {
      kind: 'local-action-control',
      action: payload.localActionControl.action,
      runId: payload.localActionControl.runId,
      requestId: payload.localActionControl.requestId,
      resolution: payload.localActionControl.resolution,
      note: payload.localActionControl.note ?? null,
    };
  }
  if ('schedulerControl' in payload) {
    return {
      kind: 'scheduler-control',
      control: payload.schedulerControl,
    };
  }
  return {
    kind: 'run-control',
    control: payload.runControl,
  };
}

function isSuccessfulServiceHostOperatorControlResult(result: ExecutionServiceHostOperatorControlResult): boolean {
  if (result.kind === 'lease-repair') {
    return result.status === 'repaired';
  }
  if (result.kind === 'local-action-control') {
    return result.status === 'resolved';
  }
  if (result.kind === 'scheduler-control') {
    return result.status === 'claimed' || result.status === 'reassigned';
  }
  return (
    (result.action === 'cancel-run' && result.status === 'cancelled') ||
    (result.action === 'resume-human-escalation' && result.status === 'resumed') ||
    (result.action === 'drain-run' && result.status === 'executed')
  );
}

interface ParsedStatusQuery {
  recovery: boolean;
  sourceKindSummary?: ExecutionRunSourceKind | 'all';
  runnerTopologyMode: 'compact' | 'full';
}

interface ParsedRuntimeInspectionQuery {
  probe?: 'service-state';
  authority?: 'scheduler';
  diagnostics?: 'browser-state';
}

interface ParsedRunStatusQuery {
  diagnostics?: 'browser-state';
}

interface ParsedMediaGenerationCreateQuery {
  wait?: boolean;
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
      runnerTopology: z.enum(['compact', 'full']).optional(),
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
    runnerTopologyMode: parsed.runnerTopology ?? 'compact',
  };
}

function compactRunnerTopologyForStatus(
  topology: ExecutionServiceHostRunnerTopologySummary,
  mode: ParsedStatusQuery['runnerTopologyMode'],
): ExecutionServiceHostRunnerTopologySummary {
  if (mode === 'full') {
    return {
      ...topology,
      metrics: {
        ...topology.metrics,
        displayedRunnerCount: topology.runners.length,
        omittedRunnerCount: 0,
        omittedStaleRunnerCount: 0,
        omittedExpiredRunnerCount: 0,
      },
    };
  }

  const runners: ExecutionServiceHostRunnerTopologySummary['runners'] = [];
  const omitted: ExecutionServiceHostRunnerTopologySummary['runners'] = [];
  for (const runner of topology.runners) {
    if (
      runner.selectedAsLocalExecutionOwner ||
      runner.freshness === 'fresh' ||
      runner.status === 'active'
    ) {
      runners.push(runner);
    } else {
      omitted.push(runner);
    }
  }

  return {
    ...topology,
    runners,
    metrics: {
      ...topology.metrics,
      displayedRunnerCount: runners.length,
      omittedRunnerCount: omitted.length,
      omittedStaleRunnerCount: omitted.filter((runner) => runner.freshness === 'stale').length,
      omittedExpiredRunnerCount: omitted.filter((runner) => runner.freshness === 'expired').length,
    },
  };
}

function parseRuntimeInspectionQuery(searchParams: URLSearchParams): ParsedRuntimeInspectionQuery {
  const raw: Record<string, string> = Object.fromEntries(searchParams.entries());
  const parsed = z.object({
    probe: z.enum(['service-state']).optional(),
    authority: z.enum(['scheduler']).optional(),
    diagnostics: z.enum(['browser-state']).optional(),
  }).parse(raw);

  return {
    probe: parsed.probe,
    authority: parsed.authority,
    diagnostics: parsed.diagnostics,
  };
}

function parseWorkbenchCapabilityQuery(searchParams: URLSearchParams) {
  const raw: Record<string, string> = Object.fromEntries(searchParams.entries());
  const parsed = z.object({
    provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
    category: z.enum(['research', 'media', 'canvas', 'connector', 'skill', 'app', 'search', 'file', 'other']).optional(),
    runtimeProfile: z.string().trim().min(1).optional(),
    includeUnavailable: z
      .enum(['0', '1', 'true', 'false'])
      .transform((value) => value === '1' || value.toLowerCase() === 'true')
      .optional(),
    diagnostics: z.enum(['browser-state']).optional(),
    entrypoint: z.enum(['grok-imagine', 'imagine']).optional(),
    discoveryAction: z.enum(['grok-imagine-video-mode']).optional(),
  }).parse(raw);
  return WorkbenchCapabilityReportRequestSchema.parse({
    provider: parsed.provider ?? null,
    category: parsed.category ?? null,
    runtimeProfile: parsed.runtimeProfile ?? null,
    includeUnavailable: parsed.includeUnavailable ?? null,
    diagnostics: parsed.diagnostics ?? null,
    entrypoint: parsed.entrypoint === 'imagine' ? 'grok-imagine' : parsed.entrypoint ?? null,
    discoveryAction: parsed.discoveryAction ?? null,
  });
}

function createTeamRunIdSuffix(): string {
  return randomUUID().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'run';
}

function parseRunStatusQuery(searchParams: URLSearchParams): ParsedRunStatusQuery {
  const raw: Record<string, unknown> = {};
  if (searchParams.has('diagnostics')) {
    raw.diagnostics = searchParams.get('diagnostics');
  }
  return z.object({
    diagnostics: z.enum(['browser-state']).optional(),
  }).parse(raw);
}

function parseMediaGenerationCreateQuery(searchParams: URLSearchParams): ParsedMediaGenerationCreateQuery {
  const raw: Record<string, unknown> = {};
  if (searchParams.has('wait')) {
    raw.wait = searchParams.get('wait');
  }
  return z.object({
    wait: z
      .enum(['0', '1', 'true', 'false'])
      .transform((value) => value === '1' || value.toLowerCase() === 'true')
      .optional(),
  }).parse(raw);
}

function resolveMediaGenerationWait(
  query: ParsedMediaGenerationCreateQuery,
  body: { wait?: unknown },
): boolean {
  if (typeof query.wait === 'boolean') return query.wait;
  if (typeof body.wait === 'boolean') return body.wait;
  if (typeof body.wait === 'string') {
    const normalized = body.wait.trim().toLowerCase();
    if (normalized === 'false' || normalized === '0') return false;
    if (normalized === 'true' || normalized === '1') return true;
  }
  return true;
}

async function readRunStatusBrowserDiagnostics(input: {
  status: AuraCallRunStatus;
  responsesService: ReturnType<typeof createExecutionResponsesService>;
  mediaGenerationService: ReturnType<typeof createMediaGenerationService>;
  probeRuntimeRunBrowserDiagnostics: ResponsesHttpServerDeps['probeRuntimeRunBrowserDiagnostics'];
  probeMediaGenerationBrowserDiagnostics: typeof probeMediaGenerationBrowserDiagnostics;
  control: ExecutionRuntimeControlContract;
  runnersControl: ExecutionRunnerControlContract;
  createRunAffinity: InspectRuntimeRunInput['createRunAffinity'];
}): Promise<RuntimeRunInspectionBrowserDiagnosticsSummary> {
  if (input.status.kind === 'response') {
    const inspection = await inspectRuntimeRun({
      runId: input.status.id,
      includeBrowserDiagnostics: true,
      probeBrowserDiagnostics: input.probeRuntimeRunBrowserDiagnostics,
      control: input.control,
      runnersControl: input.runnersControl,
      createRunAffinity: input.createRunAffinity,
    });
    return inspection.browserDiagnostics ?? createUnavailableRunStatusBrowserDiagnostics(
      `runtime run ${input.status.id} did not return browser diagnostics`,
    );
  }

  const mediaGeneration = await input.mediaGenerationService.readGeneration(input.status.id);
  if (!mediaGeneration) {
    return createUnavailableRunStatusBrowserDiagnostics(`media generation ${input.status.id} was not found`);
  }
  return input.probeMediaGenerationBrowserDiagnostics(mediaGeneration);
}

function createUnavailableRunStatusBrowserDiagnostics(
  reason: string,
): NonNullable<RuntimeRunInspectionPayload['browserDiagnostics']> {
  return {
    probeStatus: 'unavailable',
    service: null,
    ownerStepId: null,
    observedAt: null,
    source: null,
    reason,
    target: null,
    document: null,
    visibleCounts: null,
    providerEvidence: null,
    screenshot: null,
  };
}

function createTeamRunCreateLinks(input: {
  host: string;
  port: number;
  teamRunId: string;
  runtimeRunId: string;
}): HttpTeamRunCreateResponse['links'] {
  const baseUrl = `http://${localProbeHost(input.host)}:${input.port}`;
  return {
    teamInspection: `${baseUrl}/v1/team-runs/inspect?teamRunId=${encodeURIComponent(input.teamRunId)}`,
    runtimeInspection: `${baseUrl}/v1/runtime-runs/inspect?runtimeRunId=${encodeURIComponent(input.runtimeRunId)}`,
    responseReadback: `${baseUrl}/v1/responses/${encodeURIComponent(input.runtimeRunId)}`,
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

function asResolvedUserConfig(value: Record<string, unknown> | undefined): ResolvedUserConfig | null {
  if (!value || typeof value.model !== 'string') {
    return null;
  }
  const browser = value.browser;
  if (!browser || typeof browser !== 'object' || Array.isArray(browser)) {
    return null;
  }
  return value as ResolvedUserConfig;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function matchResponseRoute(pathname: string): string | null {
  const match = /^\/v1\/responses\/([^/]+)$/.exec(pathname);
  return match?.[1] ?? null;
}

function matchMediaGenerationRoute(pathname: string): string | null {
  const match = /^\/v1\/media-generations\/([^/]+)$/.exec(pathname);
  return match?.[1] ?? null;
}

function matchMediaGenerationStatusRoute(pathname: string): string | null {
  const match = /^\/v1\/media-generations\/([^/]+)\/status$/.exec(pathname);
  return match?.[1] ?? null;
}

function matchRunStatusRoute(pathname: string): string | null {
  const match = /^\/v1\/runs\/([^/]+)\/status$/.exec(pathname);
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
