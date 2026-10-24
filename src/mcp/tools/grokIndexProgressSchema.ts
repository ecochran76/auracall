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
	})
	.nullable()
	.optional();
