import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GrokConversationInventory } from "../../browser/grokConversationsService.js";
import {
	GrokConversationsRequestSchema,
	type GrokConversationsServiceResolver,
	grokConversationsFailureResult,
	grokConversationsInputShape,
	runGrokConversationsCommand,
} from "../../cli/grokConversationsCommand.js";

export function createGrokConversationsToolHandler(
	resolveService: GrokConversationsServiceResolver,
) {
	return async (input: unknown) => {
		let result: GrokConversationInventory;
		const parsed = GrokConversationsRequestSchema.safeParse(input ?? {});
		if (!parsed.success)
			result = grokConversationsFailureResult(undefined, "history-invalid-request");
		else {
			try {
				result = await runGrokConversationsCommand(parsed.data, await resolveService(parsed.data));
			} catch {
				result = grokConversationsFailureResult(parsed.data.projectId);
			}
		}
		return {
			content: [
				{
					type: "text" as const,
					text: `Grok conversation inventory: ${result.coverage.state} (${result.coverage.reason}).`,
				},
			],
			structuredContent: result as GrokConversationInventory & Record<string, unknown>,
			isError: result.coverage.state === "failed",
		};
	};
}
export function registerGrokConversationsTool(
	server: McpServer,
	resolveService: GrokConversationsServiceResolver,
): void {
	server.registerTool(
		"grok_conversations",
		{
			title: "Discover Grok conversations",
			description:
				"Read a bounded visible Chats inventory with explicit coverage and scope-bound continuation. No cached fallback or account-wide completeness claim.",
			inputSchema: grokConversationsInputShape,
		},
		createGrokConversationsToolHandler(resolveService),
	);
}
