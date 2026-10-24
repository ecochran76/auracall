import { expect, test, vi } from "vitest";
import {
	collectGrokHistoryInventory,
	buildGrokHistoryPageExpression,
} from "../../src/browser/providers/grokHistoryInventory.js";

test("bounded history returns a scope-bound cursor rather than claiming completion", async () => {
	const readPage = vi.fn(async () => ({
		items: [
			{ id: "one", title: "First", url: "https://grok.com/c/one" },
			{ id: "two", title: "Second", url: "https://grok.com/c/two" },
		],
		atBottom: false,
		canScroll: true,
	}));
	const result = await collectGrokHistoryInventory({ readPage, options: { historyLimit: 1 } });
	expect(result.items.map((item) => item.id)).toEqual(["one"]);
	expect(result.coverage).toMatchObject({
		state: "incomplete",
		reason: "item-limit",
		pages: 1,
		nextCursor: expect.any(String),
	});
	expect(readPage).toHaveBeenCalledTimes(1);
	const resumed = await collectGrokHistoryInventory({
		readPage,
		options: { historyLimit: 1, historyCursor: result.coverage.nextCursor },
	});
	expect(resumed.items.map((item) => item.id)).toEqual(["two"]);
	await expect(
		collectGrokHistoryInventory({
			readPage,
			projectId: "different",
			options: { historyCursor: result.coverage.nextCursor },
		}),
	).rejects.toThrow("cursor scope");
});

test("project history requires positive membership and retains Bot provenance", async () => {
	const result = await collectGrokHistoryInventory({
		projectId: "wanted",
		options: { historyMaxPages: 1 },
		readPage: async () => ({
			items: [
				{ id: "root", title: "Root", url: "https://grok.com/c/root" },
				{
					id: "other",
					title: "Other",
					url: "https://grok.com/project/other?chat=other",
					projectId: "other",
				},
				{
					id: "yes",
					title: "Yes",
					url: "https://grok.com/project/wanted?chat=yes",
					projectId: "wanted",
					botId: "bot-a",
				},
			],
			atBottom: true,
			canScroll: false,
		}),
	});
	expect(result.items.map((item) => item.id)).toEqual(["yes"]);
	expect(result.items[0].metadata).toMatchObject({
		grokProvenance: { projectId: "wanted", botId: "bot-a" },
	});
	expect(result.coverage.state).toBe("incomplete");
});

test("missing/failed history is an error, and positive empty evidence is distinct", async () => {
	await expect(
		collectGrokHistoryInventory({
			readPage: async () => ({ items: [], error: "history-dialog-missing" }),
		}),
	).rejects.toThrow("history-dialog-missing");
	const empty = await collectGrokHistoryInventory({
		readPage: async () => ({ items: [], atBottom: true, emptyEvidence: true }),
	});
	expect(empty.coverage.state).toBe("empty");
	const unknown = await collectGrokHistoryInventory({
		options: { historyMaxPages: 1 },
		readPage: async () => ({ items: [], atBottom: true }),
	});
	expect(unknown.coverage.state).toBe("incomplete");
});

test("cancellation blocks the next page before its read or scroll", async () => {
	const controller = new AbortController();
	controller.abort(new Error("operator cancelled"));
	const readPage = vi.fn(async () => ({ items: [], atBottom: true }));
	await expect(
		collectGrokHistoryInventory({ readPage, options: { abortSignal: controller.signal } }),
	).rejects.toThrow("operator cancelled");
	expect(readPage).not.toHaveBeenCalled();
});

test("history DOM probe compiles and distinguishes a missing dialog", async () => {
	const { runInNewContext } = await import("node:vm");
	const result = runInNewContext(buildGrokHistoryPageExpression(undefined, "https://grok.com/c/"), {
		document: { querySelector: () => null },
	});
	expect(result).toMatchObject({ error: "history-dialog-missing" });
});

