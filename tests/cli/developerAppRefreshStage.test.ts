import { expect, it } from "vitest";
import { createChatgptDeveloperAppBrowserAdapter } from "../../src/browser/providers/chatgptDeveloperApps.js";
import {
	formatChatgptDeveloperAppListFailure,
	runChatgptDeveloperAppOperationForCli,
} from "../../src/cli/chatgptDeveloperAppsCommand.js";

it("attributes a real refresh adapter failure to refresh-tools after API inventory", async () => {
	const config = { auracallProfile: "fixture", browser: {} } as never;
	let inventoryOptions: unknown;
	let refreshAttachmentReached = false;
	const browser = {
		userConfig: config,
		getUserIdentity: async () => ({ email: "fixture@example.test" }),
		connectDevTools: async () => {
			refreshAttachmentReached = true;
			throw new Error("fixture refresh attachment failure");
		},
	};
	let failure: unknown;
	try {
		await runChatgptDeveloperAppOperationForCli(
			config,
			{
				action: "refresh-tools",
				app: "fixture",
				serverUrl: "https://example.test/mcp",
				expectedAccount: "fixture@example.test",
				confirmed: true,
			},
			{
				createBrowser: async () => browser,
				createAdapter: (scoped, factory, options) => {
					const adapter = createChatgptDeveloperAppBrowserAdapter(scoped, factory, options);
					// Freeze the already-qualified inventory; retain the real refresh method.
					adapter.readState = async (input) => {
						inventoryOptions = input;
						options.onInventoryStage?.("developer-mode");
						return {
							account: { email: "fixture@example.test", plan: null },
							developerMode: null,
							inventoryComplete: true,
							observedAt: "fixture",
							apps: [
								{
									pluginId: "fixture",
									appIds: [],
									name: "Fixture",
									status: null,
									enabled: true,
									authStatus: null,
									reviewStatus: null,
									authorization: null,
									endpoint: "https://example.test/mcp",
									versionId: null,
									scope: null,
									discoverability: null,
									creatorName: null,
									description: null,
								},
							],
						};
					};
					return adapter;
				},
			},
		);
	} catch (error) {
		failure = error;
	}
	expect(refreshAttachmentReached).toBe(true);
	expect(inventoryOptions).toEqual({ includeDeveloperMode: false, inventoryTransport: "api" });
	expect(JSON.parse(formatChatgptDeveloperAppListFailure(failure, "refresh-tools"))).toMatchObject({
		stage: "refresh-tools",
		status: "unconfirmed",
		retrySafe: false,
		message: "fixture refresh attachment failure",
	});
});
