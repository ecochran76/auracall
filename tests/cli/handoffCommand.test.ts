import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import {
	formatHandoffPrepareCliSummary,
	formatHandoffStatusCliSummary,
	prepareHandoffForCli,
	readHandoffStatusForCli,
} from "../../src/cli/handoffCommand.js";
import { prepareCrossServiceHandoffPacket } from "../../src/handoff/service.js";

const tempRoots: string[] = [];

afterEach(async () => {
	setAuracallHomeDirOverrideForTest(null);
	for (const root of tempRoots.splice(0)) {
		await rm(root, { recursive: true, force: true, maxRetries: 2 });
	}
}, 30000);

describe("handoff prepare CLI helpers", () => {
	test("writes a provider-neutral dry-run handoff packet with zero target mutation", async () => {
		const root = await tempRoot("auracall-handoff-service-");
		setAuracallHomeDirOverrideForTest(root);

		const result = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			handoffId: "fixture-chatgpt-to-gemini",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source-conversation",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: {
				messages: [
					{ role: "user", content: "First source message" },
					{ role: "assistant", content: "First source answer" },
				],
			},
			sourceManifest: {
				items: [
					{
						id: "artifact_a",
						kind: "artifact",
						title: "Important artifact",
						localPath: "/tmp/artifact-a.pdf",
						sizeBytes: 42,
						checksumSha256: "a".repeat(64),
						importanceHint: 10,
					},
					{
						id: "file_b",
						kind: "file",
						title: "Less important file",
						localPath: "/tmp/file-b.csv",
						sizeBytes: 12,
						checksumSha256: "b".repeat(64),
						importanceHint: 1,
					},
				],
			},
			sourceOmissions: {
				items: [
					{
						id: "missing_c",
						kind: "file",
						reason: "provider download unavailable",
						retryable: true,
					},
				],
			},
			maxSelectedArtifacts: 1,
			generatedAt: "2026-06-05T12:00:00.000Z",
		});

		expect(result.packetPath).toBe(path.join(root, "handoffs", "fixture-chatgpt-to-gemini"));
		expect(result.run.source).toMatchObject({
			provider: "chatgpt",
			runtimeProfileId: "source-business",
			browserProfileId: "business-browser",
			accountBindingKey: "binding:chatgpt:source-business:business-browser",
			accountMirrorTenantKey: "service-account:chatgpt:business@example.com|plan=business",
		});
		expect(result.run.target).toMatchObject({
			provider: "gemini",
			runtimeProfileId: "target-gemini",
			browserProfileId: "gemini-browser",
			accountBindingKey: "binding:gemini:target-gemini:gemini-browser",
			accountMirrorTenantKey: "service-account:gemini:target@example.com",
		});
		expect(result.sourceCompleteness).toMatchObject({
			state: "partial",
			messageCount: 2,
			manifestItemCount: 2,
			localMaterializedCount: 2,
			checksumCount: 2,
			omissionCount: 1,
			retryableOmissionCount: 1,
		});
		expect(result.analysis.selectedManifestItemIds).toEqual(["artifact_a"]);
		expect(result.submissionPlan).toMatchObject({
			dryRun: true,
			targetMutationAllowed: false,
			selectedManifestItemIds: ["artifact_a"],
			selectedFileCount: 1,
			selectedTotalBytes: 42,
			zeroTargetMutationEvidence: {
				submitTargetPhaseSkipped: true,
				uploadAttemptCount: 0,
				submitAttemptCount: 0,
			},
		});

		const runJson = JSON.parse(await readFile(path.join(result.packetPath, "run.json"), "utf8"));
		expect(runJson.phases.preview_target).toBe("completed");
		const ledgerJson = JSON.parse(
			await readFile(path.join(result.packetPath, "ledger.json"), "utf8"),
		);
		expect(ledgerJson).toMatchObject({
			object: "auracall.handoff-ledger.v1",
			runId: "fixture-chatgpt-to-gemini",
			mode: "preview",
			eventCount: 6,
			targetMutationAllowed: false,
			approvalPolicy: {
				upload: "not_allowed_preview",
				submit: "not_allowed_preview",
			},
		});
		const submissionPlan = JSON.parse(
			await readFile(path.join(result.packetPath, "target", "submission-plan.json"), "utf8"),
		);
		expect(submissionPlan.targetMutationAllowed).toBe(false);
		const events = await readFile(path.join(result.packetPath, "events.jsonl"), "utf8");
		expect(events).toContain('"phase":"discover_source"');
		expect(events).toContain('"phase":"preview_target"');
	});

	test("represents multiple provider pairs without provider-specific top-level fields", async () => {
		const root = await tempRoot("auracall-handoff-pairs-");
		const outputRoot = path.join(root, "packets");
		const pairs = [
			["chatgpt", "chatgpt"],
			["chatgpt", "gemini"],
			["gemini", "chatgpt"],
		];

		for (const [sourceProvider, targetProvider] of pairs) {
			const result = await prepareCrossServiceHandoffPacket({
				config: fixtureConfig(),
				outputRoot,
				handoffId: `${sourceProvider}-to-${targetProvider}`,
				sourceProvider,
				sourceRuntimeProfile: sourceProvider === "gemini" ? "target-gemini" : "source-business",
				sourceRef: `provider://${sourceProvider}/conversation`,
				targetProvider,
				targetRuntimeProfile: targetProvider === "gemini" ? "target-gemini" : "target-pro",
				sourceContext: { messages: [{ role: "user", content: "portable context" }] },
				sourceManifest: { items: [] },
				generatedAt: "2026-06-05T12:00:00.000Z",
			});

			expect(result.run.source.provider).toBe(sourceProvider);
			expect(result.run.target.provider).toBe(targetProvider);
			expect(Object.keys(result.run).sort()).toEqual(
				expect.arrayContaining(["source", "target", "sourceCompleteness", "artifacts"]),
			);
		}
	});

	test("CLI wrapper requires dry-run and can load source JSON inputs", async () => {
		const root = await tempRoot("auracall-handoff-cli-");
		const contextPath = path.join(root, "context.json");
		const manifestPath = path.join(root, "manifest.json");
		const materializationJobPath = path.join(root, "materialization-job.json");
		await writeFile(
			contextPath,
			JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
			"utf8",
		);
		await writeFile(
			manifestPath,
			JSON.stringify({ items: [{ id: "one", localPath: "/tmp/one.txt" }] }),
			"utf8",
		);
		await writeFile(materializationJobPath, JSON.stringify(materializationJobFixture()), "utf8");

		await expect(
			prepareHandoffForCli({
				config: fixtureConfig(),
				sourceProvider: "chatgpt",
				sourceProfile: "source-business",
				sourceRef: "https://chatgpt.com/c/source",
				targetProvider: "grok",
				targetProfile: "target-pro",
				dryRun: false,
			}),
		).rejects.toThrow("Plan 0111 currently supports only --dry-run handoff preparation.");

		const result = await prepareHandoffForCli({
			config: fixtureConfig(),
			sourceProvider: "chatgpt",
			sourceProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "grok",
			targetProfile: "target-pro",
			sourceContextJson: contextPath,
			sourceManifestJson: manifestPath,
			sourceMaterializationJobJson: [materializationJobPath],
			outputDir: root,
			handoffId: "cli-fixture",
			dryRun: true,
		});

		expect(result.sourceCompleteness).toMatchObject({
			state: "complete",
			messageCount: 1,
			manifestItemCount: 3,
		});
		expect(result.analysis.sourceMaterializationJobIds).toEqual(["hmj_fixture"]);
		expect(formatHandoffPrepareCliSummary(result)).toContain("Target mutation: skipped_dry_run");
	});

	test("CLI orchestration reads existing source job ids before create and skips create when evidence exists", async () => {
		const root = await tempRoot("auracall-handoff-source-read-");
		const calls: string[] = [];
		const result = await prepareHandoffForCli({
			config: fixtureConfig(),
			sourceProvider: "chatgpt",
			sourceProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetProfile: "target-gemini",
			sourceMaterializationJobId: ["hmj_existing"],
			sourceMaterializationCreate: true,
			outputDir: root,
			handoffId: "source-read-fixture",
			dryRun: true,
			materializationClient: {
				async readJob(options) {
					calls.push(`read:${options.id}`);
					return materializationJobFixture({ id: options.id, status: "succeeded" });
				},
				async createJob() {
					calls.push("create");
					return materializationCreateResultFixture();
				},
			},
		});

		expect(calls).toEqual(["read:hmj_existing"]);
		expect(result.analysis.sourceMaterializationJobIds).toEqual(["hmj_existing"]);
		const jobs = JSON.parse(
			await readFile(path.join(result.packetPath, "source", "materialization-jobs.json"), "utf8"),
		);
		expect(jobs).toMatchObject({
			metrics: {
				total: 1,
				apiRead: 1,
				apiCreated: 0,
			},
			jobs: [
				expect.objectContaining({
					jobId: "hmj_existing",
					status: "succeeded",
					importMethod: "api_read",
					terminal: true,
				}),
			],
		});
		const ledger = JSON.parse(await readFile(path.join(result.packetPath, "ledger.json"), "utf8"));
		expect(ledger.sourceMaterializationJobs).toEqual([
			expect.objectContaining({
				jobId: "hmj_existing",
				importMethod: "api_read",
			}),
		]);
	});

	test("CLI orchestration explicitly creates one bounded source job when no source evidence exists", async () => {
		const root = await tempRoot("auracall-handoff-source-create-");
		const calls: string[] = [];
		const result = await prepareHandoffForCli({
			config: fixtureConfig(),
			sourceProvider: "chatgpt",
			sourceProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "grok",
			targetProfile: "target-pro",
			sourceMaterializationCreate: true,
			sourceMaterializationAssetKind: ["files"],
			sourceMaterializationMaxItems: 1,
			sourceMaterializationProviderWorkTimeoutMs: 45000,
			sourceMaterializationForce: true,
			outputDir: root,
			handoffId: "source-create-fixture",
			dryRun: true,
			materializationClient: {
				async readJob() {
					calls.push("read");
					return materializationJobFixture();
				},
				async createJob(options) {
					calls.push(
						[
							"create",
							options.provider,
							options.runtimeProfile,
							options.providerConversationUrl,
							options.assetKinds?.join(","),
							String(options.maxItems),
							String(options.providerWorkTimeoutMs),
							String(options.force),
						].join(":"),
					);
					return materializationCreateResultFixture();
				},
			},
		});

		expect(calls).toEqual([
			"create:chatgpt:source-business:https://chatgpt.com/c/source:files:1:45000:true",
		]);
		expect(result.analysis.sourceMaterializationJobIds).toEqual(["hmj_created"]);
		expect(result.submissionPlan.zeroTargetMutationEvidence).toMatchObject({
			uploadAttemptCount: 0,
			submitAttemptCount: 0,
		});

		const status = await readHandoffStatusForCli({
			handoffId: "source-create-fixture",
			outputDir: root,
		});
		expect(status).toMatchObject({
			sourceMaterializationJobs: {
				metrics: {
					total: 1,
					apiCreated: 1,
					withResult: 1,
				},
				jobs: [
					expect.objectContaining({
						jobId: "hmj_created",
						status: "succeeded",
						importMethod: "api_create",
						reused: true,
						reuseReason: "active sourceKey is already running",
					}),
				],
			},
			target: {
				mutationAllowed: false,
				uploadAttemptCount: 0,
				submitAttemptCount: 0,
			},
		});
		expect(status).not.toBeNull();
		if (!status) throw new Error("Expected source create status fixture to exist.");
		expect(formatHandoffStatusCliSummary(status)).toContain("Source materialization jobs: 1");
	});

	test("imports source materialization readback entries into manifest items and packet evidence", async () => {
		const root = await tempRoot("auracall-handoff-materialized-");
		const result = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "materialized-readback",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: {
				messages: [{ role: "user", content: "hydrate this source" }],
			},
			sourceMaterializationReadbacks: [materializationJobFixture()],
			maxSelectedArtifacts: 1,
			generatedAt: "2026-06-05T12:00:00.000Z",
		});

		expect(result.sourceCompleteness).toMatchObject({
			state: "complete",
			messageCount: 1,
			manifestItemCount: 2,
			localMaterializedCount: 2,
			checksumCount: 1,
			omissionCount: 0,
		});
		expect(result.analysis.sourceMaterializationJobIds).toEqual(["hmj_fixture"]);
		expect(result.analysis.selectedManifestItemIds).toEqual(["hmj_fixture:entry_1"]);
		expect(result.submissionPlan).toMatchObject({
			targetMutationAllowed: false,
			selectedFileCount: 1,
			selectedTotalBytes: 4096,
		});

		const manifest = JSON.parse(
			await readFile(path.join(result.packetPath, "source", "manifest.json"), "utf8"),
		);
		expect(manifest.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "hmj_fixture:entry_1",
					kind: "artifact",
					title: "Source artifact",
					localPath: "/cache/source-artifact.pdf",
					checksumSha256: "c".repeat(64),
				}),
			]),
		);
		const inputIndex = JSON.parse(
			await readFile(path.join(result.packetPath, "analysis", "input-index.json"), "utf8"),
		);
		expect(inputIndex.sourceMaterializationJobIds).toEqual(["hmj_fixture"]);
		const submissionPlan = JSON.parse(
			await readFile(path.join(result.packetPath, "target", "submission-plan.json"), "utf8"),
		);
		expect(submissionPlan.zeroTargetMutationEvidence).toEqual({
			submitTargetPhaseSkipped: true,
			uploadAttemptCount: 0,
			submitAttemptCount: 0,
		});
	});

	test("imports create-result materialization envelopes and failed/skipped entries as omissions", async () => {
		const root = await tempRoot("auracall-handoff-omissions-");
		const result = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "omission-readback",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "grok",
			targetRuntimeProfile: "target-pro",
			sourceContext: { messages: [{ role: "user", content: "hello" }] },
			sourceMaterializationReadbacks: [
				{
					object: "history_materialization_job_create_result",
					generatedAt: "2026-06-05T12:00:00.000Z",
					reused: false,
					reuseReason: null,
					job: {
						object: "history_materialization_job",
						id: "hmj_partial",
						source: { provider: "chatgpt" },
						request: {},
						status: "failed",
						result: {
							entries: [
								{
									kind: "file",
									providerId: "file_failed",
									status: "failed",
									reason: "download timeout",
								},
								{
									kind: "media",
									providerId: "media_skipped",
									status: "skipped",
									reason: "unsupported media surface",
								},
							],
						},
					},
				},
			],
			generatedAt: "2026-06-05T12:00:00.000Z",
		});

		expect(result.sourceCompleteness).toMatchObject({
			state: "partial",
			manifestItemCount: 0,
			omissionCount: 2,
			retryableOmissionCount: 1,
		});
		expect(result.analysis.warnings).toContain("source_omissions_present");

		const omissions = JSON.parse(
			await readFile(path.join(result.packetPath, "source", "omissions.json"), "utf8"),
		);
		expect(omissions.items).toEqual([
			expect.objectContaining({
				id: "hmj_partial:entry_1",
				sourceRef: "file_failed",
				reason: "download timeout",
				retryable: true,
			}),
			expect.objectContaining({
				id: "hmj_partial:entry_2",
				sourceRef: "media_skipped",
				reason: "unsupported media surface",
				retryable: false,
			}),
		]);
	});

	test("reads a prepared handoff packet status by id from the handoff ledger", async () => {
		const root = await tempRoot("auracall-handoff-status-");
		await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "status-fixture",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "status please" }] },
			sourceManifest: {
				items: [
					{
						id: "selected",
						kind: "file",
						localPath: "/tmp/selected.txt",
						sizeBytes: 17,
						checksumSha256: "d".repeat(64),
					},
				],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});

		const status = await readHandoffStatusForCli({
			handoffId: "status-fixture",
			outputDir: root,
		});

		expect(status).toMatchObject({
			object: "auracall.handoff.status.result",
			packetPath: path.join(root, "status-fixture"),
			eventCount: 6,
			run: {
				id: "status-fixture",
				status: "preview_ready",
			},
			ledger: {
				runId: "status-fixture",
				targetMutationAllowed: false,
			},
			sourceCompleteness: {
				state: "complete",
				messageCount: 1,
				manifestItemCount: 1,
				localMaterializedCount: 1,
			},
			target: {
				mutationAllowed: false,
				uploadAttemptCount: 0,
				submitAttemptCount: 0,
			},
		});
		expect(status?.packetDigest).toMatch(/^[a-f0-9]{64}$/);
		expect(status).not.toBeNull();
		if (!status) throw new Error("Expected handoff status fixture to exist.");
		expect(formatHandoffStatusCliSummary(status)).toContain("Target mutation allowed: false");
		expect(formatHandoffStatusCliSummary(status)).toContain("Events: 6");
	});

	test("returns null for missing handoff status ids", async () => {
		const root = await tempRoot("auracall-handoff-status-missing-");

		await expect(
			readHandoffStatusForCli({
				handoffId: "missing-fixture",
				outputDir: root,
			}),
		).resolves.toBeNull();
	});

	test("fails closed when an explicit source runtime profile is missing", async () => {
		await expect(
			prepareCrossServiceHandoffPacket({
				config: fixtureConfig(),
				sourceProvider: "chatgpt",
				sourceRuntimeProfile: "missing-source",
				sourceRef: "https://chatgpt.com/c/source",
				targetProvider: "gemini",
				targetRuntimeProfile: "target-gemini",
				sourceContext: { messages: [] },
				sourceManifest: { items: [] },
			}),
		).rejects.toThrow(
			'AuraCall runtime profile "missing-source" was not found for source chatgpt.',
		);
	});
});

