import { z } from "zod";

/** Public progress deliberately omits account-bound continuation tokens. */
export const grokIndexProgressSchema = z
	.object({
		phase: z.enum(["backfill", "follow"]),
		state: z.enum(["active", "paused", "partial", "failed"]),
		completedScopes: z.number().int().nonnegative(),
		totalScopes: z.number().int().nonnegative(),
		retainedRows: z.number().int().nonnegative(),
		omissions: z.array(z.string()),
		observationCoverage: z.literal("partial").optional(),
		requiresFullSweep: z.boolean().optional(),
		changedRows: z.number().int().nonnegative().optional(),
		observedScopes: z.number().int().nonnegative().optional(),
	})
	.nullable()
	.optional();
