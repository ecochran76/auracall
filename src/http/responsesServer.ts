import http from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { OptionValues } from 'commander';
import { MODEL_CONFIGS } from '../oracle/config.js';
import { getCliVersion } from '../version.js';
import { getAuracallHomeDir } from '../auracallHome.js';
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
  type AccountMirrorCatalogItemResult,
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
  type LiveFollowTargetAccountSummary,
  type LiveFollowTargetRollup,
} from '../status/liveFollowHealth.js';

export const DEFAULT_BACKGROUND_DRAIN_INTERVAL_MS = 60_000;

export interface ResponsesHttpServerOptions {
  host?: string;
  port?: number;
  dashboardUrl?: string;
  publicDashboardUrl?: string;
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
  terminateProcess?: (pid: number, signal: NodeJS.Signals) => void;
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
  terminateProcess?: ResponsesHttpServerDeps['terminateProcess'];
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
interface HttpAccountMirrorCatalogItemResponse extends AccountMirrorCatalogItemResult {}
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
    accountMirrorCatalogItemTemplate: string;
    accountMirrorRefresh: string;
    accountMirrorCompletionsCreate: string;
    accountMirrorCompletionsList: string;
    accountMirrorCompletionsGetTemplate: string;
    accountMirrorCompletionsControlTemplate: string;
    accountMirrorSchedulerHistory: string;
    workbenchCapabilitiesList: string;
    operatorBrowserDashboard: string;
    accountMirrorDashboard: string;
    operatorBrowserDashboardUrl?: string;
    publicOperatorBrowserDashboardUrl?: string;
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
  const reconcileAccountMirrorLiveFollow = async () => {
    await reconcileConfiguredAccountMirrorLiveFollow({
      registry: accountMirrorStatusRegistry,
      completionService: accountMirrorCompletionService,
    }).catch((error) => {
      logger(`Account mirror live-follow reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  };
  await reconcileAccountMirrorLiveFollow();
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
      await reconcileAccountMirrorLiveFollow();
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
        sendHtml(res, 200, createOperatorBrowserDashboardHtml({ activePage: 'browser' }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/account-mirror') {
        sendHtml(res, 200, createOperatorBrowserDashboardHtml({ activePage: 'account-mirror' }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/account-mirror/preview-session') {
        sendHtml(res, 200, createOperatorBrowserDashboardHtml({ activePage: 'preview-session' }));
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
          dashboardUrl: options.dashboardUrl,
          publicDashboardUrl: options.publicDashboardUrl,
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

      if (req.method === 'GET' && isAccountMirrorCatalogItemAssetRoute(url.pathname)) {
        const query = parseAccountMirrorCatalogItemAssetQuery(url.pathname, url.searchParams);
        const result: HttpAccountMirrorCatalogItemResponse | null = await accountMirrorCatalogService.readItem(query);
        if (!result) {
          sendJson(res, 404, {
            error: {
              message: `Account mirror catalog item ${query.itemId} was not found.`,
              type: 'not_found_error',
            },
          });
          return;
        }
        const asset = await resolveCachedCatalogItemAsset(result, configuredRuntimeConfig);
        if (!asset) {
          sendJson(res, 404, {
            error: {
              message: `Account mirror catalog item ${query.itemId} has no cache-owned local asset.`,
              type: 'not_found_error',
            },
          });
          return;
        }
        sendCachedAsset(res, asset);
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/v1/account-mirrors/catalog/items/')) {
        const query = parseAccountMirrorCatalogItemQuery(url.pathname, url.searchParams);
        const result: HttpAccountMirrorCatalogItemResponse | null = await accountMirrorCatalogService.readItem(query);
        if (!result) {
          sendJson(res, 404, {
            error: {
              message: `Account mirror catalog item ${query.itemId} was not found.`,
              type: 'not_found_error',
            },
          });
          return;
        }
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
          dashboardUrl: options.dashboardUrl,
          publicDashboardUrl: options.publicDashboardUrl,
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
      cancelActiveAccountMirrorCompletions(accountMirrorCompletionService);
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
  const logger = options.logger ?? console.log;
  const {
    listenPublic: _unusedListenPublic,
    cliOptions: _unusedCliOptions,
    executeStoredRunStep: overrideExecuteStoredRunStep,
    mediaGenerationExecutor: overrideMediaGenerationExecutor,
    probeRuntimeRunServiceState: overrideProbeRuntimeRunServiceState,
    terminateProcess: terminateProcessOverride,
    ...serverOptions
  } = options;
  const resolvedUserConfig = await resolveConfig(options.cliOptions ?? {}, process.cwd(), process.env);
  const apiConfig = readApiServerConfig(resolvedUserConfig as Record<string, unknown>);
  serverOptions.host = serverOptions.host ?? apiConfig.host;
  serverOptions.port = serverOptions.port ?? apiConfig.port;
  serverOptions.dashboardUrl = serverOptions.dashboardUrl ?? apiConfig.dashboardUrl;
  serverOptions.publicDashboardUrl = serverOptions.publicDashboardUrl ?? apiConfig.publicDashboardUrl;
  assertResponsesHostAllowed(serverOptions.host, options.listenPublic ?? false);
  await terminateSamePortApiServeProcesses({
    port: serverOptions.port,
    logger,
    terminateProcess: terminateProcessOverride,
  });
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
  const host = serverOptions.host ?? '127.0.0.1';
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
  if (serverOptions.dashboardUrl) {
    logger(`Operator dashboard: ${serverOptions.dashboardUrl}`);
  }
  if (serverOptions.publicDashboardUrl) {
    logger(`Public operator dashboard: ${serverOptions.publicDashboardUrl}`);
  }
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

function cancelActiveAccountMirrorCompletions(service: AccountMirrorCompletionService): void {
  if (service.prepareForShutdown) {
    service.prepareForShutdown();
    return;
  }
  for (const operation of service.list({ status: 'active', limit: null })) {
    service.control({ id: operation.id, action: 'cancel' });
  }
}

export async function terminateSamePortApiServeProcesses(input: {
  port?: number | null;
  logger?: (message: string) => void;
  terminateProcess?: (pid: number, signal: NodeJS.Signals) => void;
  isProcessAlive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  terminationGraceMs?: number;
  currentPid?: number;
  procRoot?: string;
  operationLockRoot?: string;
}): Promise<number[]> {
  const port = normalizeApiServePort(input.port);
  if (port === null) return [];
  const currentPid = input.currentPid ?? process.pid;
  const procRoot = input.procRoot ?? '/proc';
  const terminateProcess = input.terminateProcess ?? ((pid, signal) => process.kill(pid, signal));
  const isProcessAlive = input.isProcessAlive ?? defaultIsProcessAlive;
  const sleep = input.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const matches = await findSamePortApiServeProcesses({
    port,
    currentPid,
    procRoot,
  });
  const terminatedPids: number[] = [];
  for (const match of matches) {
    try {
      terminateProcess(match.pid, 'SIGTERM');
      input.logger?.(`Terminated orphan AuraCall api serve process ${match.pid} for port ${port}.`);
      const exited = await waitForProcessExit(match.pid, {
        isProcessAlive,
        sleep,
        timeoutMs: input.terminationGraceMs ?? 2_000,
        pollMs: 100,
      });
      if (!exited && isProcessAlive(match.pid)) {
        terminateProcess(match.pid, 'SIGKILL');
        input.logger?.(`Force-killed orphan AuraCall api serve process ${match.pid} for port ${port}.`);
      }
      terminatedPids.push(match.pid);
    } catch (error) {
      input.logger?.(
        `Failed to terminate orphan AuraCall api serve process ${match.pid} for port ${port}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const operationLockRoot = input.operationLockRoot ?? path.join(getAuracallHomeDir(), 'browser-operations');
  await removeBrowserOperationLocksForOwnerPids({
    ownerPids: terminatedPids,
    lockRoot: operationLockRoot,
    logger: input.logger,
  });
  await removeStaleBrowserOperationLocks({
    lockRoot: operationLockRoot,
    isProcessAlive,
    logger: input.logger,
  });
  return matches.map((match) => match.pid);
}

async function removeBrowserOperationLocksForOwnerPids(input: {
  ownerPids: number[];
  lockRoot: string;
  logger?: (message: string) => void;
}): Promise<number> {
  const ownerPids = new Set(input.ownerPids);
  if (ownerPids.size === 0) return 0;
  let entries: string[];
  try {
    entries = await fs.readdir(input.lockRoot);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const lockPath = path.join(input.lockRoot, entry);
    try {
      const raw = await fs.readFile(lockPath, 'utf8');
      const parsed = JSON.parse(raw) as { ownerPid?: unknown };
      if (typeof parsed.ownerPid !== 'number' || !ownerPids.has(parsed.ownerPid)) continue;
      await fs.rm(lockPath, { force: true });
      removed += 1;
    } catch {
      continue;
    }
  }
  if (removed > 0) {
    input.logger?.(`Removed ${removed} browser operation lock${removed === 1 ? '' : 's'} owned by terminated api serve process.`);
  }
  return removed;
}

async function removeStaleBrowserOperationLocks(input: {
  lockRoot: string;
  isProcessAlive: (pid: number) => boolean;
  logger?: (message: string) => void;
}): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(input.lockRoot);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const lockPath = path.join(input.lockRoot, entry);
    try {
      const raw = await fs.readFile(lockPath, 'utf8');
      const parsed = JSON.parse(raw) as { ownerPid?: unknown };
      if (typeof parsed.ownerPid !== 'number' || input.isProcessAlive(parsed.ownerPid)) continue;
      await fs.rm(lockPath, { force: true });
      removed += 1;
    } catch {
      continue;
    }
  }
  if (removed > 0) {
    input.logger?.(`Removed ${removed} stale browser operation lock${removed === 1 ? '' : 's'}.`);
  }
  return removed;
}

async function findSamePortApiServeProcesses(input: {
  port: number;
  currentPid: number;
  procRoot: string;
}): Promise<Array<{ pid: number; commandLine: string }>> {
  let entries: string[];
  try {
    entries = await fs.readdir(input.procRoot);
  } catch {
    return [];
  }
  const matches: Array<{ pid: number; commandLine: string }> = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === input.currentPid) continue;
    const commandLine = await readProcCommandLine(input.procRoot, pid);
    if (!commandLine) continue;
    if (isSamePortApiServeCommand(commandLine, input.port)) {
      matches.push({ pid, commandLine });
    }
  }
  return matches;
}

async function readProcCommandLine(procRoot: string, pid: number): Promise<string | null> {
  try {
    const raw = await fs.readFile(`${procRoot}/${pid}/cmdline`);
    return raw.toString('utf8').split('\0').filter(Boolean).join(' ');
  } catch {
    return null;
  }
}

function isSamePortApiServeCommand(commandLine: string, port: number): boolean {
  if (!/^node\s+/.test(commandLine)) return false;
  if (!commandLine.includes('/auracall.js') && !/\bauracall\.js\b/.test(commandLine)) return false;
  if (!/\bapi\s+serve\b/.test(commandLine)) return false;
  return commandLine.includes(`--port ${port}`) || commandLine.includes(`--port=${port}`);
}

function normalizeApiServePort(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const port = Math.trunc(value);
  return port > 0 && port <= 65535 ? port : null;
}

async function waitForProcessExit(pid: number, input: {
  isProcessAlive: (pid: number) => boolean;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
  pollMs: number;
}): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < input.timeoutMs) {
    if (!input.isProcessAlive(pid)) return true;
    await input.sleep(input.pollMs);
  }
  return !input.isProcessAlive(pid);
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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
  dashboardUrl?: string;
  publicDashboardUrl?: string;
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
      accountMirrorCatalogItemTemplate: '/v1/account-mirrors/catalog/items/{item_id}?provider={chatgpt|gemini|grok}&runtimeProfile={runtime_profile}&kind={kind}',
      accountMirrorRefresh: '/v1/account-mirrors/refresh',
      accountMirrorCompletionsCreate: '/v1/account-mirrors/completions',
      accountMirrorCompletionsList: '/v1/account-mirrors/completions[?status=active|queued|running|paused|completed|blocked|failed|cancelled][&provider={chatgpt|gemini|grok}][&runtimeProfile={runtime_profile}][&limit=50]',
      accountMirrorCompletionsGetTemplate: '/v1/account-mirrors/completions/{completion_id}',
      accountMirrorCompletionsControlTemplate: 'POST /v1/account-mirrors/completions/{completion_id} {"action":"pause|resume|cancel"}',
      accountMirrorSchedulerHistory: '/v1/account-mirrors/scheduler/history[?limit=10]',
      workbenchCapabilitiesList:
        '/v1/workbench-capabilities?provider={chatgpt|gemini|grok}&category={category}[&entrypoint=grok-imagine][&diagnostics=browser-state][&discoveryAction=grok-imagine-video-mode]',
      operatorBrowserDashboard: '/ops/browser',
      accountMirrorDashboard: '/account-mirror',
      ...(input.dashboardUrl ? { operatorBrowserDashboardUrl: input.dashboardUrl } : {}),
      ...(input.publicDashboardUrl ? { publicOperatorBrowserDashboardUrl: input.publicDashboardUrl } : {}),
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
    liveFollow: createLiveFollowHealthSummary(
      accountMirrorScheduler,
      input.accountMirrorCompletions,
      input.accountMirrorStatus,
    ),
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
  status: AccountMirrorStatusSummary,
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
    targets: createLiveFollowTargetRollup(status, completions),
  });
}

