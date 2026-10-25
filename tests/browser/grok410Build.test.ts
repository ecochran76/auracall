// biome-ignore-all lint/style/useNamingConvention: CDP and DOM platform names are case-sensitive.
import { createContext, runInContext } from "node:vm";
import { expect, test } from "vitest";
import { ConnectorFixtureNode } from "./grok404ConnectorDomFixture.js";
import { createGrokBuildService } from "../../src/browser/grokBuildService.js";

class Node extends ConnectorFixtureNode {
	disabled = false;
	focus() {}
	get className() {
		return this.attributes.class ?? "";
	}
	cloneNode(deep = false): Node {
		return new Node(
			this.tag,
			this.ownText,
			{ ...this.attributes },
			deep ? this.children.map((child) => (child as Node).cloneNode(true)) : [],
		);
	}
	remove() {
		if (this.parentElement)
			this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
	}
	nodeType = 1;
	get tagName() {
		return this.tag.toUpperCase();
	}
	hasAttribute(key: string) {
		return key in this.attributes;
	}
	closest(selector: string): Node | null {
		return this.matches(selector)
			? this
			: ((this.parentElement as Node | null)?.closest(selector) ?? null);
	}
	contains(other: Node): boolean {
		return other === this || this.children.some((child) => (child as Node).contains(other));
	}
	matches(selector: string): boolean {
		return selector.split(",").some((value) => {
			value = value.trim();
			const parts = value.split(/\s+(?![^[]*\])/);
			if (parts.length > 1) {
				const last = parts.pop() ?? "";
				let ancestor = this.parentElement as Node | null;
				while (ancestor) {
					if (ancestor.matches(parts.join(" ")) && this.matches(last)) return true;
					ancestor = ancestor.parentElement as Node | null;
				}
				return false;
			}
			const classes = [...value.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
			if (classes.some((name) => !this.className.split(" ").includes(name))) return false;
			const tag = value.match(/^[a-z]+/i)?.[0];
			if (tag && tag !== this.tag) return false;
			const id = value.match(/#([\w-]+)/)?.[1];
			if (id && this.getAttribute("id") !== id) return false;
			return [...value.matchAll(/\[([\w-]+)(?:(\^=|\*=|=)["']?([^\]"']*)["']?)?\]/g)].every(
				([, key, op, expected]) => {
					const actual = this.getAttribute(key);
					return (
						actual !== null &&
						(!op ||
							(op === "="
								? actual === expected
								: op === "^="
									? actual.startsWith(expected)
									: actual.includes(expected)))
					);
				},
			);
		});
	}
	querySelectorAll(selector: string): Node[] {
		return this.children.flatMap((child) => [
			...((child as Node).matches(selector) ? [child as Node] : []),
			...(child as Node).querySelectorAll(selector),
		]);
	}
	querySelector(selector: string) {
		return this.querySelectorAll(selector)[0] ?? null;
	}
}
class Button extends Node {
	constructor(text: string, attrs: Record<string, string> = {}) {
		super("button", text, attrs);
	}
}
class Textarea extends Node {
	constructor() {
		super("textarea", "", { "aria-label": "Ask Grok anything" });
	}
}
function buildFixture({
	gated = false,
	missing = false,
	failAfterSend = false,
	draft = "",
	closeFailure = false,
	drift = false,
	noAdmission = false,
	modalMenu = false,
	draftAfterSelection = false,
	fileAfterSelection = false,
	retainedClosedMenu = false,
} = {}) {
	const fast = new Button("Fast", { role: "menuitemradio", "aria-checked": "true" });
	const build = new Button(gated ? "Build Requires subscription" : "Build", {
		role: "menuitemradio",
		"aria-checked": "false",
		...(gated ? { "aria-disabled": "true" } : {}),
	});
	const menu = new Node("div", "", { role: "menu" }, [fast, ...(missing ? [] : [build])]);
	const editor = new Textarea();
	editor.value = draft;
	const submit = new Button("Submit", { type: "submit", "aria-label": "Submit" });
	const form = new Node("form", "", {}, [editor, submit]);
	const trigger = new Button("Fast", { id: "model-select-trigger", "aria-label": "Model: Fast" });
	const main = new Node("main", "", {}, [form, ...(modalMenu ? [trigger] : [])]);
	const closeMenu = () => {
		if (!modalMenu) return;
		menu.hidden = fast.hidden = build.hidden = true;
		delete main.attributes["aria-hidden"];
	};
	trigger.onClick = () => {
		menu.hidden = fast.hidden = build.hidden = false;
		main.setAttribute("aria-hidden", "true");
	};
	closeMenu();
	const stale = new Node("div", "", { role: "menu", "data-state": "closed" }, [
		new Button("Expert", { role: "menuitemradio", "aria-checked": "true" }),
	]);
	const document = Object.assign(
		new Node("document", "", {}, [main, menu, ...(retainedClosedMenu ? [stale] : [])]),
		{ body: main },
	);
	const location = { href: "https://grok.com/" };
	let submissions = 0;
	build.onClick = () => {
		fast.setAttribute("aria-checked", "false");
		build.setAttribute("aria-checked", "true");
		if (draftAfterSelection) editor.value = "A draft arrived while selecting Build";
		if (fileAfterSelection) {
			const input = Object.assign(new Node("input", "", { type: "file" }), {
				files: [{ name: "arrived.txt" }],
			});
			input.parentElement = form;
			form.children.push(input);
		}
		closeMenu();
	};
	submit.onClick = () => {
		submissions++;
		location.href = "https://grok.com/c/conversation-generated";
		const response = new Node("div", "Generated timer source", {
			id: "response-created",
			class: "relative group flex flex-col items-start",
			"data-state": "complete",
		});
		response.parentElement = main;
		main.children.push(response);
		if (failAfterSend) throw new Error("CDP lost after Send");
	};
	const context = createContext({
		document,
		HTMLElement: Node,
		HTMLButtonElement: Button,
		HTMLTextAreaElement: Textarea,
		HTMLInputElement: class extends Node {},
		MouseEvent: class {},
		InputEvent: class {},
		Event: class {},
		window: {
			getComputedStyle: (node: Node) => ({
				display: node.hidden ? "none" : "block",
				visibility: "visible",
			}),
		},
		location,
		URL,
	});
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => ({
			result: { value: runInContext(expression, context) },
		}),
	};
	const client = {
		Runtime: runtime,
		Input: {
			insertText: async ({ text }: { text: string }) => {
				editor.value = text;
			},
			dispatchKeyEvent: async ({ key }: { key: string }) => {
				if (key === "Escape") closeMenu();
			},
		},
		close: async () => {
			if (closeFailure) throw new Error("cleanup private details");
		},
		__auracallProviderTrafficGovernor: {
			attribution: { provider: "grok", targetId: "build-target" },
			admitBackendRequest: async () => {},
			begin: async () => {
				if (noAdmission) throw new Error("no capacity");
				return { settle: async () => {} };
			},
		},
	};
	return {
		service: createGrokBuildService(
			{},
			{
				connect: async () => ({
					client: client as never,
					targetId: "build-target",
					shouldClose: false,
					host: "localhost",
					port: 1,
				}),
				verifyAccount: async () =>
					drift && submissions > 0 ? "different-account" : "account-reference",
			},
		),
		submissions: () => submissions,
		addNativeFile: () => {
			const input = Object.assign(new Node("input", "", { type: "file" }), {
				files: [{ name: "existing.txt" }],
			});
			input.parentElement = form;
			form.children.push(input);
		},
		draft: () => editor.value,
	};
}

test("account-gated Build is unavailable and never submits a prompt", async () => {
	const result = await buildFixture({ gated: true }).service.generate({
		prompt: "Make a local timer",
		confirmed: true,
	});
	expect(result).toMatchObject({
		status: "unavailable",
		code: "grok_build_account_gated",
		generation: { status: "not_started" },
		effectState: "none",
		publication: { requested: false, status: "unknown" },
	});
});

test("terminal Build response stays partial until app/version and export evidence is observed", async () => {
	const fixture = buildFixture();
	const result = await fixture.service.generate({ prompt: "Make a local timer", confirmed: true });
	expect(result).toMatchObject({
		status: "partial",
		code: "grok_build_app_identity_unobserved",
		generation: {
			status: "response_completed",
			responseId: "response-created",
			text: "Generated timer source",
		},
		conversationId: "conversation-generated",
		app: { id: null, version: null },
		artifacts: { status: "unavailable", entries: [] },
		publication: { requested: false, status: "unknown" },
		effectState: "completed",
		retrySafe: false,
	});
	expect(fixture.submissions()).toBe(1);
});

test("lost Send acknowledgment retains the target and never retries generation", async () => {
	const fixture = buildFixture({ failAfterSend: true });
	const result = await fixture.service.generate({ prompt: "Make a local timer", confirmed: true });
	expect(result).toMatchObject({
		status: "unknown",
		code: "grok_build_generation_outcome_unknown",
		targetId: "build-target",
		generation: { status: "unknown" },
		effectState: "unknown",
		retrySafe: false,
		publication: { requested: false, status: "unknown" },
	});
	expect(fixture.submissions()).toBe(1);
});

test("invalid or unconfirmed generation is rejected before a browser can be acquired", async () => {
	const service = createGrokBuildService(
		{},
		{
			connect: async () => {
				throw new Error("must not launch");
			},
		},
	);
	expect(await service.generate({ prompt: "Make a local timer", confirmed: false })).toMatchObject({
		status: "invalid",
		effectState: "none",
		retrySafe: true,
	});
});

test("cancellation before browser acquisition is reported as no generation effect", async () => {
	const cancellation = new AbortController();
	cancellation.abort();
	const service = createGrokBuildService(
		{ abortSignal: cancellation.signal },
		{
			connect: async () => {
				throw new Error("must not launch");
			},
		},
	);
	expect(await service.generate({ prompt: "Make a local timer", confirmed: true })).toMatchObject({
		status: "unknown",
		code: "grok_build_cancelled_preflight",
		generation: { status: "not_started" },
		effectState: "none",
		retrySafe: true,
	});
});

test("a missing Build mode remains unavailable without dispatching", async () => {
	const fixture = buildFixture({ missing: true });
	expect(
		await fixture.service.generate({ prompt: "Make a local timer", confirmed: true }),
	).toMatchObject({ status: "unavailable", code: "grok_build_not_observed", effectState: "none" });
	expect(fixture.submissions()).toBe(0);
});

test("Build generation preserves an existing draft and sends nothing", async () => {
	const fixture = buildFixture({ draft: "Unsubmitted user draft" });
	expect(
		await fixture.service.generate({ prompt: "Make a local timer", confirmed: true }),
	).toMatchObject({
		status: "unavailable",
		code: "grok_build_empty_root_required",
		effectState: "none",
	});
	expect(fixture.draft()).toBe("Unsubmitted user draft");
	expect(fixture.submissions()).toBe(0);
});

test("fresh account drift discards unattributable response content and keeps unknown target custody", async () => {
	const fixture = buildFixture({ drift: true });
	expect(
		await fixture.service.generate({ prompt: "Make a local timer", confirmed: true }),
	).toMatchObject({
		status: "unknown",
		code: "grok_build_generation_outcome_unknown",
		targetId: "build-target",
		providerAccountRef: null,
		generation: { text: null, responseId: null },
		effectState: "unknown",
		retrySafe: false,
	});
});

test("cleanup failure preserves the completed response and exact retained target", async () => {
	const fixture = buildFixture({ closeFailure: true });
	expect(
		await fixture.service.generate({ prompt: "Make a local timer", confirmed: true }),
	).toMatchObject({
		status: "unknown",
		code: "grok_build_cleanup_unknown",
		targetId: "build-target",
		generation: { status: "response_completed", responseId: "response-created" },
		cleanupState: "unknown",
		effectState: "completed",
		retrySafe: false,
	});
});

test("governor capacity refusal prevents generation", async () => {
	const fixture = buildFixture({ noAdmission: true });
	expect(
		await fixture.service.generate({ prompt: "Make a local timer", confirmed: true }),
	).toMatchObject({
		status: "unknown",
		code: "grok_build_preflight_failed",
		effectState: "none",
		retrySafe: true,
	});
	expect(fixture.submissions()).toBe(0);
});

import {
	runGrokBuildCommand,
	summarizeGrokBuildDiagnostics,
} from "../../src/cli/grokBuildCommand.js";
import { createGrokBuildToolHandler } from "../../src/mcp/tools/grokBuild.js";

test("public command keeps exact prompt whitespace through one real service submission", async () => {
	const fixture = buildFixture();
	const result = await runGrokBuildCommand(
		{ action: "generate", prompt: "  Make a local timer  ", confirmed: true },
		fixture.service,
	);
	expect(result).toMatchObject({
		status: "partial",
		generation: { status: "response_completed" },
		effectState: "completed",
	});
	expect(fixture.draft()).toBe("  Make a local timer  ");
	expect(fixture.submissions()).toBe(1);
});

test("MCP validates confirmation before resolving browser authority", async () => {
	const handler = createGrokBuildToolHandler(async () => {
		throw new Error("must not resolve");
	});
	const result = await handler({ action: "generate", prompt: "Make a local timer" });
	expect(result).toMatchObject({
		isError: true,
		structuredContent: {
			status: "invalid",
			code: "grok_build_request_invalid",
			effectState: "none",
		},
	});
});

test("MCP structured output distinguishes a gated mode from completed generation", async () => {
	const handler = createGrokBuildToolHandler(() => buildFixture({ gated: true }).service);
	expect(await handler({ action: "discover" })).toMatchObject({
		isError: true,
		structuredContent: {
			status: "unavailable",
			mode: "account_gated",
			generation: { status: "not_started" },
			effectState: "none",
		},
	});
});

test("Ops projection keeps state and proof presence without prompt, account or response content", async () => {
	const fixture = buildFixture();
	const result = await fixture.service.discover();
	expect(summarizeGrokBuildDiagnostics(result)).toEqual({
		status: "available",
		code: "grok_build_mode_available",
		complete: false,
		count: null,
		ready: null,
		hasProviderAccountIdentity: true,
		hasConversationIdentity: false,
		hasResponseIdentity: false,
		effectState: "none",
	});
});

test("a selected native file without a provider chip prevents Build submission", async () => {
	const fixture = buildFixture();
	fixture.addNativeFile();
	expect(
		await fixture.service.generate({ prompt: "Make a local timer", confirmed: true }),
	).toMatchObject({
		status: "unavailable",
		code: "grok_build_empty_root_required",
		effectState: "none",
	});
	expect(fixture.submissions()).toBe(0);
});

// A configured retained target must never redirect a new Build into an existing draft.
test("generation clears inherited target affinity before fresh root acquisition", async () => {
	let acquisition: Record<string, unknown> | undefined;
	const stopped = new Error("observed acquisition boundary");
	const service = createGrokBuildService(
		{
			preserveActiveTab: true,
			tabTargetId: "unrelated-retained-target",
			tabUrl: "https://grok.com/c/existing",
		},
		{
			connect: async (options) => {
				acquisition = options as Record<string, unknown>;
				throw stopped;
			},
		},
	);
	await expect(service.generate({ prompt: "Make a local timer", confirmed: true })).rejects.toBe(
		stopped,
	);
	expect(acquisition).toMatchObject({
		tabLifecycle: "retain-new",
		preserveActiveTab: false,
		configuredUrl: "https://grok.com/",
	});
	expect(acquisition?.tabTargetId).toBeUndefined();
	expect(acquisition?.tabUrl).toBeUndefined();
});

test("generation checks the root outside the observed modal model menu", async () => {
	const fixture = buildFixture({ modalMenu: true });
	expect(
		await fixture.service.generate({ prompt: "Make a local timer", confirmed: true }),
	).toMatchObject({ status: "partial", generation: { status: "response_completed" } });
	expect(fixture.submissions()).toBe(1);
});

test.each([
	"draft",
	"file",
])("a %s arriving during Build selection is preserved without Send", async (kind) => {
	const fixture = buildFixture({
		modalMenu: true,
		draftAfterSelection: kind === "draft",
		fileAfterSelection: kind === "file",
	});
	expect(
		await fixture.service.generate({ prompt: "Make a local timer", confirmed: true }),
	).toMatchObject({
		status: "unavailable",
		code: "grok_build_empty_root_required",
		effectState: "none",
	});
	expect(fixture.submissions()).toBe(0);
	expect(fixture.draft()).toBe(kind === "draft" ? "A draft arrived while selecting Build" : "");
});

test("a retained explicitly closed model menu cannot supply Build discovery", async () => {
	const fixture = buildFixture({ modalMenu: true, retainedClosedMenu: true });
	expect(
		await fixture.service.generate({ prompt: "Make a local timer", confirmed: true }),
	).toMatchObject({ status: "partial", generation: { status: "response_completed" } });
	expect(fixture.submissions()).toBe(1);
});
