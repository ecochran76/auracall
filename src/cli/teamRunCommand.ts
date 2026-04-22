import { randomUUID } from 'node:crypto';
import { createTeamRuntimeBridge, type TeamRuntimeBridge, type TeamRuntimeBridgeResult } from '../teams/runtimeBridge.js';
import { resolveHostLocalActionExecutionPolicy } from '../config/model.js';
import {
  inspectTeamRunLinkage,
  type InspectTeamRunLinkageInput,
  type TeamRunInspectionPayload,
} from '../teams/inspection.js';
import {
  reviewTeamRunLedger,
  type ReviewTeamRunLedgerInput,
  type TeamRunReviewLedgerPayload,
} from '../teams/reviewLedger.js';
import type { TaskRunSpec } from '../teams/types.js';
import {
  buildBoundedTeamTaskRunSpec,
  type TeamRunLocalActionPolicyInput,
  type TeamRunOutputContract,
  type TeamRunResponseFormat,
} from '../teams/taskRunSpecBuilder.js';
import {
  buildTeamRunExecutionPayload,
  type TeamRunExecutionPayload,
} from '../teams/executionPayload.js';
import { createExecutionRuntimeControl } from '../runtime/control.js';
import { createConfiguredExecutionRunAffinity } from '../runtime/configuredAffinity.js';
import { createConfiguredStoredStepExecutor } from '../runtime/configuredExecutor.js';
import {
  createLocalRunnerCapabilitySummary,
  createLocalRunnerEligibilityNote,
} from '../runtime/localRunnerCapabilities.js';
import { createExecutionRunnerRecord } from '../runtime/model.js';
import { createExecutionRunnerControl } from '../runtime/runnersControl.js';
import type { ExecutionServiceHostDeps } from '../runtime/serviceHost.js';
import { createExecutionServiceHost } from '../runtime/serviceHost.js';

export type TeamRunCliResponseFormat = TeamRunResponseFormat;

export type TeamRunCliLocalActionPolicyInput = TeamRunLocalActionPolicyInput;

export interface ExecuteConfiguredTeamRunInput {
  config: Record<string, unknown>;
  teamId: string;
  objective: string;
  title?: string | null;
  promptAppend?: string | null;
  structuredContext?: Record<string, unknown> | null;
  responseFormat?: TeamRunCliResponseFormat;
  outputContract?: TeamRunOutputContract | null;
  maxTurns?: number | null;
  localActionPolicy?: TeamRunCliLocalActionPolicyInput | null;
  taskRunSpec?: TaskRunSpec | null;
  bridge?: TeamRuntimeBridge;
  now?: () => string;
  randomId?: () => string;
  contextCommand?: string;
  requestedBy?: TaskRunSpec['requestedBy'];
  trigger?: TaskRunSpec['trigger'];
  executionRequestedBy?: string;
  executeStoredRunStep?: ExecutionServiceHostDeps['executeStoredRunStep'];
}

export type TeamRunCliExecutionPayload = TeamRunExecutionPayload;

export interface ExecuteConfiguredTeamRunResult {
  taskRunSpec: TaskRunSpec;
  bridgeResult: TeamRuntimeBridgeResult;
  payload: TeamRunCliExecutionPayload;
}

const CLI_LOCAL_RUNNER_HEARTBEAT_TTL_MS = 15_000;

export function buildCliTaskRunSpec(input: {
  nowIso: string;
  taskRunSpecId: string;
  teamId: string;
  objective: string;
  title?: string | null;
  promptAppend?: string | null;
  structuredContext?: Record<string, unknown> | null;
  responseFormat?: TeamRunCliResponseFormat;
  outputContract?: TeamRunOutputContract | null;
  maxTurns?: number | null;
  localActionPolicy?: TeamRunCliLocalActionPolicyInput | null;
  contextCommand?: string;
  requestedBy?: TaskRunSpec['requestedBy'];
  trigger?: TaskRunSpec['trigger'];
}): TaskRunSpec {
  return buildBoundedTeamTaskRunSpec({
    ...input,
    context: {
      command: input.contextCommand ?? 'auracall teams run',
    },
    requestedBy: input.requestedBy ?? {
      kind: 'cli',
      label: 'auracall teams run',
    },
    trigger: input.trigger ?? 'cli',
  });
}

export function buildTeamRunCliExecutionPayload(input: {
  teamId: string;
  bridgeResult: TeamRuntimeBridgeResult;
  taskRunSpec: TaskRunSpec;
}): TeamRunCliExecutionPayload {
  return buildTeamRunExecutionPayload(input);
}

