// biome-ignore-all lint/style/useNamingConvention: Browser global names are case-sensitive.
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { createGrokConnectorClient } from "../../src/browser/providers/grokConnectors.js";
const id = "connector_11111111-1111-4111-8111-111111111111";
const endpoint = "https://example.test/mcp";
function fixture(change: Record<string, unknown> = {}, toolChange: Record<string, unknown> = {}) {
	const calls: string[] = [];
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => ({
			result: {
				value: await runInNewContext(expression, {
					location: { origin: "https://grok.com" },
					URL,
					AbortController,
					setTimeout,
					clearTimeout,
					fetch: async (url: string, options: { body: string }) => {
						calls.push(url);
						const request = JSON.parse(options.body);
						expect(request.scopeId).toBe("actor");
						return {
							ok: true,
							text: async () =>
								JSON.stringify(
									url.endsWith("/get")
										? {
												connector: {
													connectorId: id,
													name: "Example",
													scope: "CONNECTOR_SCOPE_USER",
													scopeId: "actor",
													connectorType: "CONNECTOR_TYPE_MCP",
													hasValidOauthTokens: true,
													connectorConfig: {
														mcpConfig: {
															serverUrl: endpoint,
															isEnabled: true,
															requiresOauth: true,
														},
													},
													...change,
												},
											}
										: {
												mcpTools: [
													{
														remoteName: "mail_search",
														connectorId: id,
														serverUrl: endpoint,
														isBlocked: false,
														...toolChange,
													},
												],
												connectorIdsNeedingReauth: [],
												connectorsNeedingReauth: [],
											},
								),
						};
					},
				}),
			},
		}),
	};
	return { client: createGrokConnectorClient(runtime, { providerUserId: "actor" }), calls };
}
it("reads an exact native MCP ID missing from the gallery without invoking tools", async () => {
	const { client, calls } = fixture();
	const detail = await client.inspect({ id, name: "Example", endpoint });
	expect(detail.status).toBe("complete");
	expect(detail.tools).toEqual(["mail_search"]);
	expect(detail.accountRef).toBeNull();
	expect(detail.auth).toBe("connected");
	expect(calls).toEqual(["/rest/connectors/get", "/rest/mcp/discovered-tools/list"]);
});
it.each([
	{ scopeId: "other" },
	{ connectorId: "other" },
	{ hasValidOauthTokens: false },
])("refuses mismatched or unauthenticated native record %j", async (change) => {
	const { client } = fixture(change);
	expect((await client.inspect({ id })).status).not.toBe("complete");
});
it("refuses tools belonging to a different connector", async () => {
	const { client } = fixture({}, { connectorId: "other" });
	expect((await client.inspect({ id })).status).not.toBe("complete");
});

it("enforces all explicit selectors on the exact-ID read", async () => {
	const { client } = fixture();
	expect((await client.inspect({ id, name: "Other" })).status).toBe("incomplete");
	expect((await client.inspect({ id, endpoint: "https://other.test/mcp" })).status).toBe(
		"incomplete",
	);
});
it("keeps blocked tools out of qualified catalogs", async () => {
	const { client } = fixture({}, { isBlocked: true });
	expect((await client.inspect({ id })).status).toBe("incomplete");
});
it("limits target recovery to public reconciliation requests", async () => {
	const { GrokConnectorsRequestSchema } = await import("../../src/cli/grokConnectorsCommand.js");
	const common = {
		input: { kind: "custom", name: "Example", endpoint },
		expectedProviderAccountRef: "a".repeat(64),
		reconciliationTarget: { targetId: "replacement", connectorId: id },
	};
	expect(GrokConnectorsRequestSchema.safeParse({ ...common, action: "reconcile" }).success).toBe(
		true,
	);
	expect(
		GrokConnectorsRequestSchema.safeParse({ ...common, action: "install", confirm: true }).success,
	).toBe(false);
});

it("advertises target recovery in the actual MCP tool schema", async () => {
	const { registerGrokConnectorsTool } = await import("../../src/mcp/tools/grokConnectors.js");
	let schema: Record<string, { parse: (value: unknown) => unknown }> | undefined;
	const server = {
		registerTool: (_name: string, definition: { inputSchema: typeof schema }) => {
			schema = definition.inputSchema;
		},
	};
	registerGrokConnectorsTool(
		server as unknown as Parameters<typeof registerGrokConnectorsTool>[0],
		async () => {
			throw new Error("not invoked");
		},
	);
	expect(schema?.reconciliationTarget.parse({ targetId: "replacement", connectorId: id })).toEqual({
		targetId: "replacement",
		connectorId: id,
	});
});
