// biome-ignore-all lint/style/useNamingConvention: CDP and DOM fixtures preserve platform wire names.
import { expect, test } from "vitest";
import { runInNewContext } from "node:vm";
import { ConnectorFixtureNode as N } from "./grok404ConnectorDomFixture.js";
import { createGrokBotClient } from "../../src/browser/providers/grokBots.js";

function fixture() {
	const tab = new N("button", "Bots", { role: "tab", "aria-selected": "true" });
	const add = new N("button", "Add");
	add.onClick = () => {
		throw new Error("must never install");
	};
	const dialog = new N("div", "Plugins", { role: "dialog" }, [
		tab,
		new N("div", "", {}, [
			new N("a", "Helper\nBy Alice", { href: "/bot/bot-alice", "data-author": "Alice" }),
			add,
		]),
		new N("div", "", {}, [
			new N("a", "Helper\nBy Bob", { href: "/bot/bot-bob", "data-author": "Bob" }),
		]),
	]);
	const document = new N("document", "", {}, [dialog]);
	return {
		runtime: {
			evaluate: async ({ expression }: { expression: string }) => ({
				result: {
					value: runInNewContext(expression, {
						document,
						location: { href: "https://grok.com/" },
						getComputedStyle: () => ({ display: "block", visibility: "visible" }),
						URL,
					}),
				},
			}),
		},
	};
}
test("catalog inventory retains stable identity and author for duplicate names without installing", async () => {
	const client = createGrokBotClient(fixture().runtime);
	const result = await client.list("catalog");
	expect(result.status).toBe("supported");
	expect(result.bots).toEqual([
		{ id: "bot-alice", name: "Helper", author: "Alice", source: "catalog" },
		{ id: "bot-bob", name: "Helper", author: "Bob", source: "catalog" },
	]);
	expect(result.coverage.complete).toBe(false);
});

import { createGrokBotsService } from "../../src/browser/grokBotsService.js";
test("public Bot service rejects a connection without account-wide traffic authority before reading DOM", async () => {
	let closed = false;
	const service = createGrokBotsService(
		{},
		{
			connect: async () => ({
				client: {
					Runtime: fixture().runtime,
					close: async () => {
						closed = true;
					},
				},
				host: "localhost",
				port: 1,
				targetId: "target",
				shouldClose: false,
			}),
		},
	);
	await expect(service.list("catalog")).rejects.toThrow("grok_bot_governor_required");
	expect(closed).toBe(true);
});

test("configured authority service returns catalog inventory with same-account pre/post proof", async () => {
	const dom = fixture();
	let proofs = 0;
	const sources: string[] = [];
	const client = {
		Runtime: dom.runtime,
		close: async () => {},
		__auracallProviderTrafficGovernor: {
			attribution: { provider: "grok", targetId: "target" },
			admitBackendRequest: async () => {},
			begin: async (input: { source: string }) => {
				sources.push(input.source);
				return { settle: async () => {} };
			},
		},
	};
	const service = createGrokBotsService(
		{},
		{
			connect: async () => ({
				client,
				host: "localhost",
				port: 1,
				targetId: "target",
				shouldClose: false,
			}),
			verifyAccount: async () => {
				proofs++;
				return "account-ref";
			},
		},
	);
	const result = await service.list("catalog");
	expect(result.status).toBe("supported");
	expect(result.bots.map((b) => b.id)).toEqual(["bot-alice", "bot-bob"]);
	expect(result.providerAccountRef).toBe("account-ref");
	expect(proofs).toBe(2);
	expect(sources).toContain("provider:grok:bots");
});
test("public service rejects an account change instead of returning catalog success", async () => {
	const dom = fixture();
	let proofs = 0;
	const client = {
		Runtime: dom.runtime,
		close: async () => {},
		__auracallProviderTrafficGovernor: {
			attribution: { provider: "grok", targetId: "target" },
			admitBackendRequest: async () => {},
			begin: async () => ({ settle: async () => {} }),
		},
	};
	const service = createGrokBotsService(
		{},
		{
			connect: async () => ({
				client,
				host: "localhost",
				port: 1,
				targetId: "target",
				shouldClose: false,
			}),
			verifyAccount: async () => (++proofs === 1 ? "account-a" : "account-b"),
		},
	);
	await expect(service.list("catalog")).rejects.toThrow("grok_bot_account_not_verified");
});

