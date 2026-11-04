import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, test, vi } from "vitest";
import { NativeDesktopStore } from "../../src/browser/service/nativeDesktopStore.js";

test.each(["", "{", "{}", undefined])("invalid operation ownership is refused without losing custody: %s", async contents => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-invalid-owner-"));
	const key = "invalid-owner";
	const lock = path.join(directory, `lock-${createHash("sha256").update(key).digest("hex")}`);
	await fs.mkdir(lock);
	if (contents !== undefined) await fs.writeFile(path.join(lock, "owner.json"), contents);
	try {
		let executed = false;
		await expect(new NativeDesktopStore(directory).exclusive(key, async () => { executed = true; }))
			.rejects.toThrow("owner record is missing or invalid; preserve the lock and inspect ownership before recovery");
		expect(executed).toBe(false);
		expect(await fs.readdir(directory)).toEqual([path.basename(lock)]);
		if (contents !== undefined) expect(await fs.readFile(path.join(lock, "owner.json"), "utf8")).toBe(contents);
		else expect(await fs.readdir(lock)).toEqual([]);
	} finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("operation owner publication never exposes a partially written owner file", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-owner-publication-"));
	const key = "publication";
	const lock = path.join(directory, `lock-${createHash("sha256").update(key).digest("hex")}`);
	const originalWrite = fs.writeFile.bind(fs);
	let partialOwnerObserved = false;
	let probed = false;
	const spy = vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
		await originalWrite(args[0], "", args[2]);
		probed = true;
		const observed = await fs.readFile(path.join(lock, "owner.json"), "utf8").catch(error => {
			if (error.code !== "ENOENT") throw error;
			return undefined;
		});
		partialOwnerObserved ||= observed === "";
		await originalWrite(args[0], args[1], { mode: 0o600 });
	});
	try {
		await new NativeDesktopStore(directory).exclusive(key, async () => {
			const owner = JSON.parse(await fs.readFile(path.join(lock, "owner.json"), "utf8"));
			expect(owner.pid).toBe(process.pid);
			expect(await fs.readdir(lock)).toEqual(["owner.json"]);
		});
		expect(probed).toBe(true);
		expect(partialOwnerObserved).toBe(false);
	} finally {
		spy.mockRestore();
		await fs.rm(directory, { recursive: true, force: true });
	}
});

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
