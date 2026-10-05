import { describe, expect, test } from "vitest";

import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { reconcileStaleTabLeases } from "../../packages/browser-service/src/service/tabLeaseRestartReconciliation.js";

const scope = {
	runtimeProfileId: "runtime-1",
	managedBrowserProfile: "/managed/runtime-1/chatgpt",
	service: "chatgpt",
	tenantKey: "account-1",
};

describe("tab lease restart reconciliation", () => {
	test("a stopped idle process loses follow retention but a living process keeps it", async () => {
		for (const alive of [false, true]) {
			const registry = createInMemoryBrowserTabLeaseRegistry({
				ownerIdentity: { processId: 41, instanceId: "follow" },
			});
			const reserved = await registry.reserve({
				scope,
				targetId: "follow",
				workload: { kind: "live-follow", operationId: "follow" },
				operationId: "follow",
				now: "2026-10-05T12:00:00Z",
				idleTtlMs: 1000,
				absoluteTtlMs: 2000,
				processBound: true,
			});
			if (!reserved.ok) throw new Error("fixture failed");
			await registry.idle({
				claim: reserved.value.claim,
				now: "2026-10-05T12:00:00Z",
				effectState: "settled",
			});
			await reconcileStaleTabLeases({
				registry,
				scope,
				currentOwner: { processId: 99, instanceId: "maintenance" },
				isOwnerAlive: () => alive,
				now: () => new Date("2026-10-05T12:00:03Z"),
			});
			expect((await registry.list())[0]).toMatchObject({
				state: alive ? "idle" : "lost",
				retention: alive ? "live-follow" : "ttl",
			});
		}
	});
	test("active follow heartbeat survives its old absolute TTL", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			ownerIdentity: { processId: 99, instanceId: "current" },
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "follow",
			workload: { kind: "live-follow", operationId: "follow" },
			operationId: "follow",
			now: "2026-10-05T12:00:00Z",
			idleTtlMs: 1000,
			absoluteTtlMs: 2000,
			processBound: true,
		});
		if (!reserved.ok) throw new Error("fixture failed");
		await registry.recordMeaningfulUse({
			claim: reserved.value.claim,
			now: "2026-10-05T12:00:03Z",
			idleTtlMs: 1000,
		});
		await reconcileStaleTabLeases({
			registry,
			scope,
			currentOwner: { processId: 99, instanceId: "current" },
			isOwnerAlive: () => true,
			now: () => new Date("2026-10-05T12:00:03Z"),
		});
		expect((await registry.list())[0].state).toBe("active");
	});
	test("marks an active lease from a dead owner process restart-unverified", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
			ownerIdentity: { processId: 41, instanceId: "previous" },
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		expect(reserved.ok).toBe(true);
		if (!reserved.ok) throw new Error("expected reservation");
		await expect(
			reconcileStaleTabLeases({
				registry,
				scope,
				currentOwner: { processId: 99, instanceId: "current" },
				isOwnerAlive: () => false,
				now: () => new Date("2026-09-24T12:01:00.000Z"),
			}),
		).resolves.toEqual([expect.objectContaining({ leaseId: "lease-1", disposition: "lost" })]);
		expect((await registry.list())[0]).toMatchObject({
			state: "lost",
			lossReason: "restart-unverified",
			ownerOperationId: null,
			ownerProcessId: null,
			ownerInstanceId: null,
		});
	});

	test("preserves an active lease whose owner process is still live", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
			ownerIdentity: { processId: 99, instanceId: "current" },
		});
		await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "live-follow", operationId: "follow-1" },
			operationId: "follow-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});

		await expect(
			reconcileStaleTabLeases({
				registry,
				scope,
				currentOwner: { processId: 99, instanceId: "current" },
				isOwnerAlive: () => true,
				now: () => new Date("2026-09-24T12:00:30.000Z"),
			}),
		).resolves.toEqual([]);
		expect((await registry.list())[0]?.state).toBe("active");
	});

	test("marks an active lease lost when its heartbeat TTL expires even if the owner process is live", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
			ownerIdentity: { processId: 99, instanceId: "current" },
		});
		await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "live-follow", operationId: "follow-1" },
			operationId: "follow-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});

		await expect(
			reconcileStaleTabLeases({
				registry,
				scope,
				currentOwner: { processId: 99, instanceId: "current" },
				isOwnerAlive: () => true,
				now: () => new Date("2026-09-24T12:01:00.000Z"),
			}),
		).resolves.toEqual([expect.objectContaining({ leaseId: "lease-1", disposition: "lost" })]);
		expect((await registry.list())[0]).toMatchObject({
			state: "lost",
			lossReason: "heartbeat-expired",
		});
	});
});
