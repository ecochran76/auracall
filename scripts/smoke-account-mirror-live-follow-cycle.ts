#!/usr/bin/env tsx
import type { AccountMirrorBackfillLedger } from "../src/accountMirror/backfillLedger.js";
import type {
	AccountMirrorRefreshResult,
	AccountMirrorRefreshService,
} from "../src/accountMirror/refreshService.js";
import { createAccountMirrorSchedulerPassService } from "../src/accountMirror/schedulerService.js";
import {
	type AccountMirrorCompleteness,
	createAccountMirrorStatusRegistry,
} from "../src/accountMirror/statusRegistry.js";

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
	},
};

const inProgressMirror: AccountMirrorCompleteness = {
	state: "in_progress",
	summary: "Project conversations and detail inventory remain pending.",
	remainingDetailSurfaces: {
		projects: 0,
		conversations: 4,
		total: 4,
	},
	signals: {
		projectsTruncated: false,
		conversationsTruncated: false,
		attachmentInventoryTruncated: true,
		attachmentCursorPresent: true,
	},
};

const completeMirror: AccountMirrorCompleteness = {
	state: "complete",
	summary: "Mirrored metadata indexes are complete within current provider surfaces.",
	remainingDetailSurfaces: {
		projects: 0,
		conversations: 0,
		total: 0,
	},
	signals: {
		projectsTruncated: false,
		conversationsTruncated: false,
		attachmentInventoryTruncated: false,
		attachmentCursorPresent: false,
	},
};

function baseLedger(): AccountMirrorBackfillLedger {
	return {
		object: "account_mirror_backfill_ledger",
		version: 1,
		provider: "chatgpt",
		runtimeProfileId: "default",
		browserProfileId: "default",
		boundIdentityKey: "ecochran76@gmail.com",
		updatedAt: "2026-07-06T12:00:00.000Z",
		state: "in_progress",
		lastCompletedPhase: "root-conversations",
		nextEligiblePhase: "project-conversations",
		cursors: {
			projects: {
				status: "complete",
				reason: "project cursor complete",
				updatedAt: "2026-07-06T11:59:00.000Z",
				nextIndex: null,
				readLimit: null,
				scanned: 2,
				yielded: false,
			},
			rootRail: {
				status: "complete",
				reason: "root rail cursor complete",
				updatedAt: "2026-07-06T11:59:15.000Z",
				nextIndex: null,
				readLimit: null,
				scanned: 24,
				yielded: false,
			},
			projectConversations: {
				status: "pending",
				reason: "Project conversation cursor yielded before finishing.",
				updatedAt: "2026-07-06T11:59:30.000Z",
				nextIndex: 8,
				readLimit: 2,
				scanned: 8,
				yielded: true,
			},
			newestFirstDetail: {
				status: "pending",
				reason: "Detail inventory waits for project conversation catch-up.",
				updatedAt: "2026-07-06T11:59:30.000Z",
				nextIndex: 0,
				readLimit: 4,
				scanned: 0,
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
				reason: "Metadata-only smoke does not materialize local bytes.",
				updatedAt: null,
				nextIndex: null,
				readLimit: null,
				scanned: null,
				yielded: false,
			},
		},
	};
}

function detailLedger(): AccountMirrorBackfillLedger {
	return {
		...baseLedger(),
		updatedAt: "2026-07-06T12:01:00.000Z",
		lastCompletedPhase: "project-conversations",
		nextEligiblePhase: "detail-inventory",
		cursors: {
			...baseLedger().cursors,
			projectConversations: {
				status: "complete",
				reason: "Project conversation cursor complete.",
				updatedAt: "2026-07-06T12:01:00.000Z",
				nextIndex: null,
				readLimit: 2,
				scanned: 10,
				yielded: false,
			},
			newestFirstDetail: {
				status: "pending",
				reason: "Newest-first detail cursor is pending after project catch-up.",
				updatedAt: "2026-07-06T12:01:00.000Z",
				nextIndex: 4,
				readLimit: 4,
				scanned: 4,
				yielded: false,
				conversationDetail: null,
			},
		},
	};
}

function completeLedger(): AccountMirrorBackfillLedger {
	return {
		...detailLedger(),
		updatedAt: "2026-07-06T12:02:00.000Z",
		state: "complete",
		lastCompletedPhase: "detail-inventory",
		nextEligiblePhase: "complete",
		cursors: {
			...detailLedger().cursors,
			newestFirstDetail: {
				status: "complete",
				reason: "Newest-first detail cursor complete.",
				updatedAt: "2026-07-06T12:02:00.000Z",
				nextIndex: null,
				readLimit: 4,
				scanned: 8,
				yielded: false,
				conversationDetail: null,
			},
		},
	};
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
	if (actual !== expected) {
		throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
	}
}