export function formatTeamRunCliExecutionPayload(payload: TeamRunCliExecutionPayload): string {
  const lines = [
    `Team: ${payload.teamId}`,
    `TaskRunSpec: ${payload.taskRunSpecId}`,
    `Team run: ${payload.teamRunId}`,
    `Runtime run: ${payload.runtimeRunId}`,
    `Runtime source: ${payload.runtimeSourceKind}`,
    `Runtime status: ${payload.runtimeRunStatus}`,
    `Shared state: ${payload.sharedStateStatus}`,
    `Terminal step count: ${payload.terminalStepCount}`,
    `Updated at: ${payload.runtimeUpdatedAt}`,
    `Final output summary: ${payload.finalOutputSummary ?? '(none)'}`,
    'Steps:',
    ...payload.stepSummaries.map((step) => {
      const runtimeStepId = step.runtimeStepId ?? '(none)';
      const runtimeStatus = step.runtimeStepStatus ?? '(none)';
      return (
        `- team step ${step.teamStepOrder} ${step.teamStepId} -> ${step.teamStepStatus}; ` +
        `runtime step ${runtimeStepId} -> ${runtimeStatus}; ` +
        `service ${step.service ?? '(none)'}; ` +
        `runtime profile ${step.runtimeProfileId ?? '(none)'}`
      );
    }),
  ];

  if (payload.sharedStateNotes.length > 0) {
    lines.push('Shared state notes:');
    lines.push(...payload.sharedStateNotes.map((note) => `- ${note}`));
  }

  return lines.join('\n');
}

export function formatTeamRunCliInspectionPayload(payload: TeamRunInspectionPayload): string {
  const lines = [
    `Resolved by: ${payload.resolvedBy}`,
    `Query: ${payload.queryId}`,
    `TaskRunSpec: ${payload.taskRunSpecSummary?.id ?? '(none)'}`,
    `Matching runtime runs: ${payload.matchingRuntimeRunCount}`,
  ];

  if (payload.taskRunSpecSummary) {
    lines.push(`Team: ${payload.taskRunSpecSummary.teamId}`);
    lines.push(`Title: ${payload.taskRunSpecSummary.title}`);
    lines.push(`Objective: ${payload.taskRunSpecSummary.objective}`);
    lines.push(`Created at: ${payload.taskRunSpecSummary.createdAt}`);
    lines.push(`Persisted at: ${payload.taskRunSpecSummary.persistedAt}`);
    lines.push(`Requested outputs: ${payload.taskRunSpecSummary.requestedOutputCount}`);
    lines.push(`Input artifacts: ${payload.taskRunSpecSummary.inputArtifactCount}`);
  }

  if (!payload.runtime) {
    lines.push('Runtime run: (none)');
    return lines.join('\n');
  }

  lines.push(`Runtime run: ${payload.runtime.runtimeRunId}`);
  lines.push(`Team run: ${payload.runtime.teamRunId ?? '(none)'}`);
  lines.push(`Runtime source: ${payload.runtime.runtimeSourceKind}`);
  lines.push(`Runtime status: ${payload.runtime.runtimeRunStatus}`);
  lines.push(`Shared state: ${payload.runtime.sharedStateStatus}`);
  lines.push(`Step count: ${payload.runtime.stepCount}`);
  lines.push(`Handoffs: ${payload.runtime.handoffCount}`);
  lines.push(`Local action requests: ${payload.runtime.localActionRequestCount}`);
  lines.push(`Next runnable step: ${payload.runtime.nextRunnableStepId ?? '(none)'}`);
  lines.push(`Updated at: ${payload.runtime.runtimeUpdatedAt}`);
  lines.push(`Active lease owner: ${payload.runtime.activeLeaseOwnerId ?? '(none)'}`);
  lines.push(`Runnable steps: ${payload.runtime.runnableStepIds.length > 0 ? payload.runtime.runnableStepIds.join(', ') : '(none)'}`);
  lines.push(`Deferred steps: ${payload.runtime.deferredStepIds.length > 0 ? payload.runtime.deferredStepIds.join(', ') : '(none)'}`);
  lines.push(`Waiting steps: ${payload.runtime.waitingStepIds.length > 0 ? payload.runtime.waitingStepIds.join(', ') : '(none)'}`);
  lines.push(`Running steps: ${payload.runtime.runningStepIds.length > 0 ? payload.runtime.runningStepIds.join(', ') : '(none)'}`);
  lines.push(`Blocked steps: ${payload.runtime.blockedStepIds.length > 0 ? payload.runtime.blockedStepIds.join(', ') : '(none)'}`);
  lines.push(`Blocked by failure: ${payload.runtime.blockedByFailureStepIds.length > 0 ? payload.runtime.blockedByFailureStepIds.join(', ') : '(none)'}`);
  lines.push(`Terminal steps: ${payload.runtime.terminalStepIds.length > 0 ? payload.runtime.terminalStepIds.join(', ') : '(none)'}`);
  if (payload.runtime.missingDependencyStepIds.length > 0) {
    lines.push(`Missing dependencies: ${payload.runtime.missingDependencyStepIds.join(', ')}`);
  }

  return lines.join('\n');
}

