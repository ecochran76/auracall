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
			expect.objectContaining({
				state: "released",
				lossReason: "provisioning-failed",
				finalDisposition: "closed",
				actionCounts: expect.objectContaining({ closes: 1 }),
			}),
		]);
	});
});
