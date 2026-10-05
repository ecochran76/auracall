import { beforeEach, describe, expect, test, vi } from "vitest";

import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";

const chromeLifecycleMocks = vi.hoisted(() => ({
	closeRemoteChromeTarget: vi.fn(async () => undefined),
	listChromeTargets: vi.fn(),
	openChromeTarget: vi.fn(),
}));

vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../packages/browser-service/src/chromeLifecycle.js")
	>()),
	closeRemoteChromeTarget: chromeLifecycleMocks.closeRemoteChromeTarget,
	listChromeTargets: chromeLifecycleMocks.listChromeTargets,
	openChromeTarget: chromeLifecycleMocks.openChromeTarget,
}));

import { runConfiguredChatgptUtilityOperation } from "../../src/browser/configuredChatgptUtilityAffinity.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

const userConfig = {
	auracallProfile: "runtime-1",
	browser: { tabConcurrencyMode: "tab-affinity", chatgptUrl: "https://chatgpt.com/" },
	profiles: {
		"runtime-1": {
			services: { chatgpt: { identity: { accountId: "account-1" } } },
		},
	},
} as never;

describe("configured ChatGPT utility production target wiring", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		chromeLifecycleMocks.listChromeTargets.mockResolvedValue([
			{ id: "root-target", type: "page", url: "https://chatgpt.com/" },
			{ id: "library-target", type: "page", url: "https://chatgpt.com/library" },
		]);
	});

	test("settles a post-acquire failure so the next process can adopt the same Library target", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: (() => {
				let index = 0;
				return () => `lease-${++index}`;
			})(),
		});
		const ledger = createInMemoryProviderInteractionLedger();
		const browserService = {
			resolveServiceTarget: vi.fn().mockResolvedValue({
				host: "127.0.0.1",
				port: 45015,
				managedBrowserProfile: "/managed/runtime-1/chatgpt",
			}),
		} as never;
		const common = {
			userConfig,
			browserService,
			mutability: "read-only" as const,
			options: {
				configuredUrl: "https://chatgpt.com/library",
				preserveActiveTab: true,
				requireExistingTarget: true,
			},
			deps: {
				createRuntime: () => ({ registry, ledger }) as never,
			},
		};

		await expect(
			runConfiguredChatgptUtilityOperation({
				...common,
				utilityId: "chatgpt-service-first-process",
				buildListOptions: async () => {
					throw new Error("fixture buildListOptions failed after acquisition");
				},
				run: vi.fn(),
			}),
		).rejects.toThrow("fixture buildListOptions failed after acquisition");
		expect((await registry.list()).at(-1)).toMatchObject({
			state: "idle",
			targetId: "library-target",
		});

		await expect(
			runConfiguredChatgptUtilityOperation({
				...common,
				utilityId: "chatgpt-service-second-process",
				buildListOptions: async (options: BrowserProviderListOptions) => options,
				run: async (options) => options.tabTargetId,
			}),
		).resolves.toBe("library-target");

		expect(chromeLifecycleMocks.listChromeTargets).toHaveBeenCalledWith(45015, "127.0.0.1");
		expect(chromeLifecycleMocks.openChromeTarget).not.toHaveBeenCalled();
		expect(chromeLifecycleMocks.closeRemoteChromeTarget).not.toHaveBeenCalled();
	});

	test("recovers a dead-owner lease before adopting the exact existing Library target", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: (() => {
				let index = 0;
				return () => `lease-${++index}`;
			})(),
			ownerIdentity: { processId: 46827, instanceId: "previous-process" },
		});
		const stranded = await registry.reserve({
			scope: {
				runtimeProfileId: "runtime-1",
				managedBrowserProfile: "/managed/runtime-1/chatgpt",
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			},
			targetId: "library-target",
			workload: { kind: "ephemeral", operationId: "chatgpt-service-previous-process" },
			operationId: "chatgpt-service-previous-process",
			now: "2026-09-28T02:03:32.000Z",
			idleTtlMs: 5 * 60_000,
			absoluteTtlMs: 60 * 60_000,
			targetFingerprint: "https://chatgpt.com/",
		});
		expect(stranded.ok).toBe(true);
		const ledger = createInMemoryProviderInteractionLedger();

		await expect(
			runConfiguredChatgptUtilityOperation({
				userConfig,
				browserService: {
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 45015,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "chatgpt-service-current-process",
				mutability: "read-only",
				options: {
					configuredUrl: "https://chatgpt.com/library",
					preserveActiveTab: true,
					requireExistingTarget: true,
				},
				buildListOptions: async (options) => options,
				run: async (options) => options.tabTargetId,
				now: () => new Date("2026-09-28T02:08:32.000Z"),
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					currentOwner: { processId: 90001, instanceId: "current-process" },
					isOwnerAlive: () => false,
				},
			}),
		).resolves.toBe("library-target");

		const leases = await registry.list();
		expect(leases[0]).toMatchObject({
			state: "released",
			finalDisposition: "preserved",
			lossReason: "restart-unverified",
		});
		expect(
			leases.find((lease) => lease.state === "idle" && lease.targetId === "library-target"),
		).toMatchObject({
			state: "idle",
			targetId: "library-target",
			workload: { kind: "ephemeral", operationId: "chatgpt-service-current-process" },
		});
		expect(chromeLifecycleMocks.openChromeTarget).not.toHaveBeenCalled();
		expect(chromeLifecycleMocks.closeRemoteChromeTarget).not.toHaveBeenCalled();
	});
});
