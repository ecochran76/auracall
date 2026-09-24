import { isProcessAlive } from "../processCheck.js";
import type {
	BrowserTabLeaseRegistry,
	TabLeaseScope,
} from "./tabLeaseRegistry.js";

export interface StaleActiveTabLeaseReconciliationOutcome {
	leaseId: string;
	targetId: string;
	disposition: "lost" | "conflict";
	lostRevision?: number;
	detail?: string;
}

export async function reconcileStaleActiveTabLeases(input: {
	registry: BrowserTabLeaseRegistry;
	scope: TabLeaseScope;
	now?: () => Date;
	currentOwner: { processId: number; instanceId: string };
	isOwnerAlive?: (processId: number) => boolean;
}): Promise<StaleActiveTabLeaseReconciliationOutcome[]> {
	const now = input.now ?? (() => new Date());
	const ownerAlive = input.isOwnerAlive ?? isProcessAlive;
	const activeLeases = await input.registry.list({ scope: input.scope, states: ["active"] });
	const outcomes: StaleActiveTabLeaseReconciliationOutcome[] = [];

	for (const lease of activeLeases) {
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
		if (!legacyOwner && !replacedCurrentProcess && !deadOwner) continue;

		const lost = await input.registry.markLost({
			leaseId: lease.leaseId,
			expectedRevision: lease.revision,
			now: now().toISOString(),
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
	}

	return outcomes;
}
