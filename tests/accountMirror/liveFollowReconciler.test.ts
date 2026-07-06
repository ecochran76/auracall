import { describe, expect, test, vi } from "vitest";
import type { AccountMirrorCompletionOperation } from "../../src/accountMirror/completionService.js";
import { reconcileConfiguredAccountMirrorLiveFollow } from "../../src/accountMirror/liveFollowReconciler.js";
import { createAccountMirrorStatusRegistry } from "../../src/accountMirror/statusRegistry.js";

const baseOperation: AccountMirrorCompletionOperation = {
	object: "account_mirror_completion",
	id: "acctmirror_completion_existing",
	provider: "chatgpt",
	runtimeProfileId: "default",
	mode: "live_follow",
	phase: "backfill_history",
	status: "running",
	startedAt: "2026-05-02T12:00:00.000Z",
	completedAt: null,
	nextAttemptAt: null,
	maxPasses: null,
	passCount: 0,
	lastRefresh: null,
	mirrorCompleteness: null,
	error: null,
};

const completeMetadataEvidence = {
	identitySource: "profile-menu",
	projectSampleIds: [],
	conversationSampleIds: ["conversation_1"],
	truncated: {
		projects: false,
		conversations: false,
		artifacts: false,
	},
};

const incompleteMetadataEvidence = {
	identitySource: "profile-menu",
	projectSampleIds: [],
	conversationSampleIds: ["conversation_1"],
	attachmentInventory: {
		nextProjectIndex: 0,
		nextConversationIndex: 1,
		detailReadLimit: 4,
		scannedProjects: 0,
		scannedConversations: 1,
	},
	truncated: {
		projects: false,
		conversations: false,
		artifacts: true,
	},
};

