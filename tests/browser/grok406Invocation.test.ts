import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createGrokConnectorInvocationService } from "../../src/browser/grokConnectorInvocationService.js";

it("never resubmits an uncertain invocation after service restart", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "grok406-"));
	let submissions = 0;
	const request = {
		action: "invoke" as const,
		targetId: "EXACT-TARGET",
		expectedProviderAccountRef: "a".repeat(64),
		selector: { id: "connector-native", name: "Example", endpoint: "https://example.test/mcp" },
		prompt: "Use Example accounts only. Do not send anything.",
		confirm: true as const,
	};
	const port = {
		prepare: async () => true,
		submit: async () => {
			submissions++;
			throw new Error("lost acknowledgement");
		},
		observe: async () => ({ responseId: null, text: null }),
	};
	try {
		const service = createGrokConnectorInvocationService({ directory, open: async () => port });
		const first = await service.invoke(request);
		expect(first.effectState).toBe("unknown");
		const restarted = createGrokConnectorInvocationService({ directory, open: async () => port });
		const reconciled = await restarted.invoke(request);
		expect(reconciled.operationId).toBe(first.operationId);
		expect(reconciled.retrySafe).toBe(false);
		expect(submissions).toBe(1);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
it("routes an exact confirmed invocation through the existing public Connector command", async () => {
	const { runGrokConnectorsCommand } = await import("../../src/cli/grokConnectorsCommand.js");
	const request = {
		action: "invoke",
		targetId: "EXACT-TARGET",
		expectedProviderAccountRef: "a".repeat(64),
		selector: { id: "connector-native", name: "Example", endpoint: "https://example.test/mcp" },
		prompt: "Use Example accounts only.",
		confirm: true,
	};
	let invoked = false;
	const result = await runGrokConnectorsCommand(request, {
		list: async () => {
			throw new Error("wrong action");
		},
		inspect: async () => {
			throw new Error("wrong action");
		},
		invoke: async () => {
			invoked = true;
			return {
				status: "unconfirmed",
				code: "grok_connector_native_tool_trace_unconfirmed",
				operationId: "b".repeat(64),
				providerAccountRef: "a".repeat(64),
				targetId: "EXACT-TARGET",
				responseId: null,
				text: null,
				effectState: "unknown",
				retrySafe: false,
				toolTrace: null,
			};
		},
	});
	expect(invoked).toBe(true);
	expect(result.code).toBe("grok_connector_native_tool_trace_unconfirmed");
});
it("retains the invocation operation and unknown custody when transport cleanup fails", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "grok406-"));
	try {
		const service = createGrokConnectorInvocationService({
			directory,
			open: async () => ({
				prepare: async () => true,
				submit: async () => {},
				observe: async () => ({
					responseId: "response-native",
					text: "Assistant text is not tool proof",
				}),
				close: async () => {
					throw new Error("transport cleanup unknown");
				},
			}),
		});
		const result = await service.invoke({
			action: "invoke",
			targetId: "EXACT-TARGET",
			expectedProviderAccountRef: "a".repeat(64),
			selector: { id: "connector-native", name: "Example", endpoint: "https://example.test/mcp" },
			prompt: "Read accounts only.",
			confirm: true,
		});
		expect(result.effectState).toBe("unknown");
		expect(result.operationId).toMatch(/^[a-f0-9]{64}$/);
		expect(result.retrySafe).toBe(false);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
it("reports dispatched unknown invocation custody without leaking prompt or response into diagnostics", async () => {
	const { summarizeGrokConnectorDiagnostics } = await import(
		"../../src/cli/grokConnectorsCommand.js"
	);
	const summary = summarizeGrokConnectorDiagnostics({
		status: "unconfirmed",
		code: "grok_connector_native_tool_trace_unconfirmed",
		operationId: "b".repeat(64),
		providerAccountRef: "a".repeat(64),
		targetId: "EXACT-TARGET",
		responseId: "response-native",
		text: "private result",
		effectState: "unknown",
		retrySafe: false,
		toolTrace: null,
	});
	expect(summary).toMatchObject({
		scope: "invocation",
		effectDispatched: true,
		retrySafe: false,
		complete: false,
	});
	expect(JSON.stringify(summary)).not.toContain("private result");
});
it("advertises invocation target and prompt in the actual registered MCP schema", async () => {
	const { registerGrokConnectorsTool } = await import("../../src/mcp/tools/grokConnectors.js");
	const { z } = await import("zod");
	let shape: Record<string, import("zod").ZodType> | undefined;
	const server = {
		registerTool: (
			_name: string,
			config: { inputSchema: Record<string, import("zod").ZodType> },
		) => {
			shape = config.inputSchema;
		},
	};
	registerGrokConnectorsTool(
		server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
		() => ({
			list: async () => {
				throw new Error("not called");
			},
			inspect: async () => {
				throw new Error("not called");
			},
		}),
	);
	if (!shape) throw new Error("MCP schema missing");
	const parsed = z.object(shape).parse({
		action: "invoke",
		targetId: "EXACT-TARGET",
		prompt: "Use Example accounts once.",
		confirm: true,
		expectedProviderAccountRef: "a".repeat(64),
		selector: { id: "connector-native", name: "Example", endpoint: "https://example.test/mcp" },
	});
	expect(parsed).toMatchObject({
		action: "invoke",
		targetId: "EXACT-TARGET",
		prompt: "Use Example accounts once.",
	});
});
it("keeps invocation custody visible after a subsequent inventory read", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "grok406-ops-"));
	const { setAuracallHomeDirOverrideForTest } = await import("../../src/auracallHome.js");
	const { recordGrokConnectorProgress, readGrokConnectorProgress } = await import(
		"../../src/browser/grokConnectorProgress.js"
	);
	const { summarizeGrokConnectorDiagnostics } = await import(
		"../../src/cli/grokConnectorsCommand.js"
	);
	setAuracallHomeDirOverrideForTest(directory);
	try {
		const diagnostics = summarizeGrokConnectorDiagnostics({
			status: "unconfirmed",
			code: "grok_connector_native_tool_trace_unconfirmed",
			operationId: "b".repeat(64),
			providerAccountRef: "a".repeat(64),
			targetId: "EXACT-TARGET",
			responseId: "response-native",
			text: "private result",
			effectState: "unknown",
			retrySafe: false,
			toolTrace: null,
		});
		await recordGrokConnectorProgress("default", diagnostics);
		await recordGrokConnectorProgress("default", {
			...diagnostics,
			status: "incomplete",
			scope: "visible",
			code: "grok_connector_visible_inventory",
			effectDispatched: false,
			retrySafe: true,
		});
		expect(await readGrokConnectorProgress("default")).toMatchObject({
			status: "incomplete",
			invocation: { status: "unconfirmed", effectDispatched: true, retrySafe: false },
		});
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(directory, { recursive: true, force: true });
	}
});
it("does not attribute a later unrelated response to the original invocation on reconciliation", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "grok406-binding-"));
	let responseId = "response-original";
	const request = {
		action: "invoke" as const,
		targetId: "EXACT-TARGET",
		expectedProviderAccountRef: "a".repeat(64),
		selector: { id: "connector-native", name: "Example", endpoint: "https://example.test/mcp" },
		prompt: "Read accounts once.",
		confirm: true as const,
	};
	const port = {
		prepare: async () => true,
		submit: async () => {},
		observe: async () => ({
			responseId,
			text: responseId === "response-original" ? "original answer" : "unrelated later answer",
		}),
	};
	try {
		await createGrokConnectorInvocationService({ directory, open: async () => port }).invoke(
			request,
		);
		responseId = "response-unrelated";
		const result = await createGrokConnectorInvocationService({
			directory,
			open: async () => port,
		}).invoke(request);
		expect(result).toMatchObject({
			code: "grok_connector_invocation_response_changed",
			responseId: null,
			text: null,
			toolTrace: null,
			retrySafe: false,
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
it("preserves durable unknown custody when the retained browser cannot be reopened", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "grok406-open-"));
	const request = {
		action: "invoke" as const,
		targetId: "EXACT-TARGET",
		expectedProviderAccountRef: "a".repeat(64),
		selector: { id: "connector-native", name: "Example", endpoint: "https://example.test/mcp" },
		prompt: "Read accounts once.",
		confirm: true as const,
	};
	try {
		const first = await createGrokConnectorInvocationService({
			directory,
			open: async () => ({
				prepare: async () => true,
				submit: async () => {
					throw new Error("lost ack");
				},
				observe: async () => ({ responseId: null, text: null }),
			}),
		}).invoke(request);
		const result = await createGrokConnectorInvocationService({
			directory,
			open: async () => {
				throw new Error("browser unavailable");
			},
		}).invoke(request);
		expect(result).toMatchObject({
			operationId: first.operationId,
			status: "unconfirmed",
			effectState: "unknown",
			retrySafe: false,
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

it("keeps corrupt retained invocation custody unconfirmed through the public command without replay", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "grok406-corrupt-"));
	let submissions = 0;
	const request = {
		action: "invoke" as const,
		targetId: "EXACT-TARGET",
		expectedProviderAccountRef: "a".repeat(64),
		selector: { id: "connector-native", name: "Example", endpoint: "https://example.test/mcp" },
		prompt: "Read accounts once.",
		confirm: true as const,
	};
	const service = createGrokConnectorInvocationService({
		directory,
		open: async () => ({
			prepare: async () => true,
			submit: async () => {
				submissions++;
				throw new Error("lost acknowledgement");
			},
			observe: async () => ({ responseId: null, text: null }),
		}),
	});
	try {
		const first = await service.invoke(request);
		await writeFile(path.join(directory, `${first.operationId}.json`), "{truncated", {
			mode: 0o600,
		});
		const { runGrokConnectorsCommand, summarizeGrokConnectorDiagnostics } = await import(
			"../../src/cli/grokConnectorsCommand.js"
		);
		const result = await runGrokConnectorsCommand(request, {
			list: async () => {
				throw new Error("wrong operation");
			},
			inspect: async () => {
				throw new Error("wrong operation");
			},
			invoke: service.invoke,
		});
		expect(result).toMatchObject({
			operationId: first.operationId,
			status: "unconfirmed",
			effectState: "unknown",
			retrySafe: false,
			code: "grok_connector_invocation_journal_unavailable",
		});
		expect(summarizeGrokConnectorDiagnostics(result).retrySafe).toBe(false);
		expect(submissions).toBe(1);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
