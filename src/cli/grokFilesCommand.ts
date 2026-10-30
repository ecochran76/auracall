import { z } from "zod";
import type { GrokFilesService } from "../browser/grokFilesService.js";
import { type GrokFilesResult, grokFilesFailure } from "../browser/providers/grokFiles.js";
import { BrowserAutomationError } from "../oracle/errors.js";

// biome-ignore lint/style/useNamingConvention: Public schema convention.
export const GrokFilesRequestSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("context"), runtimeProfile: z.string().min(1).optional() }).strict(),
	z.object({ action: z.literal("recent"), runtimeProfile: z.string().min(1).optional() }).strict(),
	z
		.object({
			action: z.literal("select"),
			id: z.string().trim().min(1).max(512),
			runtimeProfile: z.string().min(1).optional(),
		})
		.strict(),
	z
		.object({
			action: z.literal("upload"),
			paths: z.array(z.string().min(1).max(4096)).min(1).max(100),
			runtimeProfile: z.string().min(1).optional(),
		})
		.strict(),
]);
export type GrokFilesRequest = z.infer<typeof GrokFilesRequestSchema>;
export type GrokFilesServiceResolver = (
	request: GrokFilesRequest,
) => Promise<GrokFilesService> | GrokFilesService;
export async function runGrokFilesCommand(
	input: unknown,
	service: GrokFilesService,
): Promise<GrokFilesResult> {
	try {
		const request = GrokFilesRequestSchema.parse(input);
		switch (request.action) {
			case "context":
				return await service.context();
			case "recent":
				return await service.recent();
			case "select":
				return await service.select(request.id);
			case "upload":
				return await service.upload(request.paths);
		}
	} catch (error) {
		// Never serialize local paths, account data or raw browser transport messages.
		const unknown =
			error instanceof Error &&
			"details" in error &&
			(error as { details?: { effectState?: string } }).details?.effectState === "unknown";
		const result = grokFilesFailure(unknown ? "grok_file_effect_unknown" : "grok_files_failed");
		if (error instanceof BrowserAutomationError && typeof error.details?.targetId === "string")
			result.provenance.targetId = error.details.targetId;
		if (
			error instanceof BrowserAutomationError &&
			error.details?.selectionDispatch === "not-dispatched"
		)
			result.selectionDispatch = "not-dispatched";
		return unknown ? { ...result, status: "unconfirmed" } : result;
	}
}
export function summarizeGrokFilesDiagnostics(result: GrokFilesResult) {
	return {
		status: result.status,
		code: result.code,
		count: result.files.length,
		scope: result.coverage.scope,
		complete: result.coverage.complete,
		hasProviderAccountIdentity: result.providerAccountRef !== null,
		hasProjectContext: result.provenance.projectId !== null,
		ready: result.files.filter((file) => file.state === "ready").length,
	};
}

export type { GrokFilesResult } from "../browser/providers/grokFiles.js";
