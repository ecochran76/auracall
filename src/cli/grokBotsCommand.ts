// biome-ignore-all lint/style/useNamingConvention: Public Zod schemas follow the repository PascalCase convention.

import { z } from "zod";
import type { GrokBotsService } from "../browser/grokBotsService.js";
import { grokBotUnknown } from "../browser/grokBotsService.js";
import { BrowserAutomationError } from "../oracle/errors.js";

export const GrokBotSelectorSchema = z
	.object({
		id: z.string().trim().min(1).max(512),
		source: z.enum(["owned", "catalog"]),
		author: z.string().trim().min(1).max(200).optional(),
	})
	.strict();
export const GrokBotConfigurationPatchSchema = z
	.object({
		name: z.string().min(1).max(80).optional(),
		title: z.string().max(10000).optional(),
		description: z.string().max(10000).optional(),
		instructions: z.string().max(10000).optional(),
		model: z.string().max(200).optional(),
	})
	.strict();
export const GrokBotSettingsSelectorSchema = z
	.object({ id: z.string().uuid(), name: z.string().min(1).max(80) })
	.strict();
const accountRef = z.string().regex(/^[a-f0-9]{64}$/);
export const GrokBotsRequestSchema = z.discriminatedUnion("action", [
	z
		.object({
			action: z.literal("create"),
			name: z.string().trim().min(1).max(80),
			expectedProviderAccountRef: accountRef,
			confirm: z.literal(true),
			acceptTerms: z.literal(true),
			runtimeProfile: z.string().min(1).max(200).optional(),
		})
		.strict(),
	z
		.object({
			action: z.literal("edit"),
			selector: GrokBotSettingsSelectorSchema,
			patch: GrokBotConfigurationPatchSchema,
			targetId: z.string().min(1).max(512),
			expectedProviderAccountRef: accountRef,
			confirm: z.literal(true),
			runtimeProfile: z.string().min(1).max(200).optional(),
		})
		.strict(),
	z
		.object({
			action: z.literal("inspect"),
			selector: GrokBotSettingsSelectorSchema,
			targetId: z.string().min(1).max(512),
			expectedProviderAccountRef: accountRef,
			runtimeProfile: z.string().min(1).max(200).optional(),
		})
		.strict(),
	z
		.object({
			action: z.literal("reconcile"),
			operationId: z.string().regex(/^[a-f0-9]{64}$/),
			expectedProviderAccountRef: accountRef,
			runtimeProfile: z.string().min(1).max(200).optional(),
		})
		.strict(),
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
	| Awaited<ReturnType<GrokBotsService["invoke"]>>
	| import("../browser/providers/grokBotLifecycle.js").GrokBotLifecycleResult;
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
		if (request.action !== "list" && request.action !== "invoke")
			return service.lifecycle
				? await service.lifecycle(request)
				: { ...grokBotUnknown("grok_bot_lifecycle_unavailable"), status: "blocked" };
		return request.action === "list"
			? await service.list(request.source)
			: await service.invoke(request.selector, request.prompt);
	} catch (error) {
		if (
			invoked &&
			error instanceof BrowserAutomationError &&
			typeof error.details?.targetId === "string"
		)
			return {
				...grokBotUnknown("grok_bot_invocation_outcome_unknown"),
				effectState: "unknown",
				targetId: error.details.targetId,
			};
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
