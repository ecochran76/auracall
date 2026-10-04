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
	test("adopts the only compatible cold-start target instead of opening a second page", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-cold-start",
		});
		const openTarget = vi.fn();
		const tab = await acquireLiveFollowCrawlerTab({
			registry,
			scope,
			operationId: "completion-cold-start",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			now: () => new Date("2026-09-25T12:00:00.000Z"),
			resolveExistingEndpoint: async () => null,
			startBrowser: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			listTargets: async () => [
				{ targetId: "startup-page", url: "https://chatgpt.com/" },
				{ targetId: "extension-page", url: "chrome-extension://fixture/background.html" },
			],
			inspectTarget: vi.fn(),
			openTarget,
			closeTarget: vi.fn(),
		});

		expect(tab.lease).toMatchObject({
			targetId: "startup-page",
			workload: { kind: "live-follow", operationId: "completion-cold-start" },
			actionCounts: { targetCreations: 0, adoptions: 1 },
		});
		expect(openTarget).not.toHaveBeenCalled();
	});

	test("fails closed when cold start exposes multiple compatible unowned targets", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-ambiguous",
		});
		const openTarget = vi.fn();

		await expect(
			acquireLiveFollowCrawlerTab({
				registry,
				scope,
				operationId: "completion-ambiguous",
				targetUrl: "https://chatgpt.com/",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
				resolveExistingEndpoint: async () => null,
				startBrowser: async () => ({
					host: "127.0.0.1",
					port: 45011,
					managedBrowserProfile: scope.managedBrowserProfile,
				}),
				listTargets: async () => [
					{ targetId: "startup-page-1", url: "https://chatgpt.com/" },
					{ targetId: "startup-page-2", url: "https://chatgpt.com/c/restored" },
				],
				inspectTarget: vi.fn(),
				openTarget,
				closeTarget: vi.fn(),
			}),
		).rejects.toThrow("multiple compatible unowned targets");

		expect(openTarget).not.toHaveBeenCalled();
		expect(await registry.list()).toEqual([]);
	});

	test("creates one governed owned crawler without adopting or closing restored tabs", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const closeTarget = vi.fn();
		const openTarget = vi.fn(async () => ({
			targetId: "owned-crawler",
			url: "https://chatgpt.com/",
		}));
		const settle = vi.fn(async () => undefined);
		const begin = vi.fn(async () => ({ settle }));
		const tab = await acquireLiveFollowCrawlerTab({
			registry,
			scope,
			operationId: "restored-startup",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			coldStartTargetPolicy: "create",
			resolveExistingEndpoint: async () => null,
			startBrowser: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			listTargets: async () => [
				{ targetId: "restored-1", url: "https://chatgpt.com/c/retained" },
				{ targetId: "restored-2", url: "https://chatgpt.com/c/retained" },
				{ targetId: "startup-blank", url: "about:blank" },
			],
			preLeaseProviderTrafficGovernor: { begin } as never,
			inspectTarget: vi.fn(),
			openTarget,
			closeTarget,
		});
		expect(tab.lease.targetId).toBe("owned-crawler");
		expect(openTarget).toHaveBeenCalledTimes(1);
		expect(begin).toHaveBeenCalledTimes(1);
		expect(settle).toHaveBeenCalledWith(
			expect.objectContaining({ outcome: "succeeded", targetId: "owned-crawler" }),
		);
		expect(closeTarget).not.toHaveBeenCalled();
		expect(await registry.list()).toHaveLength(1);
	});

	test("closes and proves absence of one incompatible startup page before opening the crawler", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-after-blank",
		});
		const closeTarget = vi.fn(async () => undefined);
		const inspectTarget = vi.fn(async () => null);
		const openTarget = vi.fn(async () => ({
			targetId: "crawler-after-blank",
			url: "https://chatgpt.com/",
		}));

		const tab = await acquireLiveFollowCrawlerTab({
			registry,
			scope,
			operationId: "completion-after-blank",
			targetUrl: "https://chatgpt.com/",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => null,
			startBrowser: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			listTargets: async () => [{ targetId: "startup-blank", url: "about:blank" }],
			inspectTarget,
			openTarget,
			closeTarget,
		});

		expect(closeTarget).toHaveBeenCalledWith({
			host: "127.0.0.1",
			port: 45011,
			targetId: "startup-blank",
		});
		expect(inspectTarget).toHaveBeenCalledWith(
			expect.objectContaining({ port: 45011 }),
			"startup-blank",
		);
		expect(openTarget).toHaveBeenCalledOnce();
		expect(tab.lease).toMatchObject({
			targetId: "crawler-after-blank",
			actionCounts: { targetCreations: 1, adoptions: 0, closes: 0 },
		});
	});

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

	test.each([
		"existing",
		"cold",
	])("rejects unplanned pre-lease target creation for %s browser before opening a page", async (mode) => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const openTarget = vi.fn();
		const begin = vi.fn(async () => {
			throw new Error("pre-lease target budget exhausted");
		});

		await expect(
			acquireLiveFollowCrawlerTab({
				registry,
				scope,
				operationId: "completion-pre-lease-budget",
				targetUrl: "https://chatgpt.com/",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
				coldStartTargetPolicy: "create",
				resolveExistingEndpoint: async () =>
					mode === "cold"
						? null
						: {
								host: "127.0.0.1",
								port: 45011,
								managedBrowserProfile: scope.managedBrowserProfile,
							},
				startBrowser: async () => ({
					host: "127.0.0.1",
					port: 45011,
					managedBrowserProfile: scope.managedBrowserProfile,
				}),
				inspectTarget: vi.fn(),
				openTarget,
				closeTarget: vi.fn(),
				preLeaseProviderTrafficGovernor: {
					attribution: {} as never,
					begin,
				},
			}),
		).rejects.toThrow("pre-lease target budget exhausted");

		expect(begin).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "target-open-or-reuse",
				interactionClass: "renavigation",
				reused: false,
			}),
		);
		expect(openTarget).not.toHaveBeenCalled();
		expect(await registry.list()).toEqual([]);
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

	test("replaces a retained blank lease by adopting an existing exact target", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: (() => {
				let index = 0;
				return () => `lease-${++index}`;
			})(),
		});
		const common = {
			registry,
			scope,
			operationId: "library-files",
			idleTtlMs: 60_000,
			absoluteTtlMs: 3_600_000,
			resolveExistingEndpoint: async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: scope.managedBrowserProfile,
			}),
			startBrowser: vi.fn(),
			closeTarget: vi.fn(),
		};
		const stale = await acquireEphemeralBrowserTab({
			...common,
			targetUrl: "https://chatgpt.com/library",
			inspectTarget: vi.fn(),
			openTarget: vi.fn(async () => ({ targetId: "blank-target", url: "about:blank" })),
		});
		await registry.idle({
			claim: stale.claim,
			now: "2026-09-27T12:00:01.000Z",
			effectState: "settled",
		});
		const openTarget = vi.fn();

		const adopted = await acquireEphemeralBrowserTab({
			...common,
			targetUrl: "https://chatgpt.com/library",
			requireExistingTarget: true,
			listTargets: async () => [
				{ targetId: "blank-target", url: "about:blank" },
				{ targetId: "library-target", url: "https://chatgpt.com/library" },
			],
			inspectTarget: vi.fn(async (_endpoint, targetId) =>
				targetId === "blank-target" ? { url: "about:blank" } : null,
			),
			openTarget,
		});

		expect(adopted.lease).toMatchObject({
			targetId: "library-target",
			actionCounts: { targetCreations: 0, adoptions: 1 },
		});
		expect(openTarget).not.toHaveBeenCalled();
		expect(common.closeTarget).toHaveBeenCalledWith({
			host: "127.0.0.1",
			port: 45011,
			targetId: "blank-target",
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
			expect.objectContaining({
				state: "released",
				lossReason: "provisioning-failed",
				finalDisposition: "closed",
				actionCounts: expect.objectContaining({ closes: 1 }),
			}),
		]);
	});
});
