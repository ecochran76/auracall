import { expect, test } from "vitest";
import { createGrokConversationsService } from "../../src/browser/grokConversationsService.js";
import { runGrokConversationsCommand } from "../../src/cli/grokConversationsCommand.js";
import { createGrokConversationsToolHandler } from "../../src/mcp/tools/grokConversations.js";
import { historyTransportFixture } from "./grok401ConversationTransportFixture.js";

test("CLI and MCP preserve an explicit empty public inventory envelope", async () => {
	const resolve = () => {
		const fixture = historyTransportFixture();
		return createGrokConversationsService(fixture.options, fixture.dependencies);
	};
	const request = { maxPages: 1, limit: 2 };
	const cli = await runGrokConversationsCommand(request, resolve());
	const mcp = await createGrokConversationsToolHandler(resolve)(request);
	expect(cli.coverage.state).toBe("empty");
	expect(mcp.structuredContent).toMatchObject({
		object: "grok_conversation_inventory",
		items: [],
		coverage: { state: "empty", loadedCount: 0 },
	});
});

test("invalid bounds stop before service dispatch and private resolver errors stay bounded", async () => {
	let dispatched = false;
	const invalid = await runGrokConversationsCommand(
		{ limit: 10001 },
		{
			list: async () => {
				dispatched = true;
				throw new Error("must not call");
			},
		},
	);
	expect(invalid.coverage).toMatchObject({ state: "failed", reason: "history-invalid-request" });
	expect(dispatched).toBe(false);
	const failed = await createGrokConversationsToolHandler(() => {
		throw new Error("private title secret-id https://private.test/?token=secret");
	})({});
	expect(failed).toMatchObject({
		isError: true,
		structuredContent: {
			items: [],
			coverage: { state: "failed", reason: "history-read-failed", nextCursor: null },
		},
	});
	expect(JSON.stringify(failed)).not.toContain("private");
});
