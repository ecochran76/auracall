import type { BrowserTabLease, BrowserTabLeaseRegistry, TabLeaseScope } from "./tabLeaseRegistry.js";

export const UNOWNED_TAB_WORKLOAD_PREFIX = "tab-deadline:";
/** Legacy census observation is not evidence of workload ownership. */
export function isUnownedBrowserTabLease(lease: BrowserTabLease): boolean {
	return lease.workload.kind === "ephemeral" && lease.workload.operationId.startsWith(UNOWNED_TAB_WORKLOAD_PREFIX);
}

/** Caller must positively prove this exact managed browser is absent first. */
export async function releaseAbsentBrowserTabLeases(input: {
	registry: BrowserTabLeaseRegistry;
	scope: Pick<TabLeaseScope, "managedBrowserProfile" | "service">;
	now: string;
}): Promise<void> {
	const leases = await input.registry.list({scope:input.scope,states:["idle","lost"]});
	for (const lease of leases) {
		if (lease.effectState === "in-flight" || lease.effectState === "outcome-unknown") continue;
		const lost = lease.state === "lost" ? {ok:true as const,value:lease} : await input.registry.markLost({leaseId:lease.leaseId,expectedRevision:lease.revision,now:input.now,reason:"target-missing"});
		if (!lost.ok) throw new Error(`Absent browser tab fencing failed: ${lost.conflict.kind}.`);
		const released = await input.registry.releaseLost({leaseId:lost.value.leaseId,expectedRevision:lost.value.revision,now:input.now,disposition:"already-missing"});
		if (!released.ok) throw new Error(`Absent browser tab release failed: ${released.conflict.kind}.`);
	}
}
