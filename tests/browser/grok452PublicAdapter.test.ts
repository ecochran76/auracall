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
import type { Conversation } from "../../src/browser/providers/domain.js";
import { createGrokAdapter } from "../../src/browser/providers/grokAdapter.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";
import { historyTransportFixture } from "./grok401ConversationTransportFixture.js";
import { readGrokTimestampDom } from "./grok452DomFixture.js";

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
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "grok452-adapter-"));
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
		rows: { id: string; title: string; label: string; datetime?: string }[];
		now: number;
		directWithoutHistory?: boolean;
		options?: Partial<BrowserProviderListOptions>;
	},
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
				if (
					expression.includes("grok-history-head-reset") ||
					expression.includes("const conversations = new Map") ||
					expression.includes("const conversations = []")
				)
					return {
						result: { value: await readGrokTimestampDom(scene.rows, scene.now, expression) },
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
	if (scene.directWithoutHistory) {
		const list = createGrokAdapter().listConversations;
		if (!list) throw new Error("Public conversation list method missing");
		const items = await list(undefined, { ...options, includeHistory: false });
		if (!Array.isArray(items)) throw new Error("Public conversation list did not return rows");
		return { items: items as Conversation[], historyCoverage: undefined };
	}
	return readBoundedConversations(
		{ listConversations: createGrokAdapter().listConversations } as BrowserAutomationClient,
		null,
		limit,
		{ listOptions: options },
	);
}

const baseClock = Date.parse("2026-10-25T03:00:00Z");
const relativeRows = () =>
	["a", "b", "c", "d"].map((id, index) => ({
		id,
		title: id.toUpperCase(),
		label: index % 2 ? "2 hours ago" : "today",
	}));

test("public adapter history does not re-enrich qualified relative rows or refill an empty incremental frontier", async () => {
	const rows = relativeRows();
	const first = await freshPublicAdapterRead(null, 10, { rows, now: baseClock });
	const { grokHistoryFingerprint } = await import(
		"../../src/browser/providers/grokHistoryInventory.js"
	);
	const next = await freshPublicAdapterRead(null, 2, {
		rows,
		now: baseClock + 60_000,
		options: {
			historyKnownRows: rows.map((row) => ({
				id: row.id,
				fingerprint: grokHistoryFingerprint(row),
			})),
			historyStartAtHead: true,
		},
	});
	expect(next.items).toEqual([]);
	expect(first.items.every((row) => row.updatedAt === undefined)).toBe(true);
	expect(next.historyCoverage).toMatchObject({ reason: "incremental-frontier", nextCursor: null });
});

test("public adapter and persisted collector remain incremental for relative-only accounts larger than a cycle", async () => {
	const root = roots[roots.length - 1];
	const store = createGrokIndexCheckpointStore(root, {
		runtimeProfileId: "fixture",
		identityKey: "operator@example.test",
	});
	const rows = relativeRows();
	let now = baseClock;
	const read = async (
		_project: string | null,
		cursor: string | null,
		limit: number,
		maxPages: number,
		historyKnownRows?: readonly { id: string; fingerprint: string }[],
	) =>
		freshPublicAdapterRead(cursor, limit, {
			rows,
			now,
			options: {
				historyMaxPages: maxPages,
				historyKnownRows,
				historyStartAtHead: !!historyKnownRows,
			},
		});
	let latest: Awaited<ReturnType<typeof collectGrokMirrorIndex>> | undefined;
	for (let cycle = 0; cycle < 4; cycle++) {
		latest = await collectGrokMirrorIndex({
			projects: [],
			maxRows: 2,
			maxReads: 2,
			checkpoint: await store.read(),
			commit: store.write,
			read,
		});
		if (latest.checkpoint.phase === "follow") break;
	}
	expect(latest?.checkpoint).toMatchObject({ phase: "follow", scopes: [{ complete: true }] });
	expect(latest?.items.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
	for (let cycle = 0; cycle < 2; cycle++) {
		now += 60_000;
		latest = await collectGrokMirrorIndex({
			projects: [],
			maxRows: 2,
			maxReads: 2,
			checkpoint: await store.read(),
			commit: store.write,
			read,
		});
		expect(latest.progress).toMatchObject({
			phase: "follow",
			changedRows: 0,
			retainedRows: 4,
			observationCoverage: "partial",
			requiresFullSweep: true,
		});
		expect(latest.checkpoint.scopes).toMatchObject([
			{ complete: true, cursor: null, followCursor: null },
		]);
	}
});

test("public adapter preserves genuine absolute, title and new-row changes after an unchanged row across its bound", async () => {
	const rows: { id: string; title: string; label: string; datetime?: string }[] = relativeRows();
	rows[1].datetime = "2026-10-24T12:00:00Z";
	const first = await freshPublicAdapterRead(null, 10, { rows, now: baseClock });
	expect(first.items.find((row) => row.id === "b")?.updatedAt).toBe("2026-10-24T12:00:00.000Z");
	const { grokHistoryFingerprint } = await import(
		"../../src/browser/providers/grokHistoryInventory.js"
	);
	const historyKnownRows = first.items.map((row) => ({
		id: row.id,
		fingerprint: grokHistoryFingerprint(row),
	}));
	rows[1].datetime = "2026-10-24T13:00:00Z";
	rows[2].title = "Changed title";
	rows.push({ id: "e", title: "New row", label: "today" });
	const scene = {
		rows,
		now: baseClock + 60_000,
		options: { historyKnownRows, historyStartAtHead: true },
	};
	const changed = await freshPublicAdapterRead(null, 2, scene);
	expect(changed.items.map((row) => row.id)).toEqual(["b", "c"]);
	expect(changed.items[0].updatedAt).toBe("2026-10-24T13:00:00.000Z");
	expect(changed.items[1].title).toBe("Changed title");
	expect(changed.historyCoverage).toMatchObject({ reason: "item-limit", loadedCount: 2 });
	const resumed = await freshPublicAdapterRead(
		changed.historyCoverage?.nextCursor ?? null,
		2,
		scene,
	);
	expect(resumed.items.map((row) => row.id)).toEqual(["e"]);
	expect(resumed.historyCoverage).toMatchObject({
		reason: "incremental-frontier",
		nextCursor: null,
	});
});

test("non-history public root discovery retains its existing mounted-row merge", async () => {
	const result = await freshPublicAdapterRead(null, 10, {
		rows: relativeRows(),
		now: baseClock,
		directWithoutHistory: true,
	});
	expect(result.items.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
	expect(result.items.find((row) => row.id === "a")?.updatedAt).toBe("2026-10-25T03:00:00.000Z");
	expect(result.historyCoverage).toBeUndefined();
});
