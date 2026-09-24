import { describe, expect, test, vi } from "vitest";

import {
	type BrowserTabLeaseRegistry,
	createInMemoryBrowserTabLeaseRegistry,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import {
	acquireEphemeralBrowserTab,
	acquireLiveFollowCrawlerTab,
} from "../../src/accountMirror/liveFollowTabCoordinator.js";

const scope = {
	runtimeProfileId: "runtime-1",
	managedBrowserProfile: "/managed/chatgpt",
	service: "chatgpt",
	tenantKey: "tenant-1",
};

describe("live-follow crawler tab coordinator", () => {
	test("creates one dedicated crawler target and reuses it on the next pass", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const openTarget = vi.fn(async () => ({
			targetId: "crawler-1",
			url: "https://chatgpt.com/",
		}));
		const common = {
			registry,
			scope,
			operationId: "completion-1",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			inspectTarget: vi.fn(async () => ({ url: "https://chatgpt.com/c/observed" })),
			openTarget,
			closeTarget: vi.fn(),
		};
		const first = await acquireLiveFollowCrawlerTab({
			...common,
			now: () => new Date("2026-09-24T12:00:00.000Z"),
		});
		await registry.idle({
			claim: first.claim,
			now: "2026-09-24T12:00:01.000Z",
			effectState: "settled",
		});
		const second = await acquireLiveFollowCrawlerTab({
			...common,
			now: () => new Date("2026-09-24T12:00:02.000Z"),
		});

		expect(second.lease).toMatchObject({
			leaseId: "lease-1",
			targetId: "crawler-1",
			workload: { kind: "live-follow", operationId: "completion-1" },
			actionCounts: { targetCreations: 1, adoptions: 1 },
		});
		expect(openTarget).toHaveBeenCalledOnce();
	});

	test("uses the same exact-target lifecycle for bounded ephemeral work", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-utility",
		});
		const tab = await acquireEphemeralBrowserTab({
			registry,
			scope,
			operationId: "utility-1",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			inspectTarget: vi.fn(),
			openTarget: vi.fn(async () => ({ targetId: "utility-tab", url: "https://chatgpt.com/" })),
			closeTarget: vi.fn(),
		});

		expect(tab.lease).toMatchObject({
			targetId: "utility-tab",
			workload: { kind: "ephemeral", operationId: "utility-1" },
		});
	});

	test("closes and releases a new crawler when creation accounting fails", async () => {
		const baseRegistry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-crawler",
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

		await expect(
			acquireLiveFollowCrawlerTab({
				registry,
				scope,
				operationId: "completion-1",
				targetUrl: "https://chatgpt.com/",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
				now: () => new Date("2026-09-24T12:00:00.000Z"),
				resolveExistingEndpoint: async () => ({
					host: "127.0.0.1",
					port: 45011,
					managedBrowserProfile: scope.managedBrowserProfile,
				}),
				startBrowser: vi.fn(),
				inspectTarget: vi.fn(),
				openTarget: vi.fn(async () => ({
					targetId: "crawler-1",
					url: "https://chatgpt.com/",
				})),
				closeTarget,
			}),
		).rejects.toThrow("crawler creation accounting failed");

		expect(closeTarget).toHaveBeenCalledOnce();
		expect(await baseRegistry.list()).toEqual([
			expect.objectContaining({ state: "released", finalDisposition: "already-missing" }),
		]);
	});
});
