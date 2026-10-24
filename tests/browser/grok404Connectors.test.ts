import { describe, expect, it } from "vitest";
import { createGrokConnectorClient } from "../../src/browser/providers/grokConnectors.js";
import { connectorDomFixture } from "./grok404ConnectorDomFixture.js";

// CDP is the public boundary. Payloads are sanitized projections of the survey,
// never copies of private account captures.
function transport(values: unknown[]) {
	return { evaluate: async () => ({ result: { value: values.shift() } }) };
}
const inventory = {
	state: "visible",
	rows: [
		{ handle: "row-0", name: "Example", kind: "installed", providerId: null },
		{ handle: "row-1", name: "Example", kind: "catalog", providerId: null },
	],
	truncated: false,
};

describe("Grok Connector public inventory", () => {
	it("keeps installed connections separate from catalog and does not claim account completeness", async () => {
		const client = createGrokConnectorClient(transport([true, inventory]));
		const result = await client.list();
		expect(result.status).toBe("incomplete");
		expect(result.installed.map((row) => row.name)).toEqual(["Example"]);
		expect(result.catalog.map((row) => row.name)).toEqual(["Example"]);
		expect(result.coverage).toMatchObject({ scope: "visible", complete: false });
	});
	it("rejects duplicate installed names before opening an arbitrary row", async () => {
		const client = createGrokConnectorClient(
			transport([
				true,
				{ ...inventory, rows: [inventory.rows[0], { ...inventory.rows[0], handle: "row-2" }] },
			]),
		);
		const result = await client.inspect({ name: "Example", kind: "installed" });
		expect(result).toMatchObject({
			status: "failed",
			code: "grok_connector_ambiguous",
			connector: null,
		});
	});
	it("expands nested detail tools and preserves exact endpoint identity without exporting credentials", async () => {
		const detail = {
			state: "visible",
			name: "Example",
			endpoint: "https://mcp.example.test/mcp?token=private",
			tools: ["search"],
			toolsObserved: true,
			hasMore: true,
			auth: "connected",
			account: null,
		};
		const client = createGrokConnectorClient(
			transport([
				true,
				inventory,
				true,
				detail,
				true,
				{ ...detail, tools: ["search", "read"], hasMore: false },
				true,
			]),
		);
		const result = await client.inspect({ name: "Example", kind: "installed" });
		expect(result).toMatchObject({
			status: "incomplete",
			connector: { name: "Example", kind: "installed" },
			endpoint: null,
			auth: "connected",
			tools: ["search", "read"],
			coverage: { complete: true },
		});
		expect(result.endpointRef).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(result)).not.toContain("private");
	});
	it("reads survey semantic anchors through controlled CDP and expands only the nested detail", async () => {
		const fixture = connectorDomFixture();
		const client = createGrokConnectorClient(fixture.runtime);
		const list = await client.list("example");
		expect(list.installed).toEqual([{ id: null, name: "Example", kind: "installed" }]);
		expect(list.catalog).toEqual([{ id: null, name: "Catalog Example", kind: "catalog" }]);
		const result = await client.inspect({ name: "Example", kind: "installed" });
		expect(result).toMatchObject({
			status: "incomplete",
			endpoint: "https://mcp.example.test/mcp",
			auth: "connected",
			accountRef: null,
			tools: ["search", "read"],
			coverage: { complete: true },
		});
		expect(JSON.stringify(result)).not.toContain("Account label");
	});
	it("selects an observed exact endpoint and refuses to infer absence from visible rows", async () => {
		const client = createGrokConnectorClient(connectorDomFixture().runtime);
		const result = await client.inspect({
			endpoint: "https://mcp.example.test/mcp",
			kind: "installed",
		});
		expect(result.connector?.name).toBe("Example");
		const missing = await client.inspect({
			endpoint: "https://other.example.test/mcp",
			kind: "installed",
		});
		expect(missing).toMatchObject({
			status: "incomplete",
			code: "grok_connector_endpoint_not_observed",
		});
	});
	it.each([
		{ options: { gated: true }, status: "account-gated" },
		{ options: { broken: true }, status: "failed" },
	])("keeps $status distinct from an empty successful inventory", async ({ options, status }) => {
		const result = await createGrokConnectorClient(connectorDomFixture(options).runtime).list();
		expect(result).toMatchObject({
			status,
			installed: [],
			catalog: [],
			coverage: { complete: false },
		});
	});
	it("reports bounded tool expansion as incomplete when See more never changes", async () => {
		const result = await createGrokConnectorClient(
			connectorDomFixture({ toolExpansion: false }).runtime,
			{ maxToolExpansions: 1 },
		).inspect({ name: "Example", kind: "installed" });
		expect(result).toMatchObject({
			status: "incomplete",
			tools: ["search"],
			code: "grok_connector_tools_incomplete",
			coverage: { complete: false },
		});
	});
	it("does not claim a tool inventory when its authoritative heading is absent", async () => {
		const fixture = connectorDomFixture();
		const heading = fixture.document
			.querySelectorAll("div")
			.find((node) => node.ownText === "All tools enabled\nsearch");
		if (heading) heading.hidden = true;
		const result = await createGrokConnectorClient(fixture.runtime).inspect({
			name: "Example",
			kind: "installed",
		});
		expect(result.coverage.complete).toBe(false);
	});
	it("reports complete detail only when the connection account is actually observed", async () => {
		const result = await createGrokConnectorClient(
			connectorDomFixture({ accountLabel: "connected@example.test" }).runtime,
		).inspect({ name: "Example", kind: "installed" });
		expect(result).toMatchObject({
			status: "complete",
			auth: "connected",
			coverage: { complete: true },
		});
		expect(result.accountRef).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(result)).not.toContain("connected@example.test");
	});
	it("does not manufacture endpoint identity from malformed Server URL text", async () => {
		const detail = {
			state: "visible",
			name: "Example",
			endpoint: "not an endpoint",
			tools: ["search"],
			toolsObserved: true,
			hasMore: false,
			auth: "connected",
			account: null,
		};
		const result = await createGrokConnectorClient(
			transport([true, inventory, true, detail, true]),
		).inspect({ name: "Example", kind: "installed" });
		expect(result.endpointRef).toBeNull();
		expect(result.code).toBe("grok_connector_endpoint_not_observed");
	});
	it("searches through the scoped provider search field and restores its prior value", async () => {
		const fixture = connectorDomFixture();
		const client = createGrokConnectorClient(fixture.runtime);
		const result = await client.list("Search Result");
		expect(result.catalog.map((row) => row.name)).toEqual(["Search Result"]);
		expect(fixture.document.querySelectorAll("input")[0].value).toBe("");
	});
});
