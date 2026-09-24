import { describe, expect, test } from "vitest";
import { createBrowserOperationDispatcher } from "../../packages/browser-service/src/service/operationDispatcher.js";
import {
	createInMemoryBrowserTabLeaseRegistry,
	type TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";

const scope: TabLeaseScope = {
	runtimeProfileId: "default",
	managedBrowserProfile: "managed-chatgpt",
	service: "chatgpt",
	tenantKey: "tenant-a",
};

describe("tabLeaseRegistry (package)", () => {
	test("documents that the compatibility dispatcher still serializes distinct managed-profile targets", async () => {
		const dispatcher = createBrowserOperationDispatcher({ isOwnerAlive: () => true });
		const first = await dispatcher.acquire({
			managedProfileDir: "/tmp/aura/default/chatgpt",
			serviceTarget: "chatgpt",
			rawDevTools: { host: "127.0.0.1", port: 9222, targetId: "target-a" },
			kind: "browser-execution",
			operationClass: "exclusive-mutating",
			ownerPid: 100,
		});
		const second = await dispatcher.acquire({
			managedProfileDir: "/tmp/aura/default/chatgpt",
			serviceTarget: "chatgpt",
			rawDevTools: { host: "127.0.0.1", port: 9222, targetId: "target-b" },
			kind: "browser-execution",
			operationClass: "exclusive-mutating",
			ownerPid: 101,
		});

		expect(first.acquired).toBe(true);
		expect(second.acquired).toBe(false);
		if (first.acquired) await first.release();
	});

	test("allows distinct exact targets while rejecting duplicate target ownership", async () => {
		let sequence = 0;
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => `lease-${++sequence}`,
		});

		const conversationA = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "new-conversation", reservationId: "reservation-a" },
			operationId: "operation-a",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		const conversationB = await registry.reserve({
			scope,
			targetId: "target-b",
			workload: { kind: "new-conversation", reservationId: "reservation-b" },
			operationId: "operation-b",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		const crawler = await registry.reserve({
			scope,
			targetId: "target-c",
			workload: { kind: "live-follow", operationId: "follow-1" },
			operationId: "operation-c",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});

		expect(conversationA.ok).toBe(true);
		expect(conversationB.ok).toBe(true);
		expect(crawler.ok).toBe(true);
		expect((await registry.list()).map((lease) => lease.targetId)).toEqual([
			"target-a",
			"target-b",
			"target-c",
		]);

		const duplicateTarget = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "new-conversation", reservationId: "reservation-d" },
			operationId: "operation-d",
			now: "2026-09-24T12:00:01.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});

		expect(duplicateTarget.ok).toBe(false);
		if (!duplicateTarget.ok) {
			expect(duplicateTarget.conflict.kind).toBe("target-owned");
			if (duplicateTarget.conflict.kind === "target-owned") {
				expect(duplicateTarget.conflict.lease.targetId).toBe("target-a");
			}
		}
	});

	test("rejects duplicate workload ownership on a different target", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-a" });
		const first = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "conversation", conversationId: "conversation-a" },
			operationId: "operation-a",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		expect(first.ok).toBe(true);

		const duplicateWorkload = await registry.reserve({
			scope,
			targetId: "target-b",
			workload: { kind: "conversation", conversationId: "conversation-a" },
			operationId: "operation-b",
			now: "2026-09-24T12:00:01.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});

		expect(duplicateWorkload.ok).toBe(false);
		if (!duplicateWorkload.ok) {
			expect(duplicateWorkload.conflict.kind).toBe("workload-owned");
		}
	});
});
