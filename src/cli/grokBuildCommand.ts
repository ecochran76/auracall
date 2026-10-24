// biome-ignore-all lint/style/useNamingConvention: Public Zod schemas follow repository naming.
import { z } from "zod";
import { BrowserAutomationError } from "../oracle/errors.js";
import {
	grokBuildUnknown,
	type GrokBuildResult,
	type GrokBuildService,
} from "../browser/grokBuildService.js";

export const GrokBuildRequestSchema = z.discriminatedUnion("action", [
	z
		.object({
			action: z.literal("discover"),
			runtimeProfile: z.string().trim().min(1).max(200).optional(),
		})
		.strict(),
	z
		.object({
			action: z.literal("generate"),
			prompt: z
				.string()
				.min(1)
				.max(100000)
				.refine((value) => value.trim().length > 0),
			confirmed: z.literal(true),
			timeoutMs: z.number().int().min(1).max(7200000).optional(),
			runtimeProfile: z.string().trim().min(1).max(200).optional(),
		})
		.strict(),
]);
export type GrokBuildRequest = z.infer<typeof GrokBuildRequestSchema>;
export type GrokBuildServiceResolver = (
	request: GrokBuildRequest,
) => GrokBuildService | Promise<GrokBuildService>;
export async function runGrokBuildCommand(
	input: unknown,
	service: GrokBuildService,
): Promise<GrokBuildResult> {
	const parsed = GrokBuildRequestSchema.safeParse(input);
	if (!parsed.success)
		return { ...grokBuildUnknown("grok_build_request_invalid"), status: "invalid" };
	const request = parsed.data;
	try {
		return request.action === "discover"
			? await service.discover()
			: await service.generate(request);
	} catch (error) {
		const result = grokBuildUnknown("grok_build_request_failed");
		if (request.action === "generate") {
			const noSend =
				error instanceof BrowserAutomationError && error.details?.effectState === "pre_effect";
			if (!noSend) {
				result.effectState = "unknown";
				result.retrySafe = false;
				result.generation.status = "unknown";
			}
			if (error instanceof BrowserAutomationError && typeof error.details?.targetId === "string")
				result.targetId = error.details.targetId;
		}
		return result;
	}
}
/** Ops excludes prompts, response content, URLs, account keys and app identifiers. */
export function summarizeGrokBuildDiagnostics(result: GrokBuildResult) {
	return {
		status: result.status,
		code: result.code,
		complete: false,
		count: null,
		ready: null,
		hasProviderAccountIdentity: result.providerAccountRef !== null,
		hasConversationIdentity: result.conversationId !== null,
		hasResponseIdentity: result.generation.responseId !== null,
		effectState: result.effectState,
	};
}
