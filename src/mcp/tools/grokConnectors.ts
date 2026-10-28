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
				"List/inspect Grok Connectors, explicitly install an exact custom MCP endpoint, reconcile its retained target, or invoke through an exact enabled Connector in a retained composer. Install/invoke require confirm=true and exact provider account hash. Invocation has a durable no-replay fence and remains unconfirmed without native tool/result attribution. OAuth/consent remains human; never automatically retries an uncertain install.",
			inputSchema: {
				action: z.enum(["list", "inspect", "install", "reconcile", "invoke"]),
				input: GrokConnectorInstallationInputSchema.optional(),
				targetId: z
					.string()
					.regex(/^[A-Za-z0-9-]{1,512}$/)
					.optional(),
				prompt: z.string().min(1).max(100000).optional(),
				expectedProviderAccountRef: z
					.string()
					.regex(/^[a-f0-9]{64}$/)
					.optional(),
				confirm: z.literal(true).optional(),
				reconciliationTarget: z
					.object({
						targetId: z.string().regex(/^[A-Za-z0-9-]{1,512}$/),
						connectorId: z.string().regex(/^connector_[0-9a-f-]{36}$/i),
					})
					.strict()
					.optional(),
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
