import crypto from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { readQualifiedStableTime, type StableTimeReading, utcNanoseconds } from "./stableTime.js";

type Row = Record<string, unknown>;
interface Snapshot {
	raw: Buffer | null;
	data: Record<string, unknown>;
}
export interface CoordinationResetInput {
	homeDir: string;
	apply?: boolean;
	readTime?: () => Promise<StableTimeReading>;
}
export interface CoordinationResetResult {
	status: "preview" | "reset" | "blocked" | "partial";
	timeSource: "StableTime";
	observedAt: string;
	backupPath: string | null;
	blockers: string[];
	before: { bytes: number; records: number; events: number; leases: number };
	retained: { records: number; events: number; warnings: number };
	appliedFiles: string[];
}
const ledgerName = "provider-interactions.v1.json";
const registryName = "tab-leases.v1.json";
const emptyLedger = { schemaVersion: 1, records: [], warnings: [], events: [] };
const emptyRegistry = { schemaVersion: 1, leases: [], controls: [] };

function missing(error: unknown): boolean {
	return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
function rows(snapshot: Snapshot, field: string): Row[] {
	return snapshot.data[field] as Row[];
}
function living(pid: unknown): boolean {
	if (!Number.isSafeInteger(pid) || (pid as number) <= 0) return true;
	try {
		process.kill(pid as number, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}
async function safeDirectory(directory: string): Promise<void> {
	try {
		const stat = await fs.lstat(directory);
		if (
			!stat.isDirectory() ||
			stat.isSymbolicLink() ||
			(process.getuid && stat.uid !== process.getuid())
		)
			throw new Error("Unsafe coordination directory");
	} catch (error) {
		if (!missing(error)) throw error;
	}
}
async function load(file: string, empty: object): Promise<Snapshot> {
	let handle: Awaited<ReturnType<typeof fs.open>>;
	try {
		const stat = await fs.lstat(file);
		if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Unsafe coordination state file");
		handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
	} catch (error) {
		if (missing(error)) return { raw: null, data: { ...empty } };
		throw error;
	}
	try {
		const stat = await handle.stat();
		if (
			!stat.isFile() ||
			stat.size > 256 * 1024 * 1024 ||
			(process.getuid && stat.uid !== process.getuid())
		)
			throw new Error("Unsafe coordination state file");
		const raw = await handle.readFile();
		let data: Record<string, unknown>;
		try {
			data = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
		} catch {
			throw new Error("Unsafe or malformed coordination snapshot");
		}
		if (data.schemaVersion !== 1) throw new Error("Unsafe or unsupported coordination schema");
		for (const field of Object.keys(empty).filter((key) => key !== "schemaVersion")) {
			if (
				!Array.isArray(data[field]) ||
				!(data[field] as unknown[]).every(
					(row) => row && typeof row === "object" && !Array.isArray(row),
				)
			) {
				throw new Error("Unsafe coordination snapshot");
			}
		}
		return { raw, data };
	} finally {
		await handle.close();
	}
}
async function privateWrite(file: string, bytes: Buffer | string): Promise<void> {
	const handle = await fs.open(file, "wx", 0o600);
	try {
		await handle.writeFile(bytes);
		await handle.sync();
	} finally {
		await handle.close();
	}
}
async function syncDirectory(directory: string): Promise<void> {
	const handle = await fs.open(directory, "r");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}
async function replace(file: string, value: object, onRenamed?: () => void): Promise<void> {
	const temp = `${file}.${crypto.randomUUID()}.tmp`;
	try {
		await privateWrite(temp, `${JSON.stringify(value)}\n`);
		await fs.rename(temp, file);
		onRenamed?.();
		await syncDirectory(path.dirname(file));
	} finally {
		await fs.rm(temp, { force: true });
	}
}

/** Reset only idle coordination snapshots. The operator's explicit apply abandons orphan work. */
export async function resetCoordination(
	input: CoordinationResetInput,
): Promise<CoordinationResetResult> {
	const time = await (input.readTime ?? readQualifiedStableTime)();
	if (
		![time.utc, time.earliestUtc, time.latestUtc].every((value) => utcNanoseconds(value) !== null)
	) {
		throw new Error("StableTime is unavailable or unqualified; no reset performed.");
	}
	const home = path.resolve(input.homeDir);
	const root = path.join(home, "browser-coordination");
	const archiveRoot = path.join(home, "coordination-backups");
	const directories = [
		home,
		root,
		path.join(root, "provider-interactions"),
		path.join(root, "tab-leases"),
		archiveRoot,
	];
	for (const directory of directories) await safeDirectory(directory);
	const files = [
		path.join(root, "provider-interactions", ledgerName),
		path.join(root, "tab-leases", registryName),
	];
	const locks = [
		path.join(root, "provider-interactions/provider-interactions.lock"),
		path.join(root, "tab-leases/tab-leases.lock"),
	];
	const owned: {
		file: string;
		handle: Awaited<ReturnType<typeof fs.open>>;
		ino: bigint;
		dev: bigint;
	}[] = [];
	let result: CoordinationResetResult | undefined;
	try {
		if (input.apply) {
			for (const directory of directories.slice(0, 4))
				await fs.mkdir(directory, { recursive: true, mode: 0o700 });
			for (const file of locks) {
				try {
					const handle = await fs.open(file, "wx", 0o600);
					const stat = await handle.stat({ bigint: true });
					owned.push({ file, handle, ino: stat.ino, dev: stat.dev });
					await handle.writeFile(JSON.stringify({ ownerPid: process.pid, acquiredAt: time.utc }));
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
					return {
						status: "blocked",
						timeSource: "StableTime",
						observedAt: time.utc,
						backupPath: null,
						blockers: ["coordination-lock-held"],
						before: { bytes: 0, records: 0, events: 0, leases: 0 },
						retained: { records: 0, events: 0, warnings: 0 },
						appliedFiles: [],
					};
				}
			}
		}
		const [ledger, registry] = await Promise.all([
			load(files[0], emptyLedger),
			load(files[1], emptyRegistry),
		]);
		const leases = rows(registry, "leases");
		const blockers: string[] = [];
		const earliest = utcNanoseconds(time.earliestUtc);
		if (earliest === null)
			throw new Error("StableTime is unavailable or unqualified; no reset performed.");
		const expired = (value: unknown) => {
			const instant = utcNanoseconds(value);
			return instant !== null && instant <= earliest;
		};
		if (
			leases.some((lease) => {
				if (lease.state === "released") return false;
				const binding =
					lease.processBinding && typeof lease.processBinding === "object"
						? (lease.processBinding as Row)
						: null;
				const owners = [lease.ownerProcessId, binding?.processId].filter((pid) => pid != null);
				if (owners.length) return owners.some(living);
				if (lease.state === "lost") return false;
				// Legacy idle records have no process proof. Both expiry bounds must be past.
				return (
					lease.state !== "idle" || ![lease.idleExpiresAt, lease.absoluteExpiresAt].every(expired)
				);
			})
		)
			blockers.push("live-or-unattributed-tab-owner");
		if (
			rows(registry, "controls").some(
				(control) => control.state !== "released" && !expired(control.expiresAt),
			)
		) {
			blockers.push("profile-control-not-proven-expired");
		}
		const cutoff = earliest - 86_400_000_000_000n;
		const recent = (value: unknown) => {
			const instant = utcNanoseconds(value);
			return instant === null || instant >= cutoff;
		};
		const records = rows(ledger, "records")
			.filter(
				(record) =>
					recent(record.reservedAt) || (record.startedAt != null && recent(record.startedAt)),
			)
			.map((record) =>
				["reserved", "started"].includes(String(record.state))
					? { ...record, state: "abandoned", stopReason: "operator-coordination-reset" }
					: record,
			);
		const events = rows(ledger, "events").filter((event) => recent(event.occurredAt));
		const warnings = rows(ledger, "warnings").filter((warning) => !expired(warning.cooldownUntil));
		result = {
			status: blockers.length ? "blocked" : "preview",
			timeSource: "StableTime",
			observedAt: time.utc,
			backupPath: null,
			blockers,
			before: {
				bytes: (ledger.raw?.length ?? 0) + (registry.raw?.length ?? 0),
				records: rows(ledger, "records").length,
				events: rows(ledger, "events").length,
				leases: leases.length,
			},
			retained: { records: records.length, events: events.length, warnings: warnings.length },
			appliedFiles: [],
		};
		if (blockers.length || !input.apply) return result;
		await fs.mkdir(archiveRoot, { recursive: true, mode: 0o700 });
		const backupPath = path.join(archiveRoot, crypto.randomUUID());
		await fs.mkdir(backupPath, { mode: 0o700 });
		result.backupPath = backupPath;
		const names = [ledgerName, registryName];
		const snapshots = [ledger, registry];
		const replacements = [{ schemaVersion: 1, records, warnings, events }, emptyRegistry];
		const manifest = {
			schemaVersion: 1,
			operation: "idle-coordination-reset",
			stableTime: time,
			state: "prepared",
			appliedFiles: result.appliedFiles,
			files: snapshots.map((snapshot, index) => ({
				name: names[index],
				existed: snapshot.raw !== null,
				bytes: snapshot.raw?.length ?? 0,
				sha256: snapshot.raw
					? crypto.createHash("sha256").update(snapshot.raw).digest("hex")
					: null,
			})),
		};
		for (const [index, snapshot] of snapshots.entries()) {
			if (snapshot.raw) await privateWrite(path.join(backupPath, names[index]), snapshot.raw);
		}
		await privateWrite(path.join(backupPath, "manifest.json"), JSON.stringify(manifest));
		await syncDirectory(backupPath);
		await syncDirectory(archiveRoot);
		try {
			const appliedFiles = result.appliedFiles;
			for (let index = 0; index < files.length; index++) {
				await replace(files[index], replacements[index], () => {
					appliedFiles.push(names[index]);
				});
				await replace(path.join(backupPath, "manifest.json"), manifest);
			}
			manifest.state = "applied";
			await replace(path.join(backupPath, "manifest.json"), manifest);
			result.status = "reset";
		} catch {
			result.status = "partial";
			result.blockers.push("reset-incomplete-inspect-backup-manifest");
			manifest.state = "partial";
			await replace(path.join(backupPath, "manifest.json"), manifest).catch(() => {});
		}
		return result;
	} finally {
		for (const lock of owned.reverse()) {
			await lock.handle.close();
			const stat = await fs.lstat(lock.file, { bigint: true }).catch(() => null);
			if (stat?.ino === lock.ino && stat.dev === lock.dev) await fs.unlink(lock.file);
			else if (result) {
				result.status = "partial";
				result.blockers.push("coordination-lock-ownership-changed");
			}
		}
	}
}
