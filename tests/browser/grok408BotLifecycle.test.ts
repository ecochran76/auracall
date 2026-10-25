// biome-ignore-all lint/style/useNamingConvention: Native DOM/CDP wire names.
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { createGrokBotLifecycleClient } from "../../src/browser/providers/grokBotLifecycle.js";
import { ConnectorFixtureNode as N } from "./grok404ConnectorDomFixture.js";

const id = "11111111-2222-4333-8444-555555555555";
function fixture() {
	const name = new N("input", "", { id: "bot-settings-name" });
	name.value = "Canary";
	const title = new N("input", "", { id: "bot-settings-title" });
	title.value = "Existing title";
	const description = new N("textarea", "", { id: "bot-settings-description" });
	description.value = "Before";
	let saves = 0;
	let stored = { name: "Canary", title: "Existing title", description: "Before" };
	const save = new N("button", "Save", { type: "submit" });
	const dialog = new N("div", "Settings", { role: "dialog" }, [name, title, description, save]);
	const button = new N("button", "Canary");
	const document = new N("document", "", {}, [button, dialog]);
	save.onClick = () => {
		saves++;
		stored = { name: name.value, title: title.value, description: description.value };
		dialog.hidden = true;
		button.ownText = stored.name;
	};
	button.onClick = () => {
		name.value = stored.name;
		title.value = stored.title;
		description.value = stored.description;
		dialog.hidden = false;
	};
	const proto = {};
	Object.defineProperty(proto, "value", {
		set(this: N, v: string) {
			this.value = v;
		},
	});
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => ({
			result: {
				value: await runInNewContext(expression, {
					document,
					location: { href: `https://grok.com/bot/${id}` },
					URL,
					getComputedStyle: () => ({ display: "block", visibility: "visible" }),
					HTMLInputElement: { prototype: proto },
					HTMLTextAreaElement: { prototype: proto },
					Event: class {},
					setTimeout,
					clearTimeout,
				}),
			},
		}),
	};
	return { runtime, name, title, description, dialog, button, saves: () => saves };
}
test("reads actual same-ID native Settings and explicitly reports missing Instructions and Model", async () => {
	const f = fixture();
	const client = createGrokBotLifecycleClient(f.runtime);
	const result = await client.inspect({ id, name: "Canary" });
	expect(result.status).toBe("supported");
	expect(result.bot).toEqual({
		id,
		name: "Canary",
		title: "Existing title",
		description: "Before",
	});
	expect(result.capabilities).toEqual({
		name: true,
		title: true,
		description: true,
		instructions: false,
		model: false,
	});
});
test("unsupported instructions fail before input or Save; Description is not Instructions", async () => {
	const f = fixture();
	const client = createGrokBotLifecycleClient(f.runtime);
	const result = await client.edit(
		{ id, name: "Canary" },
		{ name: "After", instructions: "Do something" },
	);
	expect(result.code).toBe("grok_bot_instructions_unavailable");
	expect(f.name.value).toBe("Canary");
	expect(f.saves()).toBe(0);
});
test("edits native Name and Description once, preserves Title, reopens exact ID for saved readback", async () => {
	const f = fixture();
	let commits = 0;
	const client = createGrokBotLifecycleClient(f.runtime, {
		beforeCommit: async () => {
			commits++;
		},
	});
	const result = await client.edit(
		{ id, name: "Canary" },
		{ name: "After", description: "After description" },
	);
	expect(result.status).toBe("supported");
	expect(result.effectState).toBe("completed");
	expect(result.bot).toEqual({
		id,
		name: "After",
		title: "Existing title",
		description: "After description",
	});
	expect(f.saves()).toBe(1);
	expect(commits).toBe(1);
});
test("different exact Bot route refuses editing before Save", async () => {
	const f = fixture();
	const result = await createGrokBotLifecycleClient(f.runtime).edit(
		{ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", name: "Canary" },
		{ name: "After" },
	);
	expect(result.status).toBe("unknown");
	expect(f.saves()).toBe(0);
});

test("creation uses observed aria-label despite animated multi-label text, then binds singular Bot route and editor ID", async () => {
	const f = fixture();
	f.dialog.hidden = true;
	const document = new N("document");
	const location = { href: "https://grok.com/" };
	const editor = new N("div", "", { contenteditable: "true" });
	const tab = new N("button", "Bots", { role: "tab", "aria-selected": "false" });
	const newBot = new N("button", "New ConnectorSkillBot", { "aria-label": "New Bot" });
	const catalog = new N("div", "Plugins", { role: "dialog" }, [tab, newBot]);
	const name = new N("input", "", { id: "bot-create-name" });
	name.value = "New Bot";
	const terms = new N("a", "Terms", { href: "https://x.ai/legal/grok-bot-terms" });
	const create = new N("button", "Create Bot", { type: "submit" });
	const form = new N("div", "Create Bot", { role: "dialog" }, [name, terms, create]);
	const plugins = new N("button", "", { "aria-label": "Plugins" });
	let creates = 0;
	let claims = 0;
	plugins.onClick = () => {
		document.children = [catalog];
	};
	tab.onClick = () => {
		tab.setAttribute("aria-selected", "true");
	};
	newBot.onClick = () => {
		document.children = [form];
	};
	create.onClick = () => {
		creates++;
		location.href = `https://grok.com/bot/${id}`;
		f.name.value = name.value;
		f.description.value = name.value;
		f.button.ownText = name.value;
		f.button.onClick = () => {
			f.dialog.hidden = false;
		};
		document.children = [f.button, f.dialog];
	};
	document.children = [plugins, editor];
	const proto = {};
	Object.defineProperty(proto, "value", {
		set(this: N, v: string) {
			this.value = v;
		},
	});
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => ({
			result: {
				value: await runInNewContext(expression, {
					document,
					location,
					URL,
					getComputedStyle: () => ({ display: "block", visibility: "visible" }),
					HTMLInputElement: { prototype: proto },
					HTMLTextAreaElement: { prototype: proto },
					Event: class {},
					setTimeout,
					clearTimeout,
				}),
			},
		}),
	};
	const result = await createGrokBotLifecycleClient(runtime, {
		beforeCommit: async () => {
			claims++;
		},
	}).create("New canary");
	expect(result.status).toBe("supported");
	expect(result.bot?.id).toBe(id);
	expect(result.bot?.name).toBe("New canary");
	expect(creates).toBe(1);
	expect(claims).toBe(1);
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGrokBotLifecycleService } from "../../src/browser/grokBotLifecycleService.js";
import { runGrokBotsCommand } from "../../src/cli/grokBotsCommand.js";
import { createGrokBotsToolHandler } from "../../src/mcp/tools/grokBots.js";

test("public CLI/MCP lifecycle rejects unavailable model before connecting", async () => {
	let connections = 0;
	const lifecycle = createGrokBotLifecycleService(
		{},
		{
			connect: async () => {
				connections++;
				throw Error("must not connect");
			},
		},
	);
	const service = {
		list: async () => {
			throw Error("unexpected");
		},
		invoke: async () => {
			throw Error("unexpected");
		},
		lifecycle: lifecycle.run,
	};
	const input = {
		action: "edit",
		selector: { id, name: "Canary" },
		patch: { model: "Expert" },
		targetId: "target",
		expectedProviderAccountRef: "a".repeat(64),
		confirm: true,
	};
	const result = await runGrokBotsCommand(input, service);
	expect(result.code).toBe("grok_bot_model_defaults_unavailable");
	expect(result).toMatchObject({ effectState: "none" });
	const mcp = await createGrokBotsToolHandler(async () => service)(input);
	expect(mcp.structuredContent.code).toBe(result.code);
	expect(mcp.isError).toBe(true);
	expect(connections).toBe(0);
});
test("durable ambiguous Save reconciles same ID across new service instance without replay", async () => {
	const f = fixture();
	const original = f.dialog.children.find((c) => c.ownText === "Save");
	if (!original?.onClick) throw new Error("Save fixture absent");
	const saved = original.onClick;
	original.onClick = () => {
		saved();
		throw Error("transport uncertain after provider Save");
	};
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "grok408-journal-"));
	const account = "a".repeat(64);
	let proofs = 0;
	const targets: string[] = [];
	const client = {
		Runtime: f.runtime,
		close: async () => {},
		__auracallProviderTrafficGovernor: {
			attribution: { provider: "grok", targetId: "target" },
			admitBackendRequest: async () => {},
			begin: async () => ({ settle: async () => {} }),
		},
	};
	const dependencies = {
		journalDirectory: directory,
		connect: async (options: { tabTargetId?: string }) => {
			if (!options.tabTargetId) throw new Error("Exact retained target missing");
			targets.push(options.tabTargetId);
			return { client, targetId: "target", host: "localhost", port: 1, shouldClose: false };
		},
		verifyAccount: async () => {
			proofs++;
			return account;
		},
	};
	const input = {
		action: "edit" as const,
		selector: { id, name: "Canary" },
		patch: { name: "After", description: "Saved" },
		targetId: "target",
		expectedProviderAccountRef: account,
		confirm: true,
	};
	try {
		const first = await createGrokBotLifecycleService({}, dependencies).run(input);
		expect(first.effectState).toBe("unknown");
		expect(f.saves()).toBe(1);
		expect(first.operationId).toMatch(/^[a-f0-9]{64}$/);
		const blocked = await createGrokBotLifecycleService(
			{},
			{
				...dependencies,
				connect: async () => {
					throw Error("retained unknown-effect lease admission refused");
				},
			},
		).run({
			action: "reconcile",
			operationId: first.operationId ?? "",
			expectedProviderAccountRef: account,
		});
		expect(blocked).toMatchObject({
			code: "grok_bot_operator_reconciliation_required",
			targetId: "target",
			operationId: first.operationId,
			effectState: "unknown",
		});
		expect(f.saves()).toBe(1);

		const second = await createGrokBotLifecycleService({}, dependencies).run({
			...input,
			patch: { description: "Saved", name: "After" },
		});
		expect(second.effectState).toBe("completed");
		expect(second.bot?.name).toBe("After");
		expect(f.saves()).toBe(1);
		expect(targets).toEqual(["target", "target"]);
		expect(proofs).toBeGreaterThanOrEqual(4);
		const file = path.join(directory, `${first.operationId}.json`);
		expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test("reconciliation never labels an already-open unsaved Settings buffer as persisted", async () => {
	const f = fixture();
	f.name.value = "After";
	f.description.value = "Unsaved";
	const result = await createGrokBotLifecycleClient(f.runtime).reconcile("After", id);
	expect(result.status).toBe("unknown");
	expect(result.code).toBe("grok_bot_reconciliation_open_editor_unsaved");
	expect(f.saves()).toBe(0);
});
