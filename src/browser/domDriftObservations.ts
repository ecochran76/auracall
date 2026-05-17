import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getRuntimeDir } from '../runtime/store.js';
import { upsertServiceUiLabelSetAlias, type UpsertServiceUiLabelSetAliasResult } from '../services/registry.js';

const OBSERVATION_FILENAME = 'dom-drift-observations.jsonl';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export type DomDriftObservationStatus = 'observed' | 'accepted' | 'rejected';

export interface DomDriftObservationInput {
  service: string;
  surface: string;
  action: string;
  expectedLabels: readonly string[];
  observedLabel?: string | null;
  fallbackKind: string;
  rootSelector?: string | null;
  url?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown>;
  observedAt?: string;
}

export interface DomDriftObservation extends DomDriftObservationInput {
  object: 'auracall_dom_drift_observation';
  id: string;
  observationKey: string;
  status: DomDriftObservationStatus;
  expectedLabels: string[];
  observedLabel: string | null;
  rootSelector: string | null;
  url: string | null;
  title: string | null;
  metadata: Record<string, unknown>;
  observedAt: string;
}

export interface ListDomDriftObservationOptions {
  service?: string | null;
  surface?: string | null;
  status?: DomDriftObservationStatus | null;
  limit?: number | null;
}

export interface DomDriftObservationList {
  object: 'auracall_dom_drift_observation_list';
  data: DomDriftObservation[];
  count: number;
  storagePath: string;
}

export interface AcceptDomDriftObservationResult {
  object: 'auracall_dom_drift_observation_acceptance';
  observation: DomDriftObservation;
  manifestUpdate: UpsertServiceUiLabelSetAliasResult;
}

export function getDomDriftObservationsPath(): string {
  return path.join(getRuntimeDir(), OBSERVATION_FILENAME);
}

export async function recordDomDriftObservation(input: DomDriftObservationInput): Promise<DomDriftObservation> {
  const observation = createDomDriftObservation(input);
  const storagePath = getDomDriftObservationsPath();
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.appendFile(storagePath, `${JSON.stringify(observation)}\n`, 'utf8');
  return observation;
}

export async function listDomDriftObservations(
  options: ListDomDriftObservationOptions = {},
): Promise<DomDriftObservationList> {
  const storagePath = getDomDriftObservationsPath();
  const limit = clampLimit(options.limit);
  let raw = '';
  try {
    raw = await fs.readFile(storagePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        object: 'auracall_dom_drift_observation_list',
        data: [],
        count: 0,
        storagePath,
      };
    }
    throw error;
  }

  const service = normalizeFilter(options.service);
  const surface = normalizeFilter(options.surface);
  const status = options.status ?? null;
  const observations = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseDomDriftObservationLine)
    .filter((entry): entry is DomDriftObservation => entry !== null)
    .filter((entry) => {
      if (service && normalizeFilter(entry.service) !== service) return false;
      if (surface && normalizeFilter(entry.surface) !== surface) return false;
      if (status && entry.status !== status) return false;
      return true;
    })
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
    .slice(0, limit);

  return {
    object: 'auracall_dom_drift_observation_list',
    data: observations,
    count: observations.length,
    storagePath,
  };
}

export async function acceptDomDriftObservation(id: string): Promise<AcceptDomDriftObservationResult | null> {
  const observations = await readAllDomDriftObservations();
  const target = observations.find((entry) => entry.id === id);
  if (!target) return null;
  const labelSetKey = resolveObservationUiLabelSetKey(target);
  if (!labelSetKey) {
    throw new Error(
      `DOM drift observation ${id} cannot be promoted automatically because no manifest label-set mapping exists for ${target.service}/${target.surface}/${target.action}.`,
    );
  }
  if (!target.observedLabel) {
    throw new Error(`DOM drift observation ${id} has no observed label to promote.`);
  }
  const manifestUpdate = await upsertServiceUiLabelSetAlias({
    service: target.service,
    key: labelSetKey,
    label: target.observedLabel,
  });
  const accepted: DomDriftObservation = {
    ...target,
    status: 'accepted',
    metadata: {
      ...target.metadata,
      acceptedAt: new Date().toISOString(),
      acceptedLabelSetKey: labelSetKey,
      acceptedOverridePath: manifestUpdate.storagePath,
    },
  };
  await rewriteDomDriftObservations(
    observations.map((entry) => entry.id === id ? accepted : entry),
  );
  return {
    object: 'auracall_dom_drift_observation_acceptance',
    observation: accepted,
    manifestUpdate,
  };
}

