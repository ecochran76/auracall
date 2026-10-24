import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { grokFilesFailure } from "../../browser/providers/grokFiles.js";
import {
	GrokFilesRequestSchema,
	type GrokFilesServiceResolver,
	runGrokFilesCommand,
} from "../../cli/grokFilesCommand.js";
export function createGrokFilesToolHandler(resolveService: GrokFilesServiceResolver) {
	return async (input: unknown) => {
		let result = grokFilesFailure();
		try {
			const request = GrokFilesRequestSchema.parse(input);
			result = await runGrokFilesCommand(request, await resolveService(request));
		} catch {
			result = grokFilesFailure();
		}
		return {
			content: [{ type: "text" as const, text: `Grok files: ${result.status} (${result.code}).` }],
			structuredContent: result as typeof result & Record<string, unknown>,
			isError: result.status === "failed" || result.status === "unconfirmed",
		};
	};
}
export function registerGrokFilesTool(
	server: McpServer,
	resolveService: GrokFilesServiceResolver,
): void {
	server.registerTool(
		"grok_files",
		{
			title: "Grok composer files",
			description:
				"Inspect exact composer/project context, enumerate visible recent file IDs, select by stable ID or upload local paths and require exact readiness. Does not submit a prompt. Unknown outcomes require reconciliation before retry.",
			inputSchema: {
				action: z.enum(["context", "recent", "select", "upload"]),
				id: z.string().optional(),
				paths: z.array(z.string()).optional(),
				runtimeProfile: z.string().optional(),
			},
		},
		createGrokFilesToolHandler(resolveService),
	);
}
