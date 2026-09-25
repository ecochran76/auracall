import { describe, expect, test, vi } from "vitest";

import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
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

describe("configured ChatGPT utility affinity", () => {
	test("reuses one exact utility target and accounts each read", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: (() => {
				let index = 0;
				return () => `reservation-${++index}`;
			})(),
		});
		const openTarget = vi.fn(async () => ({ id: "utility-target" }));
		const listTargets = vi.fn(async () => [
			{ id: "utility-target", url: "https://chatgpt.com/" },
		]) as never;
		const browserService = {
			resolveServiceTarget: vi.fn().mockResolvedValue({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: "/managed/runtime-1/chatgpt",
			}),
		} as never;
		const run = vi.fn(async (options: BrowserProviderListOptions) => {
			await options.interactionGovernor?.beforeInteraction("generic");
			return options.tabTargetId;
		});
		const common = {
			userConfig,
			browserService,
			utilityId: "utility-1",
			mutability: "read-only" as const,
			buildListOptions: async (options: BrowserProviderListOptions) => options,
			run,
			deps: {
				createRuntime: () => ({ registry, ledger }) as never,
				listTargets,
				openTarget: openTarget as never,
				closeTarget: vi.fn(),
			},
		};

		await expect(runConfiguredChatgptUtilityOperation(common)).resolves.toBe("utility-target");
		await expect(runConfiguredChatgptUtilityOperation(common)).resolves.toBe("utility-target");

		expect(openTarget).toHaveBeenCalledOnce();
		expect(run).toHaveBeenCalledTimes(2);
		expect(run).toHaveBeenCalledWith(
			expect.objectContaining({
				disableProviderMutationRetry: false,
				preserveInteractionGovernorForProviderSession: true,
			}),
		);
		expect(await registry.list()).toEqual([
			expect.objectContaining({
				state: "idle",
				workload: { kind: "ephemeral", operationId: "utility-1" },
				actionCounts: expect.objectContaining({ targetCreations: 1, adoptions: 1 }),
			}),
		]);
		expect(await ledger.list()).toEqual([
			expect.objectContaining({ state: "settled", interactionClass: "list-read" }),
			expect.objectContaining({ state: "settled", interactionClass: "list-read" }),
		]);
	});

	test("marks a failed provider mutation outcome unknown without retrying", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "reservation-1",
		});
		const run = vi.fn(async (options: BrowserProviderListOptions) => {
			await options.interactionGovernor?.beforeInteraction("upload-submit");
			throw new Error("connection lost after click");
		});

		await expect(
			runConfiguredChatgptUtilityOperation({
				userConfig,
				browserService: {
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "utility-1",
				mutability: "provider-mutating",
				buildListOptions: async (options) => options,
				run,
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: vi.fn(async () => []) as never,
					openTarget: vi.fn(async () => ({ id: "utility-target" })) as never,
					closeTarget: vi.fn(),
				},
			}),
		).rejects.toThrow("connection lost after click");

		expect(run).toHaveBeenCalledOnce();
		expect(run).toHaveBeenCalledWith(
			expect.objectContaining({ disableProviderMutationRetry: true }),
		);
		expect((await registry.list())[0]).toMatchObject({
			state: "idle",
			effectState: "outcome-unknown",
		});
		expect((await ledger.list())[0]).toMatchObject({
			state: "settled",
			effectState: "outcome-unknown",
			outcome: "failed",
		});
	});
});
