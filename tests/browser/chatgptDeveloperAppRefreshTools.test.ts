import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatgptDeveloperAppBrowserAdapter } from "../../src/browser/providers/chatgptDeveloperApps.js";

describe("developer app tool refresh", () => {
	afterEach(() => vi.useRealTimers());
	it.each([
		"success",
		"settings-load-error-after",
		"settings-load-error-before",
		"delayed-activation",
		"slow-before-budget",
		"slow-after-budget",
		"slow-cancel-budget",
		"slow-no-budget",
		"slow-exhausted-budget",
		"settling-before",
		"settling-after",
		"account-loading-before",
		"body-fallback",
		"foreign-refresh-link",
		"no-refresh-request",
		"http-error",
		"malformed",
		"identity-change",
		"app-member-change",
		"connection-change",
		"approval",
		"approval-before",
		"foreign-connection",
	])("reports refresh outcome without retry: %s", async (scenario) => {
		let request: (value: unknown) => void = () => {};
		let response: (value: unknown) => void = () => {};
		let finished: (value: unknown) => Promise<void> = async () => {};
		const clicks: string[] = [];
		const controller = new AbortController();
		let settingsReads = 0;
		let postReads = 0;
		vi.useFakeTimers();
		const startedAt = Date.now();
		const settingsReadyAt = Date.now() + (scenario === "slow-exhausted-budget" ? 80_000 : 20_000);
		const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
			if (expression.includes("refreshButtonCount:")) {
				const firstRead = settingsReads++ === 0;
				const postLoading = scenario === "settling-after" && clicks.length > 0 && postReads++ === 0;
				const text =
					(scenario === "settings-load-error-after" && clicks.length) ||
					scenario === "settings-load-error-before"
						? "Couldn't load plugin settings\nTry again"
						: `Connected accounts\n${scenario === "connection-change" && clicks.length ? "Other account" : scenario === "account-loading-before" && firstRead ? "Connect another account" : "Fixture account"}\nAbout\nURL\nhttps://fixture.example/mcp\nApp ID\n${["identity-change", "app-member-change"].includes(scenario) && clicks.length ? "other" : "fixture"}\nRefresh tools`;
				const control = {
					innerText: "Refresh tools",
					disabled:
						(scenario === "settling-before" && firstRead) ||
						postLoading ||
						(scenario.startsWith("slow-") &&
							(scenario === "slow-after-budget" ? clicks.length > 0 : !clicks.length) &&
							Date.now() < settingsReadyAt),
					getAttribute: () => null,
					getBoundingClientRect: () => ({ width: 100, height: 30 }),
				};
				const approval = { ...control, innerText: "Approve new tool permissions" };
				return {
					result: {
						value: runInNewContext(expression, {
							location: { href: "https://chatgpt.com/settings/plugins-settings/plugin_fixture" },
							document: {
								body: { innerText: text },
								querySelectorAll: (selector: string) =>
									selector === "button"
										? [control]
										: (scenario === "approval" && clicks.length) || scenario === "approval-before"
											? [approval]
											: [],
							},
							getComputedStyle: () => ({ visibility: "visible", display: "block" }),
						}),
					},
				};
			}
			if (expression.includes("const stateKey ="))
				return {
					result: { value: { ok: true, center: { x: 10, y: 10 }, matchedLabel: "refresh tools" } },
				};
			if (expression.startsWith("window["))
				return { result: { value: { trusted: true, matchedLabel: "refresh tools" } } };
			return { result: { value: true } };
		});
		const adapter = createChatgptDeveloperAppBrowserAdapter(
			{
				userConfig: {
					services: {
						chatgpt: {
							backendRequestBudgetWaitMs:
								scenario.startsWith("slow-") && scenario !== "slow-no-budget" ? 60_000 : 0,
						},
					},
				} as never,
				getUserIdentity: async () => null,
				connectDevTools: async () => ({
					port: 1,
					client: {
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Runtime: { enable: async () => {}, evaluate },
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Page: {
							enable: async () => {},
							navigate: async () => {
								response({
									requestId: "links",
									response: {
										url: "https://chatgpt.com/backend-api/aip/connectors/links/list_accessible",
										status: 200,
									},
								});
								await finished({ requestId: "links" });
								return {};
							},
						},
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Input: {
							dispatchMouseEvent: async ({ type }: { type: string }) => {
								if (type === "mouseReleased") {
									if (scenario === "delayed-activation")
										await new Promise((resolve) => setTimeout(resolve, 25_000));
									clicks.push(type);
									if (scenario === "no-refresh-request") return;
									request({
										requestId: "refresh",
										request: {
											url: "https://chatgpt.com/backend-api/aip/connectors/mcp/refresh_actions",
											method: "POST",
											postData:
												scenario === "body-fallback"
													? undefined
													: JSON.stringify(
															scenario === "foreign-refresh-link"
																? { link_id: "foreign", server_url: "https://fixture.example/mcp" }
																: { link_id: "link_fixture" },
														),
										},
									});
									response({
										requestId: "refresh",
										response: { status: scenario === "http-error" ? 500 : 200 },
									});
									await finished({ requestId: "refresh" });
								}
							},
						},
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Network: {
							enable: async () => {},
							requestWillBeSent: (fn: typeof request) => {
								request = fn;
							},
							responseReceived: (fn: typeof response) => {
								response = fn;
							},
							loadingFinished: (fn: typeof finished) => {
								finished = fn;
							},
							getRequestPostData: async () => ({
								postData: JSON.stringify({ link_id: "link_fixture" }),
							}),
							getResponseBody: async ({ requestId }: { requestId: string }) => ({
								body:
									requestId === "links"
										? JSON.stringify({
												links: [
													{
														link_id: "link_fixture",
														connector_id: scenario === "foreign-connection" ? "foreign" : "fixture",
														name: "Fixture",
													},
												],
											})
										: JSON.stringify(
												scenario === "malformed"
													? { actions: [{ name: null }] }
													: { actions: [{ name: "new_tool", params: { type: "object" } }] },
											),
							}),
						},
						close: async () => {},
					} as never,
				}),
			},
			async () => {
				throw Error("unexpected browser creation");
			},
			{ abortSignal: controller.signal },
		);
		const resultPromise = adapter.refreshTools(
			{
				pluginId: "plugin_fixture",
				appIds: scenario === "app-member-change" ? ["fixture", "other"] : ["fixture"],
				name: "Fixture",
			},
			"https://fixture.example/mcp",
		);
		void resultPromise.catch(() => undefined);
		if (scenario === "slow-cancel-budget")
			setTimeout(() => controller.abort(new Error("fixture cancelled")), 1000);
		await vi.runAllTimersAsync();
		if (scenario === "slow-cancel-budget") {
			await expect(resultPromise).rejects.toThrow("fixture cancelled");
			expect(clicks).toEqual([]);
			expect(Date.now() - startedAt).toBeLessThan(5000);
			return;
		}
		if (["slow-no-budget", "slow-exhausted-budget"].includes(scenario)) {
			await expect(resultPromise).rejects.toThrow(
				"App refresh settings did not settle before refresh",
			);
			expect(clicks).toEqual([]);
			expect(Date.now()).toBeLessThan(settingsReadyAt);
			return;
		}
		if (scenario === "foreign-connection") {
			await expect(resultPromise).rejects.toThrow("Exact app connection identity unavailable");
			expect(clicks).toEqual([]);
			return;
		}
		if (scenario === "settings-load-error-before") {
			await expect(resultPromise).rejects.toThrow(
				"Couldn't load plugin settings; Refresh tools was not activated.",
			);
			expect(clicks).toEqual([]);
			expect(Date.now() - startedAt).toBeLessThan(8_000);
			return;
		}
		if (scenario === "settings-load-error-after") {
			await expect(resultPromise).resolves.toMatchObject({
				status: "unconfirmed",
				message: expect.stringContaining("Couldn't load plugin settings"),
				retrySafe: false,
			});
			expect(clicks).toEqual(["mouseReleased"]);
			expect(Date.now() - startedAt).toBeLessThan(8_000);
			return;
		}
		const result = await resultPromise;
		if (scenario === "delayed-activation") {
			expect(result.status).toBe("completed");
			expect(result.catalog).toMatchObject({ toolCount: 1, toolNames: ["new_tool"] });
			expect(clicks).toEqual(["mouseReleased"]);
			return;
		}
		if (scenario === "no-refresh-request")
			expect(result.message).toContain("No request to the expected refresh endpoint");
		if (scenario === "http-error") expect(result.message).toContain("HTTP 500");
		if (scenario === "malformed") expect(result.message).toContain("invalid catalog");
		if (scenario === "foreign-refresh-link")
			expect(result.message).toContain("connection identity did not match");
		expect(result.status).toBe(
			[
				"success",
				"slow-before-budget",
				"slow-after-budget",
				"body-fallback",
				"settling-before",
				"settling-after",
				"account-loading-before",
			].includes(scenario)
				? "completed"
				: ["approval", "approval-before"].includes(scenario)
					? "awaiting-human"
					: "unconfirmed",
		);
		if (
			[
				"success",
				"slow-before-budget",
				"slow-after-budget",
				"body-fallback",
				"settling-before",
				"settling-after",
				"account-loading-before",
			].includes(scenario)
		)
			expect(result.catalog).toMatchObject({ toolCount: 1, toolNames: ["new_tool"] });
		else expect(result.catalog).toBeUndefined();
		expect(clicks).toEqual(scenario === "approval-before" ? [] : ["mouseReleased"]);
	});

	it("refuses an app settings endpoint mismatch before any refresh activation", async () => {
		const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
			if (expression.includes("refreshButtonCount:"))
				return {
					result: {
						value: {
							url: "https://chatgpt.com/settings/plugins-settings/plugin_fixture",
							text: "Connected accounts\nFixture account\nAbout\nURL\nhttps://wrong.example/mcp\nApp ID\nfixture\nRefresh tools",
							refreshButtonCount: 1,
							humanApproval: false,
						},
					},
				};
			return { result: { value: true } };
		});
		const adapter = createChatgptDeveloperAppBrowserAdapter(
			{
				userConfig: {} as never,
				getUserIdentity: async () => null,
				connectDevTools: async () => ({
					port: 1,
					client: {
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Runtime: { enable: async () => {}, evaluate },
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Network: {
							enable: async () => {},
							requestWillBeSent: () => {},
							responseReceived: () => {},
							loadingFinished: () => {},
						},
						// biome-ignore lint/style/useNamingConvention: CDP protocol domains use canonical names.
						Page: { enable: async () => {}, navigate: async () => ({}) },
						close: async () => {},
					} as never,
				}),
			},
			async () => {
				throw Error("unexpected browser creation");
			},
		);
		await expect(
			adapter.refreshTools(
				{ pluginId: "plugin_fixture", appIds: ["fixture"], name: "Fixture" },
				"https://fixture.example/mcp",
			),
		).rejects.toThrow(/endpoint/);
		expect(
			evaluate.mock.calls.some(([p]) => p.expression.includes("__browserServiceTrustedPointer")),
		).toBe(false);
	});
});
