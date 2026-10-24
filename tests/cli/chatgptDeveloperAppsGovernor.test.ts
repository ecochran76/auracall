// biome-ignore-all lint/style/useNamingConvention: CDP domain names are protocol-defined.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { openOrReuseChromeTarget } from "../../packages/browser-service/src/chromeLifecycle.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { runConfiguredChatgptUtilityOperation } from "../../src/browser/configuredChatgptUtilityAffinity.js";
import { ChatgptService } from "../../src/browser/llmService/providers/chatgptService.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";
import { runChatgptDeveloperAppOperationForCli } from "../../src/cli/chatgptDeveloperAppsCommand.js";

const transport = vi.hoisted(() => ({
	tabs: [] as import("chrome-remote-interface").Target[],
	create: vi.fn(async () => ({
		id: "created-tab",
		type: "page",
		url: "https://chatgpt.com/",
		description: "",
		title: "Fixture",
		devtoolsFrontendUrl: "",
		webSocketDebuggerUrl: "ws://fixture.invalid/devtools/page/created-tab",
	})),
}));
vi.mock("chrome-remote-interface", () => ({
	default: Object.assign(
		vi.fn(async () => ({ Page: { enable: async () => {} }, close: async () => {} })),
		{ List: vi.fn(async () => transport.tabs), New: transport.create },
	),
}));

test.each([
	["list", true],
	["list", false],
	["refresh-tools", true],
] as const)("apps %s configuredIdentity=%s acquires governed custody before first-tab creation in serialized mode", async (action, knownIdentity) => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auracall-app-governor-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		const config = {
			auracallProfile: "fixture",
			browser: { tabConcurrencyMode: "serialized" },
			services: {
				chatgpt: {
					identity: knownIdentity ? { email: "operator@example.test" } : undefined,
					liveFollow: { maxBrowserInteractionsPerMinute: 60000 },
				},
			},
		} as never;
		const endpoint = { host: "127.0.0.1", port: 45011, managedBrowserProfile: "/fixture/managed" };
		const service = ChatgptService.create(config, {
			browserService: {
				resolveServiceTarget: async () => endpoint,
				getMutationAuditSink: () => async () => undefined,
			} as never,
			runUtilityOperation: (input) =>
				runConfiguredChatgptUtilityOperation({
					...input,
					deps: {
						listTargets: async () => transport.tabs,
						openTarget: async () => {
							const tab = await transport.create();
							transport.tabs.push(tab);
							return tab;
						},
						closeTarget: async () => undefined,
					},
				}),
		});
		const close = vi.fn(async () => {});
		const result = await runChatgptDeveloperAppOperationForCli(
			config,
			action === "list"
				? { action }
				: {
						action,
						app: "Fixture",
						serverUrl: "https://mcp.example.test/",
						expectedAccount: "operator@example.test",
						confirmed: true,
					},
			{
				createBrowser: async () =>
					({
						userConfig: config,
						runUtilityBrowserOperation: service.runUtilityBrowserOperation.bind(service),
						getUserIdentity: async (options: BrowserProviderListOptions) => {
							await openOrReuseChromeTarget(45011, "https://chatgpt.com/", {
								host: "127.0.0.1",
								reusePolicy: "exact",
								suppressFocus: true,
								navigateReusedTargets: false,
								cleanupExistingTargets: false,
								providerTrafficGovernor: options.providerTrafficGovernor,
								providerTrafficAuthorityFactory: options.providerTrafficAuthorityFactory,
								providerTrafficRequired: options.providerTrafficRequired,
								mutationSource: "provider:chatgpt:connect-tab",
							});
							return { email: "operator@example.test" };
						},
						connectDevTools: vi.fn(),
					}) as never,
				createAdapter: (browser) =>
					({
						readState: async () => ({
							account: await browser.getUserIdentity(),
							developerMode: false,
							inventoryComplete: true,
							apps: [
								{
									pluginId: "plugin_fixture",
									appIds: ["fixture"],
									name: "Fixture",
									endpoint: "https://mcp.example.test/",
								},
							],
							observedAt: new Date().toISOString(),
						}),
						refreshTools: async (app: unknown, endpoint: string) => {
							await browser.getUserIdentity();
							expect(app).toMatchObject({ pluginId: "plugin_fixture" });
							expect(endpoint).toBe("https://mcp.example.test/");
							return { status: "completed", message: "refreshed" };
						},
						close,
					}) as never,
			},
		);
		expect(result).toMatchObject({ action, status: action === "list" ? "observed" : "completed" });
		expect(transport.create).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
		transport.tabs = [];
		await expect(
			openOrReuseChromeTarget(45011, "https://chatgpt.com/", {
				host: "127.0.0.1",
				reusePolicy: "new",
				cleanupExistingTargets: false,
				providerTrafficRequired: true,
				mutationSource: "provider:chatgpt:connect-tab",
			}),
		).rejects.toThrow(
			"Provider traffic governor is required before physical action: provider:chatgpt:connect-tab.",
		);
		expect(transport.create).toHaveBeenCalledOnce();
	} finally {
		transport.tabs = [];
		transport.create.mockClear();
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});
