export interface GrokIndexProgress {
	phase: "backfill" | "follow";
	state: "active" | "paused" | "partial" | "failed";
	completedScopes: number;
	totalScopes: number;
	retainedRows: number;
	omissions: string[];
}

/** A whitelist for public projections; continuation tokens never cross this seam. */
export function normalizeGrokIndexProgress(value: unknown): GrokIndexProgress | null {
	if (!value || typeof value !== "object") return null;
	const input = value as Record<string, unknown>;
	const count = (value: unknown) =>
		typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
	return {
		phase: input.phase === "follow" ? "follow" : "backfill",
		state:
			input.state === "failed"
				? "failed"
				: input.state === "paused"
					? "paused"
					: input.state === "active"
						? "active"
						: "partial",
		completedScopes: count(input.completedScopes),
		totalScopes: count(input.totalScopes),
		retainedRows: count(input.retainedRows),
		omissions: Array.isArray(input.omissions)
			? input.omissions
					.filter((x): x is string => typeof x === "string")
					.slice(0, 16)
					.map((x) => x.slice(0, 256))
			: [],
	};
}
