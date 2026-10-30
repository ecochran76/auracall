// biome-ignore-all lint/style/useNamingConvention: CDP domain names are case-sensitive.
import { afterEach, expect, test, vi } from "vitest";
import { createChatgptAdapter } from "../../src/browser/providers/chatgptAdapter.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";

const transport = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: transport.connect,
}));

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

test.each([
	{ text: "Too many requests.", kind: "rate-limit", accountMirrorInventory: true },
	{ text: "Something went wrong.", kind: "transient-error", accountMirrorInventory: false },
])("listing preserves navigation refusal for $kind", async ({
	text,
	kind,
	accountMirrorInventory,
}) => {
	vi.useFakeTimers();
	const effects: string[] = [];
	let identityRequests = 0;
	const url = "https://chatgpt.com/";
	const client = {
		Page: {
			enable: async () => {},
			navigate: async () => {
				effects.push("navigate");
				throw new Error("Fixture blocks navigation");
			},
			reload: async () => {
				effects.push("reload");
				throw new Error("Fixture blocks reload");
			},
		},
		Runtime: {
			enable: async () => {},
			evaluate: async ({ expression }: { expression: string }) => {
				if (/\.click\(|dispatchEvent\(|location\.(assign|reload)\(/.test(expression)) {
					effects.push("browser-mutation");
					throw new Error("Fixture blocks browser mutation");
				}
				let value: unknown = null;
				if (expression === "location.href") value = url;
				else if (expression.includes("fetch('/api/auth/session'")) {
					identityRequests++;
					value = { user: { email: "fixture@example.invalid" }, account: null };
				} else if (expression.includes("const overlaySelectors =")) {
					value = [{ text, selector: "#warning", buttonLabels: ["Close"], role: "alert" }];
				} else if (expression.includes("const createProjectLabel =")) value = { present: false };
				return { result: { value } };
			},
		},
		close: async () => {},
	};
	transport.connect.mockResolvedValue(client);
	const authority = createProviderSessionAuthority({
		services: { chatgpt: { identity: { email: "fixture@example.invalid" } } },
	} as never);
	const context = {
		providerId: "chatgpt" as const,
		auracallRuntimeProfile: "fixture",
		browserProfile: "fixture",
		managedBrowserProfile: "/fixture/chatgpt",
		browserProcessId: 1234,
		browserTargetId: "fixture-target",
		devtoolsHost: "127.0.0.1",
		devtoolsPort: 45009,
	};
	const adapter = createChatgptAdapter();
	if (!adapter.listConversations) throw new Error("Conversation listing is unavailable");
	const result = adapter
		.listConversations(undefined, {
			host: "127.0.0.1",
			port: 45009,
			tabTargetId: "fixture-target",
			configuredUrl: url,
			accountMirrorInventory,
			allowNavigation: false,
			providerSessionAuthorization: {
				authority,
				context,
				expectation: authority.resolveExpectation(context),
			},
		})
		.then(
			() => null,
			(error: unknown) => error,
		);
	await vi.runAllTimersAsync();
	expect(await result).toMatchObject({ blockingSurface: { kind } });
	expect(effects).toEqual([]);
	if (accountMirrorInventory) expect(identityRequests).toBe(1);
});
