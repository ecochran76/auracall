import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	GrokConnectorsRequestSchema,
	GrokConnectorInstallationInputSchema,
	type GrokConnectorsResult,
	type GrokConnectorsServiceResolver,
	grokConnectorsFailureResult,
	grokConnectorsResultIsError,
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
					text: `Grok Connector operation: ${result.status} (${result.code}).`,
				},
			],
			structuredContent: result as typeof result & Record<string, unknown>,
			isError: grokConnectorsResultIsError(result),
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
			title: "Manage Grok Connectors",
			description:
				"List/inspect Grok Connectors, explicitly install an exact custom MCP endpoint, or reconcile its retained target. Install requires confirm=true and exact provider account hash. OAuth/consent remains human; never automatically retries an uncertain install.",
			inputSchema: {
				action: z.enum(["list", "inspect", "install", "reconcile"]),
				input: GrokConnectorInstallationInputSchema.optional(),
				expectedProviderAccountRef: z
					.string()
					.regex(/^[a-f0-9]{64}$/)
					.optional(),
				confirm: z.literal(true).optional(),
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
