import { describe, expect, test, vi } from "vitest";

import {
	createInMemoryProviderInteractionLedger,
	type ProviderInteractionPolicy,
} from "../../packages/browser-service/src/service/interactionLedger.js";
import {
	createInMemoryBrowserTabLeaseRegistry,
	type TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { executeChatgptConversation } from "../../src/browser/chatgptAffinityExecutor.js";

const scope: TabLeaseScope = {
	runtimeProfileId: "runtime-1",
	managedBrowserProfile: "managed-1",
	service: "chatgpt",
	tenantKey: "tenant-1",
};

const policy: ProviderInteractionPolicy = {
	maxConcurrentChats: 4,
	maxConversationStartsPerHour: 120,
	maxConversationStartsPerDay: 240,
};

describe("ChatGPT affinity executor", () => {
	test("keeps serialized rollback free of lease and aggregate-ledger dependencies", async () => {
		const runSerialized = vi.fn(async () => ({ text: "compatibility" }));

		const result = await executeChatgptConversation({
			mode: "serialized",
			input: { prompt: "compatibility" },
			runSerialized,
		});

		expect(result).toEqual({ status: "completed", result: { text: "compatibility" } });
		expect(runSerialized).toHaveBeenCalledOnce();
	});

	test("admits, submits, rebinds, and idles a new conversation on its exact tab", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "interaction-1",
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/",
		});
		if (!reserved.ok) throw new Error("fixture lease conflict");
		const runPrompt = vi.fn(async (_input, options) => ({
			text: "created",
			conversationId: "conversation-1",
			url: "https://chatgpt.com/c/conversation-1",
			tabTargetId: options.tabTargetId,
		}));

		const result = await executeChatgptConversation({
			mode: "tab-affinity",
			registry,
			ledger,
			lease: reserved.value.lease,
			claim: reserved.value.claim,
			operationId: "operation-1",
			endpoint: { host: "127.0.0.1", port: 45011 },
			input: { prompt: "new" },
			runPrompt,
			policy,
			reservationTtlMs: 30_000,
			idleTtlMs: 60_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
		});

		expect(result.status).toBe("completed");
		expect(runPrompt).toHaveBeenCalledOnce();
		const binding = await registry.findByWorkload(scope, {
			kind: "conversation",
			conversationId: "conversation-1",
		});
		expect(binding).toMatchObject({
			targetId: "target-1",
			state: "idle",
			effectState: "settled",
		});
		expect(await ledger.list()).toEqual([
			expect.objectContaining({
				reservationId: "interaction-1",
				tabLeaseId: "lease-1",
				interactionClass: "conversation-start",
				state: "settled",
				effectState: "settled",
				outcome: "succeeded",
			}),
		]);
	});

	test("denies before provider execution when aggregate admission is unavailable", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "interaction-1",
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
		if (!reserved.ok) throw new Error("fixture lease conflict");
		await ledger.recordProviderWarning({
			scope: { ...scope, provider: "chatgpt" },
			classification: "rate-limit",
			reason: "provider warning",
			observedAt: "2026-09-24T12:00:00.000Z",
		});
		const runPrompt = vi.fn();

		const result = await executeChatgptConversation({
			mode: "tab-affinity",
			registry,
			ledger,
			lease: reserved.value.lease,
			claim: reserved.value.claim,
			operationId: "operation-1",
			endpoint: { host: "127.0.0.1", port: 45011 },
			input: { prompt: "continue", conversationId: "conversation-1" },
			runPrompt,
			policy,
			reservationTtlMs: 30_000,
			idleTtlMs: 60_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
		});

		expect(result).toMatchObject({ status: "denied", admission: { reason: "provider-warning" } });
		expect(runPrompt).not.toHaveBeenCalled();
	});

	test("retains an outcome-unknown failure without retrying the provider", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "interaction-1",
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
		if (!reserved.ok) throw new Error("fixture lease conflict");
		const runPrompt = vi.fn(async () => {
			throw new Error("submit outcome unavailable");
		});

		await expect(
			executeChatgptConversation({
				mode: "tab-affinity",
				registry,
				ledger,
				lease: reserved.value.lease,
				claim: reserved.value.claim,
				operationId: "operation-1",
				endpoint: { host: "127.0.0.1", port: 45011 },
				input: { prompt: "continue", conversationId: "conversation-1" },
				runPrompt,
				policy,
				reservationTtlMs: 30_000,
				idleTtlMs: 60_000,
				now: () => new Date("2026-09-24T12:00:01.000Z"),
			}),
		).rejects.toThrow("submit outcome unavailable");

		expect(runPrompt).toHaveBeenCalledOnce();
		expect(await ledger.list()).toEqual([
			expect.objectContaining({
				state: "settled",
				effectState: "outcome-unknown",
				outcome: "failed",
			}),
		]);
		const binding = await registry.findByWorkload(scope, {
			kind: "conversation",
			conversationId: "conversation-1",
		});
		expect(binding).toMatchObject({ state: "idle", effectState: "outcome-unknown" });
	});
});
