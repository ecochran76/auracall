import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { AccountMirrorBackfillLedger } from "../../src/accountMirror/backfillLedger.js";
import { createAccountMirrorCompletionService } from "../../src/accountMirror/completionService.js";
import { createAccountMirrorCompletionStore } from "../../src/accountMirror/completionStore.js";
import { chooseLiveFollowCyclePhase } from "../../src/accountMirror/liveFollowCycleDecision.js";
import {
	AccountMirrorRefreshError,
	type AccountMirrorRefreshResult,
} from "../../src/accountMirror/refreshService.js";
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
					},
				},
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

const completeBackfillLedger: AccountMirrorBackfillLedger = {
	object: "account_mirror_backfill_ledger",
	version: 1,
	provider: "chatgpt",
	runtimeProfileId: "default",
	browserProfileId: "default",
	boundIdentityKey: "ecochran76@gmail.com",
	updatedAt: "2026-04-30T12:00:01.000Z",
	state: "complete",
	lastCompletedPhase: "detail-inventory",
	nextEligiblePhase: "complete",
	cursors: {
		projects: {
			status: "complete",
			reason: "project cursor complete",
			updatedAt: "2026-04-30T12:00:01.000Z",
			nextIndex: null,
			readLimit: null,
			scanned: 1,
			yielded: false,
		},
		rootRail: {
			status: "complete",
			reason: "root rail cursor complete",
			updatedAt: "2026-04-30T12:00:01.000Z",
			nextIndex: null,
			readLimit: null,
			scanned: 2,
			yielded: false,
		},
		projectConversations: {
			status: "skipped",
			reason: "No project conversation cursor was emitted.",
			updatedAt: null,
			nextIndex: null,
			readLimit: null,
			scanned: null,
			yielded: false,
		},
		newestFirstDetail: {
			status: "complete",
			reason: "detail cursor complete",
			updatedAt: "2026-04-30T12:00:01.000Z",
			nextIndex: null,
			readLimit: null,
			scanned: null,
			yielded: false,
			conversationDetail: null,
		},
		accountLibrary: {
			status: "skipped",
			reason: "No account-library cursor recorded yet.",
			updatedAt: null,
			nextIndex: null,
			readLimit: null,
			scanned: null,
			yielded: false,
		},
		materialization: {
			status: "skipped",
			reason: "No materialization cursor recorded yet.",
			updatedAt: null,
			nextIndex: null,
			readLimit: null,
			scanned: null,
			yielded: false,
		},
	},
};

function createRefreshResult(): AccountMirrorRefreshResult {
	return {
		object: "account_mirror_refresh",
		requestId: "acctmirror_refresh_1",
		status: "completed",
		provider: "chatgpt",
		runtimeProfileId: "default",
		browserProfileId: "default",
		startedAt: "2026-04-30T12:00:00.000Z",
		completedAt: "2026-04-30T12:00:01.000Z",
		dispatcher: {
			key: "managed-profile:/tmp/default/chatgpt::service:chatgpt",
			operationId: "op_1",
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
			generatedAt: "2026-04-30T12:00:01.000Z",
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

describe("live-follow cycle decision", () => {
	test("continues conversation detail when a detail cursor is pending", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 4,
				lastRefresh: createRefreshResult(),
			},
			evidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: true,
				},
				attachmentInventory: {
					nextProjectIndex: 5,
					nextConversationIndex: 2,
					detailReadLimit: 4,
					scannedProjects: 5,
					scannedConversations: 2,
					conversationDetail: {
						conversationId: "conv_pending",
						nextMessageIndex: 24,
						messageLimit: 24,
						totalMessages: 90,
					},
				},
			},
			remainingDetailSurfaces: 3,
		});

		expect(decision).toMatchObject({
			phase: "detail-inventory",
			status: "pending",
		});
		expect(decision.reason).toContain("conv_pending");
	});

	test("chooses detail before project conversations when freshness selected rows", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 2,
				lastRefresh: createRefreshResult(),
			},
			evidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: false,
				},
				conversationFreshnessFrontier: {
					object: "account_mirror_conversation_freshness_frontier",
					provider: "chatgpt",
					sweepMode: "steady_follow",
					threshold: 3,
					rowsExamined: 4,
					rowsSelectedForDetail: 1,
					frontierReached: true,
					selectedConversationIds: ["conv_recent"],
					firstStoppedRow: {
						conversationId: "conv_old",
						index: 3,
						remoteMtime: "2026-06-27T18:00:00.000Z",
					},
					fallbackReason: null,
					rowEvidence: [],
				},
				projectConversations: {
					nextProjectIndex: 1,
					readLimit: 2,
					scannedProjects: 1,
				},
			},
			remainingDetailSurfaces: 0,
		});

		expect(decision).toMatchObject({
			phase: "detail-inventory",
			status: "pending",
		});
	});

	test("resumes project conversation cursor when no detail work is pending", () => {
		const decision = chooseLiveFollowCyclePhase({
			operation: {
				passCount: 3,
				lastRefresh: createRefreshResult(),
			},
			evidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: [],
				truncated: {
					projects: false,
					conversations: true,
					artifacts: false,
				},
				projectConversations: {
					nextProjectIndex: 8,
					readLimit: 2,
					scannedProjects: 8,
					yielded: true,
				},
			},
			remainingDetailSurfaces: 0,
		});

		expect(decision).toMatchObject({
			phase: "project-conversations",
			status: "yielded",
		});
	});
});