describe("account mirror live-follow reconciler", () => {
	test("starts one live-follow completion for each enabled configured account", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config: {
				runtimeProfiles: {
					default: {
						browserProfile: "default",
						services: {
							chatgpt: {
								identity: { email: "operator@example.com" },
								liveFollow: { enabled: true },
							},
						},
					},
					consult: {
						browserProfile: "wsl-chrome-2",
						services: {
							chatgpt: {
								identity: { email: "consult@example.com" },
								liveFollow: { enabled: true },
							},
							gemini: {
								identity: { email: "consult@example.com" },
								liveFollow: { enabled: true },
							},
						},
					},
				},
			},
			now: () => new Date("2026-05-02T12:00:00.000Z"),
		});
		const start = vi.fn((request) => ({
			...baseOperation,
			id: `completion_${request.runtimeProfileId}`,
			runtimeProfileId: request.runtimeProfileId ?? "default",
		}));
		const list = vi.fn(() => []);

		const result = await reconcileConfiguredAccountMirrorLiveFollow({
			registry,
			completionService: {
				start,
				list,
				read: vi.fn(),
				control: vi.fn(),
			},
		});

		expect(result.metrics).toMatchObject({
			enabledTargets: 3,
			started: 3,
			existing: 0,
			skipped: 0,
		});
		expect(result.targetClassifications).toEqual([
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				classification: "safe_bounded_resume",
				action: "start",
			}),
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "consult",
				classification: "safe_bounded_resume",
				action: "start",
			}),
			expect.objectContaining({
				provider: "gemini",
				runtimeProfileId: "consult",
				classification: "safe_bounded_resume",
				action: "start",
			}),
		]);
		expect(start).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: null,
		});
		expect(start).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfileId: "consult",
			maxPasses: null,
		});
		expect(start).toHaveBeenCalledWith({
			provider: "gemini",
			runtimeProfileId: "consult",
			maxPasses: null,
		});
	});

	test("does not duplicate an active live-follow completion", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config: {
				runtimeProfiles: {
					default: {
						browserProfile: "default",
						services: {
							chatgpt: {
								identity: { email: "operator@example.com" },
								liveFollow: { enabled: true },
							},
						},
					},
				},
			},
		});
		const start = vi.fn();

		const result = await reconcileConfiguredAccountMirrorLiveFollow({
			registry,
			completionService: {
				start,
				list: vi.fn(() => [baseOperation]),
				read: vi.fn(),
				control: vi.fn(),
			},
		});

		expect(result.metrics).toMatchObject({
			enabledTargets: 1,
			started: 0,
			existing: 1,
		});
		expect(result.targetClassifications[0]).toMatchObject({
			provider: "chatgpt",
			runtimeProfileId: "default",
			classification: "existing_active",
			action: "keep_existing",
			activeCompletionId: "acctmirror_completion_existing",
		});
		expect(start).not.toHaveBeenCalled();
	});

	test("upgrades an active metadata-only completion when configured live follow asks for full retrieval", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config: {
				runtimeProfiles: {
					default: {
						browserProfile: "default",
						services: {
							chatgpt: {
								identity: { email: "operator@example.com" },
								liveFollow: {
									enabled: true,
									sweepMode: "full_sweep",
									materializationPolicy: "full_missing_assets",
									materializationAssetKinds: ["all"],
									materializationMaxItems: 25,
									materializationRefreshSnapshot: true,
								},
							},
						},
					},
				},
			},
		});
		const active = {
			...baseOperation,
			sweepMode: "steady_follow" as const,
			materializationPolicy: "metadata_only" as const,
			materializationAssetKinds: ["all" as const],
			materializationMaxItems: null,
			materializationRefreshSnapshot: false,
		};
		const upgraded = {
			...active,
			mode: "live_follow" as const,
			status: "running" as const,
			sweepMode: "full_sweep" as const,
			materializationPolicy: "full_missing_assets" as const,
			materializationMaxItems: 25,
			materializationRefreshSnapshot: true,
		};
		const start = vi.fn();
		const upgradePolicy = vi.fn(() => upgraded);

		const result = await reconcileConfiguredAccountMirrorLiveFollow({
			registry,
			completionService: {
				start,
				list: vi.fn(() => [active]),
				read: vi.fn(),
				control: vi.fn(),
				upgradePolicy,
			},
		});

		expect(start).not.toHaveBeenCalled();
		expect(upgradePolicy).toHaveBeenCalledWith({
			id: "acctmirror_completion_existing",
			maxPasses: null,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["all"],
			materializationMaxItems: 25,
			materializationRefreshSnapshot: true,
		});
		expect(result.metrics).toMatchObject({
			enabledTargets: 1,
			started: 0,
			existing: 1,
			upgraded: 1,
		});
		expect(result.existing[0]).toMatchObject({
			id: "acctmirror_completion_existing",
			mode: "live_follow",
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
		});
	});

	test("keeps operator-paused live follow unchanged during broad reconciliation", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config: {
				runtimeProfiles: {
					default: {
						browserProfile: "default",
						services: {
							chatgpt: {
								identity: { email: "operator@example.com" },
								liveFollow: {
									enabled: true,
									sweepMode: "full_sweep",
									materializationPolicy: "full_missing_assets",
								},
							},
						},
					},
				},
			},
		});
		const paused = {
			...baseOperation,
			status: "paused" as const,
			sweepMode: "steady_follow" as const,
			materializationPolicy: "metadata_only" as const,
		};
		const start = vi.fn();
		const upgradePolicy = vi.fn();

		const result = await reconcileConfiguredAccountMirrorLiveFollow({
			registry,
			completionService: {
				start,
				list: vi.fn(() => [paused]),
				read: vi.fn(),
				control: vi.fn(),
				upgradePolicy,
			},
		});

		expect(start).not.toHaveBeenCalled();
		expect(upgradePolicy).not.toHaveBeenCalled();
		expect(result.metrics).toMatchObject({
			enabledTargets: 1,
			started: 0,
			existing: 1,
			upgraded: 0,
		});
		expect(result.existing[0]).toMatchObject({
			id: "acctmirror_completion_existing",
			status: "paused",
			sweepMode: "steady_follow",
			materializationPolicy: "metadata_only",
		});
		expect(result.targetClassifications[0]).toMatchObject({
			classification: "operator_paused",
			action: "keep_existing",
			reason: "active live-follow completion is operator-paused",
			activeCompletionId: "acctmirror_completion_existing",
		});
	});

	test("classifies safe steady-follow and bounded-resume starts separately", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config: {
				runtimeProfiles: {
					current: {
						browserProfile: "current",
						services: {
							chatgpt: {
								identity: { email: "current@example.com" },
								liveFollow: { enabled: true },
							},
						},
					},
					backfill: {
						browserProfile: "backfill",
						services: {
							chatgpt: {
								identity: { email: "backfill@example.com" },
								liveFollow: { enabled: true },
							},
						},
					},
				},
			},
			initialState: {
				"chatgpt:current": {
					detectedIdentityKey: "current@example.com",
					metadataCounts: {
						projects: 0,
						conversations: 1,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					metadataEvidence: completeMetadataEvidence,
				},
				"chatgpt:backfill": {
					detectedIdentityKey: "backfill@example.com",
					metadataCounts: {
						projects: 0,
						conversations: 5,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					metadataEvidence: incompleteMetadataEvidence,
				},
			},
		});
		const start = vi.fn((request) => ({
			...baseOperation,
			id: `completion_${request.runtimeProfileId}`,
			runtimeProfileId: request.runtimeProfileId ?? "default",
		}));

		const result = await reconcileConfiguredAccountMirrorLiveFollow({
			registry,
			completionService: {
				start,
				list: vi.fn(() => []),
				read: vi.fn(),
				control: vi.fn(),
			},
		});

		expect(start).toHaveBeenCalledTimes(2);
		expect(result.targetClassifications).toEqual([
			expect.objectContaining({
				runtimeProfileId: "current",
				classification: "safe_steady_follow",
				action: "start",
			}),
			expect.objectContaining({
				runtimeProfileId: "backfill",
				classification: "safe_bounded_resume",
				action: "start",
			}),
		]);
	});

	test("classifies legacy Gemini live follow as provider-blocked", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config: {
				runtimeProfiles: {
					gemini: {
						browserProfile: "gemini",
						services: {
							gemini: {
								identity: { email: "operator@example.com" },
								liveFollow: { enabled: true },
							},
						},
					},
				},
			},
		});
		const legacyGemini = {
			...baseOperation,
			id: "acctmirror_legacy_gemini",
			provider: "gemini" as const,
			runtimeProfileId: "gemini",
			status: "paused" as const,
			passCount: 10,
			error: {
				code: "gemini_live_follow_resume_blocked",
				message:
					"Gemini live-follow resume is blocked until the completion is upgraded or replaced with bounded left-rail retrieval policy.",
			},
		};
		const start = vi.fn();

		const result = await reconcileConfiguredAccountMirrorLiveFollow({
			registry,
			completionService: {
				start,
				list: vi.fn(() => [legacyGemini]),
				read: vi.fn(),
				control: vi.fn(),
			},
		});

		expect(start).not.toHaveBeenCalled();
		expect(result.existing[0]).toMatchObject({
			id: "acctmirror_legacy_gemini",
			status: "paused",
		});
		expect(result.targetClassifications[0]).toMatchObject({
			provider: "gemini",
			runtimeProfileId: "gemini",
			classification: "provider_blocked",
			action: "skip",
			activeCompletionId: "acctmirror_legacy_gemini",
		});
	});

	test("does not duplicate an active bounded campaign completion for the same target", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config: {
				runtimeProfiles: {
					default: {
						browserProfile: "default",
						services: {
							chatgpt: {
								identity: { email: "operator@example.com" },
								liveFollow: { enabled: true },
							},
						},
					},
				},
			},
		});
		const start = vi.fn();
		const boundedCampaignOperation = {
			...baseOperation,
			id: "acctmirror_completion_campaign_claim",
			mode: "bounded" as const,
			sweepMode: "full_sweep" as const,
			maxPasses: 2,
			materializationPolicy: "full_missing_assets" as const,
			materializationAssetKinds: ["all" as const],
			materializationRefreshSnapshot: true,
		};

		const result = await reconcileConfiguredAccountMirrorLiveFollow({
			registry,
			completionService: {
				start,
				list: vi.fn(() => [boundedCampaignOperation]),
				read: vi.fn(),
				control: vi.fn(),
			},
		});

		expect(result.metrics).toMatchObject({
			enabledTargets: 1,
			started: 0,
			existing: 1,
		});
		expect(result.existing[0]).toMatchObject({
			id: "acctmirror_completion_campaign_claim",
			mode: "bounded",
		});
		expect(start).not.toHaveBeenCalled();
	});

	test("starts configured full-sweep live follow with materialization policy", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config: {
				runtimeProfiles: {
					default: {
						browserProfile: "default",
						services: {
							gemini: {
								identity: { email: "operator@example.com" },
								liveFollow: {
									enabled: true,
									sweepMode: "full_sweep",
									materializationPolicy: "full_missing_assets",
									materializationAssetKinds: ["media"],
									materializationMaxItems: 10,
									materializationRefreshSnapshot: true,
									materializationForce: false,
								},
							},
						},
					},
				},
			},
		});
		const start = vi.fn((request) => ({
			...baseOperation,
			id: "completion_full_sweep",
			provider: request.provider ?? "chatgpt",
			runtimeProfileId: request.runtimeProfileId ?? "default",
		}));

		await reconcileConfiguredAccountMirrorLiveFollow({
			registry,
			completionService: {
				start,
				list: vi.fn(() => []),
				read: vi.fn(),
				control: vi.fn(),
			},
		});

		expect(start).toHaveBeenCalledWith({
			provider: "gemini",
			runtimeProfileId: "default",
			maxPasses: null,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["media"],
			materializationMaxItems: 10,
			materializationRefreshSnapshot: true,
			materializationForce: false,
		});
	});

	test("does not start enabled live follow when the account status is blocked", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config: {
				runtimeProfiles: {
					unbound: {
						browserProfile: "default",
						services: {
							chatgpt: {
								liveFollow: { enabled: true },
							},
						},
					},
				},
			},
		});
		const start = vi.fn();

		const result = await reconcileConfiguredAccountMirrorLiveFollow({
			registry,
			completionService: {
				start,
				list: vi.fn(() => []),
				read: vi.fn(),
				control: vi.fn(),
			},
		});

		expect(result.metrics).toMatchObject({
			enabledTargets: 0,
			started: 0,
			skipped: 1,
		});
		expect(result.skipped[0]).toMatchObject({
			provider: "chatgpt",
			runtimeProfileId: "unbound",
			reason: "liveFollow.enabled is true but the service has no bound identity",
		});
		expect(start).not.toHaveBeenCalled();
	});
});
