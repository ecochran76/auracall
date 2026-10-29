// biome-ignore-all lint/style/useNamingConvention: CDP and provider bootstrap wire names are case-sensitive.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, expect, test } from "vitest";
import { createGrokBotsService } from "../../src/browser/grokBotsService.js";
import { createGrokBuildService } from "../../src/browser/grokBuildService.js";
import { createGrokFilesService } from "../../src/browser/grokFilesService.js";
import { createGrokConnectorsService } from "../../src/browser/grokConnectorsService.js";
import { createGrokConnectorInstallationService } from "../../src/browser/grokConnectorInstallationService.js";
import {
	ConnectorFixtureNode,
	fixtureConnectorServiceOptions,
} from "./grok404ConnectorDomFixture.js";

class N extends ConnectorFixtureNode {
	disabled = false;
	focus() {}
	get className() {
		return this.attributes.class ?? "";
	}
	cloneNode(deep = false): N {
		return new N(
			this.tag,
			this.ownText,
			{ ...this.attributes },
			deep ? this.children.map((child) => (child as N).cloneNode(true)) : [],
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
	closest(selector: string): N | null {
		return this.matches(selector)
			? this
			: ((this.parentElement as N | null)?.closest(selector) ?? null);
	}
	contains(other: N): boolean {
		return other === this || this.children.some((child) => (child as N).contains(other));
	}
	matches(selector: string): boolean {
		return selector.split(",").some((value) => {
			value = value.trim();
			const parts = value.split(/\s+(?![^[]*\])/);
			if (parts.length > 1) {
				const last = parts.pop() ?? "";
				let ancestor = this.parentElement as N | null;
				while (ancestor) {
					if (ancestor.matches(parts.join(" ")) && this.matches(last)) return true;
					ancestor = ancestor.parentElement as N | null;
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
	querySelectorAll(selector: string): N[] {
		return this.children.flatMap((child) => [
			...((child as N).matches(selector) ? [child as N] : []),
			...(child as N).querySelectorAll(selector),
		]);
	}
	querySelector(selector: string) {
		return this.querySelectorAll(selector)[0] ?? null;
	}
}

// Frozen pre-repair public wire examples, deliberately literal rather than recomputed.
const legacyId = "e2a2314bf8d0fa94add434a614ca229d550cace197f0efea8d9ade5418055539";
const typedId = "90e3c686a3708597ba2ad1aa9d94564f92f3911e6438b084ae2af42daa69d70c";
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function fixture(user: Record<string, string>) {
	const form = new N("form", "", {}, [new N("textarea", "", { placeholder: "Ask Grok anything" })]);
	const menu = new N("div", "", { role: "menu" }, [
		new N("button", "Fast", { role: "menuitemradio", "aria-checked": "true" }),
	]);
	const document = Object.assign(new N("document", "", {}, [form, menu]), {
		title: "Grok",
		scripts: [],
	});
	Object.assign(document, {
		body: document,
		querySelector: (selector: string) => document.querySelectorAll(selector)[0] ?? null,
	});
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => ({
			result: {
				value: runInNewContext(expression, {
					document,
					location: { href: "https://grok.com/" },
					HTMLElement: N,
					HTMLInputElement: N,
					window: {
						__NEXT_DATA__: { props: { pageProps: { user } } },
						getComputedStyle: () => ({ display: "block", visibility: "visible" }),
					},
					getComputedStyle: () => ({ display: "block", visibility: "visible" }),
					URL,
				}),
			},
		}),
	};
	const connect = async () => ({
		client: {
			Runtime: runtime,
			DOM: {} as never,
			close: async () => {},
			__auracallProviderTrafficGovernor: {
				attribution: { provider: "grok", targetId: "fixture-target" },
				admitBackendRequest: async () => {},
				begin: async () => ({ settle: async () => {} }),
			},
		},
		targetId: "fixture-target",
		shouldClose: false,
		host: "localhost",
		port: 1,
	});
	return { options: fixtureConnectorServiceOptions(), dependencies: { connect }, user, document };
}

const families = ["bots", "build", "files", "connectors"] as const;
async function read(family: (typeof families)[number], user: Record<string, string>) {
	const f = fixture(user);
	switch (family) {
		case "bots":
			return createGrokBotsService(f.options, f.dependencies).list();
		case "build":
			return createGrokBuildService(f.options, f.dependencies).discover();
		case "files":
			return createGrokFilesService(f.options, f.dependencies).context();
		case "connectors":
			return createGrokConnectorsService(f.options, f.dependencies).list();
	}
}

test.each(
	families,
)("%s preserves its public reference and account continuity after normalized identity proof", async (family) => {
	const expected = family === "bots" || family === "build" ? legacyId : typedId;
	const first = await read(family, {
		id: " fixture-user ",
		email: "operator@example.test",
		handle: "@operator",
		name: "First label",
	});
	const second = await read(family, {
		id: "fixture-user",
		email: "operator@example.test",
		handle: "@operator",
		name: "Changed label",
	});
	expect(first.providerAccountRef).toBe(expected);
	expect(second.providerAccountRef).toBe(expected);
	expect(JSON.stringify(first)).not.toContain("operator@example.test");
	expect(JSON.stringify(first)).not.toContain("fixture-user");
});

test.each(
	families,
)("%s retains the explicit identifier-kind compatibility decision", async (family) => {
	const id = await read(family, { id: "operator@example.test", email: "operator@example.test" });
	const email = await read(family, { email: "operator@example.test" });
	if (family === "bots" || family === "build") {
		// The legacy family has no kind separation; changing that requires migration.
		expect(id.providerAccountRef).toBe(
			"447138bfe97e7c898eedb45064a4d7375937bba1c4f2223884a7f14ed41b59e2",
		);
		expect(email.providerAccountRef).toBe(
			"447138bfe97e7c898eedb45064a4d7375937bba1c4f2223884a7f14ed41b59e2",
		);
	} else {
		expect(id.providerAccountRef).toBe(
			"bd11f8506f4d38f0030c5353293a0bc74370533c06c237c4ac33e0c23554eaf6",
		);
		expect(email.providerAccountRef).toBe(
			"ede8477af672b7264e42b4e26458b3523fcb138130e279b05860d6bc79631b1c",
		);
	}
});

test("installation reconciles an existing version-1 typed reference without migration or another effect", async () => {
	const directory = await mkdtemp(path.join(tmpdir(), "grok444-journal-"));
	roots.push(directory);
	const input = {
		kind: "custom" as const,
		name: "New Example",
		endpoint: "https://new.example.test/mcp",
	};
	const operationId = "c0bcbe561df9028e99836f92126b043a8a5b68696c117810aeafc0acd13f59c6";
	await writeFile(
		path.join(directory, `${operationId}.json`),
		JSON.stringify({
			version: 1,
			operationId,
			input,
			providerAccountRef: typedId,
			runtimeProfile: "default",
			targetId: "fixture-target",
			effectDispatched: true,
		}),
	);
	const f = fixture({ id: "fixture-user", email: "operator@example.test" });
	const name = new N("input", "", { placeholder: "My Connector" });
	name.value = input.name;
	const endpoint = new N("input", "", { placeholder: "https://mcp.example.com/sse" });
	endpoint.value = input.endpoint;
	const form = new N("div", "Authentication required", { role: "dialog" }, [name, endpoint]);
	form.parentElement = f.document;
	f.document.children.push(form);
	const request = { input, expectedProviderAccountRef: typedId };
	const deps = { ...f.dependencies, journalDirectory: directory };
	const first = await createGrokConnectorInstallationService(f.options, deps).reconcile(request);
	const restarted = await createGrokConnectorInstallationService(f.options, deps).reconcile(
		request,
	);
	expect(first).toMatchObject({
		status: "awaiting-human",
		code: "grok_connector_install_awaiting_human",
		providerAccountRef: typedId,
		operationId,
		effectDispatched: true,
		retrySafe: false,
	});
	expect(restarted).toEqual(first);
	// Same value in a different identifier kind cannot authorize this saved intent.
	delete f.user.id;
	const foreign = await createGrokConnectorInstallationService(f.options, deps).reconcile(request);
	expect(foreign.code).toBe("grok_connector_install_reconcile_required");
	expect(foreign.effectDispatched).toBe(true);
});

test.each(
	families,
)("%s cannot project an unverified account into public success", async (family) => {
	await expect(read(family, { id: "fixture-user", email: "other@example.test" })).rejects.toThrow(
		/account_not_verified/,
	);
});
