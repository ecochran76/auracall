import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { grokBuildExportControlExpression } from "../../src/browser/providers/grokBuildExport.js";

class Element {
	parentElement: Element | null = null;
	children: Element[] = [];
	disabled = false;
	constructor(
		public attributes: Record<string, string> = {},
		public textContent = "",
	) {}
	get innerText() {
		return this.textContent;
	}
	get outerHTML() {
		return "<div></div>";
	}
	getAttribute(k: string) {
		return this.attributes[k] ?? null;
	}
	setAttribute(k: string, v: string) {
		this.attributes[k] = v;
	}
	getBoundingClientRect() {
		return { width: 100, height: 30 };
	}
	closest(selector: string): Element | null {
		if (selector === "[inert]" && "inert" in this.attributes) return this;
		if (selector.includes("aria-hidden") && this.attributes["aria-hidden"] === "true") return this;
		if (selector === '[id^="response-"]') return response;
		if (selector === "[data-plane-row]") return row;
		return this.parentElement?.closest(selector) ?? null;
	}
	contains(other: Element): boolean {
		return this === other || this.children.some((c) => c.contains(other));
	}
	querySelectorAll(selector: string) {
		if (selector.includes("assistant-message")) return this === plane ? this.children : [];
		if (selector.includes("menuitem")) return this === menu ? [download] : [];
		return [];
	}
}
const response = new Element({ id: "response-assistant" }),
	row = new Element({ "data-plane-row": "gateway:assistant" }),
	message = new Element(),
	plane = new Element({ "aria-hidden": "true" }),
	download = new Element({ role: "menuitem" }, "Download"),
	menu = new Element({ id: "owned-menu", role: "menu", "aria-labelledby": "active-trigger" });
function observe(
	input: {
		unlabelled?: boolean;
		staleRoot?: boolean;
		closedMenu?: boolean;
		closedTriggers?: boolean;
		inert?: boolean;
		triggerInert?: boolean;
		menuInert?: boolean;
		secondAssistant?: boolean;
	} = {},
) {
	plane.children = [message, ...(input.secondAssistant ? [new Element()] : [])];
	plane.attributes["aria-hidden"] = input.inert === false ? "false" : "true";
	download.attributes = { role: "menuitem" };
	download.parentElement = menu;
	menu.parentElement = input.menuInert ? new Element({ inert: "" }) : null;
	menu.children = [download];
	menu.attributes["aria-labelledby"] = input.unlabelled ? "other" : "active-trigger";
	menu.attributes["data-state"] = input.closedMenu ? "closed" : "open";
	const active = new Element({
			id: "active-trigger",
			"aria-label": "More options",
			"aria-haspopup": "menu",
			"aria-expanded": input.closedTriggers ? "false" : "true",
			"aria-controls": "owned-menu",
			"data-state": input.closedTriggers ? "closed" : "open",
		}),
		inactive = new Element({
			"aria-label": "More options",
			"aria-haspopup": "menu",
			"aria-expanded": "false",
			"aria-hidden": "true",
			"data-state": "closed",
		});
	active.parentElement = input.triggerInert ? new Element({ inert: "" }) : null;
	const owner: { current: unknown } = { current: null };
	const root: any = { tag: 3, stateNode: owner, return: null },
		header: any = {
			tag: 0,
			return: root,
			memoizedProps: {
				previewLabel: "Preview",
				filesLabel: "Files",
				isFilesActive: true,
				isPreviewActive: false,
				conversationId: "conversation",
				overflow: {
					download: {
						downloadWorkspace: () => {
							throw new Error("must never invoke");
						},
					},
				},
			},
		};
	root.child = header;
	const leaf = (el: Element, parent: any) => {
		const f: any = { tag: 5, stateNode: el, return: parent, memoizedProps: {} };
		Object.assign(el, { __reactFiber$fixture: f });
		return f;
	};
	header.child = leaf(active, header);
	header.child.sibling = leaf(inactive, header);
	header.sibling = leaf(menu, root);
	owner.current = input.staleRoot ? {} : root;
	const doc = {
		body: new Element(),
		querySelectorAll: (selector: string) =>
			selector.includes("transcript-renderer")
				? [plane]
				: selector.includes("More options")
					? [active, inactive]
					: selector === '[role="menu"]'
						? [menu]
						: [],
		getElementById: (id: string) => (id === "owned-menu" ? menu : null),
	};
	const value = runInNewContext(
		grokBuildExportControlExpression(
			{ targetId: "target", conversationId: "conversation", responseId: "response-assistant" },
			"gateway:assistant",
			"bounded-token",
			input.closedTriggers ? "more" : "download",
		),
		{
			document: doc,
			location: { origin: "https://grok.com", pathname: "/c/conversation" },
			HTMLElement: Element,
			getComputedStyle: () => ({ display: "flex", visibility: "visible" }),
			Date,
		},
	);
	return { value, active, download };
}
test("exact expanded trigger qualifies its labelled menu despite inert background and second closed trigger", () => {
	expect(observe().value).toMatchObject({
		stage: "owned-menu-observed",
		menuOwnershipQualified: true,
		flags: { ownedMoreTriggerCount: 2, expandedOwnedTriggerCount: 1, sameCurrentOwner: true },
	});
});
test("a closed visible trigger remains eligible to open More while its inactive sibling is ignored", () => {
	const { value, active } = observe({ closedTriggers: true });
	expect(value.stage).toBe("owned-more-prepared");
	expect(active.getAttribute("data-auracall-build-download")).toBe("bounded-token");
});
test.each([
	{ unlabelled: true },
	{ staleRoot: true },
	{ closedMenu: true },
])("ownership failure never tags Download (%j)", (input) => {
	download.attributes = { role: "menuitem" };
	expect(observe(input).value.menuOwnershipQualified).not.toBe(true);
	expect(download.getAttribute("data-auracall-build-download")).toBeNull();
});

test("an inert-only ancestor prevents preparing a closed More trigger", () => {
	const { value, active } = observe({ closedTriggers: true, triggerInert: true });
	expect(value.stage).not.toBe("owned-more-prepared");
	expect(active.getAttribute("data-auracall-build-download")).toBeNull();
});
test("an inert-only ancestor prevents activating an otherwise owned Download menu", () => {
	const { value, download } = observe({ menuInert: true });
	expect(value.menuOwnershipQualified).not.toBe(true);
	expect(download.getAttribute("data-auracall-build-download")).toBeNull();
});
test("an inert expanded trigger still owns its active non-inert portal menu", () => {
	expect(observe({ triggerInert: true }).value).toMatchObject({
		stage: "owned-menu-observed",
		menuOwnershipQualified: true,
	});
});

test("Download refuses a second assistant even while the selected response remains mounted", () => {
	const { value, download } = observe({ secondAssistant: true });
	expect(value.stage).toBe("workspace-response-ambiguous");
	expect(download.getAttribute("data-auracall-build-download")).toBeNull();
});
