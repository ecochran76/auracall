import { ConfigSchema, type OracleConfig } from './types.js';
import { CLI_MAPPING } from './cli-map.js';
import { loadUserConfig } from '../config.js';
import type { OptionValues } from 'commander';
import { set, merge } from 'lodash-es'; // or a simple deep merge helper if lodash is not available. 
// checking package.json for lodash or similar.

// Simple deep merge helper if needed, or use existing one in config.ts
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

export async function resolveConfig(cliOptions: OptionValues, cwd: string = process.cwd()): Promise<OracleConfig> {
  // 1. Load User/System/Project Config
  const loaded = await loadUserConfig(cwd);
  const fileConfig = loaded.config;

  // 2. Map CLI Options to Config Structure
  const cliConfig: any = {};
  for (const [flag, value] of Object.entries(cliOptions)) {
    if (value === undefined) continue;
    
    // Check if there is a direct mapping
    const mapPath = CLI_MAPPING[flag];
    if (mapPath) {
      deepSet(cliConfig, mapPath, value);
    } else {
      // Pass through unmapped top-level flags (e.g. prompt, model if not mapped)
      // Actually model is mapped.
      // What about flags that don't map to config directly? 
      // e.g. --chatgpt (shorthand).
      // We handle shorthands *before* this or inside the resolver.
    }
  }

  // Handle shorthands
  if (cliOptions.chatgpt) {
    deepSet(cliConfig, 'browser.target', 'chatgpt');
    if (!cliConfig.model) cliConfig.model = 'gpt-5.2'; // implied default?
    cliConfig.engine = 'browser';
  }
  if (cliOptions.gemini) {
    deepSet(cliConfig, 'browser.target', 'gemini');
    if (!cliConfig.model) cliConfig.model = 'gemini-3-pro';
    cliConfig.engine = 'browser';
  }

  // 3. Merge (CLI overrides File)
  // We can use the mergeConfig helper from src/config.ts if exported, or generic merge.
  // src/config.ts exports `mergeConfig`? No, it's internal.
  
  // Basic merge: File first, then CLI.
  // Note: structured merge needed for nested objects.
  
  // For now, let's assume a simple merge strategy or use `defu` / `deep-merge` if available.
  // I'll implement a basic one or verify imports.
  
  const merged = mergeRecursively(fileConfig, cliConfig);

  // 4. Validate and Default
  const parsed = ConfigSchema.parse(merged);
  return parsed;
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
       // Arrays: usually overwrite? or append? 
       // CLI usually overrides config arrays completely (e.g. file list).
       result[key] = source[key];
    } else if (typeof source[key] === 'object' && source[key] !== null) {
      result[key] = mergeRecursively(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
