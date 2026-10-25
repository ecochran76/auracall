// biome-ignore-all lint/style/useNamingConvention: CDP and provider identity wire names are case-sensitive.
import { runInNewContext } from "node:vm";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";

/** Minimal DOM at the CDP boundary. Semantic labels come from the 2026-10-24
 * survey; hierarchy is a controlled fixture, not claimed captured HTML. */
export class ConnectorFixtureNode {
	parentElement: ConnectorFixtureNode | null = null;
	children: ConnectorFixtureNode[];
	attributes: Record<string, string>;
	onClick: (() => void) | null = null;
	hidden = false;
	value = "";
	onInput: (() => void) | null = null;
	onKeyDown: (() => void) | null = null;
	dispatchEvent(event?: { key?: string }) {
		if (event?.key === "Escape") this.onKeyDown?.();
		this.onInput?.();
		return true;
	}
	constructor(
		readonly tag: string,
		public ownText = "",
		attributes: Record<string, string> = {},
		children: ConnectorFixtureNode[] = [],
	) {
		this.attributes = attributes;
		this.children = children;
		for (const child of children) child.parentElement = this;
	}
	get innerText(): string {
		return [
			this.ownText,
			...this.children.filter((child) => !child.hidden).map((child) => child.innerText),
		]
			.filter(Boolean)
			.join("\n");
	}
	get textContent(): string {
		return this.innerText;
	}
	getAttribute(key: string) {
		return this.attributes[key] ?? null;
	}
	setAttribute(key: string, value: string) {
		this.attributes[key] = value;
	}
	getBoundingClientRect() {
		let hidden = this.hidden;
		let ancestor = this.parentElement;
		while (ancestor) {
			hidden ||= ancestor.hidden;
			ancestor = ancestor.parentElement;
		}
		return { width: hidden ? 0 : 100, height: hidden ? 0 : 20 };
	}
	click() {
		this.onClick?.();
	}
	querySelectorAll(selector: string): ConnectorFixtureNode[] {
		const matches = (node: ConnectorFixtureNode) =>
			selector.split(",").some((part) => {
				const value = part.trim();
				const compound = /^([a-z]+)(\[.*\])$/.exec(value);
				if (compound)
					return (
						node.tag.toLowerCase() === compound[1] &&
						node.getAttribute("placeholder") === "Search..."
					);
				const match = /^\[([^=\]]+)(?:="([^"]+)")?\]$/.exec(value);
				if (match)
					return match[2] == null
						? node.getAttribute(match[1]) != null
						: node.getAttribute(match[1]) === match[2];
				return node.tag.toLowerCase() === value.toLowerCase();
			});
		return this.children.flatMap((child) => [
			...(matches(child) ? [child] : []),
			...child.querySelectorAll(selector),
		]);
	}
}
export function connectorDomFixture({
	duplicate = false,
	gated = false,
	broken = false,
	toolExpansion = true,
	inertParent = false,
	escapeOnly = false,
	userEmail = "operator@example.test",
	accountLabel = "Account label excluded",
} = {}) {
	let activeEmail = userEmail;
	const N = ConnectorFixtureNode;
	const installed = new N("button", `Example\n${accountLabel}`);
	const catalog = new N("button", "Catalog Example\nDescription excluded");
	const add = new N("button", "Add", { "aria-label": "Add Catalog Example" });
	add.onClick = () => {
		throw new Error("Discovery must never install");
	};
	const search = new N("input", "", { placeholder: "Search..." });
	const searchResult = new N("div", "", {}, [
		new N("button", "Search Result\nCatalog result"),
		new N("button", "Add", { "aria-label": "Add Search Result" }),
	]);
	searchResult.hidden = true;
	search.onInput = () => {
		searchResult.hidden = search.value !== "Search Result";
	};
	const tab = new N("button", "Connectors", { role: "tab", "aria-selected": "true" });
	const plugins = new N(
		"div",
		gated ? "Sign in required" : broken ? "Couldn't load connectors" : "Plugins",
		{ role: "dialog" },
		[
			tab,
			search,
			searchResult,
			new N("div", "", {}, [installed, new N("span", "Added")]),
			new N("div", "", {}, [catalog, add]),
			...(duplicate
				? [
						new N("div", "", {}, [
							new N("button", "Example\nOther account"),
							new N("span", "Added"),
						]),
					]
				: []),
		],
	);
	const disconnect = new N("button", "Disconnect");
	disconnect.onClick = () => {
		throw new Error("Discovery must never disconnect");
	};
	const reauthenticate = new N("button", "Reauthenticate");
	reauthenticate.onClick = () => {
		throw new Error("Discovery must never authenticate");
	};
	const tools = new N("div", "All tools enabled\nsearch");
	const more = new N("button", "See more");
	const close = new N("button", "", { "aria-label": "Close" });
	const detail = new N(
		"div",
		"Example",
		{ role: "dialog", "data-analytics-name": "connector-detail-dialog" },
		[
			reauthenticate,
			disconnect,
			tools,
			more,
			new N("div", "Server URL\nhttps://mcp.example.test/mcp"),
			...(escapeOnly ? [] : [close]),
		],
	);
	detail.hidden = true;
	installed.onClick = () => {
		detail.hidden = false;
		if (inertParent) plugins.setAttribute("aria-hidden", "true");
	};
	more.onClick = () => {
		if (!toolExpansion) return;
		tools.children.push(new N("span", "read"));
		more.hidden = true;
		// Hidden text is not part of innerText in a real browser.
		detail.children = detail.children.filter((child) => child !== more);
	};
	close.onClick = () => {
		detail.hidden = true;
		if (inertParent) delete plugins.attributes["aria-hidden"];
	};
	detail.onKeyDown = close.onClick;
	const document = new N("document", "", {}, [plugins, detail]);
	return {
		runtime: {
			evaluate: async ({ expression }: { expression: string }) => ({
				result: {
					value: runInNewContext(expression, {
						document: Object.assign(document, { body: document, title: "Grok" }),
						location: { href: "https://grok.com/" },
						setTimeout,
						KeyboardEvent: class {
							key: string;
							constructor(_type: string, options: { key: string }) {
								this.key = options.key;
							}
						},
						HTMLElement: ConnectorFixtureNode,
						HTMLInputElement: ConnectorFixtureNode,
						Event: class {
							constructor(readonly type: string) {}
						},
						window: {
							__NEXT_DATA__: {
								props: { pageProps: { user: { id: "fixture-user", email: activeEmail } } },
							},
							getComputedStyle: (node: ConnectorFixtureNode) => ({
								display: node.hidden ? "none" : "block",
								visibility: "visible",
							}),
						},
						getComputedStyle: (node: ConnectorFixtureNode) => ({
							display: node.hidden ? "none" : "block",
							visibility: "visible",
						}),
					}),
				},
			}),
		},
		document,
		installed,
		detail,
		search,
		plugins,
		close,
		setUserEmail: (value: string) => {
			activeEmail = value;
		},
	};
}

export function fixtureConnectorServiceOptions(email = "operator@example.test") {
	const authority = createProviderSessionAuthority({
		activeProfile: "default",
		profiles: { default: { services: { grok: { identity: { email } } } } },
	});
	const context = {
		providerId: "grok" as const,
		auracallRuntimeProfile: "default",
		browserProfile: "default",
		managedBrowserProfile: "/fixture/grok",
		browserProcessId: 1,
		browserTargetId: "fixture-target",
		devtoolsHost: "localhost",
		devtoolsPort: 1,
	};
	return {
		providerSessionAuthorization: {
			authority,
			context,
			expectation: authority.resolveExpectation(context),
		},
	};
}
