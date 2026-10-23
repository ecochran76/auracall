import { afterEach, expect, test, vi } from "vitest";
import { createChatgptDeveloperAppBrowserAdapter } from "../../src/browser/providers/chatgptDeveloperApps.js";

afterEach(() => vi.useRealTimers());

test("inventory waits for admitted root document readiness within configured allowance", async () => {
	vi.useFakeTimers();
	let url = "https://chatgpt.com/";
	let readyAt = Date.now();
	let response = (_event: unknown) => {};
	let finished = (_event: unknown) => {};
	const client = {
		Runtime: {
			enable: async () => {},
			evaluate: async ({ expression }: { expression: string }) => ({
				result: {
					value:
						expression === "location.href"
							? url
							: expression.includes("document.readyState")
								? Date.now() >= readyAt
								: false,
				},
			}),
		},
		Page: {
			enable: async () => {},
			navigate: async ({ url: next }: { url: string }) => {
				url = next;
				if (next === "https://chatgpt.com/plugins") {
					readyAt = Date.now();
					response({
						requestId: "installed",
						response: { url: "https://chatgpt.com/backend-api/ps/plugins/installed", status: 200 },
					});
					finished({ requestId: "installed" });
				} else readyAt = Date.now() + 20_000;
				return {};
			},
		},
		Network: {
			enable: async () => {},
			responseReceived: (fn: typeof response) => {
				response = fn;
			},
			loadingFinished: (fn: typeof finished) => {
				finished = fn;
			},
			getResponseBody: async () => ({
				body: JSON.stringify({ plugins: [] }),
				base64Encoded: false,
			}),
		},
		close: async () => {},
	};
	const adapter = createChatgptDeveloperAppBrowserAdapter(
		{
			userConfig: { services: { chatgpt: { backendRequestBudgetWaitMs: 60_000 } } } as never,
			getUserIdentity: async () => ({ email: "fixture@example.test" }),
			connectDevTools: async () => ({ client: client as never, port: 1 }),
		},
		async () => {
			throw Error("unexpected browser creation");
		},
	);
	const started = Date.now();
	const result = adapter.readState({ includeDeveloperMode: false });
	void result.catch(() => undefined);
	await vi.runAllTimersAsync();
	try {
		expect(await result).toMatchObject({ inventoryComplete: true, apps: [] });
		expect(url).toBe("https://chatgpt.com/");
		expect(Date.now() - started).toBeLessThan(35_000);
	} finally {
		await adapter.close();
	}
});
