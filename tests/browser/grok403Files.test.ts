// biome-ignore-all lint/style/useNamingConvention: DOM/CDP wire names retain platform spelling.
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { uploadGrokAttachments } from "../../src/browser/actions/grok.js";

class Node {
	parentElement: Node | null = null;
	children: Node[] = [];
	files: { name: string; size: number }[] = [];
	disabled = false;
	hidden = false;
	onClick = () => {};
	constructor(
		public tagName = "DIV",
		public attrs: Record<string, string> = {},
		public ownText = "",
	) {}
	append(...children: Node[]) {
		for (const child of children) {
			child.parentElement = this;
			this.children.push(child);
		}
	}
	get textContent(): string {
		return this.ownText + this.children.map((child) => child.textContent).join("");
	}
	get innerText() {
		return this.textContent;
	}
	getAttribute(key: string) {
		return this.attrs[key] ?? null;
	}
	hasAttribute(key: string) {
		return key in this.attrs;
	}
	setAttribute(key: string, value: string) {
		this.attrs[key] = value;
	}
	getBoundingClientRect() {
		return { width: this.hidden ? 0 : 100, height: this.hidden ? 0 : 20 };
	}
	click() {
		this.onClick();
	}
	matches(selector: string): boolean {
		return selector.split(",").some((part) => {
			const text = part.trim();
			const tag = text.match(/^[a-z]+/i)?.[0];
			if (tag && tag.toUpperCase() !== this.tagName) return false;
			const attrs = [...text.matchAll(/\[([^\]=*^$]+)([*^$]?=)?(?:"([^"]*)")?\]/g)];
			if (!tag && !attrs.length) return false;
			return attrs.every(([, key, op, value]) => {
				const actual = this.getAttribute(key);
				return !op
					? actual !== null
					: op === "*="
						? actual?.includes(value)
						: op === "^="
							? actual?.startsWith(value)
							: actual === value;
			});
		});
	}
	closest(selector: string): Node | null {
		return this.matches(selector) ? this : (this.parentElement?.closest(selector) ?? null);
	}
	querySelectorAll(selector: string): Node[] {
		return this.children.flatMap((child) => [
			...(child.matches(selector) ? [child] : []),
			...child.querySelectorAll(selector),
		]);
	}
	querySelector(selector: string) {
		return this.querySelectorAll(selector)[0] ?? null;
	}
}
function fixture() {
	const document = new Node("DOCUMENT");
	const body = new Node("BODY");
	const composer = new Node("FORM", { "data-project-id": "project-1" });
	const editor = new Node("TEXTAREA", { placeholder: "Ask Grok anything" });
	const input = new Node("INPUT", { type: "file" });
	composer.append(editor, input);
	body.append(composer);
	document.append(body);
	const runtime = {
		evaluate: vi.fn(async ({ expression }: { expression: string }) => ({
			result: {
				value: runInNewContext(expression, {
					document: Object.assign(document, { body, scripts: [], title: "Grok" }),
					HTMLElement: Node,
					HTMLInputElement: Node,
					getComputedStyle: () => ({ display: "block", visibility: "visible" }),
					window: {
						__NEXT_DATA__: {
							props: { pageProps: { user: { id: "user-1", email: "operator@example.test" } } },
						},
						getComputedStyle: () => ({ display: "block", visibility: "visible" }),
					},
					location: { href: "https://grok.com/project/project-1" },
				}),
			},
		})),
	};
	const dom = {
		getDocument: vi.fn(async () => ({ root: { nodeId: 1 } })),
		querySelector: vi.fn(async () => ({ nodeId: 2 })),
		setFileInputFiles: vi.fn(async () => {
			input.files = [{ name: "same.txt", size: 4 }];
		}),
	};
	return { document, body, composer, editor, input, runtime, dom };
}

test("a basename elsewhere on the page never confirms the intended local upload", async () => {
	const f = fixture();
	f.body.append(new Node("DIV", {}, "same.txt"));
	await expect(
		uploadGrokAttachments(
			f.dom as never,
			f.runtime as never,
			[{ path: "/tmp/same.txt", displayPath: "same.txt" }],
			() => {},
		),
	).rejects.toThrow();
}, 15000);

// Test seam: real DOM expressions over a controlled CDP transport; no provider.
import { createGrokFileClient } from "../../src/browser/providers/grokFiles.js";

test("native selection mismatch cannot be promoted to ready by a new composer file ID", async () => {
	const f = fixture();
	f.dom.setFileInputFiles.mockImplementation(async () => {
		f.input.files = [{ name: "wrong.txt", size: 5 }];
		f.composer.append(
			new Node("DIV", { "data-file-id": "new-file", "data-state": "ready" }, "wrong.txt"),
		);
	});
	const result = await createGrokFileClient(f.runtime as never, { timeoutMs: 0 }).upload(
		f.dom as never,
		["/tmp/intended.txt"],
	);
	expect(result.status).toBe("unconfirmed");
	expect(result.code).toBe("grok_file_native_selection_unconfirmed");
});

test("exact local upload remains pending until its new stable file ID is explicitly ready", async () => {
	const f = fixture();
	const chip = new Node(
		"DIV",
		{ "data-file-id": "upload-1", "data-state": "uploading" },
		"same.txt",
	);
	f.dom.setFileInputFiles.mockImplementation(async () => {
		f.input.files = [{ name: "same.txt", size: 4 }];
		f.composer.append(chip);
	});
	const client = createGrokFileClient(f.runtime as never, { timeoutMs: 0 });
	expect(await client.upload(f.dom as never, ["/tmp/same.txt"])).toMatchObject({
		status: "unconfirmed",
		code: "grok_file_readiness_unconfirmed",
		files: [{ id: "upload-1", state: "progress" }],
		provenance: { projectId: "project-1" },
	});
	chip.attrs["data-state"] = "ready";
	expect(await client.context()).toMatchObject({
		status: "complete",
		files: [{ id: "upload-1", state: "ready" }],
	});
});

test("recent duplicate basenames select only the exact stable ID and verify it in the composer", async () => {
	const f = fixture();
	const attach = new Node("BUTTON", { "aria-label": "Attach" });
	const menu = new Node("DIV", { role: "menu" });
	menu.hidden = true;
	const recent = new Node("BUTTON", { role: "menuitem" }, "Recent files");
	menu.append(recent);
	const choices = new Node("DIV", { role: "menu", "aria-label": "Recent files" });
	choices.hidden = true;
	const first = new Node("BUTTON", { "data-file-id": "file-a", role: "menuitem" }, "same.txt");
	const second = new Node("BUTTON", { "data-file-id": "file-b", role: "menuitem" }, "same.txt");
	choices.append(first, second);
	f.composer.append(attach);
	f.body.append(menu, choices);
	attach.onClick = () => {
		menu.hidden = false;
	};
	recent.onClick = () => {
		menu.hidden = true;
		choices.hidden = false;
	};
	first.onClick = () => {
		throw new Error("Wrong duplicate basename selected");
	};
	second.onClick = () => {
		choices.hidden = true;
		f.composer.append(
			new Node("DIV", { "data-file-id": "file-b", "data-state": "ready" }, "same.txt"),
		);
	};
	const result = await createGrokFileClient(f.runtime as never, {
		timeoutMs: 50,
		pollMs: 0,
	}).select("file-b");
	expect(result).toMatchObject({
		status: "complete",
		code: "grok_files_ready",
		files: [{ id: "file-b", name: "same.txt", state: "ready" }],
	});
	expect(result.coverage.scope).toBe("composer");
});

test("an exact composer upload error fails visibly without another upload", async () => {
	const f = fixture();
	f.dom.setFileInputFiles.mockImplementation(async () => {
		f.input.files = [{ name: "same.txt", size: 4 }];
		f.composer.append(
			new Node("DIV", { "data-file-id": "error-file", "data-state": "failed" }, "same.txt"),
		);
	});
	const result = await createGrokFileClient(f.runtime as never, { timeoutMs: 0 }).upload(
		f.dom as never,
		["/tmp/same.txt"],
	);
	expect(result).toMatchObject({ status: "failed", code: "grok_file_upload_error" });
	expect(f.dom.setFileInputFiles).toHaveBeenCalledTimes(1);
});

test("losing the bound composer after dispatch preserves unknown upload custody", async () => {
	const f = fixture();
	f.dom.setFileInputFiles.mockImplementation(async () => {
		f.input.files = [{ name: "same.txt", size: 4 }];
		f.composer.attrs = {};
	});
	await expect(
		createGrokFileClient(f.runtime as never, { timeoutMs: 0 }).upload(f.dom as never, [
			"/tmp/same.txt",
		]),
	).rejects.toMatchObject({ details: { effectState: "unknown" } });
});

import { createGrokFilesService } from "../../src/browser/grokFilesService.js";
import { runGrokFilesCommand } from "../../src/cli/grokFilesCommand.js";
import { createGrokFilesToolHandler } from "../../src/mcp/tools/grokFiles.js";
import { fixtureConnectorServiceOptions } from "./grok404ConnectorDomFixture.js";

test("public CLI and MCP expose missing upload source binding under configured traffic/account authority", async () => {
	const f = fixture();
	let nextId = 0;
	f.dom.setFileInputFiles.mockImplementation(async () => {
		f.input.files = [{ name: "same.txt", size: 4 }];
		f.composer.append(
			new Node("DIV", { "data-file-id": `file-${++nextId}`, "data-state": "ready" }, "same.txt"),
		);
	});
	const begin = vi.fn(async () => ({ settle }));
	const settle = vi.fn(async () => {});
	const close = vi.fn(async () => {});
	const service = createGrokFilesService(fixtureConnectorServiceOptions(), {
		connect: async () => ({
			client: {
				Runtime: f.runtime,
				DOM: f.dom,
				close,
				__auracallProviderTrafficGovernor: {
					attribution: { provider: "grok", targetId: "fixture-target" },
					admitBackendRequest: async () => {},
					begin,
				},
			},
			targetId: "fixture-target",
			shouldClose: false,
			host: "localhost",
			port: 1,
		}),
	});
	const result = await runGrokFilesCommand({ action: "upload", paths: ["/tmp/same.txt"] }, service);
	expect(result).toMatchObject({
		status: "unconfirmed",
		code: "grok_file_source_binding_unavailable",
		provenance: { targetId: "fixture-target", projectId: "project-1" },
		files: [{ id: "file-1", state: "ready" }],
	});
	expect(result.providerAccountRef).toMatch(/^[a-f0-9]{64}$/);
	const mcp = await createGrokFilesToolHandler(() => service)({
		action: "upload",
		paths: ["/tmp/same.txt"],
	});
	expect(mcp.isError).toBe(true);
	expect(mcp.structuredContent).toMatchObject({
		status: "unconfirmed",
		files: [{ id: "file-1" }, { id: "file-2" }],
	});
	expect(begin).toHaveBeenCalledWith(
		expect.objectContaining({
			kind: "input",
			interactionClass: "upload-submit",
			targetId: "fixture-target",
		}),
	);
	expect(settle).toHaveBeenCalledWith(
		expect.objectContaining({ outcome: "failed", effectState: "outcome-unknown" }),
	);
	expect(close).toHaveBeenCalledTimes(2);
});

test("missing governor blocks uploads before DOM effects and public errors omit local paths", async () => {
	const f = fixture();
	const close = vi.fn(async () => {});
	const service = createGrokFilesService(
		{},
		{
			connect: async () => ({
				client: { Runtime: f.runtime, DOM: f.dom, close },
				targetId: "fixture-target",
				shouldClose: false,
				host: "localhost",
				port: 1,
			}),
		},
	);
	const result = await runGrokFilesCommand(
		{ action: "upload", paths: ["/private/source.txt"] },
		service,
	);
	expect(result).toMatchObject({ status: "failed", code: "grok_files_failed" });
	expect(JSON.stringify(result)).not.toContain("/private");
	expect(f.dom.setFileInputFiles).not.toHaveBeenCalled();
	expect(close).toHaveBeenCalledOnce();
});

test("changing project context during upload cannot confirm readiness in the wrong project", async () => {
	const f = fixture();
	f.dom.setFileInputFiles.mockImplementation(async () => {
		f.input.files = [{ name: "same.txt", size: 4 }];
		f.composer.attrs["data-project-id"] = "project-other";
		f.composer.append(
			new Node("DIV", { "data-file-id": "new-id", "data-state": "ready" }, "same.txt"),
		);
	});
	expect(
		await createGrokFileClient(f.runtime as never, { timeoutMs: 0 }).upload(f.dom as never, [
			"/tmp/same.txt",
		]),
	).toMatchObject({ status: "unconfirmed", code: "grok_file_context_changed" });
});

test.each([
	false,
	true,
])("governed upload ambiguity retains target even when cleanup fails (%s)", async (cleanupFails) => {
	const f = fixture();
	const closeTarget = vi.fn(async () => {});
	const close = vi.fn(async () => {});
	const settle = vi.fn(async () => {});
	if (cleanupFails)
		close.mockRejectedValue(
			new AggregateError([new Error("private cleanup failure")], "cleanup failed"),
		);
	f.dom.setFileInputFiles.mockRejectedValue(new Error("transport closed /private/source.txt"));
	const service = createGrokFilesService(fixtureConnectorServiceOptions(), {
		connect: async () => ({
			client: {
				Runtime: f.runtime,
				DOM: f.dom,
				close,
				__auracallProviderTrafficGovernor: {
					attribution: { provider: "grok", targetId: "fixture-target" },
					admitBackendRequest: async () => {},
					begin: async () => ({ settle }),
				},
			},
			targetId: "fixture-target",
			shouldClose: true,
			host: "localhost",
			port: 1,
		}),
		closeTarget,
	});
	const result = await runGrokFilesCommand({ action: "upload", paths: ["/tmp/same.txt"] }, service);
	expect(result.status).toBe("unconfirmed");
	expect(result.provenance.targetId).toBe("fixture-target");
	expect(f.dom.setFileInputFiles).toHaveBeenCalledOnce();
	expect(closeTarget).not.toHaveBeenCalled();
	expect(close).toHaveBeenCalledOnce();
	expect(settle).toHaveBeenCalledWith(expect.objectContaining({ effectState: "outcome-unknown" }));
	expect(JSON.stringify(result)).not.toContain("/private");
});

test("an unrelated new ready file cannot stand in for the selected native upload", async () => {
	const f = fixture();
	f.dom.setFileInputFiles.mockImplementation(async () => {
		f.input.files = [{ name: "same.txt", size: 4 }];
		// Intended file is absent. A different source appears in the same composer.
		f.composer.append(
			new Node("DIV", { "data-file-id": "foreign-ready-id", "data-state": "ready" }, "same.txt"),
		);
	});
	const result = await createGrokFileClient(f.runtime as never, { timeoutMs: 0 }).upload(
		f.dom as never,
		["/tmp/same.txt"],
	);
	expect(result).toMatchObject({
		status: "unconfirmed",
		code: "grok_file_source_binding_unavailable",
	});
});
