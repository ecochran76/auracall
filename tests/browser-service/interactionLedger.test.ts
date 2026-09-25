import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	createFileBackedProviderInteractionLedger,
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
	test("binds a post-admission tab lease once and persists the association", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-interaction-binding-"));
		try {
			const ledger = createFileBackedProviderInteractionLedger({
				ledgerRoot: directory,
				createReservationId: () => "reservation-1",
			});
			const admission = await ledger.reserve({
				scope: foregroundScope,
				workloadId: "new-conversation-1",
				operationId: "operation-1",
				tabLeaseId: null,
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now: "2026-09-24T13:00:00.000Z",
				reservationTtlMs: 30_000,
				policy: {
					maxConcurrentChats: 4,
					maxConversationStartsPerHour: 120,
					maxConversationStartsPerDay: 240,
				},
			});
			if (!admission.allowed) throw new Error("expected admission");

			expect(
				await ledger.bindTabLease({
					reservationId: "reservation-1",
					tabLeaseId: "lease-1",
					boundAt: "2026-09-24T13:00:01.000Z",
				}),
			).toMatchObject({ ok: true, record: { tabLeaseId: "lease-1" } });
			expect(
				await ledger.bindTabLease({
					reservationId: "reservation-1",
					tabLeaseId: "lease-other",
					boundAt: "2026-09-24T13:00:02.000Z",
				}),
			).toEqual({ ok: false, reason: "invalid-state" });

			const restarted = createFileBackedProviderInteractionLedger({ ledgerRoot: directory });
			expect(await restarted.list()).toEqual([
				expect.objectContaining({ reservationId: "reservation-1", tabLeaseId: "lease-1" }),
			]);
			expect((await restarted.listEvents()).map((event) => event.type)).toEqual([
				"reservation-created",
				"tab-lease-bound",
			]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

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

	test("operator clearance replaces an indefinite warning with a bounded quiet cooldown", async () => {
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "reservation-after-clear",
		});
		await ledger.recordProviderWarning({
			scope: foregroundScope,
			classification: "human-verification",
			reason: "human verification required",
			observedAt: "2026-09-24T12:00:00.000Z",
		});

		const cleared = await ledger.clearProviderWarning({
			scope: foregroundScope,
			clearedAt: "2026-09-24T12:05:00.000Z",
			cooldownUntil: "2026-09-24T12:35:00.000Z",
			reason: "operator cleared provider guard; quiet cooldown",
		});
		expect(cleared).toMatchObject({
			previous: { classification: "human-verification", cooldownUntil: null },
			warning: {
				classification: "human-verification",
				cooldownUntil: "2026-09-24T12:35:00.000Z",
			},
		});

		const request = (now: string) =>
			ledger.reserve({
				scope: foregroundScope,
				workloadId: "conversation:after-clear",
				operationId: "operation-after-clear",
				interactionClass: "prompt-continuation",
				mutability: "provider-mutating",
				startsNewConversation: false,
				now,
				reservationTtlMs: 30_000,
				policy: {
					maxConcurrentChats: 4,
					maxConversationStartsPerHour: 120,
					maxConversationStartsPerDay: 240,
				},
			});
		expect(await request("2026-09-24T12:34:59.999Z")).toMatchObject({
			allowed: false,
			reason: "provider-warning",
		});
		expect(await request("2026-09-24T12:35:00.000Z")).toMatchObject({ allowed: true });
		expect((await ledger.listEvents()).map((event) => event.type)).toContain(
			"provider-warning-cleared",
		);
		expect(await ledger.listActiveProviderWarnings({ now: "2026-09-24T12:34:59.999Z" })).toEqual([
			cleared.warning,
		]);
		expect(await ledger.listActiveProviderWarnings({ now: "2026-09-24T12:35:00.000Z" })).toEqual(
			[],
		);
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
			"admission-rejected",
			"admission-rejected",
			"reservation-created",
		]);
	});

	test("summarizes rolling usage across tenant scopes without merging equal workload ids", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `aggregate-${++sequence}`,
		});
		for (const tenantKey of ["account-a", "account-b"]) {
			const admission = await ledger.reserve({
				scope: { ...foregroundScope, tenantKey },
				workloadId: "same-conversation-id",
				operationId: `operation-${tenantKey}`,
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now: "2026-09-24T12:00:00.000Z",
				reservationTtlMs: 300_000,
				policy: {
					maxConcurrentChats: 4,
					maxConversationStartsPerHour: 120,
					maxConversationStartsPerDay: 240,
				},
			});
			expect(admission.allowed).toBe(true);
		}
		expect(await ledger.summarizeAggregateUsage({ now: "2026-09-24T12:00:01.000Z" })).toEqual({
			activeChats: 2,
			chatsLastHour: 2,
			chatsLastDay: 2,
			interactionsLastMinute: 2,
		});
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

	test("persists usage and provider warnings atomically across ledger instances and restart", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-interactions-"));
		try {
			let sequence = 0;
			const options = {
				ledgerRoot: directory,
				createReservationId: () => `reservation-${++sequence}`,
			};
			const policy = {
				maxConcurrentChats: 4,
				maxConversationStartsPerHour: 1,
				maxConversationStartsPerDay: 2,
			};
			const firstLedger = createFileBackedProviderInteractionLedger(options);
			const first = await firstLedger.reserve({
				scope: foregroundScope,
				workloadId: "conversation-a",
				operationId: "operation-a",
				tabLeaseId: "lease-a",
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now: "2026-09-24T12:00:00.000Z",
				reservationTtlMs: 30_000,
				policy,
			});
			if (!first.allowed) throw new Error("expected first admission");
			await firstLedger.start({
				reservationId: first.reservation.reservationId,
				startedAt: "2026-09-24T12:00:00.000Z",
			});
			await firstLedger.settle({
				reservationId: first.reservation.reservationId,
				settledAt: "2026-09-24T12:00:01.000Z",
				effectState: "settled",
				outcome: "succeeded",
			});

			const restarted = createFileBackedProviderInteractionLedger(options);
			const hourlyDenied = await restarted.reserve({
				scope: foregroundScope,
				workloadId: "conversation-b",
				operationId: "operation-b",
				tabLeaseId: "lease-b",
				interactionClass: "conversation-start",
				mutability: "provider-mutating",
				startsNewConversation: true,
				now: "2026-09-24T12:30:00.000Z",
				reservationTtlMs: 30_000,
				policy,
			});
			expect(hourlyDenied).toEqual({ allowed: false, reason: "hourly-limit" });

			await restarted.recordProviderWarning({
				scope: foregroundScope,
				classification: "human-verification",
				reason: "provider verification required",
				observedAt: "2026-09-24T12:30:01.000Z",
			});
			const afterWarningRestart = createFileBackedProviderInteractionLedger(options);
			const warningDenied = await afterWarningRestart.reserve({
				scope: foregroundScope,
				workloadId: "conversation-a",
				operationId: "operation-c",
				tabLeaseId: "lease-a",
				interactionClass: "prompt-continuation",
				mutability: "provider-mutating",
				startsNewConversation: false,
				now: "2026-09-24T12:30:02.000Z",
				reservationTtlMs: 30_000,
				policy,
			});
			expect(warningDenied).toMatchObject({
				allowed: false,
				reason: "provider-warning",
				warning: { classification: "human-verification" },
			});
			expect((await afterWarningRestart.listEvents()).map((event) => event.type)).toEqual([
				"reservation-created",
				"interaction-started",
				"interaction-settled",
				"admission-rejected",
				"provider-warning-observed",
				"admission-rejected",
			]);

			const raceScope = { ...foregroundScope, tenantKey: "account-b" };
			const racePolicy = { ...policy, maxConcurrentChats: 1 };
			const reserveRacer = (ledger: typeof firstLedger, operationId: string) =>
				ledger.reserve({
					scope: raceScope,
					workloadId: operationId,
					operationId,
					tabLeaseId: `lease-${operationId}`,
					interactionClass: "prompt-continuation",
					mutability: "provider-mutating",
					startsNewConversation: false,
					now: "2026-09-24T12:31:00.000Z",
					reservationTtlMs: 30_000,
					policy: racePolicy,
				});
			const raced = await Promise.all([
				reserveRacer(restarted, "race-a"),
				reserveRacer(afterWarningRestart, "race-b"),
			]);
			expect(raced.filter((result) => result.allowed)).toHaveLength(1);
			expect(raced.filter((result) => !result.allowed)).toEqual([
				{ allowed: false, reason: "concurrent-limit" },
			]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("retains pre-effect cancellation evidence without charging a conversation start", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 1,
			maxConversationStartsPerHour: 1,
			maxConversationStartsPerDay: 1,
		};
		const reserve = (operationId: string, now: string) =>
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
		const cancelled = await reserve("operation-a", "2026-09-24T12:00:00.000Z");
		if (!cancelled.allowed) throw new Error("expected reservation");
		await ledger.start({
			reservationId: cancelled.reservation.reservationId,
			startedAt: "2026-09-24T12:00:01.000Z",
		});
		await ledger.settle({
			reservationId: cancelled.reservation.reservationId,
			settledAt: "2026-09-24T12:00:02.000Z",
			effectState: "none",
			outcome: "cancelled",
			stopReason: "caller-aborted-before-provider-effect",
		});

		expect((await reserve("operation-b", "2026-09-24T12:00:03.000Z")).allowed).toBe(true);
		expect(await ledger.list()).toContainEqual(
			expect.objectContaining({
				operationId: "operation-a",
				state: "settled",
				effectState: "none",
				outcome: "cancelled",
			}),
		);
	});

	test("enforces the inclusive rolling daily boundary", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 4,
			maxConversationStartsPerHour: null,
			maxConversationStartsPerDay: 1,
		};
		const reserve = (operationId: string, now: string) =>
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
		const first = await reserve("operation-a", "2026-09-24T12:00:00.000Z");
		if (!first.allowed) throw new Error("expected first start");
		await ledger.start({
			reservationId: first.reservation.reservationId,
			startedAt: "2026-09-24T12:00:00.000Z",
		});
		await ledger.settle({
			reservationId: first.reservation.reservationId,
			settledAt: "2026-09-24T12:00:00.000Z",
			effectState: "settled",
			outcome: "succeeded",
		});

		expect(await reserve("operation-b", "2026-09-25T12:00:00.000Z")).toEqual({
			allowed: false,
			reason: "daily-limit",
		});
		expect((await reserve("operation-c", "2026-09-25T12:00:00.001Z")).allowed).toBe(true);
	});

	test("enforces one aggregate rolling-minute interaction limit across runtime profiles", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const policy = {
			maxConcurrentChats: 4,
			maxConversationStartsPerHour: null,
			maxConversationStartsPerDay: null,
			maxInteractionsPerMinute: 1,
		};
		const first = await ledger.reserve({
			scope: foregroundScope,
			workloadId: "conversation:one",
			operationId: "operation-a",
			interactionClass: "conversation-read",
			mutability: "read-only",
			startsNewConversation: false,
			now: "2026-09-24T12:00:00.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		if (!first.allowed) throw new Error("expected first interaction");
		await ledger.start({
			reservationId: first.reservation.reservationId,
			startedAt: "2026-09-24T12:00:00.000Z",
		});
		await ledger.settle({
			reservationId: first.reservation.reservationId,
			settledAt: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
			outcome: "succeeded",
		});

		const reserveBackground = (now: string) =>
			ledger.reserve({
				scope: { ...foregroundScope, runtimeProfileId: "runtime-background" },
				workloadId: "live-follow:one",
				operationId: "operation-b",
				interactionClass: "list-read",
				mutability: "read-only",
				startsNewConversation: false,
				now,
				reservationTtlMs: 30_000,
				policy,
			});
		expect(await reserveBackground("2026-09-24T12:01:00.000Z")).toEqual({
			allowed: false,
			reason: "minute-interaction-limit",
		});
		expect((await reserveBackground("2026-09-24T12:01:00.001Z")).allowed).toBe(true);
		expect(
			await ledger.summarizeUsage({
				provider: foregroundScope.provider,
				tenantKey: foregroundScope.tenantKey,
				now: "2026-09-24T12:01:00.001Z",
			}),
		).toMatchObject({ interactionsLastMinute: 1 });
	});
});
