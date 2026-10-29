// biome-ignore-all lint/style/useNamingConvention: Native DOM/CDP wire names.
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { createResponsesHttpServer } from "../../src/http/responsesServer.js";
import { createGrokBotLifecycleClient } from "../../src/browser/providers/grokBotLifecycle.js";
import { ConnectorFixtureNode as N } from "./grok404ConnectorDomFixture.js";
const id = "11111111-2222-4333-8444-555555555555";
function fixture(extra: N[] = [], routeId = id) {
	const fields = ["name", "title", "description"].map((key) => {
		const field = new N("input", "", { id: `bot-settings-${key}` });
		field.value = key === "name" ? "Canary" : "Existing";
		return field;
	});
	const dialog = new N("div", "Settings", { role: "dialog" }, [...fields, ...extra]);
	const document = new N("document", "", {}, [dialog, new N("button", "Plugins")]);
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => ({
			result: {
				value: await runInNewContext(expression, {
					document,
					location: { href: `https://grok.com/bot/${routeId}` },
					URL,
					getComputedStyle: () => ({ display: "block", visibility: "visible" }),
				}),
			},
		}),
	};
	return { runtime, dialog };
}
test("exact Bot resource discovery reports scoped missing controls without treating global Plugins as a grant", async () => {
	const result = await createGrokBotLifecycleClient(fixture().runtime).resources({
		id,
		name: "Canary",
	});
	expect(result).toMatchObject({
		status: "unavailable",
		code: "grok_bot_resource_controls_unavailable",
		effectState: "none",
		bot: { id, name: "Canary" },
		resources: {
			scope: "exact-bot-settings",
			connectors: { status: "unavailable", choices: null, granted: null },
			skills: { status: "unavailable", choices: null, granted: null },
			knowledge: { status: "unavailable", choices: null, granted: null },
		},
	});
});

test("CLI, HTTP and MCP expose same governed exact Bot resource observation without writes or inventory claims", async () => {
	const { createGrokBotLifecycleService } = await import(
		"../../src/browser/grokBotLifecycleService.js"
	);
	const { runGrokBotsCommand } = await import("../../src/cli/grokBotsCommand.js");
	const { createGrokBotsToolHandler } = await import("../../src/mcp/tools/grokBots.js");
	const f = fixture();
	const account = "a".repeat(64);
	const lifecycle = createGrokBotLifecycleService(
		{},
		{
			connect: async () => ({
				client: {
					Runtime: f.runtime,
					close: async () => {},
					__auracallProviderTrafficGovernor: {
						attribution: { provider: "grok", targetId: "owned-target" },
						admitBackendRequest: async () => {},
						begin: async () => ({ settle: async () => {} }),
					},
				},
				targetId: "owned-target",
				host: "localhost",
				port: 1,
				shouldClose: false,
			}),
			verifyAccount: async () => account,
		},
	);
	const service = {
		list: async () => {
			throw Error("unexpected list");
		},
		invoke: async () => {
			throw Error("unexpected invocation");
		},
		lifecycle: lifecycle.run,
	};
	const input = {
		action: "resources",
		selector: { id, name: "Canary" },
		targetId: "owned-target",
		expectedProviderAccountRef: account,
	};
	const result = await runGrokBotsCommand(input, service);
	expect(result).toMatchObject({
		status: "unavailable",
		code: "grok_bot_resource_controls_unavailable",
		providerAccountRef: account,
		targetId: "owned-target",
		resources: { connectors: { granted: null } },
	});
	const mcp = await createGrokBotsToolHandler(async () => service)(input);
	expect(mcp.structuredContent).toEqual(result);
	expect(mcp.isError).toBe(true);
	const server = await createResponsesHttpServer(
		{ host: "127.0.0.1", port: 0 },
		{ grokBotsServiceResolver: async () => service },
	);
	try {
		const response = await fetch(`http://127.0.0.1:${server.port}/v1/grok/bots/query`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(result);
	} finally {
		await server.close();
	}
});

test("an unqualified knowledge section stays unknown while a different Bot route provides no resource absence proof", async () => {
	const section = new N("h2", "Knowledge sources");
	const result = await createGrokBotLifecycleClient(fixture([section]).runtime).resources({
		id,
		name: "Canary",
	});
	expect(result).toMatchObject({
		status: "unknown",
		code: "grok_bot_resource_controls_unqualified",
		resources: { knowledge: { status: "unknown", choices: null, granted: null } },
	});
	const wrong = await createGrokBotLifecycleClient(
		fixture([], "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee").runtime,
	).resources({ id, name: "Canary" });
	expect(wrong.status).toBe("unknown");
	expect(wrong.resources).toBeUndefined();
});
