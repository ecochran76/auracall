import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { readGrokConnectorToolTrace } from "../../src/browser/providers/grokConnectorToolTrace.js";
import { ConnectorFixtureNode as N } from "./grok404ConnectorDomFixture.js";

function fixture() {
	const row = Object.assign(new N("div"), { id: "response-native" });
	const body = new N("body", "", {}, [row]);
	const document = { body, querySelectorAll: () => [row] };
	const response = {
		responseId: "native",
		conversationId: "conversation-native",
		sender: "assistant",
		state: "closed",
		partial: false,
		traceSteps: [
			{
				type: "tool",
				cards: [
					{
						toolUsageCardId: "call-native",
						mcp: {
							connectorId: "connector-native",
							connectorName: "Example",
							toolName: "example___accounts",
							toolArgsJson: "{}",
							toolResultJson: '{"structuredContent":{"accounts":[]},"isError":false}',
						},
					},
				],
			},
		],
		toolSettledByCardId: { "call-native": true },
	};
	const owner: { current: unknown } = { current: null };
	interface Fiber {
		tag: number;
		stateNode?: unknown;
		return: Fiber | null;
		child?: Fiber;
		memoizedProps?: Record<string, unknown>;
	}
	const root: Fiber = { tag: 3, stateNode: owner, return: null };
	const scope: Fiber = { tag: 5, stateNode: body, return: root };
	const provider: Fiber = {
		tag: 0,
		memoizedProps: { response, selectedId: "native" },
		return: scope,
	};
	const host: Fiber = { tag: 5, stateNode: row, return: provider };
	root.child = scope;
	scope.child = provider;
	provider.child = host;
	owner.current = root;
	Object.defineProperty(row, "__reactFiber$fixture", { value: host, enumerable: true });
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => ({
			result: {
				value: runInNewContext(expression, {
					document,
					location: { origin: "https://grok.com", pathname: "/c/conversation-native" },
					getComputedStyle: () => ({ display: "block", visibility: "visible" }),
				}),
			},
		}),
	};
	return { runtime, response };
}
it("returns actual settled native MCP tool results bound to the exact selected Connector and response", async () => {
	const f = fixture();
	expect(
		await readGrokConnectorToolTrace(f.runtime, {
			responseId: "response-native",
			connector: { id: "connector-native", name: "Example" },
		}),
	).toMatchObject({
		status: "observed",
		conversationId: "conversation-native",
		responseId: "response-native",
		otherTools: [],
		calls: [
			{
				cardId: "call-native",
				connectorId: "connector-native",
				toolName: "example___accounts",
				arguments: {},
				result: { structuredContent: { accounts: [] }, isError: false },
			},
		],
	});
});