function createDomDriftObservation(input: DomDriftObservationInput): DomDriftObservation {
  const expectedLabels = input.expectedLabels.map((label) => normalizeLabel(label)).filter(Boolean);
  const observedLabel = normalizeLabel(input.observedLabel ?? '');
  const service = normalizeLabel(input.service);
  const surface = normalizeLabel(input.surface);
  const action = normalizeLabel(input.action);
  const fallbackKind = normalizeLabel(input.fallbackKind);
  const observationKey = createObservationKey({
    service,
    surface,
    action,
    expectedLabels,
    observedLabel,
    fallbackKind,
  });
  return {
    object: 'auracall_dom_drift_observation',
    id: `domdrift-${randomUUID()}`,
    observationKey,
    status: 'observed',
    service,
    surface,
    action,
    expectedLabels,
    observedLabel: observedLabel || null,
    fallbackKind,
    rootSelector: normalizeNullable(input.rootSelector),
    url: sanitizeObservationUrl(input.url),
    title: normalizeNullable(input.title),
    metadata: input.metadata ?? {},
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}

function parseDomDriftObservationLine(line: string): DomDriftObservation | null {
  try {
    const value = JSON.parse(line) as Partial<DomDriftObservation>;
    if (value.object !== 'auracall_dom_drift_observation') return null;
    if (!value.id || !value.service || !value.surface || !value.action || !value.observedAt) return null;
    return {
      object: 'auracall_dom_drift_observation',
      id: String(value.id),
      observationKey: String(value.observationKey || ''),
      status: isDomDriftObservationStatus(value.status) ? value.status : 'observed',
      service: String(value.service),
      surface: String(value.surface),
      action: String(value.action),
      expectedLabels: Array.isArray(value.expectedLabels)
        ? value.expectedLabels.map((label) => String(label)).filter(Boolean)
        : [],
      observedLabel: typeof value.observedLabel === 'string' && value.observedLabel ? value.observedLabel : null,
      fallbackKind: typeof value.fallbackKind === 'string' ? value.fallbackKind : 'unknown',
      rootSelector: typeof value.rootSelector === 'string' && value.rootSelector ? value.rootSelector : null,
      url: typeof value.url === 'string' && value.url ? value.url : null,
      title: typeof value.title === 'string' && value.title ? value.title : null,
      metadata: isRecord(value.metadata) ? value.metadata : {},
      observedAt: String(value.observedAt),
    };
  } catch {
    return null;
  }
}

async function readAllDomDriftObservations(): Promise<DomDriftObservation[]> {
  const storagePath = getDomDriftObservationsPath();
  try {
    const raw = await fs.readFile(storagePath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseDomDriftObservationLine)
      .filter((entry): entry is DomDriftObservation => entry !== null);
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

async function rewriteDomDriftObservations(observations: readonly DomDriftObservation[]): Promise<void> {
  const storagePath = getDomDriftObservationsPath();
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  const body = observations.map((entry) => JSON.stringify(entry)).join('\n');
  await fs.writeFile(storagePath, body ? `${body}\n` : '', 'utf8');
}

function resolveObservationUiLabelSetKey(observation: DomDriftObservation): string | null {
  if (
    observation.service === 'chatgpt' &&
    observation.surface === 'project-create-dialog' &&
    observation.action === 'confirm-create-project'
  ) {
    return 'project_create_confirm_buttons';
  }
  return null;
}

function createObservationKey(input: {
  service: string;
  surface: string;
  action: string;
  expectedLabels: readonly string[];
  observedLabel: string;
  fallbackKind: string;
}): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(input));
  return hash.digest('hex').slice(0, 16);
}

function sanitizeObservationUrl(value: string | null | undefined): string | null {
  const normalized = normalizeNullable(value);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return normalized;
  }
}

function normalizeLabel(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = normalizeLabel(value);
  return normalized || null;
}

function normalizeFilter(value: string | null | undefined): string | null {
  const normalized = normalizeNullable(value);
  return normalized ? normalized.toLowerCase() : null;
}

function clampLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(0, Math.min(MAX_LIMIT, Math.trunc(value)));
}

function isDomDriftObservationStatus(value: unknown): value is DomDriftObservationStatus {
  return value === 'observed' || value === 'accepted' || value === 'rejected';
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
