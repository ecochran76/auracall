import type { ExecutionRunRecordBundle, ExecutionRunStepStatus } from '../runtime/types.js';
import type { ExecutionRunStoredRecord } from '../runtime/store.js';
import { createExecutionRuntimeControl } from '../runtime/control.js';
import type { ExecutionRuntimeControlContract } from '../runtime/contract.js';
import type { TeamRunArtifactRef, TeamRunHandoff } from './types.js';
import {
  createTaskRunSpecRecordStore,
  summarizeTaskRunSpecStoredRecord,
  type TaskRunSpecInspectionSummary,
  type TaskRunSpecRecordStore,
} from './store.js';

export interface ReviewTeamRunLedgerInput {
  taskRunSpecId?: string | null;
  teamRunId?: string | null;
  runtimeRunId?: string | null;
  control?: ExecutionRuntimeControlContract;
  taskRunSpecStore?: TaskRunSpecRecordStore;
}

export interface TeamRunReviewLedgerPayload {
  resolvedBy: 'task-run-spec-id' | 'team-run-id' | 'runtime-run-id';
  queryId: string;
  matchingRuntimeRunCount: number;
  matchingRuntimeRunIds: string[];
  taskRunSpecSummary: TaskRunSpecInspectionSummary | null;
  ledger: TeamRunReviewLedger;
}

export class TeamRunReviewLedgerError extends Error {
  readonly status: 'invalid-request' | 'not-found';

  constructor(status: 'invalid-request' | 'not-found', message: string) {
    super(message);
    this.name = 'TeamRunReviewLedgerError';
    this.status = status;
  }
}

export type TeamRunReviewLedgerStatus = 'planned' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type TeamRunReviewObservationState =
  | 'thinking'
  | 'response-incoming'
  | 'response-complete'
  | 'provider-error'
  | 'login-required'
  | 'captcha-or-human-verification'
  | 'awaiting-human'
  | 'unknown';

export type TeamRunReviewObservationSource = 'runtime' | 'provider-adapter' | 'browser-service' | 'operator';

export interface TeamRunProviderConversationRef {
  service: string;
  conversationId: string | null;
  cachePath: string | null;
  cachePathStatus: 'available' | 'unavailable' | null;
  cachePathReason: string | null;
  url: string | null;
  configuredUrl: string | null;
  projectId: string | null;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  agentId: string | null;
  model: string | null;
}

export interface TeamRunReviewStep {
  stepId: string;
  sourceStepId: string | null;
  order: number;
  parentStepIds: string[];
  agentId: string;
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  service: string | null;
  serviceAccountId: string | null;
  providerConversationRef: TeamRunProviderConversationRef | null;
  inputSnapshot: {
    prompt: string | null;
    structuredContext: Record<string, unknown> | null;
    artifactIds: string[];
  };
  outputSnapshot: {
    summary: string | null;
    text: string | null;
    structuredOutputs: Record<string, unknown> | null;
    artifactIds: string[];
  } | null;
  status: ExecutionRunStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  failure: {
    code: string;
    message: string;
    providerState: string | null;
  } | null;
}

export interface TeamRunReviewHandoff {
  id: string;
  fromStepId: string;
  toStepId: string;
  fromAgentId: string;
  toAgentId: string;
  status: TeamRunHandoff['status'];
  summary: string;
  artifactIds: string[];
  createdAt: string;
}

export interface TeamRunReviewArtifact {
  id: string;
  kind: string;
  path: string | null;
  uri: string | null;
  title: string | null;
  source: 'shared-state' | 'step-input' | 'step-output' | 'handoff';
  stepId: string | null;
  handoffId: string | null;
}

export interface TeamRunReviewObservation {
  id: string;
  stepId: string | null;
  state: TeamRunReviewObservationState;
  source: TeamRunReviewObservationSource;
  observedAt: string;
  evidenceRef: string | null;
  confidence: 'low' | 'medium' | 'high';
}

export interface TeamRunReviewLedger {
  id: string;
  teamRunId: string;
  taskRunSpecId: string | null;
  runtimeRunId: string;
  status: TeamRunReviewLedgerStatus;
  createdAt: string;
  updatedAt: string;
  sequence: TeamRunReviewStep[];
  artifacts: TeamRunReviewArtifact[];
  handoffs: TeamRunReviewHandoff[];
  observations: TeamRunReviewObservation[];
}

