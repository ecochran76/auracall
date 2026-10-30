import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import fs, { type FileHandle } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getAuracallHomeDir } from "../../auracallHome.js";

class DesktopControlBusyError extends Error {}

interface GateOwner {
	id: string;
	role: "automation" | "human";
	binding: string;
	ownerPid: number;
	acquiredAt: string;
}

interface TransitionOwner {
	version: 1;
	id: string;
	ownerPid: number;
	bootId: string | null;
}

interface TransitionSnapshot {
	owner: TransitionOwner;
	dev: bigint;
	ino: bigint;
}

async function linuxBootId(): Promise<string | null> {
	if (process.platform !== "linux") return null;
	try {
		return (await fs.readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
	} catch {
		// Ordinary locking still works when process-death qualification is unavailable.
		return null;
	}
}

async function transitionSnapshot(file: string): Promise<TransitionSnapshot | undefined> {
	let handle: FileHandle | undefined;
	try {
		handle = await fs.open(file, "r");
		const stat = await handle.stat({ bigint: true });
		if (!stat.isFile() || stat.size > 1024n) return undefined;
		const value: unknown = JSON.parse(await handle.readFile("utf8"));
		if (!value || typeof value !== "object") return undefined;
		const owner = value as Partial<TransitionOwner>;
		if (
			owner.version !== 1 ||
			typeof owner.id !== "string" ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(owner.id) ||
			typeof owner.ownerPid !== "number" || !Number.isSafeInteger(owner.ownerPid) || owner.ownerPid <= 0 ||
			(owner.bootId !== null && typeof owner.bootId !== "string")
		) return undefined;
		return { owner: owner as TransitionOwner, dev: stat.dev, ino: stat.ino };
	} catch (error) {
		if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	} finally {
		await handle?.close();
	}
}

async function sameTransition(file: string, expected: TransitionSnapshot): Promise<boolean> {
	try {
		const actual = await fs.lstat(file, { bigint: true });
		return actual.isFile() && actual.dev === expected.dev && actual.ino === expected.ino;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

async function reclaimDeadTransition(file: string, bootId: string | null): Promise<void> {
	if (!bootId) return;
	const previous = await transitionSnapshot(file);
	if (!previous || previous.owner.bootId !== bootId) return;
	try {
		await fs.access(`/proc/${previous.owner.ownerPid}`);
		return;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}

	// A retained hard link elects exactly one reclaimer for this dead generation.
	// Never remove it: a paused contender must not acquire the same election later
	// and unlink a successor. If the reclaimer itself crashes, preserve ambiguity.
	const retired = `${file}.retired-${previous.owner.id}`;
	try {
		await fs.link(file, retired);
	} catch (error) {
		if (["EEXIST", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
		throw error;
	}
	if (await sameTransition(retired, previous) && await sameTransition(file, previous)) {
		await fs.unlink(file);
	}
}

async function releaseTransition(file: string, published: TransitionSnapshot): Promise<void> {
	if (!await sameTransition(file, published)) {
		throw new Error("Desktop control transition ownership changed; refusing stale release.");
	}
	await fs.unlink(file);
}

const automationScopes = new AsyncLocalStorage<ReadonlyMap<string, GateOwner>>();

export interface DesktopAutomationHold {
	run<T>(effect: () => Promise<T>): Promise<T>;
	close(): Promise<void>;
}

/** A clock alone never releases a human lease; exact provider revocation must qualify handoff. */
export class DesktopControlGate {
	private readonly lockPath: string;
	constructor(
		displayAllocationId: string,
		directory = path.join(getAuracallHomeDir(), "desktop-control"),
	) {
		this.lockPath = path.join(
			directory,
			createHash("sha256").update(displayAllocationId).digest("hex"),
		);
	}

	/** Temporary DEBUG-desktop-control-busy capture; never changes admission or serializes tokens. */
	private async captureFailure(
		binding: string,
		observedOwner: GateOwner | undefined,
		context: { category: "human-owned" | "busy" | "stale-scope" | "cancelled" | "admission-error"; attempts: number; cancellationSupplied: boolean; inherited?: GateOwner; ownerObservedAt?: string },
	): Promise<void> {
		if (process.platform !== "linux") return;
		try {
			const directory = path.join(getAuracallHomeDir(), "diagnostics", "desktop-control");
			const marker = path.join(directory, "enabled");
			const [directoryStat, markerStat] = await Promise.all([fs.lstat(directory), fs.lstat(marker)]);
			const uid = process.getuid?.();
			if (!directoryStat.isDirectory() || directoryStat.uid !== uid || (directoryStat.mode & 0o077) !== 0 ||
				!markerStat.isFile() || markerStat.uid !== uid || (markerStat.mode & 0o077) !== 0 || markerStat.size > 16 ||
				(await fs.readFile(marker, "utf8")).trim() !== "1") return;
			let pidPresent: boolean | null = null;
			if (observedOwner) {
				try { await fs.access(`/proc/${observedOwner.ownerPid}`); pidPresent = true; }
				catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") pidPresent = false; }
			}
			const hash = (value: string) => createHash("sha256").update(value).digest("hex");
			const record = {
				schemaVersion: 1,
				tag: "DEBUG-desktop-control-busy",
				capturedAt: new Date().toISOString(),
				category: context.category,
				requestedRole: "automation",
				requestedBindingSha256: hash(binding),
				ownerObservedAt: context.ownerObservedAt ?? null,
				owner: observedOwner ? {
					role: observedOwner.role,
					pid: observedOwner.ownerPid,
					acquiredAt: new Date(observedOwner.acquiredAt).toISOString(),
					bindingSha256: hash(observedOwner.binding),
					pidPresent,
					ownerBootVerified: false,
					matchesRequesterPid: observedOwner.ownerPid === process.pid,
				} : null,
				bindingsMatch: observedOwner ? observedOwner.binding === binding : null,
				inheritedScope: { present: Boolean(context.inherited), matchesRequesterPid: context.inherited?.ownerPid === process.pid },
				attempts: context.attempts,
				cancellationSupplied: context.cancellationSupplied,
			};
			const body = JSON.stringify(record);
			if (Buffer.byteLength(body) > 4096) return;
			await fs.writeFile(path.join(directory, `DEBUG-desktop-control-busy-${randomUUID()}.json`), body, { mode: 0o600, flag: "wx" });
		} catch {
			// Diagnostics are best effort: preserve the original refusal and ownership.
		}
	}

	private async transition<T>(operation: () => Promise<T>): Promise<T> {
		await fs.mkdir(path.dirname(this.lockPath), { recursive: true, mode: 0o700 });
		const transitionPath = `${this.lockPath}.transition`;
		const owner: TransitionOwner = {
			version: 1, id: randomUUID(), ownerPid: process.pid, bootId: await linuxBootId(),
		};
		const pendingPath = `${transitionPath}.${owner.id}.pending`;
		// Publish a complete immutable identity with one atomic link, avoiding the
		// old mkdir-before-owner crash window. Older clients still see EEXIST.
		await fs.writeFile(pendingPath, JSON.stringify(owner), { mode: 0o600, flag: "wx" });
		try {
			const published = await transitionSnapshot(pendingPath);
			if (!published) throw new Error("Desktop control transition identity is invalid.");
			let acquired = false;
			for (let attempt = 0; attempt < 100; attempt += 1) {
				try {
					await fs.link(pendingPath, transitionPath);
					acquired = true;
					break;
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
					await reclaimDeadTransition(transitionPath, owner.bootId);
					await delay(20);
				}
			}
			if (!acquired) throw new DesktopControlBusyError(
				"Desktop control coordination is busy. Preserve unqualified transition records for explicit recovery.",
			);
			try {
				return await operation();
			} finally {
				await releaseTransition(transitionPath, published);
			}
		} finally {
			await fs.rm(pendingPath, { force: true });
		}
	}

	private async acquire(
		role: GateOwner["role"],
		binding: string,
		id: string = randomUUID(),
	): Promise<GateOwner> {
		return this.transition(async () => {

      const previous = await this.owner();
      if (process.platform === 'linux' && previous?.role === 'automation' && Number.isInteger(previous.ownerPid) && previous.ownerPid > 0) {
        let absent = false;
        try { await fs.access(`/proc/${previous.ownerPid}`); }
        catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') absent = true; else throw e; }
        if (absent) await fs.rm(this.lockPath, { recursive: true });
      }
			await fs.mkdir(path.dirname(this.lockPath), { recursive: true, mode: 0o700 });
			try {
				await fs.mkdir(this.lockPath, { mode: 0o700 });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "EEXIST")
					throw new DesktopControlBusyError("Desktop control is busy; automation or another human owns the display.");
				throw error;
			}
			const owner: GateOwner = {
				id,
				role,
				binding,
				ownerPid: process.pid,
				acquiredAt: new Date().toISOString(),
			};
			try {
				const pendingPath = path.join(this.lockPath, `owner.${randomUUID()}.pending`);
				await fs.writeFile(pendingPath, JSON.stringify(owner), {
					mode: 0o600,
					flag: "wx",
				});
				await fs.rename(pendingPath, path.join(this.lockPath, "owner.json"));
				return owner;
			} catch (error) {
				await fs.rm(this.lockPath, { recursive: true, force: true });
				throw error;
			}
		});
	}

	private async owner(): Promise<GateOwner | undefined> {
		const invalid = () => new Error(
			"Desktop control ownership record is invalid or incomplete; automation remains blocked. Preserve the record and qualify an explicit control recovery.",
		);
		let raw: string;
		try {
			raw = await fs.readFile(path.join(this.lockPath, "owner.json"), "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			try {
				await fs.stat(this.lockPath);
			} catch (lockError) {
				if ((lockError as NodeJS.ErrnoException).code === "ENOENT") return undefined;
				throw lockError;
			}
			throw invalid();
		}
		let value: unknown;
		try { value = JSON.parse(raw); } catch { throw invalid(); }
		if (!value || typeof value !== "object") throw invalid();
		const owner = value as Partial<GateOwner>;
		if (
			typeof owner.id !== "string" || !owner.id ||
			(owner.role !== "automation" && owner.role !== "human") ||
			typeof owner.binding !== "string" || !owner.binding ||
			typeof owner.ownerPid !== "number" || !Number.isInteger(owner.ownerPid) || owner.ownerPid <= 0 ||
			typeof owner.acquiredAt !== "string" || !Number.isFinite(Date.parse(owner.acquiredAt))
		) throw invalid();
		return owner as GateOwner;
	}

	async takeControl(binding: string, token: string = randomUUID()): Promise<{ token: string }> {
		const owner = await this.acquire("human", binding, token);
		return { token: owner.id };
	}

	async assertControl(token: string, binding: string): Promise<void> {
		const owner = await this.owner();
		if (!owner || owner.id !== token || owner.role !== "human" || owner.binding !== binding) {
			throw new Error("Desktop control ownership changed; refusing stale control.");
		}
	}

	async releaseControl(token: string, binding: string): Promise<void> {
		return this.transition(async () => {
			const owner = await this.owner();
			if (!owner || owner.id !== token || owner.role !== "human" || owner.binding !== binding) {
				throw new Error("Desktop control ownership changed; refusing stale release.");
			}
			await fs.rm(this.lockPath, { recursive: true });
		});
	}

	async holdAutomation(binding: string, options?: { abortSignal?: AbortSignal }): Promise<DesktopAutomationHold> {
		let publish!: (hold: DesktopAutomationHold) => void;
		let reject!: (error: unknown) => void;
		const ready = new Promise<DesktopAutomationHold>((resolve, fail) => { publish = resolve; reject = fail; });
		let release!: () => void;
		const released = new Promise<void>(resolve => { release = resolve; });
		let closed = false;
		const pending = new Set<Promise<unknown>>();
		const lifetime = this.withAutomation(binding, async () => {
			const scopes = automationScopes.getStore();
			if (!scopes) throw new Error("Desktop automation scope is unavailable.");
			publish({
				run: <T>(effect: () => Promise<T>): Promise<T> => {
					if (closed) return Promise.reject(new Error("Desktop automation hold is closed."));
					const task = automationScopes.run(scopes, () => this.withAutomation(binding, effect));
					pending.add(task);
					void task.then(() => pending.delete(task), () => pending.delete(task));
					return task;
				},
				close: async () => {
					closed = true;
					await Promise.allSettled(pending);
					release();
					await lifetime;
				},
			});
			await released;
		}, options);
		void lifetime.catch(reject);
		return ready;
	}

	async withAutomation<T>(binding: string, effect: () => Promise<T>, options?: { abortSignal?: AbortSignal }): Promise<T> {
		options?.abortSignal?.throwIfAborted();
		const inherited = automationScopes.getStore()?.get(this.lockPath);
		if (inherited) {
			const current = await this.owner();
			if (
				!current || current.id !== inherited.id || current.role !== "automation" ||
				current.binding !== binding || inherited.binding !== binding ||
				current.ownerPid !== process.pid
			) {
				await this.captureFailure(binding, current, { category: "stale-scope", attempts: 0, cancellationSupplied: Boolean(options?.abortSignal), inherited, ownerObservedAt: new Date().toISOString() });
				throw new Error("Desktop automation ownership changed; refusing stale scope.");
			}
			return effect();
		}
		let owner: GateOwner | undefined;
		let observedOwner: GateOwner | undefined;
		let ownerObservedAt: string | undefined;
		let attempts = 0;
		try {
			for (let attempt = 0; options?.abortSignal !== undefined || attempt < 100; attempt += 1) {
				attempts = attempt + 1;
				options?.abortSignal?.throwIfAborted();
				try {
					owner = await this.acquire("automation", binding);
					break;
				} catch (error) {
					if (options?.abortSignal && !(error instanceof DesktopControlBusyError)) throw error;
					observedOwner = await this.owner();
					ownerObservedAt = new Date().toISOString();
					if (observedOwner?.role === "human")
						throw new Error("AuraCall automation is paused while a human controls this desktop.");
					if (!options?.abortSignal && attempt === 99) throw error;
					options?.abortSignal?.throwIfAborted();
					await delay(20, undefined, { signal: options?.abortSignal });
				}
			}
			if (!owner) throw new Error("Desktop automation admission unavailable.");
		} catch (error) {
			await this.captureFailure(binding, observedOwner, {
				category: options?.abortSignal?.aborted ? "cancelled" : observedOwner?.role === "human" ? "human-owned" : error instanceof DesktopControlBusyError ? "busy" : "admission-error",
				attempts,
				cancellationSupplied: Boolean(options?.abortSignal),
				ownerObservedAt,
			});
			throw error;
		}
		try {
			options?.abortSignal?.throwIfAborted();
			const scopes = new Map(automationScopes.getStore());
			scopes.set(this.lockPath, owner);
			return await automationScopes.run(scopes, effect);
		} finally {
			await this.transition(async () => {
				const current = await this.owner();
				if (current?.id === owner.id) await fs.rm(this.lockPath, { recursive: true });
			});
		}
	}
}
