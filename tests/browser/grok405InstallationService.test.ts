// biome-ignore-all lint/style/useNamingConvention: CDP wire fields use provider spelling.

import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { createGrokConnectorInstallationService } from "../../src/browser/grokConnectorInstallationService.js";
import { createResponsesHttpServer } from "../../src/http/responsesServer.js";
import {
	connectorDomFixture,
	fixtureConnectorServiceOptions,
	ConnectorFixtureNode as N,
} from "./grok404ConnectorDomFixture.js";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const input = {
	kind: "custom" as const,
	name: "New Example",
	endpoint: "https://new.example.test/mcp",
};
const expectedProviderAccountRef = createHash("sha256")
	.update("grok:id:fixture-user")
	.digest("hex");
async function fixture() {
	const root = await mkdtemp(path.join(tmpdir(), "grok405-"));
	roots.push(root);
	const f = connectorDomFixture();
	const name = new N("input", "", { placeholder: "My Connector" });
	const endpoint = new N("input", "", { placeholder: "https://mcp.example.com/sse" });
	const add = new N("button", "Add Connector");
	const form = new N("div", "New Connector", { role: "dialog" }, [name, endpoint, add]);
	form.hidden = true;
	const open = new N("button", "New Connector", { "aria-label": "New Connector" });
	open.onClick = () => {
		form.hidden = false;
	};
	open.parentElement = f.plugins;
	f.plugins.children.push(open);
	form.parentElement = f.document;
	f.document.children.push(form);
	let effects = 0;
	add.onClick = () => {
		effects++;
		form.ownText = "Authentication required";
	};
	let targetCloses = 0;
	const options = fixtureConnectorServiceOptions();
	const deps = {
		journalDirectory: root,
		connect: async () => ({
			client: {
				Runtime: f.runtime,
				close: async () => {},
				__auracallProviderTrafficGovernor: {
					attribution: { provider: "grok", targetId: "fixture-target" },
					admitBackendRequest: async () => {},
					begin: async () => ({ settle: async () => {} }),
				},
			},
			targetId: "fixture-target",
			shouldClose: true,
			host: "localhost",
			port: 1,
		}),
		closeTarget: async () => {
			targetCloses++;
		},
	};
	return {
		f,
		form,
		add,
		root,
		options,
		deps,
		effects: () => effects,
		targetCloses: () => targetCloses,
	};
}
it("durably fences repeated installation across service restart and preserves human target", async () => {
	const f = await fixture();
	const first = await createGrokConnectorInstallationService(f.options, f.deps).install({
		input,
		expectedProviderAccountRef,
		confirm: true,
	});
	expect(first).toMatchObject({
		status: "awaiting-human",
		effectDispatched: true,
		retrySafe: false,
	});
	expect(f.effects()).toBe(1);
	expect(f.targetCloses()).toBe(0);
	const restarted = createGrokConnectorInstallationService(f.options, f.deps);
	const second = await restarted.install({ input, expectedProviderAccountRef, confirm: true });
	expect(second).toMatchObject({
		status: "awaiting-human",
		effectDispatched: true,
		retrySafe: false,
	});
	expect(f.effects()).toBe(1);
});
it("does not submit without exact account confirmation and reports account drift before Add", async () => {
	const f = await fixture();
	const service = createGrokConnectorInstallationService(f.options, f.deps);
	await expect(service.install({ input, expectedProviderAccountRef })).rejects.toThrow(
		"confirmation_required",
	);
	expect(f.effects()).toBe(0);
	const result = await service.install({
		input,
		expectedProviderAccountRef: "a".repeat(64),
		confirm: true,
	});
	expect(result).toMatchObject({ status: "failed", effectDispatched: false, retrySafe: false });
	expect(f.effects()).toBe(0);
});
it("returns unknown custody through public command and MCP without losing the retained target", async () => {
	const f = await fixture();
	const { runGrokConnectorsCommand } = await import("../../src/cli/grokConnectorsCommand.js");
	const { createGrokConnectorsToolHandler } = await import("../../src/mcp/tools/grokConnectors.js");
	const installation = createGrokConnectorInstallationService(f.options, f.deps);
	const service = {
		list: async () => {
			throw new Error("unused");
		},
		inspect: async () => {
			throw new Error("unused");
		},
		...installation,
	};
	const request = { action: "install", input, expectedProviderAccountRef, confirm: true };
	const cli = await runGrokConnectorsCommand(request, service);
	expect(cli).toMatchObject({
		status: "awaiting-human",
		effectDispatched: true,
		retrySafe: false,
		targetId: "fixture-target",
	});
	const mcp = await createGrokConnectorsToolHandler(() => service)({
		action: "reconcile",
		input,
		expectedProviderAccountRef,
	});
	expect(mcp.isError).toBe(true);
	expect(mcp.structuredContent).toMatchObject({
		status: "awaiting-human",
		effectDispatched: true,
		retrySafe: false,
		targetId: "fixture-target",
	});
	expect(f.effects()).toBe(1);
});
it.each([
	false,
	true,
])("reports a rejected final form guard as no dispatched effect (continuation=%s)", async (continuation) => {
	const f = await fixture();
	const evaluate = f.f.runtime.evaluate;
	let missingEndpoint = continuation;
	f.f.runtime.evaluate = async (args) => {
		if (args.expression.includes("root.getAttribute('data-auracall-install-owner')")) {
			const field = f.form.children.find(
				(node) => node.getAttribute("placeholder") === "My Connector",
			);
			if (field) field.value = "Changed by operator";
		}
		const result = await evaluate(args);
		const value = result.result.value as Record<string, unknown>;
		if (missingEndpoint && value?.state === "visible" && "endpoint" in value) value.endpoint = null;
		return result;
	};
	const request = { input, expectedProviderAccountRef, confirm: true };
	let originalOperationId: string | undefined;
	if (continuation) {
		const first = await createGrokConnectorInstallationService(f.options, f.deps).install(request);
		expect(first).toMatchObject({
			status: "unsupported",
			code: "grok_connector_install_existing_endpoint_unobserved",
			effectDispatched: false,
		});
		originalOperationId = first.operationId;
		missingEndpoint = false;
	}
	const result = await createGrokConnectorInstallationService(f.options, f.deps).install(request);
	if (originalOperationId) expect(result.operationId).toBe(originalOperationId);
	expect(result).toMatchObject({
		status: "failed",
		code: "grok_connector_install_form_changed",
		effectDispatched: false,
		retrySafe: true,
	});
	expect(f.effects()).toBe(0);
});
it.each([
	false,
	true,
])("shares unknown-install fencing across runtime profiles (continuation=%s)", async (continuation) => {
	const f = await fixture();
	if (continuation) {
		const evaluate = f.f.runtime.evaluate;
		f.f.runtime.evaluate = async (args) => {
			const result = await evaluate(args);
			const value = result.result.value as Record<string, unknown>;
			if (value?.state === "visible" && "endpoint" in value) value.endpoint = null;
			return result;
		};
		expect(
			await createGrokConnectorInstallationService(f.options, f.deps).install({
				input,
				expectedProviderAccountRef,
				confirm: true,
			}),
		).toMatchObject({ status: "unsupported", effectDispatched: false });
		f.f.runtime.evaluate = evaluate;
	}
	const add = f.add.onClick;
	f.add.onClick = () => {
		add?.();
		f.form.hidden = true;
		throw new Error("lost after Add");
	};
	const uncertain = await createGrokConnectorInstallationService(f.options, f.deps).install({
		input,
		expectedProviderAccountRef,
		confirm: true,
	});
	expect(uncertain).toMatchObject({
		status: "unconfirmed",
		effectDispatched: true,
		retrySafe: false,
	});
	const otherOptions = {
		...f.options,
		providerSessionAuthorization: {
			...f.options.providerSessionAuthorization,
			context: {
				...f.options.providerSessionAuthorization.context,
				auracallRuntimeProfile: "other",
			},
		},
	};
	const retained = await createGrokConnectorInstallationService(otherOptions, f.deps).install({
		input,
		expectedProviderAccountRef,
		confirm: true,
	});
	expect(retained).toMatchObject({
		effectDispatched: true,
		retrySafe: false,
		operationId: uncertain.operationId,
	});
	expect(f.effects()).toBe(1);
});
it("uses the same guarded installation result over HTTP and rejects missing confirmation before service resolution", async () => {
	const f = await fixture();
	setAuracallHomeDirOverrideForTest(f.root);
	const installation = createGrokConnectorInstallationService(f.options, f.deps);
	let resolutions = 0;
	const server = await createResponsesHttpServer(
		{ host: "127.0.0.1", port: 0 },
		{
			grokConnectorsServiceResolver: () => {
				resolutions++;
				return {
					list: async () => {
						throw new Error("unused");
					},
					inspect: async () => {
						throw new Error("unused");
					},
					...installation,
				};
			},
		},
	);
	try {
		const endpoint = `http://127.0.0.1:${server.port}/v1/grok/connectors/query`;
		const invalid = await fetch(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ action: "install", input, expectedProviderAccountRef }),
		});
		expect(invalid.status).toBe(400);
		expect(resolutions).toBe(0);
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ action: "install", input, expectedProviderAccountRef, confirm: true }),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "awaiting-human",
			effectDispatched: true,
			retrySafe: false,
			targetId: "fixture-target",
		});
		expect(f.effects()).toBe(1);
	} finally {
		await server.close();
		setAuracallHomeDirOverrideForTest(null);
	}
});
it("retains unknown cleanup outcomes and fences an unreadable journal without another Add", async () => {
	const f = await fixture();
	const connect = f.deps.connect;
	const service = createGrokConnectorInstallationService(f.options, {
		...f.deps,
		connect: async () => {
			const connection = await connect();
			connection.client.close = async () => {
				throw new Error("lost close acknowledgment");
			};
			return connection;
		},
	});
	const first = await service.install({ input, expectedProviderAccountRef, confirm: true });
	expect(first).toMatchObject({
		status: "unconfirmed",
		code: "grok_connector_install_cleanup_unknown",
		retrySafe: false,
		targetId: "fixture-target",
	});
	expect(f.targetCloses()).toBe(0);
	const { writeFile } = await import("node:fs/promises");
	await writeFile(path.join(f.root, `${first.operationId}.json`), "interrupted journal");
	const second = await createGrokConnectorInstallationService(f.options, f.deps).install({
		input,
		expectedProviderAccountRef,
		confirm: true,
	});
	expect(second).toMatchObject({
		status: "unconfirmed",
		code: "grok_connector_install_journal_unavailable",
		retrySafe: false,
	});
	expect(f.effects()).toBe(1);
});
it("keeps pending installation custody visible in Ops after a later inventory read", async () => {
	const f = await fixture();
	setAuracallHomeDirOverrideForTest(f.root);
	try {
		const { recordGrokConnectorProgress, readGrokConnectorProgress } = await import(
			"../../src/browser/grokConnectorProgress.js"
		);
		const { summarizeGrokConnectorDiagnostics } = await import(
			"../../src/cli/grokConnectorsCommand.js"
		);
		const result = await createGrokConnectorInstallationService(f.options, f.deps).install({
			input,
			expectedProviderAccountRef,
			confirm: true,
		});
		await recordGrokConnectorProgress("default", summarizeGrokConnectorDiagnostics(result));
		await recordGrokConnectorProgress("default", {
			status: "incomplete",
			code: "grok_connector_visible_inventory",
			scope: "visible",
			complete: false,
			installed: 1,
			catalog: 0,
			tools: null,
			hasProviderAccountIdentity: true,
			hasEndpointIdentity: false,
			hasAccountIdentity: false,
			auth: null,
		});
		const status = await readGrokConnectorProgress("default");
		expect(status).toMatchObject({
			status: "incomplete",
			installation: { status: "awaiting-human", effectDispatched: true, retrySafe: false },
		});
		expect(JSON.stringify(status)).not.toContain("new.example.test");
		expect(JSON.stringify(status)).not.toContain("fixture-target");
	} finally {
		setAuracallHomeDirOverrideForTest(null);
	}
});

