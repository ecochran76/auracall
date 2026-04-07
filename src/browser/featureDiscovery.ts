import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import type { AuracallBrowserFeaturesContract, BrowserDoctorTarget } from './profileDoctor.js';

export interface BrowserFeaturesSnapshotWriteResult {
  snapshotDir: string;
  snapshotPath: string;
  latestPath: string;
}

export interface BrowserFeaturesDiffReport {
  target: BrowserDoctorTarget;
  baselinePath: string;
  currentGeneratedAt: string | null;
  baselineGeneratedAt: string | null;
  changed: boolean;
  summary: {
    addedModes: number;
    removedModes: number;
    changedToggles: number;
    addedMenuItems: number;
    removedMenuItems: number;
    addedUploadCandidates: number;
    removedUploadCandidates: number;
  };
  changes: {
    modes: {
      added: string[];
      removed: string[];
    };
    toggles: {
      added: Record<string, boolean>;
      removed: string[];
      changed: Array<{ key: string; before: boolean; after: boolean }>;
    };
    menuItems: {
      added: string[];
      removed: string[];
    };
    uploadCandidates: {
      added: string[];
      removed: string[];
    };
  };
}

interface ComparableBrowserFeatures {
  modes: string[];
  toggles: Record<string, boolean>;
  menuItems: string[];
  uploadCandidates: string[];
}

function sanitizeSnapshotToken(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toSortedUnique(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => sanitizeSnapshotToken(value))
        .filter((value) => value.length > 0),
    ),
  ).sort();
}

function extractComparableBrowserFeatures(
  contract: AuracallBrowserFeaturesContract | null | undefined,
): ComparableBrowserFeatures {
  const detected = (contract?.featureStatus?.detected ?? {}) as Record<string, unknown>;
  const runtimeUiList = contract?.runtime.browserTools?.report.uiList ?? null;
  const rawModes = Array.isArray(detected.modes) ? detected.modes : [];
  const rawToggles =
    detected.toggles && typeof detected.toggles === 'object' && !Array.isArray(detected.toggles)
      ? (detected.toggles as Record<string, unknown>)
      : {};
  return {
    modes: toSortedUnique(rawModes.map((entry) => (typeof entry === 'string' ? entry : null))),
    toggles: Object.fromEntries(
      Object.entries(rawToggles)
        .map(([key, value]) => [sanitizeSnapshotToken(key), Boolean(value)] as const)
        .filter(([key]) => key.length > 0)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    menuItems: toSortedUnique(
      runtimeUiList?.sections.menuItems.map((item) => item.text ?? item.ariaLabel ?? item.dataTestId ?? null) ?? [],
    ),
    uploadCandidates: toSortedUnique(
      runtimeUiList?.sections.uploadCandidates.map(
        (item) => item.ariaLabel ?? item.dataTestId ?? item.text ?? item.className ?? null,
      ) ?? [],
    ),
  };
}

function diffStringLists(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((entry) => !beforeSet.has(entry)),
    removed: before.filter((entry) => !afterSet.has(entry)),
  };
}

function diffToggleMaps(
  before: Record<string, boolean>,
  after: Record<string, boolean>,
): BrowserFeaturesDiffReport['changes']['toggles'] {
  const added: Record<string, boolean> = {};
  const removed: string[] = [];
  const changed: Array<{ key: string; before: boolean; after: boolean }> = [];
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  for (const key of keys) {
    const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
    if (!hasBefore && hasAfter) {
      added[key] = after[key]!;
      continue;
    }
    if (hasBefore && !hasAfter) {
      removed.push(key);
      continue;
    }
    if (before[key] !== after[key]) {
      changed.push({ key, before: before[key]!, after: after[key]! });
    }
  }
  return { added, removed, changed };
}

export function resolveBrowserFeaturesSnapshotDir(
  auracallProfile: string | null | undefined,
  target: BrowserDoctorTarget,
): string {
  const scopedProfile = sanitizeSnapshotToken(auracallProfile || 'default') || 'default';
  return path.join(getAuracallHomeDir(), 'feature-snapshots', scopedProfile, target);
}

