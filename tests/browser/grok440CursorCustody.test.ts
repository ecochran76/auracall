// biome-ignore-all lint/style/useNamingConvention: CDP transport names are case-sensitive.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import {
	collectGrokMirrorIndex,
	createGrokIndexCheckpointStore,
} from "../../src/accountMirror/grokIndexBackfill.js";
import { readBoundedConversations } from "../../src/accountMirror/chatgptMetadataCollector.js";
import { createGrokAdapter } from "../../src/browser/providers/grokAdapter.js";
import type { BrowserAutomationClient } from "../../src/browser/client.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";
import { historyTransportFixture } from "./grok401ConversationTransportFixture.js";

const wire = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("chrome-remote-interface", () => ({
	default: {
		List: async () => [{ id: "fixture-target", type: "page", url: "https://grok.com/" }],
		Close: async () => undefined,
	},
}));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: async () => wire.client,
}));

const roots: string[] = [];
afterEach(async () => {
	setAuracallHomeDirOverrideForTest(null);
	await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function freshPublicAdapterRead(
	cursor: string | null,
	limit: number,
	scene: {
		rows?: { id: string; title: string }[];
		mountedRows?: { id: string; title: string; url: string }[];
		options?: Partial<BrowserProviderListOptions>;
	} = {},
) {
	const fixture = historyTransportFixture({
		empty: false,
		rows:
			scene.rows ?? ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: id.toUpperCase() })),
	});
	const connection = await fixture.dependencies.connect();
	const raw = connection.client;
	const evaluateHistory = raw.Runtime.evaluate;
	wire.client = Object.assign(raw, {
		Page: {
			enable: async () => {},
			bringToFront: async () => {},
			navigate: async () => ({}),
		},
		Runtime: {
			enable: async () => {},
			evaluate: async (input: { expression: string }) => {
				const expression = input.expression;
				if (expression.includes("Object.getOwnPropertyDescriptor(HTMLInputElement.prototype"))
					return { result: { value: true } };
				if (expression.includes("triggerDataState"))
					return {
						result: {
							value: {
								triggerDataState: "open",
								triggerAriaExpanded: "true",
								sidebarWidth: 300,
								sidebarRight: 300,
							},
						},
					};
				if (expression.includes("visibilityState"))
					return { result: { value: { visibilityState: "visible", hasFocus: true } } };
				if (expression.includes("const conversations = new Map"))
					return {
						result: {
							value: {
								items:
									scene.mountedRows ??
									["a", "b"].map((id) => ({
										id,
										title: id.toUpperCase(),
										url: `https://grok.com/c/${id}`,
									})),
							},
						},
					};
				if (expression.includes("const items = new Map")) return { result: { value: [] } };
				if (expression === "location.href") return { result: { value: "https://grok.com/" } };
				return evaluateHistory(input);
			},
		},
	});
	const options: BrowserProviderListOptions = {
		...fixture.options,
		host: "localhost",
		port: 1,
		tabTargetId: "fixture-target",
		historyCursor: cursor,
		historyMaxPages: 2,
		...scene.options,
	};
	return readBoundedConversations(
		{ listConversations: createGrokAdapter().listConversations } as BrowserAutomationClient,
		null,
		limit,
		{ listOptions: options },
	);
}

test("public resumed discovery commits every cursor-covered row despite repeated sidebar prefixes", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok440-custody-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const store = createGrokIndexCheckpointStore(root, {
		runtimeProfileId: "fixture",
		identityKey: "operator@example.test",
	});
	const read = async (_projectId: string | null, cursor: string | null) =>
		freshPublicAdapterRead(cursor, 2);
	const first = await collectGrokMirrorIndex({
		projects: [],
		maxRows: 2,
		maxReads: 2,
		commit: store.write,
		read,
	});
	expect(first.items.map((row) => row.id)).toEqual(["a", "b"]);
	const resumed = await collectGrokMirrorIndex({
		projects: [],
		maxRows: 2,
		maxReads: 2,
		checkpoint: await store.read(),
		commit: store.write,
		read,
	});
	expect(resumed.items.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
	expect((await store.read())?.items.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
	const next = await collectGrokMirrorIndex({
		projects: [],
		maxRows: 2,
		maxReads: 2,
		checkpoint: await store.read(),
		commit: store.write,
		read,
	});
	expect(next.items.map((row) => row.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
});

test.each([
	"Wanted",
	" Wanted ",
])("supplemental evidence cannot discard a cursor-qualified search result (%s)", async (historySearch) => {
	const result = await freshPublicAdapterRead(null, 2, {
		rows: [
			{ id: "c", title: "Wanted note" },
			{ id: "d", title: "Wanted other" },
		],
		mountedRows: [{ id: "c", title: "Other topic", url: "https://grok.com/c/c" }],
		options: { historySearch },
	});
	expect(result.items.map((row) => [row.id, row.title])).toEqual([
		["c", "Wanted note"],
		["d", "Wanted other"],
	]);
});

test("cancelled public progress cannot advance the durable checkpoint beyond its retained rows", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok440-cancel-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const store = createGrokIndexCheckpointStore(root, {
		runtimeProfileId: "fixture",
		identityKey: "operator@example.test",
	});
	const read = async (_projectId: string | null, cursor: string | null) =>
		freshPublicAdapterRead(cursor, 2);
	await collectGrokMirrorIndex({
		projects: [],
		maxRows: 2,
		maxReads: 2,
		commit: store.write,
		read,
	});
	const committed = await store.read();
	const cancellation = new AbortController();
	await expect(
		collectGrokMirrorIndex({
			projects: [],
			maxRows: 2,
			maxReads: 2,
			checkpoint: committed,
			commit: store.write,
			abortSignal: cancellation.signal,
			read: async (_projectId, cursor) =>
				freshPublicAdapterRead(cursor, 2, {
					options: {
						abortSignal: cancellation.signal,
						onHistoryInventory: (coverage) => {
							if (coverage.nextCursor && coverage.nextCursor !== committed?.scopes[0].cursor)
								cancellation.abort(new Error("cancel page"));
						},
					},
				}),
		}),
	).rejects.toThrow("cancel page");
	expect(await store.read()).toEqual(committed);
	const recovered = await collectGrokMirrorIndex({
		projects: [],
		maxRows: 2,
		maxReads: 2,
		checkpoint: await store.read(),
		commit: store.write,
		read,
	});
	expect(recovered.items.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
});
