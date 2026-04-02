import fs from 'node:fs';
import path from 'node:path';
import type { OracleConfig } from '../config/schema.js';
import { setBrowserProfile, setRuntimeProfile, setRuntimeProfileBrowserProfile } from '../config/model.js';
import { resolveEffectiveManagedProfileRoot } from '../browser/config.js';
import {
  discoverDefaultBrowserProfile,
  type DiscoveredBrowserProfile,
} from '../browser/service/profile.js';
import {
  detectChromiumBrowserFamily,
  isWslEnvironment,
  type ChromiumBrowserFamily,
} from '../../packages/browser-service/src/platformPaths.js';

export type BrowserWizardTarget = 'chatgpt' | 'gemini' | 'grok';
export type BrowserWizardRuntime = 'local' | 'wsl' | 'windows';

export interface BrowserWizardChoice {
  runtime: BrowserWizardRuntime;
  family: ChromiumBrowserFamily | null;
  discovery: DiscoveredBrowserProfile;
  managedProfileRoot: string;
  freshnessMtimeMs: number | null;
  freshnessPath: string | null;
}

export interface BrowserWizardConfigPatchInput {
  target: BrowserWizardTarget;
  profileName: string;
  setAsDefault: boolean;
  keepBrowser: boolean;
  choice: BrowserWizardChoice;
}

export type BrowserWizardConfigOverlay = Partial<OracleConfig> & Record<string, unknown>;

export function discoverBrowserWizardChoices(): BrowserWizardChoice[] {
  const choices: BrowserWizardChoice[] = [];

  if (isWslEnvironment()) {
    const wslProfile = discoverDefaultBrowserProfile({ preference: 'wsl' });
    if (wslProfile?.source === 'wsl') {
      choices.push(createBrowserWizardChoice('wsl', wslProfile));
    }

    const windowsProfile = discoverDefaultBrowserProfile({ preference: 'windows' });
    if (windowsProfile?.source === 'windows') {
      choices.push(createBrowserWizardChoice('windows', windowsProfile));
    }

    if (choices.length === 0) {
      const fallback = discoverDefaultBrowserProfile({ preference: 'auto' });
      if (fallback) {
        choices.push(
          createBrowserWizardChoice(
            fallback.source === 'windows' ? 'windows' : fallback.source === 'wsl' ? 'wsl' : 'local',
            fallback,
          ),
        );
      }
    }
  } else {
    const localProfile = discoverDefaultBrowserProfile({ preference: 'auto' });
    if (localProfile) {
      choices.push(createBrowserWizardChoice('local', localProfile));
    }
  }

  return dedupeBrowserWizardChoices(choices)
    .filter((choice) => Boolean(choice.discovery.chromePath))
    .sort(compareBrowserWizardChoices);
}

export function suggestBrowserWizardProfileName(choice: BrowserWizardChoice): string {
  const family = choice.family ?? 'chrome';
  if (family === 'chrome' && (choice.runtime === 'local' || choice.runtime === 'wsl')) {
    return 'default';
  }
  return `${choice.runtime}-${family}`;
}

export function validateBrowserWizardProfileName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'AuraCall runtime profile name is required.';
  }
  if (trimmed === '.' || trimmed === '..') {
    return 'AuraCall runtime profile name must not be "." or "..".';
  }
  if (/[\\/]/.test(trimmed)) {
    return 'AuraCall runtime profile name must not contain path separators.';
  }
  return null;
}

export function formatBrowserWizardChoiceLabel(choice: BrowserWizardChoice): string {
  const runtimeLabel =
    choice.runtime === 'windows'
      ? 'Windows'
      : choice.runtime === 'wsl'
        ? 'WSL'
        : 'Local';
  const familyLabel = titleCase(choice.family ?? 'browser');
  const chromePath = choice.discovery.chromePath ?? '(no browser path detected)';
  const cookiePath = choice.discovery.cookiePath ?? '(no cookie DB detected)';
  return `${runtimeLabel} ${familyLabel} — ${chromePath} [${choice.discovery.profileName}; ${cookiePath}]`;
}

