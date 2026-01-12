import { ComposedConfigSchema, type OracleConfig, type ResolvedUserConfig } from '../config/schema.js';
import { CLI_MAPPING } from './cli-map.js';
import { loadUserConfig } from '../config.js';
import type { OptionValues } from 'commander';
import { resolveApiModel, inferModelFromLabel, normalizeBaseUrl } from '../cli/options.js';
import { resolveEngine, type EngineMode } from '../cli/engine.js';
import { normalizeConfigV1toV2 } from '../config/migrate.js';
import { applyBrowserProfileOverrides } from '../browser/service/profileConfig.js';

type MutableBrowserConfig = Record<string, unknown>;
type MutableConfig = Record<string, unknown> & {
  browser?: MutableBrowserConfig;
  dev?: { browserPortRange?: [number, number] };
  engine?: string;
  search?: unknown;
  oracleProfile?: string;
  oracleProfiles?: Record<string, unknown>;
  model?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Simple deep merge helper if needed
function deepSet(obj: MutableConfig, path: string, value: unknown) {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  while (keys.length > 1) {
    const key = keys.shift();
    if (!key) {
      return;
    }
    if (!isRecord(current[key])) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const leaf = keys[0];
  if (!leaf) {
    return;
  }
  current[leaf] = value;
}

export async function resolveConfig(
  cliOptions: OptionValues,
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  options: { aliasRules?: import('../config/migrate.js').ConfigAliasRule[] } = {},
): Promise<ResolvedUserConfig> {
  // 1. Load User/System/Project Config
  const loaded = await loadUserConfig(cwd);
  const fileConfig = loaded.config;

  // 2. Map CLI Options to Config Structure
  const cliConfig: MutableConfig = {};
  for (const [flag, value] of Object.entries(cliOptions)) {
    if (value === undefined) continue;
    const mapPath = CLI_MAPPING[flag];
    if (mapPath) {
      deepSet(cliConfig, mapPath, value);
    }
  }

  // Handle shorthands
  if (cliOptions.chatgpt) {
    deepSet(cliConfig, 'browser.target', 'chatgpt');
    if (!cliConfig.model) cliConfig.model = 'gpt-5.2';
    cliConfig.engine = 'browser';
  }
  if (cliOptions.gemini) {
    deepSet(cliConfig, 'browser.target', 'gemini');
    if (!cliConfig.model) cliConfig.model = 'gemini-3-pro';
    cliConfig.engine = 'browser';
  }

  // 3. Merge (CLI overrides File)
  const merged = mergeRecursively(fileConfig as MutableConfig, cliConfig);
  const normalized = normalizeConfigV1toV2(merged as OracleConfig, {
    aliasRules: options.aliasRules,
  }) as MutableConfig;
  applyOracleProfile(normalized);

  // 4. Resolve Model and Engine Business Logic
  const cliModelArg = cliConfig.model || normalized.model || 'gpt-5.2-pro';
  
  // Decide engine
  let engine = resolveEngine({
    engine: (typeof normalized.engine === 'string' ? (normalized.engine as EngineMode) : undefined),
    browserFlag: cliOptions.browser,
    env,
  });

  const inferredModel = (engine === 'browser') ? inferModelFromLabel(cliModelArg) : resolveApiModel(cliModelArg);
  
  // Engine coercion
  const isClaude = inferredModel.startsWith('claude');
  const isCodex = inferredModel.startsWith('gpt-5.1-codex');
  const isGrok = inferredModel.startsWith('grok');
  const multiModelProvided = Array.isArray(cliOptions.models) && cliOptions.models.length > 0;

  if ((isClaude || isCodex || multiModelProvided) && engine === 'browser') {
    engine = 'api';
  }

  // Resolve Base URL
  const baseUrl = normalizeBaseUrl(
    asNonEmptyString(normalized.apiBaseUrl) ??
      (isClaude ? env.ANTHROPIC_BASE_URL : isGrok ? env.XAI_BASE_URL : env.OPENAI_BASE_URL),
  );

  // Update merged object with resolved values
  normalized.model = inferredModel;
  normalized.engine = engine;
  normalized.apiBaseUrl = baseUrl;

  // 5. Validate and Default
  return ComposedConfigSchema.parse(normalized);
}

function mergeRecursively(target: MutableConfig, source: MutableConfig): MutableConfig {
  if (!isRecord(source)) {
    return source as MutableConfig;
  }
  if (!isRecord(target)) {
    return source;
  }
  
  const result: MutableConfig = { ...target };
  for (const key of Object.keys(source)) {
    if (Array.isArray(source[key])) {
       result[key] = source[key];
    } else if (isRecord(source[key])) {
      result[key] = mergeRecursively(
        (isRecord(target[key]) ? (target[key] as MutableConfig) : ({} as MutableConfig)),
        source[key] as MutableConfig,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function applyOracleProfile(merged: MutableConfig): void {
  const profiles = merged.oracleProfiles ?? null;
  if (!profiles || typeof profiles !== 'object') {
    return;
  }
  const profileName = resolveActiveProfileName(merged);
  if (!profileName || !profiles[profileName]) {
    return;
  }
  merged.oracleProfile = profileName;
  const profile = profiles[profileName];
  if (!isRecord(profile)) {
    return;
  }

  if (merged.engine === undefined && profile.engine !== undefined) {
    merged.engine = profile.engine as string;
  }
  if (merged.search === undefined && profile.search !== undefined) {
    merged.search = profile.search;
  }

  merged.browser = merged.browser ?? {};
  const browser = merged.browser;
  applyBrowserProfileOverrides(merged, profile, browser);
}

function resolveActiveProfileName(merged: MutableConfig): string | null {
  const profiles = merged.oracleProfiles ?? null;
  if (!profiles || typeof profiles !== 'object') return null;
  const explicit = typeof merged.oracleProfile === 'string' ? merged.oracleProfile.trim() : '';
  if (explicit && profiles[explicit]) return explicit;
  if (profiles.default) return 'default';
  const keys = Object.keys(profiles);
  return keys.length ? keys[0] : null;
}
