import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Conversation, Project } from "../browser/providers/domain.js";
import { grokHistoryFingerprint } from "../browser/providers/grokHistoryInventory.js";
import type { GrokHistoryCoverage } from "../browser/providers/grokHistoryInventory.js";
import type { GrokIndexProgress } from "./grokIndexProgress.js";

/** Private account-bound checkpoint. Never project opaque continuation into Ops. */
export interface GrokIndexCheckpoint {
	version: 1;
	phase: "backfill" | "follow";
	nextScope: number;
	scopes: {
		projectId: string | null;
		cursor: string | null;
		complete: boolean;
		followCursor?: string | null;
	}[];
	sweepMode?: "steady_follow" | "full_sweep";
	items: Conversation[];
	updatedAt: string;
}
export function createGrokIndexCheckpointStore(
	root: string,
	custody: { runtimeProfileId: string; identityKey: string },
) {
	const account = custody.identityKey.trim().toLowerCase();
	if (!account || !custody.runtimeProfileId.trim())
		throw new Error("Grok index checkpoint requires account custody.");
	const key = createHash("sha256")
		.update(JSON.stringify([custody.runtimeProfileId, account]))
		.digest("hex");
	const file = path.join(root, "account-mirror", "grok-index", `${key}.json`);
	return {
		async read(): Promise<GrokIndexCheckpoint | null> {
			let raw: string;
			try {
				raw = await fs.readFile(file, "utf8");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
				throw error;
			}
			const value = JSON.parse(raw);
			if (
				value.custody !== key ||
				value.checkpoint?.version !== 1 ||
				!Array.isArray(value.checkpoint.scopes) ||
				!Array.isArray(value.checkpoint.items)
			)
				throw new Error("Invalid Grok index checkpoint.");
			return value.checkpoint;
		},
		async write(checkpoint: GrokIndexCheckpoint): Promise<void> {
			await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
			const temp = `${file}.${randomUUID()}.tmp`;
			try {
				await fs.writeFile(temp, JSON.stringify({ custody: key, checkpoint }), { mode: 0o600 });
				await fs.rename(temp, file);
			} finally {
				await fs.rm(temp, { force: true });
			}
		},
	};
}

