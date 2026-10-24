import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	GrokBotSelectorSchema,
	GrokBotsRequestSchema,
	type GrokBotsServiceResolver,
	type GrokBotsResult,
	grokBotsFailureResult,
	runGrokBotsCommand,
} from "../../cli/grokBotsCommand.js";
export function createGrokBotsToolHandler(resolveService: GrokBotsServiceResolver) {
	return async (input: unknown) => {
		let result: GrokBotsResult;
		try {
			const request = GrokBotsRequestSchema.parse(input);
			result = await runGrokBotsCommand(request, await resolveService(request));
		} catch {
			result = grokBotsFailureResult();
		}
		return {
			content: [{ type: "text" as const, text: `Grok Bots: ${result.status} (${result.code}).` }],
			structuredContent: result as typeof result & Record<string, unknown>,
			isError: result.status !== "supported",
		};
	};
}
export function registerGrokBotsTool(
	server: McpServer,
	resolveService: GrokBotsServiceResolver,
): void {
	server.registerTool(
		"grok_bots",
		{
			title: "Discover and invoke Grok Bots",
			description:
				"List visible owned or catalog Bots, or invoke one existing owned Bot by exact stable identity. Catalog listing does not install. No installation, removal or scheduling. Unknown outcomes must not be automatically resubmitted.",
			inputSchema: {
				action: z.enum(["list", "invoke"]),
				source: z.enum(["owned", "catalog"]).optional(),
				selector: GrokBotSelectorSchema.optional(),
				prompt: z.string().min(1).max(100000).optional(),
				runtimeProfile: z.string().min(1).max(200).optional(),
			},
		},
		createGrokBotsToolHandler(resolveService),
	);
}
