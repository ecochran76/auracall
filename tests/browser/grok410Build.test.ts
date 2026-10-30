// biome-ignore-all lint/style/useNamingConvention: CDP and DOM platform names are case-sensitive.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createContext, runInContext } from "node:vm";
import { expect, test } from "vitest";
import { readGrokAssistantSnapshotForRuntime } from "../../src/browser/actions/grok.js";
import { createGrokBuildService } from "../../src/browser/grokBuildService.js";
import { ConnectorFixtureNode } from "./grok404ConnectorDomFixture.js";

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
	get childNodes() {
		return [
			...(this.ownText ? [{ nodeType: 3, textContent: this.ownText, parentElement: this }] : []),
			...this.children,
		];
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
	driftOnInspect = false,
	planeAfterSend = false,
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
		selections++;
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
	let inputs = 0;
	let selections = 0;
	let verifications = 0;
	build.onClick = () => {
		selections++;
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
	const seedPlane = ({
		running = false,
		fakeProseTerminal = false,
		closedStop = false,
		duplicatePlane = false,
		previewBearerInProse = false,
		newerAssistant = false,
	} = {}) => {
		location.href = "https://grok.com/c/conversation-generated";
		const userMessage = new Node("div", "Synthetic timer request", {
			"data-testid": "user-message",
		});
		const userRoot = new Node("div", "", { id: "response-user" }, [userMessage]);
		const userRow = new Node("div", "", { "data-plane-row": "gateway:user" }, [userRoot]);
		const marker = new Button("Worked for 10m 6s", { "data-testid": "canvas-trigger" });
		const thinking = new Node("div", "", { class: "thinking-container" }, [marker]);
		const prose = new Node(
			"div",
			previewBearerInProse
				? "Generated timer source https://sample.grok-sandbox.com/__grok-preview/auth?token=SECRET_PREVIEW_BEARER"
				: "Generated timer source",
			{ class: "response-content-markdown" },
			fakeProseTerminal ? [thinking] : [],
		);
		const message = new Node("div", "", { "data-testid": "assistant-message" }, [
			...(!fakeProseTerminal ? [thinking] : []),
			prose,
		]);
		const response = new Node("div", "", { id: "response-created" }, [message]);
		const row = new Node("div", "", { "data-plane-row": "gateway:assistant" }, [response]);
		const later = row.cloneNode(true);
		later.attributes["data-plane-row"] = "gateway:newer";
		const laterResponse = later.querySelector('[id^="response-"]');
		if (!laterResponse) throw new Error("fixture response missing");
		laterResponse.attributes.id = "response-newer";
		const plane = new Node("div", "", { "data-transcript-renderer": "plane" }, [
			userRow,
			row,
			...(newerAssistant ? [later] : []),
		]);
		const frame = new Node("iframe", "", {
			src: "https://sample.grok-sandbox.com/__grok-preview/auth?token=SECRET_PREVIEW_BEARER",
			title: "Preview",
		});
		const stop = new Button("Stop model response", { "aria-label": "Stop model response" });
		const closed = new Node("div", "", { "data-state": "closed" }, [stop]);
		document.children = [
			plane,
			...(duplicatePlane ? [plane.cloneNode(true)] : []),
			frame,
			...(running ? [stop] : closedStop ? [closed] : []),
		];
		for (const child of document.children) child.parentElement = document;
	};
	submit.onClick = () => {
		submissions++;
		if (planeAfterSend) {
			seedPlane();
			return;
		}
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
		Node: Object.assign(Node, { TEXT_NODE: 3, ELEMENT_NODE: 1 }),
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
				inputs++;
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
	type WorkspaceFiber = {
		memoizedProps: Record<string, unknown>;
		stateNode?: unknown;
		tag?: number;
		return?: WorkspaceFiber | null;
		child?: WorkspaceFiber;
	};
	const setWorkspace = (committed: "inactive" | "ready", seeded = committed) => {
		const button = new Button("", { "aria-label": "File tree" });
		const owner: { current: WorkspaceFiber | null } = { current: null };
		const tree = (status: string) => {
			const path: WorkspaceFiber[] = [
				{ memoizedProps: {}, stateNode: owner, tag: 3, return: null },
				{ memoizedProps: { conversationId: "conversation-generated", view: "document" } },
				{ memoizedProps: { fs: { fsKey: "conversation:conversation-generated" } } },
				{ memoizedProps: { tree: [], status, dirStatus: new Map() } },
				{ memoizedProps: {}, stateNode: button },
			];
			for (let index = 1; index < path.length; index++) {
				path[index].return = path[index - 1];
				path[index - 1].child = path[index];
			}
			return path;
		};
		const current = tree(committed);
		owner.current = current[0];
		const seed = seeded === committed ? current : tree(seeded);
		Object.assign(button, { __reactFiber$fixture: seed[seed.length - 1] });
		button.parentElement = document;
		document.children.push(button);
	};
	return {
		runtime,
		service: createGrokBuildService(
			{ host: "localhost", port: 1 },
			{
				connect: async () => ({
					client: client as never,
					targetId: "build-target",
					shouldClose: false,
					host: "localhost",
					port: 1,
				}),
				verifyAccount: async () => {
					verifications++;
					return (drift && submissions > 0) || (driftOnInspect && verifications > 1)
						? "different-account"
						: "account-reference";
				},
			},
		),
		submissions: () => submissions,
		inputs: () => inputs,
		selections: () => selections,
		seedPlane,
		setInactiveWorkspace: () => setWorkspace("inactive"),
		setWorkspace,
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

test("public inspection reads completed plane Build without Send or exposing its preview bearer", async () => {
	const fixture = buildFixture();
	fixture.seedPlane({ closedStop: true });
	const handler = createGrokBuildToolHandler(async () => fixture.service);
	const reply = await handler({
		action: "inspect",
		targetId: "build-target",
		conversationId: "conversation-generated",
		responseId: "response-created",
	});
	const result = reply.structuredContent;
	expect(result).toMatchObject({
		status: "partial",
		code: "grok_build_app_identity_unobserved",
		generation: {
			status: "response_completed",
			responseId: "response-created",
			text: "Generated timer source",
		},
		conversationId: "conversation-generated",
		preview: { status: "available", url: null },
		app: { id: null, version: null },
		effectState: "none",
		retrySafe: true,
	});
	expect(JSON.stringify(result)).not.toContain("SECRET_PREVIEW_BEARER");
	expect(fixture.submissions()).toBe(0);
	expect(fixture.inputs()).toBe(0);
	expect(fixture.selections()).toBe(0);
});

test.each([
	"response-user",
	"response-missing",
])("inspection refuses a user or missing selected response %s", async (responseId) => {
	const fixture = buildFixture();
	fixture.seedPlane();
	const result = await runGrokBuildCommand(
		{
			action: "inspect",
			targetId: "build-target",
			conversationId: "conversation-generated",
			responseId,
		},
		fixture.service,
	);
	expect(result).toMatchObject({
		status: "unknown",
		code: "grok_build_response_not_observed",
		generation: { text: null, responseId: null },
		effectState: "none",
	});
	expect(fixture.submissions()).toBe(0);
});

test.each([
	"active-stop",
	"prose-marker",
])("inspection does not claim completion from %s", async (kind) => {
	const fixture = buildFixture();
	fixture.seedPlane({
		running: kind === "active-stop",
		fakeProseTerminal: kind === "prose-marker",
	});
	const result = await runGrokBuildCommand(
		{ action: "inspect", targetId: "build-target", conversationId: "conversation-generated" },
		fixture.service,
	);
	expect(result.generation.status).toBe("unknown");
	expect(result.generation.uiState).toBe(kind === "active-stop" ? "running" : "unknown");
	expect(fixture.submissions()).toBe(0);
	expect(fixture.inputs()).toBe(0);
	expect(fixture.selections()).toBe(0);
});

test("inspection rejects route drift and discards data after fresh account drift", async () => {
	const wrongRoute = buildFixture();
	wrongRoute.seedPlane();
	expect(
		await runGrokBuildCommand(
			{ action: "inspect", targetId: "build-target", conversationId: "other-conversation" },
			wrongRoute.service,
		),
	).toMatchObject({
		status: "unknown",
		code: "grok_build_conversation_not_verified",
		generation: { text: null },
	});
	const account = buildFixture({ driftOnInspect: true });
	account.seedPlane();
	const result = await runGrokBuildCommand(
		{ action: "inspect", targetId: "build-target", conversationId: "conversation-generated" },
		account.service,
	);
	expect(result).toMatchObject({
		status: "unknown",
		code: "grok_build_inspection_failed",
		generation: { text: null },
		preview: { status: "unknown", url: null },
	});
	expect(JSON.stringify(result)).not.toContain("SECRET_PREVIEW_BEARER");
});

test("inspection requires an existing browser endpoint before acquiring any target", async () => {
	const service = createGrokBuildService(
		{},
		{
			connect: async () => {
				throw new Error("must not acquire or launch");
			},
		},
	);
	expect(
		await service.inspect({ targetId: "build-target", conversationId: "conversation-generated" }),
	).toMatchObject({
		status: "unavailable",
		code: "grok_build_existing_browser_required",
		effectState: "none",
		cleanupState: "completed",
	});
});

test("generation observes the native plane assistant outside main and retains exact response identity", async () => {
	const fixture = buildFixture({ planeAfterSend: true });
	const result = await runGrokBuildCommand(
		{ action: "generate", prompt: "Make a local timer", confirmed: true, timeoutMs: 2500 },
		fixture.service,
	);
	expect(result).toMatchObject({
		status: "partial",
		generation: {
			status: "response_completed",
			responseId: "response-created",
			text: "Generated timer source",
		},
		conversationId: "conversation-generated",
		effectState: "completed",
		preview: { status: "available", url: null },
		retrySafe: false,
	});
	expect(fixture.submissions()).toBe(1);
	expect(JSON.stringify(result)).not.toContain("SECRET_PREVIEW_BEARER");
});

test("native plane snapshot binds assistant response rather than the user row", async () => {
	const fixture = buildFixture();
	fixture.seedPlane();
	expect(await readGrokAssistantSnapshotForRuntime(fixture.runtime as never)).toMatchObject({
		responseId: "response-created",
		terminal: true,
		terminalEvidence: "plane-canvas-work-complete",
	});
});

test.each([
	"active-stop",
	"prose-marker",
	"ambiguous-plane",
])("native generation snapshot rejects %s as completed", async (kind) => {
	const fixture = buildFixture();
	fixture.seedPlane({
		running: kind === "active-stop",
		fakeProseTerminal: kind === "prose-marker",
		duplicatePlane: kind === "ambiguous-plane",
	});
	const snapshot = await readGrokAssistantSnapshotForRuntime(fixture.runtime as never);
	expect(snapshot.terminal).toBe(false);
	if (kind === "active-stop") expect(snapshot.streaming).toBe(true);
});

test("Build inspection redacts an authenticated preview URL quoted in generated prose", async () => {
	const fixture = buildFixture();
	fixture.seedPlane({ previewBearerInProse: true });
	const result = await runGrokBuildCommand(
		{ action: "inspect", targetId: "build-target", conversationId: "conversation-generated" },
		fixture.service,
	);
	expect(result.generation.status).toBe("response_completed");
	expect(JSON.stringify(result)).not.toContain("SECRET_PREVIEW_BEARER");
});

test("export refuses an older assistant when the conversation has another workspace response", async () => {
	const fixture = buildFixture();
	fixture.seedPlane({ newerAssistant: true });
	const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "grok410-response-binding-"));
	try {
		await fs.chmod(outputDir, 0o700);
		const result = await fixture.service.export({
			targetId: "build-target",
			conversationId: "conversation-generated",
			responseId: "response-created",
			outputDir,
			acknowledgeTargetDefaultReset: true,
		});
		expect(result).toMatchObject({
			generation: { responseId: null },
			artifacts: { status: "unavailable", entries: [] },
			effectState: "none",
			exportCapture: { setup: "not_attempted" },
		});
	} finally {
		await fs.rm(outputDir, { recursive: true, force: true });
	}
});

test("public inspection reports the selected native workspace inactive despite its completed assistant", async () => {
	const fixture = buildFixture();
	fixture.seedPlane();
	fixture.setInactiveWorkspace();
	const result = await fixture.service.inspect({
		targetId: "build-target",
		conversationId: "conversation-generated",
	});
	expect(result).toMatchObject({
		status: "unavailable",
		code: "grok_build_workspace_inactive",
		generation: { status: "response_completed" },
		preview: { status: "unknown" },
		effectState: "none",
		cleanupState: "completed",
	});
});

test("public export refuses the current inactive workspace before capture or download dispatch", async () => {
	const fixture = buildFixture();
	fixture.seedPlane();
	fixture.setInactiveWorkspace();
	const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "grok-inactive-"));
	await fs.chmod(outputDir, 0o700);
	try {
		const result = await fixture.service.export({
			targetId: "build-target",
			conversationId: "conversation-generated",
			outputDir,
			acknowledgeTargetDefaultReset: true,
		});
		expect(result).toMatchObject({
			status: "unavailable",
			code: "grok_build_workspace_inactive",
			effectState: "none",
			exportCapture: { setup: "not_attempted", reset: "not_needed" },
			artifacts: { status: "unavailable", entries: [] },
			cleanupState: "completed",
		});
	} finally {
		await fs.rm(outputDir, { recursive: true, force: true });
	}
});

test.each([
	["inspect", "ready"],
	["inspect", "inactive"],
	["export", "ready"],
	["export", "inactive"],
] as const)("public %s reads committed workspace state %s instead of the stale DOM fiber", async (action, committed) => {
	const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "grok-committed-"));
	await fs.chmod(outputDir, 0o700);
	try {
		const fixture = buildFixture();
		fixture.seedPlane();
		fixture.setWorkspace(committed, committed === "ready" ? "inactive" : "ready");
		const request = { targetId: "build-target", conversationId: "conversation-generated" };
		const result =
			action === "inspect"
				? await fixture.service.inspect(request)
				: await fixture.service.export({
						...request,
						outputDir,
						acknowledgeTargetDefaultReset: true,
					});
		expect(result.code).toBe(
			committed === "inactive"
				? "grok_build_workspace_inactive"
				: action === "inspect"
					? "grok_build_app_identity_unobserved"
					: "grok_build_target_download_unsupported",
		);
	} finally {
		await fs.rm(outputDir, { recursive: true, force: true });
	}
});
