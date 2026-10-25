// biome-ignore-all lint/style/useNamingConvention: CDP wire names are case-sensitive.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, expect, test, vi } from "vitest";

const wire = vi.hoisted(() => ({ client: undefined as unknown, projectId: "p" }));
vi.mock("chrome-remote-interface", () => ({
	default: Object.assign(async () => wire.client, {
		List: async () => [],
		Close: async () => undefined,
	}),
}));
import { createGrokAdapter } from "../../src/browser/providers/grokAdapter.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";
import { readBoundedConversations } from "../../src/accountMirror/chatgptMetadataCollector.js";
import {
	collectGrokMirrorIndex,
	createGrokIndexCheckpointStore,
} from "../../src/accountMirror/grokIndexBackfill.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { historyTransportFixture } from "./grok401ConversationTransportFixture.js";

afterEach(() => setAuracallHomeDirOverrideForTest(null));

async function fixture({ empty = false, failed = false } = {}) {
	const base = historyTransportFixture({ empty });
	const { client } = await base.dependencies.connect();
	const original = client.Runtime.evaluate;
	let pages = 0;
	client.Runtime.evaluate = async ({ expression }: { expression: string }) => {
		if (expression === "location.href")
			return { result: { type: "object", value: `https://grok.com/project/${wire.projectId}` } };
		if (expression.includes("const scrollables = Array.from(dialog.querySelectorAll")) {
			pages++;
			if (failed) throw new Error("fixture project history failure");
			const ids = empty ? [] : wire.projectId === "p" ? ["p1", "p2", "p3"] : ["q1"];
			const nodes = ids.map((id) => ({
				textContent: id,
				getAttribute: (name: string) =>
					name === "href" ? `https://grok.com/project/${wire.projectId}?chat=${id}` : null,
				closest: (selector: string): unknown =>
					selector === "[data-project-id]" ? { getAttribute: () => wire.projectId } : null,
				querySelector: () => null,
				querySelectorAll: () => [],
			}));
			const dialog = {
				textContent: empty ? "Chats No chats found" : "Chats",
				scrollHeight: 100,
				clientHeight: 100,
				scrollTop: 0,
				querySelector: () => null,
				querySelectorAll: (selector: string) => (selector.includes('role="option"') ? nodes : []),
			};
			const value = runInNewContext(expression, {
				document: {
					querySelector: () => dialog,
					createTreeWalker: (node: { textContent: string }) => {
						let done = false;
						return {
							currentNode: { nodeValue: node.textContent },
							nextNode: () => {
								if (done) return false;
								done = true;
								return true;
							},
						};
					},
				},
				location: { origin: "https://grok.com" },
				URL,
				NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
			});
			return { result: { type: "object", value } };
		}
		if (
			expression.includes("const root =") &&
			expression.includes("start a conversation in this project")
		)
			return { result: { type: "object", value: true } };
		if (expression.includes("const root =") && expression.includes("const now = Date.now()"))
			return {
				result: {
					type: "object",
					value: {
						items: [
							{
								id: "mounted-only",
								title: "Mounted row",
								url: `https://grok.com/project/${wire.projectId}?chat=mounted-only`,
							},
						],
					},
				},
			};
		return original({ expression });
	};
	Object.assign(client, { Page: { enable: async () => undefined } });
	Object.assign(client.Runtime, { enable: async () => undefined });
	wire.client = client;
	const list = createGrokAdapter().listConversations;
	if (!list) throw new Error("Missing public Grok listing");
	const options = { host: "localhost", port: 1, tabTargetId: "fixture-target", ...base.options };
	return {
		pages: () => pages,
		read: async (projectId: string, overrides: BrowserProviderListOptions = {}) => {
			wire.projectId = projectId;
			return readBoundedConversations(
				{ listConversations: list } as never,
				projectId,
				overrides.historyLimit ?? 2,
				{
					listOptions: { ...options, ...overrides },
					observation: { provider: "grok", runtimeProfileId: "fixture" },
				},
			);
		},
	};
}

test("nonempty public project reads publish bounded cursor coverage instead of mounted rows", async () => {
	const surface = await fixture();
	const result = await surface.read("p");
	expect(result.historyCoverage).toMatchObject({
		state: "incomplete",
		scope: "project",
		reason: "item-limit",
		loadedCount: 2,
		nextCursor: expect.any(String),
	});
	expect(result.items.map((row) => row.id)).toEqual(["p1", "p2"]);
	expect(result.truncated).toBe(true);
	expect(surface.pages()).toBe(1);
});

