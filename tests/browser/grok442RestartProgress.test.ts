// biome-ignore-all lint/style/useNamingConvention: CDP wire names are case-sensitive.
import { runInNewContext } from "node:vm";
import { recordGrokHistoryProgress } from "../../src/browser/grokHistoryProgress.js";
import { GrokService } from "../../src/browser/llmService/providers/grokService.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";
import { runGrokConversationsCommand } from "../../src/cli/grokConversationsCommand.js";
import { createResponsesHttpServer } from "../../src/http/responsesServer.js";
import { createGrokConversationsToolHandler } from "../../src/mcp/tools/grokConversations.js";
import {
	connectorDomFixture,
	fixtureConnectorServiceOptions,
} from "./grok404ConnectorDomFixture.js";

/** Controlled CDP fixture: real auth/page expressions; generic Show All dispatch
 * is a protocol response. Opener/physical pointer acceptance is primary-owned. */
function restartFixture({
	empty = true,
	cleanupFails = false,
	email = "operator@example.test",
	rows = [] as Array<{ id: string; title: string }>,
	swapAccount = false,
	targetId = "fixture-target",
} = {}) {
	const identity = connectorDomFixture({ userEmail: email });
	let loaded = 2;
	let pageReads = 0;
	let open = true,
		targetClosed = false;
	const input = { getAttribute: () => null };
	const rowNodes = rows.map((row) => ({
		textContent: row.title,
		getAttribute: (key: string) => (key === "data-value" ? `conversation:${row.id}` : null),
		closest: (_selector: string): unknown => null,
		querySelector: () => null,
		querySelectorAll: () => [],
	}));
	const dialog = {
		textContent: empty ? "Chats\nNo chats found" : "Chats",
		get scrollHeight() {
			return loaded < rows.length ? 200 : 100;
		},
		clientHeight: 100,
		get scrollTop() {
			return 0;
		},
		set scrollTop(_value: number) {
			loaded = Math.min(rows.length, loaded + 2);
		},
		querySelector: (selector: string) =>
			selector.includes("combobox") || selector === '[role="tab"]' ? input : null,
		querySelectorAll: (selector: string) =>
			selector.includes('role="option"') ? rowNodes.slice(0, loaded) : [],
	};
	const document = {
		querySelector: (selector: string) => (selector.includes("dialog") && open ? dialog : null),
		body: {
			dispatchEvent: () => {
				open = false;
			},
		},
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
	};
	const client = {
		Runtime: {
			evaluate: async ({ expression }: { expression: string }) => {
				if (expression.includes("guestAuthCta") || expression.includes("const identity ="))
					return identity.runtime.evaluate({ expression }).then((response) => ({
						result: { type: "object" as const, value: response.result.value },
					}));
				if (
					expression.includes("const projectId") ||
					expression.includes("hasConversationLink") ||
					expression.startsWith("!Boolean") ||
					expression.includes("document.body.dispatchEvent(new KeyboardEvent")
				) {
					if (expression.includes("const projectId")) pageReads++;
					const value = runInNewContext(expression, {
						document,
						location: { origin: "https://grok.com" },
						URL,
						NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
						KeyboardEvent: class {
							constructor(readonly type: string) {}
						},
					});
					if (expression.includes("const projectId") && swapAccount)
						identity.setUserEmail("other@example.test");
					return { result: { type: "object" as const, value } };
				}
				return {
					result: { type: "object" as const, value: { ok: true, matchedLabel: "Show All" } },
				};
			},
		},
		close: async () => {
			if (cleanupFails) throw new Error("private cleanup token=secret");
		},
		__auracallProviderTrafficGovernor: {
			attribution: { provider: "grok", targetId },
			admitBackendRequest: async () => {},
			begin: async () => ({ settle: async () => {} }),
		},
	};
	return {
		options: fixtureConnectorServiceOptions(),
		client,
		dependencies: {
			connect: async () => ({
				client,
				targetId,
				shouldClose: true,
				host: "localhost",
				port: 1,
			}),
			closeTarget: async () => {
				targetClosed = true;
			},
		},
		targetWasClosed: () => targetClosed,
		pageReads: () => pageReads,
	};
}

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { createConfiguredProviderTrafficAuthorityFactory } from "../../src/browser/configuredProviderTrafficAuthority.js";
import { createGrokConversationsService } from "../../src/browser/grokConversationsService.js";

