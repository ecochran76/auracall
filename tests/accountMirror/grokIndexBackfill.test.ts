import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { createChatgptAccountMirrorMetadataCollector } from "../../src/accountMirror/chatgptMetadataCollector.js";
import {
	collectGrokMirrorIndex,
	createGrokIndexCheckpointStore,
} from "../../src/accountMirror/grokIndexBackfill.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import type { GrokHistoryCoverage } from "../../src/browser/providers/grokHistoryInventory.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

const coverage = (nextCursor: string | null): GrokHistoryCoverage => ({
	state: nextCursor ? "incomplete" : "complete",
	source: "visible-chats",
	scope: "root",
	reason: nextCursor ? "row-limit" : "visible-bottom",
	loadedCount: 1,
	pages: 1,
	nextCursor,
	observedAt: "2026-10-24T23:00:00Z",
});
test("restart resumes qualified rows and cursor together and isolates account custody", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok-index-"));
	try {
		const store = createGrokIndexCheckpointStore(root, {
			runtimeProfileId: "one",
			identityKey: "one@example.com",
		});
		const first = await collectGrokMirrorIndex({
			projects: [],
			maxRows: 1,
			maxReads: 1,
			checkpoint: await store.read(),
			commit: store.write,
			read: async (_id, cursor) => {
				expect(cursor).toBeNull();
				return {
					items: [{ id: "one", title: "One", provider: "grok" }],
					historyCoverage: coverage("cursor-one"),
				};
			},
		});
		expect(first.truncated).toBe(true);
		const second = await collectGrokMirrorIndex({
			projects: [],
			maxRows: 1,
			maxReads: 1,
			checkpoint: await store.read(),
			commit: store.write,
			read: async (_id, cursor) => {
				expect(cursor).toBe("cursor-one");
				return {
					items: [{ id: "two", title: "Two", provider: "grok" }],
					historyCoverage: coverage(null),
				};
			},
		});
		expect(second.items.map((x) => x.id)).toEqual(["one", "two"]);
		expect((await store.read())?.phase).toBe("follow");
		expect(
			await createGrokIndexCheckpointStore(root, {
				runtimeProfileId: "one",
				identityKey: "other@example.com",
			}).read(),
		).toBeNull();
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
test("foreground yield starts no read and retains the last committed continuation", async () => {
	let reads = 0;
	const result = await collectGrokMirrorIndex({
		projects: [],
		maxRows: 10,
		maxReads: 2,
		shouldYield: () => true,
		read: async () => {
			reads++;
			throw new Error("must not read");
		},
	});
	expect(reads).toBe(0);
	expect(result.progress.state).toBe("paused");
	expect(result.truncated).toBe(true);
});
test("completed scope checkpoints point to the next unfinished project", async () => {
	const result = await collectGrokMirrorIndex({
		projects: [{ id: "p", name: "Project", provider: "grok" }],
		maxRows: 1,
		maxReads: 1,
		read: async () => ({
			items: [{ id: "one", title: "One", provider: "grok" }],
			historyCoverage: coverage(null),
		}),
	});
	expect(result.checkpoint.nextScope).toBe(1);
});

test("public metadata collector resumes Grok root then project history after restart", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok-collector-"));
	setAuracallHomeDirOverrideForTest(root);
	try {
		const identity = { email: "one@example.com", source: "auth-session" };
		const authority = createProviderSessionAuthority({
			profiles: { default: { services: { grok: { identity } } } },
		});
		const context = {
			providerId: "grok" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			managedBrowserProfile: "/tmp/grok-test",
			browserProcessId: 1234,
			browserTargetId: "grok-target",
		};
		const proof = await authority.verify({
			context,
			expectation: authority.resolveExpectation(context),
			observation: identity,
		});
		let projectReads = 0;
		let foreground = false;
		const calls: (string | undefined)[] = [];
		const client = {
			getProviderSessionProof: async () => proof,
			listProjects: async () => {
				projectReads++;
				return [
					{ id: "p", name: "Project", provider: "grok" },
					{ id: "q", name: "Other", provider: "grok" },
				];
			},
			listConversations: async (id: string | undefined, options: BrowserProviderListOptions) => {
				calls.push(id);
				await options.onHistoryInventory?.({ ...coverage(null), scope: id ? "project" : "root" });
				return [
					{
						id: id ? `${id}-chat` : "root-chat",
						title: "Chat",
						provider: "grok",
						...(id ? { projectId: id } : {}),
					},
				];
			},
			listAccountFiles: async () => [],
			listProjectFiles: async () => [],
			listConversationFiles: async () => [],
			getConversationContext: async () => ({
				provider: "grok",
				conversationId: "root-chat",
				messages: [],
			}),
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
			expectedIdentityKey: "one@example.com",
			shouldYield: () => foreground,
			limits: {
				maxPageReadsPerCycle: 1,
				maxConversationRowsPerCycle: 1,
				maxArtifactRowsPerCycle: 1,
				maxBrowserInteractionsPerMinute: 100,
			},
			interactionGovernor: { beforeInteraction: async () => undefined },
		};
		const first = await createChatgptAccountMirrorMetadataCollector(config as never, {
			createClient: () => client as never,
		}).collect(input);
		expect(first.manifests.projects).toHaveLength(2);
		const second = await createChatgptAccountMirrorMetadataCollector(config as never, {
			createClient: () => client as never,
		}).collect(input);
		expect(second.evidence.grokIndex?.phase).toBe("backfill");
		const third = await createChatgptAccountMirrorMetadataCollector(config as never, {
			createClient: () => client as never,
		}).collect(input);
		expect(calls).toEqual([undefined, "p", "q"]);
		expect(third.manifests.conversations.map((x) => x.id)).toEqual([
			"root-chat",
			"p-chat",
			"q-chat",
		]);
		expect(third.evidence.grokIndex?.phase).toBe("follow");
		expect(JSON.stringify(second.evidence)).not.toContain("nextCursor");
		foreground = true;
		const paused = await createChatgptAccountMirrorMetadataCollector(config as never, {
			createClient: () => client as never,
		}).collect(input);
		expect(projectReads).toBe(3);
		expect(calls).toHaveLength(3);
		expect(paused.evidence.grokIndex?.state).toBe("paused");
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(root, { recursive: true, force: true });
	}
});
test("opaque continuation stays out of returned catalog rows and public progress", async () => {
	const result = await collectGrokMirrorIndex({
		projects: [],
		maxRows: 1,
		maxReads: 1,
		read: async () => ({
			items: [
				{
					id: "one",
					title: "One",
					provider: "grok",
					metadata: { grokInventory: coverage("private-cursor") },
				},
			],
			historyCoverage: coverage("private-cursor"),
		}),
	});
	expect(JSON.stringify(result.items)).not.toContain("private-cursor");
	expect(JSON.stringify(result.progress)).not.toContain("private-cursor");
	expect(result.checkpoint.scopes[0].cursor).toBe("private-cursor");
});

test("cancellation during a project read preserves the previous atomic scope commit", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok-cancel-"));
	try {
		const store = createGrokIndexCheckpointStore(root, {
			runtimeProfileId: "default",
			identityKey: "one@example.com",
		});
		const abort = new AbortController();
		await expect(
			collectGrokMirrorIndex({
				projects: [{ id: "p", name: "P", provider: "grok" }],
				maxRows: 10,
				maxReads: 2,
				commit: store.write,
				abortSignal: abort.signal,
				read: async (id) => {
					if (id) {
						abort.abort(new Error("cancelled page"));
						return {
							items: [{ id: "uncommitted", title: "Uncommitted", provider: "grok" }],
							historyCoverage: coverage("unsafe-cursor"),
						};
					}
					return {
						items: [{ id: "retained", title: "Retained", provider: "grok" }],
						historyCoverage: coverage(null),
					};
				},
			}),
		).rejects.toThrow("cancelled page");
		const persisted = await store.read();
		expect(persisted?.items.map((x) => x.id)).toEqual(["retained"]);
		expect(persisted?.nextScope).toBe(1);
		expect(persisted?.scopes[1].cursor).toBeNull();
		const resumed = await collectGrokMirrorIndex({
			projects: [{ id: "p", name: "P", provider: "grok" }],
			maxRows: 1,
			maxReads: 1,
			checkpoint: persisted,
			commit: store.write,
			read: async (id, cursor) => {
				expect(id).toBe("p");
				expect(cursor).toBeNull();
				return {
					items: [{ id: "replayed", title: "Replayed", provider: "grok" }],
					historyCoverage: coverage(null),
				};
			},
		});
		expect(resumed.items.map((x) => x.id)).toEqual(["retained", "replayed"]);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("foreground yield prevents the Grok account-file phase from starting", async () => {
	const { readBoundedGrokDetailInventory } = await import(
		"../../src/accountMirror/chatgptMetadataCollector.js"
	);
	let reads = 0;
	const result = await readBoundedGrokDetailInventory(
		{
			listAccountFiles: async () => {
				reads++;
				return [];
			},
		} as never,
		[],
		10,
		{ shouldYield: () => true, maxDetailReads: 1 },
	);
	expect(reads).toBe(0);
	expect(result.cursor.yielded).toBe(true);
});

test("one shared page budget covers root and project scopes", async () => {
	let reads = 0;
	await collectGrokMirrorIndex({
		projects: [{ id: "p", name: "P", provider: "grok" }],
		maxRows: 10,
		maxReads: 2,
		read: async () => {
			reads++;
			return { items: [], historyCoverage: { ...coverage(null), pages: 2 } };
		},
	});
	expect(reads).toBe(1);
});

test("public status retains sanitized Grok continuation progress alongside operation failure", async () => {
	const { createAccountMirrorStatusRegistry } = await import(
		"../../src/accountMirror/statusRegistry.js"
	);
	const registry = createAccountMirrorStatusRegistry({
		config: {
			runtimeProfiles: {
				default: {
					browserProfile: "default",
					services: {
						grok: { identity: { email: "one@example.com" }, liveFollow: { enabled: true } },
					},
				},
			},
		},
		now: () => new Date("2026-10-24T23:00:05Z"),
	});
	registry.mergeState(
		{ provider: "grok", runtimeProfileId: "default" },
		{
			detectedIdentityKey: "one@example.com",
			lastSuccessAtMs: Date.parse("2026-10-24T22:59:00Z"),
			lastFailureAtMs: Date.parse("2026-10-24T23:00:00Z"),
			consecutiveFailureCount: 1,
			metadataEvidence: {
				identitySource: "auth-session",
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: { projects: false, conversations: true, artifacts: false },
				grokIndex: {
					phase: "backfill",
					state: "paused",
					completedScopes: 1,
					totalScopes: 2,
					retainedRows: 10,
					omissions: ["Bot scopes unobserved"],
					nextCursor: "must-not-leak",
				} as never,
			},
		},
	);
	const entry = registry.readStatus({}).entries.find((x) => x.provider === "grok");
	expect(entry?.metadataEvidence?.grokIndex).toEqual({
		phase: "backfill",
		state: "paused",
		completedScopes: 1,
		totalScopes: 2,
		retainedRows: 10,
		omissions: ["Bot scopes unobserved"],
	});
	expect(entry?.lastFailureAt).toBe("2026-10-24T23:00:00.000Z");
	expect(JSON.stringify(entry)).not.toContain("must-not-leak");
});

test("Grok project discovery retains a bounded inventory beyond the legacy 25-row window", async () => {
	const { readBoundedProjects } = await import(
		"../../src/accountMirror/chatgptMetadataCollector.js"
	);
	const projects = Array.from({ length: 26 }, (_, index) => ({
		id: `p${index}`,
		name: `Project ${index}`,
		provider: "grok" as const,
	}));
	const result = await readBoundedProjects({ listProjects: async () => projects } as never, 1, {
		maxProjectRows: 10000,
	});
	expect(result.items).toHaveLength(26);
	expect(result.truncated).toBe(false);
});

test('page-level foreground yield is publicly paused rather than ordinary partial work', async () => {
 const result=await collectGrokMirrorIndex({projects:[],maxRows:10,maxReads:2,read:async()=>({items:[],historyCoverage:{...coverage('retained-anchor'),reason:'foreground-yield'}})});
 expect(result.progress.state).toBe('paused');
});