test("collector disk restart resumes project p to its qualified boundary before visiting q", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok441-restart-"));
	setAuracallHomeDirOverrideForTest(root);
	const custody = { runtimeProfileId: "fixture", identityKey: "operator@example.test" };
	const projects = ["p", "q"].map((id) => ({ id, name: id, provider: "grok" as const }));
	const initial = {
		version: 1 as const,
		phase: "backfill" as const,
		nextScope: 1,
		scopes: [
			{ projectId: null, cursor: null, complete: true },
			...projects.map((project) => ({ projectId: project.id, cursor: null, complete: false })),
		],
		items: [],
		updatedAt: "2026-10-25T00:00:00Z",
	};
	const visits: string[] = [];
	try {
		await createGrokIndexCheckpointStore(root, custody).write(initial);
		for (let cycle = 0; cycle < 3; cycle++) {
			// New store and transport for each collector cycle: no retained page state.
			const store = createGrokIndexCheckpointStore(root, custody);
			const checkpoint = await store.read();
			const result = await collectGrokMirrorIndex({
				projects,
				maxRows: 2,
				maxReads: 4,
				checkpoint,
				commit: store.write,
				read: async (projectId, historyCursor, historyLimit, historyMaxPages) => {
					if (!projectId) throw new Error("Completed root must not be revisited");
					visits.push(projectId);
					return (await fixture()).read(projectId, {
						historyCursor,
						historyLimit,
						historyMaxPages,
					});
				},
			});
			if (cycle === 0) {
				expect(result.checkpoint.scopes[1]).toMatchObject({
					projectId: "p",
					complete: false,
					cursor: expect.any(String),
				});
				expect(result.checkpoint.nextScope).toBe(1);
				expect(result.items.map((row) => row.id)).toEqual(["p1", "p2"]);
				const saved = await store.read();
				const aborted = new AbortController();
				aborted.abort(new Error("operator interrupted"));
				await expect(
					collectGrokMirrorIndex({
						projects,
						maxRows: 2,
						maxReads: 4,
						checkpoint: saved,
						commit: store.write,
						abortSignal: aborted.signal,
						read: async () => {
							throw new Error("must not read");
						},
					}),
				).rejects.toThrow("operator interrupted");
				expect(await store.read()).toEqual(saved);
				const paused = await collectGrokMirrorIndex({
					projects,
					maxRows: 2,
					maxReads: 4,
					checkpoint: saved,
					commit: store.write,
					read: async (projectId, historyCursor) =>
						(await fixture()).read(projectId ?? "", {
							historyCursor,
							historyShouldYield: () => true,
						}),
				});
				expect(paused.progress.state).toBe("paused");
				expect(paused.checkpoint.scopes).toEqual(saved?.scopes);
				expect(paused.checkpoint.nextScope).toBe(1);
				const beforeFailedRead = await store.read();
				await expect(
					collectGrokMirrorIndex({
						projects,
						maxRows: 2,
						maxReads: 4,
						checkpoint: beforeFailedRead,
						commit: store.write,
						read: async (projectId, historyCursor) =>
							(await fixture({ failed: true })).read(projectId ?? "", { historyCursor }),
					}),
				).rejects.toThrow("fixture project history failure");
				expect(await store.read()).toEqual(beforeFailedRead);
				expect(
					await createGrokIndexCheckpointStore(root, {
						...custody,
						identityKey: "other@example.test",
					}).read(),
				).toBeNull();
			}
			if (cycle === 2) {
				expect(result.checkpoint.phase).toBe("follow");
				expect(result.truncated).toBe(false);
				expect(result.progress.completedScopes).toBe(3);
				expect(result.items.map((row) => row.id)).toEqual(["p1", "p2", "p3", "q1"]);
				expect(JSON.stringify(result.progress)).not.toContain("nextCursor");
			}
		}
		expect(visits).toEqual(["p", "p", "q", "q"]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("project empty, yielded and failed reads preserve explicit public coverage and status", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok441-status-"));
	setAuracallHomeDirOverrideForTest(root);
	const { recordGrokHistoryProgress } = await import("../../src/browser/grokHistoryProgress.js");
	const { createBrowserTabConcurrencyRuntime } = await import(
		"../../src/browser/tabConcurrencyRuntime.js"
	);
	const status = () =>
		createBrowserTabConcurrencyRuntime({ auracallProfile: "fixture" } as never).readStatus();
	const progress = (coverage: Parameters<typeof recordGrokHistoryProgress>[1]) =>
		recordGrokHistoryProgress("fixture", coverage);
	try {
		const empty = await (await fixture({ empty: true })).read("p", {
			onHistoryInventory: progress,
		});
		expect(empty.items).toEqual([]);
		expect(empty.historyCoverage).toMatchObject({
			state: "empty",
			reason: "explicit-empty",
			nextCursor: null,
		});
		expect((await status()).providerControls?.grok.historyInventory).toMatchObject({
			state: "empty",
			scope: "project",
		});
		const partial = await (await fixture()).read("p", { onHistoryInventory: progress });
		const cursor = partial.historyCoverage?.nextCursor;
		expect((await status()).providerControls?.grok.historyInventory).toMatchObject({
			state: "incomplete",
			reason: "item-limit",
			scope: "project",
			nextCursorAvailable: true,
		});
		const yielded = await (await fixture()).read("p", {
			historyCursor: cursor,
			historyShouldYield: () => true,
			onHistoryInventory: progress,
		});
		expect(yielded.items).toEqual([]);
		expect(yielded.historyCoverage).toMatchObject({
			state: "incomplete",
			reason: "foreground-yield",
			nextCursor: cursor,
			pages: 0,
		});
		expect((await status()).providerControls?.grok.historyInventory).toMatchObject({
			state: "incomplete",
			reason: "foreground-yield",
		});
		await expect(
			(await fixture({ failed: true })).read("p", {
				historyCursor: cursor,
				onHistoryInventory: progress,
			}),
		).rejects.toThrow("fixture project history failure");
		const failedStatus = (await status()).providerControls?.grok.historyInventory;
		expect(failedStatus).toMatchObject({ state: "failed", scope: "project" });
		expect(JSON.stringify(failedStatus)).not.toContain(String(cursor));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