export function createTeamRunReviewLedgerFromStoredRecord(
  record: ExecutionRunStoredRecord,
): TeamRunReviewLedger {
  return createTeamRunReviewLedgerFromBundle(record.bundle);
}

export async function reviewTeamRunLedger(
  input: ReviewTeamRunLedgerInput,
): Promise<TeamRunReviewLedgerPayload> {
  const control = input.control ?? createExecutionRuntimeControl();
  const taskRunSpecStore = input.taskRunSpecStore ?? createTaskRunSpecRecordStore();
  const taskRunSpecId = normalizeOptionalId(input.taskRunSpecId);
  const teamRunId = normalizeOptionalId(input.teamRunId);
  const runtimeRunId = normalizeOptionalId(input.runtimeRunId);
  const providedLookupCount = [taskRunSpecId, teamRunId, runtimeRunId].filter(Boolean).length;

  if (providedLookupCount === 0) {
    throw new TeamRunReviewLedgerError(
      'invalid-request',
      'Provide --task-run-spec-id, --team-run-id, or --runtime-run-id.',
    );
  }

  if (providedLookupCount > 1) {
    throw new TeamRunReviewLedgerError(
      'invalid-request',
      'Choose exactly one review lookup key: --task-run-spec-id, --team-run-id, or --runtime-run-id.',
    );
  }

  if (runtimeRunId) {
    const record = await control.readRun(runtimeRunId);
    if (!record) {
      throw new TeamRunReviewLedgerError('not-found', `Runtime run ${runtimeRunId} was not found.`);
    }
    if (record.bundle.run.sourceKind !== 'team-run') {
      throw new TeamRunReviewLedgerError('not-found', `Runtime run ${runtimeRunId} is not a team run.`);
    }
    return buildTeamRunReviewLedgerPayload({
      resolvedBy: 'runtime-run-id',
      queryId: runtimeRunId,
      matchingRuntimeRunIds: [runtimeRunId],
      record,
      taskRunSpecStore,
    });
  }

  if (teamRunId) {
    const runtimeRecords = (await control.listRuns({ sourceKind: 'team-run' }))
      .filter((record) => record.bundle.run.sourceId === teamRunId)
      .sort((left, right) => right.bundle.run.updatedAt.localeCompare(left.bundle.run.updatedAt));
    const record = runtimeRecords[0] ?? null;
    if (!record) {
      throw new TeamRunReviewLedgerError('not-found', `Team run ${teamRunId} was not found.`);
    }
    return buildTeamRunReviewLedgerPayload({
      resolvedBy: 'team-run-id',
      queryId: teamRunId,
      matchingRuntimeRunIds: runtimeRecords.slice(0, 10).map((entry) => entry.runId),
      record,
      taskRunSpecStore,
    });
  }

  const resolvedTaskRunSpecId = taskRunSpecId;
  if (!resolvedTaskRunSpecId) {
    throw new TeamRunReviewLedgerError(
      'invalid-request',
      'Provide --task-run-spec-id, --team-run-id, or --runtime-run-id.',
    );
  }
  const taskRunSpecSummary = await readStoredTaskRunSpecSummary(taskRunSpecStore, resolvedTaskRunSpecId);
  if (!taskRunSpecSummary) {
    throw new TeamRunReviewLedgerError('not-found', `Task run spec ${resolvedTaskRunSpecId} was not found.`);
  }
  const runtimeRecords = (await control.listRuns({ sourceKind: 'team-run' }))
    .filter((record) => record.bundle.run.taskRunSpecId === resolvedTaskRunSpecId)
    .sort((left, right) => right.bundle.run.updatedAt.localeCompare(left.bundle.run.updatedAt));
  const record = runtimeRecords[0] ?? null;
  if (!record) {
    throw new TeamRunReviewLedgerError(
      'not-found',
      `No runtime run was found for task run spec ${resolvedTaskRunSpecId}.`,
    );
  }

  return {
    resolvedBy: 'task-run-spec-id',
    queryId: resolvedTaskRunSpecId,
    matchingRuntimeRunCount: Math.min(runtimeRecords.length, 10),
    matchingRuntimeRunIds: runtimeRecords.slice(0, 10).map((entry) => entry.runId),
    taskRunSpecSummary,
    ledger: createTeamRunReviewLedgerFromStoredRecord(record),
  };
}

