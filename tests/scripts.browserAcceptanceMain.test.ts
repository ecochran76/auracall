import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	runChatgptAcceptanceMain,
	type ChatgptAcceptanceMainAdapter,
} from "../scripts/chatgpt-acceptance.js";
import {
	runGrokAcceptanceMain,
	type GrokAcceptanceMainAdapter,
} from "../scripts/grok-acceptance.js";

const ownedTempDirs: string[] = [];

async function createOwnedTempDir(): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), "auracall-acceptance-main-test-"));
	ownedTempDirs.push(directory);
	return directory;
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

function resumedChatgptSummary() {
	return {
		ok: false,
		phase: "project" as const,
		profile: "resume-profile",
		model: "resume-model",
		thinkingTime: "resume-thinking",
		suffix: "resumeaa",
		tempDir: "/stale/temp",
		projectId: "resume-project",
		projectConversationId: "resume-project-conversation",
		conversationId: "resume-conversation",
		projectName: "Resume Project",
		renamedProjectName: "Resume Renamed Project",
		renamedProjectConversationName: "Resume Project Conversation",
		renamedConversationName: "Resume Conversation",
		sourceFileName: "resume-source.md",
		attachmentFileName: "resume-attachment.txt",
	};
}

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(
		ownedTempDirs.splice(0).map((directory) =>
			rm(directory, { recursive: true, force: true }),
		),
	);
});

describe("ChatGPT acceptance main", () => {
	it("uses explicit CLI identity over resume state and orders PASS evidence before full-run cleanup", async () => {
		const directory = await createOwnedTempDir();
		const resumePath = path.join(directory, "resume.json");
		const statePath = path.join(directory, "state.json");
		await writeFile(
			resumePath,
			`${JSON.stringify({
				version: 1,
				updatedAt: "2026-08-15T20:00:00.000Z",
				lastError: "prior failure",
				summary: resumedChatgptSummary(),
			})}\n`,
			"utf8",
		);

		const events: string[] = [];
		let observedArgs: Record<string, unknown> | null = null;
		const execute = vi.fn<NonNullable<ChatgptAcceptanceMainAdapter["execute"]>>(
			async ({ args }) => {
				observedArgs = { ...args };
				const checkpoint = await readJson(statePath);
				const summary = checkpoint.summary as { ok?: boolean };
				expect(checkpoint.lastError).toBeNull();
				expect(summary.ok).toBe(false);
				events.push("execute-after-initial-checkpoint");
			},
		);
		const cleanupMutation = vi.fn<
			NonNullable<ChatgptAcceptanceMainAdapter["cleanupMutation"]>
		>(async () => {
			const finalState = await readJson(statePath);
			const summary = finalState.summary as { ok?: boolean };
			expect(finalState.lastError).toBeNull();
			expect(summary.ok).toBe(true);
			events.push("cleanup-after-final-evidence");
			return { status: 0, stdout: "", stderr: "", combined: "" };
		});
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

		const summary = await runChatgptAcceptanceMain(
			[
				"--profile",
				"cli-profile",
				"--phase",
				"full",
				"--project-id",
				"cli-project",
				"--conversation-id",
				"cli-conversation",
				"--state-file",
				statePath,
				"--resume",
				resumePath,
				"--json",
			],
			{ execute, cleanupMutation },
		);

		expect(observedArgs).toMatchObject({
			profile: "cli-profile",
			phase: "full",
			projectId: "cli-project",
			conversationId: "cli-conversation",
			stateFile: statePath,
			resumeFile: resumePath,
		});
		expect(summary).toMatchObject({
			ok: true,
			profile: "cli-profile",
			projectId: "cli-project",
			projectConversationId: "resume-project-conversation",
			conversationId: "cli-conversation",
		});
		expect(events).toEqual([
			"execute-after-initial-checkpoint",
			"cleanup-after-final-evidence",
			"cleanup-after-final-evidence",
			"cleanup-after-final-evidence",
		]);
		expect(cleanupMutation.mock.calls.map((call) => call[1])).toEqual([
			[
				"delete",
				"resume-project-conversation",
				"--target",
				"chatgpt",
				"--project-id",
				"cli-project",
				"--yes",
			],
			["delete", "cli-conversation", "--target", "chatgpt", "--yes"],
			["projects", "remove", "cli-project", "--target", "chatgpt"],
		]);
		expect(consoleLog).toHaveBeenCalledWith(
			JSON.stringify(summary, null, 2),
		);
	});

	it("records FAIL evidence before full-run best-effort cleanup and rethrows the exact error", async () => {
		const directory = await createOwnedTempDir();
		const statePath = path.join(directory, "failure-state.json");
		const failure = new Error("provider workflow failed");
		const events: string[] = [];
		const cleanupMutation = vi.fn<
			NonNullable<ChatgptAcceptanceMainAdapter["cleanupMutation"]>
		>(async () => {
			const state = await readJson(statePath);
			const summary = state.summary as { ok?: boolean };
			expect(state.lastError).toBe("provider workflow failed");
			expect(summary.ok).toBe(false);
			events.push("cleanup-after-failure-evidence");
			return { status: 0, stdout: "", stderr: "", combined: "" };
		});
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		await expect(
			runChatgptAcceptanceMain(
				["--phase", "full", "--state-file", statePath],
				{
					execute: async ({ summary }) => {
						summary.projectId = "failed-project";
						throw failure;
					},
					cleanupMutation,
				},
			),
		).rejects.toBe(failure);

		expect(events).toEqual(["cleanup-after-failure-evidence"]);
		expect(cleanupMutation).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalledWith(
			"[chatgpt-acceptance] FAIL: provider workflow failed",
		);
	});
});