import {
	GrokBotsRequestSchema,
	runGrokBotsCommand,
	summarizeGrokBotDiagnostics,
} from "../../src/cli/grokBotsCommand.js";
import { createGrokBotsToolHandler } from "../../src/mcp/tools/grokBots.js";
test("public schema excludes install/remove/scheduling and name-only invocation", () => {
	for (const action of ["install", "remove", "schedule"])
		expect(
			GrokBotsRequestSchema.safeParse({
				action,
				selector: { id: "a", source: "owned" },
				prompt: "hello",
			}).success,
		).toBe(false);
	expect(
		GrokBotsRequestSchema.safeParse({
			action: "invoke",
			selector: { name: "Helper", source: "owned" },
			prompt: "hello",
		}).success,
	).toBe(false);
});
test("CLI/API command and MCP preserve explicit deferred catalog invocation without installing", async () => {
	const client = {
		Runtime: fixture().runtime,
		close: async () => {},
		__auracallProviderTrafficGovernor: {
			attribution: { provider: "grok", targetId: "target" },
			admitBackendRequest: async () => {},
			begin: async () => ({ settle: async () => {} }),
		},
	};
	const service = createGrokBotsService(
		{},
		{
			connect: async () => ({
				client,
				host: "localhost",
				port: 1,
				targetId: "target",
				shouldClose: false,
			}),
			verifyAccount: async () => "account-ref",
		},
	);
	const request = {
		action: "invoke",
		selector: { id: "bot-alice", source: "catalog" },
		prompt: "hello",
	};
	const direct = await runGrokBotsCommand(request, service);
	expect(direct.status).toBe("blocked");
	expect(direct.code).toBe("grok_bot_catalog_installation_deferred");
	const mcp = await createGrokBotsToolHandler(() => service)(request);
	expect(mcp.structuredContent).toEqual(direct);
	expect(mcp.isError).toBe(true);
	expect(JSON.stringify(summarizeGrokBotDiagnostics(direct))).not.toContain("bot-alice");
});

import { vi, afterEach } from "vitest";
import * as textActions from "../../src/browser/actions/grok.js";
afterEach(() => vi.restoreAllMocks());
function ownedFixture(wrongToken = false, artifact = false) {
	const composer = Object.assign(new N("div", "", { contenteditable: "true" }), {
		focus: () => {},
	});
	const option = new N("button", "Helper\nBy Alice", {
		"data-bot-id": "bot-alice",
		"data-author": "Alice",
		role: "option",
	});
	const menu = new N("div", "Bots", { role: "listbox" }, [option]);
	menu.hidden = true;
	option.onClick = () => {
		menu.hidden = true;
		composer.children = [
			new N("span", "@Helper", {
				contenteditable: "false",
				"data-bot-id": wrongToken ? "other-bot" : "bot-alice",
			}),
		];
	};
	const document = new N("document", "", {}, [
		composer,
		menu,
		...(artifact
			? [
					new N("div", "", { id: "assistant-1" }, [
						new N("a", "report.txt", { href: "/files/artifact-1", download: "report.txt" }),
					]),
				]
			: []),
	]);
	let url = "https://grok.com/";
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => ({
			result: {
				value: runInNewContext(expression, {
					document,
					location: { href: url },
					getComputedStyle: () => ({ display: "block", visibility: "visible" }),
					URL,
				}),
			},
		}),
	};
	const input = {
		insertText: async () => {
			menu.hidden = false;
		},
	};
	const client = {
		Runtime: runtime,
		Input: input,
		close: async () => {},
		__auracallProviderTrafficGovernor: {
			attribution: { provider: "grok", targetId: "target" },
			admitBackendRequest: async () => {},
			begin: async () => ({ settle: async () => {} }),
		},
	};
	const service = createGrokBotsService(
		{},
		{
			connect: async () => ({
				client: client as never,
				host: "localhost",
				port: 1,
				targetId: "target",
				shouldClose: false,
			}),
			verifyAccount: async () => "account-ref",
		},
	);
	return {
		service,
		runtime,
		setCompleted: () => {
			url = "https://grok.com/c/conversation-1";
		},
	};
}
test("same-connection invocation proves exact Bot token before submission and retains completed result provenance", async () => {
	const fixture = ownedFixture();
	const snapshot = {
		count: 1,
		lastText: "Answer",
		lastMarkdown: "Answer",
		lastHtml: "",
		toastText: "",
		responseId: "assistant-1",
		streaming: false,
		terminal: true,
		terminalEvidence: "controls",
	};
	vi.spyOn(textActions, "readGrokAssistantSnapshotForRuntime").mockResolvedValue(snapshot);
	const prepare = vi.spyOn(textActions, "setGrokPrompt").mockResolvedValue();
	const submit = vi.spyOn(textActions, "submitGrokPrompt").mockImplementation(async () => {
		fixture.setCompleted();
	});
	vi.spyOn(textActions, "waitForGrokAssistantResult").mockResolvedValue({
		text: "Answer",
		markdown: "Answer",
	});
	const result = await fixture.service.invoke(
		{ id: "bot-alice", source: "owned", author: "Alice" },
		"Question",
	);
	expect(result).toMatchObject({
		status: "supported",
		effectState: "completed",
		bot: { id: "bot-alice", author: "Alice" },
		providerAccountRef: "account-ref",
		conversationId: "conversation-1",
		responseId: "assistant-1",
		text: "Answer",
		artifacts: { status: "unknown" },
	});
	expect(prepare.mock.calls[0][1]).toBe(fixture.runtime);
	expect(submit.mock.calls[0][1]).toBe(fixture.runtime);
});
test("a different Bot token after picker selection prevents prompt preparation and Send", async () => {
	const fixture = ownedFixture(true);
	const prepare = vi.spyOn(textActions, "setGrokPrompt");
	const submit = vi.spyOn(textActions, "submitGrokPrompt");
	const result = await fixture.service.invoke({ id: "bot-alice", source: "owned" }, "Question");
	expect(result.status).toBe("unknown");
	expect(result.code).toBe("grok_bot_selection_unverified");
	expect(prepare).not.toHaveBeenCalled();
	expect(submit).not.toHaveBeenCalled();
});

