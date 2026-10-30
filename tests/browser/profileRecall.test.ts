import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
	inspectProfileRecall,
	stopProfileForRecall,
} from "../../src/browser/service/profileRecall.js";

test("Recall stops only the exact profile holder and refuses a stale confirmation", async () => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-recall-"));
	const directory = path.join(home, "managed");
	await fs.mkdir(directory);
	await fs.writeFile(path.join(directory, "profile-data"), "preserve");
	const child = spawn(
		process.execPath,
		["-e", "setInterval(()=>{},1000)", "--", `--user-data-dir=${directory}`],
		{ stdio: "ignore" },
	);
	const other = spawn(
		process.execPath,
		["-e", "setInterval(()=>{},1000)", "--", `--user-data-dir=${directory}-other`],
		{ stdio: "ignore" },
	);
	let conflict: typeof child | undefined;
	try {
		await once(child, "spawn");
		const holder = await inspectProfileRecall(directory, process.execPath);
		expect(holder?.token).toMatch(/^[a-f0-9]{64}$/);
		if (!holder) throw new Error("Fixture holder missing");
		await expect(stopProfileForRecall(directory, process.execPath, "0".repeat(64))).rejects.toThrow(
			"changed",
		);
		expect(child.exitCode).toBeNull();
		conflict = spawn(
			process.execPath,
			["-e", "setInterval(()=>{},1000)", "--", `--user-data-dir=${directory}`],
			{ stdio: "ignore" },
		);
		await once(conflict, "spawn");
		expect(await inspectProfileRecall(directory, process.execPath)).toBeUndefined();
		await expect(stopProfileForRecall(directory, process.execPath, holder.token)).rejects.toThrow(
			"changed",
		);
		const conflictExit = once(conflict, "exit");
		conflict.kill();
		await conflictExit;
		await stopProfileForRecall(directory, process.execPath, holder.token);
		expect(await inspectProfileRecall(directory, process.execPath)).toBeUndefined();
		expect(other.exitCode).toBeNull();
		expect(await fs.readFile(path.join(directory, "profile-data"), "utf8")).toBe("preserve");
		await expect(stopProfileForRecall(directory, process.execPath, holder.token)).rejects.toThrow(
			"changed",
		);
	} finally {
		await Promise.all(
			[child, other, conflict].map(async (candidate) => {
				if (!candidate || candidate.exitCode !== null || candidate.signalCode !== null) return;
				const exited = once(candidate, "exit");
				candidate.kill();
				await exited;
			}),
		);
		await fs.rm(home, { recursive: true, force: true });
	}
});