describe("Grok acceptance main", () => {
	it("presents PASS evidence and removes disposable projects unless keep-projects is explicit", async () => {
		const runCleanupCommand = vi.fn<
			NonNullable<GrokAcceptanceMainAdapter["runCleanupCommand"]>
		>((_args, extra) => ({
			status: 0,
			stdout: extra[0] === "projects" && extra[1] === "--target" ? "[]" : "",
			stderr: "",
			combined: "",
		}));
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

		const summary = await runGrokAcceptanceMain(["--json"], {
			execute: async ({ summary: current }) => {
				current.projectId = "grok-project";
				current.cloneId = "grok-clone";
			},
			runCleanupCommand,
		});

		expect(summary.ok).toBe(true);
		expect(runCleanupCommand.mock.calls.map((call) => call[1])).toEqual([
			["projects", "remove", "grok-clone", "--target", "grok"],
			["projects", "remove", "grok-project", "--target", "grok"],
			["projects", "--target", "grok", "--refresh"],
		]);
		expect(consoleLog).toHaveBeenCalledWith(JSON.stringify(summary, null, 2));
		await expect(access(summary.tempDir)).rejects.toThrow();

		runCleanupCommand.mockClear();
		const kept = await runGrokAcceptanceMain(["--keep-projects"], {
			execute: async ({ summary: current }) => {
				current.projectId = "kept-project";
				current.cloneId = "kept-clone";
			},
			runCleanupCommand,
		});
		expect(kept.ok).toBe(true);
		expect(runCleanupCommand).not.toHaveBeenCalled();
		await expect(access(kept.tempDir)).rejects.toThrow();
	});

	it("reports FAIL, removes the temporary workspace, and leaves provider cleanup untouched", async () => {
		const failure = new Error("grok workflow failed");
		let tempDir = "";
		const runCleanupCommand = vi.fn<
			NonNullable<GrokAcceptanceMainAdapter["runCleanupCommand"]>
		>();
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		await expect(
			runGrokAcceptanceMain([], {
				execute: async ({ summary }) => {
					tempDir = summary.tempDir;
					summary.projectId = "failed-project";
					throw failure;
				},
				runCleanupCommand,
			}),
		).rejects.toBe(failure);

		expect(runCleanupCommand).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith(
			"[grok-acceptance] FAIL: grok workflow failed",
		);
		await expect(access(tempDir)).rejects.toThrow();
	});
});
