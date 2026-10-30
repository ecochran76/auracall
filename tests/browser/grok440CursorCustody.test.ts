// biome-ignore-all lint/style/useNamingConvention: CDP transport names are case-sensitive.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { setCdpCommandAdmissionResolver } from "../../packages/browser-service/src/guardedCdp.js";
import { readBoundedConversations } from "../../src/accountMirror/chatgptMetadataCollector.js";
import {
	collectGrokMirrorIndex,
	createGrokIndexCheckpointStore,
} from "../../src/accountMirror/grokIndexBackfill.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import type { BrowserAutomationClient } from "../../src/browser/client.js";
import { createConfiguredProviderTrafficAuthorityFactory } from "../../src/browser/configuredProviderTrafficAuthority.js";
import { createGrokAdapter } from "../../src/browser/providers/grokAdapter.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";
import { historyTransportFixture } from "./grok401ConversationTransportFixture.js";

const wire = vi.hoisted(() => ({
	raw: undefined as unknown,
	targets: new Map<string, string>(),
	serial: 0,
	activeTarget: "",
}));
vi.mock("chrome-remote-interface", () => ({
	default: Object.assign(async () => wire.raw, {
		List: async () => Array.from(wire.targets, ([id, url]) => ({ id, type: "page", url })),
		Close: async ({ id }: { id: string }) => {
			wire.targets.delete(id);
		},
	}),
}));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: async ({ target }: { target: string }) => {
		wire.activeTarget = target;
		const { default: guarded } = await import("../../packages/browser-service/src/guardedCdp.js");
		return guarded({ host: "localhost", port: 1, target });
	},
	openChromeTarget: async () => {
		const id = `owned-root-history-${++wire.serial}`;
		wire.targets.set(id, "about:blank");
		return { id };
	},
}));
vi.mock("../../src/browser/service/ui.js", async (original) => ({
	...(await original<typeof import("../../src/browser/service/ui.js")>()),
	navigateAndSettle: async (_client: unknown, input: { url: string }) => {
		wire.targets.set(wire.activeTarget, input.url);
		return { ok: true, url: input.url };
	},
}));

const roots: string[] = [];
beforeEach(async () => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "grok440-isolated-"));
	roots.push(home);
	setAuracallHomeDirOverrideForTest(home);
	setCdpCommandAdmissionResolver(async () => ({
		run: (_command, effect) => effect(),
		hold: async () => ({ run: (_command, effect) => effect(), close: async () => {} }),
	}));
});
afterEach(async () => {
	setCdpCommandAdmissionResolver(undefined);
	setAuracallHomeDirOverrideForTest(null);
	wire.targets.clear();
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
	wire.raw = Object.assign(raw, {
		send: async () => {},
		Network: {
			enable: async () => {},
			responseReceived: () => () => {},
			loadingFailed: () => () => {},
		},
		Fetch: { enable: async () => {}, disable: async () => {}, requestPaused: () => () => {} },
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
	options.providerTrafficAuthorityFactory = createConfiguredProviderTrafficAuthorityFactory({
		userConfig: {
			auracallProfile: "default",
			services: { grok: { identity: { email: "operator@example.test" } } },
		} as never,
		provider: "grok",
		managedBrowserProfile: "/fixture/grok",
		mutationAudit: async () => {},
		baseOptions: { ...options, interactionGovernor: { beforeInteraction: async () => {} } },
	});
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