export function pickPreferredBrowserWizardChoiceIndex(
  choices: BrowserWizardChoice[],
  options: {
    configuredChromePath?: string | null;
    wslChromePreference?: 'auto' | 'wsl' | 'windows' | null;
  } = {},
): number {
  if (choices.length === 0) {
    return -1;
  }

  const configuredChromePath = options.configuredChromePath?.trim().toLowerCase() ?? null;
  const ranked = choices
    .map((choice, index) => ({ choice, index }))
    .sort((left, right) =>
      compareBrowserWizardChoicePreference(left.choice, right.choice, {
        configuredChromePath,
        wslChromePreference: options.wslChromePreference ?? null,
      }),
    );
  return ranked[0]?.index ?? 0;
}

export function buildBrowserWizardConfigPatch(input: BrowserWizardConfigPatchInput): BrowserWizardConfigOverlay {
  const browserProfileName = input.profileName;
  const browserProfilePatch: Record<string, unknown> = {
    chromePath: input.choice.discovery.chromePath,
    chromeProfile: input.choice.discovery.profileName,
    chromeCookiePath: input.choice.discovery.cookiePath,
    bootstrapCookiePath: input.choice.discovery.cookiePath,
    managedProfileRoot: input.choice.managedProfileRoot,
    manualLogin: true,
    keepBrowser: input.keepBrowser,
  };

  if (input.choice.runtime === 'windows') {
    browserProfilePatch.wslChromePreference = 'windows';
    browserProfilePatch.debugPortStrategy = 'auto';
  } else if (input.choice.runtime === 'wsl') {
    browserProfilePatch.wslChromePreference = 'wsl';
  }

  const patch: BrowserWizardConfigOverlay = {
    version: 2,
    browserFamilies: {},
    profiles: {},
  };
  setBrowserProfile(patch as Record<string, unknown>, browserProfileName, browserProfilePatch);
  const runtimeProfilePatch: Record<string, unknown> = {
    engine: 'browser',
    defaultService: input.target,
    keepBrowser: input.keepBrowser,
    browser: {},
    services: {
      [input.target]: {
        model: defaultWizardModelForTarget(input.target),
        manualLogin: true,
      },
    },
  };
  setRuntimeProfileBrowserProfile(runtimeProfilePatch, browserProfileName);
  setRuntimeProfile(patch as Record<string, unknown>, input.profileName, runtimeProfilePatch);

  if (input.setAsDefault) {
    patch.auracallProfile = input.profileName;
  }

  return patch;
}

export function mergeWizardConfig<T extends BrowserWizardConfigOverlay>(
  base: T,
  patch: BrowserWizardConfigOverlay,
): T {
  return mergeRecords(base, patch) as T;
}

function createBrowserWizardChoice(
  runtime: BrowserWizardRuntime,
  discovery: DiscoveredBrowserProfile,
): BrowserWizardChoice {
  const family =
    detectChromiumBrowserFamily(discovery.chromePath) ??
    detectChromiumBrowserFamily(discovery.cookiePath) ??
    null;
  return {
    runtime,
    family,
    discovery,
    managedProfileRoot: resolveEffectiveManagedProfileRoot({
      configuredManagedProfileRoot: null,
      explicitProfileDir: null,
      resolvedChromePath: discovery.chromePath ?? null,
      sourceCookiePath: discovery.cookiePath ?? null,
    }),
    ...resolveBrowserWizardChoiceFreshness(discovery),
  };
}

function resolveBrowserWizardChoiceFreshness(
  discovery: DiscoveredBrowserProfile,
): Pick<BrowserWizardChoice, 'freshnessMtimeMs' | 'freshnessPath'> {
  let freshestPath: string | null = null;
  let freshestMtimeMs: number | null = null;

  for (const candidate of resolveBrowserWizardFreshnessCandidates(discovery)) {
    try {
      const stats = fs.statSync(candidate);
      if (freshestMtimeMs == null || stats.mtimeMs > freshestMtimeMs) {
        freshestMtimeMs = stats.mtimeMs;
        freshestPath = candidate;
      }
    } catch {
      // Ignore missing/unreadable candidates.
    }
  }

  return {
    freshnessMtimeMs: freshestMtimeMs,
    freshnessPath: freshestPath,
  };
}

function resolveBrowserWizardFreshnessCandidates(discovery: DiscoveredBrowserProfile): string[] {
  const candidates = [
    discovery.cookiePath,
    path.join(discovery.userDataDir, 'Local State'),
    path.join(discovery.userDataDir, discovery.profileName, 'Preferences'),
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(candidates));
}

