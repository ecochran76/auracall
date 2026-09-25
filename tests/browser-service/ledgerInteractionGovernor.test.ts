import { describe, expect, test, vi } from "vitest";

import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import {
	createLedgerBackedBrowserInteractionGovernor,
	ProviderInteractionAdmissionError,
} from "../../packages/browser-service/src/service/ledgerInteractionGovernor.js";

describe("ledger-backed browser interaction governor", () => {
	test("settles each prior interaction before reserving the next exact-tab permit", async () => {
		let sequence = 0;
		let nowMs = Date.parse("2026-09-24T12:00:00.000Z");
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const governor = createLedgerBackedBrowserInteractionGovernor({
			ledger,
			scope: {
				provider: "chatgpt",
				tenantKey: "tenant-1",
				runtimeProfileId: "runtime-1",
				managedBrowserProfile: "managed-1",
			},
			workloadId: "live-follow:completion-1",
			operationId: "completion-1",
			tabLeaseId: "lease-crawler",
			policy: {
				maxConcurrentChats: 4,
				maxConversationStartsPerHour: 120,
				maxConversationStartsPerDay: 240,
				maxInteractionsPerMinute: 3,
			},
			baseGovernor: { beforeInteraction: vi.fn(async () => undefined) },
			now: () => new Date(nowMs++),
		});

		await governor.beforeInteraction("page-refresh");
		await governor.beforeInteraction("conversation-read");
		await governor.finish();

		expect(await ledger.list()).toMatchObject([
			{
				interactionClass: "reload",
				state: "settled",
				tabLeaseId: "lease-crawler",
			},
			{
				interactionClass: "conversation-read",
				state: "settled",
				tabLeaseId: "lease-crawler",
			},
		]);
	});

	test("denies the next interaction at the tenant-wide rolling-minute boundary", async () => {
		let sequence = 0;
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++sequence}`,
		});
		const governor = createLedgerBackedBrowserInteractionGovernor({
			ledger,
			scope: {
				provider: "chatgpt",
				tenantKey: "tenant-1",
				runtimeProfileId: "runtime-1",
				managedBrowserProfile: "managed-1",
			},
			workloadId: "live-follow:completion-1",
			operationId: "completion-1",
			tabLeaseId: "lease-crawler",
			policy: {
				maxConcurrentChats: 4,
				maxConversationStartsPerHour: 120,
				maxConversationStartsPerDay: 240,
				maxInteractionsPerMinute: 1,
			},
			baseGovernor: { beforeInteraction: vi.fn(async () => undefined) },
			now: () => new Date("2026-09-24T12:00:00.000Z"),
		});

		await governor.beforeInteraction("conversation-read");
		await expect(governor.beforeInteraction("conversation-read")).rejects.toBeInstanceOf(
			ProviderInteractionAdmissionError,
		);
	});
});
