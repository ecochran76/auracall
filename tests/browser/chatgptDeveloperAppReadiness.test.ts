// biome-ignore-all lint/style/useNamingConvention: CDP protocol domains.
import { runInNewContext } from "node:vm";
import { afterEach, expect, test, vi } from "vitest";
import { createChatgptDeveloperAppBrowserAdapter } from "../../src/browser/providers/chatgptDeveloperApps.js";

const ui = vi.hoisted(() => ({ reload: vi.fn(), press: vi.fn(), input: vi.fn() }));
vi.mock("../../src/browser/service/ui.js", () => ({
	reloadAndSettle: ui.reload,
	pressButtonWithTrustedPointer: ui.press,
	setInputValue: ui.input,
	navigateAndSettle: async (
		client: { Page: { navigate: (x: unknown) => Promise<void> } },
		input: unknown,
	) => {
		await client.Page.navigate(input);
		return { ok: true };
	},
}));
afterEach(() => vi.useRealTimers());
test.each([
	{ errorDelayMs: 0, scope: "main" },
	{ errorDelayMs: 1000, scope: "main" },
	{ errorDelayMs: 0, scope: "sidebar" },
	{ errorDelayMs: 0, scope: "hidden" },
	{ errorDelayMs: 0, scope: "hung-probe" },
])("inventory account failure: %j", async ({ errorDelayMs, scope }) => {
	const started = Date.now();
	vi.useFakeTimers();
	let url = "https://chatgpt.com/";
	const element = {
		textContent: "There was an error loading your account. Try again.",
		innerText: "There was an error loading your account. Try again.",
		getBoundingClientRect: () => ({ width: 100, height: 30 }),
		closest: () => (scope === "sidebar" ? {} : null),
		getAttribute: () => null,
	};
	const document = {
		body: element,
		querySelectorAll: () => [],
		createTreeWalker: () => {
			let sent = false;
			return {
				nextNode: () => {
					if (sent) return null;
					sent = true;
					return {
						parentElement: element,
						textContent: Date.now() - started >= errorDelayMs ? element.textContent : "Loading",
					};
				},
			};
		},
	};
	const client = {
		Runtime: {
			enable: async () => {},
			evaluate: async ({ expression }: { expression: string }) => {
				if (scope === "hung-probe" && expression !== "location.href")
					return new Promise<never>(() => {});
				return {
					result: {
						value:
							expression === "location.href"
								? url
								: runInNewContext(expression, {
										document,
										location: { href: url },
										NodeFilter: { SHOW_TEXT: 4 },
										getComputedStyle: () => ({
											display: "block",
											visibility: scope === "hidden" ? "hidden" : "visible",
										}),
									}),
					},
				};
			},
		},
		Page: {
			enable: async () => {},
			navigate: async (input: { url: string }) => {
				url = input.url;
			},
		},
		Network: {
			enable: async () => {},
			responseReceived: () => () => {},
			loadingFinished: () => () => {},
		},
		close: async () => {},
	};
	const abort = new AbortController();
	const adapter = createChatgptDeveloperAppBrowserAdapter(
		{
			userConfig: { services: { chatgpt: { backendRequestBudgetWaitMs: 600000 } } } as never,
			getUserIdentity: async () => ({ email: "owner@example.test" }) as never,
			connectDevTools: async () => ({ client: client as never, port: 1 }),
		},
		async () => {
			throw new Error("unexpected browser");
		},
		{ abortSignal: abort.signal },
	);
	const result = adapter.readState({ includeDeveloperMode: false }).catch((error) => error);
	await vi.advanceTimersByTimeAsync(2000);
	const observed = await Promise.race([result, Promise.resolve("still waiting")]);
	if (scope === "main")
		expect(observed).toMatchObject({ code: "developer_app_account_load_error" });
	else {
		expect(observed).toBe("still waiting");
		if (scope === "hung-probe") {
			await vi.advanceTimersByTimeAsync(10000);
			await expect(result).resolves.toMatchObject({
				message: expect.stringContaining("developer-app account readiness timed out"),
			});
		} else {
			abort.abort(new Error("fixture cancellation"));
			await expect(result).resolves.toMatchObject({ message: "fixture cancellation" });
		}
	}
	expect(vi.getTimerCount()).toBe(0);
	await adapter.close();
});

