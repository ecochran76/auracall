import { describe, expect, test } from "vitest";
import {
	createInMemoryProviderInteractionLedger,
	type ProviderInteractionScope,
} from "../../packages/browser-service/src/service/interactionLedger.js";

const foregroundScope: ProviderInteractionScope = {
	provider: "chatgpt",
	tenantKey: "account-a",
	runtimeProfileId: "default",
	managedBrowserProfile: "managed-chatgpt",
};

describe("interactionLedger (package)", () => {
	test("a warning on one tab freezes existing work and denies every later tenant-provider permit", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 4,
			maxConversationStartsPerHour: 120,
			maxConversationStartsPerDay: 240,
		};
		const foreground = await ledger.reserve({
			scope: foregroundScope,
			workloadId: "conversation-a",
			operationId: "operation-a",
			tabLeaseId: "lease-a",
			interactionClass: "prompt-continuation",
			mutability: "provider-mutating",
			startsNewConversation: false,
			now: "2026-09-24T13:00:00.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		const crawler = await ledger.reserve({
			scope: { ...foregroundScope, runtimeProfileId: "mirror" },
			workloadId: "live-follow-1",
			operationId: "operation-follow",
			tabLeaseId: "lease-crawler",
			interactionClass: "conversation-read",
			mutability: "read-only",
			startsNewConversation: false,
			now: "2026-09-24T13:00:00.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		expect(foreground.allowed).toBe(true);
		expect(crawler.allowed).toBe(true);

		const warning = await ledger.recordProviderWarning({
			scope: foregroundScope,
			classification: "rate-limit",
			reason: "provider warning observed",
			observedAt: "2026-09-24T13:00:01.000Z",
			cooldownUntil: "2026-09-24T14:00:01.000Z",
		});
		expect(warning.frozenReservationIds).toEqual(["reservation-1", "reservation-2"]);

		const denied = await ledger.reserve({
			scope: foregroundScope,
			workloadId: "conversation-b",
			operationId: "operation-b",
			tabLeaseId: "lease-b",
			interactionClass: "conversation-start",
			mutability: "provider-mutating",
			startsNewConversation: true,
			now: "2026-09-24T13:00:02.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		expect(denied).toMatchObject({
			allowed: false,
			reason: "provider-warning",
			warning: { classification: "rate-limit" },
		});
		expect(
			(await ledger.list({ provider: "chatgpt", tenantKey: "account-a" })).map(
				(entry) => entry.state,
			),
		).toEqual(["frozen", "frozen"]);
	});

	test("atomic short reservations close concurrency races and expire without erasing history", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const request = (operationId: string) => ({
			scope: foregroundScope,
			workloadId: operationId,
			operationId,
			tabLeaseId: `lease-${operationId}`,
			interactionClass: "conversation-start" as const,
			mutability: "provider-mutating" as const,
			startsNewConversation: true,
			now: "2026-09-24T13:00:00.000Z",
			reservationTtlMs: 1_000,
			policy: {
				maxConcurrentChats: 1,
				maxConversationStartsPerHour: 120,
				maxConversationStartsPerDay: 240,
			},
		});

		const raced = await Promise.all([
			ledger.reserve(request("operation-a")),
			ledger.reserve(request("operation-b")),
		]);
		expect(raced.filter((result) => result.allowed)).toHaveLength(1);
		expect(raced.filter((result) => !result.allowed)).toEqual([
			{ allowed: false, reason: "concurrent-limit" },
		]);

		const afterExpiry = await ledger.reserve({
			...request("operation-c"),
			now: "2026-09-24T13:00:01.001Z",
		});
		expect(afterExpiry.allowed).toBe(true);
		expect((await ledger.list()).map((record) => record.state)).toEqual(["abandoned", "reserved"]);
	});

	test("settled conversation starts drive exact rolling hourly admission without double-counting reservations", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 4,
			maxConversationStartsPerHour: 2,
			maxConversationStartsPerDay: 3,
		};
		const reserveStart = (operationId: string, now: string) =>
			ledger.reserve({
				scope: foregroundScope,
				workloadId: operationId,
				operationId,
				tabLeaseId: `lease-${operationId}`,
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now,
				reservationTtlMs: 30_000,
				policy,
			});
		const completeStart = async (operationId: string, now: string) => {
			const admission = await reserveStart(operationId, now);
			if (!admission.allowed) throw new Error(`expected admission for ${operationId}`);
			const started = await ledger.start({
				reservationId: admission.reservation.reservationId,
				startedAt: now,
			});
			expect(started.ok).toBe(true);
			const settled = await ledger.settle({
				reservationId: admission.reservation.reservationId,
				settledAt: now,
				effectState: "settled",
				outcome: "succeeded",
			});
			expect(settled.ok).toBe(true);
		};

		await completeStart("operation-a", "2026-09-24T12:00:00.000Z");
		await completeStart("operation-b", "2026-09-24T12:30:00.000Z");
		expect(await reserveStart("operation-c", "2026-09-24T12:45:00.000Z")).toEqual({
			allowed: false,
			reason: "hourly-limit",
		});
		expect(await reserveStart("operation-d", "2026-09-24T13:00:00.000Z")).toEqual({
			allowed: false,
			reason: "hourly-limit",
		});
		expect((await reserveStart("operation-e", "2026-09-24T13:00:00.001Z")).allowed).toBe(true);
		expect((await ledger.listEvents()).map((event) => event.type)).toEqual([
			"reservation-created",
			"interaction-started",
			"interaction-settled",
			"reservation-created",
			"interaction-started",
			"interaction-settled",
			"reservation-created",
		]);
	});

	test("passive observation is audited without consuming an interaction permit", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 1,
			maxConversationStartsPerHour: 120,
			maxConversationStartsPerDay: 240,
		};
		const first = await ledger.reserve({
			scope: foregroundScope,
			workloadId: "conversation-a",
			operationId: "operation-a",
			tabLeaseId: "lease-a",
			interactionClass: "prompt-continuation",
			mutability: "provider-mutating",
			startsNewConversation: false,
			now: "2026-09-24T13:00:00.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		expect(first.allowed).toBe(true);

		const observation = await ledger.observePassive({
			scope: foregroundScope,
			workloadId: "conversation-b",
			operationId: "status-poll",
			tabLeaseId: "lease-b",
			observedAt: "2026-09-24T13:00:01.000Z",
		});
		expect(observation).toMatchObject({
			type: "passive-observed",
			interactionClass: "passive-observation",
			workloadId: "conversation-b",
		});
		expect(await ledger.list()).toHaveLength(1);
		expect((await ledger.listEvents()).map((event) => event.type)).toEqual([
			"reservation-created",
			"passive-observed",
		]);
	});
});
