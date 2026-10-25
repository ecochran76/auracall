// biome-ignore-all lint/style/useNamingConvention: DOM/CDP wire names retain platform spelling.

import { createHash, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";

vi.mock("node:fs/promises", async (loadOriginal) => {
	const original = await loadOriginal<typeof import("node:fs/promises")>();
	return {
		...original,
		readFile: async (...args: Parameters<typeof original.readFile>) => {
			if (args[0] === "/tmp/same.txt" || args[0] === "/tmp/intended.txt")
				return Buffer.from("same");
			return original.readFile(...args);
		},
	};
});

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
	const identityUser = { id: "user-1", email: "operator@example.test" };
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
				value: await runInNewContext(expression, {
					document: Object.assign(document, { body, scripts: [], title: "Grok" }),
					crypto: webcrypto,
					HTMLElement: Node,
					HTMLInputElement: Node,
					getComputedStyle: () => ({ display: "block", visibility: "visible" }),
					window: {
						__NEXT_DATA__: {
							props: { pageProps: { user: identityUser } },
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
	return { document, body, composer, editor, input, runtime, dom, identityUser };
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

test.each([
	"processing",
	"prompt-upload",
	"prompt-account-drift",
	"wrong-bytes",
	"foreign-account",
	"foreign-native-file",
	"conflicting-props",
	"inactive-fiber",
	"committed-cycle",
	"ambiguous-host",
	"commit-during-digest",
	"submit-false",
	"submit-stale",
	"submit-prose",
	"submit-other-form",
	"submit-disabled",
	"private",
	"deleted",
] as const)("native attachment metadata binds only exact source File bytes (%s)", async (scenario) => {
	const f = fixture();
	let duringDigest = () => {};
	const native = {
		name: "same.txt",
		size: 4,
		type: "text/plain",
		arrayBuffer: async () => {
			duringDigest();
			return Uint8Array.from(Buffer.from(scenario === "wrong-bytes" ? "else" : "same")).buffer;
		},
	};
	const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
	f.dom.setFileInputFiles.mockImplementation(async () => {
		f.input.files = [native];
		const button = new Node("BUTTON", { "aria-label": "Open attachment" }, "same.txt");
		Object.assign(button, {
			__reactFiberFixture: {
				memoizedProps: {
					localFile: scenario === "foreign-native-file" ? { ...native } : native,
					metadata: {
						fileMetadataId: id,
						fileName: "same.txt",
						fileMimeType: "text/plain",
						fileSource: "SELF_UPLOAD_FILE_SOURCE",
						fileUri: `users/${scenario === "foreign-account" ? "foreign" : "user-1"}/${id}/content`,
					},
					phase: "processing",
					isPrivate: scenario === "private",
					isDeleted: scenario === "deleted",
				},
				return: null,
			},
		});
		if (scenario === "conflicting-props") {
			const fiber = (
				button as unknown as {
					__reactFiberFixture: { memoizedProps: Record<string, unknown>; return: unknown };
				}
			).__reactFiberFixture;
			fiber.return = {
				memoizedProps: {
					...fiber.memoizedProps,
					metadata: {
						...(fiber.memoizedProps.metadata as Record<string, unknown>),
						fileMetadataId: "11111111-2222-3333-4444-555555555555",
						fileUri: "users/user-1/11111111-2222-3333-4444-555555555555/content",
					},
				},
				return: null,
			};
		}
		type Fiber = {
			memoizedProps?: Record<string, unknown>;
			return: Fiber | null;
			child?: Fiber | null;
			sibling?: Fiber | null;
			stateNode?: unknown;
			tag?: number;
		};
		const seeded = (button as unknown as { __reactFiberFixture: Fiber }).__reactFiberFixture;
		seeded.stateNode = button;
		const top = seeded.return ?? seeded;
		if (top !== seeded) top.child = seeded;
		const form: Fiber = { stateNode: f.composer, return: null, child: top };
		const currentRoot: Fiber = { tag: 3, stateNode: null, return: null, child: form };
		const owner = { current: currentRoot };
		currentRoot.stateNode = owner;
		form.return = currentRoot;
		top.return = form;
		if (scenario === "inactive-fiber") {
			const staleRoot: Fiber = { tag: 3, stateNode: owner, return: null };
			const staleForm: Fiber = { stateNode: f.composer, return: staleRoot, child: seeded };
			seeded.return = staleForm;
			const committed: Fiber = {
				...seeded,
				memoizedProps: {
					...seeded.memoizedProps,
					metadata: {
						...(seeded.memoizedProps?.metadata as Record<string, unknown>),
						fileMetadataId: "11111111-2222-3333-4444-555555555555",
						fileUri: "users/user-1/11111111-2222-3333-4444-555555555555/content",
					},
					phase: undefined,
				},
			};
			// Shared children may retain an old return pointer. The actual
			// committed parent is determined by current child/sibling topology.
			form.child = committed;
		}
		const submit = new Node(
			"BUTTON",
			{ "data-testid": "chat-submit", "aria-disabled": "false", type: "submit" },
			"isQueryable=true",
		);
		submit.disabled = scenario === "submit-disabled";
		const submitHost: Fiber = {
			stateNode: submit,
			memoizedProps: { type: "submit" },
			return: null,
		};
		const submitComponent: Fiber = {
			memoizedProps: {
				isQueryable:
					scenario === "submit-false" || scenario === "submit-stale"
						? false
						: scenario === "submit-prose"
							? "true"
							: true,
			},
			return: form,
			child: submitHost,
		};
		submitHost.return = submitComponent;
		Object.assign(submit, { __reactFiberFixture: submitHost });
		if (scenario === "submit-stale") {
			const staleRoot: Fiber = { tag: 3, stateNode: owner, return: null };
			Object.assign(submit, {
				__reactFiberFixture: {
					...submitHost,
					memoizedProps: { isQueryable: true },
					return: staleRoot,
				},
			});
		}
		if (form.child) form.child.sibling = submitComponent;
		(scenario === "submit-other-form" ? f.body : f.composer).append(submit);
		if (scenario === "committed-cycle") seeded.sibling = seeded;
		if (scenario === "ambiguous-host") seeded.sibling = { ...seeded };
		if (scenario === "commit-during-digest")
			duringDigest = () => {
				owner.current = { tag: 3, stateNode: owner, return: null };
			};
		if (scenario === "prompt-account-drift")
			duringDigest = () => {
				f.identityUser.id = "other-user";
			};
		f.composer.append(button);
	});
	if (scenario === "prompt-account-drift") {
		await expect(
			uploadGrokAttachments(
				f.dom as never,
				f.runtime as never,
				[{ path: "/tmp/same.txt", displayPath: "same.txt" }],
				() => {},
			),
		).rejects.toMatchObject({ details: { effectState: "unknown" } });
		expect(f.dom.setFileInputFiles).toHaveBeenCalledOnce();
		return;
	}
	const client = createGrokFileClient(f.runtime as never, {
		timeoutMs: 0,
		providerUserId: "user-1",
	});
	let result: Awaited<ReturnType<typeof client.upload>>;
	if (scenario === "prompt-upload") {
		await uploadGrokAttachments(
			f.dom as never,
			f.runtime as never,
			[{ path: "/tmp/same.txt", displayPath: "same.txt" }],
			() => {},
		);
		result = await client.context();
	} else result = await client.upload(f.dom as never, ["/tmp/same.txt"]);
	const ready =
		scenario === "processing" || scenario === "inactive-fiber" || scenario === "prompt-upload";
	expect(result.status).toBe(ready ? "complete" : "unconfirmed");
	if (scenario === "prompt-upload")
		expect(result).toMatchObject({
			status: "complete",
			files: [{ id, state: "ready", sourceAgreement: "observed-native" }],
		});
	else if (scenario === "processing")
		expect(result).toMatchObject({
			code: "grok_files_ready",
			files: [
				{
					id,
					state: "ready",
					sourceBinding: "native-file-object",
					sourceAgreement: "local-manifest",
					sourceSha256: createHash("sha256").update("same").digest("hex"),
				},
			],
		});
	else if (scenario === "inactive-fiber")
		expect(result).toMatchObject({
			files: [
				{
					id: "11111111-2222-3333-4444-555555555555",
					state: "ready",
					sourceBinding: "native-file-object",
				},
			],
		});
	else if (
		[
			"submit-false",
			"submit-stale",
			"submit-prose",
			"submit-other-form",
			"submit-disabled",
			"private",
			"deleted",
		].includes(scenario)
	)
		expect(result).toMatchObject({
			code: "grok_file_readiness_unconfirmed",
			files: [{ id, state: "unknown", sourceAgreement: "local-manifest" }],
		});
	else
		expect(result.files).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					sourceBinding: "native-file-object",
					sourceAgreement: "local-manifest",
				}),
			]),
		);
	expect(f.dom.setFileInputFiles).toHaveBeenCalledOnce();
	if (scenario === "processing") {
		const restarted = createGrokFileClient(f.runtime as never, { providerUserId: "user-1" });
		expect(await restarted.context()).toMatchObject({
			status: "complete",
			code: "grok_file_context",
			files: [
				{
					id,
					state: "ready",
					sourceBinding: "native-file-object",
					sourceAgreement: "observed-native",
				},
			],
		});
		expect(f.dom.setFileInputFiles).toHaveBeenCalledOnce();
	}
	expect(await createGrokFileClient(f.runtime as never).context()).toMatchObject({
		status: "incomplete",
		code: "grok_file_native_context_unconfirmed",
	});
}, 15000);