export function createTeamRunReviewLedgerFromBundle(
  bundle: ExecutionRunRecordBundle,
): TeamRunReviewLedger {
  const teamRunId = bundle.run.sourceKind === 'team-run'
    ? bundle.run.sourceId ?? bundle.run.id
    : bundle.run.sourceId ?? bundle.run.id;

  return {
    id: `${teamRunId}:review-ledger`,
    teamRunId,
    taskRunSpecId: bundle.run.taskRunSpecId ?? null,
    runtimeRunId: bundle.run.id,
    status: bundle.run.status,
    createdAt: bundle.run.createdAt,
    updatedAt: bundle.run.updatedAt,
    sequence: bundle.steps
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((step) => ({
        stepId: step.id,
        sourceStepId: step.sourceStepId ?? null,
        order: step.order,
        parentStepIds: [...step.dependsOnStepIds],
        agentId: step.agentId,
        runtimeProfileId: step.runtimeProfileId ?? null,
        browserProfileId: step.browserProfileId ?? null,
        service: step.service ?? null,
        serviceAccountId: readString(step.input.structuredData.serviceAccountId),
        providerConversationRef: readProviderConversationRef(step.service, step.output?.structuredData ?? null),
        inputSnapshot: {
          prompt: step.input.prompt ?? null,
          structuredContext: readInputStructuredContext(step.input.structuredData),
          artifactIds: step.input.artifacts.map((artifact) => artifact.id),
        },
        outputSnapshot: step.output
          ? {
              summary: step.output.summary ?? null,
              text: readStepOutputText(step.output.structuredData),
              structuredOutputs: step.output.structuredData,
              artifactIds: step.output.artifacts.map((artifact) => artifact.id),
            }
          : null,
        status: step.status,
        startedAt: step.startedAt ?? null,
        completedAt: step.completedAt ?? null,
        failure: step.failure
          ? {
              code: step.failure.code,
              message: step.failure.message,
              providerState: readString(step.failure.details?.providerState),
            }
          : null,
      })),
    artifacts: collectReviewArtifacts(bundle),
    handoffs: bundle.handoffs
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map((handoff) => ({
        id: handoff.id,
        fromStepId: handoff.fromStepId,
        toStepId: handoff.toStepId,
        fromAgentId: handoff.fromAgentId,
        toAgentId: handoff.toAgentId,
        status: handoff.status,
        summary: handoff.summary,
        artifactIds: handoff.artifacts.map((artifact) => artifact.id),
        createdAt: handoff.createdAt,
      })),
    observations: collectReviewObservations(bundle),
  };
}

function readProviderConversationRef(
  service: string | null,
  structuredData: Record<string, unknown> | null,
): TeamRunProviderConversationRef | null {
  if (!structuredData) {
    return null;
  }
  const browserRun = isRecord(structuredData.browserRun) ? structuredData.browserRun : null;
  if (!browserRun) {
    return null;
  }

  const conversationId = readString(browserRun.conversationId);
  const url = readString(browserRun.tabUrl) ?? readString(browserRun.url);
  const configuredUrl = readString(browserRun.configuredUrl) ?? readString(browserRun.targetUrl);
  const cachePath = readString(browserRun.cachePath) ?? readString(browserRun.conversationCachePath);
  const cachePathStatus = readCachePathStatus(browserRun.cachePathStatus, cachePath);
  const projectId = readString(browserRun.projectId);
  const runtimeProfileId = readString(browserRun.runtimeProfileId);
  const browserProfileId = readString(browserRun.browserProfileId);
  const agentId = readString(browserRun.agentId);
  const model = readString(browserRun.desiredModel) ?? readString(browserRun.model);

  if (!conversationId && !url && !configuredUrl && !cachePath && !projectId && !runtimeProfileId && !browserProfileId && !model) {
    return null;
  }

  return {
    service: readString(browserRun.service) ?? readString(browserRun.provider) ?? service ?? 'unknown',
    conversationId,
    cachePath,
    cachePathStatus,
    cachePathReason: readString(browserRun.cachePathReason),
    url,
    configuredUrl,
    projectId,
    runtimeProfileId,
    browserProfileId,
    agentId,
    model,
  };
}