function ownedHistoryFixture(
	rows: Array<{ id: string; title: string }>,
	beforeConnect?: (
		input: import("../../src/browser/providers/types.js").BrowserProviderListOptions,
		factory: ReturnType<typeof createConfiguredProviderTrafficAuthorityFactory>,
	) => Promise<void>,
) {
	const options = fixtureConnectorServiceOptions();
	const factory = createConfiguredProviderTrafficAuthorityFactory({
		userConfig: {
			auracallProfile: "default",
			services: { grok: { identity: { email: "operator@example.test" } } },
		} as never,
		provider: "grok",
		managedBrowserProfile: "/fixture/grok",
		mutationAudit: async () => undefined,
		baseOptions: { ...options, interactionGovernor: { beforeInteraction: async () => {} } },
	});
	const targets = new Map<string, ReturnType<typeof restartFixture>>();
	let serial = 0;
	const dependencies = {
		continuationTransport: {
			list: async () => Array.from(targets.keys()).map((id) => ({ id, url: "https://grok.com/" })),
			open: async () => {
				const id = `history-${++serial}`;
				targets.set(id, restartFixture({ empty: false, rows, targetId: id }));
				return { id };
			},
			close: async (_host: string, _port: number, id: string) => {
				targets.delete(id);
			},
		},
		connect: async (
			input: import("../../src/browser/providers/types.js").BrowserProviderListOptions,
		) => {
			const target = targets.get(input.tabTargetId ?? "");
			if (!target) throw new Error("Only exact owned target connection is allowed");
			if (input.providerSessionAuthorization)
				input.providerSessionAuthorization.context = {
					...input.providerSessionAuthorization.context,
					browserTargetId: input.tabTargetId,
				};
			await beforeConnect?.(input, factory);
			const authority = await (input.providerTrafficAuthorityFactory ?? factory).acquire({
				targetId: input.tabTargetId ?? "",
				borrowedLease: input.historyOwnedLease,
			});
			return {
				client: {
					...target.client,
					__auracallProviderTrafficGovernor: authority.governor,
					close: async () => {
						await target.client.close();
						await authority.close();
					},
				},
				targetId: input.tabTargetId,
				shouldClose: false,
				host: "localhost",
				port: 1,
			};
		},
	};
	return {
		options,
		dependencies,
		targets,
		factory,
		pageReads: () =>
			Array.from(targets.values()).reduce((sum, target) => sum + target.pageReads(), 0),
	};
}