it("allows one explicit confirmed continuation after a recorded unsupported no-effect preparation", async () => {
	const f = await fixture();
	const service = createGrokConnectorInstallationService(f.options, f.deps);
	const original = f.f.runtime.evaluate;
	let missingEndpoint = true;
	f.f.runtime.evaluate = async (args) => {
		const result = await original(args);
		const value = result.result.value as Record<string, unknown>;
		if (missingEndpoint && value?.state === "visible" && "endpoint" in value) value.endpoint = null;
		return result;
	};
	const request = { input, expectedProviderAccountRef, confirm: true };
	expect(await service.install(request)).toMatchObject({
		status: "unsupported",
		effectDispatched: false,
		retrySafe: true,
	});
	expect(f.effects()).toBe(0);
	missingEndpoint = false;
	const outcomes = await Promise.all([service.install(request), service.install(request)]);
	expect(outcomes.some((r) => r.effectDispatched)).toBe(true);
	expect(f.effects()).toBe(1);
	await service.install(request);
	expect(f.effects()).toBe(1);
});
it("uses the governed transport keyboard to restore an Escape-only native detail before Add", async () => {
	const f = await fixture();
	f.f.close.hidden = true;
	f.f.detail.onKeyDown = () => {};
	const connect = f.deps.connect;
	const keys: string[] = [];
	const deps = {
		...f.deps,
		connect: async () => {
			const connection = await connect();
			return {
				...connection,
				client: {
					...connection.client,
					Input: {
						dispatchKeyEvent: async (event: { type: string }) => {
							keys.push(event.type);
							if (event.type === "keyUp") f.f.close.click();
						},
					},
				},
			};
		},
	};
	expect(
		await createGrokConnectorInstallationService(f.options, deps).install({
			input,
			expectedProviderAccountRef,
			confirm: true,
		}),
	).toMatchObject({ status: "awaiting-human", effectDispatched: true });
	expect(keys).toEqual(["keyDown", "keyUp"]);
	expect(f.effects()).toBe(1);
});