test.each([
	false,
	true,
])("chooser observation fails before item selection even if cleanup fails (%s)", async (cleanupFails) => {
	const f = fixture();
	const attach = new Node("BUTTON", { "aria-label": "Attach" }, "Attach");
	attach.onClick = () => {
		throw new Error("chooser observation transport unavailable");
	};
	f.composer.append(attach);
	const closeTarget = vi.fn(async () => {});
	const settle = vi.fn(async () => {});
	const close = vi.fn(async () => {
		if (cleanupFails) throw new AggregateError([new Error("cleanup unavailable")]);
	});
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
	const result = await runGrokFilesCommand({ action: "select", id: "known-b" }, service);
	expect(result).toMatchObject({
		status: "unconfirmed",
		selectionDispatch: "not-dispatched",
		provenance: { targetId: "fixture-target" },
	});
	expect(f.dom.setFileInputFiles).not.toHaveBeenCalled();
	expect(closeTarget).not.toHaveBeenCalled();
	expect(close).toHaveBeenCalledOnce();
});

test.each([
	"ready",
	"foreign-account",
	"stale-row",
	"pending-submit",
	"foreign-context",
	"private-context",
	"changed-row",
] as const)("native Recent joins duplicate labels by committed asset key (%s)", async (scenario) => {
	const f = fixture();
	Object.assign(f.document, {
		getElementById: (id: string) =>
			f.document.querySelectorAll("[id]").find((n) => n.getAttribute("id") === id) ?? null,
	});
	const ids = ["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "11111111-2222-3333-4444-555555555555"];
	const assets = ids.map((assetId) => ({
		assetId,
		rootAssetId: assetId,
		name: "same.txt",
		mimeType: "text/plain",
		sizeBytes: 104,
		key: `users/${scenario === "foreign-account" ? "foreign" : "user-1"}/${assetId}/content`,
		ownerUserId: "user-1",
		fileSource: "SELF_UPLOAD_FILE_SOURCE",
		isDeleted: false,
	}));
	type Fiber = {
		tag?: number;
		key?: string;
		stateNode?: unknown;
		memoizedProps?: Record<string, unknown>;
		return: Fiber | null;
		child?: Fiber;
		sibling?: Fiber;
	};
	const rootFor = (node: Node, child?: Fiber) => {
		const owner: { current: Fiber | null } = { current: null };
		const root: Fiber = { tag: 3, stateNode: owner, return: null };
		const host: Fiber = { stateNode: node, return: root, child };
		root.child = host;
		owner.current = root;
		Object.assign(node, { __reactFiberFixture: host });
		return { owner, root, host };
	};
	rootFor(f.composer);
	const attach = new Node(
		"BUTTON",
		{ "aria-label": "Attach", id: "attach", "aria-controls": "parent" },
		"Attach",
	);
	const parent = new Node("DIV", { role: "menu", id: "parent", "aria-labelledby": "attach" });
	parent.hidden = true;
	const recent = new Node(
		"DIV",
		{ role: "menuitem", id: "recent", "aria-controls": "chooser" },
		"Recent files",
	);
	const chooser = new Node("DIV", { role: "menu", id: "chooser", "aria-labelledby": "recent" });
	chooser.hidden = true;
	attach.onClick = () => {
		parent.hidden = false;
	};
	recent.onClick = () => {
		chooser.hidden = false;
	};
	parent.append(recent);
	f.composer.append(attach);
	f.body.append(parent, chooser);
	rootFor(attach);
	rootFor(recent);
	const selected = vi.fn();
	let previous: Fiber | undefined;
	const list: Fiber = { memoizedProps: { assets }, return: null };
	const chooserTree = rootFor(chooser, list);
	list.return = chooserTree.host;
	const keyedRows = new Map<string, Fiber>();
	for (const asset of assets) {
		const row = new Node("DIV", { role: "menuitem" }, "same.txt");
		chooser.append(row);
		const keyed: Fiber = { key: asset.assetId, return: list };
		keyedRows.set(asset.assetId, keyed);
		const host: Fiber = { stateNode: row, return: keyed };
		keyed.child = host;
		if (previous) previous.sibling = keyed;
		else list.child = keyed;
		previous = keyed;
		Object.assign(row, { __reactFiberFixture: host });
		row.onClick = () => {
			selected(asset.assetId);
			parent.hidden = true;
			chooser.hidden = true;
			const button = new Node("BUTTON", { "aria-label": "Open attachment" }, "same.txt");
			const submit = new Node("BUTTON", {
				"data-testid": "chat-submit",
				type: "submit",
				"aria-disabled": scenario === "pending-submit" ? "true" : "false",
			});
			const chip: Fiber = {
				stateNode: button,
				memoizedProps: {
					metadata: {
						fileMetadataId: asset.assetId,
						fileName: asset.name,
						fileMimeType: asset.mimeType,
						fileSource: asset.fileSource,
						fileUri:
							scenario === "foreign-context" ? `users/foreign/${asset.assetId}/content` : asset.key,
					},
					phase: "processing",
					isPrivate: scenario === "private-context",
				},
				return: null,
			};
			const gate: Fiber = {
				stateNode: submit,
				memoizedProps: { isQueryable: scenario !== "pending-submit" },
				return: null,
			};
			chip.sibling = gate;
			const form = rootFor(f.composer, chip);
			chip.return = form.host;
			gate.return = form.host;
			Object.assign(button, { __reactFiberFixture: chip });
			Object.assign(submit, { __reactFiberFixture: gate });
			f.composer.append(button, submit);
		};
	}
	if (scenario === "stale-row")
		chooserTree.owner.current = { tag: 3, stateNode: chooserTree.owner, return: null };
	if (scenario === "changed-row") {
		const evaluate = f.runtime.evaluate.getMockImplementation();
		if (!evaluate) throw new Error("fixture evaluator required");
		f.runtime.evaluate.mockImplementation(async (input) => {
			if (input.expression.includes("const matches=native.rows.filter")) {
				const row = keyedRows.get(ids[1]);
				if (row) row.key = ids[0];
			}
			return evaluate(input);
		});
	}
	const client = createGrokFileClient(f.runtime, {
		providerUserId: "user-1",
		timeoutMs: 20,
		pollMs: 0,
	});
	if (scenario === "foreign-account" || scenario === "stale-row") {
		await expect(client.select(ids[1])).rejects.toThrow();
		expect(selected).not.toHaveBeenCalled();
		return;
	}
	const result = await client.select(ids[1]);
	if (scenario === "changed-row") {
		expect(result.status).toBe("failed");
		expect(selected).not.toHaveBeenCalled();
		return;
	}
	expect(selected).toHaveBeenCalledExactlyOnceWith(ids[1]);
	expect(result.status).toBe(scenario === "ready" ? "complete" : "unconfirmed");
	expect(result.files).toEqual(
		scenario === "foreign-context"
			? []
			: [
					{
						id: ids[1],
						name: "same.txt",
						state: scenario === "ready" ? "ready" : "unknown",
						sourceBinding: "native-metadata",
						sourceAgreement: "observed-native",
					},
				],
	);
	expect(f.dom.setFileInputFiles).not.toHaveBeenCalled();
});
