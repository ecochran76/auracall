import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { createResponsesHttpServer } from "../src/http/responsesServer.js";
import { recordGrokConnectorProgress } from "../src/browser/grokConnectorProgress.js";
import { createBrowserTabConcurrencyRuntime } from "../src/browser/tabConcurrencyRuntime.js";
const roots: string[] = [];
afterEach(async () => {
	setAuracallHomeDirOverrideForTest(null);
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function isolate() {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-discovery-http-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
}
const inventory = {
	providerAccountRef: null,
	status: "incomplete" as const,
	code: "grok_connector_inventory_visible",
	installed: [{ id: "id-1", name: "Fixture", kind: "installed" as const }],
	catalog: [],
	coverage: { scope: "visible" as const, complete: false, reason: "visible-only" },
};

test("HTTP Grok discovery uses the shared Connector request and result contract", async () => {
	await isolate();
	const list = vi.fn(async () => inventory),
		inspect = vi.fn(async () => {
			throw new Error("unexpected inspect");
		});
	const resolver = vi.fn(async () => ({ list, inspect }));
	const server = await createResponsesHttpServer(
		{ host: "127.0.0.1", port: 0 },
		{ grokConnectorsServiceResolver: resolver },
	);
	try {
		const response = await fetch(`http://127.0.0.1:${server.port}/v1/grok/connectors/query`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ action: "list", query: "Fixture", runtimeProfile: "default" }),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(inventory);
		expect(resolver).toHaveBeenCalledWith({
			action: "list",
			query: "Fixture",
			runtimeProfile: "default",
		});
		expect(list).toHaveBeenCalledWith("Fixture");
	} finally {
		await server.close();
	}
});

test("HTTP Grok discovery suppresses raw resolver transport errors", async () => {
	await isolate();
	const server = await createResponsesHttpServer(
		{ host: "127.0.0.1", port: 0 },
		{
			grokConnectorsServiceResolver: async () => {
				throw new Error("private-token and account@example.test");
			},
		},
	);
	try {
		const response = await fetch(`http://127.0.0.1:${server.port}/v1/grok/connectors/query`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ action: "list" }),
		});
		const payload = await response.json();
		expect(payload).toMatchObject({ status: "failed", installed: [], catalog: [] });
		expect(JSON.stringify(payload)).not.toContain("private-token");
		expect(JSON.stringify(payload)).not.toContain("account@example.test");
	} finally {
		await server.close();
	}
});

test("Ops Connector progress is whitelisted and excludes private inventory fields", async () => {
	await isolate();
	await recordGrokConnectorProgress("default", {
		status: "incomplete",
		code: "grok_connector_inventory_visible",
		scope: "visible",
		complete: false,
		installed: 1,
		catalog: 2,
		tools: 3,
		hasProviderAccountIdentity: true,
		hasEndpointIdentity: true,
		hasAccountIdentity: false,
		auth: "unknown",
		endpoint: "https://private.example/mcp?token=secret",
		name: "Private account",
	} as never);
	const status = await createBrowserTabConcurrencyRuntime({} as never).readStatus();
	expect(status.providerControls?.grok.connectorInventory).toMatchObject({
		status: "incomplete",
		installed: 1,
		catalog: 2,
		tools: 3,
	});
	expect(JSON.stringify(status.providerControls)).not.toContain("private.example");
	expect(JSON.stringify(status.providerControls)).not.toContain("Private account");
});
