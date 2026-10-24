// biome-ignore-all lint/style/useNamingConvention: CDP protocol fixture boundary.
import { expect, test, vi } from "vitest";
const wire = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("chrome-remote-interface", () => ({
	default: {
		List: async () => [{ id: "fixture", type: "page", url: "https://grok.com/" }],
		Close: async () => undefined,
	},
}));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: async () => wire.client,
}));
import { createGrokAdapter } from "../../src/browser/providers/grokAdapter.js";

test("public Grok array listing awaits final account proof before closing its transport", async () => {
	let identityReads = 0,
		release: () => void = () => undefined;
	const finalProof = new Promise<void>((resolve) => {
		release = resolve;
	});
	const close = vi.fn(async () => undefined);
	wire.client = {
		close,
		Page: {
			enable: async () => undefined,
			bringToFront: async () => undefined,
			navigate: async () => ({}),
		},
		Runtime: {
			enable: async () => undefined,
			evaluate: async ({ expression }: { expression: string }) => {
				let value: unknown = true;
				if (expression.includes("const identity = { id: null")) {
					identityReads++;
					if (identityReads === 2) await finalProof;
					value = {
						email: "operator@example.test",
						name: "Fixture",
						guestAuthCta: false,
						source: "app",
					};
				} else if (expression.includes("guestAuthCta"))
					value = {
						href: "https://grok.com/",
						title: "Grok",
						bodyText: "Chats",
						guestAuthCta: false,
					};
				else if (expression.includes("triggerDataState"))
					value = {
						triggerDataState: "open",
						triggerAriaExpanded: "true",
						sidebarWidth: 300,
						sidebarRight: 300,
					};
				else if (expression.includes("visibilityState"))
					value = { visibilityState: "visible", hasFocus: true };
				else if (expression.includes("const conversations = new Map"))
					value = { items: [{ id: "one", title: "First", url: "https://grok.com/c/one" }] };
				else if (expression.includes("const items = new Map")) value = [];
				else if (expression === "location.href") value = "https://grok.com/";
				return { result: { value } };
			},
		},
	};
	const { createProviderSessionAuthority } = await import(
		"../../src/browser/providers/providerSessionAuthority.js"
	);
	const authority = createProviderSessionAuthority({
		services: { grok: { identity: { email: "operator@example.test" } } },
	});
	const context = {
		providerId: "grok" as const,
		auracallRuntimeProfile: "default",
		browserProfile: "default",
		sourceBrowserProfile: "Default",
		managedBrowserProfile: "/fixture/grok",
		browserProcessId: 1234,
		browserTargetId: "fixture",
		devtoolsHost: "127.0.0.1",
		devtoolsPort: 9222,
	};
	const list = createGrokAdapter().listConversations;
	if (!list) throw new Error("Missing Grok list");
	const listed = list(undefined, {
		host: "127.0.0.1",
		port: 9222,
		tabTargetId: "fixture",
		providerSessionAuthorization: {
			authority,
			context,
			expectation: authority.resolveExpectation(context),
		},
	});
	const outcome = listed.then(
		(items) => ({ items }),
		(error) => ({ error }),
	);
	try {
		await vi.waitFor(() => expect(identityReads).toBe(2), { timeout: 2000 });
		expect(close).not.toHaveBeenCalled();
	} finally {
		release();
	}
	const result = await outcome;
	if ("error" in result) throw result.error;
	expect(result.items).toHaveLength(1);
	expect(close).toHaveBeenCalledOnce();
});