async function buildTeamRunReviewLedgerPayload(input: {
  resolvedBy: 'task-run-spec-id' | 'team-run-id' | 'runtime-run-id';
  queryId: string;
  matchingRuntimeRunIds: string[];
  record: ExecutionRunStoredRecord;
  taskRunSpecStore: TaskRunSpecRecordStore;
}): Promise<TeamRunReviewLedgerPayload> {
  const taskRunSpecSummary = input.record.bundle.run.taskRunSpecId
    ? await readStoredTaskRunSpecSummary(input.taskRunSpecStore, input.record.bundle.run.taskRunSpecId)
    : null;
  return {
    resolvedBy: input.resolvedBy,
    queryId: input.queryId,
    matchingRuntimeRunCount: input.matchingRuntimeRunIds.length,
    matchingRuntimeRunIds: input.matchingRuntimeRunIds,
    taskRunSpecSummary,
    ledger: createTeamRunReviewLedgerFromStoredRecord(input.record),
  };
}

async function readStoredTaskRunSpecSummary(
  store: TaskRunSpecRecordStore,
  taskRunSpecId: string,
): Promise<TaskRunSpecInspectionSummary | null> {
  const record = await store.readRecord(taskRunSpecId);
  return record ? summarizeTaskRunSpecStoredRecord(record) : null;
}

function readInputStructuredContext(value: Record<string, unknown>): Record<string, unknown> | null {
  const structuredContext = value.taskOverrideStructuredContext ?? value.structuredContext;
  return isRecord(structuredContext) ? structuredContext : null;
}

function readStepOutputText(value: Record<string, unknown>): string | null {
  return readString(value.text) ?? readString(value.responseText) ?? readString(value.answerText) ?? null;
}

function collectReviewArtifacts(bundle: ExecutionRunRecordBundle): TeamRunReviewArtifact[] {
  const artifacts: TeamRunReviewArtifact[] = [];

  for (const artifact of bundle.sharedState.artifacts) {
    artifacts.push(mapArtifact(artifact, {
      source: 'shared-state',
      stepId: null,
      handoffId: null,
    }));
  }

  for (const step of bundle.steps) {
    for (const artifact of step.input.artifacts) {
      artifacts.push(mapArtifact(artifact, {
        source: 'step-input',
        stepId: step.id,
        handoffId: null,
      }));
    }
    for (const artifact of step.output?.artifacts ?? []) {
      artifacts.push(mapArtifact(artifact, {
        source: 'step-output',
        stepId: step.id,
        handoffId: null,
      }));
    }
  }

  for (const handoff of bundle.handoffs) {
    for (const artifact of handoff.artifacts) {
      artifacts.push(mapArtifact(artifact, {
        source: 'handoff',
        stepId: null,
        handoffId: handoff.id,
      }));
    }
  }

  return artifacts.sort((left, right) =>
    left.id.localeCompare(right.id) ||
    left.source.localeCompare(right.source) ||
    (left.stepId ?? '').localeCompare(right.stepId ?? '') ||
    (left.handoffId ?? '').localeCompare(right.handoffId ?? ''),
  );
}

function collectReviewObservations(bundle: ExecutionRunRecordBundle): TeamRunReviewObservation[] {
  return bundle.steps.flatMap((step) => {
    const storedObservations = readStoredPassiveObservations(step);
    const failure = step.failure;
    if (!failure) {
      return storedObservations;
    }

    const providerState = readString(failure.details?.providerState);
    const providerRef = readProviderConversationRef(step.service, step.output?.structuredData ?? null);
    const classified = classifyFailureObservation({
      code: failure.code,
      message: failure.message,
      providerState,
      hasProviderState: Boolean(providerState),
    });
    if (!classified) {
      return storedObservations;
    }

    return [
      ...storedObservations,
      {
      id: `${step.id}:observation:${classified.state}`,
      stepId: step.id,
      state: classified.state,
      source: classified.source,
      observedAt: step.completedAt ?? step.startedAt ?? bundle.run.updatedAt,
      evidenceRef: providerRef?.url ?? providerRef?.cachePath ?? `step:${step.id}:failure:${failure.code}`,
      confidence: classified.confidence,
      },
    ];
  }).sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt) ||
    (left.stepId ?? '').localeCompare(right.stepId ?? '') ||
    left.id.localeCompare(right.id),
  );
}

