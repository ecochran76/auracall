#!/usr/bin/env tsx
import {
	type AccountMirrorCompletionOperation,
	createAccountMirrorCompletionService,
} from "../src/accountMirror/completionService.js";
import type { AccountMirrorRefreshService } from "../src/accountMirror/refreshService.js";
import { createAccountMirrorStatusRegistry } from "../src/accountMirror/statusRegistry.js";
import { controlApiMirrorCompletionForCli } from "../src/cli/apiMirrorCompletionCommand.js";
import { readApiSchedulerDiagnosticsForCli } from "../src/cli/apiSchedulerDiagnosticsCommand.js";
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

const operationId = "acctmirror_foreground_deferral_smoke";
const initialOperation: AccountMirrorCompletionOperation = {
	object: "account_mirror_completion",
	id: operationId,
	provider: "chatgpt",
	runtimeProfileId: "default",
	mode: "live_follow",
	phase: "steady_follow",
	status: "paused",
	startedAt: "2026-07-06T04:05:00.000Z",
	completedAt: null,
	nextAttemptAt: null,
	maxPasses: null,
	passCount: 3,
	lastRefresh: null,
	mirrorCompleteness: completeMirror,
	error: null,
	lifecycleEvents: [
		{
			at: "2026-07-06T04:05:00.000Z",
			type: "operator_paused",
			status: "paused",
			previousStatus: "idle_waiting",
			processPid: process.pid,
			message: "Paused account-mirror completion by operator request.",
		},
	],
};

function assertEqual(actual: unknown, expected: unknown, label: string): void {
	if (actual !== expected) {
		throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
	}
}

function assertNeverCalled(count: number, label: string): void {
	if (count !== 0) {
		throw new Error(`${label}: expected 0 provider refresh calls, got ${count}.`);
	}
}

async function waitFor<T>(
	read: () => T | Promise<T>,
	predicate: (value: T) => boolean,
): Promise<T> {
	let latest = await read();
	for (let attempt = 0; attempt < 80; attempt += 1) {
		if (predicate(latest)) return latest;
		await new Promise((resolve) => setTimeout(resolve, 50));
		latest = await read();
	}
	throw new Error(`Timed out waiting for foreground deferral; latest=${JSON.stringify(latest)}`);
}

function readLifecycleType(input: unknown): string | null {
	if (!input || typeof input !== "object" || Array.isArray(input)) return null;
	const event = (input as { latestLifecycleEvent?: unknown }).latestLifecycleEvent;
	if (!event || typeof event !== "object" || Array.isArray(event)) return null;
	const type = (event as { type?: unknown }).type;
	return typeof type === "string" ? type : null;
}

async function main(): Promise<void> {
	let refreshCalls = 0;
	const registry = createAccountMirrorStatusRegistry({
		config,
		now: () => new Date("2026-07-06T04:05:00.000Z"),
	});
	const refreshService: AccountMirrorRefreshService = {
		async requestRefresh() {
			refreshCalls += 1;
			throw new Error("foreground deferral smoke must not call provider refresh");
		},
	};
	const completionService = createAccountMirrorCompletionService({
		registry,
		refreshService,
		initialOperations: [initialOperation],
		resumeActiveOperations: false,
		now: () => new Date("2026-07-06T04:05:00.000Z"),
		foregroundRetryDelayMs: 5_000,
		shouldYieldToForegroundWork: () => ({
			reason: "foreground-work",
			message: "Foreground AuraCall API work is pending.",
		}),
	});
	const server = await createResponsesHttpServer(
		{
			host: "127.0.0.1",
			port: 0,
			backgroundDrainIntervalMs: 0,
			accountMirrorSchedulerIntervalMs: 0,
		},
		{
			config,
			accountMirrorCompletionService: completionService,
		},
	);

	try {
		const resumed = (await controlApiMirrorCompletionForCli({
			port: server.port,
			id: operationId,
			action: "resume",
		})) as AccountMirrorCompletionOperation;
		assertEqual(resumed.status, "queued", "CLI resume immediate status");

		const deferred = await waitFor(
			() => completionService.read(operationId),
			(operation) =>
				operation?.status === "idle_waiting" &&
				operation.lifecycleEvents?.at(-1)?.type === "foreground_work_deferred",
		);
		assertEqual(deferred?.nextAttemptAt, "2026-07-06T04:05:05.000Z", "deferred retry time");
		assertNeverCalled(refreshCalls, "foreground deferral");

		const apiStatus = await readApiStatusForCli({ port: server.port });
		const account = apiStatus.liveFollow.targets?.accounts.find(
			(candidate) => candidate.provider === "chatgpt" && candidate.runtimeProfileId === "default",
		);
		assertEqual(
			account?.latestLifecycleEvent?.type,
			"foreground_work_deferred",
			"API status latest lifecycle event",
		);
		assertEqual(account?.actualStatus, "idle_waiting", "API status target state");
		assertEqual(account?.activeCompletionId, operationId, "API status active completion id");

		const diagnostics = await readApiSchedulerDiagnosticsForCli({
			port: server.port,
			provider: "chatgpt",
			runtimeProfile: "default",
			completionId: operationId,
		});
		const completion = (diagnostics.diagnostics as { completion?: unknown }).completion;
		assertEqual(
			readLifecycleType(completion),
			"foreground_work_deferred",
			"diagnostics lifecycle event",
		);

		const paused = (await controlApiMirrorCompletionForCli({
			port: server.port,
			id: operationId,
			action: "pause",
		})) as AccountMirrorCompletionOperation;
		assertEqual(paused.status, "paused", "CLI pause after deferral");

		console.log(
			[
				`foreground-deferral smoke: pass port=${server.port}`,
				`completion=${operationId}`,
				"resume=queued",
				"deferred=foreground_work_deferred",
				"providerRefreshCalls=0",
				`retryAt=${deferred?.nextAttemptAt ?? "unknown"}`,
				`statusLifecycle=${account?.latestLifecycleEvent?.type ?? "unknown"}`,
				`diagnosticsLifecycle=${readLifecycleType(completion) ?? "unknown"}`,
				"providerWork=none",
			].join("\n"),
		);
	} finally {
		completionService.control({ id: operationId, action: "cancel" });
		await server.close();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