export function formatTeamRunCliReviewLedgerPayload(payload: TeamRunReviewLedgerPayload): string {
  const lines = [
    `Resolved by: ${payload.resolvedBy}`,
    `Query: ${payload.queryId}`,
    `Matching runtime runs: ${payload.matchingRuntimeRunCount}`,
    `TaskRunSpec: ${payload.taskRunSpecSummary?.id ?? payload.ledger.taskRunSpecId ?? '(none)'}`,
  ];

  if (payload.taskRunSpecSummary) {
    lines.push(`Team: ${payload.taskRunSpecSummary.teamId}`);
    lines.push(`Title: ${payload.taskRunSpecSummary.title}`);
    lines.push(`Objective: ${payload.taskRunSpecSummary.objective}`);
  }

  lines.push(`Team run: ${payload.ledger.teamRunId}`);
  lines.push(`Runtime run: ${payload.ledger.runtimeRunId}`);
  lines.push(`Status: ${payload.ledger.status}`);
  lines.push(`Created at: ${payload.ledger.createdAt}`);
  lines.push(`Updated at: ${payload.ledger.updatedAt}`);
  lines.push(`Steps: ${payload.ledger.sequence.length}`);
  for (const step of payload.ledger.sequence) {
    lines.push(
      `- ${step.order}. ${step.stepId} [${step.status}] agent=${step.agentId} service=${step.service ?? '(none)'} runtime=${step.runtimeProfileId ?? '(none)'}`,
    );
    if (step.parentStepIds.length > 0) {
      lines.push(`  depends on: ${step.parentStepIds.join(', ')}`);
    }
    if (step.providerConversationRef) {
      const providerRef = step.providerConversationRef;
      lines.push(
        `  provider ref: service=${providerRef.service} conversation=${providerRef.conversationId ?? '(none)'} project=${providerRef.projectId ?? '(none)'} model=${providerRef.model ?? '(none)'} url=${providerRef.url ?? providerRef.configuredUrl ?? '(none)'} cache=${providerRef.cachePath ?? '(none)'} cacheStatus=${providerRef.cachePathStatus ?? '(unknown)'}`,
      );
    } else {
      lines.push('  provider ref: (none)');
    }
    lines.push(`  prompt: ${step.inputSnapshot.prompt ?? '(none)'}`);
    if (step.outputSnapshot) {
      lines.push(`  output: ${step.outputSnapshot.summary ?? step.outputSnapshot.text ?? '(none)'}`);
    }
    if (step.failure) {
      lines.push(`  failure: ${step.failure.code}: ${step.failure.message}`);
    }
  }

  lines.push(`Handoffs: ${payload.ledger.handoffs.length}`);
  for (const handoff of payload.ledger.handoffs) {
    lines.push(
      `- ${handoff.id}: ${handoff.fromStepId} -> ${handoff.toStepId} [${handoff.status}] ${handoff.summary}`,
    );
  }
  lines.push(`Artifacts: ${payload.ledger.artifacts.length}`);
  lines.push(`Observations: ${payload.ledger.observations.length}`);
  for (const observation of payload.ledger.observations) {
    lines.push(
      `- ${observation.id}: ${observation.state} step=${observation.stepId ?? '(none)'} source=${observation.source} confidence=${observation.confidence} evidence=${observation.evidenceRef ?? '(none)'}`,
    );
  }

  return lines.join('\n');
}

