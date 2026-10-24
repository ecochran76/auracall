import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	GrokConnectorsRequestSchema,
	type GrokConnectorsResult,
	type GrokConnectorsServiceResolver,
	grokConnectorsFailureResult,
	runGrokConnectorsCommand,
} from "../../cli/grokConnectorsCommand.js";

export function createGrokConnectorsToolHandler(resolveService: GrokConnectorsServiceResolver) {
	return async (input: unknown) => {
		let result: GrokConnectorsResult;
		try {
			const request = GrokConnectorsRequestSchema.parse(input);
			result = await runGrokConnectorsCommand(request, await resolveService(request));
		} catch {
			result = grokConnectorsFailureResult();
		}
		return {
			content: [
				{
					type: "text" as const,
					text: `Grok Connector discovery: ${result.status} (${result.code}).`,
				},
			],
			structuredContent: result as typeof result & Record<string, unknown>,
			isError: result.status === "failed",
		};
	};
}

/** Coordinator supplies the configured runtime/account authority resolver. */
export function registerGrokConnectorsTool(
	server: McpServer,
	resolveService: GrokConnectorsServiceResolver,
): void {
	server.registerTool(
		"grok_connectors",
		{
			title: "Discover Grok Connectors",
			description:
				"List visible catalog and installed connections or inspect exact Connector identity, auth and visible tools. Does not install, authenticate or invoke tools. Visible inventory is incomplete account coverage.",
			inputSchema: {
				action: z.enum(["list", "inspect"]),
				query: z.string().max(200).optional(),
				selector: z
					.object({
						id: z.string().optional(),
						name: z.string().optional(),
						endpoint: z.string().optional(),
						kind: z.enum(["installed", "catalog"]).optional(),
					})
					.optional(),
				runtimeProfile: z.string().min(1).optional(),
			},
		},
		createGrokConnectorsToolHandler(resolveService),
	);
}
