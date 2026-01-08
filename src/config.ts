import fs from 'node:fs/promises';
import path from 'node:path';
import JSON5 from 'json5';
import { getOracleHomeDir } from './oracleHome.js';
import type { BrowserModelStrategy } from './browser/types.js';
import type { ThinkingTimeLevel } from './oracle/types.js';

export type EnginePreference = 'api' | 'browser';

export interface NotifyConfig {
  enabled?: boolean;
  sound?: boolean;
  muteIn?: Array<'CI' | 'SSH'>;
}

export interface BrowserConfigDefaults {
  chromeProfile?: string | null;
  chromePath?: string | null;
  chromeCookiePath?: string | null;
  target?: 'chatgpt' | 'gemini' | 'grok';
  projectId?: string | null;
  projectName?: string | null;
  conversationId?: string | null;
  conversationName?: string | null;
  geminiUrl?: string | null;
  grokUrl?: string | null;
  chatgptUrl?: string | null;
  url?: string;
  list?: {
    includeHistory?: boolean;
    historyLimit?: number | null;
    historySince?: string | null;
    filter?: string | null;
    refresh?: boolean;
  };
  cache?: {
    refresh?: boolean;
    includeHistory?: boolean;
    historyLimit?: number | null;
    historySince?: string | null;
  };
  sessionOpen?: {
    openConversation?: boolean;
    printUrl?: boolean;
    browserPath?: string | null;
    browserProfile?: string | null;
  };
  timeoutMs?: number;
  debugPort?: number | null;
  inputTimeoutMs?: number;
  cookieSyncWaitMs?: number;
  headless?: boolean;
  hideWindow?: boolean;
  keepBrowser?: boolean;
  modelStrategy?: BrowserModelStrategy;
  /** Thinking time intensity (ChatGPT Thinking/Pro models): 'light', 'standard', 'extended', 'heavy' */
  thinkingTime?: ThinkingTimeLevel;
  /** Skip cookie sync and reuse a persistent automation profile (waits for manual ChatGPT login). */
  manualLogin?: boolean;
  /** Manual-login profile directory override (also available via ORACLE_BROWSER_PROFILE_DIR). */
  manualLoginProfileDir?: string | null;
}

export interface AzureConfig {
  endpoint?: string;
  deployment?: string;
  apiVersion?: string;
}

export interface RemoteServiceConfig {
  host?: string;
  token?: string;
}

export interface UserConfig {
  engine?: EnginePreference;
  model?: string;
  search?: 'on' | 'off';
  notify?: NotifyConfig;
  browser?: BrowserConfigDefaults;
  heartbeatSeconds?: number;
  filesReport?: boolean;
  background?: boolean;
  promptSuffix?: string;
  apiBaseUrl?: string;
  azure?: AzureConfig;
  sessionRetentionHours?: number;
  remote?: RemoteServiceConfig;
  remoteHost?: string;
  remoteToken?: string;
}

function resolveUserConfigPath(): string {
  return process.env.ORACLE_CONFIG_PATH ?? path.join(getOracleHomeDir(), 'config.json');
}

function resolveSystemConfigPath(): string | null {
  if (process.env.ORACLE_SYSTEM_CONFIG_PATH) {
    return process.env.ORACLE_SYSTEM_CONFIG_PATH;
  }
  if (process.platform === 'win32') {
    const programData = process.env.ProgramData;
    return programData ? path.join(programData, 'oracle', 'config.json') : null;
  }
  return '/etc/oracle/config.json';
}

function resolveProjectConfigPaths(cwd: string): string[] {
  const entries: string[] = [];
  let current = path.resolve(cwd);
  let prev = '';
  while (current !== prev) {
    entries.push(path.join(current, '.oracle', 'config.json'));
    entries.push(path.join(current, 'oracle.config.json'));
    prev = current;
    current = path.dirname(current);
  }
  return entries;
}

export interface LoadConfigResult {
  config: UserConfig;
  path: string;
  loaded: boolean;
  sources?: {
    system?: string | null;
    user?: string;
    project?: string[];
  };
}

export async function loadUserConfig(
  cwd: string = process.cwd(),
): Promise<LoadConfigResult> {
  const systemPath = resolveSystemConfigPath();
  const userPath = resolveUserConfigPath();
  const projectPaths = resolveProjectConfigPaths(cwd);
  const configs: Array<{ path: string; config: UserConfig }> = [];
  if (systemPath) {
    const systemConfig = await readConfigFile(systemPath);
    if (systemConfig) configs.push(systemConfig);
  }
  const userConfig = await readConfigFile(userPath);
  if (userConfig) configs.push(userConfig);
  const projectConfigs: Array<{ path: string; config: UserConfig }> = [];
  for (const projectPath of projectPaths) {
    const projectConfig = await readConfigFile(projectPath);
    if (projectConfig) projectConfigs.push(projectConfig);
  }
  projectConfigs.reverse();
  configs.push(...projectConfigs);
  const merged = configs.reduce<UserConfig>((acc, next) => mergeConfig(acc, next.config), {});
  const loaded = configs.length > 0;
  return {
    config: merged,
    path: userPath,
    loaded,
    sources: {
      system: systemPath,
      user: userPath,
      project: projectPaths,
    },
  };
}
export function configPath(): string {
  return resolveUserConfigPath();
}

async function readConfigFile(configPath: string): Promise<{ path: string; config: UserConfig } | null> {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON5.parse(raw) as UserConfig;
    return { path: configPath, config: parsed ?? {} };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') {
      return null;
    }
    console.warn(`Failed to read ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function mergeConfig(base: UserConfig, override: UserConfig): UserConfig {
  const merged: UserConfig = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const existing = (merged as Record<string, unknown>)[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      (merged as Record<string, unknown>)[key] = mergeConfig(
        existing as UserConfig,
        value as UserConfig,
      );
    } else {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