it("settles an owned terminal connection failure while retaining target and replay fence", async () => {
	const f = await fixture();
	f.form.setAttribute("data-analytics-name", "add-connector-modal");
	const originalAdd = f.add.onClick;
	f.add.onClick = () => {
		originalAdd?.();
		f.form.ownText =
			"Custom Connector\n\nConnection failed\n\nSorry, there was a problem connecting to this MCP server.";
		f.form.children = [new N("button", "Go Back")];
		f.form.children[0].parentElement = f.form;
	};
	const settlements: unknown[] = [];
	const deps = {
		...f.deps,
		connect: async () => {
			const c = await f.deps.connect();
			return {
				...c,
				client: {
					...c.client,
					__auracallProviderTrafficGovernor: {
						...c.client.__auracallProviderTrafficGovernor,
						begin: async () => ({
							settle: async (details: unknown) => {
								settlements.push(details);
							},
						}),
					},
				},
			};
		},
	};
	const result = await createGrokConnectorInstallationService(f.options, deps).install({
		input,
		expectedProviderAccountRef,
		confirm: true,
	});
	expect(result).toMatchObject({
		status: "failed",
		code: "grok_connector_install_connection_failed",
		effectDispatched: true,
		retrySafe: false,
	});
	expect(settlements).toContainEqual(
		expect.objectContaining({ outcome: "failed", effectState: "settled" }),
	);
	expect(f.targetCloses()).toBe(0);
	await createGrokConnectorInstallationService(f.options, deps).install({
		input,
		expectedProviderAccountRef,
		confirm: true,
	});
	expect(f.effects()).toBe(1);
});