test("public invocation transport failures preserve uncertain effect instead of claiming no submission", async () => {
	const service = {
		list: async () => {
			throw new Error("private");
		},
		invoke: async () => {
			throw new Error("private");
		},
	};
	const result = await runGrokBotsCommand(
		{ action: "invoke", selector: { id: "bot-alice", source: "owned" }, prompt: "Question" },
		service,
	);
	expect(result).toMatchObject({ status: "unknown", effectState: "unknown" });
	expect(JSON.stringify(result)).not.toContain("private");
});

test("completed Bot result retains response-scoped artifact references with Bot/account/conversation custody", async () => {
	const fixture = ownedFixture(false, true);
	vi.spyOn(textActions, "readGrokAssistantSnapshotForRuntime").mockResolvedValue({
		count: 1,
		lastText: "Answer",
		lastMarkdown: "Answer",
		lastHtml: "",
		toastText: "",
		responseId: "assistant-1",
		streaming: false,
		terminal: true,
		terminalEvidence: "controls",
	});
	vi.spyOn(textActions, "setGrokPrompt").mockResolvedValue();
	vi.spyOn(textActions, "submitGrokPrompt").mockImplementation(async () => {
		fixture.setCompleted();
	});
	vi.spyOn(textActions, "waitForGrokAssistantResult").mockResolvedValue({
		text: "Answer",
		markdown: "Answer",
	});
	const result = await fixture.service.invoke({ id: "bot-alice", source: "owned" }, "Question");
	expect(result.artifacts).toMatchObject({
		status: "observed",
		complete: false,
		references: [
			{
				id: "artifact-1",
				name: "report.txt",
				url: "https://grok.com/files/artifact-1",
				botId: "bot-alice",
				providerAccountRef: "account-ref",
				conversationId: "conversation-1",
				responseId: "assistant-1",
			},
		],
	});
});

test("a final snapshot for another response cannot claim the completed Bot answer", async () => {
	const fixture = ownedFixture();
	vi.spyOn(textActions, "readGrokAssistantSnapshotForRuntime").mockResolvedValue({
		count: 2,
		lastText: "Unrelated answer",
		lastMarkdown: "Unrelated answer",
		lastHtml: "",
		toastText: "",
		responseId: "assistant-other",
		streaming: false,
		terminal: true,
		terminalEvidence: "controls",
	});
	vi.spyOn(textActions, "setGrokPrompt").mockResolvedValue();
	vi.spyOn(textActions, "submitGrokPrompt").mockImplementation(async () => {
		fixture.setCompleted();
	});
	vi.spyOn(textActions, "waitForGrokAssistantResult").mockResolvedValue({
		text: "Expected Bot answer",
		markdown: "Expected Bot answer",
	});
	const result = await fixture.service.invoke({ id: "bot-alice", source: "owned" }, "Question");
	expect(result).toMatchObject({
		status: "unknown",
		effectState: "unknown",
		code: "grok_bot_result_attribution_unknown",
		text: null,
	});
});

test("public Bot invocation preserves exact prompt whitespace", async () => {
	let received = "";
	const service = {
		list: async () => {
			throw new Error("unused");
		},
		invoke: async (_selector: unknown, prompt: string) => {
			received = prompt;
			return {
				status: "unknown" as const,
				targetId: null,
				code: "fixture",
				providerAccountRef: null,
				bot: null,
				conversationId: null,
				conversationUrl: null,
				responseId: null,
				text: null,
				markdown: null,
				artifacts: { status: "unknown" as const, code: "grok_bot_artifact_inventory_not_observed" },
				effectState: "none" as const,
			};
		},
	};
	await runGrokBotsCommand(
		{ action: "invoke", selector: { id: "bot-alice", source: "owned" }, prompt: "  Question\n  " },
		service,
	);
	expect(received).toBe("  Question\n  ");
});

test("unknown invocation retains its exact browser target locator for reconciliation", async () => {
	const fixture = ownedFixture(true);
	const result = await fixture.service.invoke({ id: "bot-alice", source: "owned" }, "Question");
	expect(result).toMatchObject({ targetId: "target", effectState: "none", status: "unknown" });
});

test('operation admission rejects before Bot account discovery begins', async () => {
 const verifyAccount=vi.fn(async()=> 'account-ref');
 const close=vi.fn(async()=>{});
 const begin=vi.fn(async()=>{throw new Error('operation-cap');});
 const service=createGrokBotsService({}, {connect:async()=>({client:{Runtime:fixture().runtime,close,__auracallProviderTrafficGovernor:{attribution:{provider:'grok',targetId:'target'},admitBackendRequest:async()=>{},begin}},targetId:'target',shouldClose:false,host:'localhost',port:1}),verifyAccount});
 await expect(service.list('catalog')).rejects.toThrow('operation-cap');
 expect(verifyAccount).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();
});
