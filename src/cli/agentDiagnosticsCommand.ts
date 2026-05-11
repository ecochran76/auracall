import { readApiKeyDiagnosticsFromEnvFile } from '../config/apiKeyEnvDiagnostics.js';
import {
  createAgentTeamConfigService,
  type AgentConfigDiagnosticsResult,
} from '../config/agentConfigService.js';
import { createAgentRegistryStore, type AgentRegistryStore } from '../config/agentRegistryStore.js';

export interface AgentDiagnosticsCliOptions {
  configPath?: string;
  envPath?: string;
  registryStore?: AgentRegistryStore | null;
}

export interface AgentDiagnosticsCliReport extends AgentConfigDiagnosticsResult {
  envPath: string;
  envFileExists: boolean;
}

export async function buildAgentDiagnosticsCliReport(
  options: AgentDiagnosticsCliOptions = {},
): Promise<AgentDiagnosticsCliReport> {
  const env = await readApiKeyDiagnosticsFromEnvFile(options.envPath);
  const service = createAgentTeamConfigService({
    configPath: options.configPath,
    registryStore: options.registryStore === undefined ? createAgentRegistryStore() : options.registryStore,
  });
  const diagnostics = await service.diagnostics({ apiKeys: env.apiKeys });
  return {
    ...diagnostics,
    envPath: env.envPath,
    envFileExists: env.exists,
  };
}

export function resolveAgentDiagnosticsExitCode(
  report: AgentDiagnosticsCliReport,
  options: { strict?: boolean } = {},
): number {
  return options.strict && !report.ok ? 1 : 0;
}

export function formatAgentDiagnosticsCliReport(report: AgentDiagnosticsCliReport): string {
  const lines = [
    `Status: ${report.ok ? 'ok' : 'warnings'}`,
    `Config path: ${report.configPath}`,
    `Registry path: ${report.registryPath ?? '(none)'}`,
    `API env path: ${report.envPath} (${report.envFileExists ? 'present' : 'missing'})`,
    `Effective agents: ${report.metrics.effectiveAgents}`,
    `Effective teams: ${report.metrics.effectiveTeams}`,
    `API keys: ${report.metrics.apiKeys}`,
    `Warnings: ${report.metrics.warnings}`,
    `Disabled registry agents: ${formatList(report.disabledRegistryAgents)}`,
    `Disabled registry teams: ${formatList(report.disabledRegistryTeams)}`,
    `Config/registry conflicts: ${report.conflicts.length > 0 ? '' : '(none)'}`.trimEnd(),
  ];
  for (const conflict of report.conflicts) {
    lines.push(`  - ${conflict.kind} ${conflict.id}: ${conflict.resolution}`);
  }
  lines.push(`API key reachability: ${report.apiKeys.length > 0 ? '' : '(none)'}`.trimEnd());
  for (const key of report.apiKeys) {
    lines.push(
      `  - ${key.id}: ${key.scoped ? 'scoped' : 'unscoped'}; secret=${key.hasSecret ? 'present' : 'missing'}; effective agents=${formatList(key.effectiveAgents)}`,
    );
    if (key.agents.length > 0) lines.push(`    agent scopes: ${formatList(key.agents)}`);
    if (key.teams.length > 0) lines.push(`    team scopes: ${formatList(key.teams)}`);
    if (key.services.length > 0) lines.push(`    service scopes: ${formatList(key.services)}`);
    if (key.runtimeProfiles.length > 0) lines.push(`    runtime profile scopes: ${formatList(key.runtimeProfiles)}`);
    if (key.missingAgents.length > 0) lines.push(`    missing agents: ${formatList(key.missingAgents)}`);
    if (key.missingTeams.length > 0) lines.push(`    missing teams: ${formatList(key.missingTeams)}`);
    if (key.missingRuntimeProfiles.length > 0) {
      lines.push(`    missing runtime profiles: ${formatList(key.missingRuntimeProfiles)}`);
    }
  }
  lines.push(`Issues: ${report.issues.length > 0 ? '' : '(none)'}`.trimEnd());
  for (const issue of report.issues) {
    lines.push(`  - [${issue.severity}] ${issue.code}: ${issue.message}`);
  }
  return lines.join('\n');
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '(none)';
}
