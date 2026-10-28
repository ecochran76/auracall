// biome-ignore-all lint/style/useNamingConvention: DOM and React runtime field names are case-sensitive.
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { type GrokBuildService, grokBuildUnknown } from "../../src/browser/grokBuildService.js";
import { grokBuildPublicationControlExpression } from "../../src/browser/providers/grokBuildPublication.js";
import { GrokBuildRequestSchema, runGrokBuildCommand } from "../../src/cli/grokBuildCommand.js";

interface Fiber {
	tag?: number;
	stateNode?: unknown;
	return: Fiber | null;
	child?: Fiber;
	sibling?: Fiber;
	memoizedProps?: Record<string, unknown>;
}
class Element {
	parentElement: Element | null = null;
	disabled = false;
	value = "native-demo";
	type = "text";
	constructor(
		public attributes: Record<string, string> = {},
		public innerText = "",
	) {}
	getAttribute(key: string) {
		return this.attributes[key] ?? null;
	}
	setAttribute(key: string, value: string) {
		this.attributes[key] = value;
	}
	getBoundingClientRect() {
		return { width: 100, height: 30 };
	}
	closest(selector: string): Element | null {
		return (selector.includes("inert") && "inert" in this.attributes) ||
			(selector.includes("aria-hidden") && this.attributes["aria-hidden"] === "true")
			? this
			: (this.parentElement?.closest(selector) ?? null);
	}
	querySelectorAll(selector: string) {
		return selector === "button" ? [publish] : selector === "input" ? [input] : [];
	}
}
const publish = new Element({}, "Publish"),
	input = new Element();
function observe({ stale = false, closed = false, tooltipClosed = false } = {}) {
	const trigger = new Element({
		"aria-haspopup": "dialog",
		"aria-label": "Publish",
		"aria-expanded": "true",
		"aria-controls": "publish-dialog",
		"data-auracall-publication-inspect": "token",
		"data-state": tooltipClosed ? "closed" : "open",
	});
	const dialog = new Element({
		id: "publish-dialog",
		role: "dialog",
		"data-state": closed ? "closed" : "open",
	});
	publish.parentElement = dialog;
	input.parentElement = dialog;
	const owner: { current: unknown } = { current: null },
		root: Fiber = { tag: 3, stateNode: owner, return: null };
	const header: Fiber = {
		return: root,
		memoizedProps: {
			conversationId: "conversation",
			previewLabel: "Preview",
			filesLabel: "Files",
			headerActionsVisible: true,
		},
	};
	const controller: Fiber = {
		return: root,
		memoizedProps: {
			conversationId: "conversation",
			ready: true,
			phase: "idle",
			deployment: null,
			onDeploy: () => {
				throw Error("must not dispatch");
			},
		},
	};
	const leaf = (node: Element, parent: Fiber) => {
		const f = { stateNode: node, return: parent };
		Object.assign(node, { __reactFiber$fixture: f });
		return f;
	};
	root.child = header;
	header.child = leaf(trigger, header);
	header.sibling = controller;
	controller.child = leaf(dialog, controller);
	controller.child.child = leaf(publish, controller.child);
	owner.current = stale ? {} : root;
	return runInNewContext(
		grokBuildPublicationControlExpression(
			{ targetId: "target", conversationId: "conversation" },
			"token",
			"read",
		),
		{
			document: {
				body: new Element(),
				querySelectorAll: (s: string) => (s === '[role="dialog"]' ? [dialog] : [trigger]),
			},
			location: { origin: "https://grok.com", pathname: "/c/conversation" },
			HTMLElement: Element,
			getComputedStyle: () => ({ display: "flex", visibility: "visible" }),
		},
	);
}

test("native publication read reports actual idle controller without invoking onDeploy or inventing app identity", () => {
	expect(observe({ tooltipClosed: true })).toMatchObject({
		code: "observed",
		controls: {
			state: "not_published",
			phase: "idle",
			publishEnabled: true,
			proposedName: "native-demo",
			snapshotBinding: "unqualified",
		},
	});
});

test("Build inspection accepts an explicit native publication-controls read without publication authority", async () => {
	const request = {
		action: "inspect",
		targetId: "target",
		conversationId: "conversation",
		inspectPublicationControls: true,
	};
	let received: unknown;
	const service = {
		inspect: async (input: unknown) => {
			received = input;
			return {
				...grokBuildUnknown(),
				publication: {
					requested: false,
					status: "unknown",
					controls: {
						state: "not_published",
						publishEnabled: true,
						snapshotBinding: "unqualified",
					},
				},
			};
		},
	} as unknown as GrokBuildService;
	const result = await runGrokBuildCommand(request, service);
	expect(result.status).not.toBe("invalid");
	expect(received).toMatchObject({ inspectPublicationControls: true });
	expect(result.publication).toMatchObject({
		requested: false,
		controls: { state: "not_published", snapshotBinding: "unqualified" },
	});
	expect(GrokBuildRequestSchema.safeParse({ ...request, confirmed: true }).success).toBe(false);
});

test.each([
	{ stale: true },
	{ closed: true },
])("uncommitted or closed publication state is not reported (%j)", (scenario) => {
	expect(observe(scenario).code).not.toBe("observed");
});
