import { describe, expect, test, vi } from "vitest";

import {
	createInMemoryProviderInteractionLedger,
	type ProviderInteractionLedger,
	type ProviderInteractionPolicy,
} from "../../packages/browser-service/src/service/interactionLedger.js";
import {
	createInMemoryBrowserTabLeaseRegistry,
	type TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import {
	executeChatgptConversation,
	executeProvisionedChatgptConversation,
} from "../../src/browser/chatgptAffinityExecutor.js";

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
	test("reserves aggregate capacity before provisioning and then binds the created tab", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "interaction-1",
		});
		const acquireTab = vi.fn(async () => {
			expect(await ledger.list()).toEqual([
				expect.objectContaining({ state: "started", tabLeaseId: null }),
			]);
			const reserved = await registry.reserve({
				scope,
				targetId: "target-1",
				workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
				operationId: "operation-1",
				now: "2026-09-24T12:00:01.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
				targetFingerprint: "https://chatgpt.com/",
			});
			if (!reserved.ok) throw new Error("fixture lease conflict");
			return {
				lease: reserved.value.lease,
				claim: reserved.value.claim,
				endpoint: { host: "127.0.0.1", port: 45011 },
			};
		});
		const runPrompt = vi.fn(async (_input, options) => ({
			text: "created",
			conversationId: "conversation-1",
			url: "https://chatgpt.com/c/conversation-1",
			tabTargetId: options.tabTargetId,
		}));

		const result = await executeProvisionedChatgptConversation({
			registry,
			ledger,
			scope,
			workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
			operationId: "operation-1",
			input: { prompt: "new" },
			runPrompt,
			acquireTab,
			policy,
			reservationTtlMs: 30_000,
			idleTtlMs: 60_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
			classifyProviderWarning: () => null,
		});

		expect(result.status).toBe("completed");
		expect(acquireTab).toHaveBeenCalledOnce();
		expect((await ledger.listEvents()).map((event) => event.type)).toEqual([
			"reservation-created",
			"interaction-started",
			"tab-lease-bound",
			"interaction-settled",
		]);
	});

	test("does not provision a tab when aggregate warning admission denies the workload", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const ledger = createInMemoryProviderInteractionLedger();
		await ledger.recordProviderWarning({
			scope: { ...scope, provider: "chatgpt" },
			classification: "human-verification",
			reason: "manual clearance required",
			observedAt: "2026-09-24T12:00:00.000Z",
		});
		const acquireTab = vi.fn();
		const runPrompt = vi.fn();

		const result = await executeProvisionedChatgptConversation({
			registry,
			ledger,
			scope,
			workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
			operationId: "operation-1",
			input: { prompt: "new" },
			runPrompt,
			acquireTab,
			policy,
			reservationTtlMs: 30_000,
			idleTtlMs: 60_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
			classifyProviderWarning: () => null,
		});

		expect(result).toMatchObject({ status: "denied", admission: { reason: "provider-warning" } });
		expect(acquireTab).not.toHaveBeenCalled();
		expect(runPrompt).not.toHaveBeenCalled();
	});

	test("projects a provider warning before any later workload can be admitted", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: (() => {
				let sequence = 0;
				return () => `interaction-${++sequence}`;
			})(),
		});
		const acquireTab = async () => {
			const reserved = await registry.reserve({
				scope,
				targetId: "target-1",
				workload: { kind: "conversation", conversationId: "conversation-1" },
				operationId: "operation-1",
				now: "2026-09-24T12:00:01.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
			});
			if (!reserved.ok) throw new Error("fixture lease conflict");
			return {
				lease: reserved.value.lease,
				claim: reserved.value.claim,
				endpoint: { host: "127.0.0.1", port: 45011 },
			};
		};
		const rateLimitError = new Error("provider rate limit visible");

		await expect(
			executeProvisionedChatgptConversation({
				registry,
				ledger,
				scope,
				workload: { kind: "conversation", conversationId: "conversation-1" },
				operationId: "operation-1",
				input: { prompt: "continue", conversationId: "conversation-1" },
				runPrompt: async () => {
					throw rateLimitError;
				},
				acquireTab,
				policy,
				reservationTtlMs: 30_000,
				idleTtlMs: 60_000,
				now: () => new Date("2026-09-24T12:00:01.000Z"),
				classifyProviderWarning: (error) =>
					error === rateLimitError
						? { classification: "rate-limit", reason: "provider rate limit visible" }
						: null,
			}),
		).rejects.toThrow("provider rate limit visible");

		expect(await ledger.list()).toEqual([
			expect.objectContaining({ state: "frozen", providerWarning: "rate-limit" }),
		]);
		const denied = await ledger.reserve({
			scope: { ...scope, provider: "chatgpt" },
			workloadId: "conversation:conversation-2",
			operationId: "operation-2",
			interactionClass: "prompt-continuation",
			mutability: "provider-mutating",
			startsNewConversation: false,
			now: "2026-09-24T12:00:02.000Z",
			reservationTtlMs: 30_000,
			policy,
		});
		expect(denied).toMatchObject({ allowed: false, reason: "provider-warning" });
	});

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

	test("cancels a confirmed pre-effect failure without consuming settled interaction usage", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger({ createReservationId: () => "interaction-1" });
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
		const failure = Object.assign(new Error("selector failed before Send"), {
			details: { effectState: "pre_effect" },
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
				runPrompt: vi.fn(async () => {
					throw failure;
				}),
				policy,
				reservationTtlMs: 30_000,
				idleTtlMs: 60_000,
				now: () => new Date("2026-09-24T12:00:01.000Z"),
			}),
		).rejects.toThrow("selector failed before Send");

		expect(await ledger.list()).toEqual([
			expect.objectContaining({ state: "settled", effectState: "none", outcome: "cancelled" }),
		]);
		expect(await registry.list()).toEqual([
			expect.objectContaining({ state: "idle", effectState: "none" }),
		]);
	});

	test("fences the exact lease when ledger settlement fails after provider success", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "interaction-1",
		});
		const failingLedger = new Proxy(ledger, {
			get(target, property, receiver) {
				if (property === "settle") {
					return async () => ({ ok: false as const, reason: "invalid-state" as const });
				}
				const value = Reflect.get(target, property, receiver) as unknown;
				return typeof value === "function" ? value.bind(target) : value;
			},
		}) as ProviderInteractionLedger;
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
		const runPrompt = vi.fn(async (_input, options) => ({
			text: "observed provider response",
			conversationId: "conversation-1",
			url: "https://chatgpt.com/c/conversation-1",
			tabTargetId: options.tabTargetId,
		}));

		await expect(
			executeChatgptConversation({
				mode: "tab-affinity",
				registry,
				ledger: failingLedger,
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
		).rejects.toThrow("Interaction settlement failed: invalid-state.");

		expect(runPrompt).toHaveBeenCalledOnce();
		const binding = await registry.findByWorkload(scope, {
			kind: "conversation",
			conversationId: "conversation-1",
		});
		expect(binding).toMatchObject({ state: "idle", effectState: "outcome-unknown" });
		const reacquired = await registry.acquire({
			scope,
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-2",
			now: "2026-09-24T12:00:02.000Z",
		});
		expect(reacquired).toMatchObject({
			ok: false,
			conflict: {
				kind: "invalid-transition",
				lease: { effectState: "outcome-unknown" },
			},
		});
	});
});