export async function executeConfiguredTeamRun(
  input: ExecuteConfiguredTeamRunInput,
): Promise<ExecuteConfiguredTeamRunResult> {
  const teamId = input.teamId.trim();
  const now = input.now ?? (() => new Date().toISOString());
  const nowIso = now();
  const randomId = input.randomId?.() ?? randomUUID();
  const suffix = randomId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'run';
  const taskRunSpecId = `taskrun_${teamId}_${suffix}`;
  const runId = `teamrun_${teamId}_${suffix}`;
  const taskRunSpec =
    input.taskRunSpec ??
    buildCliTaskRunSpec({
      nowIso,
      taskRunSpecId,
      teamId,
      objective: input.objective,
      title: input.title,
      promptAppend: input.promptAppend,
      structuredContext: input.structuredContext,
      responseFormat: input.responseFormat,
      outputContract: input.outputContract,
      maxTurns: input.maxTurns,
      localActionPolicy: input.localActionPolicy,
      contextCommand: input.contextCommand,
      requestedBy: input.requestedBy,
      trigger: input.trigger,
    });
  const configuredBridge = input.bridge;
  const registeredLocalRunner = configuredBridge
    ? null
    : (() => {
      const control = createExecutionRuntimeControl();
      const runnersControl = createExecutionRunnerControl();
      const baseExecuteStoredRunStep =
        input.executeStoredRunStep ?? createConfiguredStoredStepExecutor(input.config);
      const localRunnerCapabilitySummary = createLocalRunnerCapabilitySummary(input.config);
      const teamSlug = teamId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32) || 'team';
      const runnerId = `runner:teams-run:${teamSlug}:${suffix}`;
      const hostId = `host:teams-run:${teamSlug}:${suffix}`;
      const heartbeatRunner = async (phase: 'heartbeat' | 'shutdown' | 'register') => {
        const heartbeatAt = now();
        const expiresAt = new Date(Date.parse(heartbeatAt) + CLI_LOCAL_RUNNER_HEARTBEAT_TTL_MS).toISOString();
        if (phase === 'register') {
          await runnersControl.registerRunner({
            runner: createExecutionRunnerRecord({
              id: runnerId,
              hostId,
              startedAt: heartbeatAt,
              expiresAt,
              serviceIds: localRunnerCapabilitySummary.serviceIds,
              runtimeProfileIds: localRunnerCapabilitySummary.runtimeProfileIds,
              browserProfileIds: localRunnerCapabilitySummary.browserProfileIds,
              serviceAccountIds: localRunnerCapabilitySummary.serviceAccountIds,
              browserCapable: localRunnerCapabilitySummary.browserCapable,
              eligibilityNote: createLocalRunnerEligibilityNote({
                phase,
                baseLabel: 'cli teams run local runner',
                capabilitySummary: localRunnerCapabilitySummary,
              }),
            }),
          });
          return;
        }
        if (phase === 'shutdown') {
          await runnersControl.markRunnerStale({
            runnerId,
            staleAt: heartbeatAt,
            eligibilityNote: createLocalRunnerEligibilityNote({
              phase,
              baseLabel: 'cli teams run local runner',
              capabilitySummary: localRunnerCapabilitySummary,
            }),
          });
          return;
        }
        await runnersControl.heartbeatRunner({
          runnerId,
          heartbeatAt,
          expiresAt,
          eligibilityNote: createLocalRunnerEligibilityNote({
            phase,
            baseLabel: 'cli teams run local runner',
            capabilitySummary: localRunnerCapabilitySummary,
          }),
        });
      };
      const executeStoredRunStep: ExecutionServiceHostDeps['executeStoredRunStep'] = async (context) => {
        await heartbeatRunner('heartbeat');
        try {
          return await baseExecuteStoredRunStep?.(context);
        } finally {
          await heartbeatRunner('heartbeat');
        }
      };
      const host = createExecutionServiceHost({
        control,
        runnersControl,
        now,
        ownerId: runnerId,
        runnerId,
        localActionExecutionPolicy: resolveHostLocalActionExecutionPolicy(input.config),
        createRunAffinity: (inspection) => createConfiguredExecutionRunAffinity(input.config, inspection),
        executeStoredRunStep,
      });

      return {
        bridge: createTeamRuntimeBridge({
          control,
          host,
          now,
        }),
        async registerRunner() {
          await heartbeatRunner('register');
        },
        async markRunnerStale() {
          await heartbeatRunner('shutdown');
        },
      };
    })();

  const activeBridge = configuredBridge ?? registeredLocalRunner?.bridge;
  if (!activeBridge) {
    throw new Error('Team run execution bridge was not initialized.');
  }

  const execution = async () =>
    activeBridge.executeFromConfigTaskRunSpec({
      config: input.config,
      teamId: taskRunSpec.teamId,
      runId,
      createdAt: nowIso,
      trigger: input.trigger ?? taskRunSpec.trigger,
      requestedBy:
        input.executionRequestedBy ??
        input.requestedBy?.label ??
        taskRunSpec.requestedBy?.label ??
        taskRunSpec.requestedBy?.id ??
        taskRunSpec.requestedBy?.kind ??
        'auracall teams run',
      taskRunSpec,
    });

  const bridgeResult = configuredBridge
    ? await execution()
    : await (async () => {
        if (!registeredLocalRunner) {
          throw new Error('Team run local runner was not initialized.');
        }
        await registeredLocalRunner.registerRunner();
        try {
          return await execution();
        } finally {
          await registeredLocalRunner.markRunnerStale();
        }
      })();

  return {
    taskRunSpec,
    bridgeResult,
    payload: buildTeamRunCliExecutionPayload({
      teamId: taskRunSpec.teamId,
      bridgeResult,
      taskRunSpec,
    }),
  };
}

export async function inspectConfiguredTeamRun(input: InspectTeamRunLinkageInput): Promise<TeamRunInspectionPayload> {
  return inspectTeamRunLinkage(input);
}

export async function reviewConfiguredTeamRun(input: ReviewTeamRunLedgerInput): Promise<TeamRunReviewLedgerPayload> {
  return reviewTeamRunLedger(input);
}
