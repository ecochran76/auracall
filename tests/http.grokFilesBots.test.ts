import type { GrokFilesResult } from "../src/browser/providers/grokFiles.js";
import { expect, test, vi } from "vitest";
import { createResponsesHttpServer } from "../src/http/responsesServer.js";

test("HTTP Grok file selection uses the exact file ID and preserves its provenance envelope", async () => {
	const result: GrokFilesResult = {
		status: "complete",
		code: "grok_file_selected",
		providerAccountRef: "fixture-account",
		provenance: {
			targetId: "target",
			projectId: null,
			conversationId: "conversation",
			composerId: "composer",
		},
		files: [{ id: "file-two", name: "duplicate.txt", state: "ready" }],
		coverage: { scope: "composer", complete: true },
		limits: { accept: null, multiple: true, observedMessage: null },
	};
	const select = vi.fn(async () => result);
	const resolver = vi.fn(async () => ({
		context: async () => result,
		recent: async () => result,
		select,
		upload: async () => result,
	}));
	const server = await createResponsesHttpServer(
		{ host: "127.0.0.1", port: 0 },
		{ grokFilesServiceResolver: resolver },
	);
	try {
		const response = await fetch(`http://127.0.0.1:${server.port}/v1/grok/files/query`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ action: "select", id: "file-two", runtimeProfile: "default" }),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(result);
		expect(select).toHaveBeenCalledWith("file-two");
		expect(resolver).toHaveBeenCalledWith({
			action: "select",
			id: "file-two",
			runtimeProfile: "default",
		});
	} finally {
		await server.close();
	}
});

test("HTTP Grok Bot invocation preserves exact prompt whitespace and selector custody", async () => {
	const { grokBotUnknown } = await import("../src/browser/grokBotsService.js");
	const result = grokBotUnknown("grok_bot_selection_unverified");
	const invoke = vi.fn(async () => result);
	const resolver = vi.fn(async () => ({
		list: async () => ({
			status: "unknown" as const,
			code: "grok_bot_inventory_unknown",
			providerAccountRef: null,
			bots: [],
			coverage: { scope: "visible" as const, complete: false as const },
		}),
		invoke,
	}));
	const server = await createResponsesHttpServer(
		{ host: "127.0.0.1", port: 0 },
		{ grokBotsServiceResolver: resolver },
	);
	try {
		const prompt = "  exact\nBot instruction  ";
		const response = await fetch(`http://127.0.0.1:${server.port}/v1/grok/bots/query`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action: "invoke",
				selector: { id: "bot-two", source: "owned", author: "Author" },
				prompt,
			}),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(result);
		expect(invoke).toHaveBeenCalledWith(
			{ id: "bot-two", source: "owned", author: "Author" },
			prompt,
		);
	} finally {
		await server.close();
	}
});
test("Grok files and Bots reject malformed JSON without returning private caller input", async () => {
	const server = await createResponsesHttpServer({ host: "127.0.0.1", port: 0 }, {});
	try {
		for (const surface of ["files", "bots"]) {
			const response = await fetch(`http://127.0.0.1:${server.port}/v1/grok/${surface}/query`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: '{"private-token',
			});
			expect(response.status).toBe(400);
			expect(await response.text()).not.toContain("private-token");
		}
	} finally {
		await server.close();
	}
});