function compareBrowserWizardChoices(left: BrowserWizardChoice, right: BrowserWizardChoice): number {
  return compareBrowserWizardChoicePreference(left, right, {
    configuredChromePath: null,
    wslChromePreference: null,
  });
}

function compareBrowserWizardChoicePreference(
  left: BrowserWizardChoice,
  right: BrowserWizardChoice,
  options: {
    configuredChromePath: string | null;
    wslChromePreference: 'auto' | 'wsl' | 'windows' | null;
  },
): number {
  const chromeFamilyDelta = browserWizardFamilyRank(left.family) - browserWizardFamilyRank(right.family);
  if (chromeFamilyDelta !== 0) {
    return chromeFamilyDelta;
  }

  const configuredPathDelta =
    browserWizardConfiguredPathRank(left, options.configuredChromePath) -
    browserWizardConfiguredPathRank(right, options.configuredChromePath);
  if (configuredPathDelta !== 0) {
    return configuredPathDelta;
  }

  const wslPreferenceDelta =
    browserWizardWslPreferenceRank(left, options.wslChromePreference) -
    browserWizardWslPreferenceRank(right, options.wslChromePreference);
  if (wslPreferenceDelta !== 0) {
    return wslPreferenceDelta;
  }

  const runtimeDelta = browserWizardRuntimeRank(left) - browserWizardRuntimeRank(right);
  if (runtimeDelta !== 0) {
    return runtimeDelta;
  }

  const freshnessDelta = compareDescendingNumbers(left.freshnessMtimeMs, right.freshnessMtimeMs);
  if (freshnessDelta !== 0) {
    return freshnessDelta;
  }

  return left.runtime.localeCompare(right.runtime) || (left.discovery.chromePath ?? '').localeCompare(right.discovery.chromePath ?? '');
}

function browserWizardFamilyRank(family: ChromiumBrowserFamily | null): number {
  return family === 'chrome' ? 0 : 1;
}

function browserWizardConfiguredPathRank(choice: BrowserWizardChoice, configuredChromePath: string | null): number {
  if (!configuredChromePath) {
    return 1;
  }
  return choice.discovery.chromePath?.trim().toLowerCase() === configuredChromePath ? 0 : 1;
}

function browserWizardWslPreferenceRank(
  choice: BrowserWizardChoice,
  preference: 'auto' | 'wsl' | 'windows' | null,
): number {
  if (!preference || preference === 'auto') {
    return 1;
  }
  return choice.runtime === preference ? 0 : 1;
}

function browserWizardRuntimeRank(choice: BrowserWizardChoice): number {
  switch (choice.runtime) {
    case 'wsl':
      return 0;
    case 'local':
      return 1;
    case 'windows':
      return 2;
    default:
      return 3;
  }
}

function compareDescendingNumbers(left: number | null, right: number | null): number {
  const leftValue = left ?? Number.NEGATIVE_INFINITY;
  const rightValue = right ?? Number.NEGATIVE_INFINITY;
  return rightValue - leftValue;
}

function dedupeBrowserWizardChoices(choices: BrowserWizardChoice[]): BrowserWizardChoice[] {
  const seen = new Set<string>();
  const deduped: BrowserWizardChoice[] = [];
  for (const choice of choices) {
    const key = [
      choice.runtime,
      choice.discovery.chromePath ?? '',
      choice.discovery.cookiePath ?? '',
      choice.discovery.profileName,
    ].join('::');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(choice);
  }
  return deduped;
}

function defaultWizardModelForTarget(target: BrowserWizardTarget): string {
  switch (target) {
    case 'gemini':
      return 'gemini-3-pro';
    case 'grok':
      return 'grok-4.1';
    case 'chatgpt':
    default:
      return 'gpt-5.2';
  }
}

function titleCase(value: string): string {
  if (!value) {
    return value;
  }
  return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mergeRecords(base: unknown, overlay: unknown): unknown {
  if (!isRecord(base) || !isRecord(overlay)) {
    return overlay;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = merged[key];
    if (Array.isArray(value)) {
      merged[key] = value;
    } else if (isRecord(existing) && isRecord(value)) {
      merged[key] = mergeRecords(existing, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}