async function main(): Promise<void> {
	const registry = createAccountMirrorStatusRegistry({
		config,
		now: () => new Date("2026-07-06T12:00:00.000Z"),
		initialState: {
			"chatgpt:default": {
				detectedIdentityKey: "ecochran76@gmail.com",
				metadataCounts: {
					projects: 2,
					conversations: 24,
					artifacts: 12,
					files: 8,
					media: 0,
				},
				backfillLedger: baseLedger(),
			},
		},
	});
	const requestedPhases: Array<string | null> = [];
	const refreshService: AccountMirrorRefreshService = {
		async requestRefresh(request) {
			const requestedPhase = request?.requestedPhase ?? null;
			requestedPhases.push(requestedPhase);
			const passNumber = requestedPhases.length;
			if (passNumber === 1) {
				registry.mergeState(
					{ provider: "chatgpt", runtimeProfileId: "default" },
					{
						backfillLedger: detailLedger(),
						metadataEvidence: {
							identitySource: "profile-menu",
							projectSampleIds: ["project_alpha"],
							conversationSampleIds: ["conv_project_8"],
							projectConversations: {
								nextProjectIndex: 8,
								readLimit: 2,
								scannedProjects: 10,
								yielded: false,
							},
							truncated: {
								projects: false,
								conversations: false,
								artifacts: true,
							},
						},
					},
				);
				return createRefreshResult(requestedPhase, inProgressMirror, passNumber);
			}
			registry.mergeState(
				{ provider: "chatgpt", runtimeProfileId: "default" },
				{
					backfillLedger: completeLedger(),
					metadataEvidence: {
						identitySource: "profile-menu",
						projectSampleIds: ["project_alpha"],
						conversationSampleIds: ["conv_project_8", "conv_project_9"],
						collectorProgress: {
							provider: "chatgpt",
							runtimeProfileId: "default",
							sweepMode: "steady_follow",
							phase: "complete",
							event: "completed",
							observedAt: "2026-07-06T12:02:00.000Z",
						},
						truncated: {
							projects: false,
							conversations: false,
							artifacts: false,
						},
					},
				},
			);
			return createRefreshResult(requestedPhase, completeMirror, passNumber);
		},
	};
	const scheduler = createAccountMirrorSchedulerPassService({
		registry,
		refreshService,
		now: () => new Date("2026-07-06T12:00:00.000Z"),
	});

	const firstPass = await scheduler.runOnce({ dryRun: false });
	assertEqual(firstPass.action, "refresh-completed", "first pass action");
	assertEqual(
		firstPass.selectedTarget?.requestedPhase,
		"project-conversations",
		"first pass requested phase",
	);
	assertEqual(
		firstPass.selectedTarget?.phaseDecision?.reason,
		"Project conversation cursor yielded before finishing.",
		"first pass phase reason",
	);

	const secondPass = await scheduler.runOnce({ dryRun: false });
	assertEqual(secondPass.action, "refresh-completed", "second pass action");
	assertEqual(
		secondPass.selectedTarget?.requestedPhase,
		"detail-inventory",
		"second pass requested phase",
	);
	assertEqual(
		secondPass.selectedTarget?.phaseDecision?.reason,
		"Newest-first detail cursor is pending after project catch-up.",
		"second pass phase reason",
	);
	assertEqual(
		requestedPhases.join(","),
		"project-conversations,detail-inventory",
		"refresh requested phase sequence",
	);

	const finalStatus = registry.readStatus();
	assertEqual(finalStatus.entries[0]?.backfillLedger?.state, "complete", "final ledger state");
	assertEqual(
		finalStatus.entries[0]?.backfillLedger?.nextEligiblePhase,
		"complete",
		"final ledger next phase",
	);

	console.log(
		[
			"live-follow-cycle smoke: pass",
			`first.requestedPhase=${firstPass.selectedTarget?.requestedPhase ?? "unknown"}`,
			`first.reason=${firstPass.selectedTarget?.phaseDecision?.reason ?? "unknown"}`,
			`second.requestedPhase=${secondPass.selectedTarget?.requestedPhase ?? "unknown"}`,
			`second.reason=${secondPass.selectedTarget?.phaseDecision?.reason ?? "unknown"}`,
			`final.nextEligiblePhase=${finalStatus.entries[0]?.backfillLedger?.nextEligiblePhase ?? "unknown"}`,
			"providerWork=none",
		].join("\n"),
	);
}

function createRefreshResult(
	requestedPhase: AccountMirrorRefreshResult["requestedPhase"],
	mirrorCompleteness: AccountMirrorCompleteness,
	passNumber: number,
): AccountMirrorRefreshResult {
	return {
		object: "account_mirror_refresh",
		requestId: `acctmirror_cycle_smoke_${passNumber}`,
		status: "completed",
		provider: "chatgpt",
		runtimeProfileId: "default",
		browserProfileId: "default",
		requestedPhase,
		startedAt: `2026-07-06T12:0${passNumber}:00.000Z`,
		completedAt: `2026-07-06T12:0${passNumber}:01.000Z`,
		dispatcher: {
			key: null,
			operationId: null,
			blockedBy: null,
		},
		metadataCounts: {
			projects: 2,
			conversations: 24,
			artifacts: 12,
			files: 8,
			media: 0,
		},
		metadataEvidence: null,
		mirrorCompleteness,
		detectedIdentityKey: "ecochran76@gmail.com",
		detectedAccountLevel: "Business",
		mirrorStatus: {
			object: "account_mirror_status",
			generatedAt: `2026-07-06T12:0${passNumber}:01.000Z`,
			entries: [],
			metrics: {
				total: 1,
				eligible: 1,
				delayed: 0,
				blocked: 0,
			},
		},
	};
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
