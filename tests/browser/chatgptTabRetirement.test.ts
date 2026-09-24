import { describe, expect, test } from "vitest";
import type { BrowserTabLease } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { chatgptTargetMatchesLease } from "../../src/browser/chatgptTabRetirement.js";

function lease(overrides: Partial<BrowserTabLease>): BrowserTabLease {
	return {
		leaseId: "lease-1",
		revision: 1,
		scope: {
			runtimeProfileId: "runtime-1",
			managedBrowserProfile: "/profiles/chatgpt",
			service: "chatgpt",
			tenantKey: "tenant-1",
		},
		targetId: "target-1",
		workload: { kind: "conversation", conversationId: "conversation-1" },
		state: "idle",
		ownerOperationId: null,
		effectState: "settled",
		acquiredAt: "2026-09-24T12:00:00.000Z",
		heartbeatAt: "2026-09-24T12:00:00.000Z",
		lastMeaningfulUseAt: "2026-09-24T12:00:00.000Z",
		idleExpiresAt: "2026-09-24T12:01:00.000Z",
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
		...overrides,
	};
}

describe("ChatGPT tab retirement identity", () => {
	test("requires exact conversation and provider host for conversation leases", () => {
		const conversation = lease({});
		expect(
			chatgptTargetMatchesLease(conversation, {
				url: "https://chatgpt.com/c/conversation-1",
			}),
		).toBe(true);
		expect(
			chatgptTargetMatchesLease(conversation, {
				url: "https://chatgpt.com/c/conversation-2",
			}),
		).toBe(false);
		expect(
			chatgptTargetMatchesLease(conversation, {
				url: "https://example.invalid/c/conversation-1",
			}),
		).toBe(false);
	});

	test("allows a crawler to move sequentially only within its provider host", () => {
		const crawler = lease({
			workload: { kind: "live-follow", operationId: "live-follow-1" },
			targetFingerprint: "https://chatgpt.com/",
		});
		expect(
			chatgptTargetMatchesLease(crawler, {
				url: "https://chatgpt.com/c/conversation-9",
			}),
		).toBe(true);
		expect(
			chatgptTargetMatchesLease(crawler, {
				url: "https://example.invalid/c/conversation-9",
			}),
		).toBe(false);
	});
});
