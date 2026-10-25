import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createChatgptAccountMirrorMetadataCollector } from "../../src/accountMirror/chatgptMetadataCollector.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { collectGrokHistoryInventory } from "../../src/browser/providers/grokHistoryInventory.js";
import { createGrokIndexCheckpointStore } from "../../src/accountMirror/grokIndexBackfill.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

let root: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "grok443-follow-"));
	setAuracallHomeDirOverrideForTest(root);
});
afterEach(async () => {
	setAuracallHomeDirOverrideForTest(null);
	await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
	const identity = { email: "one@example.test", source: "auth-session" };
	const authority = createProviderSessionAuthority({ services: { grok: { identity } } });
	const context = {
		providerId: "grok" as const,
		auracallRuntimeProfile: "default",
		browserProfile: "default",
		managedBrowserProfile: "/fixture/grok443",
		browserProcessId: 1234,
		browserTargetId: "fixture",
	};
	const proof = await authority.verify({
		context,
		expectation: authority.resolveExpectation(context),
		observation: identity,
	});
	const rows = ["a", "b", "c", "d"].map((id) => ({
		id,
		title: id,
		provider: "grok" as const,
		updatedAt: "2026-10-25T01:00:00Z",
	}));
	const calls: BrowserProviderListOptions[] = [];
	const projects: { id: string; name: string; provider: "grok" }[] = [];
	let fail = false;
	const client = {
		getProviderSessionProof: async () => proof,
		listProjects: async () => projects,
		listConversations: async (
			_project: string | undefined,
			options: BrowserProviderListOptions,
		) => {
			calls.push(options);
			if (fail) throw new Error("fresh observation failed");
			const inventory = await collectGrokHistoryInventory({
				projectId: _project,
				options,
				onProgress: options.onHistoryInventory,
				readPage: async () => ({
					items: rows
						.filter((row) =>
							_project
								? (row as { projectId?: string }).projectId === _project
								: !(row as { projectId?: string }).projectId,
						)
						.map((row) => ({
							...row,
							timestamp: Date.parse(row.updatedAt),
							url: _project
								? `https://grok.com/project/${_project}?chat=${row.id}`
								: `https://grok.com/c/${row.id}`,
						})),
					atBottom: true,
					emptyEvidence: rows.length === 0,
				}),
			});
			return inventory.items;
		},
		listAccountFiles: async () => [],
		listProjectFiles: async () => [],
		listConversationFiles: async () => [],
		getConversationContext: async () => ({ provider: "grok", conversationId: "a", messages: [] }),
	};
	const config = {
		model: "gpt-5.2",
		browser: {},
		runtimeProfiles: {
			default: {
				browserProfile: "default",
				defaultService: "grok",
				services: { grok: { identity } },
			},
		},
	};
	const input = {
		provider: "grok" as const,
		runtimeProfileId: "default",
		expectedIdentityKey: identity.email,
		limits: {
			maxPageReadsPerCycle: 1,
			maxConversationRowsPerCycle: 2,
			maxArtifactRowsPerCycle: 1,
			maxBrowserInteractionsPerMinute: 100,
		},
		interactionGovernor: { beforeInteraction: async () => undefined },
	};
	return {
		rows,
		calls,
		projects,
		fail: () => {
			fail = true;
		},
		collect: (overrides = {}) =>
			createChatgptAccountMirrorMetadataCollector(config as never, {
				createClient: () => client as never,
			}).collect({ ...input, ...overrides }),
	};
}

test("unchanged completed account larger than one cycle remains follow after restart", async () => {
	const surface = await fixture();
	expect((await surface.collect()).evidence.grokIndex?.phase).toBe("backfill");
	expect((await surface.collect()).evidence.grokIndex?.phase).toBe("backfill");
	expect((await surface.collect()).evidence.grokIndex?.phase).toBe("follow");
	const followed = await surface.collect();
	expect(followed.evidence.grokIndex).toMatchObject({
		phase: "follow",
		changedRows: 0,
		requiresFullSweep: true,
		observationCoverage: "partial",
	});
	expect(surface.calls.at(-1)?.historyCursor).toBeNull();
	expect(surface.calls.at(-1)?.historyKnownRows).toHaveLength(4);
	expect(followed.manifests.conversations.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
});

async function complete(surface: Awaited<ReturnType<typeof fixture>>) {
	for (let cycle = 0; cycle < 4; cycle++)
		if ((await surface.collect()).evidence.grokIndex?.phase === "follow") return;
	throw new Error("fixture backfill failed to complete");
}

test("new head changes span bounded restart cycles and new scopes receive fair discovery", async () => {
	const surface = await fixture();
	await complete(surface);
	surface.rows.unshift(
		...["n1", "n2", "n3"].map((id) => ({
			id,
			title: id,
			provider: "grok" as const,
			updatedAt: "2026-10-25T02:00:00Z",
		})),
	);
	const first = await surface.collect();
	expect(first.evidence.grokIndex).toMatchObject({ phase: "follow", changedRows: 2 });
	surface.projects.push({ id: "p", name: "New project", provider: "grok" });
	surface.rows.push({
		id: "p1",
		title: "Project row",
		provider: "grok",
		updatedAt: "2026-10-25T02:00:00Z",
		projectId: "p",
	} as never);
	const second = await surface.collect();
	expect(second.evidence.grokIndex?.phase).toBe("follow");
	expect(surface.calls.at(-1)?.historyCursor).not.toBeNull();
	let latest = second;
	for (
		let cycle = 0;
		cycle < 4 && !latest.manifests.conversations.some((row) => row.id === "p1");
		cycle++
	)
		latest = await surface.collect();
	expect(latest.manifests.conversations.map((row) => row.id)).toEqual(
		expect.arrayContaining(["n1", "n2", "n3", "p1"]),
	);
	expect(latest.evidence.grokIndex?.phase).toBe("follow");
	surface.rows[0].title = "Changed head";
	for (let cycle = 0; cycle < 3; cycle++) latest = await surface.collect();
	expect(latest.manifests.conversations.find((row) => row.id === "n1")?.title).toBe("Changed head");
});

test("unobserved older changes require an explicit bounded full sweep", async () => {
	const surface = await fixture();
	await complete(surface);
	surface.rows[3].title = "Changed older row";
	const head = await surface.collect();
	expect(head.manifests.conversations.find((row) => row.id === "d")?.title).toBe("d");
	expect(head.evidence.grokIndex).toMatchObject({
		phase: "follow",
		requiresFullSweep: true,
		observationCoverage: "partial",
	});
	const sweep = await surface.collect({ sweepMode: "full_sweep" });
	expect(sweep.evidence.grokIndex?.phase).toBe("backfill");
	expect(sweep.evidence.truncated.conversations).toBe(true);
	let latest = sweep;
	for (let cycle = 0; cycle < 3 && latest.evidence.grokIndex?.phase !== "follow"; cycle++)
		latest = await surface.collect({ sweepMode: "full_sweep" });
	expect(latest.evidence.grokIndex?.phase).toBe("follow");
	expect(latest.manifests.conversations.find((row) => row.id === "d")?.title).toBe(
		"Changed older row",
	);
});

test("yield, cancellation and failed fresh follow observations preserve durable account state", async () => {
	const surface = await fixture();
	await complete(surface);
	const store = createGrokIndexCheckpointStore(path.join(root, "cache"), {
		runtimeProfileId: "default",
		identityKey: "one@example.test",
	});
	const before = await store.read();
	const yielded = await surface.collect({ shouldYield: () => true });
	expect(yielded.evidence.grokIndex).toMatchObject({ phase: "follow", state: "paused" });
	expect(await store.read()).toEqual(before);
	const abort = new AbortController();
	abort.abort(new Error("operator cancelled"));
	await expect(surface.collect({ abortSignal: abort.signal })).rejects.toThrow(
		"operator cancelled",
	);
	expect(await store.read()).toEqual(before);
	surface.fail();
	await expect(surface.collect()).rejects.toThrow("fresh observation failed");
	expect(await store.read()).toEqual(before);
	expect(
		await createGrokIndexCheckpointStore(path.join(root, "cache"), {
			runtimeProfileId: "default",
			identityKey: "other@example.test",
		}).read(),
	).toBeNull();
});
