import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("profile identity smoke lifecycle", () => {
	test("hooks the completed identity report to the bounded browser-probe exit boundary", async () => {
		const source = await fs.readFile(path.resolve("bin/auracall.ts"), "utf8");
		const start = source.indexOf(".command('identity-smoke')");
		const end = source.indexOf("const configCommand = program", start);
		const action = source.slice(start, end);

		expect(start).toBeGreaterThanOrEqual(0);
		expect(end).toBeGreaterThan(start);
		expect(action).toContain("withBrowserProbeOperation");
		expect(action.match(/exitAfterCompletedBrowserProbeCommand\(\)/g)).toHaveLength(2);
	});

	test("exits despite a retained non-critical handle after completed output", async () => {
		const fixture = path.resolve("tests/fixtures/completedBrowserProbeExit.fixture.ts");
		const child = spawn(process.execPath, ["--import", "tsx", fixture], {
			cwd: process.cwd(),
			env: { ...process.env },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		const result = await Promise.race([
			new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
				child.once("exit", (code, signal) => resolve({ code, signal }));
			}),
			new Promise<never>((_, reject) => {
				const timer = setTimeout(() => {
					child.kill("SIGKILL");
					reject(new Error("browser probe exit fixture retained its event-loop handle"));
				}, 2_000);
				timer.unref();
			}),
		]);

		expect(stderr).toBe("");
		expect(stdout).toContain("PROFILE_IDENTITY_SMOKE_COMPLETE");
		expect(result).toEqual({ code: 0, signal: null });
	});
});
