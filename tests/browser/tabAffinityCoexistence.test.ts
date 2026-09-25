import { describe, expect, test, vi } from "vitest";
import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import {
	type BrowserTabLease,
	createInMemoryBrowserTabLeaseRegistry,
	type TabLeaseWorkload,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { runLiveFollowTraversalOnLeasedTab } from "../../src/accountMirror/liveFollowTabAffinity.js";
import { runChatgptPromptOnLeasedTab } from "../../src/browser/providers/chatgptTabAffinity.js";

describe("tab-affinity coexistence", () => {
	test("isolates two conversations and one crawler while accounting for all interactions", async () => {
		let leaseSequence = 0;
		let reservationSequence = 0;
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => `lease-${++leaseSequence}`,
		});
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => `reservation-${++reservationSequence}`,
		});
		const scope = {
			runtimeProfileId: "runtime-1",
			managedBrowserProfile: "managed-chatgpt",
			service: "chatgpt",
			tenantKey: "tenant-1",
		};
		const interactionScope = { ...scope, provider: "chatgpt" };
		const policy = {
			maxConcurrentChats: 2,
			maxConversationStartsPerHour: 120,
			maxConversationStartsPerDay: 240,
			maxInteractionsPerMinute: 10,
		};
		const reserveLease = async (
			targetId: string,
			workload: TabLeaseWorkload,
			operationId: string,
		) => {
			const result = await registry.reserve({
				scope,
				targetId,
				workload,
				operationId,
				now: "2026-09-24T12:00:00.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
				targetFingerprint:
					workload.kind === "conversation"
						? `https://chatgpt.com/c/${workload.conversationId}`
						: "https://chatgpt.com/",
			});
			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error(`expected ${targetId} lease`);
			return result.value.lease;
		};
		const [conversationA, conversationB, crawler] = await Promise.all([
			reserveLease(
				"target-a",
				{ kind: "conversation", conversationId: "conversation-a" },
				"operation-a",
			),
			reserveLease(
				"target-b",
				{ kind: "conversation", conversationId: "conversation-b" },
				"operation-b",
			),
			reserveLease("target-crawler", { kind: "live-follow", operationId: "follow-1" }, "follow-1"),
		]);

		const reserveInteraction = async (
			lease: BrowserTabLease,
			operationId: string,
			interactionClass: "prompt-continuation" | "conversation-read",
		) => {
			const admission = await ledger.reserve({
				scope: interactionScope,
				workloadId:
					lease.workload.kind === "conversation"
						? `conversation:${lease.workload.conversationId}`
						: "live-follow:follow-1",
				operationId,
				tabLeaseId: lease.leaseId,
				interactionClass,
				mutability: interactionClass === "conversation-read" ? "read-only" : "provider-mutating",
				startsNewConversation: false,
				now: "2026-09-24T12:00:00.100Z",
				reservationTtlMs: 30_000,
				policy,
			});
			expect(admission.allowed).toBe(true);
			if (!admission.allowed) throw new Error(`expected ${operationId} admission`);
			const started = await ledger.start({
				reservationId: admission.reservation.reservationId,
				startedAt: "2026-09-24T12:00:00.200Z",
			});
			expect(started.ok).toBe(true);
			return admission.reservation.reservationId;
		};
		const [reservationA, reservationB, reservationCrawler] = await Promise.all([
			reserveInteraction(conversationA, "operation-a", "prompt-continuation"),
			reserveInteraction(conversationB, "operation-b", "prompt-continuation"),
			reserveInteraction(crawler, "follow-1", "conversation-read"),
		]);

		const promptTargets: string[] = [];
		const crawlerVisits: string[] = [];
		const runPrompt = vi.fn(async (input, options) => {
			promptTargets.push(`${input.conversationId}:${options?.tabTargetId}`);
			return {
				text: `answer:${input.conversationId}`,
				conversationId: input.conversationId,
				tabTargetId: options?.tabTargetId,
			};
		});
		const visitConversation = vi.fn(async (input) => {
			crawlerVisits.push(`${input.conversationId}:${input.targetId}`);
			return { conversationId: input.conversationId };
		});
		await Promise.all([
			runChatgptPromptOnLeasedTab({
				lease: conversationA,
				operationId: "operation-a",
				endpoint: { host: "127.0.0.1", port: 45011 },
				input: { prompt: "first", conversationId: "conversation-a" },
				runPrompt,
			}),
			runChatgptPromptOnLeasedTab({
				lease: conversationB,
				operationId: "operation-b",
				endpoint: { host: "127.0.0.1", port: 45011 },
				input: { prompt: "second", conversationId: "conversation-b" },
				runPrompt,
			}),
			runLiveFollowTraversalOnLeasedTab({
				lease: crawler,
				operationId: "follow-1",
				endpoint: { host: "127.0.0.1", port: 45011 },
				conversationIds: ["conversation-a", "conversation-b"],
				visitConversation,
			}),
		]);

		expect(promptTargets).toEqual(["conversation-a:target-a", "conversation-b:target-b"]);
		expect(crawlerVisits).toEqual([
			"conversation-a:target-crawler",
			"conversation-b:target-crawler",
		]);
		expect(
			runPrompt.mock.calls.every(
				([, options]) => options?.allowNavigation === false && options?.tabLifecycle === "retain",
			),
		).toBe(true);
		expect((await registry.list()).map((lease) => lease.targetId)).toEqual([
			"target-a",
			"target-b",
			"target-crawler",
		]);

		for (const reservationId of [reservationA, reservationB, reservationCrawler]) {
			const settled = await ledger.settle({
				reservationId,
				settledAt: "2026-09-24T12:00:01.000Z",
				effectState: "settled",
				outcome: "succeeded",
			});
			expect(settled.ok).toBe(true);
		}
		expect(await ledger.summarizeAggregateUsage({ now: "2026-09-24T12:00:02.000Z" })).toEqual({
			activeChats: 0,
			chatsLastHour: 0,
			chatsLastDay: 0,
			interactionsLastMinute: 3,
		});
	});
});