/** Commit qualified rows with their continuation before starting another scope. */
export async function collectGrokMirrorIndex(input: {
	projects: readonly Project[];
	projectsComplete?: boolean;
	fullSweep?: boolean;
	maxRows: number;
	maxReads: number;
	checkpoint?: GrokIndexCheckpoint | null;
	commit?: (checkpoint: GrokIndexCheckpoint) => Promise<void>;
	shouldYield?: () => boolean | Promise<boolean>;
	abortSignal?: AbortSignal;
	read: (
		projectId: string | null,
		cursor: string | null,
		limit: number,
		maxPages: number,
		knownRows?: readonly { id: string; fingerprint: string }[],
	) => Promise<{ items: Conversation[]; historyCoverage?: GrokHistoryCoverage }>;
}): Promise<{
	items: Conversation[];
	truncated: boolean;
	progress: GrokIndexProgress;
	checkpoint: GrokIndexCheckpoint;
}> {
	const prior = input.checkpoint;
	const scopeIds = [
		null,
		...new Set([
			...input.projects.map((x) => x.id),
			...(input.projectsComplete === false
				? (prior?.scopes ?? []).flatMap((scope) => (scope.projectId ? [scope.projectId] : []))
				: []),
		]),
	];
	const resetSweep =
		input.fullSweep === true && !(prior?.phase === "backfill" && prior.sweepMode === "full_sweep");
	const following = prior?.phase === "follow" && !resetSweep;
	const continuing = !!prior && !resetSweep;
	const scopes = scopeIds.map((projectId) => {
		const old = continuing ? prior.scopes.find((x) => x.projectId === projectId) : null;
		return {
			projectId,
			cursor: old?.cursor ?? null,
			complete: old?.complete ?? false,
			...(old?.followCursor !== undefined ? { followCursor: old.followCursor } : {}),
		};
	});
	const rows = new Map((prior?.items ?? []).map((x) => [x.id, x]));
	let state: GrokIndexProgress["state"] = "partial";
	let remaining = Math.max(0, Math.floor(input.maxRows));
	let reads = 0;
	let changedRows = 0;
	let observedScopes = 0;
	let nextScope = continuing ? Math.min(prior.nextScope, scopes.length - 1) : 0;
	// Resume the interrupted scope first; scope IDs, rather than old positions,
	// carry cursors when project inventory changes between cycles.
	if (continuing) {
		const oldId = prior.scopes[prior.nextScope]?.projectId;
		const index = scopes.findIndex((x) => x.projectId === oldId);
		if (index >= 0) nextScope = index;
	}
	const makeCheckpoint = (): GrokIndexCheckpoint => ({
		version: 1,
		phase:
			following || (scopes.every((x) => x.complete) && input.projectsComplete !== false)
				? "follow"
				: "backfill",
		sweepMode: input.fullSweep ? "full_sweep" : "steady_follow",
		nextScope,
		scopes: scopes.map((x) => ({ ...x })),
		items: [...rows.values()],
		updatedAt: new Date().toISOString(),
	});
	const startScope = nextScope;
	for (let visited = 0; visited < scopes.length; visited++) {
		const index = (startScope + visited) % scopes.length;
		const scope = scopes[index];
		if (scope.complete && !following) continue;
		input.abortSignal?.throwIfAborted();
		if (await input.shouldYield?.()) {
			state = "paused";
			break;
		}
		if (remaining <= 0 || reads >= Math.max(0, input.maxReads)) break;
		const headObservation = following && scope.complete;
		const knownRows = headObservation
			? [...rows.values()]
					.filter((row) => !scope.projectId || row.projectId === scope.projectId)
					.map((row) => ({ id: row.id, fingerprint: grokHistoryFingerprint(row) }))
			: undefined;
		const result = await input.read(
			scope.projectId,
			headObservation ? (scope.followCursor ?? null) : scope.cursor,
			remaining,
			Math.max(1, input.maxReads - reads),
			knownRows,
		);
		// Aborted or failed reads never publish an advanced cursor. Earlier commits survive.
		input.abortSignal?.throwIfAborted();
		if (result.historyCoverage?.state === "failed")
			throw new Error(`Grok index read failed: ${result.historyCoverage.reason}`);
		observedScopes++;
		for (const row of result.items) {
			const old = rows.get(row.id);
			if (!old || grokHistoryFingerprint(old) !== grokHistoryFingerprint(row)) changedRows++;
			const metadata = { ...row.metadata };
			if (metadata.grokInventory && typeof metadata.grokInventory === "object") {
				const { nextCursor: _privateCursor, ...publicCoverage } = metadata.grokInventory as Record<
					string,
					unknown
				>;
				metadata.grokInventory = publicCoverage;
			}
			rows.set(row.id, { ...row, metadata });
		}
		if (result.historyCoverage?.reason === "foreground-yield") state = "paused";
		remaining -= result.items.length;
		reads += Math.max(1, result.historyCoverage?.pages ?? 1);
		if (headObservation) scope.followCursor = result.historyCoverage?.nextCursor ?? null;
		else {
			scope.cursor = result.historyCoverage ? result.historyCoverage.nextCursor : scope.cursor;
			scope.complete =
				result.historyCoverage?.state === "complete" || result.historyCoverage?.state === "empty";
		}
		// Follow rotates bounded observations fairly, including newly discovered scopes.
		nextScope = following || scope.complete ? (index + 1) % scopes.length : index;
		const checkpoint = makeCheckpoint();
		await input.commit?.(checkpoint);
		if (!scope.complete && !following) {
			nextScope = index;
			break;
		}
	}
	const checkpoint = makeCheckpoint();
	if (checkpoint.phase === "follow" && !following) checkpoint.nextScope = 0;
	return {
		items: [...rows.values()],
		truncated: checkpoint.phase !== "follow" || following,
		checkpoint,
		progress: {
			phase: checkpoint.phase,
			state,
			completedScopes: scopes.filter((x) => x.complete).length,
			totalScopes: scopes.length,
			retainedRows: rows.size,
			omissions: [
				"Visible Chats coverage does not prove hidden or undiscovered Bot scopes.",
				...(following
					? [
							"Incremental head observation does not prove provider-wide ordering; older changes require an explicit full sweep.",
						]
					: []),
			],
			...(following
				? {
						observationCoverage: "partial" as const,
						requiresFullSweep: true,
						changedRows,
						observedScopes,
					}
				: {}),
		},
	};
}
