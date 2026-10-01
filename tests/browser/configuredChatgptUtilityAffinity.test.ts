import { describe, expect, test, vi } from "vitest";

import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { ProviderInteractionGovernorClosedError } from "../../packages/browser-service/src/service/ledgerInteractionGovernor.js";
import type { BrowserMutationRecord } from "../../packages/browser-service/src/service/mutationDispatcher.js";
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
	test("adopts the existing exact Library target without opening or closing a page", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({
			createLeaseId: () => "lease-library",
		});
		const ledger = createInMemoryProviderInteractionLedger();
		const openTarget = vi.fn();
		const closeTarget = vi.fn();
		const records: BrowserMutationRecord[] = [];
		const run = vi.fn(async (options: BrowserProviderListOptions) => {
			const action = await options.providerTrafficGovernor?.begin({
				kind: "navigate",
				interactionClass: "conversation-read",
				source: "history-materialization:fixture",
			});
			await action?.settle({ outcome: "succeeded" });
			return options.tabTargetId;
		});

		await expect(
			runConfiguredChatgptUtilityOperation({
				userConfig: {
					auracallProfile: "runtime-1",
					browser: {
						tabConcurrencyMode: "tab-affinity",
						chatgptUrl: "https://chatgpt.com/",
					},
					profiles: {
						"runtime-1": {
							services: { chatgpt: { identity: { accountId: "account-1" } } },
						},
					},
				} as never,
				browserService: {
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "library-files",
				mutability: "read-only",
				options: {
					configuredUrl: "https://chatgpt.com/library",
					preserveActiveTab: true,
					requireExistingTarget: true,
					providerTrafficContext: {
						trafficPhase: "materialization",
						workKey: "scope:history-materialization",
					},
				},
				buildListOptions: async (options) => options,
				run,
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: vi.fn(async () => [
						{ id: "blank-target", url: "about:blank" },
						{ id: "library-target", url: "https://chatgpt.com/library?fixture=1" },
					]) as never,
					openTarget: openTarget as never,
					closeTarget,
					mutationAudit: async (record) => {
						records.push(record);
					},
				},
			}),
		).resolves.toBe("library-target");

		expect(run).toHaveBeenCalledWith(
			expect.objectContaining({
				tabTargetId: "library-target",
				tabUrl: "https://chatgpt.com/library?fixture=1",
				preserveActiveTab: true,
				providerTrafficGovernor: expect.objectContaining({
					attribution: expect.objectContaining({
						operationId: "library-files",
						tabLeaseId: "lease-library",
					}),
				}),
			}),
		);
		expect(openTarget).not.toHaveBeenCalled();
		expect(closeTarget).not.toHaveBeenCalled();
		expect(records).toEqual([
			expect.objectContaining({
				phase: "start",
				trafficPhase: "materialization",
				workKey: "scope:history-materialization",
			}),
			expect.objectContaining({
				phase: "complete",
				trafficPhase: "materialization",
				workKey: "scope:history-materialization",
			}),
		]);
	});

	test("fails closed without creating a target when no exact Library target exists", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry();
		const ledger = createInMemoryProviderInteractionLedger();
		const openTarget = vi.fn();
		await expect(
			runConfiguredChatgptUtilityOperation({
				userConfig: {
					auracallProfile: "runtime-1",
					browser: {
						tabConcurrencyMode: "tab-affinity",
						chatgptUrl: "https://chatgpt.com/",
					},
					profiles: {
						"runtime-1": {
							services: { chatgpt: { identity: { accountId: "account-1" } } },
						},
					},
				} as never,
				browserService: {
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "library-files",
				mutability: "read-only",
				options: {
					configuredUrl: "https://chatgpt.com/library",
					requireExistingTarget: true,
				},
				buildListOptions: async (options) => options,
				run: vi.fn(),
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: vi.fn(async () => [{ id: "blank-target", url: "about:blank" }]) as never,
					openTarget: openTarget as never,
					closeTarget: vi.fn(),
				},
			}),
		).rejects.toThrow("no existing compatible target");
		expect(openTarget).not.toHaveBeenCalled();
	});

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

	test("lets a job-owned utility tab navigate when the caller explicitly allows it", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger({
			createReservationId: () => "reservation-1",
		});
		const run = vi.fn(async (options: BrowserProviderListOptions) => options.preserveActiveTab);

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
				utilityId: "history-materialization:hmj-1",
				mutability: "read-only",
				options: { allowNavigation: true },
				buildListOptions: async (options) => options,
				run,
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: vi.fn(async () => []) as never,
					openTarget: vi.fn(async () => ({ id: "utility-target" })) as never,
					closeTarget: vi.fn(),
				},
			}),
		).resolves.toBe(false);
	});

	test("closes the interaction governor when the utility operation returns", async () => {
		const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
		const ledger = createInMemoryProviderInteractionLedger();
		let escapedOptions: BrowserProviderListOptions | undefined;

		await runConfiguredChatgptUtilityOperation({
			userConfig,
			browserService: {
				resolveServiceTarget: vi.fn().mockResolvedValue({
					host: "127.0.0.1",
					port: 45011,
					managedBrowserProfile: "/managed/runtime-1/chatgpt",
				}),
			} as never,
			utilityId: "history-materialization:hmj-1",
			mutability: "read-only",
			buildListOptions: async (options) => options,
			run: async (options) => {
				escapedOptions = options;
				return "complete";
			},
			deps: {
				createRuntime: () => ({ registry, ledger }) as never,
				listTargets: vi.fn(async () => []) as never,
				openTarget: vi.fn(async () => ({ id: "utility-target" })) as never,
				closeTarget: vi.fn(),
			},
		});

		await expect(
			escapedOptions?.interactionGovernor?.beforeInteraction("renavigation"),
		).rejects.toBeInstanceOf(ProviderInteractionGovernorClosedError);
		expect(await ledger.list()).toEqual([]);
	});

	test("preserves a provider-stage error when governor settlement does not settle", async () => {
		vi.useFakeTimers();
		try {
			const cleanupPhases: string[] = [];
			const registry = createInMemoryBrowserTabLeaseRegistry({ createLeaseId: () => "lease-1" });
			const ledger = createInMemoryProviderInteractionLedger({
				createReservationId: () => "reservation-1",
			});
			const settle = vi
				.spyOn(ledger, "settle")
				.mockImplementation(() => new Promise(() => undefined));
			const operation = runConfiguredChatgptUtilityOperation({
				userConfig,
				browserService: {
					resolveServiceTarget: vi.fn().mockResolvedValue({
						host: "127.0.0.1",
						port: 45011,
						managedBrowserProfile: "/managed/runtime-1/chatgpt",
					}),
				} as never,
				utilityId: "library-files",
				mutability: "read-only",
				options: {
					libraryInventoryLifecycle: {
						onStageEntered: vi.fn(),
						onCleanupPhase: (phase) => cleanupPhases.push(phase),
					},
				},
				buildListOptions: async (options) => options,
				run: async (options) => {
					await options.interactionGovernor?.beforeInteraction("generic");
					throw new Error("ChatGPT Library inventory stage dom-inventory timed out after 10000ms.");
				},
				deps: {
					createRuntime: () => ({ registry, ledger }) as never,
					listTargets: vi.fn(async () => []) as never,
					openTarget: vi.fn(async () => ({ id: "utility-target" })) as never,
					closeTarget: vi.fn(),
				},
			});
			const rejection = expect(operation).rejects.toThrow(
				"ChatGPT Library inventory stage dom-inventory timed out after 10000ms.",
			);

			await vi.advanceTimersByTimeAsync(5_000);
			await rejection;

			expect(settle).toHaveBeenCalledOnce();
			expect((await registry.list())[0]).toMatchObject({
				state: "active",
				targetId: "utility-target",
			});
			expect(cleanupPhases).toEqual([
				"read-rejected",
				"affinity-settlement-started",
				"affinity-settlement-timed-out",
			]);
		} finally {
			vi.useRealTimers();
		}
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
