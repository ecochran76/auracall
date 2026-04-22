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
  lines.push(`  - Active lease id: ${payload.runtime.queueProjection.activeLeaseId ?? '(none)'}`);
  lines.push(`  - Active lease owner: ${payload.runtime.queueProjection.activeLeaseOwnerId ?? '(none)'}`);
  lines.push(`  - Affinity status: ${payload.runtime.queueProjection.affinity.status}`);
  lines.push(`  - Affinity reason: ${payload.runtime.queueProjection.affinity.reason ?? '(none)'}`);
  lines.push(`  - Required service: ${payload.runtime.queueProjection.affinity.requiredService ?? '(none)'}`);
  lines.push(
    `  - Required runtime profile: ${payload.runtime.queueProjection.affinity.requiredRuntimeProfileId ?? '(none)'}`,
  );
  lines.push(
    `  - Required browser profile: ${payload.runtime.queueProjection.affinity.requiredBrowserProfileId ?? '(none)'}`,
  );
  lines.push(`  - Required host: ${payload.runtime.queueProjection.affinity.requiredHostId ?? '(none)'}`);
  lines.push(`  - Host requirement: ${payload.runtime.queueProjection.affinity.hostRequirement}`);
  lines.push(
    `  - Required service account: ${payload.runtime.queueProjection.affinity.requiredServiceAccountId ?? '(none)'}`,
  );
  lines.push(`  - Browser required: ${payload.runtime.queueProjection.affinity.browserRequired ? 'yes' : 'no'}`);
  lines.push(`  - Eligibility note: ${payload.runtime.queueProjection.affinity.eligibilityNote ?? '(none)'}`);

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

  if (payload.serviceState) {
    lines.push('- Service-state probe:');
    lines.push(`  - Probe status: ${payload.serviceState.probeStatus}`);
    lines.push(`  - Service: ${payload.serviceState.service ?? '(none)'}`);
    lines.push(`  - Owner step: ${payload.serviceState.ownerStepId ?? '(none)'}`);
    lines.push(`  - State: ${payload.serviceState.state ?? '(none)'}`);
    lines.push(`  - Source: ${payload.serviceState.source ?? '(none)'}`);
    lines.push(`  - Observed at: ${payload.serviceState.observedAt ?? '(none)'}`);
    lines.push(`  - Confidence: ${payload.serviceState.confidence ?? '(none)'}`);
    lines.push(`  - Evidence ref: ${payload.serviceState.evidenceRef ?? '(none)'}`);
    lines.push(`  - Reason: ${payload.serviceState.reason ?? '(none)'}`);
  }

  if (payload.schedulerAuthority) {
    lines.push('- Scheduler authority:');
    lines.push(`  - Decision: ${payload.schedulerAuthority.decision}`);
    lines.push(`  - Reason: ${payload.schedulerAuthority.reason}`);
    lines.push(`  - Mutation allowed: ${payload.schedulerAuthority.mutationAllowed ? 'yes' : 'no'}`);
    lines.push(`  - Selected runner: ${payload.schedulerAuthority.selectedRunnerId ?? '(none)'}`);
    lines.push(`  - Local runner: ${payload.schedulerAuthority.localRunnerId ?? '(none)'}`);
    lines.push(`  - Future mutation: ${payload.schedulerAuthority.futureMutation}`);
    lines.push(`  - Candidate count: ${payload.schedulerAuthority.candidates.length}`);
    if (payload.schedulerAuthority.activeLease) {
      lines.push(`  - Active lease id: ${payload.schedulerAuthority.activeLease.leaseId}`);
      lines.push(`  - Active lease owner: ${payload.schedulerAuthority.activeLease.ownerId}`);
      lines.push(`  - Active lease owner status: ${payload.schedulerAuthority.activeLease.ownerStatus}`);
      lines.push(`  - Active lease owner freshness: ${payload.schedulerAuthority.activeLease.ownerFreshness}`);
      lines.push(`  - Active lease expires: ${payload.schedulerAuthority.activeLease.expiresAt}`);
    }
  }

  return lines.join('\n');
}