describe("account mirror completion service", () => {
	test("persists operation state for restart readback", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-completion-store-"));
		try {
			const store = createAccountMirrorCompletionStore({
				config: {
					browser: {
						cache: {
							rootDir: tmp,
						},
					},
				},
			});
			const requestRefresh = vi.fn(async () => createRefreshResult());
			const service = createAccountMirrorCompletionService({
				registry: createAccountMirrorStatusRegistry({
					config,
					now: () => new Date("2026-04-30T12:00:00.000Z"),
				}),
				refreshService: {
					requestRefresh,
				},
				store,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
				generateId: () => "acctmirror_persisted",
			});

			service.start({ maxPasses: 3 });

			await waitFor(
				async () => (await store.readOperation("acctmirror_persisted"))?.status === "completed",
			);

			expect(await store.readOperation("acctmirror_persisted")).toMatchObject({
				id: "acctmirror_persisted",
				status: "completed",
				mode: "bounded",
				passCount: 1,
			});
			expect(await store.listOperations({ activeOnly: false, limit: null })).toHaveLength(1);
			expect(await store.listOperations({ activeOnly: true, limit: null })).toHaveLength(0);
		} finally {
			await fs.rm(tmp, { recursive: true, force: true });
		}
	});

	test("hydrates active cooldown operations without refreshing before eligible time", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_hydrated",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "running" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
			maxPasses: null,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: completeMirror,
			error: null,
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const sleep = vi.fn(() => new Promise<void>(() => {}));

		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await waitFor(() => sleep.mock.calls.length > 0);

		expect(service.read("acctmirror_hydrated")).toMatchObject({
			status: "idle_waiting",
			phase: "steady_follow",
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
			passCount: 1,
			lifecycleEvents: [
				{
					type: "resumed_after_restart",
					status: "running",
					previousStatus: "running",
				},
			],
		});
		expect(sleep).toHaveBeenCalledWith(60_000);
		expect(requestRefresh).not.toHaveBeenCalled();
	});

	test("hydrates active operations without launching them when startup resume is disabled", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_startup_isolated",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "backfill_history" as const,
			status: "queued" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 0,
			lastRefresh: null,
			mirrorCompleteness: null,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const sleep = vi.fn(() => new Promise<void>(() => {}));

		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: false,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await Promise.resolve();

		expect(service.read("acctmirror_startup_isolated")).toMatchObject({
			status: "queued",
			passCount: 0,
			lifecycleEvents: [],
		});
		expect(requestRefresh).not.toHaveBeenCalled();
		expect(sleep).not.toHaveBeenCalled();
		expect(service.prepareForShutdown?.()).toEqual([]);
		expect(service.read("acctmirror_startup_isolated")).toMatchObject({
			status: "queued",
			passCount: 0,
			lifecycleEvents: [],
		});
	});

	test("blocks unsafe legacy Gemini live-follow startup resume", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_legacy_gemini",
			provider: "gemini" as const,
			runtimeProfileId: "auracall-gemini-pro",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "queued" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 10,
			lastRefresh: {
				...createRefreshResult(),
				provider: "gemini" as const,
				runtimeProfileId: "auracall-gemini-pro",
				metadataCounts: {
					projects: 0,
					conversations: 71,
					artifacts: 0,
					files: 0,
					media: 0,
				},
			},
			materializationPolicy: "metadata_only" as const,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const sleep = vi.fn(() => new Promise<void>(() => {}));

		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await Promise.resolve();

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(sleep).not.toHaveBeenCalled();
		expect(service.read("acctmirror_legacy_gemini")).toMatchObject({
			status: "paused",
			passCount: 10,
			error: {
				code: "gemini_live_follow_resume_blocked",
			},
			lifecycleEvents: [
				{
					type: "automatic_resume_blocked",
					status: "paused",
					previousStatus: "queued",
				},
			],
		});
	});

	test("blocks unsafe legacy Gemini live-follow operator resume", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_paused_legacy_gemini",
			provider: "gemini" as const,
			runtimeProfileId: "auracall-gemini-pro",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "paused" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 10,
			lastRefresh: {
				...createRefreshResult(),
				provider: "gemini" as const,
				runtimeProfileId: "auracall-gemini-pro",
			},
			materializationPolicy: "metadata_only" as const,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});

		expect(
			service.control({
				id: "acctmirror_paused_legacy_gemini",
				action: "resume",
			}),
		).toMatchObject({
			status: "paused",
			error: {
				code: "gemini_live_follow_resume_blocked",
			},
			lifecycleEvents: [
				{
					type: "operator_resume_blocked",
					status: "paused",
					previousStatus: "paused",
				},
			],
		});
		await Promise.resolve();

		expect(requestRefresh).not.toHaveBeenCalled();
	});

	test("lists persisted and active operations with filters", async () => {
		const active = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_active",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "running" as const,
			startedAt: "2026-04-30T12:10:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:20:00.000Z",
			maxPasses: null,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: completeMirror,
			error: null,
		};
		const completed = {
			...active,
			id: "acctmirror_completed",
			status: "completed" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: "2026-04-30T12:01:00.000Z",
			nextAttemptAt: null,
			maxPasses: 3,
			mode: "bounded" as const,
		};
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			initialOperations: [completed, active],
			resumeActiveOperations: false,
			sleep,
		});

		expect(service.list().map((operation) => operation.id)).toEqual([
			"acctmirror_active",
			"acctmirror_completed",
		]);
		expect(service.list({ status: "active" }).map((operation) => operation.id)).toEqual([
			"acctmirror_active",
		]);
		expect(service.list({ status: "completed" }).map((operation) => operation.id)).toEqual([
			"acctmirror_completed",
		]);
		expect(service.list({ provider: "gemini" })).toEqual([]);
		expect(service.list({ limit: 1 })).toHaveLength(1);
	});

	test("pauses, resumes, and cancels live-follow operations", async () => {
		let resolveRefresh: (value: AccountMirrorRefreshResult) => void = () => undefined;
		const requestRefresh = vi.fn(
			() =>
				new Promise<AccountMirrorRefreshResult>((resolve) => {
					resolveRefresh = resolve;
				}),
		);
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_control",
		});

		service.start();
		await waitFor(() => service.read("acctmirror_control")?.status === "running");
		expect(service.read("acctmirror_control")?.lifecycleEvents?.map((event) => event.type)).toEqual(
			["started"],
		);

		expect(service.control({ id: "acctmirror_control", action: "pause" })).toMatchObject({
			id: "acctmirror_control",
			status: "paused",
		});
		expect(service.list({ status: "active" }).map((operation) => operation.id)).toEqual([
			"acctmirror_control",
		]);

		resolveRefresh(createRefreshResult());
		await waitFor(() => service.read("acctmirror_control")?.status === "paused");
		expect(service.read("acctmirror_control")).toMatchObject({
			status: "paused",
			passCount: 1,
			phase: "steady_follow",
			mirrorCompleteness: completeMirror,
			lastRefresh: {
				requestId: "acctmirror_refresh_1",
				status: "completed",
			},
		});

		expect(service.control({ id: "acctmirror_control", action: "resume" })).toMatchObject({
			status: "queued",
		});
		await waitFor(() => service.read("acctmirror_control")?.status === "running");
		expect(service.read("acctmirror_control")?.lifecycleEvents?.map((event) => event.type)).toEqual(
			expect.arrayContaining([
				"started",
				"operator_paused",
				"live_follow_phase_decision",
				"account_library_catchup_skipped",
				"operator_resumed",
			]),
		);
		await waitFor(() => requestRefresh.mock.calls.length === 2);
		expect(requestRefresh).toHaveBeenCalledTimes(2);

		expect(service.control({ id: "acctmirror_control", action: "cancel" })).toMatchObject({
			status: "cancelled",
			completedAt: "2026-04-30T12:00:00.000Z",
		});
		expect(service.read("acctmirror_control")?.lifecycleEvents?.at(-1)).toMatchObject({
			type: "operator_cancelled",
			status: "cancelled",
			previousStatus: "running",
			processPid: process.pid,
		});
		expect(service.control({ id: "missing", action: "pause" })).toBeNull();
	});

	test("defaults to live follow and keeps running after a complete refresh", async () => {
		const requestRefresh = vi
			.fn()
			.mockResolvedValueOnce(createRefreshResult())
			.mockRejectedValue(
				new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					"Account mirror chatgpt/default is delayed: minimum-interval.",
					{
						provider: "chatgpt",
						runtimeProfileId: "default",
						reason: "minimum-interval",
						eligibleAt: "2026-04-30T12:10:00.000Z",
					},
				),
			);
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_live_follow",
			sleep,
		});

		const started = service.start();

		expect(started).toMatchObject({
			mode: "live_follow",
			phase: "backfill_history",
			maxPasses: null,
		});

		await waitFor(
			() => service.read("acctmirror_live_follow")?.nextAttemptAt === "2026-04-30T12:10:00.000Z",
		);

		expect(requestRefresh).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(60_000);
		expect(service.read("acctmirror_live_follow")).toMatchObject({
			status: "idle_waiting",
			mode: "live_follow",
			phase: "steady_follow",
			passCount: 1,
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
		});
	});

	test("passes requested live-follow phase into the next refresh", async () => {
		let resolveSecondRefresh: (value: AccountMirrorRefreshResult) => void = () => {};
		const firstRefresh: AccountMirrorRefreshResult = {
			...createRefreshResult(),
			metadataEvidence: {
				identitySource: null,
				projectSampleIds: [],
				conversationSampleIds: ["conv_pending"],
				truncated: {
					projects: false,
					conversations: false,
					artifacts: true,
				},
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
			},
			mirrorCompleteness: {
				...completeMirror,
				state: "in_progress",
				remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
			},
		};
		const requestRefresh = vi
			.fn()
			.mockResolvedValueOnce(firstRefresh)
			.mockImplementationOnce(
				() =>
					new Promise<AccountMirrorRefreshResult>((resolve) => {
						resolveSecondRefresh = resolve;
					}),
			);
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_phase_contract",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			sweepMode: "steady_follow",
		});

		await waitFor(() => requestRefresh.mock.calls.length === 2);
		expect(requestRefresh).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
				requestedPhase: "detail-inventory",
			}),
		);
		expect(service.read("acctmirror_phase_contract")?.liveFollowCycle).toMatchObject({
			currentPhase: "detail-inventory",
			nextPhase: "detail-inventory",
		});

		resolveSecondRefresh(createRefreshResult());
		await waitFor(() => service.read("acctmirror_phase_contract")?.passCount === 2);
		service.control({ id: "acctmirror_phase_contract", action: "cancel" });
	});

	test("records collector progress lifecycle events while refresh is running", async () => {
		const requestRefresh = vi.fn(async (request) => {
			await request.onCollectorProgress?.({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
				phase: "detail-inventory",
				event: "started",
				observedAt: "2026-04-30T12:00:01.000Z",
				conversationsObserved: 1,
			});
			return new Promise<AccountMirrorRefreshResult>(() => {});
		});
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_progress_events",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			sweepMode: "steady_follow",
		});

		await waitFor(() =>
			Boolean(
				service
					.read("acctmirror_progress_events")
					?.lifecycleEvents?.some((event) => event.type === "collector_progress"),
			),
		);
		expect(service.read("acctmirror_progress_events")?.lifecycleEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "collector_progress",
					status: "running",
					message: "Collector progress: detail-inventory:started conversations=1.",
				}),
			]),
		);
		service.control({ id: "acctmirror_progress_events", action: "cancel" });
	});

	test("full-sweep live follow queues snapshot-refresh history materialization after a refresh pass", async () => {
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-04-30T12:00:02.000Z",
			reused: false,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_full_sweep_1",
				status: "queued",
			},
		}));
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const writePersistentState = vi.fn(async () => {});
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			initialState: {
				"chatgpt:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					backfillLedger: completeBackfillLedger,
				},
			},
			writePersistentState,
		});
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: {
				requestRefresh,
			},
			historyMaterializationService: {
				createJob,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_full_sweep",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationAssetKinds: ["media"],
			materializationMaxItems: 2,
		});

		await waitFor(() => service.read("acctmirror_full_sweep")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "full_sweep",
				collectorTimeoutMs: 900_000,
			}),
		);
		expect(createJob).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfile: "default",
			reconcile: true,
			refreshSnapshot: true,
			assetKinds: ["media"],
			maxItems: 2,
			force: false,
		});
		expect(service.read("acctmirror_full_sweep")).toMatchObject({
			status: "completed",
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			materializationCursor: {
				jobId: "hmj_full_sweep_1",
				jobStatus: "queued",
				passCount: 1,
				request: {
					reconcile: true,
					refreshSnapshot: true,
					assetKinds: ["media"],
					maxItems: 2,
				},
			},
		});
		expect(
			registry.readStatus({ provider: "chatgpt", runtimeProfileId: "default" }).entries[0],
		).toMatchObject({
			backfillLedger: {
				state: "in_progress",
				nextEligiblePhase: "materialization",
				cursors: {
					materialization: {
						status: "pending",
						reason: "queued materialization job hmj_full_sweep_1 with status queued",
					},
				},
			},
		});
		expect(writePersistentState).toHaveBeenCalledWith(
			expect.objectContaining({
				state: expect.objectContaining({
					backfillLedger: expect.objectContaining({
						nextEligiblePhase: "materialization",
					}),
				}),
			}),
		);
	});

	test("eligible account-library live follow queues capped file reconciliation after a refresh pass", async () => {
		const eligibleConfig = {
			runtimeProfiles: {
				default: {
					browserProfile: "wsl-chrome-3",
					defaultService: "chatgpt",
					services: {
						chatgpt: {
							identity: {
								email: "ecochran76@gmail.com",
							},
							liveFollow: {
								enabled: true,
								materializationPolicy: "metadata_only",
								accountLibrary: {
									mode: "eligible",
									maxItems: 3,
									providerWorkTimeoutMs: 120_000,
								},
							},
						},
					},
				},
			},
		};
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-06-05T04:00:02.000Z",
			reused: false,
			reuseReason: null,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_account_library_1",
				status: "queued",
			},
		}));
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const writePersistentState = vi.fn(async () => {});
		const registry = createAccountMirrorStatusRegistry({
			config: eligibleConfig,
			now: () => new Date("2026-06-05T04:00:00.000Z"),
			initialState: {
				"chatgpt:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					backfillLedger: {
						...completeBackfillLedger,
						browserProfileId: "wsl-chrome-3",
					},
				},
			},
			writePersistentState,
		});
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: {
				requestRefresh,
			},
			historyMaterializationService: {
				createJob,
			},
			now: () => new Date("2026-06-05T04:00:00.000Z"),
			generateId: () => "acctmirror_account_library_queue",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "steady_follow",
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_account_library_queue")?.status === "completed");

		expect(createJob).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfile: "default",
				browserProfile: "wsl-chrome-3",
				reconcile: true,
				assetSource: "account-library",
				refreshSnapshot: false,
				assetKinds: ["files"],
				maxItems: 3,
				providerWorkTimeoutMs: 120_000,
				force: false,
			}),
		);
		expect(service.read("acctmirror_account_library_queue")).toMatchObject({
			accountLibraryCursor: {
				jobId: "hmj_account_library_1",
				jobStatus: "queued",
				reused: false,
				passCount: 1,
				status: "queued",
				reason: "queued account-library materialization job hmj_account_library_1",
				request: expect.objectContaining({
					assetSource: "account-library",
					assetKinds: ["files"],
					maxItems: 3,
				}),
			},
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "account_library_catchup_queued",
					message: "queued account-library materialization job hmj_account_library_1",
				}),
			]),
		});
		expect(
			registry.readStatus({ provider: "chatgpt", runtimeProfileId: "default" }).entries[0],
		).toMatchObject({
			backfillLedger: {
				state: "in_progress",
				nextEligiblePhase: "account-library",
				cursors: {
					accountLibrary: {
						status: "pending",
						reason: "queued account-library materialization job hmj_account_library_1",
						readLimit: 3,
					},
				},
			},
		});
		expect(writePersistentState).toHaveBeenCalledWith(
			expect.objectContaining({
				state: expect.objectContaining({
					backfillLedger: expect.objectContaining({
						nextEligiblePhase: "account-library",
					}),
				}),
			}),
		);
	});

	test("eligible account-library live follow records reused active reconciliation jobs", async () => {
		const eligibleConfig = {
			runtimeProfiles: {
				default: {
					browserProfile: "wsl-chrome-3",
					defaultService: "chatgpt",
					services: {
						chatgpt: {
							identity: {
								email: "ecochran76@gmail.com",
							},
							liveFollow: {
								enabled: true,
								materializationPolicy: "metadata_only",
								accountLibrary: {
									mode: "eligible",
									maxItems: 1,
								},
							},
						},
					},
				},
			},
		};
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-06-05T04:02:02.000Z",
			reused: true,
			reuseReason: "active sourceKey is already running",
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_account_library_active",
				status: "running",
			},
		}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config: eligibleConfig,
				now: () => new Date("2026-06-05T04:02:00.000Z"),
			}),
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			historyMaterializationService: {
				createJob,
			},
			now: () => new Date("2026-06-05T04:02:00.000Z"),
			generateId: () => "acctmirror_account_library_reuse",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_account_library_reuse")?.status === "completed");

		expect(service.read("acctmirror_account_library_reuse")).toMatchObject({
			accountLibraryCursor: {
				jobId: "hmj_account_library_active",
				jobStatus: "running",
				reused: true,
				passCount: 1,
				status: "reused",
				reason: "active sourceKey is already running",
			},
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "account_library_catchup_queued",
					message: "active sourceKey is already running",
				}),
			]),
		});
	});

	test("eligible account-library live follow skips duplicate catch-up evaluation for the same pass", async () => {
		const eligibleConfig = {
			runtimeProfiles: {
				default: {
					browserProfile: "wsl-chrome-3",
					defaultService: "chatgpt",
					services: {
						chatgpt: {
							identity: {
								email: "ecochran76@gmail.com",
							},
							liveFollow: {
								enabled: true,
								materializationPolicy: "metadata_only",
								accountLibrary: {
									mode: "eligible",
									maxItems: 1,
								},
							},
						},
					},
				},
			},
		};
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_account_library_duplicate_pass",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "bounded" as const,
			sweepMode: "steady_follow" as const,
			phase: "backfill_history" as const,
			status: "queued" as const,
			startedAt: "2026-06-05T04:06:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: 1,
			passCount: 0,
			lastRefresh: null,
			materializationPolicy: "metadata_only" as const,
			accountLibraryCursor: {
				jobId: "hmj_account_library_prior",
				jobStatus: "queued",
				reused: false,
				requestedAt: "2026-06-05T04:05:00.000Z",
				passCount: 1,
				status: "queued" as const,
				reason: "queued account-library materialization job hmj_account_library_prior",
				request: {
					provider: "chatgpt" as const,
					runtimeProfile: "default",
					browserProfile: "wsl-chrome-3",
					boundIdentityKey: "ecochran76@gmail.com",
					reconcile: true as const,
					assetSource: "account-library" as const,
					refreshSnapshot: false,
					assetKinds: ["files" as const],
					maxItems: 1,
					providerWorkTimeoutMs: null,
					force: false,
				},
			},
			mirrorCompleteness: null,
			error: null,
			lifecycleEvents: [],
		};
		const createJob = vi.fn();
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config: eligibleConfig,
				now: () => new Date("2026-06-05T04:06:00.000Z"),
			}),
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			historyMaterializationService: {
				createJob,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-06-05T04:06:00.000Z"),
		});

		await waitFor(
			() => service.read("acctmirror_account_library_duplicate_pass")?.status === "completed",
		);

		expect(createJob).not.toHaveBeenCalled();
		expect(service.read("acctmirror_account_library_duplicate_pass")).toMatchObject({
			passCount: 1,
			accountLibraryCursor: {
				jobId: null,
				jobStatus: null,
				reused: false,
				passCount: 1,
				status: "skipped",
				reason: "account-library catch-up already evaluated for this pass",
				request: null,
			},
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "account_library_catchup_skipped",
					message: "account-library catch-up already evaluated for this pass",
				}),
			]),
		});
	});

	test("preview-only account-library live follow records a skip reason after refresh", async () => {
		const previewConfig = {
			runtimeProfiles: {
				default: {
					browserProfile: "wsl-chrome-3",
					defaultService: "chatgpt",
					services: {
						chatgpt: {
							identity: {
								email: "ecochran76@gmail.com",
							},
							liveFollow: {
								enabled: true,
								materializationPolicy: "metadata_only",
								accountLibrary: {
									mode: "preview_only",
									maxItems: 3,
								},
							},
						},
					},
				},
			},
		};
		const createJob = vi.fn();
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config: previewConfig,
				now: () => new Date("2026-06-05T04:04:00.000Z"),
			}),
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			historyMaterializationService: {
				createJob,
			},
			now: () => new Date("2026-06-05T04:04:00.000Z"),
			generateId: () => "acctmirror_account_library_preview_skip",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});

		await waitFor(
			() => service.read("acctmirror_account_library_preview_skip")?.status === "completed",
		);

		expect(createJob).not.toHaveBeenCalled();
		expect(service.read("acctmirror_account_library_preview_skip")).toMatchObject({
			accountLibraryCursor: {
				jobId: null,
				jobStatus: null,
				reused: false,
				passCount: 1,
				status: "skipped",
				reason: "liveFollow.accountLibrary.mode is preview_only",
				request: null,
			},
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "account_library_catchup_skipped",
					message: "liveFollow.accountLibrary.mode is preview_only",
				}),
			]),
		});
	});

	test("does not queue Gemini materialization when the refresh only reached the app shell", async () => {
		const requestRefresh = vi.fn(
			async (): Promise<AccountMirrorRefreshResult> => ({
				...createRefreshResult(),
				provider: "gemini",
				runtimeProfileId: "auracall-gemini-pro",
				metadataEvidence: {
					identitySource: "google-account-label",
					projectSampleIds: [],
					conversationSampleIds: [],
					routeProgress: {
						provider: "gemini",
						strategy: "gemini-left-rail",
						routeSequence: ["/app"],
						appShellVisits: 1,
						gemsViewVisits: 0,
						repeatedRouteVisits: 0,
						conversationCandidates: 0,
						selectedConversationIds: [],
						artifactBearingConversationIds: [],
						fileBearingConversationIds: [],
						materializationAttempts: 0,
						churnDetected: true,
						yieldCause: "shell_without_conversation_selection",
					},
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
			}),
		);
		const createJob = vi.fn(async () => ({
			generatedAt: "2026-04-30T12:00:02.000Z",
			reused: false,
			job: {
				id: "hmj_should_not_queue",
				status: "queued",
			},
		}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			historyMaterializationService: {
				createJob,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_gemini_shell_churn",
		});

		service.start({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			maxPasses: 1,
			sweepMode: "steady_follow",
			materializationPolicy: "full_missing_assets",
			materializationMaxItems: 1,
		});

		await waitFor(() => service.read("acctmirror_gemini_shell_churn")?.status === "completed");

		expect(createJob).not.toHaveBeenCalled();
		expect(service.read("acctmirror_gemini_shell_churn")).toMatchObject({
			status: "completed",
			materializationCursor: null,
			materializationOutcome: null,
		});
	});

	test("hydrates terminal materialization job evidence into completion readback", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-04-30T12:00:02.000Z",
			reused: false,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_terminal_1",
				status: "queued",
			},
		}));
		const readJob = vi.fn(async () => ({
			id: "hmj_terminal_1",
			status: "succeeded",
			completedAt: "2026-04-30T12:00:08.000Z",
			result: {
				metrics: {
					conversations: 5,
					materialized: 4,
					skipped: 1,
					failed: 0,
				},
				manifestPaths: ["/tmp/gemini-artifacts.json"],
				entries: [
					{ status: "materialized", checksumSha256: "abc123" },
					{ status: "materialized", checksumSha256: "def456" },
					{ status: "materialized", checksumSha256: null },
				],
				snapshotRefreshes: [
					{ routeabilityState: "routeable" },
					{ routeabilityState: "not_found_or_unavailable" },
					{ routeabilityState: "routeable" },
				],
				message: "History reconciliation materialized 4 assets from 5 conversations.",
			},
		}));
		const writePersistentState = vi.fn(async () => {});
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			initialState: {
				"chatgpt:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					backfillLedger: completeBackfillLedger,
				},
			},
			writePersistentState,
		});
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: {
				requestRefresh,
			},
			historyMaterializationService: {
				createJob,
				readJob,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_terminal_hydration",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
		});

		await waitFor(
			() =>
				service.read("acctmirror_terminal_hydration")?.materializationCursor?.jobId ===
				"hmj_terminal_1",
		);
		const hydrated = await service.refreshMaterializationStatus?.("acctmirror_terminal_hydration");

		expect(hydrated).toMatchObject({
			materializationCursor: {
				jobId: "hmj_terminal_1",
				jobStatus: "succeeded",
			},
			materializationOutcome: {
				jobId: "hmj_terminal_1",
				jobStatus: "succeeded",
				completedAt: "2026-04-30T12:00:08.000Z",
				conversationsAttempted: 5,
				materialized: 4,
				skipped: 1,
				failed: 0,
				checksumCount: 2,
				manifestPaths: ["/tmp/gemini-artifacts.json"],
				terminalRouteabilityCounts: {
					routeable: 2,
					not_found_or_unavailable: 1,
				},
			},
		});
		expect(
			registry.readStatus({ provider: "chatgpt", runtimeProfileId: "default" }).entries[0],
		).toMatchObject({
			backfillLedger: {
				state: "complete",
				nextEligiblePhase: "complete",
				cursors: {
					materialization: {
						status: "complete",
						reason:
							"materialization job hmj_terminal_1 finished with status succeeded; materialized=4 failed=0",
						scanned: 5,
					},
				},
			},
		});
		expect(writePersistentState).toHaveBeenCalledWith(
			expect.objectContaining({
				state: expect.objectContaining({
					backfillLedger: expect.objectContaining({
						nextEligiblePhase: "complete",
					}),
				}),
			}),
		);
	});

	test("upgrades idle live-follow completion into bounded full-sweep materialization", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_upgrade_claim",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			sweepMode: "steady_follow" as const,
			phase: "steady_follow" as const,
			status: "running" as const,
			startedAt: "2026-04-30T11:50:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
			maxPasses: null,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "metadata_only" as const,
			materializationAssetKinds: ["all" as const],
			materializationMaxItems: null,
			materializationRefreshSnapshot: false,
			materializationForce: false,
			materializationCursor: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const createJob = vi.fn(async () => ({
			object: "history_materialization_job_create_result" as const,
			generatedAt: "2026-04-30T12:00:03.000Z",
			reused: false,
			job: {
				object: "history_materialization_job" as const,
				id: "hmj_upgrade_claim",
				status: "queued",
			},
		}));
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			historyMaterializationService: {
				createJob,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await waitFor(() => sleep.mock.calls.length > 0);
		const upgraded = service.upgradePolicy?.({
			id: "acctmirror_upgrade_claim",
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["media"],
			materializationMaxItems: 2,
			materializationRefreshSnapshot: true,
		});

		expect(upgraded).toMatchObject({
			id: "acctmirror_upgrade_claim",
			status: "running",
			mode: "bounded",
			maxPasses: 2,
			nextAttemptAt: null,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "campaign_policy_upgraded",
					previousStatus: "idle_waiting",
				}),
			]),
		});

		await waitFor(() => service.read("acctmirror_upgrade_claim")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "full_sweep",
				collectorTimeoutMs: 900_000,
			}),
		);
		expect(createJob).toHaveBeenCalledWith({
			provider: "chatgpt",
			runtimeProfile: "default",
			reconcile: true,
			refreshSnapshot: true,
			assetKinds: ["media"],
			maxItems: 2,
			force: false,
		});
		expect(service.read("acctmirror_upgrade_claim")).toMatchObject({
			status: "completed",
			passCount: 2,
			materializationCursor: {
				jobId: "hmj_upgrade_claim",
				passCount: 2,
			},
		});
	});

	test("live-follow policy upgrade preserves live-follow mode when maxPasses is null", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_live_follow_upgrade",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			sweepMode: "steady_follow" as const,
			phase: "backfill_history" as const,
			status: "idle_waiting" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:05:00.000Z",
			maxPasses: null,
			passCount: 8,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "recent_missing_assets" as const,
			materializationAssetKinds: ["all" as const],
			materializationMaxItems: 5,
			materializationRefreshSnapshot: false,
			materializationForce: false,
			materializationCursor: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh: vi.fn(async () => createRefreshResult()),
			},
			initialOperations: [initial],
			resumeActiveOperations: false,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		const upgraded = service.upgradePolicy?.({
			id: "acctmirror_live_follow_upgrade",
			maxPasses: null,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["all"],
			materializationMaxItems: 25,
			materializationRefreshSnapshot: true,
		});

		expect(upgraded).toMatchObject({
			id: "acctmirror_live_follow_upgrade",
			status: "running",
			mode: "live_follow",
			maxPasses: null,
			nextAttemptAt: null,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			materializationMaxItems: 25,
			materializationRefreshSnapshot: true,
			lifecycleEvents: expect.arrayContaining([
				expect.objectContaining({
					type: "live_follow_policy_upgraded",
					previousStatus: "idle_waiting",
				}),
			]),
		});
	});

	test("uses a wider collector timeout for Gemini full-sweep completions", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_gemini_full_sweep",
		});

		service.start({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_gemini_full_sweep")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "gemini",
				runtimeProfileId: "auracall-gemini-pro",
				sweepMode: "full_sweep",
				collectorTimeoutMs: 900_000,
			}),
		);
	});

	test("uses a wider collector timeout for ChatGPT full-sweep completions", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_chatgpt_full_sweep",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "full_sweep",
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_chatgpt_full_sweep")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "full_sweep",
				collectorTimeoutMs: 900_000,
			}),
		);
	});

	test("uses a wider collector timeout for ChatGPT steady-follow completions", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_chatgpt_steady_follow_timeout",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "steady_follow",
			materializationPolicy: "metadata_only",
		});

		await waitFor(
			() => service.read("acctmirror_chatgpt_steady_follow_timeout")?.status === "completed",
		);

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
				collectorTimeoutMs: 900_000,
			}),
		);
	});

	test("uses a wider collector timeout for Gemini steady-follow completions", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_gemini_steady_follow",
		});

		service.start({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			maxPasses: 1,
			sweepMode: "steady_follow",
		});

		await waitFor(() => service.read("acctmirror_gemini_steady_follow")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "gemini",
				runtimeProfileId: "auracall-gemini-pro",
				sweepMode: "steady_follow",
				collectorTimeoutMs: 300_000,
			}),
		);
	});

	test("steady-follow refreshes start from the recent rail instead of resuming deep sweep cursor", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_steady_follow_recent",
		});

		service.start({
			provider: "chatgpt",
			runtimeProfileId: "default",
			maxPasses: 1,
			sweepMode: "steady_follow",
		});

		await waitFor(() => service.read("acctmirror_steady_follow_recent")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
			}),
		);
	});

	test("waits through polite cooldown instead of blocking the operation", async () => {
		const requestRefresh = vi
			.fn()
			.mockRejectedValueOnce(
				new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					"Account mirror chatgpt/default is delayed: minimum-interval.",
					{
						provider: "chatgpt",
						runtimeProfileId: "default",
						reason: "minimum-interval",
						eligibleAt: "2026-04-30T12:01:00.000Z",
					},
				),
			)
			.mockResolvedValueOnce(createRefreshResult());
		let nowMs = Date.parse("2026-04-30T12:00:00.000Z");
		const sleep = vi.fn((ms: number) => {
			if (sleep.mock.calls.length > 3) return new Promise<void>(() => {});
			nowMs += ms;
			return Promise.resolve();
		});
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date(nowMs),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date(nowMs),
			generateId: () => "acctmirror_completion_delayed",
			sleep,
		});

		service.start({ maxPasses: 3 });

		await waitFor(() => service.read("acctmirror_completion_delayed")?.status === "completed");

		expect(sleep).toHaveBeenCalledWith(60_000);
		expect(requestRefresh).toHaveBeenCalledTimes(2);
		expect(service.read("acctmirror_completion_delayed")).toMatchObject({
			status: "completed",
			passCount: 1,
			nextAttemptAt: null,
		});
	});

	test("live follow wakes from cooldown and continues without operator resume", async () => {
		const firstEligibleAt = "2026-04-30T12:01:00.000Z";
		const secondEligibleAt = "2026-04-30T12:11:00.000Z";
		let sleepCount = 0;
		let nowMs = Date.parse("2026-04-30T12:00:00.000Z");
		const requestRefresh = vi
			.fn()
			.mockRejectedValueOnce(
				new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					"Account mirror chatgpt/default is delayed: minimum-interval.",
					{
						provider: "chatgpt",
						runtimeProfileId: "default",
						reason: "minimum-interval",
						eligibleAt: firstEligibleAt,
					},
				),
			)
			.mockResolvedValueOnce(createRefreshResult())
			.mockRejectedValueOnce(
				new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					"Account mirror chatgpt/default is delayed: minimum-interval.",
					{
						provider: "chatgpt",
						runtimeProfileId: "default",
						reason: "minimum-interval",
						eligibleAt: secondEligibleAt,
					},
				),
			);
		const sleep = vi.fn((ms: number) => {
			sleepCount += 1;
			nowMs += ms;
			return sleepCount === 1 ? Promise.resolve() : new Promise<void>(() => {});
		});
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date(nowMs),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date(nowMs),
			generateId: () => "acctmirror_live_follow_cadence",
			sleep,
		});

		service.start();

		await waitFor(() => service.read("acctmirror_live_follow_cadence")?.passCount === 1);
		await waitFor(
			() => service.read("acctmirror_live_follow_cadence")?.nextAttemptAt === secondEligibleAt,
		);

		expect(requestRefresh).toHaveBeenCalledTimes(3);
		expect(sleep).toHaveBeenNthCalledWith(1, 60_000);
		expect(service.read("acctmirror_live_follow_cadence")).toMatchObject({
			status: "idle_waiting",
			mode: "live_follow",
			passCount: 1,
			lastRefresh: {
				requestId: "acctmirror_refresh_1",
			},
			nextAttemptAt: secondEligibleAt,
		});
	});

	test("rechecks persisted cooldowns in bounded slices after restart", async () => {
		let nowMs = Date.parse("2026-04-30T12:00:00.000Z");
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_restart_slice",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "backfill_history" as const,
			status: "running" as const,
			startedAt: "2026-04-30T11:55:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:03:00.000Z",
			maxPasses: null,
			passCount: 4,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: {
				...completeMirror,
				state: "in_progress" as const,
				remainingDetailSurfaces: { projects: 0, conversations: 1, total: 1 },
			},
			error: null,
		};
		const requestRefresh = vi
			.fn()
			.mockResolvedValueOnce(createRefreshResult())
			.mockRejectedValue(
				new AccountMirrorRefreshError(
					409,
					"account_mirror_not_eligible",
					"Account mirror chatgpt/default is delayed: minimum-interval.",
					{
						provider: "chatgpt",
						runtimeProfileId: "default",
						reason: "minimum-interval",
						eligibleAt: "2026-04-30T12:13:00.000Z",
					},
				),
			);
		const sleep = vi.fn((ms: number) => {
			if (sleep.mock.calls.length > 3) return new Promise<void>(() => {});
			nowMs += ms;
			return Promise.resolve();
		});
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date(nowMs),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date(nowMs),
			sleep,
		});

		await waitFor(() => service.read("acctmirror_restart_slice")?.passCount === 5);

		expect(sleep.mock.calls.slice(0, 3).map(([ms]) => ms)).toEqual([60_000, 60_000, 60_000]);
		await waitFor(
			() => service.read("acctmirror_restart_slice")?.nextAttemptAt === "2026-04-30T12:13:00.000Z",
		);
		expect(requestRefresh.mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(service.read("acctmirror_restart_slice")).toMatchObject({
			status: "idle_waiting",
			nextAttemptAt: "2026-04-30T12:13:00.000Z",
			passCount: 5,
			phase: "steady_follow",
		});
	});

	test("defers due live-follow completion refreshes while foreground work is active", async () => {
		let nowMs = Date.parse("2026-04-30T12:00:00.000Z");
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_foreground_deferred",
			provider: "gemini" as const,
			runtimeProfileId: "auracall-gemini-pro",
			mode: "live_follow" as const,
			sweepMode: "steady_follow" as const,
			phase: "steady_follow" as const,
			status: "idle_waiting" as const,
			startedAt: "2026-04-30T11:55:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:00:00.000Z",
			maxPasses: null,
			passCount: 4,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "recent_missing_assets" as const,
			materializationAssetKinds: ["all" as const],
			materializationMaxItems: 5,
			materializationRefreshSnapshot: false,
			materializationForce: false,
			materializationCursor: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const sleep = vi.fn((ms: number) => {
			nowMs += ms;
			return new Promise<void>(() => {});
		});
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date(nowMs),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date(nowMs),
			sleep,
			foregroundRetryDelayMs: 5_000,
			shouldYieldToForegroundWork: () => ({
				reason: "foreground-work",
				message: "Foreground AuraCall API work is pending.",
			}),
		});

		await waitFor(
			() =>
				service.read("acctmirror_foreground_deferred")?.nextAttemptAt ===
				"2026-04-30T12:00:05.000Z",
		);

		expect(requestRefresh).not.toHaveBeenCalled();
		expect(sleep).toHaveBeenCalledWith(5_000);
		expect(service.read("acctmirror_foreground_deferred")).toMatchObject({
			status: "idle_waiting",
			passCount: 4,
			nextAttemptAt: "2026-04-30T12:00:05.000Z",
		});
	});

	test("does not sleep on stale persisted minimum interval for bounded reconciliation", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_bounded_resume",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "bounded" as const,
			sweepMode: "full_sweep" as const,
			phase: "steady_follow" as const,
			status: "idle_waiting" as const,
			startedAt: "2026-04-30T11:55:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
			maxPasses: 2,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			materializationPolicy: "metadata_only" as const,
			materializationAssetKinds: ["all" as const],
			materializationMaxItems: null,
			materializationRefreshSnapshot: false,
			materializationForce: false,
			materializationCursor: null,
			mirrorCompleteness: completeMirror,
			error: null,
			lifecycleEvents: [],
		};
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const sleep = vi.fn(() => new Promise<void>(() => {}));
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await waitFor(() => service.read("acctmirror_bounded_resume")?.status === "completed");

		expect(sleep).not.toHaveBeenCalled();
		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				ignoreMinimumInterval: true,
			}),
		);
		expect(service.read("acctmirror_bounded_resume")).toMatchObject({
			status: "completed",
			nextAttemptAt: null,
			passCount: 2,
		});
	});

	test("parks runnable operations for restart instead of cancelling them", async () => {
		const requestRefresh = vi.fn(() => new Promise<AccountMirrorRefreshResult>(() => {}));
		const running = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_shutdown_running",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "running" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: null,
			maxPasses: null,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: completeMirror,
			error: null,
		};
		const paused = {
			...running,
			id: "acctmirror_shutdown_paused",
			status: "paused" as const,
			startedAt: "2026-04-30T11:59:00.000Z",
		};
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [running, paused],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});

		await waitFor(() => requestRefresh.mock.calls.length > 0);

		expect(service.prepareForShutdown?.().map((operation) => operation.id)).toEqual([
			"acctmirror_shutdown_running",
		]);

		expect(service.read("acctmirror_shutdown_running")).toMatchObject({
			status: "queued",
			completedAt: null,
			nextAttemptAt: null,
			lifecycleEvents: [
				{
					type: "resumed_after_restart",
					status: "running",
					previousStatus: "running",
				},
				{
					type: "parked_for_shutdown",
					status: "queued",
					previousStatus: "running",
				},
			],
		});
		expect(service.read("acctmirror_shutdown_paused")).toMatchObject({
			status: "paused",
		});
	});

	test("wakes cooldown sleeps during shutdown parking", async () => {
		const initial = {
			object: "account_mirror_completion" as const,
			id: "acctmirror_shutdown_sleep",
			provider: "chatgpt" as const,
			runtimeProfileId: "default",
			mode: "live_follow" as const,
			phase: "steady_follow" as const,
			status: "running" as const,
			startedAt: "2026-04-30T12:00:00.000Z",
			completedAt: null,
			nextAttemptAt: "2026-04-30T12:10:00.000Z",
			maxPasses: null,
			passCount: 1,
			lastRefresh: createRefreshResult(),
			mirrorCompleteness: completeMirror,
			error: null,
		};
		let sleepStarted = false;
		let sleepSettled = false;
		const sleep = vi.fn(async () => {
			sleepStarted = true;
			await new Promise<void>(() => {});
			sleepSettled = true;
		});
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			initialOperations: [initial],
			resumeActiveOperations: true,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			sleep,
		});

		await waitFor(() => sleepStarted);
		service.prepareForShutdown?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(service.read("acctmirror_shutdown_sleep")).toMatchObject({
			status: "queued",
		});
		expect(sleepSettled).toBe(false);
		expect(requestRefresh).not.toHaveBeenCalled();
	});

	test("persists parked shutdown operations for restart resume", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-completion-shutdown-"));
		try {
			const store = createAccountMirrorCompletionStore({
				config: {
					browser: {
						cache: {
							rootDir: tmp,
						},
					},
				},
			});
			const requestRefresh = vi.fn(() => new Promise<AccountMirrorRefreshResult>(() => {}));
			const service = createAccountMirrorCompletionService({
				registry: createAccountMirrorStatusRegistry({
					config,
					now: () => new Date("2026-04-30T12:00:00.000Z"),
				}),
				refreshService: {
					requestRefresh,
				},
				store,
				generateId: () => "acctmirror_shutdown_persisted",
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			});

			service.start();
			await waitFor(() => requestRefresh.mock.calls.length > 0);
			service.prepareForShutdown?.();

			await waitFor(async () =>
				Boolean(
					(await store.readOperation("acctmirror_shutdown_persisted"))?.lifecycleEvents?.some(
						(event) => event.type === "parked_for_shutdown",
					),
				),
			);
			expect(await store.readOperation("acctmirror_shutdown_persisted")).toMatchObject({
				status: "queued",
				completedAt: null,
				nextAttemptAt: null,
				lifecycleEvents: [
					{
						type: "started",
						status: "queued",
						previousStatus: null,
					},
					{
						type: "parked_for_shutdown",
						status: "queued",
						previousStatus: "running",
					},
				],
			});
		} finally {
			await fs.rm(tmp, { recursive: true, force: true });
		}
	});

	test("forces a verification refresh even when persisted status already says complete", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-30T12:00:00.000Z"),
		});
		registry.mergeState(
			{ provider: "chatgpt", runtimeProfileId: "default" },
			{
				detectedIdentityKey: "ecochran76@gmail.com",
				metadataCounts: {
					projects: 1,
					conversations: 76,
					artifacts: 0,
					files: 0,
					media: 0,
				},
				metadataEvidence: {
					identitySource: "profile-menu",
					projectSampleIds: [],
					conversationSampleIds: [],
					truncated: {
						projects: false,
						conversations: false,
						artifacts: false,
					},
				},
				lastSuccessAtMs: Date.parse("2026-04-30T11:00:00.000Z"),
				lastRefreshRequestId: "acctmirror_previous",
			},
		);
		const service = createAccountMirrorCompletionService({
			registry,
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_completion_verification",
		});

		service.start({ maxPasses: 3 });

		await waitFor(() => service.read("acctmirror_completion_verification")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledTimes(1);
		expect(service.read("acctmirror_completion_verification")).toMatchObject({
			status: "completed",
			passCount: 1,
			lastRefresh: {
				requestId: "acctmirror_refresh_1",
			},
		});
	});

	test("starts nonblocking and records completion after refresh finishes", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_completion_test",
		});

		const started = service.start({ maxPasses: 3 });

		expect(started).toMatchObject({
			id: "acctmirror_completion_test",
			status: "queued",
			mode: "bounded",
			maxPasses: 3,
		});

		await waitFor(() => service.read("acctmirror_completion_test")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "default",
				sweepMode: "steady_follow",
				requestedPhase: null,
				explicitRefresh: true,
				ignoreMinimumInterval: true,
				queueTimeoutMs: 0,
				collectorTimeoutMs: 900_000,
			}),
		);
		expect(service.read("acctmirror_completion_test")).toMatchObject({
			status: "completed",
			passCount: 1,
			mirrorCompleteness: {
				state: "complete",
			},
		});
	});

	test("requests managed browser cleanup for the final bounded Gemini refresh", async () => {
		const requestRefresh = vi.fn(async () => createRefreshResult());
		const service = createAccountMirrorCompletionService({
			registry: createAccountMirrorStatusRegistry({
				config,
				now: () => new Date("2026-04-30T12:00:00.000Z"),
			}),
			refreshService: {
				requestRefresh,
			},
			now: () => new Date("2026-04-30T12:00:00.000Z"),
			generateId: () => "acctmirror_gemini_bounded_cleanup",
		});

		service.start({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			maxPasses: 1,
			sweepMode: "steady_follow",
			materializationPolicy: "metadata_only",
		});

		await waitFor(() => service.read("acctmirror_gemini_bounded_cleanup")?.status === "completed");

		expect(requestRefresh).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "gemini",
				runtimeProfileId: "auracall-gemini-pro",
				sweepMode: "steady_follow",
				cleanupManagedBrowserAfterRefresh: true,
			}),
		);
	});
});

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	timeoutMs = 1000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error("Timed out waiting for predicate");
}
