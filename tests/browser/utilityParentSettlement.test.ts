import { describe, expect, test, vi } from "vitest";
import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { runConfiguredChatgptUtilityOperation } from "../../src/browser/configuredChatgptUtilityAffinity.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

function fixture(backendRequestLimit: number | undefined) {
	const registry = createInMemoryBrowserTabLeaseRegistry(),
		ledger = createInMemoryProviderInteractionLedger();
	const openTarget = vi.fn(async () => {
		throw Error("Existing owned target should be reused");
	});
	const userConfig = {
		auracallProfile: "runtime-1",
		browser: { tabConcurrencyMode: "tab-affinity", chatgptUrl: "https://chatgpt.com/" },
		profiles: { "runtime-1": { services: { chatgpt: { identity: { accountId: "account-1" } } } } },
	} as never;
	const invoke = (body?: (options: BrowserProviderListOptions) => Promise<void>) =>
		runConfiguredChatgptUtilityOperation({
			userConfig,
			browserService: {
				resolveServiceTarget: async () => ({
					host: "127.0.0.1",
					port: 45015,
					managedBrowserProfile: "/managed/runtime-1/chatgpt",
				}),
			} as never,
			utilityId: "same-caller",
			backendRequestLimit,
			mutability: "read-only",
			options: { requireExistingTarget: true },
			buildListOptions: async (options) => options,
			run: async (options) => {
				await options.interactionGovernor?.beforeInteraction("generic");
				await body?.(options);
				return options.tabTargetId;
			},
			deps: {
				createRuntime: () => ({ registry, ledger }) as never,
				listTargets: async () =>
					[{ id: "utility-target", type: "page", url: "https://chatgpt.com/" }] as never,
				openTarget,
				mutationAudit: async () => undefined,
			},
		});
	return { registry, ledger, invoke, openTarget };
}

describe("utility parent settlement", () => {
	test.each([
		undefined,
		100,
	])("successive utility reads settle parent interactions with backend budget %s", async (limit) => {
		const f = fixture(limit);
		expect(await f.invoke()).toBe("utility-target");
		await expect(f.invoke()).resolves.toBe("utility-target");
		expect((await f.registry.list())[0].effectState).toBe("settled");
		expect(f.openTarget).not.toHaveBeenCalled();
	});
	test("completed backend reads permit the next utility call", async () => {
		const f = fixture(100);
		expect(
			await f.invoke(async (options) => {
				await options.providerTrafficGovernor?.admitBackendRequest?.(
					`sha256:${"a".repeat(64)}`,
					async () => {},
				);
			}),
		).toBe("utility-target");
		await expect(f.invoke()).resolves.toBe("utility-target");
		expect((await f.ledger.list()).filter((r) => r.interactionClass === "backend-request")).toEqual(
			[expect.objectContaining({ state: "settled", effectState: "settled" })],
		);
	});
	test("a real unsettled backend request keeps its utility lease fenced", async () => {
		const f = fixture(100);
		let entered!: () => void,
			failed!: (error: unknown) => void,
			release!: () => void,
			pending: Promise<unknown> | undefined;
		const started = new Promise<void>((r, reject) => {
				entered = r;
				failed = reject;
			}),
			held = new Promise<void>((r) => {
				release = r;
			});
		try {
			await f.invoke(async (options) => {
				if (!options.providerTrafficGovernor?.admitBackendRequest)
					throw Error("Expected request authority");
				pending = options.providerTrafficGovernor?.admitBackendRequest(
					`sha256:${"b".repeat(64)}`,
					async () => {
						entered();
						await held;
					},
				);
				void pending.catch(failed);
				await started;
			});
			expect((await f.registry.list())[0].effectState).toBe("outcome-unknown");
			await expect(f.invoke()).rejects.toThrow(
				"Live-follow crawler lease acquisition failed: process-owned.",
			);
			expect(f.openTarget).not.toHaveBeenCalled();
		} finally {
			release();
			await pending;
		}
	});
});