test("shared warning stops history hydration and Ops retains only bounded progress", async () => {
	const { mkdtemp, rm } = await import("node:fs/promises");
	const os = await import("node:os");
	const path = await import("node:path");
	const { setAuracallHomeDirOverrideForTest } = await import("../../src/auracallHome.js");
	const { createConfiguredProviderTrafficAuthorityFactory } = await import(
		"../../src/browser/configuredProviderTrafficAuthority.js"
	);
	const { createBrowserTabConcurrencyRuntime } = await import(
		"../../src/browser/tabConcurrencyRuntime.js"
	);
	const { recordGrokHistoryProgress } = await import("../../src/browser/grokHistoryProgress.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-history-warning-"));
	setAuracallHomeDirOverrideForTest(root);
	const config = {
		auracallProfile: "fixture",
		services: { grok: { identity: { email: "operator@example.test" } } },
	} as never;
	const authority = await createConfiguredProviderTrafficAuthorityFactory({
		userConfig: config,
		provider: "grok",
		managedBrowserProfile: path.join(root, "managed"),
		mutationAudit: async () => undefined,
		baseOptions: {},
	}).acquire({ targetId: "fixture" });
	const readPage = vi.fn(async () => ({
		items: [{ id: "private-id", title: "Private title", url: "https://grok.com/c/private-id" }],
		canScroll: true,
	}));
	try {
		await expect(
			collectGrokHistoryInventory({
				readPage,
				governor: authority.governor,
				probeContext: { evaluate: async () => ({ result: { value: "Query limit reached" } }) },
				onProgress: (coverage) => recordGrokHistoryProgress("fixture", coverage),
			}),
		).rejects.toThrow("rate-limit");
		expect(readPage).toHaveBeenCalledTimes(1);
		const status = await createBrowserTabConcurrencyRuntime(config).readStatus();
		expect(status.providerControls?.grok.historyInventory).toMatchObject({
			state: "failed",
			reason: "history-failed",
		});
		expect(JSON.stringify(status.providerControls)).not.toContain("Private title");
		expect(JSON.stringify(status.providerControls)).not.toContain("private-id");
	} finally {
		await authority.close();
		setAuracallHomeDirOverrideForTest(null);
		await rm(root, { recursive: true, force: true });
	}
});

test("current Chats opener uses exact identity and refuses ambiguous controls", async () => {
	const { buildGrokChatsOpenerExpression } = await import(
		"../../src/browser/providers/grokHistoryInventory.js"
	);
	const { runInNewContext } = await import("node:vm");
	let clicked = "";
	const node = (name: string) => ({
		getBoundingClientRect: () => ({ width: 10, height: 10 }),
		getAttribute: () => name,
		textContent: name,
		disabled: false,
		click: () => {
			clicked = name;
		},
	});
	const evaluate = (names: string[]) =>
		runInNewContext(buildGrokChatsOpenerExpression(), {
			document: { querySelectorAll: () => names.map(node) },
			getComputedStyle: () => ({ visibility: "visible", display: "block" }),
		});
	expect(evaluate(["Chats", "History", "Chats settings"])).toMatchObject({ ok: true });
	expect(clicked).toBe("Chats");
	clicked = "";
	expect(evaluate(["Chats", "Chats"])).toMatchObject({
		ok: false,
		reason: "ambiguous-chats-opener",
	});
	expect(clicked).toBe("");
});

test("history progress supports long runtime IDs without leaking extra fields", async () => {
	const { mkdtemp, rm } = await import("node:fs/promises");
	const os = await import("node:os");
	const path = await import("node:path");
	const { setAuracallHomeDirOverrideForTest } = await import("../../src/auracallHome.js");
	const { recordGrokHistoryProgress, readGrokHistoryProgress } = await import(
		"../../src/browser/grokHistoryProgress.js"
	);
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-history-progress-"));
	setAuracallHomeDirOverrideForTest(root);
	try {
		const profile = "r".repeat(200);
		await recordGrokHistoryProgress(profile, {
			state: "incomplete",
			source: "visible-chats",
			scope: "root",
			reason: "item-limit",
			loadedCount: 1,
			pages: 1,
			nextCursor: "opaque-private-id",
			observedAt: new Date().toISOString(),
			privateText: "Private query",
		} as never);
		const progress = await readGrokHistoryProgress(profile);
		expect(progress).toMatchObject({ loadedCount: 1, nextCursorAvailable: true });
		expect(JSON.stringify(progress)).not.toContain("Private query");
		expect(JSON.stringify(progress)).not.toContain("opaque-private-id");
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(root, { recursive: true, force: true });
	}
});