function createLiveFollowTargetRollup(
  status: AccountMirrorStatusSummary,
  completions: AccountMirrorCompletionStatusSummary,
): LiveFollowTargetRollup {
  const activeOperations = completions.active;
  const recentOperations = completions.recent;
  const accounts = status.entries.map((entry): LiveFollowTargetAccountSummary => {
    const activeOperation = activeOperations.find((candidate) =>
      candidate.provider === entry.provider && candidate.runtimeProfileId === entry.runtimeProfileId
    ) ?? null;
    const recentOperation = activeOperation ?? recentOperations.find((candidate) =>
      candidate.provider === entry.provider && candidate.runtimeProfileId === entry.runtimeProfileId
    ) ?? null;
    return {
      provider: entry.provider,
      runtimeProfileId: entry.runtimeProfileId,
      desiredState: entry.liveFollow.state,
      desiredEnabled: entry.liveFollow.enabled,
      actualStatus: activeOperation?.status ?? (entry.mirrorState.running ? 'refreshing' : entry.status),
      activeCompletionId: activeOperation?.id ?? null,
      phase: activeOperation?.phase ?? recentOperation?.phase ?? null,
      passCount: activeOperation?.passCount ?? recentOperation?.passCount ?? null,
      routineEligibleAt: entry.eligibleAt,
      activeCompletionNextAttemptAt: activeOperation?.nextAttemptAt ?? null,
      nextAttemptAt: activeOperation?.nextAttemptAt ?? entry.eligibleAt,
      mirrorCompleteness: entry.mirrorCompleteness.state,
      latestLifecycleEvent: summarizeCompletionLifecycleEvent(activeOperation ?? recentOperation),
      metadataCounts: entry.metadataCounts,
    };
  });
  return accounts.reduce<LiveFollowTargetRollup>(
    (acc, account) => {
      acc.total += 1;
      acc.desired.total += 1;
      if (account.desiredState === 'enabled') {
        acc.enabled += 1;
        acc.desired.enabled += 1;
      } else if (account.desiredState === 'disabled') {
        acc.disabled += 1;
        acc.desired.disabled += 1;
      } else if (account.desiredState === 'unconfigured') {
        acc.unconfigured += 1;
        acc.desired.unconfigured += 1;
      } else if (account.desiredState === 'missing_identity') {
        acc.missingIdentity += 1;
        acc.desired.missingIdentity += 1;
      } else if (account.desiredState === 'unsupported') {
        acc.unsupported += 1;
        acc.desired.unsupported += 1;
      }

      if (!account.desiredEnabled) {
        acc.accounts.push(account);
        return acc;
      }

      if (account.actualStatus === 'queued') {
        acc.queued += 1;
        acc.actual.queued += 1;
      }
      if (account.actualStatus === 'running' || account.actualStatus === 'refreshing') {
        acc.running += 1;
        acc.actual.running += 1;
      }
      if (account.actualStatus === 'paused') {
        acc.paused += 1;
        acc.actual.paused += 1;
      }
      if (
        account.actualStatus === 'queued' ||
        account.actualStatus === 'running' ||
        account.actualStatus === 'refreshing' ||
        account.actualStatus === 'paused'
      ) {
        acc.active += 1;
        acc.actual.active += 1;
      }
      if (
        account.actualStatus === 'blocked' ||
        account.actualStatus === 'failed' ||
        account.actualStatus === 'cancelled'
      ) {
        acc.attentionNeeded += 1;
        acc.actual.attentionNeeded += 1;
      }

      if (account.mirrorCompleteness === 'complete') {
        acc.complete += 1;
        acc.actual.complete += 1;
      } else if (account.mirrorCompleteness === 'in_progress') {
        acc.inProgress += 1;
        acc.actual.inProgress += 1;
      } else if (account.mirrorCompleteness === 'none') {
        acc.none += 1;
        acc.actual.none += 1;
      } else {
        acc.unknown += 1;
        acc.actual.unknown += 1;
      }
      acc.accounts.push(account);
      return acc;
    },
    {
      total: 0,
      enabled: 0,
      disabled: 0,
      unconfigured: 0,
      missingIdentity: 0,
      unsupported: 0,
      active: 0,
      queued: 0,
      running: 0,
      paused: 0,
      attentionNeeded: 0,
      complete: 0,
      inProgress: 0,
      none: 0,
      unknown: 0,
      desired: {
        total: 0,
        enabled: 0,
        disabled: 0,
        unconfigured: 0,
        missingIdentity: 0,
        unsupported: 0,
      },
      actual: {
        active: 0,
        queued: 0,
        running: 0,
        paused: 0,
        attentionNeeded: 0,
        complete: 0,
        inProgress: 0,
        none: 0,
        unknown: 0,
      },
      accounts: [],
    },
  );
}

