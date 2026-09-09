import { runInNewContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";
import { prepareChatgptWorkbenchLocalAttachment } from "../../src/browser/actions/chatgptComposerTool.js";
import { ATTACHMENT_MENU_SELECTOR } from "../../src/browser/constants.js";

class FixtureElement {
	id = "";
	textContent = "";
	hidden = false;
	visibility = "visible";
	form: FixtureElement | null = null;
	attributes = new Map<string, string>();
	queries = new Map<string, FixtureElement[]>();
	getBoundingClientRect() {
		return { x: 0, y: 0, width: this.hidden ? 0 : 100, height: this.hidden ? 0 : 40 };
	}
	getAttribute(name: string) {
		return this.attributes.get(name) ?? null;
	}
	hasAttribute(name: string) {
		return this.attributes.has(name);
	}
	setAttribute(name: string, value: string) {
		this.attributes.set(name, value);
	}
	closest(selector: string) {
		return selector === "form" ? this.form : null;
	}
	querySelectorAll(selector: string) {
		return (
			this.queries.get(selector) ??
			(selector.includes("contenteditable") ? (this.queries.get("editors") ?? []) : [])
		);
	}
	querySelector(selector: string) {
		return this.querySelectorAll(selector)[0] ?? null;
	}
}

type Scenario =
	| "visible"
	| "unlinked-popover"
	| "hidden-form"
	| "hidden-editor"
	| "hidden-trigger"
	| "css-hidden-editor"
	| "two-composers"
	| "hidden-textarea-first"
	| "wrong-popover"
	| "closed-trigger"
	| "two-popovers"
	| "foreign-form"
	| "two-triggers";

async function inspectComposer(scenario: Scenario) {
	const popover = new FixtureElement();
	popover.id = "attachment-popover";
	const form = new FixtureElement();
	const editor = new FixtureElement();
	const trigger = new FixtureElement();
	trigger.attributes.set("aria-label", "Add files and more");
	trigger.attributes.set("aria-expanded", scenario === "closed-trigger" ? "false" : "true");
	trigger.attributes.set(
		"aria-controls",
		scenario === "wrong-popover" ? "another-popover" : popover.id,
	);
	if (scenario === "unlinked-popover") {
		trigger.attributes.delete("aria-controls");
		trigger.attributes.delete("aria-expanded");
	}
	const input = new FixtureElement();
	input.id = "upload-files";
	input.hidden = true; // Native upload inputs are legitimately hidden.
	input.form = form;
	input.attributes.set("multiple", "");
	form.queries.set("editors", [editor]);
	form.queries.set(
		ATTACHMENT_MENU_SELECTOR,
		scenario === "two-triggers" ? [trigger, new FixtureElement()] : [trigger],
	);
	if (scenario === "foreign-form") input.form = new FixtureElement();
	form.hidden = scenario === "hidden-form";
	editor.hidden = scenario === "hidden-editor";
	trigger.hidden = scenario === "hidden-trigger";
	editor.visibility = scenario === "css-hidden-editor" ? "hidden" : "visible";
	if (scenario === "hidden-textarea-first") {
		const fallback = new FixtureElement();
		fallback.hidden = true;
		form.queries.set("editors", [fallback, editor]);
	}
	const forms = [form];
	if (scenario === "two-composers") {
		const other = new FixtureElement();
		other.queries.set("editors", [new FixtureElement()]);
		other.queries.set(ATTACHMENT_MENU_SELECTOR, [new FixtureElement()]);
		forms.push(other);
	}
	const document = new FixtureElement();
	document.queries.set("form", forms);
	document.queries.set('input[type="file"]', [input]);
	document.queries.set(
		".popover",
		scenario === "two-popovers" ? [popover, new FixtureElement()] : [popover],
	);
	const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
		if (expression.includes("const rows = root")) {
			return {
				result: {
					value: runInNewContext(expression, {
						document,
						// biome-ignore lint/style/useNamingConvention: DOM global constructor name.
						HTMLElement: FixtureElement,
						getComputedStyle: (element: FixtureElement) => ({
							visibility: element.visibility,
							display: "block",
						}),
					}),
				},
			};
		}
		// A previously opened popover avoids clicking in this inventory-only fixture.
		if (expression.includes("data-auracall-chatgpt-composer-menu"))
			return { result: { value: { items: [] } } };
		return { result: { value: true } };
	});
	const surface = await prepareChatgptWorkbenchLocalAttachment({
		runtime: { evaluate } as unknown as Parameters<
			typeof prepareChatgptWorkbenchLocalAttachment
		>[0]["runtime"],
		input: {} as Parameters<typeof prepareChatgptWorkbenchLocalAttachment>[0]["input"],
		page: {} as Parameters<typeof prepareChatgptWorkbenchLocalAttachment>[0]["page"],
	});
	expect(
		evaluate.mock.calls.filter(([call]) => call.expression.includes("const rows = root")),
	).toHaveLength(1);
	return surface;
}

describe("ChatGPT upload composer DOM inventory", () => {
	test.each<Scenario>([
		"visible",
		"hidden-textarea-first",
		"unlinked-popover",
	])("accepts a hidden upload input in a uniquely visible composer: %s", async (scenario) => {
		expect(await inspectComposer(scenario)).toMatchObject({
			status: "ready",
			inputSelector: "#upload-files",
		});
	});
	test.each<Scenario>([
		"hidden-form",
		"hidden-editor",
		"hidden-trigger",
		"css-hidden-editor",
		"two-composers",
		"wrong-popover",
		"closed-trigger",
		"two-popovers",
		"foreign-form",
		"two-triggers",
	])("rejects inactive or ambiguous upload ownership: %s", async (scenario) => {
		expect(await inspectComposer(scenario)).toEqual({ status: "local-file-action-not-found" });
	});
});
