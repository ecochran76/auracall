import { describe, expect, it, vi } from "vitest";
import {
	createBrowserAcceptanceHarness,
	readAcceptanceResume,
	type BrowserAcceptanceHarnessDeps,
} from "../scripts/lib/browserAcceptanceHarness.js";

describe("browser acceptance harness", () => {
	it("runs an AuraCall command and preserves operator evidence and output ordering", () => {
		const spawn = vi.fn<NonNullable<BrowserAcceptanceHarnessDeps["spawn"]>>(
			() => ({
				status: 0,
				stdout: "stdout evidence\n",
				stderr: "stderr evidence\n",
			}),
		);
		const log = vi.fn();
		const harness = createBrowserAcceptanceHarness({
			rootDir: "/workspace/auracall",
			profile: "wsl-chrome-3",
			commandTimeoutMs: 180_000,
			log,
			deps: { spawn },
		});

		const result = harness.run(["projects", "--target", "chatgpt"]);

		expect(result).toEqual({
			status: 0,
			stdout: "stdout evidence\n",
			stderr: "stderr evidence\n",
			combined: "stdout evidence\n\nstderr evidence",
		});
		expect(log).toHaveBeenCalledWith(
			"$ pnpm tsx bin/auracall.ts --profile wsl-chrome-3 projects --target chatgpt",
		);
		expect(spawn).toHaveBeenCalledWith(
			"pnpm",
			[
				"tsx",
				"bin/auracall.ts",
				"--profile",
				"wsl-chrome-3",
				"projects",
				"--target",
				"chatgpt",
			],
				expect.objectContaining({
					cwd: "/workspace/auracall",
					encoding: "utf8",
					timeout: 180_000,
					maxBuffer: 20 * 1024 * 1024,
					env: expect.any(Object),
				}),
		);
		const spawnEnvironment = spawn.mock.calls[0]?.[2]?.env;
		const oracleNoBannerEnvironmentName = "ORACLE_NO_BANNER";
		const nodeNoWarningsEnvironmentName = "NODE_NO_WARNINGS";
		expect(spawnEnvironment?.[oracleNoBannerEnvironmentName]).toBe("1");
		expect(spawnEnvironment?.[nodeNoWarningsEnvironmentName]).toBe("1");
	});

	it("enforces success failure and any exit contracts with exact diagnostics", () => {
		const spawn = vi
			.fn()
			.mockReturnValueOnce({ status: 2, stdout: "", stderr: "bad command" })
			.mockReturnValueOnce({ status: 0, stdout: "unexpected success", stderr: "" })
			.mockReturnValueOnce({ status: 3, stdout: "probe output", stderr: "probe error" });
		const harness = createBrowserAcceptanceHarness({
			rootDir: "/workspace/auracall",
			commandTimeoutMs: 60_000,
			log: vi.fn(),
			deps: { spawn },
		});

		expect(() => harness.run(["projects"])).toThrow(
			"Command failed (2): pnpm tsx bin/auracall.ts projects\nbad command",
		);
		expect(() => harness.run(["projects"], { expect: "failure" })).toThrow(
			"Expected failure but command succeeded: pnpm tsx bin/auracall.ts projects",
		);
		expect(harness.run(["projects"], { expect: "any", timeoutMs: 12_000 })).toEqual({
			status: 3,
			stdout: "probe output",
			stderr: "probe error",
			combined: "probe output\nprobe error",
		});
		expect(spawn.mock.calls[2]?.[2]).toMatchObject({ timeout: 12_000 });

		const spawnError = new Error("spawn ETIMEDOUT");
		spawn.mockReturnValueOnce({ error: spawnError, status: null, stdout: "", stderr: "" });
		try {
			harness.run(["projects"]);
			throw new Error("Expected the injected spawn error.");
		} catch (error) {
			expect(error).toBe(spawnError);
		}
	});

	it("keeps probe-style any-exit commands silent when requested", () => {
		const log = vi.fn();
		const harness = createBrowserAcceptanceHarness({
			rootDir: "/workspace/auracall",
			commandTimeoutMs: 60_000,
			log,
			deps: {
				spawn: vi.fn(() => ({ status: 1, stdout: "", stderr: "probe miss" })),
			},
		});

		expect(harness.run(["probe"], { expect: "any", log: false }).status).toBe(1);
		expect(log).not.toHaveBeenCalled();
	});

	it("parses JSON with exact empty and malformed diagnostics", () => {
		const harness = createBrowserAcceptanceHarness({
			rootDir: "/workspace/auracall",
			commandTimeoutMs: 60_000,
			log: vi.fn(),
			deps: { spawn: vi.fn() },
		});

		expect(harness.parseJson<{ ok: boolean }>("project list", '{"ok":true}')).toEqual({
			ok: true,
		});
		expect(() => harness.parseJson("project list", "  ")).toThrow(
			"project list returned empty output.",
		);
		expect(() => harness.parseJson("project list", "not-json")).toThrow(
			/project list did not return valid JSON\.\nnot-json\n/,
		);
	});

	it("reads and checkpoints optional version-one state through local substitutions", async () => {
		const readTextFile = vi.fn(async () =>
			JSON.stringify({
				version: 1,
				updatedAt: "2026-08-15T22:00:00.000Z",
				lastError: "prior failure",
				summary: { ok: false, profile: "default", projectId: "project-1" },
			}),
		);
		const resume = await readAcceptanceResume<{
			ok: boolean;
			profile: string;
			projectId: string;
		}>("/workspace/auracall", "tmp/acceptance-state.json", { readTextFile });

		expect(resume).toEqual({
			path: "/workspace/auracall/tmp/acceptance-state.json",
			state: {
				version: 1,
				updatedAt: "2026-08-15T22:00:00.000Z",
				lastError: "prior failure",
				summary: { ok: false, profile: "default", projectId: "project-1" },
			},
		});
		await expect(
			readAcceptanceResume("/workspace/auracall", "tmp/invalid.json", {
				readTextFile: async () => "not-json",
			}),
		).resolves.toBeNull();
		await expect(
			readAcceptanceResume("/workspace/auracall", "tmp/missing.json", {
				readTextFile: async () => {
					throw new Error("ENOENT");
				},
			}),
		).resolves.toBeNull();

		const ensureDir = vi.fn(async () => undefined);
		const writeTextFile = vi.fn(async () => undefined);
		const summary = { ok: false, profile: "default", projectId: "project-2" };
		const harness = createBrowserAcceptanceHarness({
			rootDir: "/workspace/auracall",
			commandTimeoutMs: 60_000,
			stateFile: "tmp/acceptance-state.json",
			log: vi.fn(),
			deps: {
				spawn: vi.fn(),
				ensureDir,
				writeTextFile,
				now: () => new Date("2026-08-15T22:01:00.000Z"),
			},
		});
		await harness.checkpoint(summary, new Error("current failure"));

		expect(ensureDir).toHaveBeenCalledWith("/workspace/auracall/tmp");
		expect(writeTextFile).toHaveBeenCalledWith(
			"/workspace/auracall/tmp/acceptance-state.json",
			`${JSON.stringify(
				{
					version: 1,
					updatedAt: "2026-08-15T22:01:00.000Z",
					lastError: "current failure",
					summary,
				},
				null,
				2,
			)}\n`,
		);
		expect(summary).toEqual({ ok: false, profile: "default", projectId: "project-2" });
	});

	it("checkpoints before assembling final evidence JSON without changing provider fields", async () => {
		const events: string[] = [];
		const summary = { ok: false, providerField: "provider-owned" };
		const harness = createBrowserAcceptanceHarness({
			rootDir: "/workspace/auracall",
			commandTimeoutMs: 60_000,
			stateFile: "/tmp/final-state.json",
			log: vi.fn(),
			deps: {
				spawn: vi.fn(),
				ensureDir: async () => {
					events.push("ensure-dir");
				},
				writeTextFile: async () => {
					events.push("checkpoint");
				},
				now: () => new Date("2026-08-15T22:02:00.000Z"),
			},
		});

		const evidence = await harness.finalize(summary, "provider failure");
		events.push("observed-evidence");

		expect(events).toEqual(["ensure-dir", "checkpoint", "observed-evidence"]);
		expect(evidence).toEqual({
			summary,
			json: JSON.stringify(summary, null, 2),
			errorMessage: "provider failure",
			statePath: "/tmp/final-state.json",
		});
		expect(summary).toEqual({ ok: false, providerField: "provider-owned" });
	});
});
