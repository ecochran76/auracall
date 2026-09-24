import { describe, expect, test, vi } from "vitest";

import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { runConfiguredChatgptTabMaintenance } from "../../src/browser/configuredChatgptTabMaintenance.js";

describe("configured ChatGPT tab maintenance", () => {
	test("classifies live fenced and unleased ChatGPT targets without mutating them", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const reserved = await registry.reserve({
			scope: {
				runtimeProfileId: "affinity",
				managedBrowserProfile: "/managed/affinity/chatgpt",
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			},
			targetId: "leased-target",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 300_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("expected lease reservation");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const closeTarget = vi.fn();

		const summary = await runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			now: () => new Date("2026-09-24T12:01:00.000Z"),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 9222,
						managedBrowserProfile: "/managed/affinity/chatgpt",
					}),
				}),
				listTargets: vi.fn(async () => [
					{ id: "leased-target", type: "page", url: "https://chatgpt.com/c/conversation-1" },
					{ id: "unleased-target", type: "page", url: "https://chatgpt.com/" },
					{ id: "other-target", type: "page", url: "https://example.com/" },
				]) as never,
				closeTarget,
			},
		});

		expect(summary).toMatchObject({
			liveChatgptTargetCount: 2,
			fencedLiveTargetCount: 1,
			unleasedLiveTargetCount: 1,
			targetCensusErrorCount: 0,
		});
		expect(closeTarget).not.toHaveBeenCalled();
		expect((await registry.list())[0]?.state).toBe("idle");
	});

	test("marks a dead-owner active lease lost and releases it only after target absence proof", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
			ownerIdentity: { processId: 41, instanceId: "previous-process" },
		});
		const reserved = await registry.reserve({
			scope: {
				runtimeProfileId: "affinity",
				managedBrowserProfile: "/managed/affinity/chatgpt",
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			},
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/c/conversation-1",
		});
		expect(reserved.ok).toBe(true);

		const summary = await runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			now: () => new Date("2026-09-24T12:01:00.000Z"),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 9222,
						managedBrowserProfile: "/managed/affinity/chatgpt",
					}),
				}),
				listTargets: vi.fn(async () => []) as never,
				currentOwner: { processId: 99, instanceId: "current-process" },
				isOwnerAlive: () => false,
			},
		});

		expect(summary).toMatchObject({
			restartLostCount: 1,
			restartMissingReleasedCount: 1,
			restartPreservedCount: 0,
			errors: [],
		});
		expect((await registry.list())[0]).toMatchObject({
			state: "released",
			lossReason: "restart-unverified",
			finalDisposition: "already-missing",
		});
	});

	test("visits only explicit affinity profiles without launching a browser", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const reserved = await registry.reserve({
			scope: {
				runtimeProfileId: "affinity",
				managedBrowserProfile: "/managed/affinity/chatgpt",
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			},
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/c/conversation-1",
		});
		if (!reserved.ok) throw new Error("expected lease reservation");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const resolveServiceTarget = vi.fn().mockResolvedValue({
			host: "127.0.0.1",
			port: 9222,
			managedBrowserProfile: "/managed/affinity/chatgpt",
		});
		const closeTarget = vi.fn().mockResolvedValue(undefined);
		let censusCount = 0;
		const summary = await runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			now: () => new Date("2026-09-24T12:02:00.000Z"),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({ resolveServiceTarget }),
				listTargets: vi.fn(async () => {
					censusCount += 1;
					return censusCount === 1
						? [{ id: "target-1", url: "https://chatgpt.com/c/conversation-1" }]
						: [];
				}) as never,
				closeTarget,
			},
		});

		expect(resolveServiceTarget).toHaveBeenCalledWith(
			expect.objectContaining({ serviceId: "chatgpt", ensurePort: false }),
		);
		expect(closeTarget).toHaveBeenCalledWith("127.0.0.1", 9222, "target-1", expect.any(Function));
		expect(summary).toMatchObject({
			configuredScopeCount: 1,
			visitedScopeCount: 1,
			closedCount: 1,
			errors: [],
		});
	});

	test("defers expired leases when the configured browser endpoint is absent", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const reserved = await registry.reserve({
			scope: {
				runtimeProfileId: "affinity",
				managedBrowserProfile: "/managed/affinity/chatgpt",
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			},
			targetId: "target-1",
			workload: { kind: "live-follow", operationId: "completion-1" },
			operationId: "operation-1",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/",
		});
		if (!reserved.ok) throw new Error("expected lease reservation");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});

		const summary = await runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			now: () => new Date("2026-09-24T12:02:00.000Z"),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({
					resolveServiceTarget: vi.fn().mockResolvedValue({
						managedBrowserProfile: "/managed/affinity/chatgpt",
					}),
				}),
			},
		});

		expect(summary).toMatchObject({ deferredScopeCount: 1, closedCount: 0, errors: [] });
		expect((await registry.list())[0]?.state).toBe("idle");
	});
});