async function tempRoot(prefix: string): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), prefix));
	tempRoots.push(root);
	return root;
}

function fixtureConfig(): Record<string, unknown> {
	return {
		runtimeProfiles: {
			"source-business": {
				browserProfile: "business-browser",
				services: {
					chatgpt: {
						identity: {
							email: "business@example.com",
							accountPlanType: "business",
						},
					},
				},
			},
			"target-pro": {
				browserProfile: "pro-browser",
				services: {
					chatgpt: {
						identity: {
							email: "target@example.com",
							accountPlanType: "pro",
						},
					},
					grok: {
						identity: {
							handle: "target-grok",
						},
					},
				},
			},
			"target-gemini": {
				browserProfile: "gemini-browser",
				services: {
					gemini: {
						identity: {
							email: "target@example.com",
						},
					},
				},
			},
		},
	};
}

function materializationJobFixture(
	options: { id?: string | null; status?: string | null } = {},
): Record<string, unknown> {
	return {
		object: "history_materialization_job",
		id: options.id ?? "hmj_fixture",
		source: {
			provider: "chatgpt",
			conversationId: "source-conversation",
		},
		request: {},
		status: options.status ?? "materialized",
		result: {
			entries: [
				{
					kind: "artifact",
					providerId: "artifact_source",
					title: "Source artifact",
					status: "materialized",
					localPath: "/cache/source-artifact.pdf",
					remoteUrl: "https://chatgpt.com/c/source/artifact",
					checksumSha256: "c".repeat(64),
					mimeType: "application/pdf",
					size: 4096,
					materializationMethod: "history_archive",
					archiveItemId: "archive_artifact_source",
				},
				{
					kind: "file",
					providerId: "file_source",
					title: "Source file",
					status: "duplicate",
					localPath: "/cache/source-file.csv",
					mimeType: "text/csv",
					size: 128,
					materializationMethod: "duplicate_alias",
				},
			],
		},
	};
}

function materializationCreateResultFixture(): Record<string, unknown> {
	return {
		object: "history_materialization_job_create_result",
		generatedAt: "2026-06-05T12:00:00.000Z",
		reused: true,
		reuseReason: "active sourceKey is already running",
		job: materializationJobFixture({ id: "hmj_created", status: "succeeded" }),
	};
}
