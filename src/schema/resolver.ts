import { ConfigSchema, type OracleConfig } from './types.js';
import { CLI_MAPPING } from './cli-map.js';
import { loadUserConfig } from '../config.js';
import type { OptionValues } from 'commander';
import { resolveApiModel, inferModelFromLabel, normalizeBaseUrl } from '../cli/options.js';
import { resolveEngine } from '../cli/engine.js';

// Simple deep merge helper if needed
function deepSet(obj: any, path: string, value: any) {
  const keys = path.split('.');
  let current = obj;
  while (keys.length > 1) {
    const key = keys.shift()!;
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[0]] = value;
}

export async function resolveConfig(
  cliOptions: OptionValues,
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<OracleConfig> {
  // 1. Load User/System/Project Config
  const loaded = await loadUserConfig(cwd);
  const fileConfig = loaded.config;

  // 2. Map CLI Options to Config Structure
  const cliConfig: any = {};
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
  const merged = mergeRecursively(fileConfig, cliConfig);

  // 4. Resolve Model and Engine Business Logic
  const cliModelArg = cliConfig.model || fileConfig.model || 'gpt-5.2-pro';
  
  // Decide engine
  let engine = resolveEngine({
    engine: merged.engine,
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
    merged.apiBaseUrl ||
      (isClaude ? env.ANTHROPIC_BASE_URL : isGrok ? env.XAI_BASE_URL : env.OPENAI_BASE_URL),
  );

  // Update merged object with resolved values
  merged.model = inferredModel;
  merged.engine = engine;
  merged.apiBaseUrl = baseUrl;

  // 5. Validate and Default
  return ConfigSchema.parse(merged);
}

function mergeRecursively(target: any, source: any): any {
  if (typeof source !== 'object' || source === null) {
    return source;
  }
  if (typeof target !== 'object' || target === null) {
    return source;
  }
  
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Array) {
       result[key] = source[key];
    } else if (typeof source[key] === 'object' && source[key] !== null) {
      result[key] = mergeRecursively(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