// SPEC3: a fresh lazy view must survive bounded public calls and service recreation.
test("442: fresh public history restarts reach discoverable older rows under the same two-page bound", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-442-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		const rows = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: `Chat ${id}` }));
		const fixture = ownedHistoryFixture(rows);
		const first = await createGrokConversationsService(fixture.options, fixture.dependencies).list({
			maxPages: 2,
		});
		expect(first.items.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
		expect(first.coverage).toMatchObject({
			state: "incomplete",
			pages: 2,
			nextCursor: expect.any(String),
		});
		expect(fixture.targets.size).toBe(1);
		const second = await createGrokConversationsService(fixture.options, fixture.dependencies).list(
			{ maxPages: 2, cursor: first.coverage.nextCursor ?? undefined },
		);
		expect(second.items.map((row) => row.id)).toEqual(["e", "f"]);
		expect(second.coverage).toMatchObject({ state: "complete", pages: 2, nextCursor: null });
		expect(fixture.targets.size).toBe(0);
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test("442: a lost owned target rebuilds its anchor prefix across bounded retained calls", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-442-lost-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		const fixture = ownedHistoryFixture(
			["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: `Chat ${id}` })),
		);
		const first = await createGrokConversationsService(fixture.options, fixture.dependencies).list({
			maxPages: 2,
		});
		expect(first.items.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
		fixture.targets.clear(); // browser/target disappeared, not a reusable foreign tab
		const rebuilding = await createGrokConversationsService(
			fixture.options,
			fixture.dependencies,
		).list({ maxPages: 2, cursor: first.coverage.nextCursor ?? undefined });
		expect(rebuilding.items).toEqual([]);
		expect(rebuilding.coverage).toMatchObject({
			state: "incomplete",
			pages: 2,
			nextCursor: expect.any(String),
		});
		expect(fixture.targets.size).toBe(1);
		const resumed = await createGrokConversationsService(
			fixture.options,
			fixture.dependencies,
		).list({ maxPages: 2, cursor: rebuilding.coverage.nextCursor ?? undefined });
		expect(resumed.items.map((row) => row.id)).toEqual(["e", "f"]);
		expect(resumed.coverage).toMatchObject({ state: "complete", pages: 2, nextCursor: null });
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test("442: a removed anchor produces an explicit restart outcome instead of an endless cursor", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-442-anchor-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		const rows = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: `Chat ${id}` }));
		const fixture = ownedHistoryFixture(rows);
		const first = await createGrokConversationsService(fixture.options, fixture.dependencies).list({
			maxPages: 2,
		});
		fixture.targets.clear();
		rows.splice(3, 1);
		const rebuilding = await createGrokConversationsService(
			fixture.options,
			fixture.dependencies,
		).list({ maxPages: 2, cursor: first.coverage.nextCursor ?? undefined });
		expect(rebuilding.items).toEqual([]);
		const missing = await createGrokConversationsService(
			fixture.options,
			fixture.dependencies,
		).list({ maxPages: 2, cursor: rebuilding.coverage.nextCursor ?? undefined });
		expect(missing).toMatchObject({
			items: [],
			coverage: {
				state: "incomplete",
				reason: "cursor-restart-required",
				pages: 1,
				nextCursor: null,
			},
		});
		expect(fixture.targets.size).toBe(0);
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test("442: public mirror checkpoint retains bounded discovery progress across collector restarts", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-442-mirror-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		const { collectGrokMirrorIndex, createGrokIndexCheckpointStore } = await import(
			"../../src/accountMirror/grokIndexBackfill.js"
		);
		const fixture = ownedHistoryFixture(
			["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: `Chat ${id}` })),
		);
		const store = createGrokIndexCheckpointStore(home, {
			runtimeProfileId: "default",
			identityKey: "operator@example.test",
		});
		const read = async (
			projectId: string | null,
			cursor: string | null,
			limit: number,
			maxPages: number,
		) => {
			const result = await createGrokConversationsService(
				fixture.options,
				fixture.dependencies,
			).list({ projectId: projectId ?? undefined, cursor: cursor ?? undefined, limit, maxPages });
			return { items: result.items, historyCoverage: result.coverage };
		};
		const first = await collectGrokMirrorIndex({
			projects: [],
			maxRows: 10,
			maxReads: 2,
			read,
			checkpoint: await store.read(),
			commit: store.write,
		});
		expect(first.items.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
		expect(first.truncated).toBe(true);
		const second = await collectGrokMirrorIndex({
			projects: [],
			maxRows: 10,
			maxReads: 2,
			read,
			checkpoint: await store.read(),
			commit: store.write,
		});
		expect(second.items.map((row) => row.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
		expect(second.truncated).toBe(false);
		expect(second.checkpoint.phase).toBe("follow");
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test("442: foreground authority excludes active history reacquisition without losing its retained view", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-442-foreground-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		const fixture = ownedHistoryFixture(
			["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: `Chat ${id}` })),
		);
		const first = await createGrokConversationsService(fixture.options, fixture.dependencies).list({
			maxPages: 2,
		});
		const foreground = await fixture.factory.acquire({ targetId: "foreground-owned-target" });
		const blocked = await createGrokConversationsService(
			fixture.options,
			fixture.dependencies,
		).list({ maxPages: 2, cursor: first.coverage.nextCursor ?? undefined });
		expect(blocked).toMatchObject({ items: [], coverage: { state: "failed", nextCursor: null } });
		expect(fixture.targets.size).toBe(1);
		await foreground.close();
		const resumed = await createGrokConversationsService(
			fixture.options,
			fixture.dependencies,
		).list({ maxPages: 2, cursor: first.coverage.nextCursor ?? undefined });
		expect(resumed.items.map((row) => row.id)).toEqual(["e", "f"]);
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test("442: borrowed authority rejects a stale claim, different target and asserted foreign scope", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-442-borrow-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		let checked = false;
		const fixture = ownedHistoryFixture(
			["a", "b", "c"].map((id) => ({ id, title: `Chat ${id}` })),
			async (input, factory) => {
				const borrowed = input.historyOwnedLease;
				if (!borrowed) throw new Error("missing owned history claim");
				await expect(
					factory.acquire({ targetId: "foreign-target", borrowedLease: borrowed }),
				).rejects.toThrow("active target custody");
				await expect(
					factory.acquire({
						targetId: input.tabTargetId ?? "",
						borrowedLease: {
							...borrowed,
							claim: { ...borrowed.claim, revision: borrowed.claim.revision + 1 },
						},
					}),
				).rejects.toThrow("active target custody");
				await expect(
					factory.acquire({
						targetId: input.tabTargetId ?? "",
						borrowedLease: {
							...borrowed,
							scope: { ...borrowed.scope, tenantKey: "foreign-account" },
						},
					}),
				).rejects.toThrow("active target custody");
				checked = true;
			},
		);
		const result = await createGrokConversationsService(fixture.options, fixture.dependencies).list(
			{ maxPages: 1 },
		);
		expect(result.items.map((row) => row.id)).toEqual(["a", "b"]);
		expect(checked).toBe(true);
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test("442: concurrent query scopes share atomic account admission", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-442-race-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		const fixture = ownedHistoryFixture(
			["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: `Chat ${id}` })),
		);
		const results = await Promise.all(
			["2026-01-01", "2025-01-01"].map((since) =>
				createGrokConversationsService(fixture.options, fixture.dependencies).list({
					since,
					maxPages: 2,
				}),
			),
		);
		expect(results.map((result) => result.coverage.state).sort()).toEqual(["failed", "incomplete"]);
		expect(fixture.targets.size).toBe(1);
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test("442: persisted legacy v1 mirror cursors request a safe restart then deduplicate replay", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-442-migration-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		const { createHash } = await import("node:crypto");
		const { collectGrokMirrorIndex } = await import("../../src/accountMirror/grokIndexBackfill.js");
		const legacy = Buffer.from(
			JSON.stringify({
				v: 1,
				scope: createHash("sha256")
					.update(JSON.stringify([null, "", null]))
					.digest("hex"),
				after: "d",
			}),
		).toString("base64url");
		const fixture = ownedHistoryFixture(
			["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: `Chat ${id}` })),
		);
		const read = async (
			projectId: string | null,
			cursor: string | null,
			limit: number,
			maxPages: number,
		) => {
			const result = await createGrokConversationsService(
				fixture.options,
				fixture.dependencies,
			).list({ projectId: projectId ?? undefined, cursor: cursor ?? undefined, limit, maxPages });
			return { items: result.items, historyCoverage: result.coverage };
		};
		const checkpoint = {
			version: 1 as const,
			phase: "backfill" as const,
			nextScope: 0,
			scopes: [{ projectId: null, cursor: legacy, complete: false }],
			items: ["a", "b", "c", "d"].map((id) => ({
				id,
				title: `Chat ${id}`,
				provider: "grok" as const,
			})),
			updatedAt: new Date().toISOString(),
		};
		const restart = await collectGrokMirrorIndex({
			projects: [],
			maxRows: 10,
			maxReads: 2,
			checkpoint,
			read,
		});
		expect(restart.checkpoint.scopes[0]).toMatchObject({ cursor: null, complete: false });
		expect(fixture.targets.size).toBe(0);
		const first = await collectGrokMirrorIndex({
			projects: [],
			maxRows: 10,
			maxReads: 2,
			checkpoint: restart.checkpoint,
			read,
		});
		const last = await collectGrokMirrorIndex({
			projects: [],
			maxRows: 10,
			maxReads: 2,
			checkpoint: first.checkpoint,
			read,
		});
		expect(last.items.map((row) => row.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
		expect(last.checkpoint.phase).toBe("follow");
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test("442: real GrokService buildListOptions custody lends its lease to its configured authority", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-442-configured-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		const config = {
			auracallProfile: "default",
			browser: { cache: {} },
			services: { grok: { identity: { email: "operator@example.test" } } },
		} as never;
		const browserService = {
			resolveServiceTarget: async () => ({
				host: "localhost",
				port: 1,
				browserProcessId: 1,
				browserProfile: "default",
				managedBrowserProfile: "/fixture/grok",
				tab: null,
			}),
			getConfig: () => ({}),
		};
		const options = await GrokService.create(config, {
			browserService: browserService as never,
		}).buildListOptions(
			{ interactionGovernor: { beforeInteraction: async () => {} } },
			{ ensurePort: false },
		);
		const fixture = ownedHistoryFixture(
			["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: `Chat ${id}` })),
		);
		Object.assign(fixture.options, options);
		const first = await createGrokConversationsService(fixture.options, fixture.dependencies).list({
			maxPages: 2,
		});
		expect(first.items.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
		const last = await createGrokConversationsService(fixture.options, fixture.dependencies).list({
			maxPages: 2,
			cursor: first.coverage.nextCursor ?? undefined,
		});
		expect(last.items.map((row) => row.id)).toEqual(["e", "f"]);
		expect(last.coverage.state).toBe("complete");
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test("442: uncertain socket cleanup fences other queries and foreground admission", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-442-uncertain-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		const fixture = ownedHistoryFixture(
			["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: `Chat ${id}` })),
		);
		const first = await createGrokConversationsService(fixture.options, fixture.dependencies).list({
			maxPages: 2,
		});
		const target = Array.from(fixture.targets.values())[0];
		target.client.close = async () => {
			throw new Error("controlled uncertain socket cleanup");
		};
		const failed = await createGrokConversationsService(fixture.options, fixture.dependencies).list(
			{ maxPages: 2, cursor: first.coverage.nextCursor ?? undefined },
		);
		expect(failed).toMatchObject({
			items: [],
			coverage: { state: "failed", reason: "history-cleanup-unconfirmed", nextCursor: null },
		});
		await expect(fixture.factory.acquire({ targetId: "foreground" })).rejects.toThrow(
			"workload-owned",
		);
		const other = await createGrokConversationsService(fixture.options, fixture.dependencies).list({
			since: "2025-01-01",
			maxPages: 1,
		});
		expect(other).toMatchObject({ items: [], coverage: { state: "failed", nextCursor: null } });
		expect(fixture.targets.size).toBe(1);
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test("442: CLI, API, MCP and Ops preserve explicit restart-required continuation status", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-442-surfaces-"));
	setAuracallHomeDirOverrideForTest(home);
	let server: Awaited<ReturnType<typeof createResponsesHttpServer>> | undefined;
	try {
		const { createHash } = await import("node:crypto");
		const cursor = Buffer.from(
			JSON.stringify({
				v: 1,
				scope: createHash("sha256")
					.update(JSON.stringify([null, "", null]))
					.digest("hex"),
				after: "d",
			}),
		).toString("base64url");
		const fixture = ownedHistoryFixture([]);
		const resolve = () =>
			createGrokConversationsService(
				{
					...fixture.options,
					onHistoryInventory: (coverage) => recordGrokHistoryProgress("default", coverage),
				},
				fixture.dependencies,
			);
		const request = { cursor, maxPages: 2 };
		const expected = {
			state: "incomplete",
			reason: "cursor-restart-required",
			pages: 0,
			nextCursor: null,
		};
		expect((await runGrokConversationsCommand(request, resolve())).coverage).toMatchObject(
			expected,
		);
		expect(
			(await createGrokConversationsToolHandler(resolve)(request)).structuredContent,
		).toMatchObject({ items: [], coverage: expected });
		server = await createResponsesHttpServer(
			{ host: "127.0.0.1", port: 0 },
			{ grokConversationsServiceResolver: resolve },
		);
		const response = await fetch(`http://127.0.0.1:${server.port}/v1/grok/conversations/query`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(request),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ items: [], coverage: expected });
		const status = await createBrowserTabConcurrencyRuntime({
			auracallProfile: "default",
		} as never).readStatus();
		expect(status.providerControls?.grok.historyInventory).toMatchObject({
			state: "incomplete",
			reason: "cursor-restart-required",
			nextCursorAvailable: false,
		});
		expect(JSON.stringify(status.providerControls)).not.toContain(cursor);
		expect(fixture.targets.size).toBe(0);
	} finally {
		await server?.close();
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});
