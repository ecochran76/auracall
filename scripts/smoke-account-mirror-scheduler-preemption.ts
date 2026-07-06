#!/usr/bin/env tsx
import type {
	AccountMirrorCompletionOperation,
	AccountMirrorCompletionService,
} from "../src/accountMirror/completionService.js";
import type {
	AccountMirrorSchedulerPassHistory,
	AccountMirrorSchedulerPassLedger,
} from "../src/accountMirror/schedulerLedger.js";
import type { AccountMirrorSchedulerPassResult } from "../src/accountMirror/schedulerService.js";
import { readApiStatusForCli } from "../src/cli/apiStatusCommand.js";
import { createResponsesHttpServer } from "../src/http/responsesServer.js";

const config = {
	model: "gpt-5.2",
	browser: {},
	runtimeProfiles: {
		default: {
			browserProfile: "default",
			defaultService: "chatgpt",
			services: {
				chatgpt: {
					identity: { email: "operator@example.com" },
					liveFollow: { enabled: true },
				},
			},
		},
	},
};

const completeMirror = {
	state: "complete" as const,
	summary: "Smoke mirror is complete.",
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

const preemptedPass: AccountMirrorSchedulerPassResult = {
	object: "account_mirror_scheduler_pass",
	mode: "execute",
	action: "skipped",
	startedAt: "2026-07-06T04:20:00.000Z",
	completedAt: "2026-07-06T04:20:01.000Z",
	selectedTarget: {
		provider: "chatgpt",
		runtimeProfileId: "default",
		browserProfileId: "default",
		status: "eligible",
		reason: "eligible",
		eligibleAt: "2026-07-06T04:20:00.000Z",
		mirrorCompleteness: completeMirror,
		requestedPhase: "identity",
		phaseDecision: {
			phase: "identity",
			status: "pending",
			reason: "initial identity verification is due",
		},
	},
	backpressure: {
		reason: "foreground-work",
		message: "Foreground AuraCall API work is pending.",
	},
	metrics: {
		totalTargets: 1,
		eligibleTargets: 1,
		delayedTargets: 0,
		blockedTargets: 0,
		liveFollowEnabledTargets: 1,
		liveFollowEligibleTargets: 1,
		liveFollowDelayedTargets: 0,
		defaultChatgptEligibleTargets: 1,
		defaultChatgptDelayedTargets: 0,
		inProgressEligibleTargets: 0,
	},
	refresh: null,
	error: null,
};

const reconcileSentinelOperation: AccountMirrorCompletionOperation = {
	object: "account_mirror_completion",
	id: "acctmirror_scheduler_preemption_reconcile_sentinel",
	provider: "chatgpt",
	runtimeProfileId: "default",
	mode: "live_follow",
	phase: "steady_follow",
	status: "idle_waiting",
	startedAt: "2026-07-06T04:19:59.000Z",
	completedAt: null,
	nextAttemptAt: "2026-07-06T04:21:00.000Z",
	maxPasses: null,
	passCount: 1,
	lastRefresh: null,
	mirrorCompleteness: completeMirror,
	error: null,
	lifecycleEvents: [],
};

function assertEqual(actual: unknown, expected: unknown, label: string): void {
	if (actual !== expected) {
		throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
	}
}

function createMemorySchedulerLedger(): AccountMirrorSchedulerPassLedger {
	const entries: AccountMirrorSchedulerPassResult[] = [];
	const readHistory = async (): Promise<AccountMirrorSchedulerPassHistory> => ({
		object: "account_mirror_scheduler_pass_history",
		version: 1,
		updatedAt: entries[0]?.completedAt ?? null,
		limit: 20,
		entries,
	});
	return {
		async appendPass(pass) {
			entries.unshift(pass);
			return readHistory();
		},
		readHistory,
	};
}

function createNoProviderCompletionService(): AccountMirrorCompletionService {
	let activeListSentinelAvailable = true;
	return {
		start: () => {
			throw new Error("scheduler preemption smoke must not start completions");
		},
		read: () => null,
		list: (request) => {
			if (request?.status === "active" && activeListSentinelAvailable) {
				activeListSentinelAvailable = false;
				return [reconcileSentinelOperation];
			}
			return [];
		},
		control: () => null,
	};
}

function readRawAccount(status: Awaited<ReturnType<typeof readApiStatusForCli>>) {
	const raw = status.raw as {
		liveFollow?: {
			targets?: {
				accounts?: Array<{
					provider?: string;
					runtimeProfileId?: string;
					routineDecision?: {
						state?: string;
						nextPhase?: string | null;
						preemption?: {
							state?: string;
							reason?: string | null;
						} | null;
					};
				}>;
			};
		};
	};
	return raw.liveFollow?.targets?.accounts?.find(
		(account) => account.provider === "chatgpt" && account.runtimeProfileId === "default",
	);
}

async function main(): Promise<void> {
	let runOnceCalls = 0;
	const server = await createResponsesHttpServer(
		{
			host: "127.0.0.1",
			port: 0,
			backgroundDrainIntervalMs: 0,
			accountMirrorSchedulerIntervalMs: 60_000,
			accountMirrorSchedulerDryRun: false,
			reconcileAccountMirrorLiveFollowOnStart: false,
		},
		{
			config,
			accountMirrorSchedulerService: {
				async runOnce(request) {
					runOnceCalls += 1;
					assertEqual(request?.dryRun, false, "scheduler dry-run flag");
					return preemptedPass;
				},
			},
			accountMirrorSchedulerLedger: createMemorySchedulerLedger(),
			accountMirrorCompletionService: createNoProviderCompletionService(),
		},
	);

	try {
		const response = await fetch(`http://127.0.0.1:${server.port}/status`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				accountMirrorScheduler: { action: "run-once", dryRun: false },
			}),
		});
		assertEqual(response.status, 200, "scheduler run-once HTTP status");

		const apiStatus = await readApiStatusForCli({ port: server.port });
		assertEqual(runOnceCalls, 1, "scheduler runOnce call count");
		assertEqual(apiStatus.scheduler.operatorStatus.posture, "waiting", "scheduler posture");
		assertEqual(
			apiStatus.scheduler.operatorStatus.backpressureReason,
			"foreground-work",
			"scheduler backpressure",
		);
		assertEqual(
			apiStatus.scheduler.backpressure.reason,
			"foreground-work",
			"scheduler last pass backpressure",
		);

		const account = readRawAccount(apiStatus);
		assertEqual(account?.routineDecision?.state, "operator_preempted", "target routine state");
		assertEqual(account?.routineDecision?.nextPhase, "identity", "target next phase");
		assertEqual(
			account?.routineDecision?.preemption?.state,
			"foreground-work",
			"target preemption state",
		);
		assertEqual(
			account?.routineDecision?.preemption?.reason,
			"Foreground AuraCall API work is pending.",
			"target preemption reason",
		);

		console.log(
			[
				`scheduler-preemption smoke: pass port=${server.port}`,
				"schedulerRunOnceCalls=1",
				"schedulerPosture=waiting",
				"schedulerBackpressure=foreground-work",
				"targetRoutineState=operator_preempted",
				"targetNextPhase=identity",
				"providerRefreshCalls=0",
				"providerWork=none",
			].join("\n"),
		);
	} finally {
		await server.close();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
