import { describe, expect, it } from "vitest";
import {
	assertApiStatusBackpressure,
	assertApiStatusCompletionMetrics,
	assertApiStatusLiveFollowSeverity,
	assertApiStatusSchedulerPosture,
	formatApiStatusCliSummary,
	parseApiStatusAccountMirrorPosture,
	parseApiStatusBackpressureReason,
	parseApiStatusLiveFollowSeverity,
	readApiStatusForCli,
	summarizeApiStatusPayload,
} from "../../src/cli/apiStatusCommand.js";

const statusPayload = {
	ok: true,
	api: {
		process: {
			pid: 4242,
			ppid: 100,
			uptimeSeconds: 31,
			cwd: "/home/ecochran76",
			execPath: "/usr/bin/node",
			nodeVersion: "v25.8.0",
		},
		managedService: {
			manager: "systemd-user",
			unitName: "auracall-api.service",
			logPath: "/home/ecochran76/.auracall/logs/api-18080.log",
			installCommand: "pnpm run install:user-runtime-service",
			restartCommand: "systemctl --user restart auracall-api.service",
			statusCommand: "systemctl --user status auracall-api.service",
		},
	},
	routes: {
		apiLogTail: "/v1/api/logs/tail[?maxBytes=32768]",
	},
	accountMirrorScheduler: {
		enabled: true,
		state: "idle",
		dryRun: true,
		lastWakeReason: "media-generation-settled",
		lastWakeAt: "2026-04-29T12:00:01.000Z",
		operatorStatus: {
			posture: "backpressured",
			reason: "minimum interval has not elapsed",
			backpressureReason: "routine-delayed",
		},
		lastPass: {
			action: "skipped",
			backpressure: {
				reason: "routine-delayed",
				message: "minimum interval has not elapsed",
			},
		},
		history: {
			entries: [
				{
					completedAt: "2026-04-29T11:55:00.000Z",
					selectedTarget: {
						provider: "chatgpt",
						runtimeProfileId: "default",
					},
					backpressure: {
						reason: "yielded-to-queued-work",
					},
					refresh: {
						mirrorCompleteness: {
							remainingDetailSurfaces: {
								total: 4,
							},
						},
						metadataEvidence: {
							attachmentInventory: {
								yieldCause: {
									ownerCommand: "media-generation:chatgpt:image",
								},
							},
						},
					},
				},
			],
		},
	},
	accountMirrorCompletions: {
		object: "account_mirror_completion_summary",
		generatedAt: "2026-04-29T12:00:02.000Z",
		metrics: {
			total: 3,
			active: 2,
			queued: 0,
			running: 0,
			paused: 1,
			completed: 1,
			blocked: 0,
			failed: 0,
			cancelled: 1,
		},
		active: [
			{
				id: "acctmirror_paused",
				provider: "chatgpt",
				runtimeProfileId: "default",
				mode: "live_follow",
				phase: "steady_follow",
				status: "paused",
				startedAt: "2026-04-29T11:00:00.000Z",
				completedAt: null,
				nextAttemptAt: "2026-04-29T12:05:00.000Z",
				passCount: 7,
				error: null,
			},
			{
				id: "acctmirror_running",
				provider: "grok",
				runtimeProfileId: "default",
				mode: "live_follow",
				phase: "steady_follow",
				status: "running",
				startedAt: "2026-04-29T11:30:00.000Z",
				completedAt: null,
				nextAttemptAt: null,
				passCount: 2,
				error: null,
			},
		],
		recent: [
			{
				id: "acctmirror_cancelled",
				provider: "gemini",
				runtimeProfileId: "default",
				mode: "live_follow",
				phase: "backfill_history",
				status: "cancelled",
				startedAt: "2026-04-29T10:00:00.000Z",
				completedAt: "2026-04-29T10:30:00.000Z",
				nextAttemptAt: null,
				passCount: 3,
				error: null,
			},
			{
				id: "acctmirror_done",
				provider: "grok",
				runtimeProfileId: "default",
				mode: "bounded",
				phase: "steady_follow",
				status: "completed",
				startedAt: "2026-04-29T09:00:00.000Z",
				completedAt: "2026-04-29T09:10:00.000Z",
				nextAttemptAt: null,
				passCount: 1,
				error: null,
			},
		],
	},
	liveFollow: {
		targets: {
			total: 3,
			enabled: 2,
			disabled: 0,
			unconfigured: 1,
			missingIdentity: 0,
			unsupported: 0,
			active: 2,
			queued: 0,
			running: 0,
			paused: 1,
			attentionNeeded: 1,
			complete: 1,
			inProgress: 1,
			none: 1,
			unknown: 0,
			accounts: [
				{
					provider: "chatgpt",
					runtimeProfileId: "default",
					desiredState: "enabled",
					desiredEnabled: true,
					actualStatus: "paused",
					activeCompletionId: "acctmirror_paused",
					phase: "steady_follow",
					passCount: 7,
					nextAttemptAt: "2026-04-29T12:05:00.000Z",
					mirrorCompleteness: "complete",
					resumePolicy: {
						classification: "operator_paused",
						action: "keep_existing",
						reason: "active live-follow completion is operator-paused",
						activeCompletionId: "acctmirror_paused",
					},
					routineDecision: {
						state: "paused",
						nextPhase: "detail-inventory",
						why: "active live-follow completion is paused",
						eligibleAt: "2026-04-29T12:05:00.000Z",
						lastProgressAt: "2026-04-29T11:55:00.000Z",
						remainingWork: {
							detailSurfaces: 4,
							materializationAssets: 2,
							accountLibraryStatus: "disabled",
						},
						guard: null,
						preemption: null,
						cycle: {
							id: "lfc_cli_status",
							currentPhase: "detail-inventory",
							nextPhase: "detail-inventory",
							status: "pending",
							updatedAt: "2026-04-29T11:55:00.000Z",
							passCount: 7,
							reason: "freshness frontier selected 1 conversation row(s) for detail",
						},
					},
					metadataCounts: {
						projects: 1,
						conversations: 10,
						artifacts: 2,
						files: 3,
						media: 0,
					},
				},
				{
					provider: "grok",
					runtimeProfileId: "default",
					desiredState: "enabled",
					desiredEnabled: true,
					actualStatus: "running",
					activeCompletionId: "acctmirror_running",
					phase: "steady_follow",
					passCount: 2,
					nextAttemptAt: null,
					mirrorCompleteness: "in_progress",
					metadataCounts: {
						projects: 0,
						conversations: 4,
						artifacts: 0,
						files: 0,
						media: 0,
					},
				},
			],
			desired: {
				total: 3,
				enabled: 2,
				disabled: 0,
				unconfigured: 1,
				missingIdentity: 0,
				unsupported: 0,
			},
			actual: {
				active: 2,
				queued: 0,
				running: 0,
				paused: 1,
				attentionNeeded: 1,
				complete: 1,
				inProgress: 1,
				none: 1,
				unknown: 0,
			},
		},
	},
};

