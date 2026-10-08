// Provider-free acceptance probe. All state is temporary and browser work is denied.
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const root = "/home/ecochran76/.auracall/user-runtime/node_modules/auracall/dist/src";
const { setAuracallHomeDirOverrideForTest } = await import(root + "/auracallHome.js");
const { createAccountMirrorPersistence } = await import(
	root + "/accountMirror/cachePersistence.js"
);
const { createCacheStore } = await import(root + "/browser/llmService/cache/store.js");
const { normalizeAccountMirrorConversationWorkState } = await import(
	root + "/accountMirror/changeFrontierState.js"
);
const { deriveAccountMirrorConversationFreshness } = await import(
	root + "/accountMirror/conversationFreshness.js"
);
const { createChatgptAccountMirrorMetadataCollector } = await import(
	root + "/accountMirror/chatgptMetadataCollector.js"
);
const { createProviderSessionAuthority } = await import(
	root + "/browser/providers/providerSessionAuthority.js"
);
const { createAccountMirrorStatusRegistry } = await import(
	root + "/accountMirror/statusRegistry.js"
);
const { createAccountMirrorCompletionService } = await import(
	root + "/accountMirror/completionService.js"
);
const { createHistoryMaterializationService, createHistoryMaterializationJobStore } = await import(
	root + "/runtime/historyMaterializationService.js"
);
const expectedModuleHashes = {
	"accountMirror/chatgptMetadataCollector.js":
		"3c96978926273d9a078b3d689b56c5491c1526b6358316a346493d846c2ccb90",
	"accountMirror/completionService.js":
		"e78b81a7ff611ef7abe8b620a8cf9fee9f3eab8d5ed41fbf0ca304999f263fd2",
	"accountMirror/cachePersistence.js":
		"2dfea813ec7a53adfb3d2a851c107129612dc6444bb4c2a0def9e900791ab27b",
	"accountMirror/changeFrontierPlanner.js":
		"fa40d492e5b00e48e8162ac83e85a711dae942d148af0a13cd3ccfe5255da7b6",
	"accountMirror/changeFrontierState.js":
		"c9f845f9b2291e81dcac7843e6578268636ffe96202b9e6ea3b9d8c661982f03",
	"accountMirror/conversationFreshness.js":
		"9362a53e6779c121a5e4e07752b489870d252b15ecb8fbd54ab665b643185e6a",
	"accountMirror/statusRegistry.js":
		"eaccf0ea5cf5774c249a21bddfb9dab51a5f709033d1739326be00c6d63d8fcb",
	"browser/llmService/cache/store.js":
		"0fb42d9baead17e8ddacac151862bb3644c2946942c971452654a922b1a9109c",
	"browser/providers/providerSessionAuthority.js":
		"18948f4facd75808c714a0302fc6937e9625e7eff37ac0f47e6a1dc7a9f47f08",
	"runtime/historyMaterializationService.js":
		"556f4ff68f05fbec7537b64a42603a39c932d6fe0127af633dfd459e2a00657f",
	"auracallHome.js": "27893c96c39ae80ac8f18b4e4be4a468c73556816e02c4d7c8409ce0e1fd2469",
};
for (const [module, expected] of Object.entries(expectedModuleHashes)) {
	assert.equal(
		createHash("sha256")
			.update(await fs.readFile(root + "/" + module))
			.digest("hex"),
		expected,
		"Installed module changed: " + module,
	);
}
const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-0386-guard-composed-"));
setAuracallHomeDirOverrideForTest(home);
const config = {
	runtimeProfiles: {
		default: {
			browserProfile: "default",
			defaultService: "chatgpt",
			services: { chatgpt: { identity: { email: "operator@example.test" } } },
		},
	},
};
const context = {
	provider: "chatgpt",
	identityKey: "operator@example.test",
	userConfig: config,
	listOptions: {},
};
const row = { id: "guarded-G", title: "Guarded fixture", provider: "chatgpt" };
let completion;
const effects = {
	conversationNavigation: 0,
	snapshotRefresh: 0,
	resolutionOrDownload: 0,
	childCreation: 0,
};
let collected;
try {
	const cache = createCacheStore("dual");
	const persistence = createAccountMirrorPersistence({ config, cacheStore: cache });
	await persistence.writeSnapshot({
		provider: "chatgpt",
		runtimeProfileId: "default",
		browserProfileId: "default",
		boundIdentityKey: "operator@example.test",
		detectedIdentityKey: "operator@example.test",
		detectedAccountLevel: null,
		requestId: "guard-fixture",
		startedAt: "2026-10-08T10:00:00Z",
		completedAt: "2026-10-08T10:00:01Z",
		dispatcherKey: "fixture",
		dispatcherOperationId: "fixture",
		metadataCounts: { projects: 0, conversations: 1, artifacts: 0, files: 0, media: 0 },
		metadataEvidence: {
			identitySource: "auth-session",
			projectSampleIds: [],
			conversationSampleIds: ["guarded-G"],
			truncated: { projects: false, conversations: false, artifacts: false },
		},
		manifests: { projects: [], conversations: [row], artifacts: [], files: [], media: [] },
	});
	const first = (await cache.readConversations(context)).items[0];
	const state = normalizeAccountMirrorConversationWorkState(first.metadata.changeFrontierState);
	assert(state);
	await cache.writeConversations(context, [
		{
			...first,
			metadata: {
				...first.metadata,
				changeFrontierState: {
					...state,
					outcome: "deferred",
					retryNotBefore: "2999-01-01T00:00:00.000Z",
				},
			},
		},
	]);
	const reopened = createCacheStore("dual");
	const reloaded = (await reopened.readConversations(context)).items[0];
	const work = normalizeAccountMirrorConversationWorkState(reloaded.metadata.changeFrontierState);
	assert(work);
	const fresh = deriveAccountMirrorConversationFreshness({
		conversationId: reloaded.id,
		item: reloaded,
		target: {},
	});
	const summaries = new Map([
		[
			reloaded.id,
			{
				freshnessState: fresh.state,
				routeabilityState: fresh.routeabilityState,
				detailObservedAt: fresh.detailObservedAt,
				manifestObservedAt: fresh.manifestObservedAt,
				assetCompleteness: fresh.assetCompleteness,
				detailCompleteness: fresh.detailCompleteness,
				missingLocalCount: fresh.assetCounts.missingLocal,
			},
		],
	]);
	const authority = createProviderSessionAuthority(config);
	const authContext = {
		providerId: "chatgpt",
		auracallRuntimeProfile: "default",
		browserProfile: "default",
		managedBrowserProfile: "/fixture/managed",
		browserProcessId: 1,
		browserTargetId: "fixture-target",
	};
	const fail = (key) => async () => {
		effects[key]++;
		throw new Error("Unexpected " + key);
	};
	const client = {
		getProviderSessionProof: async () =>
			authority.verify({
				context: authContext,
				expectation: authority.resolveExpectation(authContext),
				observation: { email: "operator@example.test", source: "auth-session" },
			}),
		listProjects: async () => [],
		listConversations: async () => [reloaded],
		listAccountFiles: async () => [],
		listProjectFiles: fail("conversationNavigation"),
		listConversationFiles: fail("conversationNavigation"),
		getConversationContext: fail("conversationNavigation"),
	};
	const collector = createChatgptAccountMirrorMetadataCollector(config, {
		createClient: async () => client,
	});
	const worker = createHistoryMaterializationService({
		config,
		store: createHistoryMaterializationJobStore({ rootDir: path.join(home, "jobs") }),
		schedule: () => {
			throw new Error("Unexpected scheduled child");
		},
		refreshConversationSnapshot: fail("snapshotRefresh"),
		materializeConversation: fail("resolutionOrDownload"),
	});
	const registry = createAccountMirrorStatusRegistry({ config });
	const refreshService = {
		requestRefresh: async () => {
			collected = await collector.collect({
				provider: "chatgpt",
				runtimeProfileId: "default",
				expectedIdentityKey: "operator@example.test",
				sweepMode: "steady_follow",
				materializationPolicy: "full_missing_assets",
				previousConversationFreshness: summaries,
				previousConversationWorkStates: new Map([[reloaded.id, work]]),
				limits: {
					maxPageReadsPerCycle: 1,
					maxConversationRowsPerCycle: 10,
					maxArtifactRowsPerCycle: 10,
					maxBrowserInteractionsPerMinute: 0,
				},
			});
			return {
				object: "account_mirror_refresh",
				requestId: "guard-composed",
				status: "completed",
				provider: "chatgpt",
				runtimeProfileId: "default",
				browserProfileId: "default",
				requestedPhase: null,
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				dispatcher: { key: "fixture", operationId: "fixture", blockedBy: null },
				mirrorCompleteness: {
					state: "partial",
					summary: "Guarded fixture",
					remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
					signals: {
						projectsTruncated: false,
						conversationsTruncated: false,
						attachmentInventoryTruncated: false,
						attachmentCursorPresent: false,
					},
				},
				metadataCounts: collected.metadataCounts,
				metadataEvidence: collected.evidence,
				detectedIdentityKey: collected.detectedIdentityKey,
				detectedAccountLevel: null,
				mirrorStatus: registry.readStatus(),
			};
		},
	};
	completion = createAccountMirrorCompletionService({
		registry,
		refreshService,
		readMaterializationBacklog: async () => ({ retrievableMissing: 1, unknownOrDeferred: 0 }),
		historyMaterializationService: {
			...worker,
			createJob: async (...args) => {
				effects.childCreation++;
				return worker.createJob(...args);
			},
		},
		generateId: () => "guard-composed",
	});
	completion.start({
		provider: "chatgpt",
		runtimeProfileId: "default",
		maxPasses: 1,
		sweepMode: "steady_follow",
		materializationPolicy: "full_missing_assets",
		materializationMaxItems: 1,
	});
	for (let i = 0; i < 100 && completion.read("guard-composed")?.passCount !== 1; i++)
		await new Promise((r) => setTimeout(r, 10));
	completion.control({ id: "guard-composed", action: "pause" });
	assert.equal(completion.read("guard-composed")?.passCount, 1);
	assert.deepEqual(collected.evidence.detailConversationIdsThisPass, []);
	assert.deepEqual(collected.evidence.retainedMaterializationConversationIds ?? [], []);
	assert.equal(collected.evidence.changeFrontierPlan.decisions[0].reason, "retry_not_before");
	assert.deepEqual(effects, {
		conversationNavigation: 0,
		snapshotRefresh: 0,
		resolutionOrDownload: 0,
		childCreation: 0,
	});
	assert.deepEqual(
		(await reopened.readConversations(context)).items[0].metadata.changeFrontierState,
		reloaded.metadata.changeFrontierState,
	);
	console.log(
		JSON.stringify({
			status: "passed",
			runtimeSource: "5b05f5371a6de1cca103d35145dc51a076d8131f",
			installedModuleHashes: expectedModuleHashes,
			persistedHorizon: work.retryNotBefore,
			collectorDecision: collected.evidence.changeFrontierPlan.decisions[0],
			effects,
			completionPassCount: 1,
		}),
	);
} finally {
	if (completion)
		try {
			completion.control({ id: "guard-composed", action: "pause" });
		} catch {}
	setAuracallHomeDirOverrideForTest(null);
	await fs.rm(home, { recursive: true, force: true });
}
