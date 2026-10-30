import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { DesktopControlGate } from "../../src/browser/service/desktopControlGate.js";

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

async function fixture() {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-capture-deadline-"));
	vi.stubEnv("AURACALL_HOME_DIR", home);
	const directory = path.join(home, "diagnostics", "desktop-control");
	await fs.mkdir(directory, { recursive: true, mode: 0o700 });
	await fs.writeFile(path.join(directory, "enabled"), "1", { mode: 0o600 });
	const gate = new DesktopControlGate("fixture", path.join(home, "gate"));
	const held = await gate.takeControl("binding");
	return { home, directory, gate, held };
}

test.skipIf(process.platform !== "linux")("a stalled diagnostic write cannot delay the original human refusal past 100 ms", async () => {
	const { home, gate, held } = await fixture();
	const writeFile = fs.writeFile.bind(fs);
	let entered!: () => void;
	const writing = new Promise<void>((resolve) => { entered = resolve; });
	let failWrite!: (error: Error) => void;
	const blocked = new Promise<void>((_resolve, reject) => { failWrite = reject; });
	const spy = vi.spyOn(fs, "writeFile").mockImplementation((...args) => {
		if (String(args[0]).includes("DEBUG-desktop-control-busy-")) {
			entered();
			return blocked;
		}
		return writeFile(...args);
	});
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	const effect = vi.fn();
	let settled = false;
	const result = gate.withAutomation("binding", effect).catch((error: unknown) => { settled = true; return error; });
	try {
		await writing;
		await vi.advanceTimersByTimeAsync(99);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toBe(true);
		expect(await result).toMatchObject({ message: "AuraCall automation is paused while a human controls this desktop." });
		expect(effect).not.toHaveBeenCalled();
		await gate.assertControl(held.token, "binding");
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		failWrite(new Error("late diagnostic failure"));
		await result;
		spy.mockRestore();
		vi.useRealTimers();
		await gate.releaseControl(held.token, "binding");
		await fs.rm(home, { recursive: true, force: true });
	}
});

test.skipIf(process.platform !== "linux")("a stalled opt-in lookup preserves the original admission error and cannot extend the capture budget", async () => {
	const { home, gate, held } = await fixture();
	const originalError = new Error("fixture admission storage unavailable");
	const readFile = fs.readFile.bind(fs);
	const readSpy = vi.spyOn(fs, "readFile").mockImplementation((...args) => {
		if (String(args[0]).endsWith("/owner.json")) return Promise.reject(originalError);
		return readFile(...args);
	});
	const lstat = fs.lstat.bind(fs);
	let entered!: () => void;
	const looking = new Promise<void>((resolve) => { entered = resolve; });
	let failLookup!: (error: Error) => void;
	const blocked = new Promise<Awaited<ReturnType<typeof fs.lstat>>>((_resolve, reject) => { failLookup = reject; });
	const statSpy = vi.spyOn(fs, "lstat").mockImplementation((...args) => {
		if (String(args[0]).endsWith("/enabled")) { entered(); return blocked; }
		return lstat(...args);
	});
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	const effect = vi.fn();
	let settled = false;
	const result = gate.withAutomation("binding", effect, { abortSignal: new AbortController().signal })
		.catch((error: unknown) => { settled = true; return error; });
	try {
		await looking;
		await vi.advanceTimersByTimeAsync(100);
		expect(settled).toBe(true);
		expect(await result).toBe(originalError);
		expect(effect).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
		readSpy.mockRestore();
		await gate.assertControl(held.token, "binding");
	} finally {
		failLookup(new Error("late marker lookup failure"));
		await result;
		readSpy.mockRestore();
		statSpy.mockRestore();
		vi.useRealTimers();
		await gate.releaseControl(held.token, "binding");
		await fs.rm(home, { recursive: true, force: true });
	}
});
