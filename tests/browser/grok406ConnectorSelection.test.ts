// biome-ignore-all lint/style/useNamingConvention: Native React wire names are case-sensitive.
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { observeGrokComposerConnector } from "../../src/browser/providers/grokConnectorSelection.js";
import { ConnectorFixtureNode as N } from "./grok404ConnectorDomFixture.js";

interface Fiber {
	tag: number;
	stateNode?: unknown;
	return: Fiber | null;
	child?: Fiber;
	key?: string;
	memoizedProps?: Record<string, unknown>;
}
function fixture() {
	const row = new N("div", "Example", {
		role: "menuitemcheckbox",
		"data-testid": "attach-connector-Example",
		"aria-checked": "true",
	});
	const menu = new N("div", "", { role: "menu" }, [row]);
	const document = new N("body", "", {}, [menu]);
	const owner: { current: unknown } = { current: null };
	const root: Fiber = { tag: 3, stateNode: owner, return: null };
	const scope: Fiber = { tag: 5, stateNode: menu, return: root };
	const keyed: Fiber = {
		tag: 0,
		key: "connector-native",
		memoizedProps: {
			role: "menuitemcheckbox",
			"aria-checked": true,
			"data-testid": "attach-connector-Example",
		},
		return: scope,
	};
	const host: Fiber = { tag: 5, stateNode: row, return: keyed };
	root.child = scope;
	scope.child = keyed;
	keyed.child = host;
	owner.current = root;
	Object.assign(row, { __reactFiber$fixture: host });
	row.onClick = () => {
		throw new Error("Observation must not toggle connectors");
	};
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => ({
			result: {
				value: runInNewContext(expression, {
					document,
					getComputedStyle: () => ({ display: "block", visibility: "visible" }),
				}),
			},
		}),
	};
	return { runtime, row, keyed, owner };
}
it("qualifies the enabled exact native Connector from its current composer menu without toggling", async () => {
	const f = fixture();
	expect(
		await observeGrokComposerConnector(f.runtime, { id: "connector-native", name: "Example" }),
	).toEqual({ id: "connector-native", name: "Example", enabled: true });
});
it("rejects a same-name row whose committed native identity changed", async () => {
	const f = fixture();
	f.keyed.key = "foreign-connector";
	expect(
		await observeGrokComposerConnector(f.runtime, { id: "connector-native", name: "Example" }),
	).toBeNull();
});
