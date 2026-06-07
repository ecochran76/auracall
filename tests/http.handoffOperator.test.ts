import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { createResponsesHttpServer } from "../src/http/responsesServer.js";
import {
	approveHandoffTargetUpload,
	prepareCrossServiceHandoffPacket,
	uploadHandoffTargetPackage,
} from "../src/handoff/service.js";

describe("http handoff operator API", () => {
	const cleanup: string[] = [];

	afterEach(async () => {
		setAuracallHomeDirOverrideForTest(null);
		await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
	});

	it("reads handoff status and writes resume/repair/export operator artifacts", async () => {
		const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-http-handoff-"));
		cleanup.push(homeDir);
		setAuracallHomeDirOverrideForTest(homeDir);
		const outputRoot = path.join(homeDir, "handoffs");
		const selectedPath = path.join(homeDir, "selected.txt");
		await fs.writeFile(selectedPath, "selected fixture", "utf8");
		const prepared = await prepareCrossServiceHandoffPacket({
			config: fixtureConfig(),
			outputRoot,
			handoffId: "http-handoff-fixture",
			sourceProvider: "chatgpt",
			sourceRuntimeProfile: "source-business",
			sourceRef: "https://chatgpt.com/c/source",
			targetProvider: "gemini",
			targetRuntimeProfile: "target-gemini",
			sourceContext: { messages: [{ role: "user", content: "handoff" }] },
			sourceManifest: {
				items: [manifestItemFixture({ id: "http_selected", localPath: selectedPath })],
			},
			generatedAt: "2026-06-07T12:00:00.000Z",
		});
		await approveHandoffTargetUpload({
			handoffId: prepared.run.id,
			outputRoot,
			packageDigest: prepared.targetPackage.packageDigest,
		});
		await uploadHandoffTargetPackage({
			handoffId: prepared.run.id,
			outputRoot,
		});
		const server = await createResponsesHttpServer({ host: "127.0.0.1", port: 0 });

		try {
			const rootStatusResponse = await fetch(`http://127.0.0.1:${server.port}/status`);
			expect(rootStatusResponse.status).toBe(200);
			const rootStatus = (await rootStatusResponse.json()) as {
				routes: Record<string, string>;
			};
			expect(rootStatus.routes.handoffStatusTemplate).toContain("/v1/handoffs/");
			expect(rootStatus.routes.handoffExportTemplate).toContain("/v1/handoffs/");

			const base = `http://127.0.0.1:${server.port}/v1/handoffs/${encodeURIComponent(prepared.run.id)}`;
			const statusResponse = await fetch(
				`${base}/status?outputDir=${encodeURIComponent(outputRoot)}`,
			);
			expect(statusResponse.status).toBe(200);
			const status = (await statusResponse.json()) as Record<string, unknown>;
			expect(status).toMatchObject({
				object: "auracall.handoff.status.result",
				target: {
					uploadStatus: "uploaded",
					submitStatus: "upload_completed",
				},
			});

			const resumeResponse = await postJson(`${base}/resume`, { outputDir: outputRoot });
			expect(resumeResponse).toMatchObject({
				object: "auracall.handoff.resume.result",
				resumePlan: {
					object: "auracall.handoff-resume-plan.v1",
					nextAction: "approve_submit",
				},
			});

			await fs.rm(path.join(prepared.packetPath, "target", "readback.json"), { force: true });
			const repairResponse = await postJson(`${base}/repair`, { outputDir: outputRoot });
			expect(repairResponse).toMatchObject({
				object: "auracall.handoff.repair.result",
				report: {
					object: "auracall.handoff-repair-report.v1",
					status: "repaired",
					repairedRefs: ["target/readback.json"],
				},
			});

			const exportResponse = await postJson(`${base}/export`, { outputDir: outputRoot });
			expect(exportResponse).toMatchObject({
				object: "auracall.handoff.export.result",
				exportBundle: {
					object: "auracall.handoff-manual-export.v1",
					selectedFiles: [expect.objectContaining({ sourceManifestItemId: "http_selected" })],
					uploadedProviderFileIds: [expect.stringMatching(/^handoff-file-[a-f0-9]{32}$/)],
				},
			});
			const exportJson = JSON.parse(
				await fs.readFile(
					path.join(prepared.packetPath, "target", "manual-handoff-export.json"),
					"utf8",
				),
			);
			expect(exportJson.object).toBe("auracall.handoff-manual-export.v1");
		} finally {
			await server.close();
		}
	});

	it("returns 404 for missing handoff packets", async () => {
		const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-http-handoff-missing-"));
		cleanup.push(homeDir);
		setAuracallHomeDirOverrideForTest(homeDir);
		const server = await createResponsesHttpServer({ host: "127.0.0.1", port: 0 });

		try {
			const response = await fetch(
				`http://127.0.0.1:${server.port}/v1/handoffs/missing/status?outputDir=${encodeURIComponent(homeDir)}`,
			);
			expect(response.status).toBe(404);
			const payload = (await response.json()) as Record<string, { message?: string }>;
			expect(payload.error?.message).toContain("missing");
		} finally {
			await server.close();
		}
	});
});

async function postJson(url: string, payload: unknown): Promise<Record<string, unknown>> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	expect(response.status).toBe(200);
	return (await response.json()) as Record<string, unknown>;
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

function manifestItemFixture(
	overrides: Partial<{
		id: string;
		localPath: string | null;
	}> = {},
): {
	id: string;
	kind: "file";
	title: string;
	localPath: string | null;
	archiveItemId: null;
	sourceRef: null;
	mimeType: string;
	sizeBytes: number;
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
		sizeBytes: 10,
		checksumSha256: "e".repeat(64),
		materializationMethod: null,
		importanceHint: 1,
	};
}
