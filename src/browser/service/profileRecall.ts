import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
function ownsDirectory(command: string, directory: string): boolean {
	const args = command.split("\0").filter(Boolean);
	if (args.some((arg) => arg.startsWith("--type=")) || /(?:^| )--type=/.test(args[0] ?? ""))
		return false;
	if (args.includes(`--user-data-dir=${directory}`)) return true;
	const escaped = directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return (
		args.length === 1 &&
		new RegExp(`(?:^| )--user-data-dir=${escaped}(?= (?:--|https?://|about:)|$)`).test(
			args[0] ?? "",
		)
	);
}
async function identity(pid: number, directory: string, executable: string) {
	const [stat, command, exe, owner, boot] = await Promise.all([
		fs.readFile(`/proc/${pid}/stat`, "utf8"),
		fs.readFile(`/proc/${pid}/cmdline`, "utf8"),
		fs.realpath(`/proc/${pid}/exe`),
		fs.stat(`/proc/${pid}`),
		fs.readFile("/proc/sys/kernel/random/boot_id", "utf8"),
	]);
	const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
	if (
		!fields[19] ||
		fields[0] === "Z" ||
		owner.uid !== process.getuid?.() ||
		exe !== executable ||
		!ownsDirectory(command, directory)
	)
		return;
	return { pid, start: fields[19], boot: boot.trim(), executable: exe, directory };
}
/** Inspection grants no authority: the operator confirms this exact holder before Recall. */
export async function inspectProfileRecall(directory: string, chromePath: string) {
	if (process.platform !== "linux") return;
	const executable = await fs.realpath(chromePath);
	const canonical = await fs.realpath(directory);
	const { stdout } = await exec("ps", ["-ax", "-o", "pid=,args="], {
		timeout: 5000,
		maxBuffer: 10 * 1024 * 1024,
	});
	const matches = [];
	for (const line of stdout.split("\n")) {
		const row = /^\s*(\d+)\s+(.*)$/.exec(line);
		if (!row || !row[2]?.includes(canonical)) continue;
		try {
			const observed = await identity(Number(row[1]), canonical, executable);
			if (observed) matches.push(observed);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	if (matches.length !== 1) return;
	const holder = matches[0];
	if (!holder) return;
	return { ...holder, token: createHash("sha256").update(JSON.stringify(holder)).digest("hex") };
}
/** Graceful stop only. Never delete profile data, remove locks, or force-kill a changed PID. */
export async function stopProfileForRecall(
	directory: string,
	chromePath: string,
	token: string,
): Promise<void> {
	const holder = await inspectProfileRecall(directory, chromePath);
	if (!holder || holder.token !== token)
		throw new Error("Browser profile holder changed; refresh before Recall.");
	const current = await identity(holder.pid, holder.directory, holder.executable);
	if (!current || createHash("sha256").update(JSON.stringify(current)).digest("hex") !== token)
		throw new Error("Browser profile holder changed; refresh before Recall.");
	process.kill(holder.pid, "SIGTERM");
	for (let attempt = 0; attempt < 50; attempt++) {
		try {
			const remaining = await identity(holder.pid, holder.directory, holder.executable);
			if (!remaining || remaining.start !== holder.start) return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error("Borrowed browser did not close; Recall stopped without forcing termination.");
}