function summarizeCompletionLifecycleEvent(operation: AccountMirrorCompletionOperation | null): LiveFollowTargetAccountSummary['latestLifecycleEvent'] {
  const event = operation?.lifecycleEvents?.at(-1);
  if (!event) return null;
  return {
    at: event.at,
    type: event.type,
    message: event.message,
  };
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

function readApiServerConfig(config: Record<string, unknown>): {
  host?: string;
  port?: number;
  dashboardUrl?: string;
  publicDashboardUrl?: string;
} {
  const api = config.api;
  if (!isRecord(api)) return {};
  return {
    host: readNonEmptyString(api.host),
    port: readPositiveInteger(api.port),
    dashboardUrl: readNonEmptyString(api.dashboardUrl),
    publicDashboardUrl: readNonEmptyString(api.publicDashboardUrl),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function resolveCachedCatalogItemAsset(
  detail: AccountMirrorCatalogItemResult,
  config: Record<string, unknown> | null | undefined,
): Promise<CachedCatalogItemAsset | null> {
  const item = isRecord(detail.item) ? detail.item : {};
  const localPath = readCatalogAssetStringField(item, ['localPath', 'path', 'filePath', 'absolutePath']);
  const storageRelpath = readCatalogAssetStringField(item, ['assetStorageRelpath', 'storageRelpath']);
  const rawPath = localPath ?? storageRelpath;
  if (!rawPath) return null;
  const resolvedPath = await resolveCacheOwnedAssetPath(rawPath, config);
  if (!resolvedPath) return null;
  const stat = await fs.stat(resolvedPath).catch(() => null);
  if (!stat?.isFile()) return null;
  return {
    path: resolvedPath,
    mimeType: inferCachedAssetMimeType(
      readCatalogAssetStringField(item, ['mimeType', 'mime', 'contentType']),
      readCatalogAssetStringField(item, ['name', 'filename', 'fileName', 'title']) ?? resolvedPath,
    ),
    size: stat.size,
  };
}

async function resolveCacheOwnedAssetPath(
  rawPath: string,
  config: Record<string, unknown> | null | undefined,
): Promise<string | null> {
  const roots = resolveCacheAssetRoots(config);
  const candidates = path.isAbsolute(rawPath)
    ? [path.normalize(rawPath)]
    : roots.map((root) => path.resolve(root, rawPath));
  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (!isPathInsideAnyRoot(normalized, roots)) continue;
    if (await pathExists(normalized)) return normalized;
  }
  return null;
}

function resolveCacheAssetRoots(config: Record<string, unknown> | null | undefined): string[] {
  const configuredRoot = readNestedNonEmptyString(config, ['browser', 'cache', 'rootDir']);
  const roots = [
    configuredRoot ? path.resolve(configuredRoot) : null,
    path.join(getAuracallHomeDir(), 'cache'),
    path.join(getAuracallHomeDir(), 'cache', 'providers'),
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(roots.map((root) => path.normalize(root))));
}

function isPathInsideAnyRoot(candidate: string, roots: string[]): boolean {
  return roots.some((root) => {
    const relative = path.relative(root, candidate);
    return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
  });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function inferCachedAssetMimeType(configured: string | null, fileName: string): string {
  if (configured?.includes('/')) return configured;
  const ext = path.extname(fileName).toLowerCase();
  const types: Record<string, string> = {
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.md': 'text/markdown; charset=utf-8',
    '.markdown': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };
  return types[ext] ?? 'application/octet-stream';
}

function readCatalogAssetStringField(item: Record<string, unknown>, fields: string[]): string | null {
  const direct = readRecordStringField(item, fields);
  if (direct) return direct;
  const metadata = item.metadata;
  return isRecord(metadata) ? readRecordStringField(metadata, fields) : null;
}

function readRecordStringField(item: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = item[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNestedNonEmptyString(
  value: Record<string, unknown> | null | undefined,
  segments: string[],
): string | null {
  let current: unknown = value;
  for (const segment of segments) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return undefined;
  return value;
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

interface ParsedAccountMirrorCatalogItemQuery extends ParsedAccountMirrorCatalogQuery {
  itemId: string;
}

interface CachedCatalogItemAsset {
  path: string;
  mimeType: string;
  size: number;
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

function parseAccountMirrorCatalogItemQuery(
  pathname: string,
  searchParams: URLSearchParams,
): ParsedAccountMirrorCatalogItemQuery {
  const prefix = '/v1/account-mirrors/catalog/items/';
  const encodedItemId = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
  const itemId = decodeURIComponent(encodedItemId).trim();
  if (!itemId) {
    throw new Error('Account mirror catalog item id is required.');
  }
  return {
    ...parseAccountMirrorCatalogQuery(searchParams),
    itemId,
  };
}

function isAccountMirrorCatalogItemAssetRoute(pathname: string): boolean {
  return pathname.startsWith('/v1/account-mirrors/catalog/items/') && pathname.endsWith('/asset');
}

function parseAccountMirrorCatalogItemAssetQuery(
  pathname: string,
  searchParams: URLSearchParams,
): ParsedAccountMirrorCatalogItemQuery {
  const prefix = '/v1/account-mirrors/catalog/items/';
  const suffix = '/asset';
  const encodedItemId = pathname.startsWith(prefix) && pathname.endsWith(suffix)
    ? pathname.slice(prefix.length, -suffix.length)
    : '';
  const itemId = decodeURIComponent(encodedItemId).trim();
  if (!itemId) {
    throw new Error('Account mirror catalog item id is required.');
  }
  return {
    ...parseAccountMirrorCatalogQuery(searchParams),
    itemId,
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

function sendCachedAsset(res: http.ServerResponse, asset: CachedCatalogItemAsset): void {
  res.writeHead(200, {
    'Content-Type': asset.mimeType,
    'Content-Length': String(asset.size),
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
  createReadStream(asset.path).on('error', () => {
    if (!res.headersSent) {
      sendJson(res, 404, {
        error: {
          message: 'Cached asset could not be read.',
          type: 'not_found_error',
        },
      });
      return;
    }
    res.destroy();
  }).pipe(res);
}

function createOperatorBrowserDashboardHtml(input: {
  activePage?: 'browser' | 'account-mirror' | 'preview-session';
} = {}): string {
  const activePage = input.activePage ?? 'browser';
  const browserCurrent = activePage === 'browser' ? ' aria-current="page"' : '';
  const accountMirrorCurrent = activePage === 'account-mirror' ? ' aria-current="page"' : '';
  const previewSessionCurrent = activePage === 'preview-session' ? ' aria-current="page"' : '';
  const pageTitle = activePage === 'account-mirror'
    ? 'AuraCall Account Mirror'
    : activePage === 'preview-session'
      ? 'AuraCall Preview Session'
      : 'AuraCall Browser Ops';
  const pageDescription = activePage === 'account-mirror'
    ? 'Read-only account mirror navigation backed by cached provider indexes.'
    : activePage === 'preview-session'
      ? 'Cache-only review of selected account mirror preview assets.'
      : 'Local operator view. Browser diagnostics run only when requested.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
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
    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: -8px 0 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
    }
    .nav a,
    .nav span {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      text-decoration: none;
      background: #11151a;
    }
    .nav a[aria-current="page"] {
      border-color: var(--accent);
      color: var(--accent);
    }
    .catalog-detail {
      margin-top: 10px;
      display: grid;
      gap: 8px;
    }
    .chat-transcript {
      display: grid;
      gap: 10px;
      margin-bottom: 10px;
    }
    .chat-transcript-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .chat-transcript-actions input {
      min-width: 220px;
      flex: 1 1 260px;
    }
    .chat-turn {
      display: grid;
      gap: 4px;
      max-width: 82%;
    }
    .chat-turn-user { justify-self: end; }
    .chat-turn-assistant, .chat-turn-system, .chat-turn-tool { justify-self: start; }
    .chat-role {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
    }
    .chat-bubble {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 10px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      background: #11151a;
    }
    .chat-turn-user .chat-bubble {
      border-color: var(--accent);
      background: #10211f;
    }
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
    .control-grid { display: grid; gap: 10px; }
    @media (min-width: 720px) {
      .control-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    .control-card {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #11151a;
      padding: 10px;
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .control-title { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .control-title strong { overflow-wrap: anywhere; }
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
    button.link-button {
      min-height: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--accent);
      font: inherit;
      text-decoration: underline;
    }
    dl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 10px; margin: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 6px;
      margin-bottom: 10px;
    }
    table { width: 100%; border-collapse: collapse; min-width: 780px; }
    th, td {
      padding: 7px 8px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }
    th { color: var(--muted); font-size: 12px; font-weight: 600; background: #11151a; }
    tr:last-child td { border-bottom: 0; }
    td.wrap { white-space: normal; min-width: 180px; }
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
    .badges { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 22px;
      padding: 2px 7px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #11151a;
      color: var(--text);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }
    .badge-ok { border-color: var(--accent); color: var(--accent); }
    .badge-warn { border-color: var(--warn); color: var(--warn); }
    .badge-bad { border-color: var(--bad); color: var(--bad); }
    .badge-muted { color: var(--muted); }
    .catalog-row-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .notice {
      margin: 0 0 10px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #0b0c0f;
      color: var(--muted);
      min-height: 18px;
    }
    .notice-ok { border-color: var(--accent); color: var(--accent); }
    .notice-warn { border-color: var(--warn); color: var(--warn); }
    .notice-bad { border-color: var(--bad); color: var(--bad); }
    .asset-preview {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    .asset-preview img,
    .asset-preview video,
    .asset-preview audio,
    .asset-preview iframe {
      max-width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #11151a;
    }
    .asset-preview img {
      max-height: 520px;
      object-fit: contain;
    }
    .asset-preview iframe {
      width: 100%;
      min-height: 520px;
    }
    .preview-session-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }
    .preview-session-item {
      display: grid;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #11151a;
      padding: 10px;
      min-width: 0;
    }
    .preview-session-frame {
      width: 100%;
      min-height: 280px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #0b0c0f;
    }
    .preview-session-item img,
    .preview-session-item video,
    .preview-session-item audio {
      width: 100%;
      max-height: 420px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #0b0c0f;
      object-fit: contain;
    }
    .severity-healthy { color: var(--accent); }
    .severity-backpressured, .severity-paused { color: var(--warn); }
    .severity-attention-needed { color: var(--bad); }
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <h1>${pageTitle}</h1>
        <p>${pageDescription}</p>
      </div>
      <button id="refreshStatus">Refresh Status</button>
    </div>
    <nav class="nav" aria-label="AuraCall sections">
      <a href="/ops/browser"${browserCurrent}>Browser Ops</a>
      <a href="/account-mirror"${accountMirrorCurrent}>Account Mirror</a>
      <a href="/account-mirror/preview-session"${previewSessionCurrent}>Preview Session</a>
      <span aria-disabled="true">Agents / Teams</span>
      <span aria-disabled="true">Config</span>
    </nav>

    <div class="grid">
      <section class="panel half">
        <h2>Operations</h2>
        <div id="opsControlNotice" class="notice" role="status" aria-live="polite">No service control action yet.</div>
        <div id="opsControls" class="control-grid">Loading controls...</div>
      </section>

      <section class="panel half">
        <h2>Server</h2>
        <dl id="serverSummary">
          <dt>Status</dt><dd class="muted">Loading...</dd>
        </dl>
      </section>

      <section class="panel">
        <h2>Account Mirrors</h2>
        <div class="row" style="margin-bottom: 10px;">
          <label>Provider
            <select id="mirrorCatalogProvider">
              <option value="">all</option>
              <option value="chatgpt">chatgpt</option>
              <option value="gemini">gemini</option>
              <option value="grok">grok</option>
            </select>
          </label>
          <label>Runtime Profile
            <input id="mirrorCatalogRuntimeProfile" placeholder="default">
          </label>
          <label>Kind
            <select id="mirrorCatalogKind">
              <option value="all">all</option>
              <option value="projects">projects</option>
              <option value="conversations">conversations</option>
              <option value="artifacts">artifacts</option>
              <option value="files">files</option>
              <option value="media">media</option>
            </select>
          </label>
          <label>Search
            <input id="mirrorCatalogSearch" placeholder="cached title, id, URL, or metadata">
          </label>
          <label>Asset Preview
            <select id="mirrorCatalogPreviewFilter">
              <option value="all">all</option>
              <option value="previewable">previewable</option>
              <option value="local">local</option>
              <option value="remote">remote</option>
              <option value="inline">inline</option>
              <option value="metadata">metadata only</option>
            </select>
          </label>
          <label>Sort
            <select id="mirrorCatalogSort">
              <option value="updated-desc">updated desc</option>
              <option value="preview-first">previewable first</option>
              <option value="local-first">local first</option>
              <option value="kind">kind/title</option>
            </select>
          </label>
          <label>
            <input id="mirrorCatalogWithTranscriptOnly" type="checkbox">
            With transcript only
          </label>
          <label>Limit
            <input id="mirrorCatalogLimit" type="number" min="0" max="500" step="1" value="50">
          </label>
          <button id="loadMirrorCatalog" class="primary">Search Cache</button>
          <button id="showVisibleMirrorCatalogPreviewUrls" type="button">Preview visible URL list</button>
          <button id="reviewVisibleMirrorCatalogPreviews" type="button">Review visible previews</button>
          <button id="openVisibleMirrorCatalogPreviewUrls" type="button">Open visible previews</button>
          <button id="copyVisibleMirrorCatalogPreviewUrls" type="button">Copy visible preview URLs</button>
          <button id="downloadVisibleMirrorCatalogPreviewUrls" type="button">Download visible preview URL list</button>
        </div>
        <div id="mirrorCatalogBatchNotice" class="notice" role="status" aria-live="polite">No catalog batch action yet.</div>
        <div id="mirrorCatalogPreviewUrlDrawer" class="notice" hidden>
          <div class="row" style="justify-content: space-between; margin-bottom: 8px;">
            <strong>Visible preview URLs</strong>
            <button id="hideVisibleMirrorCatalogPreviewUrls" type="button">Close</button>
          </div>
          <pre id="mirrorCatalogPreviewUrlList">No visible preview URLs.</pre>
        </div>
        <div id="mirrorCatalogSummary" class="notice">Catalog reads are cache-only and do not enqueue browser work.</div>
        <div id="mirrorCatalogResults" class="muted" style="margin-bottom: 10px;">No catalog loaded.</div>
        <div id="mirrorCatalogDetail" class="catalog-detail">
          <div class="notice">Select a cached row to inspect its raw manifest entry.</div>
          <div id="mirrorCatalogDetailView" class="notice">No row selected.</div>
          <pre id="mirrorCatalogDetailRaw">No row selected.</pre>
        </div>
        <pre id="mirrorCatalogRaw">No catalog loaded.</pre>
        <h2 style="margin-top: 14px;">Mirror Status</h2>
        <pre id="mirrorStatus">Loading...</pre>
      </section>

      <section class="panel half">
        <h2>Mirror Live Follow</h2>
        <div class="row" style="margin-bottom: 10px;">
          <label>Completion ID
            <input id="mirrorCompletionId" placeholder="acctmirror_completion_id">
          </label>
          <button id="inspectMirrorCompletionById">Inspect</button>
          <button id="pauseMirrorCompletion">Pause</button>
          <button id="resumeMirrorCompletion">Resume</button>
          <button id="cancelMirrorCompletion">Cancel</button>
        </div>
        <div id="mirrorAttentionQueue" class="muted" style="margin-bottom: 10px;">Loading attention queue...</div>
        <div id="mirrorTargetTable" class="muted" style="margin-bottom: 10px;">Loading target accounts...</div>
        <div id="mirrorActiveCompletionTable" class="muted" style="margin-bottom: 10px;">Loading active operations...</div>
        <div id="mirrorControlNotice" class="notice" role="status" aria-live="polite">No live-follow control action yet.</div>
        <pre id="mirrorTargets">Loading...</pre>
        <pre id="mirrorCompletions">Loading...</pre>
      </section>

      <section id="mirrorPreviewSessionPanel" class="panel" hidden>
        <h2>Cached Preview Session</h2>
        <div id="mirrorPreviewSessionNotice" class="notice" role="status" aria-live="polite">No preview session loaded.</div>
        <div class="row" style="margin-bottom: 10px;">
          <button id="selectAllMirrorPreviewSessionItems" type="button">Select all</button>
          <button id="clearMirrorPreviewSessionSelection" type="button">Select none</button>
          <button id="copyMirrorPreviewSessionUrls" type="button">Copy selected URLs</button>
          <button id="downloadMirrorPreviewSessionUrls" type="button">Download selected URL list</button>
        </div>
        <div id="mirrorPreviewSessionGrid" class="preview-session-grid">No previews loaded.</div>
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
          <dt>Mirror Catalog</dt><dd>/v1/account-mirrors/catalog?kind=all&amp;limit=50</dd>
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
    let mirrorCatalogRows = [];
    let mirrorCatalogFilteredRows = [];
    let mirrorCatalogCurrentDetail = null;
    let mirrorPreviewSessionUrls = [];
    let mirrorPreviewSessionItems = [];
    let mirrorPreviewSessionSelectedUrls = new Set();

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
      const backgroundDrain = status.backgroundDrain || {};
      const completions = status.accountMirrorCompletions || {};
      const completionMetrics = completions.metrics || {};
      const liveFollow = status.liveFollow || {};
      const targets = liveFollow.targets || {};
      const dashboard = status.routes && status.routes.operatorBrowserDashboard;
      $('serverSummary').innerHTML = [
        ['Status', status.ok ? '<span class="ok">ok</span>' : '<span class="bad">not ok</span>'],
        ['Version', status.version || 'unknown'],
        ['Binding', [binding.host, binding.port].filter(Boolean).join(':') || 'unknown'],
        ['Local Only', binding.localOnly ? '<span class="ok">true</span>' : '<span class="warn">false</span>'],
        ['Runner', runner.status || 'unknown'],
        ['Runner ID', runner.id || 'none'],
        ['Background Drain', backgroundDrain.state || 'unknown'],
        ['Mirror Scheduler', scheduler.state || 'unknown'],
        ['Mirror Posture', scheduler.operatorStatus ? scheduler.operatorStatus.posture : 'unknown'],
        ['Live Follow Severity', renderSeverity(liveFollow.severity)],
        ['Live Follow Targets', formatTargetHealth(targets)],
        ['Desired vs Actual', formatDesiredActualHealth(targets)],
        ['Mirror Wake', scheduler.lastWakeReason || 'none'],
        ['Mirror Wake At', scheduler.lastWakeAt || 'never'],
        ['Completion Records', formatCompletionHistory(completionMetrics, targets)],
        ['Dashboard Route', dashboard || '/ops/browser'],
      ].map(([key, value]) => '<dt>' + key + '</dt><dd>' + value + '</dd>').join('');
    }

    function renderMirrorCompletions(status) {
      const summary = status.accountMirrorCompletions || {};
      const metrics = summary.metrics || {};
      const active = Array.isArray(summary.active) ? summary.active : [];
      const recent = Array.isArray(summary.recent) ? summary.recent : [];
      const targets = status.liveFollow && status.liveFollow.targets ? status.liveFollow.targets : null;
      $('mirrorAttentionQueue').innerHTML = renderAttentionQueue(targets, active, recent);
      $('mirrorTargetTable').innerHTML = renderLiveFollowTargetTable(targets);
      $('mirrorActiveCompletionTable').innerHTML = renderActiveCompletionTable(active);
      $('mirrorTargets').textContent = asJson({
        source: 'status.liveFollow.targets',
        targets: targets ? compactLiveFollowTargets(targets) : null,
      });
      $('mirrorCompletions').textContent = asJson({
        health: status.liveFollow || null,
        metrics,
        active: active.map(compactCompletion),
        recent: recent.map(compactCompletion),
      });
    }

    function renderOpsControls(status) {
      const backgroundDrain = status.backgroundDrain || {};
      const scheduler = status.accountMirrorScheduler || {};
      const liveFollow = status.liveFollow || {};
      $('opsControls').innerHTML = [
        renderBackgroundDrainControl(backgroundDrain),
        renderMirrorSchedulerControl(scheduler),
        renderLiveFollowControlSummary(liveFollow),
      ].join('');
    }

    function renderBackgroundDrainControl(backgroundDrain) {
      const enabled = backgroundDrain.enabled === true;
      const paused = backgroundDrain.paused === true || backgroundDrain.state === 'paused';
      const running = backgroundDrain.state === 'running';
      return '<div class="control-card" id="backgroundDrainControls"><div class="control-title"><strong>Background Drain</strong>'
        + renderStatusText(backgroundDrain.state || 'unknown', toneForActualStatus(backgroundDrain.state || 'unknown'))
        + '</div><dl>'
        + '<dt>Interval</dt><dd>' + escapeHtml(formatNullable(backgroundDrain.intervalMs, 'disabled')) + '</dd>'
        + '<dt>Last Run</dt><dd>' + escapeHtml(backgroundDrain.lastCompletedAt || backgroundDrain.lastStartedAt || 'never') + '</dd>'
        + '</dl><div class="row">'
        + '<button id="pauseBackgroundDrain" type="button" onclick="controlBackgroundDrain(' + "'pause'" + ')" ' + disabledAttr(!enabled || paused) + '>Pause</button>'
        + '<button id="resumeBackgroundDrain" type="button" onclick="controlBackgroundDrain(' + "'resume'" + ')" ' + disabledAttr(!enabled || running && !paused) + '>Resume</button>'
        + '</div></div>';
    }

    function renderMirrorSchedulerControl(scheduler) {
      const enabled = scheduler.enabled === true;
      const paused = scheduler.paused === true || scheduler.state === 'paused';
      const running = scheduler.state === 'running';
      return '<div class="control-card" id="mirrorSchedulerControls"><div class="control-title"><strong>Mirror Scheduler</strong>'
        + renderStatusText(scheduler.state || 'unknown', toneForActualStatus(scheduler.state || 'unknown'))
        + '</div><dl>'
        + '<dt>Mode</dt><dd>' + escapeHtml(scheduler.dryRun ? 'dry run' : 'execute') + '</dd>'
        + '<dt>Wake</dt><dd>' + escapeHtml(scheduler.lastWakeReason || 'none') + '</dd>'
        + '<dt>Wake At</dt><dd>' + escapeHtml(scheduler.lastWakeAt || 'never') + '</dd>'
        + '</dl><div class="row">'
        + '<button id="runMirrorScheduler" class="primary" type="button" onclick="controlMirrorScheduler(' + "'run-once'" + ', false)" ' + disabledAttr(running) + '>Run Now</button>'
        + '<button id="dryRunMirrorScheduler" type="button" onclick="controlMirrorScheduler(' + "'run-once'" + ', true)" ' + disabledAttr(running) + '>Dry Run</button>'
        + '<button id="pauseMirrorScheduler" type="button" onclick="controlMirrorScheduler(' + "'pause'" + ')" ' + disabledAttr(!enabled || paused) + '>Pause</button>'
        + '<button id="resumeMirrorScheduler" type="button" onclick="controlMirrorScheduler(' + "'resume'" + ')" ' + disabledAttr(!enabled || running && !paused) + '>Resume</button>'
        + '</div></div>';
    }

    function renderLiveFollowControlSummary(liveFollow) {
      const targets = liveFollow.targets || {};
      return '<div class="control-card" id="liveFollowControls"><div class="control-title"><strong>Live Follow</strong>'
        + renderSeverity(liveFollow.severity || 'unknown')
        + '</div><dl>'
        + '<dt>Targets</dt><dd>' + formatTargetHealth(targets) + '</dd>'
        + '<dt>Next Action</dt><dd>Use the live-follow table to pause, resume, or cancel a completion by id.</dd>'
        + '</dl></div>';
    }

    function renderSeverity(severity) {
      return '<span class="severity-' + severity + '">' + severity + '</span>';
    }

    function formatTargetHealth(targets) {
      if (!targets || !targets.total) return 'unknown';
      return '<span class="badges">' + [
        renderBadge('enabled', targets.enabled || 0, targets.enabled ? 'ok' : 'muted'),
        renderBadge('active', targets.active || 0, targets.active ? 'ok' : 'muted'),
        renderBadge('paused', targets.paused || 0, targets.paused ? 'warn' : 'muted'),
        renderBadge('attention', targets.attentionNeeded || 0, targets.attentionNeeded ? 'bad' : 'ok'),
      ].join('') + '</span>';
    }

    function formatCompletionHistory(metrics, targets) {
      const staleOnly = targets && (targets.attentionNeeded || 0) === 0;
      const failedTone = metrics.failed && !staleOnly ? 'bad' : 'muted';
      const cancelledTone = metrics.cancelled && !staleOnly ? 'warn' : 'muted';
      return '<span class="badges">' + [
        renderBadge('active', metrics.active || 0, metrics.active ? 'ok' : 'muted'),
        renderBadge('failed', metrics.failed || 0, failedTone),
        renderBadge('cancelled', metrics.cancelled || 0, cancelledTone),
        renderBadge('total', metrics.total || 0, 'muted'),
      ].join('') + '</span>';
    }

    function renderBadge(label, value, tone) {
      return '<span class="badge badge-' + tone + '"><span>' + label + '</span><strong>' + value + '</strong></span>';
    }

    function renderAttentionQueue(targets, active, recent) {
      const rows = collectAttentionRows(targets, active, recent);
      if (!rows.length) return '<span class="muted">No live-follow operator attention needed.</span>';
      return '<div class="table-wrap"><table id="mirrorAttentionItems"><thead><tr>' + [
        'Kind',
        'Target',
        'State',
        'Detail',
        'Controls',
      ].map((label) => '<th>' + label + '</th>').join('') + '</tr></thead><tbody>' + rows.map(renderAttentionRow).join('') + '</tbody></table></div>';
    }

    function collectAttentionRows(targets, active, recent) {
      const rows = [];
      const accounts = targets && Array.isArray(targets.accounts) ? targets.accounts : [];
      for (const target of accounts) {
        const desiredState = target.desiredState || 'unknown';
        const status = target.actualStatus || 'unknown';
        if (isAttentionTarget(desiredState, status)) {
          rows.push({
            kind: 'target',
            target: formatTargetName(target),
            state: desiredState + '/' + status,
            detail: target.activeCompletionId || target.phase || target.reason || 'attention needed',
            completionId: target.activeCompletionId || null,
            status,
          });
        }
      }
      const operations = [...(Array.isArray(active) ? active : []), ...(Array.isArray(recent) ? recent : [])];
      const seen = new Set();
      for (const operation of operations) {
        const id = operation.id || '';
        const status = operation.status || 'unknown';
        if (!isAttentionCompletion(status) || seen.has(id)) continue;
        seen.add(id);
        rows.push({
          kind: 'completion',
          target: formatCompletionTarget(operation),
          state: status,
          detail: id || operation.error || 'attention needed',
          completionId: id || null,
          status,
        });
      }
      return rows;
    }

    function isAttentionTarget(desiredState, status) {
      return desiredState === 'missing_identity'
        || status === 'paused'
        || status === 'blocked'
        || status === 'failed'
        || status === 'cancelled'
        || status === 'attention-needed';
    }

    function isAttentionCompletion(status) {
      return status === 'paused'
        || status === 'blocked'
        || status === 'failed'
        || status === 'cancelled';
    }

    function renderAttentionRow(row) {
      return '<tr>' + [
        '<td>' + escapeHtml(row.kind) + '</td>',
        '<td><strong>' + escapeHtml(row.target) + '</strong></td>',
        '<td>' + renderStatusText(row.state, toneForActualStatus(row.status)) + '</td>',
        '<td class="wrap">' + escapeHtml(row.detail) + '</td>',
        '<td>' + renderAttentionControls(row.completionId, row.status) + '</td>',
      ].join('') + '</tr>';
    }

    function renderAttentionControls(completionId, status) {
      if (!completionId) return '<span class="muted">none</span>';
      return '<span class="badges">' + [
        renderCompletionInspectButton(completionId),
        renderCompletionControlButtons(completionId, status),
      ].join('') + '</span>';
    }

    function renderLiveFollowTargetTable(targets) {
      const accounts = targets && Array.isArray(targets.accounts) ? targets.accounts : [];
      if (!accounts.length) return '<span class="muted">No configured live-follow accounts.</span>';
      return '<div class="table-wrap"><table id="mirrorTargetAccounts"><thead><tr>' + [
        'Target',
        'Desired',
        'Status',
        'Phase',
        'Passes',
        'Next Live-Follow Attempt',
        'Routine Crawl Eligible',
        'Counts',
        'Controls',
      ].map((label) => '<th>' + label + '</th>').join('') + '</tr></thead><tbody>' + accounts.map(renderLiveFollowTargetRow).join('') + '</tbody></table></div>';
    }

    function renderLiveFollowTargetRow(target) {
      const status = target.actualStatus || 'unknown';
      const desiredState = target.desiredState || 'unknown';
      const counts = target.metadataCounts || {};
      return '<tr>' + [
        '<td><strong>' + escapeHtml(formatTargetName(target)) + '</strong></td>',
        '<td>' + renderStatusText(desiredState, toneForDesiredState(desiredState)) + '</td>',
        '<td>' + renderStatusText(status, toneForActualStatus(status)) + '</td>',
        '<td>' + escapeHtml(target.phase || 'none') + '</td>',
        '<td>' + escapeHtml(target.passCount == null ? 'none' : String(target.passCount)) + '</td>',
        '<td class="wrap">' + escapeHtml(target.activeCompletionNextAttemptAt || 'none') + '</td>',
        '<td class="wrap">' + escapeHtml(target.routineEligibleAt || 'none') + '</td>',
        '<td class="wrap">' + escapeHtml(formatMetadataCounts(counts)) + '</td>',
        '<td>' + renderCompletionControlButtons(target.activeCompletionId, status) + '</td>',
      ].join('') + '</tr>';
    }

    function renderActiveCompletionTable(active) {
      if (!active.length) return '<span class="muted">No active live-follow operations.</span>';
      return '<div class="table-wrap"><table id="mirrorActiveCompletions"><thead><tr>' + [
        'Completion',
        'Target',
        'Status',
        'Phase',
        'Passes',
        'Next Completion Attempt',
        'Inspect',
        'Controls',
      ].map((label) => '<th>' + label + '</th>').join('') + '</tr></thead><tbody>' + active.map(renderActiveCompletionRow).join('') + '</tbody></table></div>';
    }

    function renderActiveCompletionRow(operation) {
      const status = operation.status || 'unknown';
      return '<tr>' + [
        '<td class="wrap"><strong>' + escapeHtml(operation.id || 'unknown') + '</strong></td>',
        '<td>' + escapeHtml(formatCompletionTarget(operation)) + '</td>',
        '<td>' + renderStatusText(status, toneForActualStatus(status)) + '</td>',
        '<td>' + escapeHtml(operation.phase || 'none') + '</td>',
        '<td>' + escapeHtml(formatCompletionPasses(operation)) + '</td>',
        '<td class="wrap">' + escapeHtml(operation.nextAttemptAt || 'none') + '</td>',
        '<td>' + renderCompletionInspectButton(operation.id) + '</td>',
        '<td>' + renderCompletionControlButtons(operation.id, status) + '</td>',
      ].join('') + '</tr>';
    }

    function renderCompletionInspectButton(id) {
      if (!id) return '<span class="muted">none</span>';
      return '<button type="button" data-completion-id="' + escapeHtml(id) + '" onclick="inspectMirrorCompletion(this.dataset.completionId)">Inspect</button>';
    }

    function renderCompletionControlButtons(id, status) {
      if (!id) return '<span class="muted">none</span>';
      const escapedId = escapeHtml(id);
      const actions = completionActionsForStatus(status);
      return '<span class="badges">' + [
        '<button type="button" data-completion-id="' + escapedId + '" onclick="fillMirrorCompletionId(this.dataset.completionId)">Use ID</button>',
        ...actions.map((action) => renderCompletionActionButton(id, action, labelForCompletionAction(action))),
      ].join('') + '</span>';
    }

    function completionActionsForStatus(status) {
      if (status === 'paused') return ['resume', 'cancel'];
      if (status === 'queued' || status === 'running' || status === 'refreshing') return ['pause', 'cancel'];
      return [];
    }

    function labelForCompletionAction(action) {
      if (action === 'pause') return 'Pause';
      if (action === 'resume') return 'Resume';
      if (action === 'cancel') return 'Cancel';
      return action;
    }

    function renderCompletionActionButton(id, action, label) {
      return '<button type="button" data-completion-id="' + escapeHtml(id) + '" data-completion-action="' + escapeHtml(action) + '" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">' + escapeHtml(label) + '</button>';
    }

    function fillMirrorCompletionId(id) {
      if (!id) return;
      $('mirrorCompletionId').value = id;
      $('mirrorCompletions').textContent = 'Selected completion id: ' + id;
      setMirrorControlNotice('Selected ' + id + '.', 'ok');
    }

    function setMirrorControlNotice(message, tone) {
      const node = $('mirrorControlNotice');
      node.className = 'notice notice-' + (tone || 'warn');
      node.textContent = message;
    }

    function setOpsControlNotice(message, tone) {
      const node = $('opsControlNotice');
      node.className = 'notice notice-' + (tone || 'warn');
      node.textContent = message;
    }

    function renderStatusText(value, tone) {
      return '<span class="' + tone + '">' + escapeHtml(value || 'unknown') + '</span>';
    }

    function toneForDesiredState(state) {
      if (state === 'enabled') return 'ok';
      if (state === 'missing_identity' || state === 'unsupported') return 'bad';
      if (state === 'disabled') return 'warn';
      return 'muted';
    }

    function toneForActualStatus(status) {
      if (status === 'running' || status === 'refreshing' || status === 'queued') return 'ok';
      if (status === 'paused') return 'warn';
      if (status === 'blocked' || status === 'failed' || status === 'cancelled') return 'bad';
      return 'muted';
    }

    function disabledAttr(disabled) {
      return disabled ? 'disabled' : '';
    }

    function formatNullable(value, fallback) {
      return value == null ? fallback : String(value);
    }

    function formatTargetName(target) {
      return [target.provider, target.runtimeProfileId].filter(Boolean).join('/') || 'unknown';
    }

    function formatMetadataCounts(counts) {
      return [
        'p=' + (counts.projects || 0),
        'c=' + (counts.conversations || 0),
        'a=' + (counts.artifacts || 0),
        'f=' + (counts.files || 0),
        'm=' + (counts.media || 0),
      ].join(' ');
    }

    function formatCompletionTarget(operation) {
      return [operation.provider, operation.runtimeProfileId].filter(Boolean).join('/') || 'unknown';
    }

    function formatCompletionPasses(operation) {
      return String(operation.passCount || 0) + '/' + (operation.maxPasses || 'unbounded');
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatDesiredActualHealth(targets) {
      if (!targets || !targets.total) return 'unknown';
      const desired = targets.desired || targets;
      const actual = targets.actual || targets;
      return '<span class="badges">' + [
        renderBadge('desired enabled', desired.enabled || 0, desired.enabled ? 'ok' : 'muted'),
        renderBadge('desired missing', desired.missingIdentity || 0, desired.missingIdentity ? 'bad' : 'muted'),
        renderBadge('actual active', actual.active || 0, actual.active ? 'ok' : 'muted'),
        renderBadge('actual complete', actual.complete || 0, actual.complete ? 'ok' : 'muted'),
        renderBadge('actual attention', actual.attentionNeeded || 0, actual.attentionNeeded ? 'bad' : 'ok'),
      ].join('') + '</span>';
    }

    function compactLiveFollowTargets(targets) {
      return {
        total: targets.total || 0,
        enabled: targets.enabled || 0,
        active: targets.active || 0,
        running: targets.running || 0,
        paused: targets.paused || 0,
        attentionNeeded: targets.attentionNeeded || 0,
        complete: targets.complete || 0,
        inProgress: targets.inProgress || 0,
        desired: targets.desired || null,
        actual: targets.actual || null,
        accounts: Array.isArray(targets.accounts) ? targets.accounts.map(compactLiveFollowTarget) : [],
      };
    }

    function compactLiveFollowTarget(target) {
      return {
        target: [target.provider, target.runtimeProfileId].filter(Boolean).join('/'),
        desiredState: target.desiredState || null,
        status: target.actualStatus || null,
        activeCompletionId: target.activeCompletionId || null,
        phase: target.phase || null,
        passCount: target.passCount || null,
        routineEligibleAt: target.routineEligibleAt || null,
        activeCompletionNextAttemptAt: target.activeCompletionNextAttemptAt || null,
        nextAttemptAt: target.nextAttemptAt || null,
        completeness: target.mirrorCompleteness || null,
        counts: target.metadataCounts || null,
      };
    }

    function compactCompletion(operation) {
      return {
        id: operation.id,
        target: formatCompletionTarget(operation),
        status: operation.status,
        mode: operation.mode,
        phase: operation.phase,
        passes: formatCompletionPasses(operation),
        nextAttemptAt: operation.nextAttemptAt || null,
        completedAt: operation.completedAt || null,
      };
    }

    function buildMirrorCatalogPath() {
      const params = new URLSearchParams();
      const provider = $('mirrorCatalogProvider').value;
      const runtimeProfile = $('mirrorCatalogRuntimeProfile').value.trim();
      const kind = $('mirrorCatalogKind').value || 'all';
      const limit = normalizeMirrorCatalogLimit($('mirrorCatalogLimit').value);
      if (provider) params.set('provider', provider);
      if (runtimeProfile) params.set('runtimeProfile', runtimeProfile);
      params.set('kind', kind);
      params.set('limit', String(limit));
      return '/v1/account-mirrors/catalog?' + params.toString();
    }

    function buildMirrorCatalogItemPath(row) {
      const params = new URLSearchParams();
      if (row.provider) params.set('provider', row.provider);
      if (row.runtimeProfileId) params.set('runtimeProfile', row.runtimeProfileId);
      if (row.kind) params.set('kind', row.kind);
      params.set('limit', String(normalizeMirrorCatalogLimit($('mirrorCatalogLimit').value)));
      return '/v1/account-mirrors/catalog/items/' + encodeURIComponent(row.itemId) + '?' + params.toString();
    }

    function initializeMirrorCatalogFiltersFromUrl() {
      const params = new URLSearchParams(window.location.search);
      setSelectValue('mirrorCatalogProvider', params.get('provider') || '');
      if (params.has('runtimeProfile')) $('mirrorCatalogRuntimeProfile').value = params.get('runtimeProfile') || '';
      setSelectValue('mirrorCatalogKind', params.get('kind') || 'all');
      if (params.has('search')) $('mirrorCatalogSearch').value = params.get('search') || '';
      setSelectValue('mirrorCatalogPreviewFilter', params.get('preview') || 'all');
      setSelectValue('mirrorCatalogSort', params.get('sort') || 'updated-desc');
      $('mirrorCatalogWithTranscriptOnly').checked = params.get('withTranscript') === '1';
      if (params.has('limit')) $('mirrorCatalogLimit').value = String(normalizeMirrorCatalogLimit(params.get('limit')));
    }

    function setSelectValue(id, value) {
      const node = $(id);
      const allowed = Array.from(node.options).some((option) => option.value === value);
      node.value = allowed ? value : node.options[0].value;
    }

    function updateMirrorCatalogUrl() {
      const params = new URLSearchParams(window.location.search);
      setOptionalUrlParam(params, 'provider', $('mirrorCatalogProvider').value);
      setOptionalUrlParam(params, 'runtimeProfile', $('mirrorCatalogRuntimeProfile').value.trim());
      setOptionalUrlParam(params, 'kind', $('mirrorCatalogKind').value === 'all' ? '' : $('mirrorCatalogKind').value);
      setOptionalUrlParam(params, 'search', $('mirrorCatalogSearch').value.trim());
      setOptionalUrlParam(params, 'preview', $('mirrorCatalogPreviewFilter').value === 'all' ? '' : $('mirrorCatalogPreviewFilter').value);
      setOptionalUrlParam(params, 'sort', $('mirrorCatalogSort').value === 'updated-desc' ? '' : $('mirrorCatalogSort').value);
      setOptionalUrlParam(params, 'withTranscript', $('mirrorCatalogWithTranscriptOnly').checked ? '1' : '');
      const limit = normalizeMirrorCatalogLimit($('mirrorCatalogLimit').value);
      setOptionalUrlParam(params, 'limit', limit === 50 ? '' : String(limit));
      const query = params.toString();
      const nextUrl = window.location.pathname + (query ? '?' + query : '');
      window.history.replaceState(null, '', nextUrl);
    }

    function setOptionalUrlParam(params, key, value) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }

    function normalizeMirrorCatalogLimit(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return 50;
      return Math.max(0, Math.min(500, Math.floor(parsed)));
    }

    async function loadMirrorCatalog() {
      const button = $('loadMirrorCatalog');
      button.disabled = true;
      $('mirrorCatalogSummary').className = 'notice notice-warn';
      $('mirrorCatalogSummary').textContent = 'Reading cached account mirror catalog...';
      $('mirrorCatalogResults').textContent = 'Loading cached indexes...';
      try {
        updateMirrorCatalogUrl();
        const catalog = await fetchJson(buildMirrorCatalogPath());
        mirrorCatalogRows = flattenMirrorCatalogEntries(catalog);
        mirrorCatalogFilteredRows = sortMirrorCatalogRows(filterMirrorCatalogRows(mirrorCatalogRows, {
          query: $('mirrorCatalogSearch').value,
          previewFilter: $('mirrorCatalogPreviewFilter').value,
          withTranscriptOnly: $('mirrorCatalogWithTranscriptOnly').checked,
        }), $('mirrorCatalogSort').value);
        $('mirrorCatalogSummary').className = 'notice notice-ok';
        $('mirrorCatalogSummary').innerHTML = renderMirrorCatalogSummary(catalog, mirrorCatalogRows, mirrorCatalogFilteredRows);
        $('mirrorCatalogResults').innerHTML = renderMirrorCatalogTable(mirrorCatalogFilteredRows);
        $('mirrorCatalogDetailView').className = 'notice';
        $('mirrorCatalogDetailView').textContent = 'No row selected.';
        $('mirrorCatalogDetailRaw').textContent = 'No row selected.';
        $('mirrorCatalogRaw').textContent = asJson(catalog);
      } catch (error) {
        const message = String(error.message || error);
        $('mirrorCatalogSummary').className = 'notice notice-bad';
        $('mirrorCatalogSummary').textContent = message;
        $('mirrorCatalogResults').textContent = message;
        $('mirrorCatalogRaw').textContent = message;
      } finally {
        button.disabled = false;
      }
    }

    function flattenMirrorCatalogEntries(catalog) {
      const rows = [];
      const entries = Array.isArray(catalog && catalog.entries) ? catalog.entries : [];
      for (const entry of entries) {
        const manifests = entry && entry.manifests ? entry.manifests : {};
        for (const kind of ['projects', 'conversations', 'artifacts', 'files', 'media']) {
          const items = Array.isArray(manifests[kind]) ? manifests[kind] : [];
          for (const item of items) {
            const rowIndex = rows.length;
            rows.push({
              rowIndex,
              provider: entry.provider || 'unknown',
              runtimeProfileId: entry.runtimeProfileId || 'unknown',
              boundIdentityKey: entry.boundIdentityKey || 'unbound',
              status: entry.status || 'unknown',
              kind,
              label: formatCatalogItemLabel(item),
              itemId: formatCatalogItemId(item),
              timestamp: formatCatalogItemTimestamp(item),
              transcriptStatus: formatCatalogTranscriptStatus(kind, item),
              materializationStatus: formatCatalogMaterializationStatus(kind, item),
              item,
              searchable: stringifyCatalogItem(item),
            });
          }
        }
      }
      return rows;
    }

    function filterMirrorCatalogRows(rows, filters) {
      const needle = String(filters && filters.query || '').trim().toLowerCase();
      const previewFilter = String(filters && filters.previewFilter || 'all');
      const withTranscriptOnly = Boolean(filters && filters.withTranscriptOnly);
      return rows.filter((row) => {
        if (withTranscriptOnly && !hasCachedCatalogTranscript(row)) return false;
        if (!matchesCatalogPreviewFilter(row, previewFilter)) return false;
        if (!needle) return true;
        return [
          row.provider,
          row.runtimeProfileId,
          row.boundIdentityKey,
          row.status,
          row.kind,
          row.label,
          row.itemId,
          row.timestamp,
          row.transcriptStatus,
          row.materializationStatus,
          row.searchable,
        ].join(' ').toLowerCase().includes(needle);
      });
    }

    function matchesCatalogPreviewFilter(row, previewFilter) {
      if (!previewFilter || previewFilter === 'all') return true;
      const status = classifyCatalogItemPreview(row.item);
      if (previewFilter === 'previewable') return hasCatalogItemPreviewSignal(row.item);
      if (previewFilter === 'metadata') return row.kind !== 'conversations' && row.kind !== 'projects' && status === 'metadata';
      return status === previewFilter;
    }

    function sortMirrorCatalogRows(rows, sortMode) {
      const copy = rows.slice();
      const mode = sortMode || 'updated-desc';
      copy.sort((left, right) => compareMirrorCatalogRows(left, right, mode));
      return copy;
    }

    function compareMirrorCatalogRows(left, right, sortMode) {
      if (sortMode === 'preview-first') {
        return compareCatalogPreviewRank(left, right, ['local', 'remote', 'inline', 'metadata']) || compareCatalogUpdatedDesc(left, right);
      }
      if (sortMode === 'local-first') {
        return compareCatalogPreviewRank(left, right, ['local', 'remote', 'inline', 'metadata']) || compareCatalogUpdatedDesc(left, right);
      }
      if (sortMode === 'kind') {
        return left.kind.localeCompare(right.kind)
          || left.label.localeCompare(right.label)
          || compareCatalogUpdatedDesc(left, right);
      }
      return compareCatalogUpdatedDesc(left, right);
    }

    function compareCatalogPreviewRank(left, right, order) {
      const leftRank = order.indexOf(classifyCatalogItemPreview(left.item));
      const rightRank = order.indexOf(classifyCatalogItemPreview(right.item));
      return (leftRank === -1 ? order.length : leftRank) - (rightRank === -1 ? order.length : rightRank);
    }

    function compareCatalogUpdatedDesc(left, right) {
      const leftTime = Date.parse(left.timestamp || '');
      const rightTime = Date.parse(right.timestamp || '');
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
        || left.label.localeCompare(right.label);
    }

    function hasCachedCatalogTranscript(row) {
      if (!row || row.kind !== 'conversations') return false;
      return readBooleanField(row.item, ['hasCachedTranscript'])
        || readNumberField(row.item, ['messageCount']) > 0;
    }

    function renderMirrorCatalogSummary(catalog, rows, filteredRows) {
      const metrics = catalog && catalog.metrics ? catalog.metrics : {};
      return '<span class="badges">' + [
        renderBadge('targets', metrics.targets || 0, 'muted'),
        renderBadge('projects', metrics.projects || 0, metrics.projects ? 'ok' : 'muted'),
        renderBadge('conversations', metrics.conversations || 0, metrics.conversations ? 'ok' : 'muted'),
        renderBadge('artifacts', metrics.artifacts || 0, metrics.artifacts ? 'ok' : 'muted'),
        renderBadge('files', metrics.files || 0, metrics.files ? 'ok' : 'muted'),
        renderBadge('media', metrics.media || 0, metrics.media ? 'ok' : 'muted'),
        renderBadge('previewable', countPreviewableCatalogRows(filteredRows), countPreviewableCatalogRows(filteredRows) ? 'ok' : 'muted'),
        renderBadge('shown', filteredRows.length + '/' + rows.length, filteredRows.length ? 'ok' : 'warn'),
      ].join('') + '</span>';
    }

    function countPreviewableCatalogRows(rows) {
      return rows.filter((row) => hasCatalogItemPreviewSignal(row.item)).length;
    }

    function collectVisibleCatalogPreviewUrls() {
      return collectVisibleCatalogPreviewEntries().map((entry) => entry.url);
    }

    function collectVisibleCatalogPreviewEntries() {
      const entries = [];
      for (const row of mirrorCatalogFilteredRows) {
        const previewUrl = resolveCatalogRowPreviewUrl(row);
        if (!previewUrl) continue;
        const url = new URL(previewUrl, window.location.origin).href;
        if (entries.some((entry) => entry.url === url)) continue;
        entries.push({
          url,
          provider: row.provider || '',
          runtimeProfile: row.runtimeProfileId || '',
          kind: row.kind || '',
          title: row.label || '',
          itemId: row.itemId || '',
          boundIdentity: row.boundIdentityKey || '',
          updatedAt: row.timestamp || '',
        });
      }
      return entries;
    }

    function showVisibleMirrorCatalogPreviewUrls() {
      const urls = collectVisibleCatalogPreviewUrls();
      $('mirrorCatalogPreviewUrlDrawer').hidden = false;
      $('mirrorCatalogPreviewUrlList').textContent = urls.length ? urls.join('\\n') : 'No visible preview URLs.';
      setMirrorCatalogBatchNotice(
        urls.length
          ? 'Previewing ' + String(urls.length) + ' visible preview URL(s).'
          : 'No visible preview URLs to preview.',
        urls.length ? 'ok' : 'warn',
      );
    }

    function hideVisibleMirrorCatalogPreviewUrls() {
      $('mirrorCatalogPreviewUrlDrawer').hidden = true;
    }

    function openVisibleMirrorCatalogPreviewUrls() {
      const urls = collectVisibleCatalogPreviewUrls();
      if (!urls.length) {
        setMirrorCatalogBatchNotice('No visible preview URLs to open.', 'warn');
        return;
      }
      const openLimit = 8;
      urls.slice(0, openLimit).forEach((url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
      const suffix = urls.length > openLimit ? ' Limited to first ' + String(openLimit) + ' of ' + String(urls.length) + '.' : '';
      setMirrorCatalogBatchNotice('Opened ' + String(Math.min(urls.length, openLimit)) + ' visible preview URL(s).' + suffix, 'ok');
    }

    function reviewVisibleMirrorCatalogPreviews() {
      const entries = collectVisibleCatalogPreviewEntries();
      if (!entries.length) {
        setMirrorCatalogBatchNotice('No visible preview URLs to review.', 'warn');
        return;
      }
      const reviewLimit = 24;
      const selectedEntries = entries.slice(0, reviewLimit);
      const sessionId = 'preview-' + String(Date.now()) + '-' + String(Math.random()).slice(2);
      localStorage.setItem('auracall.previewSession.' + sessionId, JSON.stringify({
        createdAt: new Date().toISOString(),
        items: selectedEntries,
        urls: selectedEntries.map((entry) => entry.url),
      }));
      const suffix = entries.length > reviewLimit ? ' Limited to first ' + String(reviewLimit) + ' of ' + String(entries.length) + '.' : '';
      window.open('/account-mirror/preview-session?session=' + encodeURIComponent(sessionId), '_blank', 'noopener,noreferrer');
      setMirrorCatalogBatchNotice('Opened preview session for ' + String(selectedEntries.length) + ' visible preview URL(s).' + suffix, 'ok');
    }

    async function copyVisibleMirrorCatalogPreviewUrls() {
      const urls = collectVisibleCatalogPreviewUrls();
      if (!urls.length) {
        setMirrorCatalogBatchNotice('No visible preview URLs to copy.', 'warn');
        return;
      }
      try {
        await navigator.clipboard.writeText(urls.join('\\n'));
        setMirrorCatalogBatchNotice('Copied ' + String(urls.length) + ' visible preview URL(s).', 'ok');
      } catch {
        setMirrorCatalogBatchNotice('Could not copy visible preview URLs.', 'bad');
      }
    }

    function downloadVisibleMirrorCatalogPreviewUrls() {
      const urls = collectVisibleCatalogPreviewUrls();
      if (!urls.length) {
        setMirrorCatalogBatchNotice('No visible preview URLs to download.', 'warn');
        return;
      }
      const blob = new Blob([urls.join('\\n') + '\\n'], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = formatVisibleCatalogPreviewUrlsFilename();
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setMirrorCatalogBatchNotice('Downloaded ' + String(urls.length) + ' visible preview URL(s).', 'ok');
    }

    function formatVisibleCatalogPreviewUrlsFilename() {
      const provider = $('mirrorCatalogProvider').value || 'all-providers';
      const kind = $('mirrorCatalogKind').value || 'all';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      return 'auracall-preview-urls-' + provider + '-' + kind + '-' + timestamp + '.txt';
    }

    function initializeMirrorPreviewSession() {
      if (window.location.pathname !== '/account-mirror/preview-session') return;
      $('mirrorPreviewSessionPanel').hidden = false;
      const urls = readMirrorPreviewSessionUrls();
      renderMirrorPreviewSession(urls);
    }

    function readMirrorPreviewSessionUrls() {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session');
      if (sessionId) {
        try {
          const record = JSON.parse(localStorage.getItem('auracall.previewSession.' + sessionId) || '{}');
          if (Array.isArray(record.items)) return normalizeMirrorPreviewSessionItems(record.items);
          if (Array.isArray(record.urls)) return normalizeMirrorPreviewSessionItems(record.urls);
        } catch {
          return [];
        }
      }
      const repeatedUrls = params.getAll('url');
      if (repeatedUrls.length) return normalizeMirrorPreviewSessionItems(repeatedUrls);
      const encodedUrls = params.get('urls');
      if (!encodedUrls) return [];
      try {
        return normalizeMirrorPreviewSessionItems(JSON.parse(encodedUrls));
      } catch {
        return [];
      }
    }

    function normalizeMirrorPreviewSessionItems(values) {
      if (!Array.isArray(values)) return [];
      const items = [];
      for (const value of values) {
        const source = value && typeof value === 'object' ? value : { url: value };
        const rawUrl = String(source.url || '').trim();
        if (!isSafePreviewUrl(rawUrl)) continue;
        const url = new URL(rawUrl, window.location.origin).href;
        if (items.some((item) => item.url === url)) continue;
        items.push({
          url,
          provider: String(source.provider || ''),
          runtimeProfile: String(source.runtimeProfile || ''),
          kind: String(source.kind || ''),
          title: String(source.title || ''),
          itemId: String(source.itemId || ''),
          boundIdentity: String(source.boundIdentity || ''),
          updatedAt: String(source.updatedAt || ''),
        });
        if (items.length >= 24) break;
      }
      return items;
    }

    function renderMirrorPreviewSession(items) {
      const notice = $('mirrorPreviewSessionNotice');
      const grid = $('mirrorPreviewSessionGrid');
      mirrorPreviewSessionItems = items;
      mirrorPreviewSessionUrls = items.map((item) => item.url);
      mirrorPreviewSessionSelectedUrls = new Set(mirrorPreviewSessionUrls);
      if (!items.length) {
        notice.textContent = 'No preview session URLs were found. Start from Account Mirror and choose Review visible previews.';
        notice.className = 'notice notice-warn';
        grid.innerHTML = 'No previews loaded.';
        return;
      }
      notice.textContent = 'Rendering ' + String(items.length) + ' cached preview URL(s); ' + String(mirrorPreviewSessionSelectedUrls.size) + ' selected.';
      notice.className = 'notice notice-ok';
      grid.innerHTML = items.map(renderMirrorPreviewSessionItem).join('');
    }

    function renderMirrorPreviewSessionItem(item, index) {
      const url = item.url;
      const title = item.title || item.itemId || 'Cached preview';
      const labels = [
        item.provider ? renderBadge('provider', item.provider, 'muted') : '',
        item.kind ? renderBadge('kind', item.kind, 'muted') : '',
        item.runtimeProfile ? renderBadge('profile', item.runtimeProfile, 'muted') : '',
        item.boundIdentity ? renderBadge('identity', item.boundIdentity, 'muted') : '',
      ].filter(Boolean).join('');
      return '<article class="preview-session-item">'
        + '<div class="control-title"><label><input class="mirror-preview-session-select" type="checkbox" data-preview-url="' + escapeHtml(url) + '" checked> <strong>' + escapeHtml(title) + '</strong></label><a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">Open</a></div>'
        + '<div class="badges">' + labels + '</div>'
        + '<dl><dt>Preview</dt><dd>' + String(index + 1) + '</dd><dt>Item ID</dt><dd>' + escapeHtml(item.itemId || 'unknown') + '</dd><dt>Updated</dt><dd>' + escapeHtml(item.updatedAt || 'unknown') + '</dd></dl>'
        + renderMirrorPreviewSessionEmbed(url)
        + '<code>' + escapeHtml(url) + '</code>'
        + '</article>';
    }

    function renderMirrorPreviewSessionEmbed(url) {
      const lower = url.toLowerCase();
      if (lower.startsWith('data:image/') || /\\.(apng|avif|gif|jpe?g|png|webp)(\\?|#|$)/.test(lower)) {
        return '<img src="' + escapeHtml(url) + '" alt="Cached preview">';
      }
      if (lower.startsWith('data:video/') || /\\.(mp4|mov|m4v|webm)(\\?|#|$)/.test(lower)) {
        return '<video src="' + escapeHtml(url) + '" controls></video>';
      }
      if (lower.startsWith('data:audio/') || /\\.(mp3|m4a|ogg|wav|webm)(\\?|#|$)/.test(lower)) {
        return '<audio src="' + escapeHtml(url) + '" controls></audio>';
      }
      if (lower.startsWith('data:application/pdf') || /\\.pdf(\\?|#|$)/.test(lower)) {
        return '<iframe class="preview-session-frame" src="' + escapeHtml(url) + '" title="Cached PDF preview"></iframe>';
      }
      return '<iframe class="preview-session-frame" src="' + escapeHtml(url) + '" title="Cached preview"></iframe>';
    }

    async function copyMirrorPreviewSessionUrls() {
      const urls = selectedMirrorPreviewSessionUrls();
      if (!urls.length) {
        $('mirrorPreviewSessionNotice').textContent = 'No selected session URLs to copy.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
        return;
      }
      await navigator.clipboard.writeText(urls.join('\\n'));
      $('mirrorPreviewSessionNotice').textContent = 'Copied ' + String(urls.length) + ' selected session URL(s).';
      $('mirrorPreviewSessionNotice').className = 'notice notice-ok';
    }

    function downloadMirrorPreviewSessionUrls() {
      const urls = selectedMirrorPreviewSessionUrls();
      if (!urls.length) {
        $('mirrorPreviewSessionNotice').textContent = 'No selected session URLs to download.';
        $('mirrorPreviewSessionNotice').className = 'notice notice-warn';
        return;
      }
      const blob = new Blob([urls.join('\\n') + '\\n'], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'auracall-preview-session-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      $('mirrorPreviewSessionNotice').textContent = 'Downloaded ' + String(urls.length) + ' selected session URL(s).';
      $('mirrorPreviewSessionNotice').className = 'notice notice-ok';
    }

    function selectedMirrorPreviewSessionUrls() {
      return mirrorPreviewSessionUrls.filter((url) => mirrorPreviewSessionSelectedUrls.has(url));
    }

    function setMirrorPreviewSessionSelection(selectAll) {
      mirrorPreviewSessionSelectedUrls = new Set(selectAll ? mirrorPreviewSessionUrls : []);
      document.querySelectorAll('.mirror-preview-session-select').forEach((input) => {
        input.checked = selectAll;
      });
      updateMirrorPreviewSessionSelectionNotice();
    }

    function updateMirrorPreviewSessionSelection(event) {
      const input = event && event.target;
      if (!input || !input.dataset || !input.dataset.previewUrl) return;
      if (input.checked) {
        mirrorPreviewSessionSelectedUrls.add(input.dataset.previewUrl);
      } else {
        mirrorPreviewSessionSelectedUrls.delete(input.dataset.previewUrl);
      }
      updateMirrorPreviewSessionSelectionNotice();
    }

    function updateMirrorPreviewSessionSelectionNotice() {
      $('mirrorPreviewSessionNotice').textContent = 'Rendering ' + String(mirrorPreviewSessionUrls.length) + ' cached preview URL(s); ' + String(mirrorPreviewSessionSelectedUrls.size) + ' selected.';
      $('mirrorPreviewSessionNotice').className = mirrorPreviewSessionSelectedUrls.size ? 'notice notice-ok' : 'notice notice-warn';
    }

    function setMirrorCatalogBatchNotice(message, tone) {
      const node = $('mirrorCatalogBatchNotice');
      node.className = 'notice' + (tone ? ' notice-' + tone : '');
      node.textContent = message;
    }

    function renderMirrorCatalogTable(rows) {
      if (!rows.length) return '<span class="muted">No cached mirror catalog rows matched the current filters.</span>';
      return '<div class="table-wrap"><table id="mirrorCatalogItems"><thead><tr>' + [
        'Provider',
        'Profile',
        'Kind',
        'Title',
        'ID',
        'Updated',
        'Transcript',
        'Preview',
        'Identity',
        'Actions',
        'Snippet',
      ].map((label) => '<th>' + label + '</th>').join('') + '</tr></thead><tbody>' + rows.map(renderMirrorCatalogRow).join('') + '</tbody></table></div>';
    }

    function renderMirrorCatalogRow(row) {
      const rowIndex = String(row.rowIndex);
      const itemPath = buildMirrorCatalogItemPath(row);
      return '<tr data-catalog-row-index="' + escapeHtml(rowIndex) + '" onclick="showMirrorCatalogDetailByIndex(this.dataset.catalogRowIndex)">' + [
        '<td>' + escapeHtml(row.provider) + '</td>',
        '<td>' + escapeHtml(row.runtimeProfileId) + '</td>',
        '<td>' + escapeHtml(row.kind) + '</td>',
        '<td class="wrap"><strong>' + escapeHtml(row.label) + '</strong></td>',
        '<td class="wrap">' + escapeHtml(row.itemId) + '</td>',
        '<td class="wrap">' + escapeHtml(row.timestamp) + '</td>',
        '<td>' + renderCatalogTranscriptBadge(row) + '</td>',
        '<td>' + renderCatalogMaterializationBadge(row) + '</td>',
        '<td class="wrap">' + escapeHtml(row.boundIdentityKey) + '</td>',
        '<td>' + renderCatalogRowActions(row, itemPath) + '</td>',
        '<td class="wrap">' + escapeHtml(trimCatalogSnippet(row.searchable)) + '</td>',
      ].join('') + '</tr>';
    }

    function renderCatalogRowActions(row, itemPath) {
      const previewUrl = resolveCatalogRowPreviewUrl(row);
      const actions = [
        '<a href="' + escapeHtml(itemPath) + '" data-catalog-item-path="' + escapeHtml(itemPath) + '" onclick="event.preventDefault(); event.stopPropagation(); showMirrorCatalogDetailByPath(this.dataset.catalogItemPath)">Details</a>',
      ];
      if (previewUrl) {
        actions.push('<a href="' + escapeHtml(previewUrl) + '" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">Open Preview</a>');
        actions.push('<button type="button" class="link-button" data-catalog-preview-url="' + escapeHtml(previewUrl) + '" onclick="copyCatalogPreviewUrl(this); event.stopPropagation();">Copy URL</button>');
      }
      return '<span class="catalog-row-actions">' + actions.join(' ') + '</span>';
    }

    function resolveCatalogRowPreviewUrl(row) {
      const status = classifyCatalogItemPreview(row.item);
      if (status === 'local') return buildMirrorCatalogItemAssetPath(row);
      if (status === 'remote') return readCatalogPreviewUrl(row.item);
      return '';
    }

    function buildMirrorCatalogItemAssetPath(row) {
      const params = new URLSearchParams();
      if (row.provider) params.set('provider', row.provider);
      if (row.runtimeProfileId) params.set('runtimeProfile', row.runtimeProfileId);
      if (row.kind) params.set('kind', row.kind);
      return '/v1/account-mirrors/catalog/items/' + encodeURIComponent(row.itemId) + '/asset?' + params.toString();
    }

    async function copyCatalogPreviewUrl(button) {
      const url = button && button.dataset ? button.dataset.catalogPreviewUrl : '';
      if (!url) return;
      try {
        await navigator.clipboard.writeText(new URL(url, window.location.origin).href);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Copy failed';
      }
      window.setTimeout(() => {
        button.textContent = 'Copy URL';
      }, 1800);
    }

    function renderCatalogTranscriptBadge(row) {
      if (row.kind !== 'conversations') return renderBadge('n/a', 'metadata', 'muted');
      const count = readNumberField(row.item, ['messageCount']);
      if (readBooleanField(row.item, ['hasCachedTranscript']) || count > 0) {
        return renderBadge('chat', String(count || '?'), 'ok');
      }
      return renderBadge('chat', 'none', 'warn');
    }

    function renderCatalogMaterializationBadge(row) {
      if (row.kind === 'conversations' || row.kind === 'projects') return renderBadge('asset', 'n/a', 'muted');
      const status = classifyCatalogItemPreview(row.item);
      if (status === 'local') return renderBadge('asset', 'local', 'ok');
      if (status === 'remote') return renderBadge('asset', 'remote', 'ok');
      if (status === 'inline') return renderBadge('asset', 'inline', 'ok');
      return renderBadge('asset', 'metadata', 'muted');
    }

    function formatCatalogMaterializationStatus(kind, item) {
      if (kind === 'conversations' || kind === 'projects') return 'asset n/a';
      const status = classifyCatalogItemPreview(item);
      if (status === 'local') return 'local cached asset';
      if (status === 'remote') return 'remote preview asset';
      if (status === 'inline') return 'inline preview asset';
      return 'metadata only asset';
    }

    function classifyCatalogItemPreview(item) {
      if (readCatalogItemStringField(item, ['markdown', 'text', 'content', 'body'])) return 'inline';
      if (readCatalogItemStringField(item, ['localPath', 'path', 'filePath', 'absolutePath', 'assetStorageRelpath', 'storageRelpath'])) return 'local';
      if (readCatalogPreviewUrl(item)) return 'remote';
      return 'metadata';
    }

    function hasCatalogItemPreviewSignal(item) {
      const status = classifyCatalogItemPreview(item);
      return status === 'local' || status === 'remote' || status === 'inline';
    }

    function formatCatalogTranscriptStatus(kind, item) {
      if (kind !== 'conversations') return 'metadata only';
      const count = readNumberField(item, ['messageCount']);
      if (readBooleanField(item, ['hasCachedTranscript']) || count > 0) return 'cached transcript ' + String(count || '');
      return 'no cached transcript';
    }

    function showMirrorCatalogDetailByIndex(index) {
      const parsed = Number(index);
      const row = mirrorCatalogRows.find((candidate) => candidate.rowIndex === parsed);
      if (!row) {
        $('mirrorCatalogDetailView').className = 'notice notice-bad';
        $('mirrorCatalogDetailView').textContent = 'Cached row not found.';
        $('mirrorCatalogDetailRaw').textContent = 'Cached row not found.';
        return;
      }
      showMirrorCatalogDetailByPath(buildMirrorCatalogItemPath(row));
    }

    async function showMirrorCatalogDetailByPath(path) {
      $('mirrorCatalogDetailView').className = 'notice notice-warn';
      $('mirrorCatalogDetailView').textContent = 'Loading cached item detail...';
      $('mirrorCatalogDetailRaw').textContent = 'Loading cached item detail...';
      try {
        const detail = await fetchJson(path);
        mirrorCatalogCurrentDetail = detail;
        $('mirrorCatalogDetailView').className = 'notice';
        $('mirrorCatalogDetailView').innerHTML = renderMirrorCatalogDetailView(detail);
        $('mirrorCatalogDetailRaw').textContent = asJson(detail);
      } catch (error) {
        mirrorCatalogCurrentDetail = null;
        const message = String(error.message || error);
        $('mirrorCatalogDetailView').className = 'notice notice-bad';
        $('mirrorCatalogDetailView').textContent = message;
        $('mirrorCatalogDetailRaw').textContent = message;
      }
    }

    function renderMirrorCatalogDetailView(detail) {
      if (!detail || typeof detail !== 'object') return '<span class="muted">No cached detail available.</span>';
      if (detail.kind === 'conversations') return renderConversationDetailView(detail);
      if (detail.kind === 'files' || detail.kind === 'artifacts' || detail.kind === 'media') {
        return renderCachedAssetDetailView(detail);
      }
      return renderGenericCatalogDetailView(detail);
    }

    function renderConversationDetailView(detail) {
      const item = detail.item || {};
      const turns = extractConversationTurns(item);
      const header = renderCatalogDetailHeader(detail, item);
      const relatedItems = renderConversationRelatedItems(detail, item);
      if (!turns.length) {
        return header
          + relatedItems
          + '<div class="notice notice-warn">No cached transcript turns are available for this conversation yet.</div>';
      }
      return header
        + relatedItems
        + renderConversationTranscriptActions(turns)
        + '<div class="chat-transcript">' + turns.map(renderChatTurn).join('') + '</div>';
    }

    function renderConversationRelatedItems(detail, item) {
      const files = readObjectArray(item, ['files']);
      const artifacts = readObjectArray(item, ['artifacts']);
      const sources = readObjectArray(item, ['sources']);
      if (!files.length && !artifacts.length && !sources.length) return '';
      return '<div class="notice">'
        + '<strong>Cached related items</strong>'
        + renderConversationRelatedSection('Files', 'files', files, detail)
        + renderConversationRelatedSection('Artifacts', 'artifacts', artifacts, detail)
        + renderConversationSourceSection(sources)
        + '</div>';
    }

    function renderConversationRelatedSection(label, kind, items, detail) {
      if (!items.length) return '';
      return '<div class="catalog-detail">'
        + '<div class="muted">' + escapeHtml(label) + '</div>'
        + items.map((item) => renderConversationRelatedLink(kind, item, detail)).join('')
        + '</div>';
    }

    function renderConversationRelatedLink(kind, item, detail) {
      const path = buildRelatedCatalogItemPath(detail, kind, item);
      const title = formatCatalogItemLabel(item);
      const subtitle = formatRelatedItemSubtitle(item);
      if (!path) {
        return '<span class="pill">' + escapeHtml(title) + subtitle + '</span>';
      }
      return '<a class="pill" href="' + escapeHtml(path) + '" data-related-item-path="' + escapeHtml(path) + '" onclick="showMirrorCatalogDetailByPath(this.dataset.relatedItemPath); return false;">'
        + escapeHtml(title)
        + subtitle
        + '</a>';
    }

    function renderConversationSourceSection(items) {
      if (!items.length) return '';
      return '<div class="catalog-detail">'
        + '<div class="muted">Sources</div>'
        + items.map(renderConversationSourceLink).join('')
        + '</div>';
    }

    function renderConversationSourceLink(item) {
      const title = formatCatalogItemLabel(item);
      const url = readStringField(item, ['url', 'href', 'sourceUrl']);
      const subtitle = formatRelatedItemSubtitle(item);
      if (!url) return '<span class="pill">' + escapeHtml(title) + subtitle + '</span>';
      return '<a class="pill" href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">'
        + escapeHtml(title)
        + subtitle
        + '</a>';
    }

    function buildRelatedCatalogItemPath(detail, kind, item) {
      const itemId = formatCatalogItemId(item);
      if (!itemId || itemId === 'unknown') return '';
      const params = new URLSearchParams({
        provider: detail.provider || currentMirrorCatalogProvider(),
        runtimeProfile: detail.runtimeProfileId || currentMirrorCatalogRuntimeProfile(),
        kind,
      });
      return '/v1/account-mirrors/catalog/items/' + encodeURIComponent(itemId) + '?' + params.toString();
    }

    function currentMirrorCatalogProvider() {
      const select = $('mirrorCatalogProvider');
      return select && select.value ? select.value : 'chatgpt';
    }

    function currentMirrorCatalogRuntimeProfile() {
      const input = $('mirrorCatalogRuntimeProfile');
      return input && input.value ? input.value : 'default';
    }

    function formatRelatedItemSubtitle(item) {
      const type = readStringField(item, ['mimeType', 'type', 'source']);
      return type ? ' <span class="muted">(' + escapeHtml(type) + ')</span>' : '';
    }

    function renderConversationTranscriptActions(turns) {
      return '<div class="chat-transcript-actions">'
        + '<input id="mirrorConversationTranscriptSearch" type="search" placeholder="Search cached transcript" oninput="filterCurrentMirrorConversationTranscript()" />'
        + '<button type="button" onclick="downloadCurrentMirrorConversationTranscript()">Download Transcript.md</button>'
        + '<button type="button" onclick="clearCurrentMirrorConversationTranscriptSearch()">Clear</button>'
        + '<span id="mirrorConversationTranscriptSearchStatus" class="muted">' + escapeHtml(String(turns.length)) + ' cached turns</span>'
        + '</div>';
    }

    function renderGenericCatalogDetailView(detail) {
      return renderCatalogDetailHeader(detail, detail.item || {});
    }

    function renderCachedAssetDetailView(detail) {
      const item = detail.item || {};
      return renderCatalogDetailHeader(detail, item)
        + '<div class="notice">'
        + '<strong>Cached item inspector</strong>'
        + renderCatalogItemInspectorFields(detail, item)
        + renderCatalogItemExternalLinks(item)
        + renderCatalogItemPreview(detail, item)
        + '</div>';
    }

    function renderCatalogItemInspectorFields(detail, item) {
      const fields = [
        ['Kind', detail.kind || 'unknown'],
        ['Provider', readCatalogItemStringField(item, ['provider']) || detail.provider || 'unknown'],
        ['Source', readCatalogItemStringField(item, ['source', 'type']) || 'unknown'],
        ['MIME', readCatalogItemStringField(item, ['mimeType', 'mime', 'contentType']) || 'unknown'],
        ['Size', formatCatalogItemSize(readCatalogItemNumberField(item, ['size', 'sizeBytes', 'bytes', 'fileSize']))],
        ['Conversation', readCatalogItemStringField(item, ['conversationId']) || 'none'],
        ['Project', readCatalogItemStringField(item, ['projectId']) || 'none'],
        ['Created', readCatalogItemStringField(item, ['createdAt', 'created']) || 'unknown'],
        ['Updated', formatCatalogItemTimestamp(item)],
      ];
      return '<dl>' + fields.map(([key, value]) =>
        '<dt>' + escapeHtml(key) + '</dt><dd>' + escapeHtml(value) + '</dd>'
      ).join('') + '</dl>';
    }

    function renderCatalogItemExternalLinks(item) {
      const links = [
        ['URL', readCatalogItemStringField(item, ['url', 'href', 'remoteUrl', 'uri'])],
        ['Download', readCatalogItemStringField(item, ['downloadUrl', 'downloadHref'])],
        ['Thumbnail', readCatalogItemStringField(item, ['thumbnailUrl', 'previewUrl'])],
      ].filter((entry, index, list) => entry[1] && list.findIndex((candidate) => candidate[1] === entry[1]) === index);
      if (!links.length) return '<div class="muted">No cached external URLs.</div>';
      return '<div class="catalog-detail">'
        + '<div class="muted">Cached URLs</div>'
        + links.map(([label, url]) => renderCatalogExternalLink(label, url)).join('')
        + '</div>';
    }

    function renderCatalogExternalLink(label, url) {
      return '<a class="pill" href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">'
        + escapeHtml(label)
        + '</a>';
    }

    function renderCatalogItemPreview(detail, item) {
      const preview = resolveCatalogItemPreview(detail, item);
      if (!preview) {
        return '<div class="asset-preview">'
          + '<strong>Cached preview</strong>'
          + '<div class="muted">No browser-safe cached preview is available for this item.</div>'
          + '</div>';
      }
      if (preview.type === 'text') {
        return '<div class="asset-preview">'
          + '<strong>Cached preview</strong>'
          + '<pre>' + escapeHtml(preview.text) + '</pre>'
          + '</div>';
      }
      if (preview.type === 'image') {
        return '<div class="asset-preview">'
          + '<strong>Cached preview</strong>'
          + '<img src="' + escapeHtml(preview.url) + '" alt="' + escapeHtml(formatCatalogItemLabel(item)) + '" loading="lazy">'
          + '</div>';
      }
      if (preview.type === 'video') {
        return '<div class="asset-preview">'
          + '<strong>Cached preview</strong>'
          + '<video src="' + escapeHtml(preview.url) + '" controls preload="metadata"></video>'
          + '</div>';
      }
      if (preview.type === 'audio') {
        return '<div class="asset-preview">'
          + '<strong>Cached preview</strong>'
          + '<audio src="' + escapeHtml(preview.url) + '" controls preload="metadata"></audio>'
          + '</div>';
      }
      return '<div class="asset-preview">'
        + '<strong>Cached preview</strong>'
        + '<iframe src="' + escapeHtml(preview.url) + '" title="' + escapeHtml(formatCatalogItemLabel(item)) + '"></iframe>'
        + '</div>';
    }

    function resolveCatalogItemPreview(detail, item) {
      const text = readCatalogItemStringField(item, ['markdown', 'text', 'content', 'body']);
      if (text) return { type: 'text', text };
      const localAssetUrl = readCatalogItemStringField(item, ['localPath', 'path', 'filePath', 'absolutePath', 'assetStorageRelpath', 'storageRelpath'])
        ? buildCatalogItemAssetPath(detail)
        : null;
      const url = localAssetUrl || readCatalogPreviewUrl(item);
      if (!url) return null;
      const mime = (readCatalogItemStringField(item, ['mimeType', 'mime', 'contentType']) || '').toLowerCase();
      const kind = [
        detail.kind,
        readCatalogItemStringField(item, ['kind', 'mediaType', 'type']),
        readCatalogItemStringField(readObjectField(item, 'metadata') || {}, ['fileName', 'name', 'title']),
        url,
      ].join(' ').toLowerCase();
      if (mime.startsWith('image/') || /\bimage\b/.test(kind) || /[.](png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(url)) {
        return { type: 'image', url };
      }
      if (mime.startsWith('video/') || /\bvideo\b/.test(kind) || /[.](mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(url)) {
        return { type: 'video', url };
      }
      if (mime.startsWith('audio/') || /\baudio\b|\bmusic\b/.test(kind) || /[.](mp3|m4a|wav|ogg)(?:[?#].*)?$/i.test(url)) {
        return { type: 'audio', url };
      }
      if (mime === 'application/pdf' || /[.]pdf(?:[?#].*)?$/i.test(url)) {
        return { type: 'pdf', url };
      }
      return null;
    }

    function buildCatalogItemAssetPath(detail) {
      const params = new URLSearchParams();
      if (detail.provider) params.set('provider', detail.provider);
      if (detail.runtimeProfileId) params.set('runtimeProfile', detail.runtimeProfileId);
      if (detail.kind) params.set('kind', detail.kind);
      const itemId = detail.itemId || formatCatalogItemId(detail.item || {});
      return '/v1/account-mirrors/catalog/items/' + encodeURIComponent(itemId) + '/asset?' + params.toString();
    }

    function readCatalogPreviewUrl(item) {
      const candidates = [
        readCatalogItemStringField(item, ['previewUrl', 'thumbnailUrl']),
        readCatalogItemStringField(item, ['downloadUrl', 'downloadHref']),
        readCatalogItemStringField(item, ['remoteUrl', 'url', 'href', 'uri']),
      ].filter(Boolean);
      return candidates.find(isSafePreviewUrl) || null;
    }

    function isSafePreviewUrl(value) {
      if (!value) return false;
      const normalized = String(value).trim().toLowerCase();
      return normalized.startsWith('http://')
        || normalized.startsWith('https://')
        || normalized.startsWith('data:image/')
        || normalized.startsWith('data:video/')
        || normalized.startsWith('data:audio/')
        || normalized.startsWith('data:application/pdf;')
        || normalized.startsWith('data:application/pdf,');
    }

    function formatCatalogItemSize(value) {
      if (!value) return 'unknown';
      if (value < 1024) return String(value) + ' B';
      if (value < 1048576) return String(Math.round(value / 102.4) / 10) + ' KB';
      return String(Math.round(value / 104857.6) / 10) + ' MB';
    }

    function renderCatalogDetailHeader(detail, item) {
      const title = formatCatalogItemLabel(item);
      const fields = [
        ['Kind', detail.kind || 'unknown'],
        ['Provider', detail.provider || 'unknown'],
        ['Profile', detail.runtimeProfileId || 'unknown'],
        ['Identity', detail.boundIdentityKey || 'unbound'],
        ['ID', detail.itemId || formatCatalogItemId(item)],
        ['Updated', formatCatalogItemTimestamp(item)],
        ['URL', readStringField(item, ['url', 'href']) || 'none'],
      ];
      return '<h2>' + escapeHtml(title) + '</h2><dl>' + fields.map(([key, value]) =>
        '<dt>' + escapeHtml(key) + '</dt><dd>' + escapeHtml(value) + '</dd>'
      ).join('') + '</dl>';
    }

    function extractConversationTurns(item) {
      const direct = readTurnArray(item, ['messages', 'turns', 'conversation', 'transcript']);
      if (direct.length) return direct;
      if (item && typeof item === 'object' && item.mapping && typeof item.mapping === 'object') {
        return Object.values(item.mapping)
          .map((entry) => entry && typeof entry === 'object' ? entry.message : null)
          .filter(Boolean)
          .map(normalizeConversationTurn)
          .filter(Boolean);
      }
      return [];
    }

    function readTurnArray(item, fields) {
      if (!item || typeof item !== 'object') return [];
      for (const field of fields) {
        const value = item[field];
        if (Array.isArray(value)) {
          return value.map(normalizeConversationTurn).filter(Boolean);
        }
      }
      return [];
    }

    function readObjectArray(item, fields) {
      if (!item || typeof item !== 'object') return [];
      for (const field of fields) {
        const value = item[field];
        if (Array.isArray(value)) {
          return value.filter((entry) => entry && typeof entry === 'object');
        }
      }
      return [];
    }

    function readObjectField(item, field) {
      if (!item || typeof item !== 'object') return null;
      const value = item[field];
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }

    function readCatalogItemStringField(item, fields) {
      return readStringField(item, fields)
        || readStringField(readObjectField(item, 'metadata') || {}, fields);
    }

    function readCatalogItemNumberField(item, fields) {
      return readNumberField(item, fields)
        || readNumberField(readObjectField(item, 'metadata') || {}, fields);
    }

    function normalizeConversationTurn(value) {
      if (!value || typeof value !== 'object') return null;
      const role = normalizeChatRole(readStringField(value, ['role', 'authorRole', 'speaker', 'from']) || readAuthorRole(value));
      const content = readConversationTurnContent(value);
      if (!content) return null;
      return { role, content };
    }

    function readAuthorRole(value) {
      const author = value && typeof value === 'object' ? value.author : null;
      return author && typeof author === 'object' ? readStringField(author, ['role', 'name']) : null;
    }

    function readConversationTurnContent(value) {
      const direct = readStringField(value, ['content', 'text', 'message', 'body', 'markdown']);
      if (direct) return direct;
      const content = value && typeof value === 'object' ? value.content : null;
      if (content && typeof content === 'object') {
        const parts = content.parts;
        if (Array.isArray(parts)) {
          return parts.map((part) => typeof part === 'string' ? part : stringifyCatalogItem(part)).join('\\n').trim();
        }
        return readStringField(content, ['text', 'content', 'markdown']);
      }
      const parts = value && typeof value === 'object' ? value.parts : null;
      if (Array.isArray(parts)) {
        return parts.map((part) => typeof part === 'string' ? part : stringifyCatalogItem(part)).join('\\n').trim();
      }
      return null;
    }

    function normalizeChatRole(role) {
      const normalized = String(role || 'assistant').toLowerCase();
      if (normalized.includes('user') || normalized.includes('human')) return 'user';
      if (normalized.includes('system')) return 'system';
      if (normalized.includes('tool')) return 'tool';
      return 'assistant';
    }

    function renderChatTurn(turn) {
      return '<div class="chat-turn chat-turn-' + escapeHtml(turn.role) + '">'
        + '<div class="chat-role">' + escapeHtml(turn.role) + '</div>'
        + '<div class="chat-bubble">' + escapeHtml(turn.content) + '</div>'
        + '</div>';
    }

    function filterCurrentMirrorConversationTranscript() {
      const input = $('mirrorConversationTranscriptSearch');
      const status = $('mirrorConversationTranscriptSearchStatus');
      if (!input || !status) return;
      const query = normalizeTranscriptSearchTerm(input.value);
      const turns = Array.from(document.querySelectorAll('#mirrorCatalogDetailView .chat-turn'));
      let visible = 0;
      for (const turn of turns) {
        const text = normalizeTranscriptSearchTerm(turn.textContent);
        const match = !query || text.includes(query);
        turn.style.display = match ? '' : 'none';
        if (match) visible += 1;
      }
      status.textContent = query
        ? String(visible) + ' of ' + String(turns.length) + ' cached turns'
        : String(turns.length) + ' cached turns';
    }

    function clearCurrentMirrorConversationTranscriptSearch() {
      const input = $('mirrorConversationTranscriptSearch');
      if (input) input.value = '';
      filterCurrentMirrorConversationTranscript();
    }

    function normalizeTranscriptSearchTerm(value) {
      return String(value || '').trim().toLowerCase();
    }

    function downloadCurrentMirrorConversationTranscript() {
      const detail = mirrorCatalogCurrentDetail;
      const item = detail && typeof detail === 'object' ? detail.item || {} : {};
      const turns = extractConversationTurns(item);
      if (!turns.length) return;
      const markdown = renderConversationTranscriptMarkdown(detail, item, turns);
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = formatTranscriptFilename(detail, item);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }

    function renderConversationTranscriptMarkdown(detail, item, turns) {
      const title = formatCatalogItemLabel(item);
      const lines = [
        '# ' + title,
        '',
        '- Provider: ' + (detail.provider || 'unknown'),
        '- Profile: ' + (detail.runtimeProfileId || 'unknown'),
        '- Identity: ' + (detail.boundIdentityKey || 'unbound'),
        '- ID: ' + (detail.itemId || formatCatalogItemId(item)),
        '- URL: ' + (readStringField(item, ['url', 'href']) || 'none'),
        '',
      ];
      for (const turn of turns) {
        lines.push('## ' + turn.role);
        lines.push('');
        lines.push(turn.content);
        lines.push('');
      }
      return lines.join('\\n').trim() + '\\n';
    }

    function formatTranscriptFilename(detail, item) {
      const id = detail && detail.itemId ? detail.itemId : formatCatalogItemId(item);
      const title = formatCatalogItemLabel(item);
      const base = (title + '-' + id).toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 96) || 'conversation-transcript';
      return base + '.md';
    }

    function formatCatalogItemLabel(item) {
      return readStringField(item, ['title', 'name', 'filename', 'fileName', 'conversationTitle', 'projectName'])
        || formatCatalogItemId(item)
        || 'untitled';
    }

    function formatCatalogItemId(item) {
      return readStringField(item, ['id', 'conversationId', 'projectId', 'artifactId', 'fileId', 'mediaId', 'url', 'href'])
        || 'unknown';
    }

    function formatCatalogItemTimestamp(item) {
      return readStringField(item, [
        'updatedAt',
        'createdAt',
        'lastUpdatedAt',
        'lastActivityAt',
        'collectedAt',
        'generatedAt',
        'timestamp',
      ]) || 'unknown';
    }

    function readStringField(value, fields) {
      if (!value || typeof value !== 'object') return null;
      for (const field of fields) {
        const candidate = value[field];
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
      }
      return null;
    }

    function readNumberField(value, fields) {
      if (!value || typeof value !== 'object') return 0;
      for (const field of fields) {
        const candidate = value[field];
        if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
        if (typeof candidate === 'string' && candidate.trim() && Number.isFinite(Number(candidate))) return Number(candidate);
      }
      return 0;
    }

    function readBooleanField(value, fields) {
      if (!value || typeof value !== 'object') return false;
      for (const field of fields) {
        const candidate = value[field];
        if (typeof candidate === 'boolean') return candidate;
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().toLowerCase() === 'true';
      }
      return false;
    }

    function stringifyCatalogItem(item) {
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    }

    function trimCatalogSnippet(value) {
      const text = String(value || '');
      return text.length > 220 ? text.slice(0, 217) + '...' : text;
    }

    async function controlMirrorCompletion(action) {
      const id = $('mirrorCompletionId').value.trim();
      if (!id) {
        $('mirrorCompletions').textContent = 'Enter a completion id.';
        setMirrorControlNotice('Enter a completion id before running a control action.', 'warn');
        return;
      }
      await controlMirrorCompletionById(id, action);
    }

    async function inspectSelectedMirrorCompletion() {
      const id = $('mirrorCompletionId').value.trim();
      if (!id) {
        $('mirrorCompletions').textContent = 'Enter a completion id.';
        setMirrorControlNotice('Enter a completion id before inspecting details.', 'warn');
        return;
      }
      await inspectMirrorCompletion(id);
    }

    async function controlMirrorCompletionById(id, action) {
      setMirrorControlNotice('Sending ' + action + ' for ' + id + '...', 'warn');
      for (const buttonId of ['pauseMirrorCompletion', 'resumeMirrorCompletion', 'cancelMirrorCompletion']) {
        $(buttonId).disabled = true;
      }
      for (const button of document.querySelectorAll('[data-completion-action]')) {
        button.disabled = true;
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
        const controlled = payload.controlResult || payload;
        $('mirrorCompletions').textContent = asJson({ controlled });
        setMirrorControlNotice('Completed ' + action + ' for ' + id + ': ' + (controlled.status || 'ok') + '.', 'ok');
        await refreshStatus();
      } catch (error) {
        const message = String(error.message || error);
        $('mirrorCompletions').textContent = message;
        setMirrorControlNotice('Failed ' + action + ' for ' + id + ': ' + message, 'bad');
      } finally {
        for (const buttonId of ['pauseMirrorCompletion', 'resumeMirrorCompletion', 'cancelMirrorCompletion']) {
          $(buttonId).disabled = false;
        }
        for (const button of document.querySelectorAll('[data-completion-action]')) {
          button.disabled = false;
        }
      }
    }

    async function inspectMirrorCompletion(id) {
      if (!id) return;
      setMirrorControlNotice('Inspecting ' + id + '...', 'warn');
      $('mirrorCompletions').textContent = 'Inspecting ' + id + '...';
      try {
        const detail = await fetchJson('/v1/account-mirrors/completions/' + encodeURIComponent(id));
        $('mirrorCompletions').textContent = asJson({ selectedCompletion: detail });
        setMirrorControlNotice('Loaded details for ' + id + '.', 'ok');
      } catch (error) {
        const message = String(error.message || error);
        $('mirrorCompletions').textContent = message;
        setMirrorControlNotice('Failed to inspect ' + id + ': ' + message, 'bad');
      }
    }

    async function refreshStatus() {
      $('serverSummary').innerHTML = '<dt>Status</dt><dd class="muted">Loading...</dd>';
      $('opsControls').textContent = 'Loading controls...';
      $('mirrorStatus').textContent = 'Loading...';
      $('mirrorAttentionQueue').textContent = 'Loading attention queue...';
      $('mirrorTargetTable').textContent = 'Loading target accounts...';
      $('mirrorActiveCompletionTable').textContent = 'Loading active operations...';
      $('mirrorTargets').textContent = 'Loading...';
      $('mirrorCompletions').textContent = 'Loading...';
      try {
        const status = await fetchJson('/status');
        renderOpsControls(status);
        renderServerSummary(status);
        renderMirrorCompletions(status);
      } catch (error) {
        $('serverSummary').innerHTML = '<dt>Status</dt><dd class="bad">' + String(error.message || error) + '</dd>';
        $('opsControls').textContent = String(error.message || error);
        $('mirrorTargetTable').textContent = String(error.message || error);
        $('mirrorActiveCompletionTable').textContent = String(error.message || error);
        $('mirrorTargets').textContent = String(error.message || error);
        $('mirrorCompletions').textContent = String(error.message || error);
      }
      try {
        $('mirrorStatus').textContent = asJson(await fetchJson('/v1/account-mirrors/status'));
      } catch (error) {
        $('mirrorStatus').textContent = String(error.message || error);
      }
      await loadMirrorCatalog();
    }

    async function postStatusControl(payload) {
      const response = await fetch('/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(asJson({ status: response.status, payload: result }));
      }
      return result.controlResult || result;
    }

    async function controlBackgroundDrain(action) {
      await controlService('background drain', () => postStatusControl({ backgroundDrain: { action } }));
    }

    async function controlMirrorScheduler(action, dryRun) {
      const body = { accountMirrorScheduler: { action } };
      if (action === 'run-once' && typeof dryRun === 'boolean') {
        body.accountMirrorScheduler.dryRun = dryRun;
      }
      await controlService('mirror scheduler', () => postStatusControl(body));
    }

    async function controlService(label, task) {
      setOpsControlNotice('Sending control action for ' + label + '...', 'warn');
      setOpsButtonsDisabled(true);
      let refreshed = false;
      try {
        const result = await task();
        setOpsControlNotice('Completed ' + label + ' control: ' + (result.action || result.status || 'ok') + '.', 'ok');
        await refreshStatus();
        refreshed = true;
      } catch (error) {
        setOpsControlNotice('Failed ' + label + ' control: ' + String(error.message || error), 'bad');
      } finally {
        if (!refreshed) {
          setOpsButtonsDisabled(false);
        }
      }
    }

    function setOpsButtonsDisabled(disabled) {
      for (const button of document.querySelectorAll('#opsControls button')) {
        button.disabled = disabled;
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
    $('inspectMirrorCompletionById').addEventListener('click', inspectSelectedMirrorCompletion);
    $('pauseMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('pause'));
    $('resumeMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('resume'));
    $('cancelMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('cancel'));
    $('loadMirrorCatalog').addEventListener('click', loadMirrorCatalog);
    $('showVisibleMirrorCatalogPreviewUrls').addEventListener('click', showVisibleMirrorCatalogPreviewUrls);
    $('hideVisibleMirrorCatalogPreviewUrls').addEventListener('click', hideVisibleMirrorCatalogPreviewUrls);
    $('reviewVisibleMirrorCatalogPreviews').addEventListener('click', reviewVisibleMirrorCatalogPreviews);
    $('openVisibleMirrorCatalogPreviewUrls').addEventListener('click', openVisibleMirrorCatalogPreviewUrls);
    $('copyVisibleMirrorCatalogPreviewUrls').addEventListener('click', copyVisibleMirrorCatalogPreviewUrls);
    $('downloadVisibleMirrorCatalogPreviewUrls').addEventListener('click', downloadVisibleMirrorCatalogPreviewUrls);
    $('selectAllMirrorPreviewSessionItems').addEventListener('click', () => setMirrorPreviewSessionSelection(true));
    $('clearMirrorPreviewSessionSelection').addEventListener('click', () => setMirrorPreviewSessionSelection(false));
    $('copyMirrorPreviewSessionUrls').addEventListener('click', copyMirrorPreviewSessionUrls);
    $('downloadMirrorPreviewSessionUrls').addEventListener('click', downloadMirrorPreviewSessionUrls);
    $('mirrorPreviewSessionGrid').addEventListener('change', updateMirrorPreviewSessionSelection);
    $('mirrorCatalogSearch').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') loadMirrorCatalog();
    });
    $('probeWorkbench').addEventListener('click', probeWorkbench);
    $('probeRun').addEventListener('click', probeRun);
    initializeMirrorCatalogFiltersFromUrl();
    initializeMirrorPreviewSession();
    refreshStatus();
  </script>
</body>
</html>`;
}
