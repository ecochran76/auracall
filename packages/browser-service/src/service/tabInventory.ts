import type { BrowserTabLeaseRegistry, TabLeaseScope } from "./tabLeaseRegistry.js";

export const UNOWNED_TAB_WORKLOAD_PREFIX = "tab-deadline:";
export const UNOWNED_BROWSER_TAB_TTL_MS = 5 * 60_000;

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

export async function registerUnownedBrowserTabDeadlines(input: {
	registry: BrowserTabLeaseRegistry;
	scope: TabLeaseScope;
	targets: Array<{ targetId: string; url: string }>;
	now?: () => Date;
	ttlMs?: number;
}): Promise<number> {
	const now = (input.now ?? (() => new Date()))().toISOString();
	const ttlMs = input.ttlMs ?? UNOWNED_BROWSER_TAB_TTL_MS;
	const leases = await input.registry.list({ scope: {
		managedBrowserProfile: input.scope.managedBrowserProfile, service: input.scope.service,
	}, states: ["active", "idle", "retiring", "lost"] });
	const fenced = new Set(leases.map(lease => lease.targetId));
	let registered = 0;
	for (const target of input.targets) {
		if (!target.targetId.trim() || fenced.has(target.targetId)) continue;
		const operationId = UNOWNED_TAB_WORKLOAD_PREFIX + target.targetId;
		const reserved = await input.registry.reserve({
			scope: input.scope, targetId: target.targetId,
			workload: { kind: "ephemeral", operationId }, operationId,
			now, idleTtlMs: ttlMs, absoluteTtlMs: ttlMs, targetFingerprint: target.url,
		});
		if (!reserved.ok) {
			if (["target-owned", "workload-owned"].includes(reserved.conflict.kind)) continue;
			throw new Error(`Unowned tab deadline registration failed: ${reserved.conflict.kind}.`);
		}
		const idled = await input.registry.idle({ claim: reserved.value.claim, now, effectState: "settled" });
		if (!idled.ok) throw new Error(`Unowned tab deadline settlement failed: ${idled.conflict.kind}.`);
		fenced.add(target.targetId);
		registered++;
	}
	return registered;
}
