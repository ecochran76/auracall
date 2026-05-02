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
import {
  createAccountMirrorStatusRegistry,
  type AccountMirrorStatusRegistry,
  type AccountMirrorStatusSummary,
} from '../accountMirror/statusRegistry.js';
import {
  AccountMirrorRefreshError,
  createAccountMirrorRefreshService,
  type AccountMirrorRefreshResult,
  type AccountMirrorRefreshService,
} from '../accountMirror/refreshService.js';
import { createAccountMirrorPersistence } from '../accountMirror/cachePersistence.js';
import {
  createAccountMirrorCatalogService,
  type AccountMirrorCatalogKind,
  type AccountMirrorCatalogResult,
  type AccountMirrorCatalogService,
} from '../accountMirror/catalogService.js';
import {
  createAccountMirrorSchedulerPassService,
  type AccountMirrorSchedulerPassResult,
  type AccountMirrorSchedulerPassService,
} from '../accountMirror/schedulerService.js';
import {
  createAccountMirrorSchedulerPassLedger,
  type AccountMirrorSchedulerPassHistory,
  type AccountMirrorSchedulerPassLedger,
} from '../accountMirror/schedulerLedger.js';
import {
  summarizeAccountMirrorSchedulerHistory,
  type AccountMirrorSchedulerCompactHistory,
} from '../accountMirror/schedulerHistorySummary.js';
import {
  createAccountMirrorCompletionService,
  type AccountMirrorCompletionOperation,
  type AccountMirrorCompletionService,
} from '../accountMirror/completionService.js';
import { reconcileConfiguredAccountMirrorLiveFollow } from '../accountMirror/liveFollowReconciler.js';
import { createAccountMirrorCompletionStore } from '../accountMirror/completionStore.js';
import type { AccountMirrorProvider } from '../accountMirror/politePolicy.js';
import {
  summarizeLiveFollowHealth,
  type LiveFollowHealthSummary,
} from '../status/liveFollowHealth.js';

export const DEFAULT_BACKGROUND_DRAIN_INTERVAL_MS = 60_000;

