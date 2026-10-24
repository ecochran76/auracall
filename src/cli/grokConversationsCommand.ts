import { z } from "zod";
import {
	type GrokConversationInventory,
	type GrokConversationsService,
	grokConversationsFailureResult,
} from "../browser/grokConversationsService.js";

export const grokConversationsInputShape = {
	runtimeProfile: z.string().trim().min(1).max(200).optional(),
	projectId: z.string().trim().min(1).max(200).optional(),
	query: z.string().max(200).optional(),
	cursor: z.string().min(1).max(4096).optional(),
	limit: z.number().int().min(1).max(10000).optional(),
	since: z
		.string()
		.max(100)
		.refine((value) => Number.isFinite(Date.parse(value)), "Invalid since date")
		.optional(),
	maxPages: z.number().int().min(1).max(200).optional(),
	timeoutMs: z.number().int().min(1).max(60000).optional(),
};
// biome-ignore lint/style/useNamingConvention: Repository public Zod schema convention.
export const GrokConversationsRequestSchema = z.object(grokConversationsInputShape).strict();
export type GrokConversationsRequest = z.infer<typeof GrokConversationsRequestSchema>;
export type GrokConversationsServiceResolver = (
	request: GrokConversationsRequest,
) => GrokConversationsService | Promise<GrokConversationsService>;
export { grokConversationsFailureResult };

export async function runGrokConversationsCommand(
	input: unknown,
	service: GrokConversationsService,
): Promise<GrokConversationInventory> {
	const parsed = GrokConversationsRequestSchema.safeParse(input ?? {});
	if (!parsed.success) return grokConversationsFailureResult(undefined, "history-invalid-request");
	try {
		const { runtimeProfile: _runtimeProfile, ...request } = parsed.data;
		return await service.list(request);
	} catch {
		return grokConversationsFailureResult(parsed.data.projectId);
	}
}