function classifyFailureObservation(input: {
  code: string;
  message: string;
  providerState: string | null;
  hasProviderState: boolean;
}): Pick<TeamRunReviewObservation, 'state' | 'source' | 'confidence'> | null {
  const haystack = `${input.code} ${input.message} ${input.providerState ?? ''}`.toLowerCase();
  const source: TeamRunReviewObservationSource = input.hasProviderState ? 'provider-adapter' : 'runtime';
  const confidence = input.hasProviderState ? 'high' : 'medium';

  if (
    haystack.includes('captcha') ||
    haystack.includes('recaptcha') ||
    haystack.includes('human-verification') ||
    haystack.includes('google.com/sorry')
  ) {
    return { state: 'captcha-or-human-verification', source, confidence };
  }

  if (
    haystack.includes('login-required') ||
    haystack.includes('login required') ||
    haystack.includes('sign in') ||
    haystack.includes('signin') ||
    haystack.includes('authentication required')
  ) {
    return { state: 'login-required', source, confidence };
  }

  if (input.code === 'human_escalation_required' || haystack.includes('awaiting-human')) {
    return { state: 'awaiting-human', source: 'runtime', confidence: 'high' };
  }

  if (input.code === 'provider_error' || input.providerState === 'provider-error') {
    return { state: 'provider-error', source, confidence };
  }

  return null;
}

function readStoredPassiveObservations(step: ExecutionRunRecordBundle['steps'][number]): TeamRunReviewObservation[] {
  const browserRun = isRecord(step.output?.structuredData?.browserRun)
    ? step.output?.structuredData?.browserRun
    : null;
  const passiveObservations = Array.isArray(browserRun?.passiveObservations)
    ? browserRun.passiveObservations
    : [];

  return passiveObservations.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }
    const state = readObservationState(entry.state);
    const source = readObservationSource(entry.source);
    const observedAt = readString(entry.observedAt) ?? step.completedAt ?? step.startedAt;
    const confidence = readObservationConfidence(entry.confidence);
    if (!state || !source || !observedAt || !confidence) {
      return [];
    }
    return [{
      id: `${step.id}:stored-observation:${index + 1}:${state}`,
      stepId: step.id,
      state,
      source,
      observedAt,
      evidenceRef: readString(entry.evidenceRef),
      confidence,
    }];
  });
}

function mapArtifact(
  artifact: TeamRunArtifactRef,
  source: Pick<TeamRunReviewArtifact, 'source' | 'stepId' | 'handoffId'>,
): TeamRunReviewArtifact {
  return {
    id: artifact.id,
    kind: artifact.kind,
    path: artifact.path ?? null,
    uri: artifact.uri ?? null,
    title: artifact.title ?? null,
    ...source,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readCachePathStatus(value: unknown, cachePath: string | null): TeamRunProviderConversationRef['cachePathStatus'] {
  if (value === 'available' || value === 'unavailable') {
    return value;
  }
  return cachePath ? 'available' : null;
}

function readObservationState(value: unknown): TeamRunReviewObservation['state'] | null {
  return value === 'thinking' ||
    value === 'response-incoming' ||
    value === 'response-complete' ||
    value === 'provider-error' ||
    value === 'login-required' ||
    value === 'captcha-or-human-verification' ||
    value === 'awaiting-human' ||
    value === 'unknown'
    ? value
    : null;
}

function readObservationSource(value: unknown): TeamRunReviewObservation['source'] | null {
  return value === 'runtime' || value === 'provider-adapter' || value === 'browser-service' || value === 'operator'
    ? value
    : null;
}

function readObservationConfidence(value: unknown): TeamRunReviewObservation['confidence'] | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
