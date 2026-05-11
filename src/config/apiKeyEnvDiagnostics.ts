import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import type { AgentConfigApiKeyDiagnosticInput } from './agentConfigService.js';

export interface ApiKeyEnvDiagnosticsReadResult {
  envPath: string;
  exists: boolean;
  apiKeys: AgentConfigApiKeyDiagnosticInput[];
}

export async function readApiKeyDiagnosticsFromEnvFile(
  envPath = path.join(getAuracallHomeDir(), 'api.env'),
): Promise<ApiKeyEnvDiagnosticsReadResult> {
  const resolvedEnvPath = path.resolve(envPath);
  const values = await readEnvValues(resolvedEnvPath);
  return {
    envPath: resolvedEnvPath,
    exists: values !== null,
    apiKeys: readApiKeyDiagnosticsFromEnvValues(values ?? {}),
  };
}

export function readApiKeyDiagnosticsFromEnvValues(values: Record<string, string>): AgentConfigApiKeyDiagnosticInput[] {
  const keys: AgentConfigApiKeyDiagnosticInput[] = [];
  if (values.AURACALL_API_KEY || values.AURACALL_API_KEY_ID) {
    keys.push({
      id: values.AURACALL_API_KEY_ID?.trim() || 'env',
      hasSecret: Boolean(values.AURACALL_API_KEY),
      agents: readDelimitedValueList(values.AURACALL_API_KEY_AGENTS),
      teams: readDelimitedValueList(values.AURACALL_API_KEY_TEAMS),
      services: readDelimitedValueList(values.AURACALL_API_KEY_SERVICES),
      runtimeProfiles: readDelimitedValueList(values.AURACALL_API_KEY_RUNTIME_PROFILES),
    });
  }

  for (const rawId of readDelimitedValueList(values.AURACALL_API_KEY_IDS) ?? []) {
    const suffix = toApiAuthEnvSuffix(rawId);
    keys.push({
      id: values[`AURACALL_API_KEY_${suffix}_ID`]?.trim() || rawId,
      hasSecret: Boolean(values[`AURACALL_API_KEY_${suffix}`]),
      agents: readDelimitedValueList(values[`AURACALL_API_KEY_${suffix}_AGENTS`]),
      teams: readDelimitedValueList(values[`AURACALL_API_KEY_${suffix}_TEAMS`]),
      services: readDelimitedValueList(values[`AURACALL_API_KEY_${suffix}_SERVICES`]),
      runtimeProfiles: readDelimitedValueList(values[`AURACALL_API_KEY_${suffix}_RUNTIME_PROFILES`]),
    });
  }

  return keys;
}

async function readEnvValues(envPath: string): Promise<Record<string, string> | null> {
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    const values: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (!match) continue;
      values[match[1]] = match[2];
    }
    return values;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function readDelimitedValueList(value: string | undefined): string[] | undefined {
  const items = (value ?? '').split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function toApiAuthEnvSuffix(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'AGENT';
}
