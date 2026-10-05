import { isProcessAlive } from "../processCheck.js";
import { isTabLeaseTtlExempt } from "./tabLeaseRegistry.js";
import type { BrowserTabLeaseRegistry, TabLeaseScope } from "./tabLeaseRegistry.js";

export interface StaleTabLeaseReconciliationOutcome {
	leaseId: string;
	targetId: string;
	disposition: "lost" | "conflict";
	lostRevision?: number;
	detail?: string;
}

export async function reconcileStaleTabLeases(input: {
	registry: BrowserTabLeaseRegistry;
	scope: TabLeaseScope;
	now?: () => Date;
	currentOwner: { processId: number; instanceId: string };
	isOwnerAlive?: (processId: number) => boolean;
}): Promise<StaleTabLeaseReconciliationOutcome[]> {
	const now = input.now ?? (() => new Date());
	const nowIso = now().toISOString();
	const nowMs = Date.parse(nowIso);
	const ownerAlive = input.isOwnerAlive ?? isProcessAlive;
	const leases = await input.registry.list({ scope: input.scope, states: ["active", "idle"] });
	const outcomes: StaleTabLeaseReconciliationOutcome[] = [];

	for (const lease of leases) {
		if (lease.state === "idle") {
			if (
				!lease.processBinding ||
				ownerAlive(lease.processBinding.processId) ||
				(lease.effectState !== "none" && lease.effectState !== "settled")
			)
				continue;
			const lost = await input.registry.markLost({
				leaseId: lease.leaseId,
				expectedRevision: lease.revision,
				now: nowIso,
				reason: "restart-unverified",
			});
			outcomes.push(
				lost.ok
					? {
							leaseId: lease.leaseId,
							targetId: lease.targetId,
							disposition: "lost",
							lostRevision: lost.value.revision,
						}
					: {
							leaseId: lease.leaseId,
							targetId: lease.targetId,
							disposition: "conflict",
							detail: lost.conflict.kind,
						},
			);
			continue;
		}
		const ownerProcessId = lease.ownerProcessId;
		const ownerInstanceId = lease.ownerInstanceId;
		const legacyOwner =
			typeof ownerProcessId !== "number" ||
			!Number.isInteger(ownerProcessId) ||
			ownerProcessId <= 0 ||
			typeof ownerInstanceId !== "string" ||
			ownerInstanceId.length === 0;
		const replacedCurrentProcess =
			ownerProcessId === input.currentOwner.processId &&
			ownerInstanceId !== input.currentOwner.instanceId;
		const deadOwner = !legacyOwner && !ownerAlive(ownerProcessId);
		const heartbeatExpired =
			nowMs >= Date.parse(lease.idleExpiresAt) ||
			(!isTabLeaseTtlExempt(lease) && nowMs >= Date.parse(lease.absoluteExpiresAt));
		if (!legacyOwner && !replacedCurrentProcess && !deadOwner && !heartbeatExpired) continue;

		const lost = await input.registry.markLost({
			leaseId: lease.leaseId,
			expectedRevision: lease.revision,
			now: nowIso,
			reason:
				legacyOwner || replacedCurrentProcess || deadOwner
					? "restart-unverified"
					: "heartbeat-expired",
		});
		outcomes.push(
			lost.ok
				? {
						leaseId: lease.leaseId,
						targetId: lease.targetId,
						disposition: "lost",
						lostRevision: lost.value.revision,
					}
				: {
						leaseId: lease.leaseId,
						targetId: lease.targetId,
						disposition: "conflict",
						detail: lost.conflict.kind,
					},
		);
	}

	return outcomes;
}
