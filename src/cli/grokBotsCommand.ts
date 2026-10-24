// biome-ignore-all lint/style/useNamingConvention: Public Zod schemas follow the repository PascalCase convention.
import { z } from "zod";
import type { GrokBotsService } from "../browser/grokBotsService.js";
import { grokBotUnknown } from "../browser/grokBotsService.js";

export const GrokBotSelectorSchema = z
	.object({
		id: z.string().trim().min(1).max(512),
		source: z.enum(["owned", "catalog"]),
		author: z.string().trim().min(1).max(200).optional(),
	})
	.strict();
export const GrokBotsRequestSchema = z.discriminatedUnion("action", [
	z
		.object({
			action: z.literal("list"),
			source: z.enum(["owned", "catalog"]).optional(),
			runtimeProfile: z.string().min(1).max(200).optional(),
		})
		.strict(),
	z
		.object({
			action: z.literal("invoke"),
			selector: GrokBotSelectorSchema,
			prompt: z
				.string()
				.min(1)
				.max(100000)
				.refine((value) => value.trim().length > 0, "Prompt must contain text"),
			runtimeProfile: z.string().min(1).max(200).optional(),
		})
		.strict(),
]);
export type GrokBotsRequest = z.infer<typeof GrokBotsRequestSchema>;
export type GrokBotsResult =
	| Awaited<ReturnType<GrokBotsService["list"]>>
	| Awaited<ReturnType<GrokBotsService["invoke"]>>;
export type GrokBotsServiceResolver = (
	request: GrokBotsRequest,
) => GrokBotsService | Promise<GrokBotsService>;
export function grokBotsFailureResult(): GrokBotsResult {
	return grokBotUnknown("grok_bot_request_unknown");
}
export async function runGrokBotsCommand(
	input: unknown,
	service: GrokBotsService,
): Promise<GrokBotsResult> {
	let invoked = false;
	try {
		const request = GrokBotsRequestSchema.parse(input);
		invoked = request.action === "invoke";
		return request.action === "list"
			? await service.list(request.source)
			: await service.invoke(request.selector, request.prompt);
	} catch {
		return invoked
			? { ...grokBotUnknown("grok_bot_invocation_outcome_unknown"), effectState: "unknown" }
			: grokBotsFailureResult();
	}
}
/** Ops projection excludes Bot names, prompts, account IDs and conversation content. */
export function summarizeGrokBotDiagnostics(result: GrokBotsResult) {
	return {
		status: result.status,
		code: result.code,
		hasProviderAccountIdentity: result.providerAccountRef !== null,
		botCount: "bots" in result ? result.bots.length : null,
		complete: "coverage" in result ? result.coverage.complete : false,
		effectState: "effectState" in result ? result.effectState : "none",
		hasConversationIdentity: "conversationId" in result && result.conversationId !== null,
		hasResponseIdentity: "responseId" in result && result.responseId !== null,
		artifactStatus: "artifacts" in result ? result.artifacts.status : "unknown",
	};
}
export function formatGrokBotsFailure() {
	return JSON.stringify(grokBotsFailureResult());
}
