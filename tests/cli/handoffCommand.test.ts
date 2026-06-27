import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import {
	approveHandoffSubmitForCli,
	approveHandoffUploadForCli,
	exportHandoffForCli,
	formatHandoffApproveSubmitCliSummary,
	formatHandoffExportCliSummary,
	formatHandoffPrepareCliSummary,
	formatHandoffRecoverLiveCliSummary,
	formatHandoffRepairCliSummary,
	formatHandoffResumeCliSummary,
	formatHandoffStatusCliSummary,
	formatHandoffSubmitCliSummary,
	prepareHandoffForCli,
	readHandoffStatusForCli,
	recoverLiveHandoffForCli,
	repairHandoffForCli,
	resumeHandoffForCli,
	submitHandoffForCli,
	uploadHandoffForCli,
} from "../../src/cli/handoffCommand.js";
import type { ResolvedUserConfig } from "../../src/config.js";
import {
	createProviderNativeHandoffTargetAdapter,
	HANDOFF_ANALYSIS_SCHEMA,
	type HandoffProviderNativePromptInput,
	type HandoffProviderNativeUploadInput,
	type HandoffTargetAdapter,
	prepareCrossServiceHandoffPacket,
	recoverHandoffLive,
	submitHandoffTargetPackage,
	uploadHandoffTargetPackage,
	validateHandoffAnalysisDecision,
} from "../../src/handoff/service.js";

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
		const artifactPath = path.join(root, "artifact-a.pdf");
		const filePath = path.join(root, "file-b.csv");
		await writeFile(artifactPath, "artifact-a", "utf8");
		await writeFile(filePath, "file-b", "utf8");

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
						localPath: artifactPath,
						sizeBytes: 10,
						checksumSha256: "a".repeat(64),
						importanceHint: 10,
					},
					{
						id: "file_b",
						kind: "file",
						title: "Less important file",
						localPath: filePath,
						sizeBytes: 6,
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
			selectedTotalBytes: 10,
			packageDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
			zeroTargetMutationEvidence: {
				submitTargetPhaseSkipped: true,
				uploadAttemptCount: 0,
				submitAttemptCount: 0,
			},
		});
		expect(result.analysis).toMatchObject({
			object: "auracall.handoff-analysis-decision.v2",
			schemaValid: true,
			approvalRecommendation: "preview_only",
			budgetFit: {
				fits: true,
				selectedFileBytes: 10,
			},
		});
		expect(result.analysisValidation.schemaValid).toBe(true);
		expect(result.targetPackage).toMatchObject({
			object: "auracall.handoff-target-package.v1",
			targetMutationAllowed: false,
			selectedFileCount: 1,
			selectedTotalBytes: 10,
			packageOmissionCount: 0,
		});

		const runJson = JSON.parse(await readFile(path.join(result.packetPath, "run.json"), "utf8"));
		expect(runJson.phases.preview_target).toBe("completed");
		expect(runJson.artifacts).toMatchObject({
			analysisInput: "analysis/input.json",
			analysisValidation: "analysis/validation-report.json",
			targetPackage: "target/package.json",
			targetUploadManifest: "target/upload-manifest.json",
		});
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
		const validationReport = JSON.parse(
			await readFile(path.join(result.packetPath, "analysis", "validation-report.json"), "utf8"),
		);
		expect(validationReport).toMatchObject({
			object: "auracall.handoff-analysis-validation-report.v1",
			schemaValid: true,
			errors: [],
		});
		const uploadManifest = JSON.parse(
			await readFile(path.join(result.packetPath, "target", "upload-manifest.json"), "utf8"),
		);
		expect(uploadManifest.items).toEqual([
			expect.objectContaining({
				sourceManifestItemId: "artifact_a",
				packetPath: expect.stringMatching(/^target\/selected-files\//),
				sizeBytes: 10,
				checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			}),
		]);
		expect(uploadManifest.omissions).toEqual([]);
		const events = await readFile(path.join(result.packetPath, "events.jsonl"), "utf8");
		expect(events).toContain('"phase":"discover_source"');
		expect(events).toContain('"phase":"preview_target"');
	});

	test("dedupes selected local files with the same checksum", async () => {
		const root = await tempRoot("auracall-handoff-dedupe-");
		const duplicateA = path.join(root, "source-a.txt");
		const duplicateB = path.join(root, "source-b.txt");
		const projectIndex = path.join(root, "project-index.txt");
		const duplicateBody = "same source file body";
		await writeFile(duplicateA, duplicateBody, "utf8");
		await writeFile(duplicateB, duplicateBody, "utf8");
		await writeFile(projectIndex, "project index", "utf8");
		const duplicateChecksum = createHash("sha256").update(duplicateBody).digest("hex");
		const projectIndexChecksum = createHash("sha256").update("project index").digest("hex");

		const result = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			handoffId: "dedupe-local-files",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "source-business",
			sourceContext: {
				messages: [{ role: "user", content: "hydrate with deduped files" }],
			},
			sourceManifest: {
				items: [
					{
						id: "duplicate_alias_a",
						kind: "file",
						title: "Duplicate source file",
						localPath: duplicateA,
						sizeBytes: duplicateBody.length,
						checksumSha256: duplicateChecksum,
						importanceHint: 5,
					},
					{
						id: "duplicate_alias_b",
						kind: "file",
						title: "Duplicate source file",
						localPath: duplicateB,
						sizeBytes: duplicateBody.length,
						checksumSha256: duplicateChecksum,
						importanceHint: 3,
					},
					{
						id: "project_index",
						kind: "file",
						title: "Project index",
						localPath: projectIndex,
						sizeBytes: "project index".length,
						checksumSha256: projectIndexChecksum,
						importanceHint: 1,
					},
				],
			},
			maxSelectedArtifacts: 3,
			generatedAt: "2026-06-05T12:00:00.000Z",
		});

		expect(result.analysis.selectedManifestItemIds).toEqual(["duplicate_alias_a", "project_index"]);
		expect(result.targetPackage.selectedFileCount).toBe(2);
		expect(result.targetPackage.selectedTotalBytes).toBe(
			duplicateBody.length + "project index".length,
		);
		expect(result.submissionPlan.selectedManifestItemIds).toEqual([
			"duplicate_alias_a",
			"project_index",
		]);
		const uploadManifest = JSON.parse(
			await readFile(path.join(result.packetPath, "target", "upload-manifest.json"), "utf8"),
		);
		expect(
			uploadManifest.items.map(
				(item: { sourceManifestItemId: string }) => item.sourceManifestItemId,
			),
		).toEqual(["duplicate_alias_a", "project_index"]);
	});

	test("keeps ten selected handoff attachments individual by default", async () => {
		const root = await tempRoot("auracall-handoff-ten-attachments-");
		const manifestItems = await createSelectedFileManifestItems(root, 10);

		const result = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			handoffId: "ten-attachments-individual",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			sourceContext: { messages: [{ role: "user", content: "ten files" }] },
			sourceManifest: { items: manifestItems },
			maxSelectedArtifacts: 10,
			generatedAt: "2026-06-26T12:00:00.000Z",
		});

		const uploadManifest = JSON.parse(
			await readFile(path.join(result.packetPath, "target", "upload-manifest.json"), "utf8"),
		);
		const primer = await readFile(path.join(result.packetPath, "target", "primer.md"), "utf8");
		expect(result.targetPackage.selectedFileCount).toBe(10);
		expect(uploadManifest.items).toHaveLength(10);
		expect(uploadManifest.attachmentPackaging).toMatchObject({
			mode: "individual",
			enabled: true,
			zipWhenFileCountExceeds: 10,
			originalSelectedFileCount: 10,
			emittedUploadItemCount: 10,
		});
		expect(primer).not.toContain("Attachment packaging instruction");
	});

	test("packages eleven selected handoff attachments into one deterministic ZIP by default", async () => {
		const root = await tempRoot("auracall-handoff-zip-attachments-");
		const manifestItems = await createSelectedFileManifestItems(root, 11);

		const first = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			handoffId: "eleven-attachments-zip-a",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			sourceContext: { messages: [{ role: "user", content: "eleven files" }] },
			sourceManifest: { items: manifestItems },
			maxSelectedArtifacts: 11,
			generatedAt: "2026-06-26T12:00:00.000Z",
		});
		const second = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			handoffId: "eleven-attachments-zip-b",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			sourceContext: { messages: [{ role: "user", content: "eleven files" }] },
			sourceManifest: { items: manifestItems },
			maxSelectedArtifacts: 11,
			generatedAt: "2026-06-26T12:00:00.000Z",
		});

		const uploadManifest = JSON.parse(
			await readFile(path.join(first.packetPath, "target", "upload-manifest.json"), "utf8"),
		);
		const zipPath = path.join(first.packetPath, "target", "selected-files", "handoff-attachments.zip");
		const firstZip = await readFile(zipPath);
		const secondZip = await readFile(
			path.join(second.packetPath, "target", "selected-files", "handoff-attachments.zip"),
		);
		const entries = parseStoredZipEntries(firstZip);
		const expectedEntryNames = uploadManifest.attachmentPackaging.originalItems
			.map((item: { packetPath: string }) => item.packetPath.replace(/^target\//, ""))
			.sort();

		expect(first.targetPackage.packageDigest).toBe(second.targetPackage.packageDigest);
		expect(firstZip.equals(secondZip)).toBe(true);
		expect(uploadManifest.items).toEqual([
			expect.objectContaining({
				sourceManifestItemId: "attachment_package_zip",
				packetPath: "target/selected-files/handoff-attachments.zip",
				filename: "handoff-attachments.zip",
				mimeType: "application/zip",
				sizeBytes: firstZip.length,
				checksumSha256: createHash("sha256").update(firstZip).digest("hex"),
			}),
		]);
		expect(uploadManifest.attachmentPackaging).toMatchObject({
			mode: "zip",
			enabled: true,
			zipWhenFileCountExceeds: 10,
			originalSelectedFileCount: 11,
			emittedUploadItemCount: 1,
			zip: expect.objectContaining({
				packetPath: "target/selected-files/handoff-attachments.zip",
				mimeType: "application/zip",
			}),
		});
		expect(entries.map((entry) => entry.name)).toEqual(expectedEntryNames);
		expect(entries.map((entry) => entry.content.toString("utf8")).sort()).toEqual(
			Array.from({ length: 11 }, (_, index) => `file-${String(index + 1).padStart(2, "0")}`).sort(),
		);
		const primer = await readFile(path.join(first.packetPath, "target", "primer.md"), "utf8");
		expect(primer).toContain("Attachment packaging instruction");
		expect(primer).toContain("handoff-attachments.zip");
		expect(first.submissionPlan.attachmentPackaging.mode).toBe("zip");
	});

	test("allows handoff attachment ZIP packaging to be disabled by config", async () => {
		const root = await tempRoot("auracall-handoff-zip-disabled-");
		const manifestItems = await createSelectedFileManifestItems(root, 11);

		const result = await prepareCrossServiceHandoffPacket({
			config: {
				...fixtureConfig(),
				handoff: { attachmentPackaging: { enabled: false } },
			},
			handoffId: "zip-disabled",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			sourceContext: { messages: [{ role: "user", content: "disabled zip" }] },
			sourceManifest: { items: manifestItems },
			maxSelectedArtifacts: 11,
			generatedAt: "2026-06-26T12:00:00.000Z",
		});
		const zipped = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			handoffId: "zip-enabled-for-digest",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			sourceContext: { messages: [{ role: "user", content: "disabled zip" }] },
			sourceManifest: { items: manifestItems },
			maxSelectedArtifacts: 11,
			generatedAt: "2026-06-26T12:00:00.000Z",
		});

		const uploadManifest = JSON.parse(
			await readFile(path.join(result.packetPath, "target", "upload-manifest.json"), "utf8"),
		);
		expect(result.targetPackage.packageDigest).not.toBe(zipped.targetPackage.packageDigest);
		expect(uploadManifest.items).toHaveLength(11);
		expect(uploadManifest.attachmentPackaging).toMatchObject({
			mode: "individual",
			enabled: false,
			zipWhenFileCountExceeds: 10,
			originalSelectedFileCount: 11,
			emittedUploadItemCount: 11,
		});
	});

	test("honors handoff attachment ZIP threshold overrides", async () => {
		const root = await tempRoot("auracall-handoff-zip-threshold-");
		const manifestItems = await createSelectedFileManifestItems(root, 3);

		const result = await prepareCrossServiceHandoffPacket({
			config: {
				...fixtureConfig(),
				handoff: { attachmentPackaging: { zipWhenFileCountExceeds: 2 } },
			},
			handoffId: "zip-threshold-override",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			sourceContext: { messages: [{ role: "user", content: "threshold zip" }] },
			sourceManifest: { items: manifestItems },
			maxSelectedArtifacts: 3,
			generatedAt: "2026-06-26T12:00:00.000Z",
		});

		const uploadManifest = JSON.parse(
			await readFile(path.join(result.packetPath, "target", "upload-manifest.json"), "utf8"),
		);
		expect(uploadManifest.items).toHaveLength(1);
		expect(uploadManifest.attachmentPackaging).toMatchObject({
			mode: "zip",
			enabled: true,
			zipWhenFileCountExceeds: 2,
			originalSelectedFileCount: 3,
			emittedUploadItemCount: 1,
		});
	});

	test("uses file-searcher fallback when a selected manifest file is no longer available", async () => {
		const root = await tempRoot("auracall-handoff-file-searcher-");
		const recoveredPath = path.join(root, "Recovered Artifact.pdf");
		await writeFile(recoveredPath, "recovered artifact body", "utf8");
		const calls: string[] = [];

		const result = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			handoffId: "file-searcher-fallback",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			sourceContext: {
				messages: [{ role: "user", content: "recover missing upload" }],
			},
			sourceManifest: {
				items: [
					{
						id: "missing_upload",
						kind: "file",
						title: "Recovered Artifact.pdf",
						localPath: path.join(root, "expired-provider-upload.pdf"),
						sizeBytes: 123,
						importanceHint: 10,
					},
				],
			},
			fileSearchFallback: {
				async findLocalCopy(item) {
					calls.push(item.id);
					return {
						localPath: recoveredPath,
						query: "Recovered Artifact.pdf",
						reason: "file-searcher fallback resolved a local copy",
					};
				},
			},
			generatedAt: "2026-06-24T12:00:00.000Z",
		});

		expect(calls).toEqual(["missing_upload"]);
		expect(result.targetPackage).toMatchObject({
			selectedFileCount: 1,
			packageOmissionCount: 0,
		});
		const uploadManifest = JSON.parse(
			await readFile(path.join(result.packetPath, "target", "upload-manifest.json"), "utf8"),
		);
		expect(uploadManifest.items).toEqual([
			expect.objectContaining({
				sourceManifestItemId: "missing_upload",
				recoveredFromFileSearch: true,
				fileSearchQuery: "Recovered Artifact.pdf",
				sizeBytes: "recovered artifact body".length,
			}),
		]);
		const selectedFilePath = path.join(
			result.packetPath,
			uploadManifest.items[0].packetPath,
		);
		await expect(readFile(selectedFilePath, "utf8")).resolves.toBe("recovered artifact body");
	});

	test("records target model selector on prepared handoff target", async () => {
		const root = await tempRoot("auracall-handoff-model-selector-");
		const result = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "model-selector-target",
			sourceProvider: "gemini",
			sourceRuntimeProfile: "target-gemini",
			sourceRef: "https://gemini.google.com/app/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			targetModelSelector: "chatgpt:pro-extended",
			sourceContext: { messages: [{ role: "user", content: "use pro extended" }] },
			sourceManifest: { items: [] },
			generatedAt: "2026-06-24T12:00:00.000Z",
		});

		expect(result.run.target.modelSelector).toBe("chatgpt:pro-extended");
		expect(result.submissionPlan.target.modelSelector).toBe("chatgpt:pro-extended");
		const runJson = JSON.parse(await readFile(path.join(result.packetPath, "run.json"), "utf8"));
		expect(runJson.target.modelSelector).toBe("chatgpt:pro-extended");
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
			selectedFileCount: 0,
			selectedTotalBytes: 0,
			packageDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
		expect(result.targetPackage.packageOmissionCount).toBe(1);

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
		const uploadManifest = JSON.parse(
			await readFile(path.join(result.packetPath, "target", "upload-manifest.json"), "utf8"),
		);
		expect(uploadManifest).toMatchObject({
			items: [],
			omissions: [
				expect.objectContaining({
					sourceManifestItemId: "hmj_fixture:entry_1",
					reason: expect.stringMatching(
						/^file-searcher fallback (found no available local copy|unavailable or returned no usable output)$/,
					),
				}),
			],
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
						source: { type: "project_sources", provider: "chatgpt", projectId: "g-p-source" },
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
									kind: "file",
									providerId: "file_404",
									status: "failed",
									reason: "ChatGPT conversation file fetch failed: tile_not_found",
								},
								{
									kind: "file",
									providerId: "file_404",
									status: "failed",
									reason:
										"ChatGPT conversation file fetch failed: download_response_not_ok (status 404)",
								},
								{
									kind: "media",
									providerId: "media_skipped",
									status: "skipped",
									reason: "unsupported media surface",
								},
								{
									kind: "file",
									providerId: "project_source_row",
									status: "failed",
									reason: "project_source_download_unsupported",
								},
								{
									kind: "file",
									providerId: "project_source_without_provider_id",
									status: "failed",
									reason: "ChatGPT project source lacks a provider file id.",
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
			omissionCount: 5,
			retryableOmissionCount: 1,
		});
		expect(result.analysis.omissionWarnings).toContain("source_omissions_present");

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
				id: "hmj_partial:entry_3",
				sourceRef: "file_404",
				reason: "ChatGPT conversation file fetch failed: download_response_not_ok (status 404)",
				retryable: false,
			}),
			expect.objectContaining({
				id: "hmj_partial:entry_4",
				sourceRef: "media_skipped",
				reason: "unsupported media surface",
				retryable: false,
			}),
			expect.objectContaining({
				id: "hmj_partial:entry_5",
				sourceRef: "project_source_row",
				reason: "project_source_download_unsupported",
				retryable: false,
			}),
			expect.objectContaining({
				id: "hmj_partial:entry_6",
				sourceRef: "project_source_without_provider_id",
				reason: "ChatGPT project source lacks a provider file id.",
				retryable: false,
			}),
		]);
	});

	test("reads a prepared handoff packet status by id from the handoff ledger", async () => {
		const root = await tempRoot("auracall-handoff-status-");
		const selectedPath = path.join(root, "selected.txt");
		await writeFile(selectedPath, "selected fixture", "utf8");
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
						localPath: selectedPath,
						sizeBytes: 16,
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
			status: "preview_ready",
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
				packageDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
				selectedFileCount: 1,
				selectedTotalBytes: 16,
			},
		});
		expect(status?.packetDigest).toMatch(/^[a-f0-9]{64}$/);
		expect(status?.analysisValidation).toMatchObject({
			schemaValid: true,
			errors: [],
		});
		expect(status).not.toBeNull();
		if (!status) throw new Error("Expected handoff status fixture to exist.");
		expect(formatHandoffStatusCliSummary(status)).toContain("Target mutation allowed: false");
		expect(formatHandoffStatusCliSummary(status)).toContain("Analysis schema valid: true");
		expect(formatHandoffStatusCliSummary(status)).toContain("Target package files: 1");
		expect(formatHandoffStatusCliSummary(status)).toContain("Events: 6");
	});

	test("builds a stable target package digest for repeated dry-run preparation", async () => {
		const root = await tempRoot("auracall-handoff-digest-");
		const selectedPath = path.join(root, "digest.txt");
		await writeFile(selectedPath, "digest fixture", "utf8");
		const baseRequest = {
			config: fixtureConfig(),
			outputRoot: root,
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "stable digest" }] },
			sourceManifest: {
				items: [
					{
						id: "digest_selected",
						kind: "file",
						title: "Digest source",
						localPath: selectedPath,
						sizeBytes: 14,
						checksumSha256: "f".repeat(64),
						importanceHint: 5,
					},
				],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		} as const;

		const first = await prepareCrossServiceHandoffPacket({
			...baseRequest,
			handoffId: "digest-one",
		});
		const second = await prepareCrossServiceHandoffPacket({
			...baseRequest,
			handoffId: "digest-two",
		});

		expect(first.targetPackage.packageDigest).toMatch(/^[a-f0-9]{64}$/);
		expect(second.targetPackage.packageDigest).toBe(first.targetPackage.packageDigest);
	});

	test("requires upload approval before target upload", async () => {
		const root = await tempRoot("auracall-handoff-upload-no-approval-");
		const selectedPath = path.join(root, "upload.txt");
		await writeFile(selectedPath, "upload fixture", "utf8");
		await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "upload-no-approval",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "upload" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "upload_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});

		await expect(
			uploadHandoffForCli({
				handoffId: "upload-no-approval",
				outputDir: root,
			}),
		).rejects.toThrow("Target upload requires an explicit upload approval.");
	});

	test("rejects stale upload approval package digests", async () => {
		const root = await tempRoot("auracall-handoff-upload-stale-");
		const selectedPath = path.join(root, "upload.txt");
		await writeFile(selectedPath, "upload fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "upload-stale",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "upload" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "upload_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});

		await expect(
			approveHandoffUploadForCli({
				handoffId: "upload-stale",
				outputDir: root,
				actor: "tester",
				packageDigest: "0".repeat(64),
			}),
		).rejects.toThrow(prepared.targetPackage.packageDigest);
	});

	test("records upload approval and deterministic target upload rows without submit", async () => {
		const root = await tempRoot("auracall-handoff-upload-approved-");
		const selectedPath = path.join(root, "upload.txt");
		await writeFile(selectedPath, "upload fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "upload-approved",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "upload" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "upload_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});
		const approval = await approveHandoffUploadForCli({
			handoffId: "upload-approved",
			outputDir: root,
			actor: "tester",
			packageDigest: prepared.targetPackage.packageDigest,
		});

		expect(approval.approval).toMatchObject({
			object: "auracall.handoff-approval.v1",
			kind: "target_upload",
			actor: "tester",
			packageDigest: prepared.targetPackage.packageDigest,
			selectedFileCount: 1,
		});

		const firstUpload = await uploadHandoffForCli({
			handoffId: "upload-approved",
			outputDir: root,
		});
		const secondUpload = await uploadHandoffForCli({
			handoffId: "upload-approved",
			outputDir: root,
		});

		expect(firstUpload.uploadResult).toMatchObject({
			object: "auracall.handoff-upload-result.v1",
			status: "uploaded",
			packageDigest: prepared.targetPackage.packageDigest,
			uploadAttemptCount: 1,
			uploadedFileCount: 1,
			failedFileCount: 0,
			submitAttemptCount: 0,
			rows: [
				expect.objectContaining({
					sourceManifestItemId: "upload_selected",
					targetProvider: "gemini",
					targetRuntimeProfileId: "target-gemini",
					providerFileId: expect.stringMatching(/^handoff-file-[a-f0-9]{32}$/),
					status: "uploaded",
				}),
			],
		});
		expect(secondUpload.uploadResult.rows[0]?.providerFileId).toBe(
			firstUpload.uploadResult.rows[0]?.providerFileId,
		);
		expect(firstUpload.submissionResult).toMatchObject({
			status: "upload_completed",
			uploadAttemptCount: 1,
			submitAttemptCount: 0,
			uploadResultRef: "target/upload-result.json",
		});

		const status = await readHandoffStatusForCli({
			handoffId: "upload-approved",
			outputDir: root,
		});
		expect(status).toMatchObject({
			target: {
				uploadApproved: true,
				uploadApprovalDigest: prepared.targetPackage.packageDigest,
				uploadStatus: "uploaded",
				uploadedFileCount: 1,
				uploadFailureCount: 0,
				uploadAttemptCount: 1,
				submitAttemptCount: 0,
			},
		});
	});

	test("ignores stale target result files after package digest changes", async () => {
		const root = await tempRoot("auracall-handoff-stale-target-result-");
		const selectedPath = path.join(root, "stale-target.txt");
		await writeFile(selectedPath, "stale target fixture", "utf8");
		const sourceManifest = {
			items: [
				manifestItemFixture({
					id: "stale_target_file",
					localPath: selectedPath,
					sizeBytes: 20,
				}),
			],
		};
		const first = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "stale-target-result",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "first context" }] },
			sourceManifest,
			maxSelectedArtifacts: 1,
			generatedAt: "2026-06-05T12:00:00.000Z",
		});
		await approveHandoffUploadForCli({
			handoffId: "stale-target-result",
			outputDir: root,
			packageDigest: first.targetPackage.packageDigest,
		});
		await uploadHandoffForCli({
			handoffId: "stale-target-result",
			outputDir: root,
		});

		const packagePath = path.join(root, "stale-target-result", "target", "package.json");
		const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
		packageJson.packageDigest = "f".repeat(64);
		await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
		const uploadManifestPath = path.join(
			root,
			"stale-target-result",
			"target",
			"upload-manifest.json",
		);
		const uploadManifestJson = JSON.parse(await readFile(uploadManifestPath, "utf8"));
		uploadManifestJson.packageDigest = "f".repeat(64);
		await writeFile(uploadManifestPath, `${JSON.stringify(uploadManifestJson, null, 2)}\n`, "utf8");
		const submissionPlanPath = path.join(
			root,
			"stale-target-result",
			"target",
			"submission-plan.json",
		);
		const submissionPlanJson = JSON.parse(await readFile(submissionPlanPath, "utf8"));
		submissionPlanJson.packageDigest = "f".repeat(64);
		await writeFile(submissionPlanPath, `${JSON.stringify(submissionPlanJson, null, 2)}\n`, "utf8");

		const status = await readHandoffStatusForCli({
			handoffId: "stale-target-result",
			outputDir: root,
		});
		expect(status).toMatchObject({
			status: "preview_ready",
			target: {
				packageDigest: "f".repeat(64),
				uploadApproved: false,
				uploadStatus: "not_uploaded",
				uploadedFileCount: 0,
				submitStatus: "not_submitted",
				readbackStatus: "missing",
			},
		});
		expect(status).not.toBeNull();
		if (!status) throw new Error("Expected stale target status fixture to exist.");
		const resume = await resumeHandoffForCli({
			handoffId: "stale-target-result",
			outputDir: root,
		});
		expect(resume.resumePlan).toMatchObject({
			currentStage: "package_ready",
			nextAction: "approve_upload",
		});
	});

	test("keeps package omissions out of target upload attempts", async () => {
		const root = await tempRoot("auracall-handoff-upload-omissions-");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "upload-omissions",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "upload" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "missing_local", localPath: "/missing/upload.txt" })],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});
		expect(prepared.targetPackage.packageOmissionCount).toBe(1);
		await approveHandoffUploadForCli({
			handoffId: "upload-omissions",
			outputDir: root,
			actor: "tester",
			packageDigest: prepared.targetPackage.packageDigest,
		});

		const upload = await uploadHandoffForCli({
			handoffId: "upload-omissions",
			outputDir: root,
		});

		expect(upload.uploadResult).toMatchObject({
			status: "skipped_no_files",
			uploadAttemptCount: 0,
			uploadedFileCount: 0,
			failedFileCount: 0,
			submitAttemptCount: 0,
			rows: [],
			omissions: [
				expect.objectContaining({
					sourceManifestItemId: "missing_local",
				}),
			],
		});
		expect(upload.submissionResult).toMatchObject({
			status: "upload_skipped_no_files",
			uploadAttemptCount: 0,
			submitAttemptCount: 0,
		});
	});

	test("requires submit approval after target upload", async () => {
		const root = await tempRoot("auracall-handoff-submit-no-approval-");
		const selectedPath = path.join(root, "submit.txt");
		await writeFile(selectedPath, "submit fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "submit-no-approval",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "submit" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "submit_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});
		await approveHandoffUploadForCli({
			handoffId: "submit-no-approval",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		await uploadHandoffForCli({
			handoffId: "submit-no-approval",
			outputDir: root,
		});

		await expect(
			submitHandoffForCli({
				handoffId: "submit-no-approval",
				outputDir: root,
			}),
		).rejects.toThrow("Target submit requires an explicit submit approval.");
	});

	test("records submit approval and deterministic target submit readback", async () => {
		const root = await tempRoot("auracall-handoff-submit-approved-");
		const selectedPath = path.join(root, "submit.txt");
		await writeFile(selectedPath, "submit fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "submit-approved",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			targetRef: "https://gemini.google.com/app/target",
			sourceContext: { messages: [{ role: "user", content: "submit" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "submit_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});
		await approveHandoffUploadForCli({
			handoffId: "submit-approved",
			outputDir: root,
			actor: "tester",
			packageDigest: prepared.targetPackage.packageDigest,
		});
		const upload = await uploadHandoffForCli({
			handoffId: "submit-approved",
			outputDir: root,
		});
		const approval = await approveHandoffSubmitForCli({
			handoffId: "submit-approved",
			outputDir: root,
			actor: "tester",
			packageDigest: prepared.targetPackage.packageDigest,
		});

		expect(approval.approval).toMatchObject({
			object: "auracall.handoff-approval.v1",
			kind: "target_submit",
			packageDigest: prepared.targetPackage.packageDigest,
			primerDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
			compactContextDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
			uploadSetDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
		expect(formatHandoffApproveSubmitCliSummary(approval)).toContain("Approval: target_submit");

		const submit = await submitHandoffForCli({
			handoffId: "submit-approved",
			outputDir: root,
		});

		expect(submit.submissionResult).toMatchObject({
			object: "auracall.handoff-submission-result.v1",
			status: "submitted",
			packageDigest: prepared.targetPackage.packageDigest,
			uploadAttemptCount: 1,
			submitAttemptCount: 1,
			uploadResultRef: "target/upload-result.json",
			submitApprovalRef: "approvals/submit.json",
			targetConversationRef: "https://gemini.google.com/app/target",
			providerMessageId: expect.stringMatching(/^handoff-message-[a-f0-9]{32}$/),
			readbackRef: "target/readback.json",
			uploadedProviderFileIds: [upload.uploadResult.rows[0]?.providerFileId],
		});
		expect(submit.readback).toMatchObject({
			object: "auracall.handoff-target-readback.v1",
			status: "readback_cached",
			targetConversationRef: "https://gemini.google.com/app/target",
			providerMessageId: submit.submissionResult.providerMessageId,
		});
		expect(formatHandoffSubmitCliSummary(submit)).toContain("Submit status: submitted");

		const status = await readHandoffStatusForCli({
			handoffId: "submit-approved",
			outputDir: root,
		});
		expect(status).toMatchObject({
			target: {
				uploadApproved: true,
				submitApproved: true,
				uploadStatus: "uploaded",
				submitStatus: "submitted",
				readbackStatus: "readback_cached",
				uploadAttemptCount: 1,
				submitAttemptCount: 1,
				targetConversationRef: "https://gemini.google.com/app/target",
				providerMessageId: submit.submissionResult.providerMessageId,
			},
		});
		expect(status).not.toBeNull();
		if (!status) throw new Error("Expected submit-approved status fixture to exist.");
		expect(status.status).toBe("complete");
		expect(formatHandoffStatusCliSummary(status)).toContain("Target submit approved: true");
		expect(formatHandoffStatusCliSummary(status)).toContain(
			"Target readback status: readback_cached",
		);
		expect(formatHandoffStatusCliSummary(status)).toContain("Status: complete");
		expect(formatHandoffStatusCliSummary(status)).toContain("Packet status: preview_ready");
	});

	test("rejects stale submit approval when target prompt artifacts change", async () => {
		const root = await tempRoot("auracall-handoff-submit-stale-");
		const selectedPath = path.join(root, "submit.txt");
		await writeFile(selectedPath, "submit fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "submit-stale",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "submit" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "submit_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});
		await approveHandoffUploadForCli({
			handoffId: "submit-stale",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		await uploadHandoffForCli({
			handoffId: "submit-stale",
			outputDir: root,
		});
		await approveHandoffSubmitForCli({
			handoffId: "submit-stale",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		await writeFile(path.join(root, "submit-stale", "target", "primer.md"), "changed\n", "utf8");

		await expect(
			submitHandoffForCli({
				handoffId: "submit-stale",
				outputDir: root,
			}),
		).rejects.toThrow("Submit approval is stale");
	});

	test("rejects submit approval package digest mismatches", async () => {
		const root = await tempRoot("auracall-handoff-submit-digest-mismatch-");
		const selectedPath = path.join(root, "submit.txt");
		await writeFile(selectedPath, "submit fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "submit-digest-mismatch",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "submit" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "submit_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});
		await approveHandoffUploadForCli({
			handoffId: "submit-digest-mismatch",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		await uploadHandoffForCli({
			handoffId: "submit-digest-mismatch",
			outputDir: root,
		});

		await expect(
			approveHandoffSubmitForCli({
				handoffId: "submit-digest-mismatch",
				outputDir: root,
				packageDigest: "0".repeat(64),
			}),
		).rejects.toThrow(prepared.targetPackage.packageDigest);
	});

	test("writes resume plans for the next safe handoff action", async () => {
		const root = await tempRoot("auracall-handoff-resume-");
		const selectedPath = path.join(root, "resume.txt");
		await writeFile(selectedPath, "resume fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "resume-fixture",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "resume" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "resume_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});

		const beforeApproval = await resumeHandoffForCli({
			handoffId: "resume-fixture",
			outputDir: root,
		});
		expect(beforeApproval.resumePlan).toMatchObject({
			currentStage: "package_ready",
			nextAction: "approve_upload",
			requiredApprovals: ["target_upload"],
			command: expect.stringContaining(prepared.targetPackage.packageDigest),
		});
		expect(formatHandoffResumeCliSummary(beforeApproval)).toContain("Next action: approve_upload");

		await approveHandoffUploadForCli({
			handoffId: "resume-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		await uploadHandoffForCli({
			handoffId: "resume-fixture",
			outputDir: root,
		});
		const afterUpload = await resumeHandoffForCli({
			handoffId: "resume-fixture",
			outputDir: root,
		});
		expect(afterUpload.resumePlan).toMatchObject({
			currentStage: "uploaded",
			nextAction: "approve_submit",
			requiredApprovals: ["target_submit"],
		});

		await approveHandoffSubmitForCli({
			handoffId: "resume-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		await submitHandoffForCli({
			handoffId: "resume-fixture",
			outputDir: root,
		});
		const complete = await resumeHandoffForCli({
			handoffId: "resume-fixture",
			outputDir: root,
		});
		expect(complete.resumePlan).toMatchObject({
			currentStage: "complete",
			nextAction: "complete",
			command: null,
		});
		const planJson = JSON.parse(
			await readFile(path.join(root, "resume-fixture", "target", "resume-plan.json"), "utf8"),
		);
		expect(planJson.object).toBe("auracall.handoff-resume-plan.v1");
	});

	test("blocks live recovery until the resume plan has an approved executable action", async () => {
		const root = await tempRoot("auracall-handoff-live-recovery-blocked-");
		const selectedPath = path.join(root, "live-blocked.txt");
		await writeFile(selectedPath, "live blocked fixture", "utf8");
		await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "live-recovery-blocked",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "recover" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "live_blocked_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-07T12:00:00.000Z",
		});

		const recovery = await recoverLiveHandoffForCli({
			handoffId: "live-recovery-blocked",
			outputDir: root,
		});

		expect(recovery).toMatchObject({
			object: "auracall.handoff.live-recovery.result",
			recovery: {
				object: "auracall.handoff-live-recovery.v1",
				status: "blocked",
				executor: "packet_target_adapter",
				executedAction: null,
				blockers: [
					"live recovery requires an approved executable next action; current next action is approve_upload",
				],
			},
			beforeResumePlan: {
				nextAction: "approve_upload",
			},
			afterResumePlan: null,
		});
		expect(formatHandoffRecoverLiveCliSummary(recovery)).toContain("Recovery status: blocked");
		const recoveryJson = JSON.parse(
			await readFile(
				path.join(root, "live-recovery-blocked", "target", "live-recovery.json"),
				"utf8",
			),
		);
		expect(recoveryJson).toMatchObject({
			object: "auracall.handoff-live-recovery.v1",
			status: "blocked",
			resultRefs: {
				uploadResult: null,
				submissionResult: null,
				readback: null,
			},
		});
	});

	test("live recovery executes approved upload and then approved submit from resume state", async () => {
		const root = await tempRoot("auracall-handoff-live-recovery-");
		const selectedPath = path.join(root, "live.txt");
		await writeFile(selectedPath, "live recovery fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "live-recovery-fixture",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			targetRef: "https://gemini.google.com/app/live-target",
			sourceContext: { messages: [{ role: "user", content: "recover live" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "live_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-07T12:00:00.000Z",
		});
		await approveHandoffUploadForCli({
			handoffId: "live-recovery-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});

		const uploadRecovery = await recoverLiveHandoffForCli({
			handoffId: "live-recovery-fixture",
			outputDir: root,
		});
		expect(uploadRecovery).toMatchObject({
			recovery: {
				status: "recovered",
				executedAction: "upload",
				resultRefs: {
					uploadResult: "target/upload-result.json",
					submissionResult: "target/submission-result.json",
					readback: null,
				},
			},
			beforeResumePlan: {
				nextAction: "upload",
			},
			afterResumePlan: {
				nextAction: "approve_submit",
			},
		});
		expect(formatHandoffRecoverLiveCliSummary(uploadRecovery)).toContain("Executed action: upload");

		await approveHandoffSubmitForCli({
			handoffId: "live-recovery-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		const submitRecovery = await recoverLiveHandoffForCli({
			handoffId: "live-recovery-fixture",
			outputDir: root,
		});

		expect(submitRecovery).toMatchObject({
			recovery: {
				status: "recovered",
				executedAction: "submit",
				resultRefs: {
					uploadResult: "target/upload-result.json",
					submissionResult: "target/submission-result.json",
					readback: "target/readback.json",
				},
			},
			beforeResumePlan: {
				nextAction: "submit",
			},
			afterResumePlan: {
				nextAction: "complete",
			},
		});
		const recoveryJson = JSON.parse(
			await readFile(
				path.join(root, "live-recovery-fixture", "target", "live-recovery.json"),
				"utf8",
			),
		);
		expect(recoveryJson).toMatchObject({
			object: "auracall.handoff-live-recovery.v1",
			status: "recovered",
			executedAction: "submit",
			adapterNotes: expect.arrayContaining([
				"Recovery executes only the current approved resume-plan action.",
			]),
		});
		const status = await readHandoffStatusForCli({
			handoffId: "live-recovery-fixture",
			outputDir: root,
		});
		expect(status).toMatchObject({
			target: {
				submitStatus: "submitted",
				readbackStatus: "readback_cached",
				targetConversationRef: "https://gemini.google.com/app/live-target",
			},
		});
	});

	test("CLI live recovery selects the explicit ChatGPT browser target adapter", async () => {
		const root = await tempRoot("auracall-handoff-chatgpt-browser-adapter-select-");
		const selectedPath = path.join(root, "chatgpt-browser-adapter.txt");
		await writeFile(selectedPath, "chatgpt browser adapter fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "chatgpt-browser-adapter-select",
			sourceProvider: "gemini",
			sourceRuntimeProfile: "target-gemini",
			sourceRef: "https://gemini.google.com/app/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			targetRef: "https://chatgpt.com/c/target",
			sourceContext: { messages: [{ role: "user", content: "adapter select" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "chatgpt_adapter_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-07T12:00:00.000Z",
		});
		const calls: string[] = [];
		const adapter: HandoffTargetAdapter = {
			id: "chatgpt_browser_fixture_adapter",
			async upload(input) {
				calls.push(`upload:${input.handoffId}`);
				return uploadHandoffTargetPackage(input);
			},
			async submit(input) {
				calls.push(`submit:${input.handoffId}`);
				return submitHandoffTargetPackage(input);
			},
		};
		await approveHandoffUploadForCli({
			handoffId: "chatgpt-browser-adapter-select",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});

		const recovery = await recoverLiveHandoffForCli({
			handoffId: "chatgpt-browser-adapter-select",
			outputDir: root,
			targetAdapter: "chatgpt-browser",
			config: fixtureResolvedUserConfig(),
			targetAdapterFactory: () => adapter,
		});

		expect(calls).toEqual(["upload:chatgpt-browser-adapter-select"]);
		expect(recovery).toMatchObject({
			recovery: {
				status: "recovered",
				executor: "chatgpt_browser_fixture_adapter",
				executedAction: "upload",
			},
			afterResumePlan: {
				nextAction: "approve_submit",
			},
		});
	});

	test("live recovery can execute through an injected provider-native target adapter", async () => {
		const root = await tempRoot("auracall-handoff-provider-adapter-");
		const selectedPath = path.join(root, "provider-adapter.txt");
		await writeFile(selectedPath, "provider adapter fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "provider-adapter-fixture",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			targetRef: "https://chatgpt.com/c/target",
			sourceContext: { messages: [{ role: "user", content: "adapter" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "adapter_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-07T12:00:00.000Z",
		});
		const calls: string[] = [];
		const providerNativeAdapter: HandoffTargetAdapter = {
			id: "provider_native_fixture_adapter",
			async upload(input) {
				calls.push(`upload:${input.handoffId}:${input.generatedAt}`);
				return uploadHandoffTargetPackage(input);
			},
			async submit(input) {
				calls.push(`submit:${input.handoffId}:${input.generatedAt}`);
				return submitHandoffTargetPackage(input);
			},
		};

		await approveHandoffUploadForCli({
			handoffId: "provider-adapter-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		const uploadRecovery = await recoverHandoffLive({
			handoffId: "provider-adapter-fixture",
			outputRoot: root,
			generatedAt: "2026-06-07T12:01:00.000Z",
			targetAdapter: providerNativeAdapter,
		});

		expect(uploadRecovery.recovery).toMatchObject({
			status: "recovered",
			executor: "provider_native_fixture_adapter",
			executedAction: "upload",
		});
		expect(uploadRecovery.afterResumePlan?.nextAction).toBe("approve_submit");

		await approveHandoffSubmitForCli({
			handoffId: "provider-adapter-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		const submitRecovery = await recoverHandoffLive({
			handoffId: "provider-adapter-fixture",
			outputRoot: root,
			generatedAt: "2026-06-07T12:02:00.000Z",
			targetAdapter: providerNativeAdapter,
		});

		expect(calls).toEqual([
			"upload:provider-adapter-fixture:2026-06-07T12:01:00.000Z",
			"submit:provider-adapter-fixture:2026-06-07T12:02:00.000Z",
		]);
		expect(submitRecovery.recovery).toMatchObject({
			status: "recovered",
			executor: "provider_native_fixture_adapter",
			executedAction: "submit",
		});
		expect(submitRecovery.afterResumePlan?.nextAction).toBe("complete");
		const recoveryJson = JSON.parse(
			await readFile(
				path.join(root, "provider-adapter-fixture", "target", "live-recovery.json"),
				"utf8",
			),
		);
		expect(recoveryJson).toMatchObject({
			object: "auracall.handoff-live-recovery.v1",
			executor: "provider_native_fixture_adapter",
			executedAction: "submit",
		});
	});

	test("provider-native prompt adapter submits target primer and caches readback", async () => {
		const root = await tempRoot("auracall-handoff-provider-native-prompt-");
		const selectedPath = path.join(root, "provider-native.txt");
		await writeFile(selectedPath, "provider native fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "provider-native-prompt-fixture",
			sourceProvider: "gemini",
			sourceRuntimeProfile: "target-gemini",
			sourceRef: "https://gemini.google.com/app/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			targetRef: "https://chatgpt.com/c/provider-native-target",
			sourceContext: { messages: [{ role: "user", content: "native prompt" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "native_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-07T12:00:00.000Z",
		});
		await approveHandoffUploadForCli({
			handoffId: "provider-native-prompt-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		const uploadRecovery = await recoverHandoffLive({
			handoffId: "provider-native-prompt-fixture",
			outputRoot: root,
			generatedAt: "2026-06-07T12:01:00.000Z",
			targetAdapter: createProviderNativeHandoffTargetAdapter({
				async submit() {
					throw new Error("submit should not run during upload recovery");
				},
			}),
		});
		expect(uploadRecovery.recovery.executedAction).toBe("upload");
		const promptInputs: HandoffProviderNativePromptInput[] = [];
		const nativeAdapter = createProviderNativeHandoffTargetAdapter({
			async submit(input) {
				promptInputs.push(input);
				return {
					targetConversationRef: "https://chatgpt.com/c/provider-native-target",
					providerMessageId: "provider-native-message-fixture",
					responseSummary: "Provider-native fixture accepted the handoff.",
					responseExcerpt: "The target conversation received the compact context.",
				};
			},
		});
		await approveHandoffSubmitForCli({
			handoffId: "provider-native-prompt-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});

		const submitRecovery = await recoverHandoffLive({
			handoffId: "provider-native-prompt-fixture",
			outputRoot: root,
			generatedAt: "2026-06-07T12:02:00.000Z",
			targetAdapter: nativeAdapter,
		});

		expect(promptInputs).toEqual([
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "target-pro",
				conversationRef: "https://chatgpt.com/c/provider-native-target",
				projectRef: null,
				packageDigest: prepared.targetPackage.packageDigest,
				uploadedProviderFileIds: [expect.stringMatching(/^handoff-file-[a-f0-9]{32}$/)],
			}),
		]);
		expect(promptInputs[0]?.prompt).toContain("You are receiving a compact");
		expect(promptInputs[0]?.compactContext).toMatchObject({
			sourceProvider: "gemini",
			targetProvider: "chatgpt",
		});
		expect(submitRecovery).toMatchObject({
			recovery: {
				status: "recovered",
				executor: "provider_native_prompt_adapter",
				executedAction: "submit",
			},
			afterResumePlan: {
				nextAction: "complete",
			},
		});
		const submissionJson = JSON.parse(
			await readFile(
				path.join(root, "provider-native-prompt-fixture", "target", "submission-result.json"),
				"utf8",
			),
		);
		expect(submissionJson).toMatchObject({
			status: "submitted",
			targetConversationRef: "https://chatgpt.com/c/provider-native-target",
			providerMessageId: "provider-native-message-fixture",
			uploadedProviderFileIds: [expect.stringMatching(/^handoff-file-[a-f0-9]{32}$/)],
		});
		const readbackJson = JSON.parse(
			await readFile(
				path.join(root, "provider-native-prompt-fixture", "target", "readback.json"),
				"utf8",
			),
		);
		expect(readbackJson).toMatchObject({
			status: "readback_cached",
			responseSummary: "Provider-native fixture accepted the handoff.",
			responseExcerpt: "The target conversation received the compact context.",
		});
	});

	test("provider-native file prompt adapter uploads selected files and submits native file ids", async () => {
		const root = await tempRoot("auracall-handoff-provider-native-file-");
		const selectedPath = path.join(root, "provider-native-file.txt");
		await writeFile(selectedPath, "provider native file fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "provider-native-file-fixture",
			sourceProvider: "gemini",
			sourceRuntimeProfile: "target-gemini",
			sourceRef: "https://gemini.google.com/app/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			targetRef: "https://chatgpt.com/c/provider-native-file-target",
			sourceContext: { messages: [{ role: "user", content: "native file" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "native_file_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-07T13:00:00.000Z",
		});
		const uploadInputs: HandoffProviderNativeUploadInput[] = [];
		const promptInputs: HandoffProviderNativePromptInput[] = [];
		const nativeAdapter = createProviderNativeHandoffTargetAdapter(
			{
				async submit(input) {
					promptInputs.push(input);
					return {
						targetConversationRef: "https://chatgpt.com/c/provider-native-file-target",
						providerMessageId: "provider-native-file-message",
					};
				},
			},
			{
				async upload(input) {
					uploadInputs.push(input);
					return {
						files: [
							{
								sourceManifestItemId: "native_file_selected",
								status: "uploaded",
								providerFileId: "chatgpt-file-native-1",
							},
						],
					};
				},
			},
		);
		await approveHandoffUploadForCli({
			handoffId: "provider-native-file-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});

		const uploadRecovery = await recoverHandoffLive({
			handoffId: "provider-native-file-fixture",
			outputRoot: root,
			generatedAt: "2026-06-07T13:01:00.000Z",
			targetAdapter: nativeAdapter,
		});

		expect(uploadRecovery).toMatchObject({
			recovery: {
				status: "recovered",
				executor: "provider_native_file_prompt_adapter",
				executedAction: "upload",
			},
			afterResumePlan: {
				nextAction: "approve_submit",
			},
		});
		expect(uploadInputs).toEqual([
			expect.objectContaining({
				provider: "chatgpt",
				runtimeProfileId: "target-pro",
				packageDigest: prepared.targetPackage.packageDigest,
				files: [
					expect.objectContaining({
						sourceManifestItemId: "native_file_selected",
						packetPath: "target/selected-files/001-Selected_file-native_file_selected",
						absolutePath: path.join(
							root,
							"provider-native-file-fixture",
							"target",
							"selected-files",
							"001-Selected_file-native_file_selected",
						),
					}),
				],
			}),
		]);
		const uploadJson = JSON.parse(
			await readFile(
				path.join(root, "provider-native-file-fixture", "target", "upload-result.json"),
				"utf8",
			),
		);
		expect(uploadJson).toMatchObject({
			status: "uploaded",
			uploadedFileCount: 1,
			failedFileCount: 0,
			rows: [
				expect.objectContaining({
					sourceManifestItemId: "native_file_selected",
					providerFileId: "chatgpt-file-native-1",
					status: "uploaded",
				}),
			],
			failedRows: [],
		});

		await approveHandoffSubmitForCli({
			handoffId: "provider-native-file-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		const submitRecovery = await recoverHandoffLive({
			handoffId: "provider-native-file-fixture",
			outputRoot: root,
			generatedAt: "2026-06-07T13:02:00.000Z",
			targetAdapter: nativeAdapter,
		});

		expect(promptInputs).toEqual([
			expect.objectContaining({
				uploadedProviderFileIds: ["chatgpt-file-native-1"],
			}),
		]);
		expect(submitRecovery).toMatchObject({
			recovery: {
				status: "recovered",
				executor: "provider_native_file_prompt_adapter",
				executedAction: "submit",
			},
			afterResumePlan: {
				nextAction: "complete",
			},
		});
	});

	test("provider-native file upload failures are recorded and block submit approval", async () => {
		const root = await tempRoot("auracall-handoff-provider-native-file-fail-");
		const selectedPath = path.join(root, "provider-native-file-fail.txt");
		await writeFile(selectedPath, "provider native file failure fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "provider-native-file-fail-fixture",
			sourceProvider: "gemini",
			sourceRuntimeProfile: "target-gemini",
			sourceRef: "https://gemini.google.com/app/source",
			targetProvider: "chatgpt",
			targetRuntimeProfile: "target-pro",
			sourceContext: { messages: [{ role: "user", content: "native file fail" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "native_file_failed", localPath: selectedPath })],
			},
			generatedAt: "2026-06-07T13:10:00.000Z",
		});
		const nativeAdapter = createProviderNativeHandoffTargetAdapter(
			{
				async submit() {
					throw new Error("submit should not run after failed native upload");
				},
			},
			{
				async upload() {
					return {
						files: [
							{
								sourceManifestItemId: "native_file_failed",
								status: "failed",
								error: "target provider rejected the file",
								retryable: true,
							},
						],
					};
				},
			},
		);
		await approveHandoffUploadForCli({
			handoffId: "provider-native-file-fail-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});

		const uploadRecovery = await recoverHandoffLive({
			handoffId: "provider-native-file-fail-fixture",
			outputRoot: root,
			generatedAt: "2026-06-07T13:11:00.000Z",
			targetAdapter: nativeAdapter,
		});

		expect(uploadRecovery).toMatchObject({
			recovery: {
				status: "recovered",
				executor: "provider_native_file_prompt_adapter",
				executedAction: "upload",
			},
			afterResumePlan: {
				nextAction: "upload",
				reasons: ["target upload failed and can be retried without repeating source phases"],
			},
		});
		const uploadJson = JSON.parse(
			await readFile(
				path.join(root, "provider-native-file-fail-fixture", "target", "upload-result.json"),
				"utf8",
			),
		);
		expect(uploadJson).toMatchObject({
			status: "failed",
			uploadedFileCount: 0,
			failedFileCount: 1,
			rows: [],
			failedRows: [
				expect.objectContaining({
					sourceManifestItemId: "native_file_failed",
					status: "failed",
					error: "target provider rejected the file",
					retryable: true,
				}),
			],
		});

		await expect(
			approveHandoffSubmitForCli({
				handoffId: "provider-native-file-fail-fixture",
				outputDir: root,
				packageDigest: prepared.targetPackage.packageDigest,
			}),
		).rejects.toThrow("Target submit approval requires a successful target upload result.");
	});

	test("repairs missing derived handoff readback state", async () => {
		const root = await tempRoot("auracall-handoff-repair-");
		const selectedPath = path.join(root, "repair.txt");
		await writeFile(selectedPath, "repair fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "repair-fixture",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "repair" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "repair_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});
		await approveHandoffUploadForCli({
			handoffId: "repair-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		await uploadHandoffForCli({
			handoffId: "repair-fixture",
			outputDir: root,
		});
		await approveHandoffSubmitForCli({
			handoffId: "repair-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		await submitHandoffForCli({
			handoffId: "repair-fixture",
			outputDir: root,
		});
		await rm(path.join(root, "repair-fixture", "target", "readback.json"), { force: true });

		const repair = await repairHandoffForCli({
			handoffId: "repair-fixture",
			outputDir: root,
		});

		expect(repair.report).toMatchObject({
			object: "auracall.handoff-repair-report.v1",
			status: "repaired",
			repairedRefs: ["target/readback.json"],
			blockers: [],
			resumePlanRef: "target/resume-plan.json",
		});
		expect(repair.resumePlan.nextAction).toBe("complete");
		expect(formatHandoffRepairCliSummary(repair)).toContain("Repair status: repaired");
		const readbackJson = JSON.parse(
			await readFile(path.join(root, "repair-fixture", "target", "readback.json"), "utf8"),
		);
		expect(readbackJson).toMatchObject({
			object: "auracall.handoff-target-readback.v1",
			status: "readback_cached",
			responseSummary: "Repaired cached readback from existing target submission result.",
		});
	});

	test("writes a manual handoff export bundle for operator completion", async () => {
		const root = await tempRoot("auracall-handoff-export-");
		const selectedPath = path.join(root, "export.txt");
		await writeFile(selectedPath, "export fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot: root,
			handoffId: "export-fixture",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "export" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "export_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-05T12:00:00.000Z",
		});
		await approveHandoffUploadForCli({
			handoffId: "export-fixture",
			outputDir: root,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		await uploadHandoffForCli({
			handoffId: "export-fixture",
			outputDir: root,
		});

		const exported = await exportHandoffForCli({
			handoffId: "export-fixture",
			outputDir: root,
		});

		expect(exported.exportBundle).toMatchObject({
			object: "auracall.handoff-manual-export.v1",
			packageDigest: prepared.targetPackage.packageDigest,
			selectedFiles: [expect.objectContaining({ sourceManifestItemId: "export_selected" })],
			uploadedProviderFileIds: [expect.stringMatching(/^handoff-file-[a-f0-9]{32}$/)],
			readbackStatus: "skipped_dry_run",
		});
		expect(exported.exportBundle.primer).toContain("You are receiving a compact");
		expect(formatHandoffExportCliSummary(exported)).toContain(
			"Manual export: target/manual-handoff-export.json",
		);
		const exportJson = JSON.parse(
			await readFile(
				path.join(root, "export-fixture", "target", "manual-handoff-export.json"),
				"utf8",
			),
		);
		expect(exportJson.operatorInstructions).toEqual(
			expect.arrayContaining([
				"Open the target conversation or project for the recorded target endpoint.",
			]),
		);
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

	test("validates analysis decision v2 and rejects invalid selected ids", () => {
		const report = validateHandoffAnalysisDecision({
			generatedAt: "2026-06-05T12:00:00.000Z",
			decision: analysisDecisionFixture({
				selectedManifestItemIds: ["missing"],
			}),
			manifestItems: [manifestItemFixture({ id: "existing" })],
			omissions: [],
			budgets: analysisBudgetsFixture(),
		});

		expect(report.schemaValid).toBe(false);
		expect(report.errors).toContain("selected manifest item does not exist: missing");
	});

	test("validates analysis decision v2 and rejects missing local selected files without omission warning", () => {
		const report = validateHandoffAnalysisDecision({
			generatedAt: "2026-06-05T12:00:00.000Z",
			decision: analysisDecisionFixture({
				selectedManifestItemIds: ["no_local"],
				omissionWarnings: [],
			}),
			manifestItems: [manifestItemFixture({ id: "no_local", localPath: null })],
			omissions: [],
			budgets: analysisBudgetsFixture(),
		});

		expect(report.schemaValid).toBe(false);
		expect(report.errors).toContain(
			"selected manifest item lacks local file and omission warning: no_local",
		);
	});

	test("validates analysis decision v2 and rejects malformed approval recommendation", () => {
		const report = validateHandoffAnalysisDecision({
			generatedAt: "2026-06-05T12:00:00.000Z",
			decision: analysisDecisionFixture({
				approvalRecommendation: "upload_now",
			}),
			manifestItems: [manifestItemFixture({ id: "selected" })],
			omissions: [],
			budgets: analysisBudgetsFixture(),
		});

		expect(report.schemaValid).toBe(false);
		expect(report.errors).toContain("approvalRecommendation is not allowed");
	});

	test("validates analysis decision v2 and rejects budget overflow", () => {
		const report = validateHandoffAnalysisDecision({
			generatedAt: "2026-06-05T12:00:00.000Z",
			decision: analysisDecisionFixture({
				budgetFit: {
					fits: false,
					estimatedPromptTokens: 200,
					selectedFileBytes: 200,
				},
			}),
			manifestItems: [manifestItemFixture({ id: "selected", sizeBytes: 200 })],
			omissions: [],
			budgets: {
				maxPromptTokens: 100,
				maxSelectedFileBytes: 100,
				maxSelectedFiles: 1,
			},
		});

		expect(report.schemaValid).toBe(false);
		expect(report.errors).toEqual(
			expect.arrayContaining([
				"selected file bytes exceed analysis budget",
				"estimated prompt tokens exceed analysis budget",
			]),
		);
	});

	test("validates analysis decision v2 and rejects omission warnings with no matching omission", () => {
		const report = validateHandoffAnalysisDecision({
			generatedAt: "2026-06-05T12:00:00.000Z",
			decision: analysisDecisionFixture({
				omissionWarnings: ["source_omissions_present"],
			}),
			manifestItems: [manifestItemFixture({ id: "selected" })],
			omissions: [],
			budgets: analysisBudgetsFixture(),
		});

		expect(report.schemaValid).toBe(false);
		expect(report.errors).toContain(
			"omission warning has no matching omission or policy limit: source_omissions_present",
		);
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

async function createSelectedFileManifestItems(root: string, count: number): Promise<unknown[]> {
	const items: unknown[] = [];
	for (let index = 0; index < count; index += 1) {
		const ordinal = String(index + 1).padStart(2, "0");
		const body = `file-${ordinal}`;
		const filePath = path.join(root, `source-${ordinal}.txt`);
		await writeFile(filePath, body, "utf8");
		items.push({
			id: `file_${ordinal}`,
			kind: "file",
			title: `Source ${ordinal}.txt`,
			localPath: filePath,
			sizeBytes: body.length,
			checksumSha256: createHash("sha256").update(body).digest("hex"),
			importanceHint: count - index,
		});
	}
	return items;
}

function parseStoredZipEntries(zip: Buffer): Array<{ name: string; content: Buffer }> {
	const entries: Array<{ name: string; content: Buffer }> = [];
	let offset = 0;
	while (offset < zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
		const compressionMethod = zip.readUInt16LE(offset + 8);
		const compressedSize = zip.readUInt32LE(offset + 18);
		const uncompressedSize = zip.readUInt32LE(offset + 22);
		const nameLength = zip.readUInt16LE(offset + 26);
		const extraLength = zip.readUInt16LE(offset + 28);
		const nameStart = offset + 30;
		const contentStart = nameStart + nameLength + extraLength;
		const contentEnd = contentStart + compressedSize;
		if (compressionMethod !== 0 || compressedSize !== uncompressedSize) {
			throw new Error("Expected a deterministic stored ZIP entry.");
		}
		entries.push({
			name: zip.subarray(nameStart, nameStart + nameLength).toString("utf8"),
			content: zip.subarray(contentStart, contentEnd),
		});
		offset = contentEnd;
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name));
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

function fixtureResolvedUserConfig(): ResolvedUserConfig {
	return {
		model: "gpt-5.1-pro",
		browser: {
			target: "chatgpt",
		},
		runtimeProfiles: fixtureConfig().runtimeProfiles,
	} as ResolvedUserConfig;
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

function manifestItemFixture(
	overrides: Partial<{
		id: string;
		localPath: string | null;
		sizeBytes: number | null;
	}> = {},
): {
	id: string;
	kind: "file";
	title: string;
	localPath: string | null;
	archiveItemId: null;
	sourceRef: null;
	mimeType: string;
	sizeBytes: number | null;
	checksumSha256: string;
	materializationMethod: null;
	importanceHint: number;
} {
	return {
		id: overrides.id ?? "selected",
		kind: "file",
		title: "Selected file",
		localPath: Object.hasOwn(overrides, "localPath")
			? (overrides.localPath ?? null)
			: "/tmp/selected.txt",
		archiveItemId: null,
		sourceRef: null,
		mimeType: "text/plain",
		sizeBytes: Object.hasOwn(overrides, "sizeBytes") ? (overrides.sizeBytes ?? null) : 10,
		checksumSha256: "e".repeat(64),
		materializationMethod: null,
		importanceHint: 1,
	};
}

function analysisBudgetsFixture(): {
	maxPromptTokens: number;
	maxSelectedFileBytes: number;
	maxSelectedFiles: number;
} {
	return {
		maxPromptTokens: 32000,
		maxSelectedFileBytes: 50 * 1024 * 1024,
		maxSelectedFiles: 10,
	};
}

function analysisDecisionFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		object: HANDOFF_ANALYSIS_SCHEMA,
		generatedAt: "2026-06-05T12:00:00.000Z",
		decisionSource: "deterministic-dry-run",
		schemaValid: true,
		sourceMaterializationJobIds: [],
		selectedManifestItemIds: ["selected"],
		compactContext: {
			sourceProvider: "chatgpt",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			messageCount: 1,
			materializedItemCount: 1,
			omissionCount: 0,
			summary: "fixture",
		},
		targetPrimer: "Fixture primer",
		omissionWarnings: [],
		budgetFit: {
			fits: true,
			estimatedPromptTokens: 10,
			selectedFileBytes: 10,
		},
		approvalRecommendation: "preview_only",
		...overrides,
	};
}
