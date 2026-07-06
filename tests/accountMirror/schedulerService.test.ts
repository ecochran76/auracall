import { describe, expect, test, vi } from "vitest";
import {
	AccountMirrorRefreshError,
	type AccountMirrorRefreshResult,
} from "../../src/accountMirror/refreshService.js";
import { createAccountMirrorSchedulerPassService } from "../../src/accountMirror/schedulerService.js";
import { createAccountMirrorStatusRegistry } from "../../src/accountMirror/statusRegistry.js";

const config = {
	runtimeProfiles: {
		default: {
			browserProfile: "default",
			defaultService: "chatgpt",
			services: {
				chatgpt: {
					identity: {
						email: "ecochran76@gmail.com",
						accountLevel: "Business",
					},
					liveFollow: {
						enabled: true,
						mode: "metadata-first",
						priority: "background",
					},
				},
			},
		},
		blocked: {
			browserProfile: "default",
			defaultService: "grok",
			services: {
				grok: {},
			},
		},
	},
};

const completeMirror = {
	state: "complete" as const,
	summary: "Mirrored metadata indexes are complete within current provider surfaces.",
	remainingDetailSurfaces: { projects: 0, conversations: 0, total: 0 },
	signals: {
		projectsTruncated: false,
		conversationsTruncated: false,
		attachmentInventoryTruncated: false,
		attachmentCursorPresent: false,
	},
};

function createRefreshResult(): AccountMirrorRefreshResult {
	return {
		object: "account_mirror_refresh",
		requestId: "acctmirror_scheduler",
		status: "completed",
		provider: "chatgpt",
		runtimeProfileId: "default",
		browserProfileId: "default",
		startedAt: "2026-04-29T12:00:00.000Z",
		completedAt: "2026-04-29T12:00:01.000Z",
		dispatcher: {
			key: "managed-profile:/tmp/default/chatgpt::service:chatgpt",
			operationId: "op_scheduler",
			blockedBy: null,
		},
		metadataCounts: {
			projects: 1,
			conversations: 2,
			artifacts: 0,
			files: 0,
			media: 0,
		},
		metadataEvidence: null,
		mirrorCompleteness: completeMirror,
		detectedIdentityKey: "ecochran76@gmail.com",
		detectedAccountLevel: "Business",
		mirrorStatus: {
			object: "account_mirror_status",
			generatedAt: "2026-04-29T12:00:01.000Z",
			entries: [],
			metrics: {
				total: 1,
				eligible: 0,
				delayed: 1,
				blocked: 0,
			},
		},
	};
}

function createProviderConfig() {
	return {
		runtimeProfiles: {
			default: {
				browserProfile: "default",
				defaultService: "chatgpt",
				services: {
					chatgpt: {
						identity: {
							email: "ecochran76@gmail.com",
						},
						liveFollow: {
							enabled: true,
							mode: "metadata-first",
							priority: "background",
						},
					},
				},
			},
			geminiDefault: {
				browserProfile: "default",
				defaultService: "gemini",
				services: {
					gemini: {
						identity: {
							email: "ecochran76@gmail.com",
						},
						liveFollow: {
							enabled: true,
							mode: "metadata-first",
							priority: "background",
						},
					},
				},
			},
		},
	};
}

function createMultiChatgptConfig() {
	return {
		runtimeProfiles: {
			default: {
				browserProfile: "default",
				defaultService: "chatgpt",
				services: {
					chatgpt: {
						identity: {
							email: "default@example.com",
						},
						liveFollow: {
							enabled: true,
							mode: "metadata-first",
							priority: "background",
						},
					},
				},
			},
			secondary: {
				browserProfile: "secondary",
				defaultService: "chatgpt",
				services: {
					chatgpt: {
						identity: {
							email: "secondary@example.com",
						},
						liveFollow: {
							enabled: true,
							mode: "metadata-first",
							priority: "background",
						},
					},
				},
			},
		},
	};
}

