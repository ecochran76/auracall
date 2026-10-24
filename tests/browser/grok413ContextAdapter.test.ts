// biome-ignore-all lint/style/useNamingConvention: CDP protocol fixture boundary.
import { expect, test, vi } from "vitest";

const wire = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("chrome-remote-interface", () => ({
	default: {
		List: async () => [{ id: "fixture", type: "page", url: "https://grok.com/c/chat" }],
		Close: async () => undefined,
	},
}));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: async () => wire.client,
}));

import type { ConversationContext } from "../../src/browser/providers/domain.js";
import { createGrokAdapter } from "../../src/browser/providers/grokAdapter.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";

const readContext = (() => {
	const read = createGrokAdapter().readConversationContext;
	if (!read) throw new Error("Missing Grok context reader");
	return read;
})();

function fixture(route = "https://grok.com/c/chat") {
	const navigate = vi.fn(async () => ({}));
	const close = vi.fn(async () => undefined);
	const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
		let value: unknown = true;
		if (expression === "location.href") value = route;
		else if (expression.includes("const identity = { id: null"))
			value = {
				email: "operator@example.test",
				name: "Fixture",
				guestAuthCta: false,
				source: "app",
			};
		else if (expression.includes("guestAuthCta"))
			value = { href: route, title: "Grok", bodyText: "Chat", guestAuthCta: false };
		else if (expression.includes("visibilityState"))
			value = { visibilityState: "visible", hasFocus: true };
		else if (expression.includes("const rowMessageIndex"))
			value = {
				ok: true,
				messages: [
					{ role: "user", text: "Exact conversation" },
					{ role: "assistant", text: "Observed answer" },
				],
				sources: [],
			};
		else if (expression.includes("const collectItems")) value = [];
		return { result: { value } };
	});
	wire.client = {
		close,
		Page: { enable: async () => undefined, navigate, bringToFront: async () => undefined },
		Runtime: { enable: async () => undefined, evaluate },
	};
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
	return {
		navigate,
		close,
		evaluate,
		options: {
			host: "127.0.0.1",
			port: 9222,
			tabTargetId: "fixture",
			allowNavigation: false,
			providerSessionAuthorization: {
				authority,
				context,
				expectation: authority.resolveExpectation(context),
			},
		},
	};
}

test("public Grok detail read refuses a foreign active conversation without navigation", async () => {
	const run = fixture("https://grok.com/c/foreign");
	await expect(readContext("chat", undefined, run.options)).rejects.toThrow(
		/route identity mismatch/,
	);
	expect(run.navigate).not.toHaveBeenCalled();
	expect(run.close).toHaveBeenCalledOnce();
	expect(
		run.evaluate.mock.calls.some(([input]) => input.expression.includes("const rowMessageIndex")),
	).toBe(false);
});

test("public Grok detail returns bounded mounted content with explicit partial history", async () => {
	const run = fixture();
	const result = (await readContext("chat", undefined, {
		...run.options,
		accountMirrorInventory: true,
		accountMirrorContextChunk: { startMessageIndex: 1, maxMessages: 1 },
	})) as ConversationContext;
	expect(result.messages).toEqual([{ role: "assistant", text: "Observed answer" }]);
	expect(result.metadata).toMatchObject({
		historyCoverage: { state: "partial", reason: "history-boundary-unobserved" },
		observedContent: { state: "complete" },
		accountMirrorContextChunk: { nextMessageIndex: null, complete: false },
	});
	expect(run.navigate).not.toHaveBeenCalled();
	expect(run.close).toHaveBeenCalledOnce();
});

test("cancellation after content observation prevents subsequent file work and success", async () => {
	const run = fixture();
	const controller = new AbortController();
	const original = run.evaluate.getMockImplementation();
	if (!original) throw new Error("Missing fixture transport");
	run.evaluate.mockImplementation(async (input) => {
		const result = await original(input);
		if (input.expression.includes("const rowMessageIndex"))
			controller.abort(new Error("foreground cancellation"));
		return result;
	});
	await expect(
		readContext("chat", undefined, {
			...run.options,
			abortSignal: controller.signal,
			accountMirrorInventory: true,
		}),
	).rejects.toThrow(/foreground cancellation/);
	expect(
		run.evaluate.mock.calls.some(([input]) => input.expression.includes("const collectItems")),
	).toBe(false);
	expect(run.close).toHaveBeenCalledOnce();
});

test("public Grok detail honors shared operation admission before content observation", async () => {
	const run = fixture();
	const begin = vi.fn(async () => {
		throw new Error("shared account operation budget exhausted");
	});
	await expect(
		readContext("chat", undefined, {
			...run.options,
			providerTrafficGovernor: { begin, attribution: { targetId: "fixture" } } as never,
		}),
	).rejects.toThrow(/shared account operation budget exhausted/);
	expect(begin).toHaveBeenCalledWith(
		expect.objectContaining({
			kind: "provider-read",
			source: "provider:grok:conversation-context",
		}),
	);
	expect(
		run.evaluate.mock.calls.some(([input]) => input.expression.includes("const rowMessageIndex")),
	).toBe(false);
	expect(run.close).toHaveBeenCalledOnce();
});

test("public Grok chunk extraction reads and transports only the requested mounted card slice", async () => {
	const { runInNewContext } = await import("node:vm");
	const { webcrypto } = await import("node:crypto");
	const run = fixture();
	const original = run.evaluate.getMockImplementation();
	if (!original) throw new Error("Missing fixture transport");
	let textReads = 0;
	const rows = Array.from({ length: 1000 }, (_, index) => {
		const markdown = {
			get textContent() {
				textReads++;
				if (index < 24 || index >= 48) throw new Error("Unbounded content extraction");
				return `Turn ${index}`;
			},
		};
		return {
			id: `response-${index}`,
			getAttribute: (name: string) => (name === "class" ? "items-start" : `response-${index}`),
			querySelector: (selector: string) =>
				selector.includes("response-content-markdown") ? markdown : null,
			querySelectorAll: () => [],
		};
	});
	run.evaluate.mockImplementation(async (input) => {
		if (input.expression.includes("const rowMessageIndex")) {
			const value = await runInNewContext(input.expression, {
				document: {
					querySelectorAll: (selector: string) => (selector.includes("main [id^=") ? rows : []),
				},
				window: { location: { origin: "https://grok.com" } },
				crypto: webcrypto,
				TextEncoder,
				URL,
			});
			return { result: { value } };
		}
		return original(input);
	});
	const result = (await readContext("chat", undefined, {
		...run.options,
		accountMirrorInventory: true,
		accountMirrorContextChunk: { startMessageIndex: 24, maxMessages: 24 },
	})) as ConversationContext;
	expect(textReads).toBe(24);
	expect(result.messages).toHaveLength(24);
	expect(result.messages[0]?.text).toBe("Turn 24");
	expect(result.metadata).toMatchObject({
		historyCoverage: { observedMessages: 1000, state: "partial" },
		accountMirrorContextChunk: { startMessageIndex: 24, endMessageIndex: 48, nextMessageIndex: 48 },
	});
});