it("reconciles an original journal on an explicitly verified replacement target without another Add", async () => {
	const { readFile } = await import("node:fs/promises");
	const { runInNewContext } = await import("node:vm");
	const f = await fixture();
	const original = await createGrokConnectorInstallationService(f.options, f.deps).install({
		input,
		expectedProviderAccountRef,
		confirm: true,
	});
	const id = "connector_11111111-1111-4111-8111-111111111111";
	const requests: string[] = [];
	const runtime = {
		evaluate: async (args: {
			expression: string;
			returnByValue: boolean;
			awaitPromise?: boolean;
		}) => {
			if (!args.expression.includes("/rest/connectors/get")) return f.f.runtime.evaluate(args);
			return {
				result: {
					value: await runInNewContext(args.expression, {
						location: { origin: "https://grok.com" },
						URL,
						AbortController,
						setTimeout,
						clearTimeout,
						fetch: async (url: string) => {
							requests.push(url);
							return {
								ok: true,
								text: async () =>
									JSON.stringify(
										url.endsWith("/get")
											? {
													connector: {
														connectorId: id,
														name: input.name,
														scope: "CONNECTOR_SCOPE_USER",
														scopeId: "fixture-user",
														connectorType: "CONNECTOR_TYPE_MCP",
														hasValidOauthTokens: true,
														connectorConfig: {
															mcpConfig: {
																isEnabled: true,
																requiresOauth: true,
																serverUrl: input.endpoint,
															},
														},
													},
												}
											: {
													mcpTools: [],
													connectorIdsNeedingReauth: [],
													connectorsNeedingReauth: [],
												},
									),
							};
						},
					}),
				},
			};
		},
	};
	const service = createGrokConnectorInstallationService(f.options, {
		...f.deps,
		resolveReconciliationOptions: async (targetId) => ({ ...f.options, tabTargetId: targetId }),
		connect: async (options) => {
			expect(options.tabTargetId).toBe("replacement-target");
			const connection = await f.deps.connect();
			return {
				...connection,
				targetId: "replacement-target",
				client: {
					...connection.client,
					Runtime: runtime,
					__auracallProviderTrafficGovernor: {
						...connection.client.__auracallProviderTrafficGovernor,
						attribution: { provider: "grok", targetId: "replacement-target" },
					},
				},
			};
		},
	});
	const result = await service.reconcile({
		input,
		expectedProviderAccountRef,
		reconciliationTarget: { targetId: "replacement-target", connectorId: id },
	});
	expect(result).toMatchObject({
		status: "already-connected",
		operationId: original.operationId,
		effectDispatched: true,
		targetId: "replacement-target",
	});
	const journal = JSON.parse(
		await readFile(path.join(f.root, `${original.operationId}.json`), "utf8"),
	);
	expect(journal.input).toEqual(input);
	expect(journal.effectDispatched).toBe(true);
	expect(journal.reconciliations).toEqual([
		expect.objectContaining({
			previousTargetId: "fixture-target",
			targetId: "replacement-target",
			connectorId: id,
		}),
	]);
	expect(f.effects()).toBe(1);
	expect(requests).toHaveLength(2);
});

