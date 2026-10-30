import { expect, it } from "vitest";
import { observeGrokNativeConnectorRows } from "../../src/browser/providers/grokNativeConnectorBinding.js";
import { connectorDomFixture } from "./grok404ConnectorDomFixture.js";

function fixture() {
	const f = connectorDomFixture();
	f.installed.setAttribute("data-auracall-connector-read", "row-0");
	const record = {
		connectorId: "connector-native",
		displayName: "Example",
		type: "live",
		serverUrl: null,
		originScope: 3,
		originScopeId: "fixture-user",
	};
	const owner: { current: unknown } = { current: null };
	const host: { tag: number; stateNode: unknown; return: unknown; sibling: unknown } = {
		tag: 5,
		stateNode: f.installed,
		return: null,
		sibling: null,
	};
	const card: {
		tag: number;
		key: string;
		memoizedProps: { label: { props: { connector: typeof record } } };
		child: unknown;
		return: unknown;
		sibling: unknown;
	} = {
		tag: 0,
		key: record.connectorId,
		memoizedProps: { label: { props: { connector: record } } },
		child: host,
		return: null,
		sibling: null,
	};
	const scoped: {
		tag: number;
		stateNode: unknown;
		child: unknown;
		return: unknown;
		sibling: unknown;
	} = { tag: 5, stateNode: f.plugins, child: card, return: null, sibling: null };
	const root = { tag: 3, stateNode: owner, child: scoped, return: null, sibling: null };
	owner.current = root;
	host.return = card;
	card.return = scoped;
	scoped.return = root;
	Object.defineProperty(f.installed, "__reactFiber$fixture", { value: host, enumerable: true });
	return { f, record, card };
}
it("binds the actual native live connector ID without inventing an MCP endpoint", async () => {
	const { f } = fixture();
	expect(
		await observeGrokNativeConnectorRows(f.runtime, {
			providerUserId: "fixture-user",
			rows: [{ handle: "row-0", name: "Example", kind: "installed" }],
		}),
	).toEqual([{ handle: "row-0", id: "connector-native", type: "live", endpoint: null }]);
});
it("rejects mismatched account, fiber identity, name or unknown transport", async () => {
	for (const field of ["originScopeId", "connectorId", "displayName", "type"] as const) {
		const { f, record } = fixture();
		record[field] = "foreign";
		expect(
			await observeGrokNativeConnectorRows(f.runtime, {
				providerUserId: "fixture-user",
				rows: [{ handle: "row-0", name: "Example", kind: "installed" }],
			}),
		).toEqual([]);
	}
});

it("retains native Connector identity when a text avatar precedes its title", async () => {
	const { ConnectorFixtureNode: N } = await import("./grok404ConnectorDomFixture.js");
	const { f } = fixture();
	f.installed.parentElement?.setAttribute("data-testid", "connector-card-Example");
	f.installed.ownText = "";
	f.installed.children = [
		new N("span", "E"),
		new N("span", "Example", { class: "text-sm font-medium" }),
		new N("span", "example.test"),
	];
	for (const child of f.installed.children) child.parentElement = f.installed;
	expect(
		await observeGrokNativeConnectorRows(f.runtime, {
			providerUserId: "fixture-user",
			rows: [{ handle: "row-0", name: "Example", kind: "installed" }],
		}),
	).toEqual([{ handle: "row-0", id: "connector-native", type: "live", endpoint: null }]);
});

it("binds the searched Connector identity before restoring a different gallery view", async () => {
	const { createGrokConnectorClient } = await import(
		"../../src/browser/providers/grokConnectors.js"
	);
	const { f, record } = fixture();
	f.search.onInput = () => {
		if (f.search.value === "") record.originScopeId = "different-view-owner";
	};
	const client = createGrokConnectorClient(f.runtime, { providerUserId: "fixture-user" });
	expect((await client.list("Example")).installed).toEqual([
		{ id: "connector-native", name: "Example", kind: "installed" },
	]);
	expect(f.search.value).toBe("");
});