export async function writeBrowserFeaturesSnapshot(
  contract: AuracallBrowserFeaturesContract,
  options: {
    auracallProfile?: string | null;
    label?: string | null;
  } = {},
): Promise<BrowserFeaturesSnapshotWriteResult> {
  const snapshotDir = resolveBrowserFeaturesSnapshotDir(options.auracallProfile, contract.target);
  await fs.mkdir(snapshotDir, { recursive: true });
  const stamp = (contract.generatedAt || new Date().toISOString()).replace(/[:.]/g, '-');
  const label = sanitizeSnapshotToken(options.label);
  const fileName = label ? `${stamp}--${label}.json` : `${stamp}.json`;
  const snapshotPath = path.join(snapshotDir, fileName);
  const latestPath = path.join(snapshotDir, 'latest.json');
  const serialized = `${JSON.stringify(contract, null, 2)}\n`;
  await fs.writeFile(snapshotPath, serialized, 'utf8');
  await fs.writeFile(latestPath, serialized, 'utf8');
  return { snapshotDir, snapshotPath, latestPath };
}

export async function readBrowserFeaturesSnapshot(
  snapshotPath: string,
): Promise<AuracallBrowserFeaturesContract> {
  const raw = await fs.readFile(snapshotPath, 'utf8');
  return JSON.parse(raw) as AuracallBrowserFeaturesContract;
}

export async function resolveBrowserFeaturesBaseline(
  target: BrowserDoctorTarget,
  options: {
    auracallProfile?: string | null;
    snapshotPath?: string | null;
  } = {},
): Promise<{ path: string; contract: AuracallBrowserFeaturesContract }> {
  const baselinePath = options.snapshotPath
    ? path.resolve(options.snapshotPath)
    : path.join(resolveBrowserFeaturesSnapshotDir(options.auracallProfile, target), 'latest.json');
  const contract = await readBrowserFeaturesSnapshot(baselinePath);
  return { path: baselinePath, contract };
}

export function diffBrowserFeaturesContracts(
  baseline: AuracallBrowserFeaturesContract,
  current: AuracallBrowserFeaturesContract,
  options: { baselinePath: string },
): BrowserFeaturesDiffReport {
  const before = extractComparableBrowserFeatures(baseline);
  const after = extractComparableBrowserFeatures(current);
  const modeChanges = diffStringLists(before.modes, after.modes);
  const toggleChanges = diffToggleMaps(before.toggles, after.toggles);
  const menuItemChanges = diffStringLists(before.menuItems, after.menuItems);
  const uploadChanges = diffStringLists(before.uploadCandidates, after.uploadCandidates);
  const changed =
    modeChanges.added.length > 0 ||
    modeChanges.removed.length > 0 ||
    Object.keys(toggleChanges.added).length > 0 ||
    toggleChanges.removed.length > 0 ||
    toggleChanges.changed.length > 0 ||
    menuItemChanges.added.length > 0 ||
    menuItemChanges.removed.length > 0 ||
    uploadChanges.added.length > 0 ||
    uploadChanges.removed.length > 0;
  return {
    target: current.target,
    baselinePath: options.baselinePath,
    currentGeneratedAt: current.generatedAt ?? null,
    baselineGeneratedAt: baseline.generatedAt ?? null,
    changed,
    summary: {
      addedModes: modeChanges.added.length,
      removedModes: modeChanges.removed.length,
      changedToggles:
        Object.keys(toggleChanges.added).length + toggleChanges.removed.length + toggleChanges.changed.length,
      addedMenuItems: menuItemChanges.added.length,
      removedMenuItems: menuItemChanges.removed.length,
      addedUploadCandidates: uploadChanges.added.length,
      removedUploadCandidates: uploadChanges.removed.length,
    },
    changes: {
      modes: modeChanges,
      toggles: toggleChanges,
      menuItems: menuItemChanges,
      uploadCandidates: uploadChanges,
    },
  };
}
