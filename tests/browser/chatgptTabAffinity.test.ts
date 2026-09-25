import { describe, expect, test, vi } from "vitest";

import type { BrowserTabLease } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { runChatgptPromptOnLeasedTab } from "../../src/browser/providers/chatgptTabAffinity.js";

function lease(input: {
	targetId: string;
	conversationId?: string;
	kind?: "conversation" | "new-conversation" | "live-follow";
}): BrowserTabLease {
	const workload =
		input.kind === "live-follow"
			? ({ kind: "live-follow", operationId: "follow-1" } as const)
			: input.kind === "new-conversation"
				? ({ kind: "new-conversation", reservationId: "reservation-1" } as const)
				: ({
						kind: "conversation",
						conversationId: input.conversationId ?? "conversation-1",
					} as const);
	return {
		leaseId: `lease-${input.targetId}`,
		revision: 1,
		scope: {
			runtimeProfileId: "runtime-1",
			managedBrowserProfile: "managed-1",
			service: "chatgpt",
			tenantKey: "tenant-1",
		},
		targetId: input.targetId,
		workload,
		state: "active",
		ownerOperationId: "operation-1",
		effectState: "none",
		acquiredAt: "2026-09-24T12:00:00.000Z",
		heartbeatAt: "2026-09-24T12:00:00.000Z",
		lastMeaningfulUseAt: "2026-09-24T12:00:00.000Z",
		idleExpiresAt: "2026-09-24T12:05:00.000Z",
		absoluteExpiresAt: "2026-09-24T13:00:00.000Z",
		targetFingerprint: "https://chatgpt.com/c/conversation-1",
		retirementReason: null,
		finalDisposition: null,
		lossReason: null,
		actionCounts: {
			targetCreations: 1,
			adoptions: 0,
			navigations: 0,
			reloads: 0,
			focuses: 0,
			closes: 0,
		},
	};
}

describe("ChatGPT leased-tab prompt affinity", () => {
	test("routes independent conversations only through their exact retained targets", async () => {
		const runPrompt = vi.fn(async (input, options) => ({
			text: `answer:${input.conversationId}`,
			conversationId: input.conversationId,
			tabTargetId: options?.tabTargetId,
		}));

		const [first, second] = await Promise.all([
			runChatgptPromptOnLeasedTab({
				lease: lease({ targetId: "target-a", conversationId: "conversation-a" }),
				operationId: "operation-1",
				endpoint: { host: "127.0.0.1", port: 45011 },
				input: { prompt: "first", conversationId: "conversation-a" },
				runPrompt,
			}),
			runChatgptPromptOnLeasedTab({
				lease: lease({ targetId: "target-b", conversationId: "conversation-b" }),
				operationId: "operation-1",
				endpoint: { host: "127.0.0.1", port: 45011 },
				input: { prompt: "second", conversationId: "conversation-b" },
				runPrompt,
			}),
		]);

		expect(first.tabTargetId).toBe("target-a");
		expect(second.tabTargetId).toBe("target-b");
		expect(runPrompt.mock.calls.map(([, options]) => options)).toEqual([
			{
				allowNavigation: false,
				host: "127.0.0.1",
				port: 45011,
				preserveActiveTab: true,
				tabLifecycle: "retain",
				tabTargetId: "target-a",
			},
			{
				allowNavigation: false,
				host: "127.0.0.1",
				port: 45011,
				preserveActiveTab: true,
				tabLifecycle: "retain",
				tabTargetId: "target-b",
			},
		]);
	});

	test("rejects a live-follow crawler lease before prompt execution", async () => {
		const runPrompt = vi.fn();

		await expect(
			runChatgptPromptOnLeasedTab({
				lease: lease({ targetId: "crawler-target", kind: "live-follow" }),
				operationId: "operation-1",
				endpoint: { host: "127.0.0.1", port: 45011 },
				input: { prompt: "must not run" },
				runPrompt,
			}),
		).rejects.toThrow("cannot run a ChatGPT conversation prompt");
		expect(runPrompt).not.toHaveBeenCalled();
	});

	test("keeps a new conversation on its reserved target and returns binding evidence", async () => {
		const abortController = new AbortController();
		const runPrompt = vi.fn(async (_input, options) => ({
			text: "created",
			conversationId: "conversation-new",
			tabTargetId: options?.tabTargetId,
		}));

		const result = await runChatgptPromptOnLeasedTab({
			lease: lease({ targetId: "reserved-target", kind: "new-conversation" }),
			operationId: "operation-1",
			endpoint: { host: "127.0.0.1", port: 45011 },
			options: {
				abortSignal: abortController.signal,
				tabTargetId: "untrusted-target",
				tabLifecycle: "retain-new",
				preserveActiveTab: false,
			},
			input: { prompt: "new" },
			runPrompt,
		});

		expect(result.conversationId).toBe("conversation-new");
		expect(runPrompt.mock.calls[0]?.[1]).toMatchObject({
			abortSignal: abortController.signal,
			tabTargetId: "reserved-target",
			tabLifecycle: "retain",
			preserveActiveTab: true,
			allowNavigation: false,
		});
	});

	test("rejects mismatched ownership and provider target readback", async () => {
		const runPrompt = vi.fn(async () => ({
			text: "wrong target",
			conversationId: "conversation-a",
			tabTargetId: "target-b",
		}));

		await expect(
			runChatgptPromptOnLeasedTab({
				lease: lease({ targetId: "target-a", conversationId: "conversation-a" }),
				operationId: "other-operation",
				endpoint: { host: "127.0.0.1", port: 45011 },
				input: { prompt: "first", conversationId: "conversation-a" },
				runPrompt,
			}),
		).rejects.toThrow("owned by operation operation-1");
		expect(runPrompt).not.toHaveBeenCalled();

		await expect(
			runChatgptPromptOnLeasedTab({
				lease: lease({ targetId: "target-a", conversationId: "conversation-a" }),
				operationId: "operation-1",
				endpoint: { host: "127.0.0.1", port: 45011 },
				input: { prompt: "first", conversationId: "conversation-a" },
				runPrompt,
			}),
		).rejects.toThrow("returned target target-b instead of leased target target-a");
	});
});
