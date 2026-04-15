import {
  inspectRuntimeRun,
  type InspectRuntimeRunInput,
  type RuntimeRunInspectionPayload,
} from '../runtime/inspection.js';

export async function inspectConfiguredRuntimeRun(input: InspectRuntimeRunInput): Promise<RuntimeRunInspectionPayload> {
  return inspectRuntimeRun(input);
}

export function formatRuntimeRunInspectionPayload(payload: RuntimeRunInspectionPayload): string {
  const lines: string[] = [
    'AuraCall runtime inspection',
    `- Resolved by: ${payload.resolvedBy}`,
    `- Query: ${payload.queryId}`,
    `- Query run id: ${payload.queryRunId}`,
    `- Matching runtime runs: ${payload.matchingRuntimeRunCount}`,
    `- Runtime run: ${payload.runtime.runId}`,
    `- Source: ${payload.runtime.sourceKind}`,
    `- Status: ${payload.runtime.runStatus}`,
    `- Updated: ${payload.runtime.updatedAt}`,
    `- Team run id: ${payload.runtime.teamRunId ?? '(none)'}`,
    `- Task run spec id: ${payload.runtime.taskRunSpecId ?? '(none)'}`,
  ];

  if (payload.matchingRuntimeRunIds.length > 1) {
    lines.push(`- Matching runtime run ids: ${payload.matchingRuntimeRunIds.join(', ')}`);
  }

  if (payload.taskRunSpecSummary) {
    lines.push(
      `- Task run spec summary: ${payload.taskRunSpecSummary.title ?? payload.taskRunSpecSummary.objective ?? payload.taskRunSpecSummary.id}`,
    );
  }

  lines.push('- Queue projection:');
  lines.push(`  - Queue state: ${payload.runtime.queueProjection.queueState}`);
  lines.push(`  - Claim state: ${payload.runtime.queueProjection.claimState}`);
  lines.push(`  - Next runnable step: ${payload.runtime.queueProjection.nextRunnableStepId ?? '(none)'}`);
  lines.push(`  - Active lease owner: ${payload.runtime.queueProjection.activeLeaseOwnerId ?? '(none)'}`);
  lines.push(`  - Affinity status: ${payload.runtime.queueProjection.affinity.status}`);
  lines.push(`  - Affinity reason: ${payload.runtime.queueProjection.affinity.reason ?? '(none)'}`);

  if (payload.runner) {
    lines.push('- Evaluated runner:');
    lines.push(`  - Selected by: ${payload.runner.selectedBy}`);
    lines.push(`  - Runner id: ${payload.runner.runnerId}`);
    lines.push(`  - Host id: ${payload.runner.hostId}`);
    lines.push(`  - Status: ${payload.runner.status}`);
    lines.push(`  - Last heartbeat: ${payload.runner.lastHeartbeatAt}`);
    lines.push(`  - Last activity: ${payload.runner.lastActivityAt ?? '(none)'}`);
    lines.push(`  - Last claimed run: ${payload.runner.lastClaimedRunId ?? '(none)'}`);
  }

  return lines.join('\n');
}
