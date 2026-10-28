import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	GrokBotConfigurationPatchSchema,
	GrokBotSelectorSchema,
	GrokBotSettingsSelectorSchema,
	GrokBotsRequestSchema,
	type GrokBotsResult,
	type GrokBotsServiceResolver,
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
				"List visible owned or catalog Bots, or invoke one existing owned Bot by exact stable identity. Catalog listing does not install. Create requires explicit Terms confirmation. Resources observes only the exact owned Bot Settings controls, with unavailable or unknown capability and no grant/inventory claim. Native settings expose Name/Title/Description; Instructions and Model defaults are unavailable. Reconcile ambiguous lifecycle outcomes instead of replaying. No installation, removal or scheduling. Unknown outcomes must not be automatically resubmitted.",
			inputSchema: {
				action: z.enum(["list", "invoke", "create", "edit", "inspect", "resources", "reconcile"]),
				name: z.string().min(1).max(80).optional(),
				patch: GrokBotConfigurationPatchSchema.optional(),
				targetId: z.string().min(1).max(512).optional(),
				expectedProviderAccountRef: z
					.string()
					.regex(/^[a-f0-9]{64}$/)
					.optional(),
				confirm: z.boolean().optional(),
				acceptTerms: z.boolean().optional(),
				operationId: z
					.string()
					.regex(/^[a-f0-9]{64}$/)
					.optional(),
				source: z.enum(["owned", "catalog"]).optional(),
				selector: z.union([GrokBotSelectorSchema, GrokBotSettingsSelectorSchema]).optional(),
				prompt: z.string().min(1).max(100000).optional(),
				runtimeProfile: z.string().min(1).max(200).optional(),
			},
		},
		createGrokBotsToolHandler(resolveService),
	);
}
