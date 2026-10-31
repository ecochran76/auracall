import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, test, vi } from "vitest";
import { NativeDesktopStore } from "../../src/browser/service/nativeDesktopStore.js";

test("a fresh process reconciles a pool lock only after the original owner is proven absent", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-pool-restart-"));
	const modulePath = path.resolve("src/browser/service/nativeDesktopStore.ts");
	const child = spawn(
		process.execPath,
		[
			"--import",
			"tsx",
			"--input-type=module",
			"-e",
			`import {NativeDesktopStore} from ${JSON.stringify(modulePath)};const store=new NativeDesktopStore(${JSON.stringify(directory)});await store.exclusive('pool-restart',async()=>{process.stdout.write('held');await new Promise(()=>{setInterval(()=>{},1000)});});`,
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	try {
		if (!child.stdout) throw new Error("Fixture stdout unavailable.");
		await once(child.stdout, "data");
		const store = new NativeDesktopStore(directory);
		const refusal = await store.exclusive("pool-restart", async () => true).catch(error => error);
		expect(refusal).toBeInstanceOf(Error);
		expect(refusal.message).toContain("original owner is still present");
		const details = JSON.parse(refusal.message.split(" Diagnostics: ")[1]);
		expect(details).toMatchObject({ ownerPid: child.pid, pidPresent: true, generationMatch: true });
		expect(Number.isFinite(Date.parse(details.acquiredAt))).toBe(true);
		expect(details.observedProcessStart).toMatch(/^\d+$/);
		expect(details.observedBootId).toMatch(/^[a-f0-9-]+$/);
		expect(Object.keys(details).sort()).toEqual([
			"acquiredAt", "generationMatch", "observedBootId", "observedProcessStart", "ownerPid", "pidPresent",
		]);
		// Refusal must leave the original owner in control.
		await expect(store.exclusive("pool-restart", async () => true)).rejects.toThrow("busy");
		const exited = once(child, "exit");
		child.kill("SIGTERM");
		await exited;
		await expect(store.exclusive("pool-restart", async () => true)).resolves.toBe(true);
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			const done = once(child, "exit");
			child.kill();
			await done;
		}
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test("dead automation releases its local gate while human custody remains protected", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-gate-restart-"));
	const modulePath = path.resolve("src/browser/service/desktopControlGate.ts");
	const child = spawn(
		process.execPath,
		[
			"--import",
			"tsx",
			"--input-type=module",
			"-e",
			`import {DesktopControlGate} from ${JSON.stringify(modulePath)};await new DesktopControlGate('display',${JSON.stringify(directory)}).withAutomation('pool-idle-release',async()=>{process.stdout.write('held');await new Promise(()=>{setInterval(()=>{},1000)});});`,
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	try {
		if (!child.stdout) throw new Error("Fixture stdout unavailable.");
		await once(child.stdout, "data");
		const { DesktopControlGate } = await import("../../src/browser/service/desktopControlGate.js");
		const gate = new DesktopControlGate("display", directory);
		const exited = once(child, "exit");
		child.kill();
		await exited;
		await expect(gate.withAutomation("next", async () => true)).resolves.toBe(true);
		const human = await gate.takeControl("browser");
		await expect(gate.withAutomation("next", async () => true)).rejects.toThrow("human");
		await gate.releaseControl(human.token, "browser");
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			const done = once(child, "exit");
			child.kill();
			await done;
		}
		await fs.rm(directory, { recursive: true, force: true });
	}
});

// Historical custody may lack generation fields; observations are not recovery authority.
test.each(["legacy", "mismatch", "unreadable", "stalled"])("busy diagnostics preserve %s owner custody", async mode => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-lock-diagnostics-"));
	const key = "private-operation-key";
	const lock = path.join(directory, `lock-${createHash("sha256").update(key).digest("hex")}`);
	const owner = {
		id: randomUUID(), pid: process.pid,
		...(mode === "legacy" ? {} : { processStart: "0", bootId: randomUUID(), acquiredAt: new Date().toISOString() }),
	};
	await fs.mkdir(lock);
	const serialized = JSON.stringify(owner);
	await fs.writeFile(path.join(lock, "owner.json"), serialized);
	const readFile = fs.readFile.bind(fs);
	const spy = ["unreadable", "stalled"].includes(mode) ? vi.spyOn(fs, "readFile").mockImplementation(((...args: Parameters<typeof fs.readFile>) => {
		if (mode === "stalled" && String(args[0]).startsWith("/proc/")) return new Promise(() => {});
		if (String(args[0]).startsWith("/proc/")) return Promise.reject(Object.assign(new Error("private diagnostic failure"), { code: "EACCES" }));
		return readFile(...args);
	}) as typeof fs.readFile) : undefined;
	try {
		let executed = false;
		const error = await new NativeDesktopStore(directory).exclusive(key, async () => { executed = true; }).catch(error => error);
		expect(executed).toBe(false);
		expect(error).toBeInstanceOf(Error);
		const details = JSON.parse(error.message.split(" Diagnostics: ")[1]);
		expect(details.generationMatch).toBe(mode === "mismatch" ? false : null);
		expect(error.message).not.toContain(owner.id);
		expect(error.message).not.toContain(key);
		expect(error.message).not.toContain("private diagnostic failure");
		expect(await fs.readFile(path.join(lock, "owner.json"), "utf8")).toBe(serialized);
	} finally {
		spy?.mockRestore();
		await fs.rm(directory, { recursive: true, force: true });
	}
});
