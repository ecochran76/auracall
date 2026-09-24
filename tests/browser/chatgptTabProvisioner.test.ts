import { describe, expect, test, vi } from "vitest";

import {
	type BrowserTabLeaseRegistry,
	createInMemoryBrowserTabLeaseRegistry,
	type TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { createChatgptTabProvisioner } from "../../src/browser/providers/chatgptTabProvisioner.js";

const scope: TabLeaseScope = {
	runtimeProfileId: "runtime-1",
	managedBrowserProfile: "/profiles/managed-1",
	service: "chatgpt",
	tenantKey: "tenant-1",
};

describe("ChatGPT tab provisioner", () => {
	test("reacquires a verified idle conversation lease without creating or navigating a tab", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const reserved = await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-previous",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			targetFingerprint: "https://chatgpt.com/c/conversation-1",
		});
		if (!reserved.ok) throw new Error("fixture reservation failed");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const openTarget = vi.fn();
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-next",
			targetUrl: "https://chatgpt.com/c/conversation-1",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:02.000Z"),
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			inspectTarget: vi.fn(async () => ({
				url: "https://chatgpt.com/c/conversation-1",
			})),
			openTarget,
			closeTarget: vi.fn(),
		});

		const result = await provision({ interactionReservationId: "interaction-2" });

		expect(result.lease).toMatchObject({
			leaseId: "lease-1",
			targetId: "target-1",
			state: "active",
			ownerOperationId: "operation-next",
			actionCounts: { adoptions: 1, navigations: 0, targetCreations: 0 },
		});
		expect(openTarget).not.toHaveBeenCalled();
	});

	test("releases a proven-missing binding before creating one replacement target", async () => {
		const leaseIds = ["lease-old", "lease-new"];
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => leaseIds.shift() ?? "unexpected",
		});
		const reserved = await registry.reserve({
			scope,
			targetId: "target-missing",
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-previous",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		if (!reserved.ok) throw new Error("fixture reservation failed");
		await registry.idle({
			claim: reserved.value.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const openTarget = vi.fn(async () => ({
			targetId: "target-new",
			url: "https://chatgpt.com/c/conversation-1",
		}));
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-next",
			targetUrl: "https://chatgpt.com/c/conversation-1",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:02.000Z"),
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			inspectTarget: vi.fn(async () => null),
			openTarget,
			closeTarget: vi.fn(),
		});

		const result = await provision({ interactionReservationId: "interaction-2" });

		expect(result.lease).toMatchObject({ leaseId: "lease-new", targetId: "target-new" });
		expect(openTarget).toHaveBeenCalledOnce();
		expect(await registry.list()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					leaseId: "lease-old",
					state: "released",
					lossReason: "target-missing",
					finalDisposition: "already-missing",
				}),
			]),
		);
	});

	test("creates and immediately leases one exact target on an existing endpoint", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const startBrowser = vi.fn();
		const openTarget = vi.fn(async () => ({
			targetId: "target-1",
			url: "https://chatgpt.com/",
		}));
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "new-conversation", reservationId: "conversation-reservation-1" },
			operationId: "operation-1",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:00.000Z"),
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser,
			openTarget,
			closeTarget: vi.fn(),
		});

		const result = await provision({ interactionReservationId: "interaction-1" });

		expect(startBrowser).not.toHaveBeenCalled();
		expect(openTarget).toHaveBeenCalledWith({
			host: "127.0.0.1",
			port: 45011,
			url: "https://chatgpt.com/",
		});
		expect(result).toMatchObject({
			lease: {
				leaseId: "lease-1",
				targetId: "target-1",
				state: "active",
				actionCounts: { targetCreations: 1, navigations: 0 },
			},
			endpoint: { host: "127.0.0.1", port: 45011 },
		});
	});

	test("holds profile control only around browser startup before target creation", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
			createControlId: () => "control-1",
		});
		const events: string[] = [];
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "conversation", conversationId: "conversation-1" },
			operationId: "operation-1",
			targetUrl: "https://chatgpt.com/c/conversation-1",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:00.000Z"),
			resolveExistingEndpoint: async () => null,
			startBrowser: async () => {
				events.push("start-browser");
				expect(
					await registry.acquireProfileControl({
						scope,
						kind: "browser-startup",
						operationId: "competitor",
						now: "2026-09-24T12:00:00.000Z",
						ttlMs: 30_000,
					}),
				).toMatchObject({ acquired: false, reason: "profile-control-active" });
				return {
					host: "127.0.0.1",
					port: 45011,
					managedBrowserProfile: scope.managedBrowserProfile,
				};
			},
			openTarget: async () => {
				events.push("open-target");
				return {
					targetId: "target-1",
					url: "https://chatgpt.com/c/conversation-1",
				};
			},
			closeTarget: vi.fn(),
		});

		const result = await provision({ interactionReservationId: "interaction-1" });

		expect(events).toEqual(["start-browser", "open-target"]);
		expect(result.lease.actionCounts).toMatchObject({ targetCreations: 1, navigations: 1 });
	});

	test("closes only its newly created target when immediate lease reservation fails", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-existing",
		});
		await registry.reserve({
			scope,
			targetId: "target-1",
			workload: { kind: "conversation", conversationId: "conversation-existing" },
			operationId: "operation-existing",
			now: "2026-09-24T12:00:00.000Z",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
		});
		const closeTarget = vi.fn(async () => undefined);
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "new-conversation", reservationId: "reservation-new" },
			operationId: "operation-new",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			openTarget: async () => ({ targetId: "target-1", url: "https://chatgpt.com/" }),
			closeTarget,
		});

		await expect(provision({ interactionReservationId: "interaction-1" })).rejects.toThrow(
			"target-owned",
		);
		expect(closeTarget).toHaveBeenCalledWith({
			host: "127.0.0.1",
			port: 45011,
			targetId: "target-1",
		});
	});

	test("closes and releases its created target when creation accounting fails", async () => {
		const baseRegistry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-1",
		});
		const registry = new Proxy(baseRegistry, {
			get(target, property, receiver) {
				if (property === "recordTargetAction") {
					return async () => ({
						ok: false as const,
						conflict: { kind: "invalid-transition" as const, lease: (await target.list())[0] },
					});
				}
				const value = Reflect.get(target, property, receiver) as unknown;
				return typeof value === "function" ? value.bind(target) : value;
			},
		}) as BrowserTabLeaseRegistry;
		const closeTarget = vi.fn(async () => undefined);
		const provision = createChatgptTabProvisioner({
			registry,
			scope,
			workload: { kind: "new-conversation", reservationId: "reservation-new" },
			operationId: "operation-new",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-24T12:00:01.000Z"),
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			openTarget: async () => ({ targetId: "target-new", url: "https://chatgpt.com/" }),
			closeTarget,
		});

		await expect(provision({ interactionReservationId: "interaction-1" })).rejects.toThrow(
			"target creation accounting failed",
		);
		expect(closeTarget).toHaveBeenCalledOnce();
		expect(await baseRegistry.list()).toEqual([
			expect.objectContaining({
				state: "released",
				lossReason: "provisioning-failed",
				finalDisposition: "closed",
				actionCounts: expect.objectContaining({ closes: 1 }),
			}),
		]);
	});
});
