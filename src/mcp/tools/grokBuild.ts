import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { grokBuildUnknown } from "../../browser/grokBuildService.js";
import {
	GrokBuildRequestSchema,
	type GrokBuildServiceResolver,
	runGrokBuildCommand,
} from "../../cli/grokBuildCommand.js";
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
				"Discover Build entitlement or explicitly generate once on an empty root composer. Generation requires confirmed=true. Terminal text does not prove a generated app, version, preview or local app bytes. No publication is requested. Inspect requires an exact existing target and conversation. Optional inspectPublicationControls=true opens and dismisses the owned native Publish dialog without publishing; default inspection performs no input. Proposed names never establish a public URL, app identity or selected snapshot binding. Export retrieves one native workspace ZIP on an exact retained target and requires a private outputDir plus acknowledgeTargetDefaultReset=true; the target download policy is reset to default afterward, not restored from an unknown getter. Export never publishes or regenerates. Authenticated preview bearer URLs are never returned. Preserve uncertain targets; never automatically resubmit.",
			inputSchema: {
				action: z.enum(["discover", "generate", "inspect", "export"]),
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
				outputDir: z.string().min(1).max(4096).optional(),
				acknowledgeTargetDefaultReset: z.literal(true).optional(),
				inspectPublicationControls: z.literal(true).optional(),
				prompt: z.string().min(1).max(100000).optional(),
				confirmed: z.literal(true).optional(),
				timeoutMs: z.number().int().min(1).max(7200000).optional(),
				runtimeProfile: z.string().min(1).max(200).optional(),
			},
		},
		createGrokBuildToolHandler(resolveService),
	);
}
