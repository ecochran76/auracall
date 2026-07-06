import { describe, expect, test } from "vitest";
import {
	createAccountMirrorStatusRegistry,
	createAccountMirrorStatusSummary,
} from "../../src/accountMirror/statusRegistry.js";

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
				gemini: {
					identity: {
						email: "ecochran76@gmail.com",
					},
					liveFollow: {
						enabled: true,
						maxBrowserInteractionsPerMinute: 3,
						maxConversationRowsPerCycle: 25,
						conversationReadCooldownMs: 30_000,
						pageRefreshCooldownMs: 30_000,
						renavigationCooldownMs: 30_000,
					},
				},
			},
		},
		"wsl-chrome-2": {
			browserProfile: "wsl-chrome-2",
			defaultService: "chatgpt",
			services: {
				chatgpt: {
					identity: {
						email: "consult@polymerconsultinggroup.com",
						accountLevel: "Pro",
					},
				},
			},
		},
		unbound: {
			browserProfile: "default",
			defaultService: "grok",
			services: {
				grok: {},
			},
		},
	},
};

describe("account mirror status registry", () => {
	test("derives identity-gated mirror status entries from configured runtime profiles", () => {
		const status = createAccountMirrorStatusSummary({
			config,
			now: new Date("2026-04-29T12:00:00.000Z"),
		});

		expect(status).toMatchObject({
			object: "account_mirror_status",
			generatedAt: "2026-04-29T12:00:00.000Z",
			metrics: {
				total: 4,
				eligible: 3,
				delayed: 0,
				blocked: 1,
			},
		});
		expect(status.entries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					provider: "chatgpt",
					tenantKey: "service-account:chatgpt:ecochran76@gmail.com",
					bindingKey: "binding:chatgpt:default:default",
					runtimeProfileId: "default",
					browserProfileId: "default",
					expectedIdentityKey: "ecochran76@gmail.com",
					accountLevel: "Business",
					status: "eligible",
					reason: "eligible",
					mirrorState: expect.objectContaining({
						queued: false,
						running: false,
					}),
					metadataCounts: {
						projects: 0,
						conversations: 0,
						artifacts: 0,
						files: 0,
						media: 0,
					},
					mirrorCompleteness: expect.objectContaining({
						state: "none",
						remainingDetailSurfaces: null,
					}),
					liveFollow: {
						configured: true,
						enabled: true,
						state: "enabled",
						reason: "liveFollow.enabled is true",
						mode: "metadata-first",
						priority: "background",
						sweepMode: null,
						materializationPolicy: null,
						materializationAssetKinds: null,
						materializationMaxItems: null,
						materializationRefreshSnapshot: null,
						materializationForce: null,
						accountLibrary: {
							configured: false,
							mode: "disabled",
							enabled: false,
							reason: "liveFollow.accountLibrary.mode is not configured",
							maxItems: null,
							minIntervalMs: null,
							failureCooldownMs: null,
							maxActiveJobs: null,
							providerWorkTimeoutMs: null,
						},
					},
				}),
				expect.objectContaining({
					provider: "gemini",
					tenantKey: "service-account:gemini:ecochran76@gmail.com",
					bindingKey: "binding:gemini:default:default",
					runtimeProfileId: "default",
					limits: expect.objectContaining({
						maxBrowserInteractionsPerMinute: 3,
						maxConversationRowsPerCycle: 25,
						conversationReadCooldownMs: 30_000,
						pageRefreshCooldownMs: 30_000,
						renavigationCooldownMs: 30_000,
					}),
					liveFollow: expect.objectContaining({
						configured: true,
						enabled: true,
						state: "enabled",
						reason: "liveFollow.enabled is true",
					}),
				}),
				expect.objectContaining({
					provider: "grok",
					tenantKey: null,
					bindingKey: "binding:grok:unbound:default",
					runtimeProfileId: "unbound",
					status: "blocked",
					reason: "expected-identity-missing",
					liveFollow: expect.objectContaining({
						configured: false,
						enabled: false,
						state: "unconfigured",
					}),
				}),
			]),
		);
	});

	test("projects configured live-follow sweep and materialization policy", () => {
		const status = createAccountMirrorStatusSummary({
			config: {
				runtimeProfiles: {
					default: {
						browserProfile: "default",
						services: {
							gemini: {
								identity: {
									email: "operator@example.com",
								},
								liveFollow: {
									enabled: true,
									sweepMode: "full_sweep",
									materializationPolicy: "full_missing_assets",
									materializationAssetKinds: ["media", "artifacts"],
									materializationMaxItems: 25,
									materializationRefreshSnapshot: true,
									materializationForce: true,
								},
							},
						},
					},
				},
			},
			now: new Date("2026-05-23T12:00:00.000Z"),
		});

		expect(status.entries[0]?.liveFollow).toMatchObject({
			configured: true,
			enabled: true,
			sweepMode: "full_sweep",
			materializationPolicy: "full_missing_assets",
			materializationAssetKinds: ["media", "artifacts"],
			materializationMaxItems: 25,
			materializationRefreshSnapshot: true,
			materializationForce: true,
		});
	});

	test("projects account-library live-follow scheduling separately from history materialization", () => {
		const status = createAccountMirrorStatusSummary({
			config: {
				runtimeProfiles: {
					default: {
						browserProfile: "default",
						services: {
							chatgpt: {
								identity: {
									email: "operator@example.com",
								},
								liveFollow: {
									enabled: true,
									materializationPolicy: "metadata_only",
									accountLibrary: {
										mode: "preview_only",
										maxItems: 3,
										minIntervalMs: 3_600_000,
										failureCooldownMs: 900_000,
										maxActiveJobs: 1,
										providerWorkTimeoutMs: 120_000,
									},
								},
							},
						},
					},
				},
			},
			now: new Date("2026-06-02T12:00:00.000Z"),
		});

		expect(status.entries[0]?.liveFollow).toMatchObject({
			configured: true,
			enabled: true,
			materializationPolicy: "metadata_only",
			accountLibrary: {
				configured: true,
				mode: "preview_only",
				enabled: false,
				reason: "liveFollow.accountLibrary.mode is preview_only",
				maxItems: 3,
				minIntervalMs: 3_600_000,
				failureCooldownMs: 900_000,
				maxActiveJobs: 1,
				providerWorkTimeoutMs: 120_000,
			},
		});
	});

	test("blocks a live-follow target when a provider guard needs manual clearance", () => {
		const status = createAccountMirrorStatusSummary({
			config,
			now: new Date("2026-04-29T12:00:00.000Z"),
			states: {
				"gemini:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					providerGuard: {
						state: "manual_clear_required",
						kind: "google-sorry",
						summary: "Google unusual-traffic interstitial detected (google.com/sorry).",
						detectedAtMs: Date.parse("2026-04-29T11:59:00.000Z"),
						url: "https://www.google.com/sorry/index",
						action: "account-mirror-refresh",
					},
				},
			},
		});

		expect(status.entries).toContainEqual(
			expect.objectContaining({
				provider: "gemini",
				runtimeProfileId: "default",
				status: "blocked",
				reason: "provider-manual-clear-required",
				eligibleAt: null,
				providerGuard: {
					state: "manual_clear_required",
					kind: "google-sorry",
					summary: "Google unusual-traffic interstitial detected (google.com/sorry).",
					detectedAt: "2026-04-29T11:59:00.000Z",
					clearedAt: null,
					cooldownUntil: null,
					url: "https://www.google.com/sorry/index",
					action: "account-mirror-refresh",
				},
			}),
		);
	});

	test("delays a live-follow target during provider guard cooldown", () => {
		const status = createAccountMirrorStatusSummary({
			config,
			now: new Date("2026-04-29T12:00:00.000Z"),
			states: {
				"gemini:default": {
					detectedIdentityKey: "ecochran76@gmail.com",
					providerGuard: {
						state: "cooldown",
						kind: "google-sorry",
						summary: "Operator cleared provider guard; quiet cooldown before automation resumes.",
						detectedAtMs: Date.parse("2026-04-29T11:50:00.000Z"),
						clearedAtMs: Date.parse("2026-04-29T11:55:00.000Z"),
						cooldownUntilMs: Date.parse("2026-04-29T12:25:00.000Z"),
						action: "operator-clear",
					},
				},
			},
		});

		expect(status.entries).toContainEqual(
			expect.objectContaining({
				provider: "gemini",
				runtimeProfileId: "default",
				status: "delayed",
				reason: "provider-guard-cooldown",
				eligibleAt: "2026-04-29T12:25:00.000Z",
				providerGuard: expect.objectContaining({
					state: "cooldown",
					cooldownUntil: "2026-04-29T12:25:00.000Z",
				}),
			}),
		);
	});

	test("reports missing identity when live follow is enabled without a bound account", () => {
		const status = createAccountMirrorStatusSummary({
			config: {
				runtimeProfiles: {
					unbound: {
						browserProfile: "default",
						services: {
							chatgpt: {
								liveFollow: {
									enabled: true,
								},
							},
						},
					},
				},
			},
			now: new Date("2026-04-29T12:00:00.000Z"),
		});

		expect(status.entries[0]).toMatchObject({
			provider: "chatgpt",
			runtimeProfileId: "unbound",
			status: "blocked",
			reason: "expected-identity-missing",
			liveFollow: {
				configured: true,
				enabled: false,
				state: "missing_identity",
				reason: "liveFollow.enabled is true but the service has no bound identity",
				mode: null,
				priority: null,
			},
		});
	});

	test("filters by provider and runtime profile", () => {
		const status = createAccountMirrorStatusSummary({
			config,
			now: new Date("2026-04-29T12:00:00.000Z"),
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
		});

		expect(status.metrics.total).toBe(1);
		expect(status.entries[0]).toMatchObject({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			expectedIdentityKey: "consult@polymerconsultinggroup.com",
			accountLevel: "Pro",
		});
	});

	test("reports delayed status from registry state without enqueueing browser work", () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});
		registry.updateState(
			{
				provider: "chatgpt",
				runtimeProfileId: "default",
			},
			{
				lastSuccessAtMs: Date.parse("2026-04-29T11:59:00.000Z"),
				detectedIdentityKey: "ecochran76@gmail.com",
			},
		);

		const status = registry.readStatus({
			provider: "chatgpt",
			runtimeProfileId: "default",
		});

		expect(status.metrics).toMatchObject({
			total: 1,
			delayed: 1,
		});
		expect(status.entries[0]).toMatchObject({
			status: "delayed",
			reason: "minimum-interval",
			lastSuccessAt: "2026-04-29T11:59:00.000Z",
			detectedIdentityKey: "ecochran76@gmail.com",
		});
	});

	test("merges dispatcher and metadata state for explicit refresh readback", () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
		});
		registry.mergeState(
			{
				provider: "chatgpt",
				runtimeProfileId: "default",
			},
			{
				lastRefreshRequestId: "acctmirror_test",
				lastQueuedAtMs: Date.parse("2026-04-29T11:58:00.000Z"),
				lastStartedAtMs: Date.parse("2026-04-29T11:58:01.000Z"),
				lastCompletedAtMs: Date.parse("2026-04-29T11:58:02.000Z"),
				lastDispatcherKey: "managed-profile:/tmp/default/chatgpt::service:chatgpt",
				lastDispatcherOperationId: "op_123",
				metadataCounts: {
					projects: 2,
					conversations: 5,
					artifacts: 1,
					files: 0,
					media: 0,
				},
				metadataEvidence: {
					identitySource: "profile-menu",
					projectSampleIds: ["project_1"],
					conversationSampleIds: ["conv_1"],
					attachmentInventory: {
						nextProjectIndex: 2,
						nextConversationIndex: 1,
						detailReadLimit: 6,
						scannedProjects: 2,
						scannedConversations: 1,
						conversationDetail: {
							conversationId: "conv_large",
							nextMessageIndex: 24,
							messageLimit: 24,
							totalMessages: 80,
						},
					},
					projectConversations: {
						nextProjectIndex: 4,
						readLimit: 4,
						scannedProjects: 4,
						yielded: false,
					},
					truncated: {
						projects: false,
						conversations: false,
						artifacts: true,
					},
				},
				backfillLedger: {
					object: "account_mirror_backfill_ledger",
					version: 1,
					provider: "chatgpt",
					runtimeProfileId: "default",
					browserProfileId: "default",
					boundIdentityKey: "ecochran76@gmail.com",
					updatedAt: "2026-04-29T11:58:02.000Z",
					state: "in_progress",
					lastCompletedPhase: "project-conversations",
					nextEligiblePhase: "detail-inventory",
					cursors: {
						projects: {
							status: "complete",
							reason: "Project index was not truncated in the latest refresh.",
							updatedAt: "2026-04-29T11:58:02.000Z",
							nextIndex: null,
							readLimit: null,
							scanned: 1,
							yielded: false,
						},
						rootRail: {
							status: "complete",
							reason: "Root conversation rail was not truncated in the latest refresh.",
							updatedAt: "2026-04-29T11:58:02.000Z",
							nextIndex: null,
							readLimit: null,
							scanned: 1,
							yielded: false,
						},
						projectConversations: {
							status: "complete",
							reason: "Project conversation cursor completed in the latest refresh.",
							updatedAt: "2026-04-29T11:58:02.000Z",
							nextIndex: 4,
							readLimit: 4,
							scanned: 4,
							yielded: false,
						},
						newestFirstDetail: {
							status: "pending",
							reason: "Detail inventory cursor is pending.",
							updatedAt: "2026-04-29T11:58:02.000Z",
							nextIndex: 1,
							readLimit: 6,
							scanned: 1,
							yielded: false,
							conversationDetail: {
								conversationId: "conv_large",
								nextMessageIndex: 24,
								messageLimit: 24,
								totalMessages: 80,
							},
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
				},
			},
		);

		const status = registry.readStatus({
			provider: "chatgpt",
			runtimeProfileId: "default",
			explicitRefresh: true,
		});

		expect(status.entries[0]).toMatchObject({
			lastQueuedAt: "2026-04-29T11:58:00.000Z",
			lastStartedAt: "2026-04-29T11:58:01.000Z",
			lastCompletedAt: "2026-04-29T11:58:02.000Z",
			mirrorState: {
				queued: false,
				running: false,
				lastRefreshRequestId: "acctmirror_test",
				lastDispatcherKey: "managed-profile:/tmp/default/chatgpt::service:chatgpt",
				lastDispatcherOperationId: "op_123",
				lastDispatcherBlockedBy: null,
			},
			metadataCounts: {
				projects: 2,
				conversations: 5,
				artifacts: 1,
				files: 0,
				media: 0,
			},
			metadataEvidence: {
				attachmentInventory: {
					conversationDetail: {
						conversationId: "conv_large",
						nextMessageIndex: 24,
						messageLimit: 24,
						totalMessages: 80,
					},
				},
				projectConversations: {
					nextProjectIndex: 4,
					readLimit: 4,
					scannedProjects: 4,
					yielded: false,
				},
			},
			mirrorCompleteness: {
				state: "in_progress",
				remainingDetailSurfaces: {
					projects: 0,
					conversations: 4,
					total: 4,
				},
				signals: {
					attachmentInventoryTruncated: true,
					attachmentCursorPresent: true,
				},
			},
			backfillLedger: {
				state: "in_progress",
				lastCompletedPhase: "project-conversations",
				nextEligiblePhase: "detail-inventory",
				cursors: {
					newestFirstDetail: {
						status: "pending",
						conversationDetail: {
							conversationId: "conv_large",
							nextMessageIndex: 24,
						},
					},
				},
			},
		});
	});

	test("hydrates persisted mirror state without making status readback asynchronous", async () => {
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
			readPersistentState: async (target) => {
				if (
					target.provider !== "chatgpt" ||
					target.runtimeProfileId !== "default" ||
					target.boundIdentityKey !== "ecochran76@gmail.com"
				) {
					return null;
				}
				return {
					detectedIdentityKey: "ecochran76@gmail.com",
					lastSuccessAtMs: Date.parse("2026-04-29T10:00:00.000Z"),
					metadataCounts: {
						projects: 3,
						conversations: 9,
						artifacts: 2,
						files: 0,
						media: 1,
					},
					metadataEvidence: {
						identitySource: "profile-menu",
						projectSampleIds: ["project_1"],
						conversationSampleIds: ["conv_1"],
						truncated: {
							projects: false,
							conversations: false,
							artifacts: false,
						},
					},
				};
			},
		});

		await registry.refreshPersistentState?.();
		const status = registry.readStatus({
			provider: "chatgpt",
			runtimeProfileId: "default",
			explicitRefresh: true,
		});

		expect(status.entries[0]).toMatchObject({
			detectedIdentityKey: "ecochran76@gmail.com",
			lastSuccessAt: "2026-04-29T10:00:00.000Z",
			metadataCounts: {
				projects: 3,
				conversations: 9,
				artifacts: 2,
				files: 0,
				media: 1,
			},
			mirrorCompleteness: {
				state: "complete",
				remainingDetailSurfaces: {
					projects: 0,
					conversations: 0,
					total: 0,
				},
			},
		});
	});

	test("scopes persisted mirror state refresh to the requested target", async () => {
		const refreshedTargets: Array<{ provider: string; runtimeProfileId: string }> = [];
		const registry = createAccountMirrorStatusRegistry({
			config,
			now: () => new Date("2026-04-29T12:00:00.000Z"),
			readPersistentState: async (target) => {
				refreshedTargets.push({
					provider: target.provider,
					runtimeProfileId: target.runtimeProfileId,
				});
				return {
					detectedIdentityKey: target.boundIdentityKey,
					lastSuccessAtMs: Date.parse("2026-04-29T10:00:00.000Z"),
				};
			},
		});

		await registry.refreshPersistentState?.({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
		});

		expect(refreshedTargets).toEqual([
			{
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-2",
			},
		]);
		expect(
			registry.readStatus({
				provider: "chatgpt",
				runtimeProfileId: "wsl-chrome-2",
				explicitRefresh: true,
			}).entries[0],
		).toMatchObject({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			detectedIdentityKey: "consult@polymerconsultinggroup.com",
		});
	});

	test("reports stale malformed identity mismatch as recheckable instead of blocked", () => {
		const status = createAccountMirrorStatusSummary({
			config,
			now: new Date("2026-06-07T13:04:07.494Z"),
			states: {
				"chatgpt:wsl-chrome-2": {
					detectedIdentityKey: "consulting pcg pro",
					lastFailureAtMs: Date.parse("2026-05-31T08:02:50.016Z"),
					consecutiveFailureCount: 179,
					metadataCounts: {
						projects: 6,
						conversations: 68,
						artifacts: 64,
						files: 73,
						media: 0,
					},
				},
			},
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			explicitRefresh: true,
		});

		expect(status.metrics).toMatchObject({
			total: 1,
			eligible: 1,
			blocked: 0,
		});
		expect(status.entries[0]).toMatchObject({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			expectedIdentityKey: "consult@polymerconsultinggroup.com",
			detectedIdentityKey: "consulting pcg pro",
			status: "eligible",
			reason: "eligible",
			identityEvidence: expect.objectContaining({
				source: "unknown",
				confidence: "unknown",
				recheckable: true,
				repairStatus: "stale_mismatch_recheck",
				previousDetectedIdentityKey: "consulting pcg pro",
			}),
			metadataCounts: {
				projects: 6,
				conversations: 68,
				artifacts: 64,
				files: 73,
				media: 0,
			},
		});
	});

	test("can preview explicit recovery eligibility while default status keeps failure backoff", () => {
		const states = {
			"chatgpt:wsl-chrome-2": {
				detectedIdentityKey: "consult@polymerconsultinggroup.com",
				detectedIdentitySource: "provider-app",
				detectedIdentityObservedAtMs: Date.parse("2026-06-07T15:52:30.359Z"),
				detectedIdentityConfidence: "authoritative",
				lastFailureAtMs: Date.parse("2026-06-07T15:54:18.700Z"),
				consecutiveFailureCount: 189,
			},
		};
		const defaultStatus = createAccountMirrorStatusSummary({
			config,
			now: new Date("2026-06-07T15:55:18.700Z"),
			states,
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			explicitRefresh: true,
		});
		const recoveryStatus = createAccountMirrorStatusSummary({
			config,
			now: new Date("2026-06-07T15:55:18.700Z"),
			states,
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			explicitRefresh: true,
			ignoreFailureBackoff: true,
		});

		expect(defaultStatus.entries[0]).toMatchObject({
			status: "delayed",
			reason: "failure-backoff",
		});
		expect(recoveryStatus.entries[0]).toMatchObject({
			status: "eligible",
			reason: "eligible",
			identityEvidence: expect.objectContaining({
				source: "provider-app",
				confidence: "authoritative",
				recheckable: false,
			}),
		});
	});
});
