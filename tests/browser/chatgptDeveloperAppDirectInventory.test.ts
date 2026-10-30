// biome-ignore-all lint/style/useNamingConvention: CDP protocol domains and browser globals.
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { createChatgptDeveloperAppBrowserAdapter } from "../../src/browser/providers/chatgptDeveloperApps.js";

vi.mock("../../src/browser/service/ui.js", () => ({
	navigateAndSettle: async (
		client: { Page: { navigate: (input: unknown) => Promise<void> } },
		input: unknown,
	) => {
		await client.Page.navigate(input);
		return { ok: true };
	},
}));

test.each([
	"healthy",
	"wrong-account",
	"wrong-workspace",
	"no-session",
	"http-failure",
	"malformed",
	"linked-unavailable",
	"retry-ui",
	"rate-limit",
	"captcha",
])("inventory-only read avoids UI navigation: %s", async (mode) => {
	const requests: string[] = [];
	const navigate = vi.fn(async () => {
		throw new Error("inventory-only read unexpectedly navigated the UI");
	});
	const installed = {
		plugins: [
			{
				id: "plugin_fixture",
				name: "Fixture",
				enabled: true,
				release: { display_name: "Fixture", app_ids: ["fixture"] },
			},
		],
	};
	const fetch = async (
		url: string,
		options: { credentials: string; headers: Record<string, string> },
	) => {
		requests.push(url);
		expect(options.credentials).toBe("include");
		let status = 200;
		let data: unknown;
		if (url === "/api/auth/session") {
			status = mode === "no-session" ? 401 : 200;
			data = {
				user: { email: mode === "wrong-account" ? "other@example.test" : "owner@example.test" },
				account: { id: mode === "wrong-workspace" ? "other-workspace" : "fixture-workspace" },
				accessToken: "fixture-browser-token",
			};
		} else {
			expect(options.headers.authorization).toBe("Bearer fixture-browser-token");
			expect(options.headers["chatgpt-account-id"]).toBe("fixture-workspace");
			if (url === "/backend-api/ps/plugins/installed") {
				status = mode === "http-failure" ? 503 : 200;
				data = mode === "malformed" ? {} : installed;
			} else {
				expect(url).toBe("/backend-api/aip/connectors/links/list_accessible");
				status = mode === "linked-unavailable" ? 404 : 200;
				data = { links: [] };
			}
		}
		return { ok: status === 200, status, json: async () => data };
	};
	const text =
		mode === "retry-ui"
			? "We couldn’t load your account"
			: mode === "rate-limit"
				? "Too many requests. Please try again later."
				: mode === "captcha"
					? "Verify you are human"
					: "";
	const element = {
		textContent: text,
		getBoundingClientRect: () => ({ width: 100, height: 20 }),
		closest: () => null,
		getAttribute: () => null,
	};
	const document = {
		body: { innerText: text },
		querySelectorAll: () => (mode === "retry-ui" ? [{ ...element, textContent: "Try again" }] : []),
		createTreeWalker: () => {
			let sent = false;
			return {
				nextNode: () => {
					if (sent) return null;
					sent = true;
					return { textContent: text, parentElement: element };
				},
			};
		},
	};

	const client = {
		Runtime: {
			enable: async () => {},
			evaluate: async ({ expression }: { expression: string }) => ({
				result: {
					value: await runInNewContext(expression, {
						document,
						location: { href: "https://chatgpt.com/", origin: "https://chatgpt.com" },
						NodeFilter: { SHOW_TEXT: 4 },
						fetch,
						AbortController,
						setTimeout,
						clearTimeout,
					}),
				},
			}),
		},
		Page: { enable: async () => {}, navigate },
		Network: {
			enable: async () => {},
			responseReceived: () => () => {},
			loadingFinished: () => () => {},
		},
		close: async () => {},
	};
	const adapter = createChatgptDeveloperAppBrowserAdapter(
		{
			userConfig: { services: { chatgpt: {} } } as never,
			getUserIdentity: async () => ({
				email: "owner@example.test",
				accountId: "fixture-workspace",
			}),
			connectDevTools: async () => ({ client: client as never, port: 1 }),
		},
		async () => {
			throw new Error("unexpected browser creation");
		},
	);
	try {
		const outcome = await adapter
			.readState({ includeDeveloperMode: false, inventoryTransport: "api" })
			.catch((error) => error);
		expect(navigate).not.toHaveBeenCalled();
		if (["healthy", "linked-unavailable", "retry-ui"].includes(mode)) {
			expect(outcome).toMatchObject({
				inventoryComplete: true,
				developerMode: null,
				account: { email: "owner@example.test" },
				apps: [{ pluginId: "plugin_fixture", name: "Fixture" }],
			});
		} else {
			expect(outcome).toBeInstanceOf(Error);
			if (mode === "captcha")
				expect(outcome.code).toBe("developer_app_human_verification_required");
			else if (mode !== "rate-limit")
				expect(outcome.code).toBe(
					mode.startsWith("wrong-")
						? "developer_app_account_mismatch"
						: mode === "no-session"
							? "developer_app_account_load_error"
							: mode === "malformed"
								? "developer_app_inventory_incomplete"
								: "developer_app_inventory_read_failed",
				);
		}
		expect(requests.length).toBeLessThanOrEqual(3);
		if (["captcha", "rate-limit"].includes(mode)) expect(requests).toEqual([]);
		if (mode.startsWith("wrong-") || mode === "no-session")
			expect(requests).toEqual(["/api/auth/session"]);
		expect(JSON.stringify(outcome)).not.toContain("fixture-browser-token");
	} finally {
		await adapter.close();
	}
});
