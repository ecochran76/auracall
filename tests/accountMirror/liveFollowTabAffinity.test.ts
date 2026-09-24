import { describe, expect, test, vi } from "vitest";

import type { BrowserTabLease } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { runLiveFollowTraversalOnLeasedTab } from "../../src/accountMirror/liveFollowTabAffinity.js";

function lease(kind: "live-follow" | "conversation"): BrowserTabLease {
	return {
		leaseId: `lease-${kind}`,
		revision: 1,
		scope: {
			runtimeProfileId: "runtime-1",
			managedBrowserProfile: "managed-1",
			service: "chatgpt",
			tenantKey: "tenant-1",
		},
		targetId: kind === "live-follow" ? "crawler-target" : "conversation-target",
		workload:
			kind === "live-follow"
				? { kind, operationId: "follow-1" }
				: { kind, conversationId: "conversation-a" },
		state: "active",
		ownerOperationId: "follow-1",
		effectState: "none",
		acquiredAt: "2026-09-24T12:00:00.000Z",
		heartbeatAt: "2026-09-24T12:00:00.000Z",
		lastMeaningfulUseAt: "2026-09-24T12:00:00.000Z",
		idleExpiresAt: "2026-09-24T12:05:00.000Z",
		absoluteExpiresAt: "2026-09-24T13:00:00.000Z",
		targetFingerprint: "https://chatgpt.com/",
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

describe("live-follow leased crawler tab affinity", () => {
	test("walks conversations sequentially on one dedicated crawler target", async () => {
		const visited: string[] = [];
		let activeVisits = 0;
		let maximumActiveVisits = 0;
		const visitConversation = vi.fn(async (input) => {
			activeVisits += 1;
			maximumActiveVisits = Math.max(maximumActiveVisits, activeVisits);
			visited.push(`${input.targetId}:${input.conversationId}`);
			await Promise.resolve();
			activeVisits -= 1;
			return { conversationId: input.conversationId };
		});

		const results = await runLiveFollowTraversalOnLeasedTab({
			lease: lease("live-follow"),
			operationId: "follow-1",
			endpoint: { host: "127.0.0.1", port: 45011 },
			conversationIds: ["conversation-a", "conversation-b", "conversation-c"],
			visitConversation,
		});

		expect(results).toEqual([
			{ conversationId: "conversation-a" },
			{ conversationId: "conversation-b" },
			{ conversationId: "conversation-c" },
		]);
		expect(visited).toEqual([
			"crawler-target:conversation-a",
			"crawler-target:conversation-b",
			"crawler-target:conversation-c",
		]);
		expect(maximumActiveVisits).toBe(1);
		expect(visitConversation).toHaveBeenCalledTimes(3);
	});

	test("rejects a conversation tab before crawler work begins", async () => {
		const visitConversation = vi.fn();

		await expect(
			runLiveFollowTraversalOnLeasedTab({
				lease: lease("conversation"),
				operationId: "follow-1",
				endpoint: { host: "127.0.0.1", port: 45011 },
				conversationIds: ["conversation-a"],
				visitConversation,
			}),
		).rejects.toThrow("cannot run live-follow traversal");
		expect(visitConversation).not.toHaveBeenCalled();
	});

	test("stops before the next conversation when traversal is aborted", async () => {
		const controller = new AbortController();
		const visitConversation = vi.fn(async (input) => {
			controller.abort(new Error(`stop after ${input.conversationId}`));
			return input.conversationId;
		});

		await expect(
			runLiveFollowTraversalOnLeasedTab({
				lease: lease("live-follow"),
				operationId: "follow-1",
				endpoint: { host: "127.0.0.1", port: 45011 },
				conversationIds: ["conversation-a", "conversation-b"],
				visitConversation,
				abortSignal: controller.signal,
			}),
		).rejects.toThrow("stop after conversation-a");
		expect(visitConversation).toHaveBeenCalledTimes(1);
	});
});