describe("api status CLI helpers", () => {
	it("summarizes account mirror scheduler backpressure from /status", () => {
		const summary = summarizeApiStatusPayload(statusPayload, {
			host: "127.0.0.1",
			port: 18080,
		});

		expect(summary).toMatchObject({
			ok: true,
			host: "127.0.0.1",
			port: 18080,
			api: {
				process: {
					pid: 4242,
					ppid: 100,
					uptimeSeconds: 31,
					cwd: "/home/ecochran76",
					execPath: "/usr/bin/node",
					nodeVersion: "v25.8.0",
				},
				managedService: {
					manager: "systemd-user",
					unitName: "auracall-api.service",
					logPath: "/home/ecochran76/.auracall/logs/api-18080.log",
					installCommand: "pnpm run install:user-runtime-service",
					restartCommand: "systemctl --user restart auracall-api.service",
					statusCommand: "systemctl --user status auracall-api.service",
				},
				logTailRoute: "/v1/api/logs/tail[?maxBytes=32768]",
			},
			scheduler: {
				enabled: true,
				state: "idle",
				dryRun: true,
				lastWakeReason: "media-generation-settled",
				lastWakeAt: "2026-04-29T12:00:01.000Z",
				lastAction: "skipped",
				operatorStatus: {
					posture: "backpressured",
					reason: "minimum interval has not elapsed",
					backpressureReason: "routine-delayed",
				},
				backpressure: {
					reason: "routine-delayed",
					message: "minimum interval has not elapsed",
				},
				latestYield: {
					completedAt: "2026-04-29T11:55:00.000Z",
					provider: "chatgpt",
					runtimeProfileId: "default",
					queuedOwnerCommand: "media-generation:chatgpt:image",
					remainingDetailSurfaces: 4,
				},
			},
			completions: {
				generatedAt: "2026-04-29T12:00:02.000Z",
				metrics: {
					total: 3,
					active: 2,
					queued: 0,
					running: 0,
					paused: 1,
					completed: 1,
					blocked: 0,
					failed: 0,
					cancelled: 1,
				},
				active: [
					{
						id: "acctmirror_paused",
						provider: "chatgpt",
						runtimeProfileId: "default",
						status: "paused",
						nextAttemptAt: "2026-04-29T12:05:00.000Z",
					},
					{
						id: "acctmirror_running",
						provider: "grok",
						runtimeProfileId: "default",
						status: "running",
						nextAttemptAt: null,
					},
				],
				recentControlled: [
					{
						id: "acctmirror_cancelled",
						provider: "gemini",
						runtimeProfileId: "default",
						status: "cancelled",
					},
				],
			},
			schedulerDiagnosticsHints: [
				{
					provider: "chatgpt",
					runtimeProfileId: "default",
					completionId: "acctmirror_paused",
					command:
						"auracall api scheduler-diagnostics --port 18080 --provider chatgpt --runtime-profile default --completion-id acctmirror_paused",
				},
				{
					provider: "grok",
					runtimeProfileId: "default",
					completionId: "acctmirror_running",
					command:
						"auracall api scheduler-diagnostics --port 18080 --provider grok --runtime-profile default --completion-id acctmirror_running",
				},
			],
			liveFollow: {
				line: "Live follow health: severity=attention-needed posture=backpressured state=idle enabled=2 active=2 paused=1 attention=1 backpressure=routine-delayed latestYield=chatgpt/default remaining=4 queued=media-generation:chatgpt:image",
				severity: "attention-needed",
				schedulerPosture: "backpressured",
				schedulerState: "idle",
				backpressureReason: "routine-delayed",
				activeCompletions: 2,
				pausedCompletions: 1,
				failedCompletions: 0,
				cancelledCompletions: 1,
				latestYield: {
					provider: "chatgpt",
					runtimeProfileId: "default",
					queuedOwnerCommand: "media-generation:chatgpt:image",
					remainingDetailSurfaces: 4,
				},
				targets: {
					total: 3,
					enabled: 2,
					active: 2,
					attentionNeeded: 1,
					complete: 1,
					inProgress: 1,
					accounts: [
						{
							provider: "chatgpt",
							runtimeProfileId: "default",
							desiredState: "enabled",
							actualStatus: "paused",
							activeCompletionId: "acctmirror_paused",
							metadataCounts: {
								conversations: 10,
							},
						},
						{
							provider: "grok",
							runtimeProfileId: "default",
							desiredState: "enabled",
							actualStatus: "running",
							activeCompletionId: "acctmirror_running",
							metadataCounts: {
								conversations: 4,
							},
						},
					],
				},
			},
		});
		expect(formatApiStatusCliSummary(summary)).toContain(
			"API service: pid=4242 unit=auracall-api.service log=/home/ecochran76/.auracall/logs/api-18080.log tail=/v1/api/logs/tail[?maxBytes=32768]",
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Live follow health: severity=attention-needed posture=backpressured state=idle enabled=2 active=2 paused=1 attention=1 backpressure=routine-delayed latestYield=chatgpt/default remaining=4 queued=media-generation:chatgpt:image",
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Latest lazy mirror backpressure: routine-delayed - minimum interval has not elapsed",
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Latest lazy mirror wake: media-generation-settled at 2026-04-29T12:00:01.000Z",
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Account mirror posture: backpressured - minimum interval has not elapsed",
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Latest lazy mirror yield: chatgpt/default at 2026-04-29T11:55:00.000Z queued=media-generation:chatgpt:image remaining=4",
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Account mirror completions: active=2 queued=0 running=0 idle_waiting=unknown paused=1 failed=0 cancelled=1 total=3",
		);
		expect(formatApiStatusCliSummary(summary)).toContain("Scheduler diagnostics: available=2");
		expect(formatApiStatusCliSummary(summary)).toContain(
			'Scheduler diagnostics command 1 (chatgpt/default): "auracall api scheduler-diagnostics --port 18080 --provider chatgpt --runtime-profile default --completion-id acctmirror_paused"',
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			'Scheduler diagnostics command 2 (grok/default): "auracall api scheduler-diagnostics --port 18080 --provider grok --runtime-profile default --completion-id acctmirror_running"',
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Live follow targets: total=3 enabled=2 active=2 complete=1 in_progress=1 asset_unknown_or_deferred=0 attention=1",
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Live follow desired/actual: desired_enabled=2 desired_disabled=0 desired_missing_identity=0 actual_active=2 actual_complete=1 actual_attention=1",
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Active mirror completion: acctmirror_paused chatgpt/default status=paused phase=steady_follow next=2026-04-29T12:05:00.000Z",
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Recent controlled mirror completion: acctmirror_cancelled gemini/default status=cancelled phase=backfill_history",
		);
	});

	it("summarizes proof scope and deferred asset inventory from /status", () => {
		const payload = {
			...statusPayload,
			accountMirrorProofScope: {
				enabled: true,
				provider: "gemini",
				runtimeProfileId: "auracall-gemini-pro",
				tenantKey: "gemini:ecochran76@gmail.com",
				bindingKey: "runtime:auracall-gemini-pro:gemini",
				globalLiveFollowSuppressed: true,
			},
			liveFollow: {
				targets: {
					...statusPayload.liveFollow.targets,
					accounts: [
						{
							...statusPayload.liveFollow.targets.accounts[0],
							provider: "gemini",
							runtimeProfileId: "auracall-gemini-pro",
							tenantKey: "gemini:ecochran76@gmail.com",
							bindingKey: "runtime:auracall-gemini-pro:gemini",
							assetInventory: {
								state: "deferred",
								detailScannedThisPass: {
									projects: 0,
									conversations: 0,
									total: 0,
								},
							},
							metadataCountEvidence: {
								observedThisPass: {
									projects: 0,
									conversations: 0,
									artifacts: 0,
									files: 0,
									media: 0,
								},
								retainedFromCache: {
									projects: 0,
									conversations: 10,
									artifacts: 2,
									files: 3,
									media: 0,
								},
								mergedTotal: {
									projects: 0,
									conversations: 10,
									artifacts: 2,
									files: 3,
									media: 0,
								},
							},
						},
						statusPayload.liveFollow.targets.accounts[1],
					],
				},
			},
		};
		const summary = summarizeApiStatusPayload(payload, {
			host: "127.0.0.1",
			port: 18080,
		});

		expect(summary.proofScope).toEqual({
			enabled: true,
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			tenantKey: "gemini:ecochran76@gmail.com",
			bindingKey: "runtime:auracall-gemini-pro:gemini",
			globalLiveFollowSuppressed: true,
		});
		expect(summary.liveFollow.targets?.accounts[0]).toMatchObject({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			tenantKey: "gemini:ecochran76@gmail.com",
			bindingKey: "runtime:auracall-gemini-pro:gemini",
			assetInventory: {
				state: "deferred",
				detailScannedThisPass: {
					conversations: 0,
					total: 0,
				},
			},
			metadataCountEvidence: {
				observedThisPass: {
					conversations: 0,
				},
				retainedFromCache: {
					conversations: 10,
				},
				mergedTotal: {
					conversations: 10,
				},
			},
		});
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Account mirror proof scope: gemini/auracall-gemini-pro tenant=gemini:ecochran76@gmail.com binding=runtime:auracall-gemini-pro:gemini suppressed=true",
		);
		expect(formatApiStatusCliSummary(summary)).toContain(
			"Live follow targets: total=3 enabled=2 active=2 complete=1 in_progress=1 asset_unknown_or_deferred=1 attention=1",
		);
	});

	it("parses live-follow identity evidence from /status account targets", () => {
		const payload = {
			...statusPayload,
			liveFollow: {
				targets: {
					...statusPayload.liveFollow.targets,
					accounts: [
						{
							...statusPayload.liveFollow.targets.accounts[0],
							provider: "chatgpt",
							runtimeProfileId: "wsl-chrome-2",
							actualStatus: "eligible",
							statusReason: "eligible",
							identityEvidence: {
								source: "unknown",
								confidence: "unknown",
								observedAt: null,
								recheckable: true,
								repairStatus: "stale_mismatch_recheck",
								previousDetectedIdentityKey: "consulting pcg pro",
								currentDetectedIdentityKey: "consulting pcg pro",
								lastCheckedAt: null,
								repair: {
									status: "stale_mismatch_repaired",
									previousDetectedIdentityKey: "consulting pcg pro",
									currentDetectedIdentityKey: "consult@polymerconsultinggroup.com",
									repairedAt: "2026-06-07T13:04:07.494Z",
									checkedAt: "2026-06-07T13:04:07.494Z",
									source: "provider-app",
									requestId: "acctmirror_identity_repair",
								},
							},
						},
					],
				},
			},
		};
		const summary = summarizeApiStatusPayload(payload, {
			host: "127.0.0.1",
			port: 18080,
		});

		expect(summary.liveFollow.targets?.accounts[0]).toMatchObject({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			actualStatus: "eligible",
			statusReason: "eligible",
			identityEvidence: {
				source: "unknown",
				confidence: "unknown",
				observedAt: null,
				recheckable: true,
				repairStatus: "stale_mismatch_recheck",
				previousDetectedIdentityKey: "consulting pcg pro",
				currentDetectedIdentityKey: "consulting pcg pro",
				lastCheckedAt: null,
				repair: {
					status: "stale_mismatch_repaired",
					previousDetectedIdentityKey: "consulting pcg pro",
					currentDetectedIdentityKey: "consult@polymerconsultinggroup.com",
					repairedAt: "2026-06-07T13:04:07.494Z",
					checkedAt: "2026-06-07T13:04:07.494Z",
					source: "provider-app",
					requestId: "acctmirror_identity_repair",
				},
			},
		});
		expect(summary.liveFollow.targets?.accounts[0]?.routineDecision).toMatchObject({
			state: "paused",
			nextPhase: "detail-inventory",
			why: "active live-follow completion is paused",
			remainingWork: {
				detailSurfaces: 4,
				materializationAssets: 2,
				accountLibraryStatus: "disabled",
			},
			cycle: {
				currentPhase: "detail-inventory",
				nextPhase: "detail-inventory",
				status: "pending",
				passCount: 7,
			},
		});
		expect(summary.liveFollow.targets?.accounts[0]?.resumePolicy).toMatchObject({
			classification: "operator_paused",
			action: "keep_existing",
			reason: "active live-follow completion is operator-paused",
			activeCompletionId: "acctmirror_paused",
		});
	});

	it("asserts the expected account mirror backpressure reason", () => {
		const summary = summarizeApiStatusPayload(statusPayload, {
			host: "127.0.0.1",
			port: 18080,
		});

		expect(() =>
			assertApiStatusBackpressure(summary, {
				expectedReason: "routine-delayed",
			}),
		).not.toThrow();
		expect(() =>
			assertApiStatusBackpressure(summary, {
				expectedReason: "blocked-by-browser-work",
			}),
		).toThrow(
			"Expected accountMirrorScheduler.lastPass.backpressure.reason to be blocked-by-browser-work, got routine-delayed.",
		);
	});

	it("asserts the expected account mirror scheduler posture", () => {
		const summary = summarizeApiStatusPayload(statusPayload, {
			host: "127.0.0.1",
			port: 18080,
		});

		expect(() =>
			assertApiStatusSchedulerPosture(summary, {
				expectedPosture: "backpressured",
			}),
		).not.toThrow();
		expect(() =>
			assertApiStatusSchedulerPosture(summary, {
				expectedPosture: "disabled",
			}),
		).toThrow(
			"Expected accountMirrorScheduler.operatorStatus.posture to be disabled, got backpressured.",
		);
	});

	it("asserts expected account mirror completion metrics", () => {
		const summary = summarizeApiStatusPayload(statusPayload, {
			host: "127.0.0.1",
			port: 18080,
		});

		expect(() =>
			assertApiStatusCompletionMetrics(summary, {
				expectedActive: 2,
				expectedPaused: 1,
				expectedCancelled: 1,
				expectedFailed: 0,
			}),
		).not.toThrow();
		expect(() =>
			assertApiStatusCompletionMetrics(summary, {
				expectedCancelled: 0,
			}),
		).toThrow("Expected accountMirrorCompletions.metrics.cancelled to be 0, got 1.");
	});

	it("asserts expected live-follow severity", () => {
		const summary = summarizeApiStatusPayload(statusPayload, {
			host: "127.0.0.1",
			port: 18080,
		});

		expect(() =>
			assertApiStatusLiveFollowSeverity(summary, {
				expectedSeverity: "attention-needed",
			}),
		).not.toThrow();
		expect(() =>
			assertApiStatusLiveFollowSeverity(summary, {
				expectedSeverity: "healthy",
			}),
		).toThrow("Expected liveFollow.severity to be healthy, got attention-needed.");
	});

	it("derives live-follow severity from scheduler and completion posture", () => {
		const buildPayload = (overrides: {
			posture?: string;
			backpressure?: string;
			active?: number;
			paused?: number;
			failed?: number;
			cancelled?: number;
		}) => ({
			ok: true,
			accountMirrorScheduler: {
				state: "idle",
				operatorStatus: {
					posture: overrides.posture ?? "healthy",
				},
				lastPass: {
					backpressure: {
						reason: overrides.backpressure ?? "none",
					},
				},
			},
			accountMirrorCompletions: {
				metrics: {
					active: overrides.active ?? 0,
					paused: overrides.paused ?? 0,
					failed: overrides.failed ?? 0,
					cancelled: overrides.cancelled ?? 0,
				},
			},
		});

		expect(
			summarizeApiStatusPayload(buildPayload({}), {
				host: "127.0.0.1",
				port: 18080,
			}).liveFollow.severity,
		).toBe("healthy");
		expect(
			summarizeApiStatusPayload(
				buildPayload({
					posture: "backpressured",
					backpressure: "routine-delayed",
				}),
				{
					host: "127.0.0.1",
					port: 18080,
				},
			).liveFollow.severity,
		).toBe("backpressured");
		const foregroundSummary = summarizeApiStatusPayload(
			{
				...buildPayload({
					posture: "waiting",
					backpressure: "foreground-work",
				}),
				accountMirrorScheduler: {
					...buildPayload({
						posture: "waiting",
						backpressure: "foreground-work",
					}).accountMirrorScheduler,
					foregroundWork: {
						active: true,
						activeRequestCount: 1,
						drainReservations: 0,
						backgroundDrainScheduled: true,
						backgroundDrainState: "scheduled",
					},
				},
			},
			{
				host: "127.0.0.1",
				port: 18080,
			},
		);
		expect(foregroundSummary.liveFollow.severity).toBe("healthy");
		expect(foregroundSummary.liveFollow.line).toContain("posture=waiting");
		expect(formatApiStatusCliSummary(foregroundSummary)).toContain(
			"Foreground work: active=true activeRequests=1 pendingDrains=0 backgroundDrainScheduled=true backgroundDrainState=scheduled",
		);
		expect(
			summarizeApiStatusPayload(
				buildPayload({
					posture: "backpressured",
					backpressure: "routine-delayed",
					active: 1,
				}),
				{
					host: "127.0.0.1",
					port: 18080,
				},
			).liveFollow.severity,
		).toBe("healthy");
		expect(
			summarizeApiStatusPayload(
				buildPayload({
					posture: "paused",
					paused: 1,
				}),
				{
					host: "127.0.0.1",
					port: 18080,
				},
			).liveFollow.severity,
		).toBe("paused");
		expect(
			summarizeApiStatusPayload(
				buildPayload({
					failed: 1,
				}),
				{
					host: "127.0.0.1",
					port: 18080,
				},
			).liveFollow.severity,
		).toBe("attention-needed");

		expect(
			summarizeApiStatusPayload(
				{
					...buildPayload({
						active: 2,
						failed: 3,
					}),
					liveFollow: {
						targets: {
							total: 9,
							enabled: 2,
							disabled: 0,
							unconfigured: 7,
							missingIdentity: 0,
							unsupported: 0,
							active: 2,
							queued: 0,
							running: 2,
							paused: 0,
							attentionNeeded: 0,
							complete: 2,
							inProgress: 0,
							none: 0,
							unknown: 0,
							accounts: [],
						},
					},
				},
				{
					host: "127.0.0.1",
					port: 18080,
				},
			).liveFollow.severity,
		).toBe("healthy");
	});

	it("treats a recovered running live-follow completion as healthy while scheduler backpressure is not yet known", () => {
		const summary = summarizeApiStatusPayload(
			{
				ok: true,
				accountMirrorScheduler: {
					state: "scheduled",
					operatorStatus: {
						posture: "scheduled",
					},
					lastPass: null,
				},
				accountMirrorCompletions: {
					metrics: {
						active: 1,
						running: 1,
						paused: 0,
						failed: 0,
						cancelled: 0,
					},
				},
			},
			{
				host: "127.0.0.1",
				port: 18080,
			},
		);

		expect(summary.liveFollow).toMatchObject({
			severity: "healthy",
			schedulerPosture: "scheduled",
			backpressureReason: "unknown",
			activeCompletions: 1,
		});
	});

	it("reads /status through fetch for installed-runtime smoke use", async () => {
		const fetchImpl = async (url: string | URL | Request) => {
			expect(String(url)).toBe("http://127.0.0.1:18080/status");
			return new Response(JSON.stringify(statusPayload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		};

		await expect(
			readApiStatusForCli(
				{
					port: 18080,
					timeoutMs: 1000,
				},
				fetchImpl,
			),
		).resolves.toMatchObject({
			scheduler: {
				backpressure: {
					reason: "routine-delayed",
				},
			},
		});
	});

	it("validates expected backpressure reason names", () => {
		expect(parseApiStatusBackpressureReason("provider-guard")).toBe("provider-guard");
		expect(parseApiStatusBackpressureReason("yielded-to-queued-work")).toBe(
			"yielded-to-queued-work",
		);
		expect(parseApiStatusBackpressureReason("foreground-work")).toBe("foreground-work");
		expect(() => parseApiStatusBackpressureReason("delayed")).toThrow(
			'Invalid backpressure reason "delayed". Use one of:',
		);
	});

	it("validates expected account mirror posture names", () => {
		expect(parseApiStatusAccountMirrorPosture("disabled")).toBe("disabled");
		expect(parseApiStatusAccountMirrorPosture("waiting")).toBe("waiting");
		expect(parseApiStatusAccountMirrorPosture("backpressured")).toBe("backpressured");
		expect(() => parseApiStatusAccountMirrorPosture("blocked")).toThrow(
			'Invalid account mirror posture "blocked". Use one of:',
		);
	});

	it("validates expected live-follow severity names", () => {
		expect(parseApiStatusLiveFollowSeverity("healthy")).toBe("healthy");
		expect(parseApiStatusLiveFollowSeverity("attention-needed")).toBe("attention-needed");
		expect(() => parseApiStatusLiveFollowSeverity("blocked")).toThrow(
			'Invalid live-follow severity "blocked". Use one of:',
		);
	});
});
