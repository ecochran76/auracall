import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	GrokBuildRequestSchema,
	runGrokBuildCommand,
	type GrokBuildServiceResolver,
} from "../../cli/grokBuildCommand.js";
import { grokBuildUnknown } from "../../browser/grokBuildService.js";
export function createGrokBuildToolHandler(resolveService: GrokBuildServiceResolver) {
	return async (input: unknown) => {
		const parsed = GrokBuildRequestSchema.safeParse(input);
		let result = grokBuildUnknown("grok_build_request_invalid");
		if (!parsed.success)
			result = { ...grokBuildUnknown("grok_build_request_invalid"), status: "invalid" as const };
		else {
			try {
				result = await runGrokBuildCommand(parsed.data, await resolveService(parsed.data));
			} catch {
				result = grokBuildUnknown("grok_build_configuration_failed");
			}
		}
		return {
			content: [{ type: "text" as const, text: `Grok Build: ${result.status} (${result.code}).` }],
			structuredContent: result as typeof result & Record<string, unknown>,
			isError: result.status !== "available",
		};
	};
}
export function registerGrokBuildTool(
	server: McpServer,
	resolveService: GrokBuildServiceResolver,
): void {
	server.registerTool(
		"grok_build",
		{
			title: "Discover Grok Build mode or request one generation",
			description:
				"Discover Build entitlement or explicitly generate once on an empty root composer. Generation requires confirmed=true. Terminal text does not prove a generated app, version, preview or local app bytes. No publication is requested. Inspect requires an exact existing target and conversation; it performs no generation or input. Authenticated preview bearer URLs are never returned. Preserve uncertain targets; never automatically resubmit.",
			inputSchema: {
				action: z.enum(["discover", "generate", "inspect"]),
				targetId: z
					.string()
					.regex(/^[A-Za-z0-9:_-]{1,200}$/)
					.optional(),
				conversationId: z
					.string()
					.regex(/^[A-Za-z0-9:_-]{1,200}$/)
					.optional(),
				responseId: z
					.string()
					.regex(/^[A-Za-z0-9:_-]{1,200}$/)
					.optional(),
				prompt: z.string().min(1).max(100000).optional(),
				confirmed: z.literal(true).optional(),
				timeoutMs: z.number().int().min(1).max(7200000).optional(),
				runtimeProfile: z.string().min(1).max(200).optional(),
			},
		},
		createGrokBuildToolHandler(resolveService),
	);
}
