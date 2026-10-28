import { describe, expect, it } from "vitest";
import { createGrokConnectorClient } from "../../src/browser/providers/grokConnectors.js";
import { ConnectorFixtureNode, connectorDomFixture } from "./grok404ConnectorDomFixture.js";

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
	it("restores its own nested detail when the provider makes the parent dialog inert", async () => {
		const fixture = connectorDomFixture({ inertParent: true });
		const client = createGrokConnectorClient(fixture.runtime);
		const result = await client.inspect({ name: "Example", kind: "installed" });
		expect(result.endpoint).toBe("https://mcp.example.test/mcp");
		expect((await client.list()).installed).toHaveLength(1);
	});
	it("dismisses its own observed Escape-only detail and verifies catalog restoration", async () => {
		const fixture = connectorDomFixture({ inertParent: true, escapeOnly: true });
		const client = createGrokConnectorClient(fixture.runtime);
		expect((await client.inspect({ name: "Example", kind: "installed" })).endpoint).toBe(
			"https://mcp.example.test/mcp",
		);
		expect((await client.list()).installed).toHaveLength(1);
	});
	it("waits for its activated native detail to mount before reading and restoring it", async () => {
		const fixture = connectorDomFixture({
			inertParent: true,
			escapeOnly: true,
			detailMountDelayMs: 25,
		});
		const client = createGrokConnectorClient(fixture.runtime);
		expect((await client.inspect({ name: "Example", kind: "installed" })).endpoint).toBe(
			"https://mcp.example.test/mcp",
		);
		expect((await client.list()).installed).toHaveLength(1);
	});
	it("uses owned native Escape control when synthetic keyboard events are ignored", async () => {
		const fixture = connectorDomFixture({ inertParent: true, escapeOnly: true });
		fixture.detail.onKeyDown = () => {};
		let escapes = 0;
		const client = createGrokConnectorClient(fixture.runtime, {
			pressEscape: async () => {
				escapes++;
				fixture.close.click();
			},
		});
		expect((await client.inspect({ name: "Example", kind: "installed" })).endpoint).toBe(
			"https://mcp.example.test/mcp",
		);
		expect(escapes).toBe(1);
		expect((await client.list()).installed).toHaveLength(1);
	});
	it("ignores explicitly closed dialog nodes that retain native geometry", async () => {
		const fixture = connectorDomFixture({
			inertParent: true,
			escapeOnly: true,
			keepClosedMounted: true,
		});
		const client = createGrokConnectorClient(fixture.runtime);
		expect((await client.inspect({ name: "Example", kind: "installed" })).endpoint).toBe(
			"https://mcp.example.test/mcp",
		);
		expect(fixture.detail.getBoundingClientRect().width).toBeGreaterThan(0);
		expect(fixture.detail.getAttribute("data-closed")).toBe("");
		expect((await client.list()).installed).toHaveLength(1);
	});
	it.each([
		undefined,
		"example",
	])("waits for a newly opened catalog to mount without clicking again (%s)", async (query) => {
		const fixture = connectorDomFixture();
		fixture.plugins.hidden = true;
		let opens = 0;
		const open = new ConnectorFixtureNode("button", "Plugins", { "aria-label": "Plugins" });
		open.onClick = () => {
			opens++;
			setTimeout(() => {
				fixture.plugins.hidden = false;
			}, 25);
		};
		open.parentElement = fixture.document;
		fixture.document.children.push(open);
		expect((await createGrokConnectorClient(fixture.runtime).list(query)).installed).toHaveLength(
			1,
		);
		expect(opens).toBe(1);
	});
	it("refuses to open a catalog through an unrelated active dialog", async () => {
		const fixture = connectorDomFixture();
		fixture.plugins.hidden = true;
		const foreign = new ConnectorFixtureNode("div", "Foreign settings", { role: "dialog" });
		foreign.parentElement = fixture.document;
		fixture.document.children.push(foreign);
		let opens = 0;
		const open = new ConnectorFixtureNode("button", "Plugins", { "aria-label": "Plugins" });
		open.onClick = () => {
			opens++;
		};
		open.parentElement = fixture.document;
		fixture.document.children.push(open);
		expect((await createGrokConnectorClient(fixture.runtime).list()).status).toBe("failed");
		expect(opens).toBe(0);
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
	it("does not reuse an inventory account as fresh detail evidence", async () => {
		const result = await createGrokConnectorClient(
			connectorDomFixture({ accountLabel: "connected@example.test" }).runtime,
		).inspect({ name: "Example", kind: "installed" });
		expect(result).toMatchObject({
			status: "incomplete",
			auth: "connected",
			coverage: { complete: true },
		});
		expect(result.accountRef).toBeNull();
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

it("refuses name uniqueness when row 101 contains a duplicate beyond the scan bound", async () => {
	const fixture = connectorDomFixture();
	for (let index = 0; index < 99; index++) {
		const row = new ConnectorFixtureNode("div", "", {}, [
			new ConnectorFixtureNode(
				"button",
				index === 98 ? "Example\nsecond@example.test" : `Other ${index}\nother@example.test`,
			),
			new ConnectorFixtureNode("span", "Added"),
		]);
		row.parentElement = fixture.plugins;
		fixture.plugins.children.push(row);
	}
	let clicks = 0;
	fixture.installed.onClick = () => {
		clicks++;
	};
	const result = await createGrokConnectorClient(fixture.runtime).inspect({
		name: "Example",
		kind: "installed",
	});
	expect(result.status).toBe("incomplete");
	expect(result.code).toMatch(/coverage|limit/);
	expect(clicks).toBe(0);
});

it("rejects a connection account switch between inventory and row activation", async () => {
	const fixture = connectorDomFixture({ accountLabel: "first@example.test" });
	let switched = false;
	let clicks = 0;
	const open = fixture.installed.onClick;
	fixture.installed.onClick = () => {
		clicks++;
		open?.();
	};
	const runtime = {
		evaluate: async (input: { expression: string }) => {
			const result = await fixture.runtime.evaluate(input);
			if (!switched && Array.isArray((result.result.value as { rows?: unknown[] })?.rows)) {
				switched = true;
				fixture.installed.ownText = "Example\nsecond@example.test";
			}
			return result;
		},
	};
	const result = await createGrokConnectorClient(runtime).inspect({
		name: "Example",
		kind: "installed",
	});
	expect(result).toMatchObject({
		status: "failed",
		code: "grok_connector_row_changed",
		accountRef: null,
	});
	expect(clicks).toBe(0);
});

it("restores search after cancellation delivered by its input mutation", async () => {
	const fixture = connectorDomFixture();
	const controller = new AbortController();
	fixture.search.onInput = () => {
		if (fixture.search.value === "changed") controller.abort(new Error("cancel-search"));
	};
	await expect(
		createGrokConnectorClient(fixture.runtime, { abortSignal: controller.signal }).list("changed"),
	).rejects.toThrow("cancel-search");
	expect(fixture.search.value).toBe("");
});

it("closes its detail after cancellation delivered by the open click", async () => {
	const fixture = connectorDomFixture();
	const controller = new AbortController();
	fixture.installed.onClick = () => {
		fixture.detail.hidden = false;
		controller.abort(new Error("cancel-detail"));
	};
	await expect(
		createGrokConnectorClient(fixture.runtime, { abortSignal: controller.signal }).inspect({
			name: "Example",
			kind: "installed",
		}),
	).rejects.toThrow("cancel-detail");
	expect(fixture.detail.hidden).toBe(true);
});

it("preserves cancellation and restoration failure together", async () => {
	const fixture = connectorDomFixture();
	const controller = new AbortController();
	fixture.search.onInput = () => {
		if (fixture.search.value === "changed") controller.abort(new Error("cancel-search"));
		else throw new Error("restore-denied");
	};
	const failure = await createGrokConnectorClient(fixture.runtime, {
		abortSignal: controller.signal,
	})
		.list("changed")
		.catch((error) => error);
	expect(failure).toBeInstanceOf(AggregateError);
	expect(failure.errors.map((error: Error) => error.message)).toEqual([
		"cancel-search",
		"restore-denied",
	]);
});

it("lists a native custom Connector by its label rather than its avatar initial", async () => {
	const f = connectorDomFixture();
	const row = f.plugins.children.find((node) =>
		node.children.some((child) => child.tag === "span" && child.ownText === "Added"),
	);
	if (!row) throw new Error("installed fixture row missing");
	const button = row.children.find((node) => node.tag === "button");
	if (!button) throw new Error("installed button missing");
	row.setAttribute("data-testid", "connector-card-Example");
	button.ownText = "";
	button.children = [
		new ConnectorFixtureNode("span", "E"),
		new ConnectorFixtureNode("span", "Example", { class: "truncate text-sm font-medium" }),
		new ConnectorFixtureNode("span", "mcp.example.test"),
	];
	for (const child of button.children) child.parentElement = button;
	const client = createGrokConnectorClient(f.runtime);
	expect((await client.list("Example")).installed).toEqual([
		{ id: null, name: "Example", kind: "installed" },
	]);
	expect((await client.inspect({ name: "Example", kind: "installed" })).connector?.name).toBe(
		"Example",
	);
});