it("continues a known no-effect refusal on an explicitly fenced fresh target without replay", async () => {
	const f = await fixture();
	const original = f.f.runtime.evaluate;
	let missingEndpoint = true;
	f.f.runtime.evaluate = async (args) => {
		const result = await original(args);
		const value = result.result.value as Record<string, unknown>;
		if (missingEndpoint && value?.state === "visible" && "endpoint" in value) value.endpoint = null;
		return result;
	};
	const request = { input, expectedProviderAccountRef, confirm: true };
	const first = await createGrokConnectorInstallationService(f.options, f.deps).install(request);
	expect(first).toMatchObject({ status: "unsupported", effectDispatched: false, retrySafe: true });
	missingEndpoint = false;
	const opened: string[] = [];
	const service = createGrokConnectorInstallationService(f.options, {
		...f.deps,
		resolveReconciliationOptions: async (targetId) => ({ ...f.options, tabTargetId: targetId }),
		connect: async (options) => {
			if (!options.tabTargetId) throw new Error("fixture target missing");
			opened.push(options.tabTargetId);
			const connection = await f.deps.connect();
			return {
				...connection,
				targetId: options.tabTargetId,
				client: {
					...connection.client,
					__auracallProviderTrafficGovernor: {
						...connection.client.__auracallProviderTrafficGovernor,
						attribution: { provider: "grok", targetId: options.tabTargetId },
					},
				},
			};
		},
	});
	const continuation = {
		...request,
		preEffectTarget: { expectedPreviousTargetId: "fixture-target", targetId: "fresh-target" },
	};
	const stale = await service.install({
		...continuation,
		preEffectTarget: { expectedPreviousTargetId: "stale-target", targetId: "fresh-target" },
	});
	expect(stale).toMatchObject({
		status: "unconfirmed",
		code: "grok_connector_pre_effect_target_not_qualified",
	});
	expect(opened).toEqual([]);
	const concurrent = await Promise.all([
		service.install(continuation),
		service.install(continuation),
	]);
	const result = concurrent.find(
		(value) => value.status === "awaiting-human" && value.effectDispatched,
	);
	expect(opened).toEqual(["fresh-target"]);
	expect(result).toMatchObject({
		operationId: first.operationId,
		targetId: "fresh-target",
		status: "awaiting-human",
		effectDispatched: true,
	});
	expect(f.effects()).toBe(1);
	await service.install(continuation);
	expect(f.effects()).toBe(1);
});

