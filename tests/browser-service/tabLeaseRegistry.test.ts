import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createBrowserOperationDispatcher } from "../../packages/browser-service/src/service/operationDispatcher.js";
import {
	createFileBackedBrowserTabLeaseRegistry,
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

	test("atomically rebinds a reservation to its provider conversation", async () => {
		let sequence = 0;
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => `lease-${++sequence}`,
		});
		const first = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "new-conversation", reservationId: "reservation-a" },
			operationId: "operation-a",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		const second = await registry.reserve({
			scope,
			targetId: "target-b",
			workload: { kind: "new-conversation", reservationId: "reservation-b" },
			operationId: "operation-b",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!first.ok || !second.ok) throw new Error("expected both reservations");

		const bound = await registry.bindConversation({
			claim: first.value.claim,
			conversationId: "conversation-a",
			targetFingerprint: "chatgpt:/c/conversation-a",
			now: "2026-09-24T12:00:01.000Z",
		});
		expect(bound.ok).toBe(true);
		if (!bound.ok) return;
		expect(bound.value.lease).toMatchObject({
			leaseId: first.value.lease.leaseId,
			revision: 2,
			targetId: "target-a",
			workload: { kind: "conversation", conversationId: "conversation-a" },
			targetFingerprint: "chatgpt:/c/conversation-a",
			absoluteExpiresAt: first.value.lease.absoluteExpiresAt,
		});

		const collision = await registry.bindConversation({
			claim: second.value.claim,
			conversationId: "conversation-a",
			targetFingerprint: "chatgpt:/c/conversation-a",
			now: "2026-09-24T12:00:02.000Z",
		});
		expect(collision.ok).toBe(false);
		if (!collision.ok) expect(collision.conflict.kind).toBe("workload-owned");
		expect(
			await registry.findByWorkload(scope, {
				kind: "new-conversation",
				reservationId: "reservation-b",
			}),
		).toMatchObject({ targetId: "target-b", revision: 1 });
	});

	test("extends idle lifetime only for meaningful use and never past absolute expiry", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-a" });
		const reserved = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "conversation", conversationId: "conversation-a" },
			operationId: "operation-a",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 100_000,
		});
		if (!reserved.ok) throw new Error("expected reservation");

		const passiveRead = await registry.list();
		expect(passiveRead[0]?.idleExpiresAt).toBe("2026-09-24T12:01:00.000Z");
		const touched = await registry.recordMeaningfulUse({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:50.000Z",
			idleTtlMs: 60_000,
		});

		expect(touched.ok).toBe(true);
		if (!touched.ok) return;
		expect(touched.value.lease).toMatchObject({
			revision: 2,
			heartbeatAt: "2026-09-24T12:00:50.000Z",
			lastMeaningfulUseAt: "2026-09-24T12:00:50.000Z",
			idleExpiresAt: "2026-09-24T12:01:40.000Z",
			absoluteExpiresAt: "2026-09-24T12:01:40.000Z",
		});
		expect((await registry.list())[0]?.idleExpiresAt).toBe("2026-09-24T12:01:40.000Z");
	});

	test("idles and reacquires only the exact workload with fenced claims", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-a" });
		const reserved = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "conversation", conversationId: "conversation-a" },
			operationId: "operation-a",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("expected reservation");

		const idled = await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:10.000Z",
			effectState: "settled",
		});
		expect(idled).toMatchObject({
			ok: true,
			value: { state: "idle", revision: 2, ownerOperationId: null },
		});

		const staleUse = await registry.recordMeaningfulUse({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:11.000Z",
			idleTtlMs: 60_000,
		});
		expect(staleUse).toMatchObject({ ok: false, conflict: { kind: "stale-claim" } });

		const missing = await registry.acquire({
			scope,
			workload: { kind: "conversation", conversationId: "conversation-b" },
			operationId: "operation-b",
			now: "2026-09-24T12:00:12.000Z",
		});
		expect(missing).toEqual({ ok: false, conflict: { kind: "not-found" } });

		const reacquired = await registry.acquire({
			scope,
			workload: { kind: "conversation", conversationId: "conversation-a" },
			operationId: "operation-b",
			now: "2026-09-24T12:00:12.000Z",
		});
		expect(reacquired).toMatchObject({
			ok: true,
			value: {
				lease: { state: "active", revision: 3, ownerOperationId: "operation-b" },
				claim: { revision: 3, operationId: "operation-b" },
			},
		});
	});

	test("retires only the exact expired idle target through a fenced close handshake", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-a" });
		const reserved = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "conversation", conversationId: "conversation-a" },
			operationId: "operation-a",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 10_000,
			absoluteTtlMs: 60_000,
		});
		if (!reserved.ok) throw new Error("expected reservation");
		const idled = await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		if (!idled.ok) throw new Error("expected idle lease");

		const tooEarly = await registry.beginRetirement({
			leaseId: idled.value.leaseId,
			expectedRevision: idled.value.revision,
			now: "2026-09-24T12:00:09.000Z",
			reason: "idle-expired",
		});
		expect(tooEarly).toMatchObject({ ok: false, conflict: { kind: "invalid-transition" } });

		const retiring = await registry.beginRetirement({
			leaseId: idled.value.leaseId,
			expectedRevision: idled.value.revision,
			now: "2026-09-24T12:00:11.000Z",
			reason: "idle-expired",
		});
		expect(retiring).toMatchObject({
			ok: true,
			value: { lease: { state: "retiring", revision: 3 }, retirementRevision: 3 },
		});
		if (!retiring.ok) return;

		const released = await registry.finishRetirement({
			leaseId: idled.value.leaseId,
			retirementRevision: retiring.value.retirementRevision,
			now: "2026-09-24T12:00:12.000Z",
			disposition: "closed",
		});
		expect(released).toMatchObject({
			ok: true,
			value: {
				state: "released",
				revision: 4,
				retirementReason: "idle-expired",
				finalDisposition: "closed",
			},
		});
		expect(
			await registry.findByWorkload(scope, {
				kind: "conversation",
				conversationId: "conversation-a",
			}),
		).toBeNull();
	});

	test("never reacquires an outcome-unknown idle lease", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-a" });
		const reserved = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "ephemeral", operationId: "utility-a" },
			operationId: "operation-a",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("expected reservation");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "outcome-unknown",
		});

		const reacquired = await registry.acquire({
			scope,
			workload: { kind: "ephemeral", operationId: "utility-a" },
			operationId: "operation-b",
			now: "2026-09-24T12:00:02.000Z",
		});

		expect(reacquired).toMatchObject({
			ok: false,
			conflict: { kind: "invalid-transition", lease: { effectState: "outcome-unknown" } },
		});
	});

	test("keeps missing or restart-unverified targets fenced as lost evidence", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-a" });
		const reserved = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "conversation", conversationId: "conversation-a" },
			operationId: "operation-a",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("expected reservation");

		const lost = await registry.markLost({
			leaseId: reserved.value.lease.leaseId,
			expectedRevision: reserved.value.lease.revision,
			now: "2026-09-24T12:00:05.000Z",
			reason: "restart-unverified",
		});
		expect(lost).toMatchObject({
			ok: true,
			value: {
				state: "lost",
				revision: 2,
				ownerOperationId: null,
				lossReason: "restart-unverified",
			},
		});

		const reacquire = await registry.acquire({
			scope,
			workload: { kind: "conversation", conversationId: "conversation-a" },
			operationId: "operation-b",
			now: "2026-09-24T12:00:06.000Z",
		});
		expect(reacquire).toMatchObject({ ok: false, conflict: { kind: "invalid-transition" } });

		const duplicateTarget = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "conversation", conversationId: "conversation-b" },
			operationId: "operation-b",
			now: "2026-09-24T12:00:06.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		expect(duplicateTarget).toMatchObject({ ok: false, conflict: { kind: "target-owned" } });
		expect(await registry.listFencedTargetIds(scope)).toEqual(["target-a"]);
	});

	test("persists uniqueness atomically across file-backed registry instances", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-tab-leases-"));
		try {
			let sequence = 0;
			const options = {
				registryRoot: directory,
				createLeaseId: () => `lease-${++sequence}`,
			};
			const firstRegistry = createFileBackedBrowserTabLeaseRegistry(options);
			const secondRegistry = createFileBackedBrowserTabLeaseRegistry(options);
			const first = await firstRegistry.reserve({
				scope,
				targetId: "target-a",
				workload: { kind: "conversation", conversationId: "conversation-a" },
				operationId: "operation-a",
				now: "2026-09-24T12:00:00.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
			});
			expect(first.ok).toBe(true);

			const duplicate = await secondRegistry.reserve({
				scope,
				targetId: "target-a",
				workload: { kind: "conversation", conversationId: "conversation-b" },
				operationId: "operation-b",
				now: "2026-09-24T12:00:01.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
			});
			expect(duplicate).toMatchObject({ ok: false, conflict: { kind: "target-owned" } });

			const second = await secondRegistry.reserve({
				scope,
				targetId: "target-b",
				workload: { kind: "conversation", conversationId: "conversation-b" },
				operationId: "operation-b",
				now: "2026-09-24T12:00:01.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
			});
			expect(second.ok).toBe(true);

			const concurrent = await Promise.all([
				firstRegistry.reserve({
					scope,
					targetId: "target-c",
					workload: { kind: "conversation", conversationId: "conversation-c" },
					operationId: "operation-c",
					now: "2026-09-24T12:00:02.000Z",
					idleTtlMs: 60_000,
					absoluteTtlMs: 3_600_000,
				}),
				secondRegistry.reserve({
					scope,
					targetId: "target-c",
					workload: { kind: "conversation", conversationId: "conversation-d" },
					operationId: "operation-d",
					now: "2026-09-24T12:00:02.000Z",
					idleTtlMs: 60_000,
					absoluteTtlMs: 3_600_000,
				}),
			]);
			expect(concurrent.filter((result) => result.ok)).toHaveLength(1);
			expect(concurrent.filter((result) => !result.ok)).toHaveLength(1);

			const controlScope = { ...scope, service: "grok" };
			const profileControl = await firstRegistry.acquireProfileControl({
				scope: controlScope,
				kind: "browser-startup",
				operationId: "control-operation",
				now: "2026-09-24T12:00:03.000Z",
				ttlMs: 30_000,
			});
			expect(profileControl.acquired).toBe(true);
			if (!profileControl.acquired) throw new Error("expected profile control");
			expect(
				await secondRegistry.reserve({
					scope: controlScope,
					targetId: "target-grok",
					workload: { kind: "conversation", conversationId: "conversation-grok" },
					operationId: "operation-grok",
					now: "2026-09-24T12:00:04.000Z",
					idleTtlMs: 60_000,
					absoluteTtlMs: 3_600_000,
				}),
			).toMatchObject({ ok: false, conflict: { kind: "profile-controlled" } });
			expect(
				await secondRegistry.releaseProfileControl({
					claim: profileControl.claim,
					releasedAt: "2026-09-24T12:00:05.000Z",
				}),
			).toBe(true);

			const restartedRegistry = createFileBackedBrowserTabLeaseRegistry(options);
			expect((await restartedRegistry.list()).map((lease) => lease.targetId)).toEqual([
				"target-a",
				"target-b",
				"target-c",
			]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("atomically excludes profile control and exact-tab ownership in both directions", async () => {
		let sequence = 0;
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => `lease-${++sequence}`,
			createControlId: () => `control-${sequence}`,
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "conversation", conversationId: "conversation-a" },
			operationId: "operation-a",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("expected tab lease");

		const blockedControl = await registry.acquireProfileControl({
			scope,
			kind: "browser-startup",
			operationId: "control-operation",
			now: "2026-09-24T12:00:01.000Z",
			ttlMs: 30_000,
		});
		expect(blockedControl).toMatchObject({
			acquired: false,
			reason: "tab-leases-active",
			blockingTargetIds: ["target-a"],
		});

		const idled = await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:02.000Z",
			effectState: "settled",
		});
		if (!idled.ok) throw new Error("expected idle lease");
		const retiring = await registry.beginRetirement({
			leaseId: idled.value.leaseId,
			expectedRevision: idled.value.revision,
			now: "2026-09-24T12:00:03.000Z",
			reason: "cancelled",
		});
		if (!retiring.ok) throw new Error("expected retiring lease");
		await registry.finishRetirement({
			leaseId: idled.value.leaseId,
			retirementRevision: retiring.value.retirementRevision,
			now: "2026-09-24T12:00:04.000Z",
			disposition: "closed",
		});

		const control = await registry.acquireProfileControl({
			scope,
			kind: "browser-startup",
			operationId: "control-operation",
			now: "2026-09-24T12:00:05.000Z",
			ttlMs: 30_000,
		});
		expect(control.acquired).toBe(true);
		if (!control.acquired) return;

		const blockedTab = await registry.reserve({
			scope,
			targetId: "target-b",
			workload: { kind: "conversation", conversationId: "conversation-b" },
			operationId: "operation-b",
			now: "2026-09-24T12:00:06.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		expect(blockedTab).toMatchObject({ ok: false, conflict: { kind: "profile-controlled" } });

		await registry.releaseProfileControl({
			claim: control.claim,
			releasedAt: "2026-09-24T12:00:06.500Z",
		});
		expect(
			(
				await registry.reserve({
					scope,
					targetId: "target-b",
					workload: { kind: "conversation", conversationId: "conversation-b" },
					operationId: "operation-b",
					now: "2026-09-24T12:00:07.000Z",
					idleTtlMs: 60_000,
					absoluteTtlMs: 3_600_000,
				})
			).ok,
		).toBe(true);
	});

	test("attributes target actions and retirement close counts to the exact fenced lease", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-a" });
		const reserved = await registry.reserve({
			scope,
			targetId: "target-a",
			workload: { kind: "conversation", conversationId: "conversation-a" },
			operationId: "operation-a",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("expected lease");
		let claim = reserved.value.claim;
		for (const [action, occurredAt] of [
			["target-created", "2026-09-24T12:00:01.000Z"],
			["navigation", "2026-09-24T12:00:02.000Z"],
			["reload", "2026-09-24T12:00:03.000Z"],
			["focus", "2026-09-24T12:00:04.000Z"],
		] as const) {
			const recorded = await registry.recordTargetAction({
				claim,
				action,
				occurredAt,
				idleTtlMs: 60_000,
			});
			if (!recorded.ok) throw new Error(`expected ${action} record`);
			claim = recorded.value.claim;
		}
		const idled = await registry.idle({
			claim,
			now: "2026-09-24T12:00:05.000Z",
			effectState: "settled",
		});
		if (!idled.ok) throw new Error("expected idle lease");
		const retiring = await registry.beginRetirement({
			leaseId: idled.value.leaseId,
			expectedRevision: idled.value.revision,
			now: "2026-09-24T12:00:06.000Z",
			reason: "cancelled",
		});
		if (!retiring.ok) throw new Error("expected retiring lease");
		const released = await registry.finishRetirement({
			leaseId: idled.value.leaseId,
			retirementRevision: retiring.value.retirementRevision,
			now: "2026-09-24T12:00:07.000Z",
			disposition: "closed",
		});
		expect(released).toMatchObject({
			ok: true,
			value: {
				actionCounts: {
					targetCreations: 1,
					adoptions: 0,
					navigations: 1,
					reloads: 1,
					focuses: 1,
					closes: 1,
				},
			},
		});
	});
});
