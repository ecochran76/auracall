import fs from 'node:fs/promises';
import JSON5 from 'json5';
import {
  agentRegistrySnapshotSchema,
  createAgentTeamConfigService,
  type AgentRegistrySnapshot,
  type AgentRegistrySnapshotImportResult,
} from '../config/agentConfigService.js';
import { createAgentRegistryStore, type AgentRegistryStore } from '../config/agentRegistryStore.js';

export interface AgentSnapshotExportCliOptions {
  configPath?: string;
  outputPath?: string;
  agents?: string[];
  teams?: string[];
  all?: boolean;
  registryStore?: AgentRegistryStore | null;
  now?: Date;
}

export interface AgentSnapshotExportCliResult {
  snapshot: AgentRegistrySnapshot;
  outputPath: string | null;
}

export interface AgentSnapshotImportCliOptions {
  configPath?: string;
  inputPath: string;
  dryRun?: boolean;
  registryStore?: AgentRegistryStore | null;
}

export async function exportAgentSnapshotForCli(
  options: AgentSnapshotExportCliOptions = {},
): Promise<AgentSnapshotExportCliResult> {
  const agents = normalizeIdList(options.agents);
  const teams = normalizeIdList(options.teams);
  if (!options.all && agents.length === 0 && teams.length === 0) {
    throw new Error('Select at least one --agent or --team, or pass --all.');
  }
  const service = createAgentTeamConfigService({
    configPath: options.configPath,
    registryStore: options.registryStore === undefined ? createAgentRegistryStore() : options.registryStore,
  });
  const snapshot = await service.exportSnapshot({
    agents: options.all ? undefined : agents,
    teams: options.all ? undefined : teams,
    now: options.now,
  });
  if (options.outputPath) {
    await fs.writeFile(options.outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  }
  return {
    snapshot,
    outputPath: options.outputPath ?? null,
  };
}

export async function importAgentSnapshotForCli(
  options: AgentSnapshotImportCliOptions,
): Promise<AgentRegistrySnapshotImportResult> {
  const raw = await fs.readFile(options.inputPath, 'utf8');
  const snapshot = agentRegistrySnapshotSchema.parse(JSON5.parse(raw));
  const service = createAgentTeamConfigService({
    configPath: options.configPath,
    registryStore: options.registryStore === undefined ? createAgentRegistryStore() : options.registryStore,
  });
  return service.importSnapshot({
    snapshot,
    dryRun: options.dryRun,
  });
}

export function formatAgentSnapshotExportCliResult(result: AgentSnapshotExportCliResult): string {
  return [
    `Snapshot exported: ${result.snapshot.agents.length} agent(s), ${result.snapshot.teams.length} team(s).`,
    `Output: ${result.outputPath ?? 'stdout'}`,
  ].join('\n');
}

export function formatAgentSnapshotImportCliResult(result: AgentRegistrySnapshotImportResult): string {
  return [
    `Snapshot import: ${result.dryRun ? 'dry-run' : 'applied'}`,
    `Imported agents: ${formatList(result.importedAgents)}`,
    `Imported teams: ${formatList(result.importedTeams)}`,
    `Blocked agents: ${formatList(result.blockedAgents)}`,
    `Blocked teams: ${formatList(result.blockedTeams)}`,
    `Registry path: ${result.registryPath ?? '(none)'}`,
  ].join('\n');
}

function normalizeIdList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '(none)';
}
