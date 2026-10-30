// biome-ignore-all lint/style/useNamingConvention: CDP domain names are case-sensitive.
import { afterEach, expect, test, vi } from "vitest";
import { createChatgptAdapter } from "../../src/browser/providers/chatgptAdapter.js";
import type { Conversation } from "../../src/browser/providers/domain.js";
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

function listingFixture(
	pages: string[][],
	limit: number,
	options: {
		signal?: AbortSignal;
		onScroll?: () => void | Promise<void>;
		onRead?: (index: number) => void | Promise<void>;
	} = {},
) {
	vi.useFakeTimers();
	const events: string[] = [];
	let page = 0;
	const client = {
		Page: { enable: async () => {} },
		Runtime: {
			enable: async () => {},
			evaluate: async ({ expression }: { expression: string }) => {
				let value: unknown = null;
				if (expression === "location.href") value = "https://chatgpt.com/";
				else if (expression.includes("fetch('/api/auth/session'"))
					value = { user: { email: "fixture@example.invalid" } };
				else if (expression.includes("const createProjectLabel =")) value = { present: false };
				else if (expression.includes("const overlaySelectors =")) value = [];
				else if (expression.includes("const sidebarMarkers =")) value = { ok: true };
				else if (expression.includes("const readConversationHistoryCache =")) {
					events.push("read");
					await options.onRead?.(events.filter((event) => event === "read").length);
					value = pages[page].map((id) => ({ id, title: id, url: `https://chatgpt.com/c/${id}` }));
				} else if (expression.includes("best.element.scrollTop")) {
					events.push("scroll");
					const moved = page < pages.length - 1;
					if (moved) page++;
					value = { moved, canScroll: moved, anchorCount: pages[page].length };
					await options.onScroll?.();
				}
				return { result: { value } };
			},
		},
		close: async () => {},
	};
	transport.connect.mockResolvedValue(client);
	const authority = createProviderSessionAuthority({
		services: { chatgpt: { identity: { email: "fixture@example.invalid" } } },
	});
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
	if (!adapter.listConversations) throw new Error("Conversation listing unavailable");
	const result = adapter
		.listConversations(undefined, {
			host: "127.0.0.1",
			port: 45009,
			tabTargetId: "fixture-target",
			configuredUrl: "https://chatgpt.com/",
			includeHistory: true,
			historyLimit: limit,
			accountMirrorInventory: true,
			allowNavigation: false,
			abortSignal: options.signal,
			providerSessionAuthorization: {
				authority,
				context,
				expectation: authority.resolveExpectation(context),
			},
		})
		.then(
			(rows) => ({ rows: rows as Conversation[], error: null }),
			(error: unknown) => ({ rows: null, error }),
		);
	return { result, events };
}

test("retains unique conversations across more than five equal-sized virtualized windows", async () => {
	const fixture = listingFixture(
		[
			["a", "b"],
			["b", "c"],
			["c", "d"],
			["d", "e"],
			["e", "f"],
			["f", "g"],
			["g", "h"],
		],
		8,
	);
	await vi.runAllTimersAsync();
	const result = await fixture.result;
	expect(result.error).toBeNull();
	expect(result.rows?.map((row) => row.id)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
});

test("uses the initial observation without reading the unchanged rail again before scrolling", async () => {
	const fixture = listingFixture(
		[
			["a", "b"],
			["b", "c"],
			["c", "d"],
		],
		4,
	);
	await vi.runAllTimersAsync();
	expect((await fixture.result).rows?.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
	// Five external CDP operations suffice: one observation, two scroll/read pairs.
	expect(fixture.events).toEqual(["read", "scroll", "read", "scroll", "read"]);
});

test.each([
	"Caller cancelled history listing",
	"Connection failed",
])("cancellation during the history wait preserves reason: %s", async (message) => {
	const controller = new AbortController();
	const reason = new Error(message);
	const fixture = listingFixture([["a"], ["b"], ["c"]], 3, {
		signal: controller.signal,
		onScroll: () => {
			setTimeout(() => controller.abort(reason), 1);
		},
	});
	let settled = false;
	void fixture.result.then(() => {
		settled = true;
	});
	await vi.advanceTimersByTimeAsync(2);
	const settledAtDeadline = settled;
	await vi.runAllTimersAsync();
	expect(settledAtDeadline).toBe(true);
	expect((await fixture.result).error).toBe(reason);
	expect(fixture.events).toEqual(["read", "scroll"]);
	expect(vi.getTimerCount()).toBe(0);
});

test.each([
	"read",
	"scroll",
])("cancellation does not wait for a stalled history %s command", async (stage) => {
	const controller = new AbortController();
	const reason = new Error("Caller cancelled stalled history command");
	const stall = () => {
		setTimeout(() => controller.abort(reason), 1);
		return new Promise<void>(() => {});
	};
	const fixture = listingFixture([["a"], ["b"]], 2, {
		signal: controller.signal,
		onRead: stage === "read" ? (index) => (index === 2 ? stall() : undefined) : undefined,
		onScroll: stage === "scroll" ? stall : undefined,
	});
	let settled = false;
	void fixture.result.then(() => {
		settled = true;
	});
	await vi.runAllTimersAsync();
	expect(settled).toBe(true);
	expect((await fixture.result).error).toBe(reason);
	expect(fixture.events.filter((event) => event === "scroll")).toHaveLength(1);
});

test.each([
	{ pages: [["a", "b"]], limit: 1, expected: ["a"], scrolls: 0 },
	{ pages: [["a", "b"]], limit: 3, expected: ["a", "b"], scrolls: 3 },
	{ pages: [["a"], ["b", "c", "d"]], limit: 3, expected: ["a", "b", "c"], scrolls: 1 },
])("retains row and no-progress bounds for $expected", async ({
	pages,
	limit,
	expected,
	scrolls,
}) => {
	const fixture = listingFixture(pages, limit);
	await vi.runAllTimersAsync();
	const result = await fixture.result;
	expect(result.error).toBeNull();
	expect(result.rows?.map((row) => row.id)).toEqual(expected);
	expect(fixture.events.filter((event) => event === "scroll")).toHaveLength(scrolls);
});