describe("account mirror scheduler pass service", () => {
	test("dry-run pass selects the first eligible live-follow target without refreshing", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorSchedulerPassService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		const result = await service.runOnce({ dryRun: true });

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			object: "account_mirror_scheduler_pass",
			mode: "dry-run",
			action: "dry-run",
			selectedTarget: {
				provider: "chatgpt",
				runtimeProfileId: "default",
				status: "eligible",
				reason: "eligible",
			},
			metrics: {
				totalTargets: 2,
				eligibleTargets: 1,
				delayedTargets: 0,
				blockedTargets: 1,
				liveFollowEnabledTargets: 1,
				liveFollowEligibleTargets: 1,
				liveFollowDelayedTargets: 0,
				defaultChatgptEligibleTargets: 1,
				defaultChatgptDelayedTargets: 0,
				inProgressEligibleTargets: 0,
			},
			backpressure: {
				reason: "none",
			},
		});
	});

	test("selects non-ChatGPT live-follow targets when they are the eligible target", async () => {
		const requestRefresh = vi.fn(async () => ({
			...createRefreshResult(),
			provider: "gemini" as const,
			runtimeProfileId: "geminiDefault",
			browserProfileId: "default",
		}));
		const service = createAccountMirrorSchedulerPassService({
			registry: createAccountMirrorStatusRegistry({
				config: createProviderConfig(),
				initialState: {
					"chatgpt:default": {
						lastSuccessAtMs: Date.parse("2026-04-29T11:59:00.000Z"),
						detectedIdentityKey: "ecochran76@gmail.com",
					},
				},
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		const result = await service.runOnce({ dryRun: false });

		expect(requestRefresh).toHaveBeenCalledWith({
			provider: "gemini",
			runtimeProfileId: "geminiDefault",
			sweepMode: "steady_follow",
			materializationPolicy: null,
			requestedPhase: "identity",
			explicitRefresh: false,
			queueTimeoutMs: 0,
		});
		expect(result).toMatchObject({
			action: "refresh-completed",
			selectedTarget: {
				provider: "gemini",
				runtimeProfileId: "geminiDefault",
			},
			metrics: {
				liveFollowEnabledTargets: 2,
				liveFollowEligibleTargets: 1,
				liveFollowDelayedTargets: 1,
				defaultChatgptEligibleTargets: 1,
				defaultChatgptDelayedTargets: 1,
			},
		});
	});

	test("execute pass requests one routine refresh for the selected target", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorSchedulerPassService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		const result = await service.runOnce({ dryRun: false });

		expect(requestRefresh).toHaveBeenCalledTimes(1);
		expect(requestRefresh).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfileId: "default",
			sweepMode: "steady_follow",
			materializationPolicy: null,
			requestedPhase: "identity",
			explicitRefresh: false,
			queueTimeoutMs: 0,
		});
		expect(result).toMatchObject({
			mode: "execute",
			action: "refresh-completed",
			backpressure: {
				reason: "none",
			},
			refresh: {
				object: "account_mirror_refresh",
				requestId: "acctmirror_scheduler",
			},
		});
	});

	test("execute pass yields before refresh when foreground AuraCall work is active", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorSchedulerPassService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-29T12:00:00.000Z"),
			shouldYieldToForegroundWork: () => ({
				reason: "foreground-work",
				message: "Foreground AuraCall API work is pending.",
			}),
		});

		const result = await service.runOnce({ dryRun: false });

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			mode: "execute",
			action: "skipped",
			selectedTarget: {
				provider: "chatgpt",
				runtimeProfileId: "default",
			},
			backpressure: {
				reason: "foreground-work",
				message: "Foreground AuraCall API work is pending.",
			},
		});
	});

	test("prioritizes in-progress live-follow mirrors for lazy passes", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorSchedulerPassService({
			registry: createAccountMirrorStatusRegistry({
				config,
				initialState: {
					"chatgpt:default": {
						metadataCounts: {
							projects: 5,
							conversations: 69,
							artifacts: 3,
							files: 24,
							media: 0,
						},
						metadataEvidence: {
							identitySource: "profile-menu",
							projectSampleIds: ["project_1"],
							conversationSampleIds: ["conv_1"],
							attachmentInventory: {
								nextProjectIndex: 5,
								nextConversationIndex: 1,
								detailReadLimit: 6,
								scannedProjects: 5,
								scannedConversations: 1,
							},
							truncated: {
								projects: false,
								conversations: false,
								artifacts: true,
							},
						},
					},
				},
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		const result = await service.runOnce({ dryRun: true });

		expect(result).toMatchObject({
			action: "dry-run",
			selectedTarget: {
				provider: "chatgpt",
				runtimeProfileId: "default",
				requestedPhase: "detail-inventory",
				phaseDecision: {
					phase: "detail-inventory",
					reason: "68 detail surface(s) remain incomplete",
				},
				mirrorCompleteness: {
					state: "in_progress",
					remainingDetailSurfaces: {
						total: 68,
					},
				},
			},
			metrics: {
				inProgressEligibleTargets: 1,
			},
		});
	});

	test("rotates same-priority live-follow targets using persisted scheduler history", async () => {
		const requestRefresh = vi.fn(async (request) => ({
			...createRefreshResult(),
			runtimeProfileId: request.runtimeProfileId ?? "default",
			browserProfileId: request.runtimeProfileId === "secondary" ? "secondary" : "default",
		}));
		const createInProgressState = (conversationCount: number) => ({
			detectedIdentityKey: "operator@example.com",
			metadataCounts: {
				projects: 1,
				conversations: conversationCount,
				artifacts: 0,
				files: 0,
				media: 0,
			},
			metadataEvidence: {
				identitySource: "profile-menu",
				projectSampleIds: ["project_1"],
				conversationSampleIds: ["conv_1"],
				attachmentInventory: {
					nextProjectIndex: 1,
					nextConversationIndex: 1,
					detailReadLimit: 6,
					scannedProjects: 1,
					scannedConversations: 1,
				},
				truncated: {
					projects: false,
					conversations: false,
					artifacts: true,
				},
			},
		});
		const service = createAccountMirrorSchedulerPassService({
			registry: createAccountMirrorStatusRegistry({
				config: createMultiChatgptConfig(),
				initialState: {
					"chatgpt:default": createInProgressState(120),
					"chatgpt:secondary": createInProgressState(2),
				},
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-29T12:00:00.000Z"),
			readHistory: async () => ({
				object: "account_mirror_scheduler_pass_history",
				version: 1,
				updatedAt: "2026-04-29T11:59:01.000Z",
				limit: 50,
				entries: [
					{
						object: "account_mirror_scheduler_pass",
						mode: "execute",
						action: "refresh-completed",
						startedAt: "2026-04-29T11:59:00.000Z",
						completedAt: "2026-04-29T11:59:01.000Z",
						selectedTarget: {
							provider: "chatgpt",
							runtimeProfileId: "default",
							browserProfileId: "default",
							status: "eligible",
							reason: "eligible",
							eligibleAt: "2026-04-29T11:59:00.000Z",
							mirrorCompleteness: completeMirror,
						},
						backpressure: {
							reason: "none",
							message: null,
						},
						metrics: {
							totalTargets: 2,
							eligibleTargets: 2,
							delayedTargets: 0,
							blockedTargets: 0,
							defaultChatgptEligibleTargets: 2,
							defaultChatgptDelayedTargets: 0,
							inProgressEligibleTargets: 2,
						},
						refresh: null,
						error: null,
					},
				],
			}),
		});

		const result = await service.runOnce({ dryRun: false });

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "secondary",
			}),
		);
		expect(result).toMatchObject({
			action: "refresh-completed",
			selectedTarget: {
				provider: "chatgpt",
				runtimeProfileId: "secondary",
			},
			metrics: {
				liveFollowEligibleTargets: 2,
				inProgressEligibleTargets: 2,
			},
		});
	});

	test("execute pass requests the selected live-follow phase instead of restarting rails", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorSchedulerPassService({
			registry: createAccountMirrorStatusRegistry({
				config,
				initialState: {
					"chatgpt:default": {
						metadataCounts: {
							projects: 2,
							conversations: 4,
							artifacts: 1,
							files: 1,
							media: 0,
						},
						metadataEvidence: {
							identitySource: "profile-menu",
							projectSampleIds: ["project_1"],
							conversationSampleIds: ["conv_pending"],
							conversationFreshnessFrontier: {
								object: "account_mirror_conversation_freshness_frontier",
								provider: "chatgpt",
								sweepMode: "steady_follow",
								threshold: 3,
								rowsExamined: 4,
								rowsSelectedForDetail: 1,
								frontierReached: true,
								firstStoppedRow: null,
								fallbackReason: null,
								selectedConversationIds: ["conv_pending"],
								rowEvidence: [],
							},
							truncated: {
								projects: false,
								conversations: false,
								artifacts: true,
							},
						},
					},
				},
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		const result = await service.runOnce({ dryRun: false });

		expect(requestRefresh).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfileId: "default",
			sweepMode: "steady_follow",
			materializationPolicy: null,
			requestedPhase: "detail-inventory",
			explicitRefresh: false,
			queueTimeoutMs: 0,
		});
		expect(result).toMatchObject({
			action: "refresh-completed",
			selectedTarget: {
				provider: "chatgpt",
				runtimeProfileId: "default",
				requestedPhase: "detail-inventory",
				phaseDecision: {
					phase: "detail-inventory",
					status: "pending",
					reason: "freshness frontier selected 1 conversation row(s) for detail",
				},
			},
		});
	});

	test("reports routine-delayed backpressure when no live-follow target is eligible", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorSchedulerPassService({
			registry: createAccountMirrorStatusRegistry({
				config,
				initialState: {
					"chatgpt:default": {
						lastSuccessAtMs: Date.parse("2026-04-29T11:59:00.000Z"),
						detectedIdentityKey: "ecochran76@gmail.com",
					},
				},
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		const result = await service.runOnce({ dryRun: false });

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			action: "skipped",
			selectedTarget: null,
			backpressure: {
				reason: "routine-delayed",
			},
			metrics: {
				liveFollowEligibleTargets: 0,
				liveFollowDelayedTargets: 1,
				defaultChatgptEligibleTargets: 0,
				defaultChatgptDelayedTargets: 1,
			},
		});
	});

	test("reports browser-work backpressure when routine refresh cannot acquire the dispatcher", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		requestRefresh.mockRejectedValueOnce(
			new AccountMirrorRefreshError(
				503,
				"account_mirror_browser_operation_busy",
				"Browser operation is busy.",
			),
		);
		const service = createAccountMirrorSchedulerPassService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		const result = await service.runOnce({ dryRun: false });

		expect(result).toMatchObject({
			action: "refresh-blocked",
			backpressure: {
				reason: "blocked-by-browser-work",
				message: "Browser operation is busy.",
			},
		});
	});

	test("reports provider-guard backpressure when live-follow needs manual clearance", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorSchedulerPassService({
			registry: createAccountMirrorStatusRegistry({
				config,
				initialState: {
					"chatgpt:default": {
						detectedIdentityKey: "ecochran76@gmail.com",
						providerGuard: {
							state: "manual_clear_required",
							kind: "google-sorry",
							summary: "Google unusual-traffic interstitial detected (google.com/sorry).",
							detectedAtMs: Date.parse("2026-04-29T11:59:00.000Z"),
							action: "account-mirror-refresh",
						},
					},
				},
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		const result = await service.runOnce({ dryRun: false });

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			action: "skipped",
			selectedTarget: null,
			backpressure: {
				reason: "provider-guard",
				message: "Google unusual-traffic interstitial detected (google.com/sorry).",
			},
			metrics: {
				liveFollowEligibleTargets: 0,
			},
		});
	});

	test("reports yielded backpressure when a refresh stops for queued browser work", async () => {
		const yieldedRefresh = createRefreshResult();
		yieldedRefresh.metadataEvidence = {
			identitySource: "profile-menu",
			projectSampleIds: [],
			conversationSampleIds: [],
			attachmentInventory: {
				nextProjectIndex: 1,
				nextConversationIndex: 0,
				detailReadLimit: 6,
				scannedProjects: 1,
				scannedConversations: 0,
				yielded: true,
			},
			truncated: {
				projects: false,
				conversations: false,
				artifacts: true,
			},
		};
		const requestRefresh = vi.fn(async () => yieldedRefresh);
		const service = createAccountMirrorSchedulerPassService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-29T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});

		const result = await service.runOnce({ dryRun: false });

		expect(result).toMatchObject({
			action: "refresh-completed",
			backpressure: {
				reason: "yielded-to-queued-work",
			},
		});
	});
});