it.each([
	undefined,
	"form-readiness" as const,
])("refuses %s pre-effect retargeting once Add was dispatched, before connecting any target", async (reason) => {
	const f = await fixture();
	const request = { input, expectedProviderAccountRef, confirm: true };
	const dispatched = await createGrokConnectorInstallationService(f.options, f.deps).install(
		request,
	);
	expect(dispatched).toMatchObject({
		status: "awaiting-human",
		effectDispatched: true,
		retrySafe: false,
	});
	let connects = 0;
	const service = createGrokConnectorInstallationService(f.options, {
		...f.deps,
		connect: async () => {
			connects++;
			return f.deps.connect();
		},
		resolveReconciliationOptions: async (targetId) => ({ ...f.options, tabTargetId: targetId }),
	});
	const result = await service.install({
		...request,
		preEffectTarget: {
			expectedPreviousTargetId: "fixture-target",
			targetId: "fresh-target",
			reason,
		},
	});
	expect(result).toMatchObject({
		status: "unconfirmed",
		code: "grok_connector_pre_effect_target_not_qualified",
		retrySafe: false,
		effectDispatched: true,
	});
	expect(connects).toBe(0);
	expect(f.effects()).toBe(1);
});

it("recovers a recorded pre-fill refusal once with a separate fence and the same intent", async () => {
	const f = await fixture();
	const open = f.f.plugins.children.find(
		(node) => node.getAttribute("aria-label") === "New Connector",
	);
	if (!open) throw new Error("fixture missing opener");
	const normalOpen = open.onClick;
	open.onClick = null;
	const request = { input, expectedProviderAccountRef, confirm: true };
	const first = await createGrokConnectorInstallationService(f.options, f.deps).install(request);
	expect(first).toMatchObject({
		status: "unsupported",
		code: "grok_connector_install_custom_form_unverified",
		effectDispatched: false,
		retrySafe: true,
	});
	open.onClick = normalOpen;
	let connects = 0;
	const service = createGrokConnectorInstallationService(f.options, {
		...f.deps,
		resolveReconciliationOptions: async (targetId) => ({ ...f.options, tabTargetId: targetId }),
		connect: async (options) => {
			connects++;
			const connection = await f.deps.connect();
			const targetId = options.tabTargetId ?? "fixture-target";
			return {
				...connection,
				targetId,
				client: {
					...connection.client,
					__auracallProviderTrafficGovernor: {
						...connection.client.__auracallProviderTrafficGovernor,
						attribution: { provider: "grok", targetId },
					},
				},
			};
		},
	});
	const recovery = {
		...request,
		preEffectTarget: {
			expectedPreviousTargetId: "fixture-target",
			targetId: "fresh-target",
			reason: "form-readiness" as const,
		},
	};
	const results = await Promise.all([service.install(recovery), service.install(recovery)]);
	expect(
		results.some(
			(value) => value.status === "awaiting-human" && value.operationId === first.operationId,
		),
	).toBe(true);
	expect(connects).toBe(1);
	expect(f.effects()).toBe(1);
	await service.install(recovery);
	expect(connects).toBe(1);
	expect(f.effects()).toBe(1);
});