test.each([
	"recovered",
	"disabled",
	"identity-changed",
	"identity-missing",
	"ready-add",
	"legacy",
	"hidden-add",
	"missing",
	"ambiguous",
] as const)("disabled Add dropdown: %s", async (outcome) => {
	vi.useFakeTimers();
	let refreshed = false;
	const marked = new Map<string, string>();
	const add = {
		setAttribute: (key: string, value: string) => {
			marked.set(key, value);
		},
		removeAttribute: (key: string) => {
			marked.delete(key);
		},
		textContent: outcome === "legacy" ? "Create app" : "Add",
		disabled: false,
		getBoundingClientRect: () => ({ width: 100, height: 30 }),
		getAttribute: (name: string) =>
			name === "aria-haspopup"
				? "menu"
				: name === "aria-disabled"
					? String(
							!["legacy", "ready-add"].includes(outcome) && (!refreshed || outcome === "disabled"),
						)
					: name === "aria-hidden"
						? String(outcome === "hidden-add" && !refreshed)
						: null,
		closest: () => null,
	};
	const document = {
		querySelectorAll: () =>
			outcome === "missing" ? [] : outcome === "ambiguous" ? [add, add] : [add],
		body: {},
		createTreeWalker: () => ({ nextNode: () => null }),
	};
	const identity = vi
		.fn()
		.mockResolvedValueOnce({ email: "owner@example.test" })
		.mockResolvedValue({
			email:
				outcome === "identity-changed"
					? "other@example.test"
					: outcome === "identity-missing"
						? null
						: "owner@example.test",
		});
	ui.reload.mockReset().mockImplementation(async () => {
		refreshed = true;
		return { ok: true };
	});
	ui.press.mockReset().mockResolvedValue({ ok: true });
	ui.input.mockReset().mockRejectedValue(new Error("fixture form reached"));
	const client = {
		Runtime: {
			enable: async () => {},
			evaluate: async ({ expression }: { expression: string }) => ({
				result: {
					value:
						expression === "location.href"
							? "https://chatgpt.com/plugins"
							: runInNewContext(expression, {
									document,
									location: { href: "https://chatgpt.com/plugins" },
									NodeFilter: { SHOW_TEXT: 4 },
									getComputedStyle: () => ({ display: "block", visibility: "visible" }),
								}),
				},
			}),
		},
		Page: { enable: async () => {}, navigate: async () => {} },
		close: async () => {},
	};
	const adapter = createChatgptDeveloperAppBrowserAdapter(
		{
			userConfig: {} as never,
			getUserIdentity: identity,
			connectDevTools: async () => ({ client: client as never, port: 1 }),
		},
		async () => {
			throw new Error("unexpected browser");
		},
	);
	const result = adapter
		.create({ name: "Fixture App", connection: "server-url", auth: "none" } as never)
		.catch((error) => error);
	await vi.advanceTimersByTimeAsync(2000);
	const error = await result;
	const reachesForm = ["recovered", "ready-add", "legacy", "hidden-add"].includes(outcome);
	const noRefresh = ["ready-add", "legacy", "missing", "ambiguous"].includes(outcome);
	expect(error.message).toMatch(
		reachesForm
			? /fixture form reached/
			: outcome === "disabled"
				? /unavailable after one refresh/
				: noRefresh
					? /did not expose/
					: /identity/,
	);
	expect(ui.reload).toHaveBeenCalledTimes(noRefresh ? 0 : 1);
	expect(ui.press).toHaveBeenCalledTimes(reachesForm ? (outcome === "legacy" ? 1 : 2) : 0);
	expect(ui.input).toHaveBeenCalledTimes(reachesForm ? 1 : 0);
	if (reachesForm && outcome !== "legacy") {
		expect(ui.press.mock.calls[0]?.[1]).toMatchObject({
			selector: '[data-auracall-developer-app-create-control="true"]',
		});
		expect(marked.get("data-auracall-developer-app-create-control")).toBe("true");
	}
	await adapter.close();
});