export interface ResponsesHttpServerOptions {
  host?: string;
  port?: number;
  logger?: (message: string) => void;
  recoverRunsOnStart?: boolean;
  recoverRunsOnStartMaxRuns?: number;
  recoverRunsOnStartSourceKind?: ExecutionRunSourceKind | 'all';
  backgroundDrainIntervalMs?: number;
  accountMirrorSchedulerIntervalMs?: number;
  accountMirrorSchedulerDryRun?: boolean;
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
  accountMirrorStatusRegistry?: AccountMirrorStatusRegistry;
  accountMirrorRefreshService?: AccountMirrorRefreshService;
  accountMirrorCatalogService?: AccountMirrorCatalogService;
  accountMirrorSchedulerService?: AccountMirrorSchedulerPassService;
  accountMirrorSchedulerLedger?: AccountMirrorSchedulerPassLedger;
  accountMirrorCompletionService?: AccountMirrorCompletionService;
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

interface HttpAccountMirrorRefreshResponse extends AccountMirrorRefreshResult {}
interface HttpAccountMirrorCatalogResponse extends AccountMirrorCatalogResult {}
interface HttpAccountMirrorSchedulerHistoryResponse extends AccountMirrorSchedulerCompactHistory {}
interface HttpAccountMirrorCompletionResponse extends AccountMirrorCompletionOperation {}
interface HttpAccountMirrorCompletionListResponse {
  object: 'list';
  data: AccountMirrorCompletionOperation[];
  count: number;
}

type AccountMirrorSchedulerWakeReason =
  | 'startup-cadence'
  | 'cadence'
  | 'operator-run-once'
  | 'operator-resume'
  | 'media-generation-settled'
  | 'response-drain-completed';

type AccountMirrorSchedulerOperatorPosture =
  | 'disabled'
  | 'paused'
  | 'running'
  | 'scheduled'
  | 'ready'
  | 'healthy'
  | 'backpressured';

interface AccountMirrorSchedulerOperatorStatus {
  posture: AccountMirrorSchedulerOperatorPosture;
  reason: string;
  backpressureReason: string | null;
}

interface AccountMirrorCompletionStatusSummary {
  object: 'account_mirror_completion_summary';
  generatedAt: string;
  metrics: {
    total: number;
    active: number;
    queued: number;
    running: number;
    paused: number;
    completed: number;
    blocked: number;
    failed: number;
    cancelled: number;
  };
  active: AccountMirrorCompletionOperation[];
  recent: AccountMirrorCompletionOperation[];
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
    accountMirrorStatus: string;
    accountMirrorCatalog: string;
    accountMirrorRefresh: string;
    accountMirrorCompletionsCreate: string;
    accountMirrorCompletionsList: string;
    accountMirrorCompletionsGetTemplate: string;
    accountMirrorCompletionsControlTemplate: string;
    accountMirrorSchedulerHistory: string;
    workbenchCapabilitiesList: string;
    operatorBrowserDashboard: string;
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
  accountMirrorScheduler: {
    enabled: boolean;
    dryRun: boolean;
    intervalMs: number | null;
    state: 'disabled' | 'idle' | 'scheduled' | 'running' | 'paused';
    paused: boolean;
    lastWakeReason: AccountMirrorSchedulerWakeReason | null;
    lastWakeAt: string | null;
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
    lastPass: AccountMirrorSchedulerPassResult | null;
    operatorStatus: AccountMirrorSchedulerOperatorStatus;
    history: AccountMirrorSchedulerPassHistory;
  };
  accountMirrorStatus: AccountMirrorStatusSummary;
  accountMirrorCompletions: AccountMirrorCompletionStatusSummary;
  liveFollow: LiveFollowHealthSummary;
  executionHints: {
    headerNames: string[];
    bodyObject: 'auracall';
  };
  controlResult?:
    | {
        kind: 'background-drain';
        action: 'pause' | 'resume';
      }
    | {
        kind: 'account-mirror-scheduler';
        action: 'pause' | 'resume' | 'run-once';
        dryRun: boolean;
      }
    | {
        kind: 'account-mirror-completion';
        action: 'pause' | 'resume' | 'cancel';
        id: string;
        status: AccountMirrorCompletionOperation['status'];
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
  const accountMirrorSchedulerIntervalMs = Math.max(0, options.accountMirrorSchedulerIntervalMs ?? 0);
  const accountMirrorSchedulerDryRun = options.accountMirrorSchedulerDryRun ?? true;
  const configuredRuntimeConfig = deps.config;
  const resolvedUserConfig = asResolvedUserConfig(configuredRuntimeConfig);
  const accountMirrorPersistence = createAccountMirrorPersistence({
    config: configuredRuntimeConfig,
  });
  const accountMirrorStatusRegistry = deps.accountMirrorStatusRegistry ?? createAccountMirrorStatusRegistry({
    config: configuredRuntimeConfig,
    now,
    readPersistentState: accountMirrorPersistence.readState,
  });
  const accountMirrorRefreshService = deps.accountMirrorRefreshService ?? createAccountMirrorRefreshService({
    config: configuredRuntimeConfig,
    registry: accountMirrorStatusRegistry,
    persistence: accountMirrorPersistence,
    now,
  });
  const accountMirrorCatalogService = deps.accountMirrorCatalogService ?? createAccountMirrorCatalogService({
    config: configuredRuntimeConfig,
    registry: accountMirrorStatusRegistry,
    persistence: accountMirrorPersistence,
    now,
  });
  const accountMirrorSchedulerService = deps.accountMirrorSchedulerService ?? createAccountMirrorSchedulerPassService({
    registry: accountMirrorStatusRegistry,
    refreshService: accountMirrorRefreshService,
    now,
  });
  const accountMirrorSchedulerLedger = deps.accountMirrorSchedulerLedger ?? createAccountMirrorSchedulerPassLedger({
    config: configuredRuntimeConfig,
  });
  const accountMirrorCompletionStore = createAccountMirrorCompletionStore({
    config: configuredRuntimeConfig,
  });
  const initialAccountMirrorCompletions = deps.accountMirrorCompletionService
    ? []
    : await accountMirrorCompletionStore.listOperations({ activeOnly: false, limit: null });
  const accountMirrorCompletionService = deps.accountMirrorCompletionService ?? createAccountMirrorCompletionService({
    registry: accountMirrorStatusRegistry,
    refreshService: accountMirrorRefreshService,
    store: accountMirrorCompletionStore,
    initialOperations: initialAccountMirrorCompletions,
    resumeActiveOperations: true,
    now,
    onPersistError: (error, operation) => {
      logger(`Account mirror completion ${operation.id} persist failed: ${error instanceof Error ? error.message : String(error)}`);
    },
  });
  await reconcileConfiguredAccountMirrorLiveFollow({
    registry: accountMirrorStatusRegistry,
    completionService: accountMirrorCompletionService,
  }).catch((error) => {
    logger(`Account mirror live-follow reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
  });
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
    onGenerationSettled: () => {
      scheduleAccountMirrorSchedulerFollowUp(0, 'media-generation-settled');
    },
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
  const accountMirrorSchedulerState: HttpStatusResponse['accountMirrorScheduler'] = {
    enabled: accountMirrorSchedulerIntervalMs > 0,
    dryRun: accountMirrorSchedulerDryRun,
    intervalMs: accountMirrorSchedulerIntervalMs > 0 ? accountMirrorSchedulerIntervalMs : null,
    state: accountMirrorSchedulerIntervalMs > 0 ? 'idle' : 'disabled',
    paused: false,
    lastWakeReason: null,
    lastWakeAt: null,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastPass: null,
    operatorStatus: {
      posture: accountMirrorSchedulerIntervalMs > 0 ? 'ready' : 'disabled',
      reason: accountMirrorSchedulerIntervalMs > 0
        ? 'account mirror scheduler is enabled and waiting for its first pass'
        : 'account mirror scheduler is disabled; set --account-mirror-scheduler-interval-ms to enable cadence and live-follow wakes',
      backpressureReason: null,
    },
    history: await accountMirrorSchedulerLedger.readHistory().catch((error) => {
      logger(error instanceof Error ? error.message : String(error));
      return {
        object: 'account_mirror_scheduler_pass_history',
        version: 1,
        updatedAt: null,
        limit: 50,
        entries: [],
      };
    }),
  };
  let backgroundDrainPaused = false;
  let accountMirrorSchedulerPaused = false;
  let accountMirrorFollowUpAfterNextDrain = false;
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
      if (accountMirrorFollowUpAfterNextDrain) {
        accountMirrorFollowUpAfterNextDrain = false;
        scheduleAccountMirrorSchedulerFollowUp(0, 'response-drain-completed');
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
  let accountMirrorSchedulerTimer: NodeJS.Timeout | null = null;
  let accountMirrorSchedulerScheduled = false;
  const runAccountMirrorSchedulerPass = async (input: {
    dryRun: boolean;
    wakeReason: AccountMirrorSchedulerWakeReason;
  }) => {
    if (accountMirrorSchedulerState.state === 'running') {
      return false;
    }
    const wakeAt = now().toISOString();
    accountMirrorSchedulerState.state = 'running';
    accountMirrorSchedulerState.lastWakeReason = input.wakeReason;
    accountMirrorSchedulerState.lastWakeAt = wakeAt;
    accountMirrorSchedulerState.lastStartedAt = wakeAt;
    try {
      accountMirrorSchedulerState.lastPass = await accountMirrorSchedulerService.runOnce({
        dryRun: input.dryRun,
      });
      accountMirrorSchedulerState.history = await accountMirrorSchedulerLedger
        .appendPass(accountMirrorSchedulerState.lastPass)
        .catch((error) => {
          logger(error instanceof Error ? error.message : String(error));
          return accountMirrorSchedulerState.history;
        });
    } catch (error) {
      logger(error instanceof Error ? error.message : String(error));
    } finally {
      accountMirrorSchedulerState.lastCompletedAt = now().toISOString();
      accountMirrorSchedulerState.state = closed
        ? 'disabled'
        : accountMirrorSchedulerPaused
          ? 'paused'
          : accountMirrorSchedulerIntervalMs > 0
            ? 'idle'
            : 'disabled';
    }
    return true;
  };
  const scheduleAccountMirrorScheduler = (
    delayMs = accountMirrorSchedulerIntervalMs,
    wakeReason: AccountMirrorSchedulerWakeReason = 'cadence',
  ) => {
    if (
      closed ||
      accountMirrorSchedulerIntervalMs <= 0 ||
      accountMirrorSchedulerPaused ||
      accountMirrorSchedulerScheduled ||
      accountMirrorSchedulerState.state === 'running'
    ) {
      return;
    }
    accountMirrorSchedulerScheduled = true;
    accountMirrorSchedulerState.state = 'scheduled';
    accountMirrorSchedulerTimer = setTimeout(async () => {
      accountMirrorSchedulerScheduled = false;
      accountMirrorSchedulerTimer = null;
      if (closed) {
        return;
      }
      await runAccountMirrorSchedulerPass({
        dryRun: accountMirrorSchedulerDryRun,
        wakeReason,
      });
      scheduleAccountMirrorScheduler(accountMirrorSchedulerIntervalMs, 'cadence');
    }, delayMs);
  };
  const scheduleAccountMirrorSchedulerFollowUp = (
    delayMs = 0,
    wakeReason: AccountMirrorSchedulerWakeReason,
  ) => {
    if (
      closed ||
      accountMirrorSchedulerIntervalMs <= 0 ||
      accountMirrorSchedulerPaused ||
      accountMirrorSchedulerState.state === 'running'
    ) {
      return;
    }
    if (accountMirrorSchedulerScheduled && accountMirrorSchedulerTimer) {
      clearTimeout(accountMirrorSchedulerTimer);
      accountMirrorSchedulerTimer = null;
      accountMirrorSchedulerScheduled = false;
    }
    scheduleAccountMirrorScheduler(delayMs, wakeReason);
  };
  const server = http.createServer();

  server.on('request', async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');

      if (req.method === 'GET' && (url.pathname === '/ops/browser' || url.pathname === '/dashboard')) {
        sendHtml(res, 200, createOperatorBrowserDashboardHtml());
        return;
      }

      if (req.method === 'GET' && url.pathname === '/status') {
        const statusQuery = parseStatusQuery(url.searchParams);
        await accountMirrorStatusRegistry.refreshPersistentState?.();
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
          accountMirrorScheduler: accountMirrorSchedulerState,
          accountMirrorStatus: accountMirrorStatusRegistry.readStatus(),
          accountMirrorCompletions: createAccountMirrorCompletionStatusSummary(accountMirrorCompletionService, now),
        });
        sendJson(res, 200, statusResponse);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/account-mirrors/status') {
        const query = parseAccountMirrorStatusQuery(url.searchParams);
        await accountMirrorStatusRegistry.refreshPersistentState?.();
        sendJson(res, 200, accountMirrorStatusRegistry.readStatus(query));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/account-mirrors/catalog') {
        const query = parseAccountMirrorCatalogQuery(url.searchParams);
        const result: HttpAccountMirrorCatalogResponse = await accountMirrorCatalogService.readCatalog(query);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/account-mirrors/scheduler/history') {
        const limit = parsePositiveIntegerQuery(url.searchParams.get('limit'));
        const history = await accountMirrorSchedulerLedger.readHistory();
        accountMirrorSchedulerState.history = history;
        sendJson(
          res,
          200,
          summarizeAccountMirrorSchedulerHistory(history, { limit }) satisfies HttpAccountMirrorSchedulerHistoryResponse,
        );
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/account-mirrors/completions') {
        const body = await readRequestBody(req);
        const payload = ACCOUNT_MIRROR_COMPLETION_REQUEST_SCHEMA.parse(JSON.parse(body || '{}'));
        const result = accountMirrorCompletionService.start({
          provider: payload.provider,
          runtimeProfileId: payload.runtimeProfile,
          maxPasses: payload.maxPasses,
        });
        sendJson(res, 202, result satisfies HttpAccountMirrorCompletionResponse);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/account-mirrors/completions') {
        const query = parseAccountMirrorCompletionListQuery(url.searchParams);
        const data = accountMirrorCompletionService.list(query);
        sendJson(res, 200, {
          object: 'list',
          data,
          count: data.length,
        } satisfies HttpAccountMirrorCompletionListResponse);
        return;
      }

      const accountMirrorCompletionId = matchAccountMirrorCompletionRoute(url.pathname);
      if (req.method === 'GET' && accountMirrorCompletionId) {
        const result = accountMirrorCompletionService.read(accountMirrorCompletionId);
        if (!result) {
          sendJson(res, 404, {
            error: {
              message: `Account mirror completion ${accountMirrorCompletionId} was not found.`,
              type: 'not_found_error',
            },
          });
          return;
        }
        sendJson(res, 200, result satisfies HttpAccountMirrorCompletionResponse);
        return;
      }

      if (req.method === 'POST' && accountMirrorCompletionId) {
        const body = await readRequestBody(req);
        const payload = ACCOUNT_MIRROR_COMPLETION_CONTROL_REQUEST_SCHEMA.parse(JSON.parse(body || '{}'));
        const result = accountMirrorCompletionService.control({
          id: accountMirrorCompletionId,
          action: payload.action,
        });
        if (!result) {
          sendJson(res, 404, {
            error: {
              message: `Account mirror completion ${accountMirrorCompletionId} was not found.`,
              type: 'not_found_error',
            },
          });
          return;
        }
        sendJson(res, 200, result satisfies HttpAccountMirrorCompletionResponse);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/account-mirrors/refresh') {
        const body = await readRequestBody(req);
        const payload = ACCOUNT_MIRROR_REFRESH_REQUEST_SCHEMA.parse(JSON.parse(body || '{}'));
        try {
          const result = await accountMirrorRefreshService.requestRefresh({
            provider: payload.provider,
            runtimeProfileId: payload.runtimeProfile,
            explicitRefresh: payload.explicitRefresh,
            queueTimeoutMs: payload.queueTimeoutMs,
            queuePollMs: payload.queuePollMs,
          });
          sendJson(res, 202, result satisfies HttpAccountMirrorRefreshResponse);
          return;
        } catch (error) {
          if (error instanceof AccountMirrorRefreshError) {
            sendJson(res, error.statusCode, {
              error: {
                message: error.message,
                type: error.statusCode === 404 ? 'not_found_error' : 'invalid_request_error',
                code: error.code,
                details: error.details,
              },
            });
            return;
          }
          throw error;
        }
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
        const payload = STATUS_CONTROL_REQUEST_SCHEMA.parse(JSON.parse(body || '{}'));
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
        } else if ('accountMirrorScheduler' in payload) {
          const action = payload.accountMirrorScheduler.action;
          if (action === 'pause' || action === 'resume') {
            if (accountMirrorSchedulerIntervalMs <= 0) {
              sendJson(res, 409, {
                error: {
                  message: 'account mirror scheduler is not enabled for this server',
                  type: 'invalid_request_error',
                },
              } satisfies HttpErrorPayload);
              return;
            }
            if (action === 'pause') {
              accountMirrorSchedulerPaused = true;
              accountMirrorSchedulerState.paused = true;
              if (accountMirrorSchedulerTimer) {
                clearTimeout(accountMirrorSchedulerTimer);
                accountMirrorSchedulerTimer = null;
              }
              accountMirrorSchedulerScheduled = false;
              if (accountMirrorSchedulerState.state !== 'running') {
                accountMirrorSchedulerState.state = 'paused';
              }
            } else {
              accountMirrorSchedulerPaused = false;
              accountMirrorSchedulerState.paused = false;
              if (accountMirrorSchedulerState.state !== 'running') {
                accountMirrorSchedulerState.state = 'idle';
              }
              scheduleAccountMirrorScheduler(0, 'operator-resume');
            }
            controlResult = {
              kind: 'account-mirror-scheduler',
              action,
              dryRun: accountMirrorSchedulerDryRun,
            };
          } else {
            const requestedDryRun = payload.accountMirrorScheduler.dryRun ?? true;
            const dryRun = accountMirrorSchedulerDryRun ? true : requestedDryRun;
            const ran = await runAccountMirrorSchedulerPass({
              dryRun,
              wakeReason: 'operator-run-once',
            });
            if (!ran) {
              sendJson(res, 409, {
                error: {
                  message: 'account mirror scheduler is already running',
                  type: 'invalid_request_error',
                },
              } satisfies HttpErrorPayload);
              return;
            }
            controlResult = {
              kind: 'account-mirror-scheduler',
              action,
              dryRun,
            };
          }
        } else if ('accountMirrorCompletion' in payload) {
          const { id, action } = payload.accountMirrorCompletion;
          const operation = accountMirrorCompletionService.control({ id, action });
          if (!operation) {
            sendJson(res, 404, {
              error: {
                message: `account mirror completion not found: ${id}`,
                type: 'not_found_error',
              },
            } satisfies HttpErrorPayload);
            return;
          }
          controlResult = {
            kind: 'account-mirror-completion',
            action,
            id,
            status: operation.status,
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
          accountMirrorScheduler: accountMirrorSchedulerState,
          accountMirrorStatus: accountMirrorStatusRegistry.readStatus(),
          accountMirrorCompletions: createAccountMirrorCompletionStatusSummary(accountMirrorCompletionService, now),
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
        const payload = TEAM_RUN_CREATE_REQUEST_SCHEMA.parse(JSON.parse(body || '{}'));
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
          accountMirrorFollowUpAfterNextDrain = true;
          scheduleBackgroundDrain(0);
          sendJson(res, 200, createdResponse);
        } else {
          await drainThroughServerHost({
            runId: createdResponse.id,
            maxRuns: 1,
            trigger: 'request-create',
          });
          scheduleAccountMirrorSchedulerFollowUp(0, 'response-drain-completed');
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
  scheduleAccountMirrorScheduler(accountMirrorSchedulerIntervalMs, 'startup-cadence');

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
      if (accountMirrorSchedulerTimer) {
        clearTimeout(accountMirrorSchedulerTimer);
        accountMirrorSchedulerTimer = null;
      }
      backgroundDrainPaused = false;
      accountMirrorSchedulerPaused = false;
      backgroundDrainState.paused = false;
      backgroundDrainState.state = 'disabled';
      accountMirrorSchedulerState.paused = false;
      accountMirrorSchedulerState.state = 'disabled';
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
      backgroundDrainIntervalMs: serverOptions.backgroundDrainIntervalMs ?? DEFAULT_BACKGROUND_DRAIN_INTERVAL_MS,
      accountMirrorSchedulerIntervalMs: serverOptions.accountMirrorSchedulerIntervalMs ?? 0,
      accountMirrorSchedulerDryRun: serverOptions.accountMirrorSchedulerDryRun ?? true,
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
    'Endpoints: GET /status, GET /status/recovery/{run_id}, POST /v1/team-runs, GET /v1/team-runs/inspect, GET /v1/runtime-runs/inspect, GET /v1/models, GET /v1/workbench-capabilities, POST /v1/responses, GET /v1/responses/{response_id}, POST /v1/media-generations, GET /v1/media-generations/{media_generation_id}, GET /v1/account-mirrors/status, GET /v1/account-mirrors/catalog, GET /v1/account-mirrors/scheduler/history, POST /v1/account-mirrors/refresh, POST /v1/account-mirrors/completions, GET /v1/account-mirrors/completions, GET/POST /v1/account-mirrors/completions/{completion_id}',
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
  accountMirrorScheduler: HttpStatusResponse['accountMirrorScheduler'];
  accountMirrorStatus: AccountMirrorStatusSummary;
  accountMirrorCompletions: AccountMirrorCompletionStatusSummary;
  controlResult?: HttpStatusResponse['controlResult'];
}): HttpStatusResponse {
  const accountMirrorScheduler = {
    ...input.accountMirrorScheduler,
    operatorStatus: createAccountMirrorSchedulerOperatorStatus(input.accountMirrorScheduler),
  };
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
      accountMirrorStatus: '/v1/account-mirrors/status[?provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&explicitRefresh=true]',
      accountMirrorCatalog: '/v1/account-mirrors/catalog[?provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&kind=projects|conversations|artifacts|files|media|all][&limit=50]',
      accountMirrorRefresh: '/v1/account-mirrors/refresh',
      accountMirrorCompletionsCreate: '/v1/account-mirrors/completions',
      accountMirrorCompletionsList: '/v1/account-mirrors/completions[?status=active|queued|running|paused|completed|blocked|failed|cancelled][&provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&limit=50]',
      accountMirrorCompletionsGetTemplate: '/v1/account-mirrors/completions/{completion_id}',
      accountMirrorCompletionsControlTemplate: 'POST /v1/account-mirrors/completions/{completion_id} {"action":"pause|resume|cancel"}',
      accountMirrorSchedulerHistory: '/v1/account-mirrors/scheduler/history[?limit=10]',
      workbenchCapabilitiesList:
        '/v1/workbench-capabilities?provider={chatgpt|gemini|grok}&category={category}[&entrypoint=grok-imagine][&diagnostics=browser-state][&discoveryAction=grok-imagine-video-mode]',
      operatorBrowserDashboard: '/ops/browser',
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
    accountMirrorScheduler,
    accountMirrorStatus: input.accountMirrorStatus,
    accountMirrorCompletions: input.accountMirrorCompletions,
    liveFollow: createLiveFollowHealthSummary(accountMirrorScheduler, input.accountMirrorCompletions),
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

function createLiveFollowHealthSummary(
  scheduler: HttpStatusResponse['accountMirrorScheduler'],
  completions: AccountMirrorCompletionStatusSummary,
): LiveFollowHealthSummary {
  const backpressureReason = scheduler.lastPass?.backpressure.reason ?? scheduler.operatorStatus.backpressureReason;
  const latestYield = summarizeAccountMirrorSchedulerHistory(scheduler.history, { limit: 10 }).latestYield;
  return summarizeLiveFollowHealth({
    schedulerPosture: scheduler.operatorStatus.posture,
    schedulerState: scheduler.state,
    backpressureReason: backpressureReason ?? 'unknown',
    activeCompletions: completions.metrics.active,
    pausedCompletions: completions.metrics.paused,
    failedCompletions: completions.metrics.failed,
    cancelledCompletions: completions.metrics.cancelled,
    latestYield: latestYield
      ? {
          completedAt: latestYield.completedAt,
          provider: latestYield.provider,
          runtimeProfileId: latestYield.runtimeProfileId,
          queuedOwnerCommand: latestYield.queuedWork.ownerCommand,
          remainingDetailSurfaces: latestYield.remainingDetailSurfaces?.total ?? null,
        }
      : null,
  });
}

function createAccountMirrorCompletionStatusSummary(
  service: AccountMirrorCompletionService,
  now: () => Date,
): AccountMirrorCompletionStatusSummary {
  const all = service.list({ limit: 50 });
  const active = service.list({ status: 'active', limit: 10 });
  const metrics = all.reduce<AccountMirrorCompletionStatusSummary['metrics']>(
    (acc, operation) => {
      acc.total += 1;
      acc[operation.status] += 1;
      if (operation.status === 'queued' || operation.status === 'running' || operation.status === 'paused') {
        acc.active += 1;
      }
      return acc;
    },
    {
      total: 0,
      active: 0,
      queued: 0,
      running: 0,
      paused: 0,
      completed: 0,
      blocked: 0,
      failed: 0,
      cancelled: 0,
    },
  );
  return {
    object: 'account_mirror_completion_summary',
    generatedAt: now().toISOString(),
    metrics,
    active,
    recent: all.slice(0, 10),
  };
}

function createAccountMirrorSchedulerOperatorStatus(
  scheduler: HttpStatusResponse['accountMirrorScheduler'],
): AccountMirrorSchedulerOperatorStatus {
  if (!scheduler.enabled) {
    return {
      posture: 'disabled',
      reason:
        'account mirror scheduler is disabled; set --account-mirror-scheduler-interval-ms to enable cadence and live-follow wakes',
      backpressureReason: null,
    };
  }
  if (scheduler.paused || scheduler.state === 'paused') {
    return {
      posture: 'paused',
      reason: 'account mirror scheduler is paused by operator control',
      backpressureReason: null,
    };
  }
  if (scheduler.state === 'running') {
    return {
      posture: 'running',
      reason: 'account mirror scheduler pass is currently running',
      backpressureReason: null,
    };
  }
  const backpressureReason = scheduler.lastPass?.backpressure?.reason ?? null;
  if (backpressureReason && backpressureReason !== 'none') {
    return {
      posture: 'backpressured',
      reason: scheduler.lastPass?.backpressure?.message ?? `latest pass reported ${backpressureReason}`,
      backpressureReason,
    };
  }
  if (scheduler.lastPass) {
    return {
      posture: 'healthy',
      reason: 'latest account mirror scheduler pass completed without backpressure',
      backpressureReason: backpressureReason ?? null,
    };
  }
  if (scheduler.state === 'scheduled') {
    return {
      posture: 'scheduled',
      reason: 'account mirror scheduler has a pass queued on its cadence timer',
      backpressureReason: null,
    };
  }
  return {
    posture: 'ready',
    reason: 'account mirror scheduler is enabled and waiting for its first pass',
    backpressureReason: null,
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

const COMPACT_TEAM_RUN_CREATE_REQUEST_SCHEMA = z.object({
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

const TEAM_RUN_CREATE_REQUEST_SCHEMA = COMPACT_TEAM_RUN_CREATE_REQUEST_SCHEMA.extend({
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

const ACCOUNT_MIRROR_REFRESH_REQUEST_SCHEMA = z.object({
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfile: z.string().trim().min(1).optional(),
  explicitRefresh: z.boolean().optional(),
  queueTimeoutMs: z.number().int().nonnegative().optional(),
  queuePollMs: z.number().int().positive().optional(),
});

const ACCOUNT_MIRROR_COMPLETION_REQUEST_SCHEMA = z.object({
  provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
  runtimeProfile: z.string().trim().min(1).optional(),
  maxPasses: z.number().int().positive().max(500).optional(),
});

const ACCOUNT_MIRROR_COMPLETION_CONTROL_REQUEST_SCHEMA = z.object({
  action: z.enum(['pause', 'resume', 'cancel']),
});

const STATUS_CONTROL_REQUEST_SCHEMA = z.union([
  z.object({
    backgroundDrain: z.object({
      action: z.enum(['pause', 'resume']),
    }),
  }),
  z.object({
    accountMirrorScheduler: z.object({
      action: z.enum(['pause', 'resume', 'run-once']),
      dryRun: z.boolean().optional(),
    }),
  }),
  z.object({
    accountMirrorCompletion: z.object({
      action: z.enum(['pause', 'resume', 'cancel']),
      id: z.string().min(1),
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

type StatusControlRequest = z.infer<typeof STATUS_CONTROL_REQUEST_SCHEMA>;

type ServiceHostStatusControlRequest = Exclude<
  StatusControlRequest,
  { backgroundDrain: unknown } | { accountMirrorScheduler: unknown } | { accountMirrorCompletion: unknown }
>;

function createServiceHostOperatorControlInput(payload: ServiceHostStatusControlRequest): ExecutionServiceHostOperatorControlInput {
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

interface ParsedAccountMirrorStatusQuery {
  provider?: AccountMirrorProvider;
  runtimeProfileId?: string;
  explicitRefresh?: boolean;
}

interface ParsedAccountMirrorCatalogQuery {
  provider?: AccountMirrorProvider;
  runtimeProfileId?: string;
  kind?: AccountMirrorCatalogKind;
  limit?: number;
}

interface ParsedAccountMirrorCompletionListQuery {
  provider?: AccountMirrorProvider;
  runtimeProfileId?: string;
  status?: AccountMirrorCompletionOperation['status'] | 'active';
  activeOnly?: boolean;
  limit?: number;
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

function parseAccountMirrorStatusQuery(searchParams: URLSearchParams): ParsedAccountMirrorStatusQuery {
  const raw: Record<string, unknown> = {};
  if (searchParams.has('provider')) {
    raw.provider = searchParams.get('provider');
  }
  if (searchParams.has('runtimeProfile')) {
    raw.runtimeProfile = searchParams.get('runtimeProfile');
  }
  if (searchParams.has('explicitRefresh')) {
    raw.explicitRefresh = searchParams.get('explicitRefresh');
  }
  const parsed = z.object({
    provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
    runtimeProfile: z.string().trim().min(1).optional(),
    explicitRefresh: z
      .enum(['0', '1', 'true', 'false'])
      .transform((value) => value === '1' || value.toLowerCase() === 'true')
      .optional(),
  }).parse(raw);
  return {
    provider: parsed.provider,
    runtimeProfileId: parsed.runtimeProfile,
    explicitRefresh: parsed.explicitRefresh,
  };
}

function parseAccountMirrorCatalogQuery(searchParams: URLSearchParams): ParsedAccountMirrorCatalogQuery {
  const raw: Record<string, unknown> = {};
  if (searchParams.has('provider')) {
    raw.provider = searchParams.get('provider');
  }
  if (searchParams.has('runtimeProfile')) {
    raw.runtimeProfile = searchParams.get('runtimeProfile');
  }
  if (searchParams.has('kind')) {
    raw.kind = searchParams.get('kind');
  }
  if (searchParams.has('limit')) {
    raw.limit = searchParams.get('limit');
  }
  const parsed = z.object({
    provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
    runtimeProfile: z.string().trim().min(1).optional(),
    kind: z.enum(['all', 'projects', 'conversations', 'artifacts', 'files', 'media']).optional(),
    limit: z.coerce.number().int().nonnegative().optional(),
  }).parse(raw);
  return {
    provider: parsed.provider,
    runtimeProfileId: parsed.runtimeProfile,
    kind: parsed.kind,
    limit: parsed.limit,
  };
}

function parseAccountMirrorCompletionListQuery(searchParams: URLSearchParams): ParsedAccountMirrorCompletionListQuery {
  const raw: Record<string, unknown> = {};
  if (searchParams.has('provider')) {
    raw.provider = searchParams.get('provider');
  }
  if (searchParams.has('runtimeProfile')) {
    raw.runtimeProfile = searchParams.get('runtimeProfile');
  }
  if (searchParams.has('status')) {
    raw.status = searchParams.get('status');
  }
  if (searchParams.has('activeOnly')) {
    raw.activeOnly = searchParams.get('activeOnly');
  }
  if (searchParams.has('limit')) {
    raw.limit = searchParams.get('limit');
  }
  const parsed = z.object({
    provider: z.enum(['chatgpt', 'gemini', 'grok']).optional(),
    runtimeProfile: z.string().trim().min(1).optional(),
    status: z.enum(['active', 'queued', 'running', 'paused', 'completed', 'blocked', 'failed', 'cancelled']).optional(),
    activeOnly: z
      .enum(['0', '1', 'true', 'false'])
      .transform((value) => value === '1' || value.toLowerCase() === 'true')
      .optional(),
    limit: z.coerce.number().int().positive().optional(),
  }).parse(raw);
  return {
    provider: parsed.provider,
    runtimeProfileId: parsed.runtimeProfile,
    status: parsed.status,
    activeOnly: parsed.activeOnly,
    limit: parsed.limit,
  };
}

function parsePositiveIntegerQuery(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  return z.coerce.number().int().positive().parse(value);
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

function matchAccountMirrorCompletionRoute(pathname: string): string | null {
  const match = /^\/v1\/account-mirrors\/completions\/([^/]+)$/.exec(pathname);
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

function sendHtml(res: http.ServerResponse, statusCode: number, html: string): void {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

function createOperatorBrowserDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AuraCall Browser Ops</title>
  <style>
    :root {
      color-scheme: dark light;
      --bg: #101114;
      --panel: #181b20;
      --panel-2: #20242b;
      --text: #f2f4f8;
      --muted: #a9b1bd;
      --line: #343a44;
      --accent: #71d3c6;
      --warn: #ffd166;
      --bad: #ff6b6b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 0 0 12px; }
    p { margin: 0; color: var(--muted); }
    a { color: var(--accent); }
    .top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 18px; }
    .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; }
    .panel {
      grid-column: span 12;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    @media (min-width: 900px) {
      .half { grid-column: span 6; }
      .third { grid-column: span 4; }
      .wide { grid-column: span 8; }
    }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    label { color: var(--muted); font-size: 12px; display: grid; gap: 4px; }
    select, input, button {
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      min-height: 34px;
      padding: 6px 9px;
      font: inherit;
    }
    button { cursor: pointer; }
    button.primary { border-color: var(--accent); }
    button:disabled { cursor: not-allowed; opacity: 0.6; }
    dl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 10px; margin: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    pre {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      background: #0b0c0f;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      max-height: 440px;
      overflow: auto;
    }
    .ok { color: var(--accent); }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    .muted { color: var(--muted); }
    .severity-healthy { color: var(--accent); }
    .severity-backpressured, .severity-paused { color: var(--warn); }
    .severity-attention-needed { color: var(--bad); }
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <h1>AuraCall Browser Ops</h1>
        <p>Read-only operator view. Browser diagnostics run only when requested.</p>
      </div>
      <button id="refreshStatus">Refresh Status</button>
    </div>

    <div class="grid">
      <section class="panel half">
        <h2>Server</h2>
        <dl id="serverSummary">
          <dt>Status</dt><dd class="muted">Loading...</dd>
        </dl>
      </section>

      <section class="panel half">
        <h2>Account Mirrors</h2>
        <pre id="mirrorStatus">Loading...</pre>
      </section>

      <section class="panel half">
        <h2>Mirror Live Follow</h2>
        <div class="row" style="margin-bottom: 10px;">
          <label>Completion ID
            <input id="mirrorCompletionId" placeholder="acctmirror_completion_id">
          </label>
          <button id="pauseMirrorCompletion">Pause</button>
          <button id="resumeMirrorCompletion">Resume</button>
          <button id="cancelMirrorCompletion">Cancel</button>
        </div>
        <pre id="mirrorCompletions">Loading...</pre>
      </section>

      <section class="panel wide">
        <h2>Browser Workbench Probe</h2>
        <div class="row" style="margin-bottom: 10px;">
          <label>Provider
            <select id="provider">
              <option value="chatgpt">chatgpt</option>
              <option value="gemini">gemini</option>
              <option value="grok">grok</option>
            </select>
          </label>
          <label>Category
            <select id="category">
              <option value="">all</option>
              <option value="media">media</option>
              <option value="research">research</option>
              <option value="canvas">canvas</option>
              <option value="app">app</option>
              <option value="skill">skill</option>
              <option value="connector">connector</option>
              <option value="file">file</option>
              <option value="search">search</option>
            </select>
          </label>
          <label>Runtime Profile
            <input id="runtimeProfile" placeholder="default">
          </label>
          <button id="probeWorkbench" class="primary">Probe Browser State</button>
        </div>
        <pre id="workbenchOutput">No probe yet.</pre>
      </section>

      <section class="panel third">
        <h2>Run Status</h2>
        <div class="row" style="margin-bottom: 10px;">
          <label>Run ID
            <input id="runId" placeholder="run or media generation id">
          </label>
          <button id="probeRun">Inspect</button>
        </div>
        <pre id="runOutput">No run selected.</pre>
      </section>

      <section class="panel">
        <h2>Useful Endpoints</h2>
        <dl>
          <dt>Dashboard</dt><dd><a href="/ops/browser">/ops/browser</a></dd>
          <dt>Status</dt><dd><a href="/status">/status</a></dd>
          <dt>Workbench</dt><dd>/v1/workbench-capabilities?provider=gemini&amp;diagnostics=browser-state</dd>
          <dt>Run Status</dt><dd>/v1/runs/{run_id}/status?diagnostics=browser-state</dd>
          <dt>Runtime Inspect</dt><dd>/v1/runtime-runs/inspect?runId={run_id}&amp;probe=service-state&amp;diagnostics=browser-state</dd>
        </dl>
      </section>
    </div>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    const asJson = (value) => JSON.stringify(value, null, 2);

    async function fetchJson(path) {
      const response = await fetch(path, { cache: 'no-store' });
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      if (!response.ok) {
        throw new Error(asJson({ status: response.status, payload }));
      }
      return payload;
    }

    function renderServerSummary(status) {
      const binding = status.binding || {};
      const runner = status.runner || {};
      const scheduler = status.accountMirrorScheduler || {};
      const completions = status.accountMirrorCompletions || {};
      const completionMetrics = completions.metrics || {};
      const liveFollow = status.liveFollow || {};
      const dashboard = status.routes && status.routes.operatorBrowserDashboard;
      $('serverSummary').innerHTML = [
        ['Status', status.ok ? '<span class="ok">ok</span>' : '<span class="bad">not ok</span>'],
        ['Version', status.version || 'unknown'],
        ['Binding', [binding.host, binding.port].filter(Boolean).join(':') || 'unknown'],
        ['Local Only', binding.localOnly ? '<span class="ok">true</span>' : '<span class="warn">false</span>'],
        ['Runner', runner.status || 'unknown'],
        ['Runner ID', runner.id || 'none'],
        ['Mirror Scheduler', scheduler.state || 'unknown'],
        ['Mirror Posture', scheduler.operatorStatus ? scheduler.operatorStatus.posture : 'unknown'],
        ['Live Follow Severity', renderSeverity(liveFollow.severity)],
        ['Mirror Wake', scheduler.lastWakeReason || 'none'],
        ['Mirror Wake At', scheduler.lastWakeAt || 'never'],
        ['Live Follow Active', String(completionMetrics.active || 0)],
        ['Live Follow Recent', String(completionMetrics.total || 0)],
        ['Dashboard Route', dashboard || '/ops/browser'],
      ].map(([key, value]) => '<dt>' + key + '</dt><dd>' + value + '</dd>').join('');
    }

    function renderMirrorCompletions(status) {
      const summary = status.accountMirrorCompletions || {};
      const metrics = summary.metrics || {};
      const active = Array.isArray(summary.active) ? summary.active : [];
      const recent = Array.isArray(summary.recent) ? summary.recent : [];
      $('mirrorCompletions').textContent = asJson({
        health: status.liveFollow || null,
        metrics,
        active: active.map(compactCompletion),
        recent: recent.map(compactCompletion),
      });
    }

    function renderSeverity(severity) {
      return '<span class="severity-' + severity + '">' + severity + '</span>';
    }

    function compactCompletion(operation) {
      return {
        id: operation.id,
        target: [operation.provider, operation.runtimeProfileId].filter(Boolean).join('/'),
        status: operation.status,
        mode: operation.mode,
        phase: operation.phase,
        passes: String(operation.passCount || 0) + '/' + (operation.maxPasses || 'unbounded'),
        nextAttemptAt: operation.nextAttemptAt || null,
        completedAt: operation.completedAt || null,
      };
    }

    async function controlMirrorCompletion(action) {
      const id = $('mirrorCompletionId').value.trim();
      if (!id) {
        $('mirrorCompletions').textContent = 'Enter a completion id.';
        return;
      }
      for (const buttonId of ['pauseMirrorCompletion', 'resumeMirrorCompletion', 'cancelMirrorCompletion']) {
        $(buttonId).disabled = true;
      }
      try {
        const result = await fetch('/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accountMirrorCompletion: { id, action } }),
        });
        const payload = await result.json();
        if (!result.ok) {
          throw new Error(asJson({ status: result.status, payload }));
        }
        $('mirrorCompletions').textContent = asJson({ controlled: payload.controlResult || payload });
        await refreshStatus();
      } catch (error) {
        $('mirrorCompletions').textContent = String(error.message || error);
      } finally {
        for (const buttonId of ['pauseMirrorCompletion', 'resumeMirrorCompletion', 'cancelMirrorCompletion']) {
          $(buttonId).disabled = false;
        }
      }
    }

    async function refreshStatus() {
      $('serverSummary').innerHTML = '<dt>Status</dt><dd class="muted">Loading...</dd>';
      $('mirrorStatus').textContent = 'Loading...';
      $('mirrorCompletions').textContent = 'Loading...';
      try {
        const status = await fetchJson('/status');
        renderServerSummary(status);
        renderMirrorCompletions(status);
      } catch (error) {
        $('serverSummary').innerHTML = '<dt>Status</dt><dd class="bad">' + String(error.message || error) + '</dd>';
        $('mirrorCompletions').textContent = String(error.message || error);
      }
      try {
        $('mirrorStatus').textContent = asJson(await fetchJson('/v1/account-mirrors/status'));
      } catch (error) {
        $('mirrorStatus').textContent = String(error.message || error);
      }
    }

    async function probeWorkbench() {
      const button = $('probeWorkbench');
      button.disabled = true;
      $('workbenchOutput').textContent = 'Probing...';
      try {
        const params = new URLSearchParams({
          provider: $('provider').value,
          diagnostics: 'browser-state',
          includeUnavailable: 'true',
        });
        if ($('category').value) params.set('category', $('category').value);
        if ($('runtimeProfile').value.trim()) params.set('runtimeProfile', $('runtimeProfile').value.trim());
        $('workbenchOutput').textContent = asJson(await fetchJson('/v1/workbench-capabilities?' + params.toString()));
      } catch (error) {
        $('workbenchOutput').textContent = String(error.message || error);
      } finally {
        button.disabled = false;
      }
    }

    async function probeRun() {
      const id = $('runId').value.trim();
      if (!id) {
        $('runOutput').textContent = 'Enter a run id.';
        return;
      }
      const button = $('probeRun');
      button.disabled = true;
      $('runOutput').textContent = 'Inspecting...';
      try {
        $('runOutput').textContent = asJson(await fetchJson('/v1/runs/' + encodeURIComponent(id) + '/status?diagnostics=browser-state'));
      } catch (error) {
        $('runOutput').textContent = String(error.message || error);
      } finally {
        button.disabled = false;
      }
    }

    $('refreshStatus').addEventListener('click', refreshStatus);
    $('pauseMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('pause'));
    $('resumeMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('resume'));
    $('cancelMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('cancel'));
    $('probeWorkbench').addEventListener('click', probeWorkbench);
    $('probeRun').addEventListener('click', probeRun);
    refreshStatus();
  </script>
</body>
</html>`;
}
