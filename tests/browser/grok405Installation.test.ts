import { expect, it, vi } from "vitest";
import { validateGrokConnectorInstallationInput } from "../../src/browser/providers/grokConnectorInstallation.js";

it("rejects credential-bearing or non-HTTPS custom endpoints before any browser work", () => {
	for (const endpoint of [
		"http://example.test/mcp",
		"https://user:secret@example.test/mcp",
		"https://example.test/mcp?token=secret",
	]) {
		expect(() =>
			validateGrokConnectorInstallationInput({ kind: "custom", name: "Example", endpoint }),
		).toThrow("grok_connector_install_invalid_endpoint");
	}
	expect(
		validateGrokConnectorInstallationInput({
			kind: "custom",
			name: "Example",
			endpoint: "https://example.test/mcp",
		}),
	).toEqual({ kind: "custom", name: "Example", endpoint: "https://example.test/mcp" });
});

import { runInNewContext } from "node:vm";
import { createGrokConnectorInstallationClient } from "../../src/browser/providers/grokConnectorInstallation.js";
import { connectorDomFixture, ConnectorFixtureNode as N } from "./grok404ConnectorDomFixture.js";

function requirePrepared(
	outcome: import("../../src/browser/providers/grokConnectorInstallation.js").GrokConnectorInstallationOutcome,
) {
	if (!outcome.prepared) throw new Error(outcome.code);
	return outcome.prepared;
}
function installFixture(inertParent = false) {
	const fixture = connectorDomFixture();
	const name = new N("input", "", { placeholder: "My Connector" });
	const endpoint = new N("input", "", { placeholder: "https://mcp.example.com/sse" });
	const add = new N("button", "Add Connector");
	const cancel = new N("button", "Cancel");
	const form = new N("div", "New Connector", { role: "dialog" }, [name, endpoint, add, cancel]);
	form.hidden = true;
	const open = new N("button", "New Connector", { "aria-label": "New Connector" });
	open.onClick = () => {
		form.hidden = false;
		if (inertParent) fixture.plugins.setAttribute("aria-hidden", "true");
	};
	fixture.plugins.children.push(open);
	open.parentElement = fixture.plugins;
	fixture.document.children.push(form);
	form.parentElement = fixture.document;
	let effects = 0;
	add.onClick = () => {
		effects++;
		form.ownText = "Authentication required";
	};
	const runtime = {
		evaluate: async ({ expression }: { expression: string }) => ({
			result: {
				value: runInNewContext(expression, {
					document: fixture.document,
					// biome-ignore lint/style/useNamingConvention: Browser global name.
					HTMLInputElement: N,
					// biome-ignore lint/style/useNamingConvention: Browser global name.
					Event: class {},
					getComputedStyle: (node: N) => ({
						display: node.hidden ? "none" : "block",
						visibility: "visible",
					}),
				}),
			},
		}),
	};
	return { ...fixture, runtime, form, name, endpoint, add, effects: () => effects };
}
const input = {
	kind: "custom" as const,
	name: "New Example",
	endpoint: "https://new.example.test/mcp",
};
it("prepares exact custom form without Add, dispatches once and preserves human OAuth custody", async () => {
	const f = installFixture();
	let admissions = 0;
	const client = createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
		beforeCommit: async () => {
			admissions++;
		},
	});
	const prepared = await client.prepare(input);
	expect(prepared.status).toBe("prepared");
	expect(f.effects()).toBe(0);
	const result = await client.commit(requirePrepared(prepared));
	expect(result).toMatchObject({ status: "awaiting-human", effectDispatched: true });
	expect(admissions).toBe(1);
	expect(f.effects()).toBe(1);
	expect((await client.commit(requirePrepared(prepared))).code).toBe(
		"grok_connector_install_reconcile_required",
	);
	expect(f.effects()).toBe(1);
});
it("blocks name or exact endpoint conflicts and never treats catalog advertisements as grants", async () => {
	const f = installFixture();
	const result = await createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
	}).prepare({ ...input, endpoint: "https://mcp.example.test/mcp" });
	expect(result).toMatchObject({
		status: "unconfirmed",
		code: "grok_connector_install_existing_identity_conflict",
		effectDispatched: false,
		connector: { name: "Example", grantedScopes: [] },
	});
	expect(f.effects()).toBe(0);
	expect(f.form.hidden).toBe(true);
});
it("refuses changed form identity after admission without dispatching Add", async () => {
	const f = installFixture();
	const client = createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
		beforeCommit: async () => {
			f.endpoint.value = "https://other.example.test/mcp";
		},
	});
	const prepared = await client.prepare(input);
	expect(await client.commit(requirePrepared(prepared))).toMatchObject({
		status: "failed",
		effectDispatched: false,
		code: "grok_connector_install_form_changed",
	});
	expect(f.effects()).toBe(0);
});
it("consumes uncertain dispatch and requires read-only reconciliation before any retry", async () => {
	const f = installFixture();
	f.add.onClick = () => {
		throw new Error("transport lost after click");
	};
	const client = createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
	});
	const prepared = await client.prepare(input);
	expect(await client.commit(requirePrepared(prepared))).toMatchObject({
		status: "unconfirmed",
		effectDispatched: true,
	});
	expect((await client.commit(requirePrepared(prepared))).code).toBe(
		"grok_connector_install_reconcile_required",
	);
});
it("does not infer OAuth from an unrelated visible dialog", async () => {
	const f = installFixture();
	const unrelated = new N("div", "Authentication required", { role: "dialog" });
	f.document.children.push(unrelated);
	unrelated.parentElement = f.document;
	const result = await createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
	}).reconcile(input);
	expect(result.status).not.toBe("awaiting-human");
});

it("fences fresh prepare after an unknown effect even when the form disappears", async () => {
	const f = installFixture();
	f.add.onClick = () => {
		f.form.hidden = true;
		throw new Error("lost after dispatch");
	};
	const client = createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
	});
	const prepared = await client.prepare(input);
	await client.commit(requirePrepared(prepared));
	expect((await client.prepare(input)).code).toBe("grok_connector_install_reconcile_required");
	expect(f.form.hidden).toBe(true);
});

it("reserves a prepared token before asynchronous admission so concurrent commits cannot duplicate Add", async () => {
	const f = installFixture();
	const client = createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
		beforeCommit: async () => {
			await Promise.resolve();
		},
	});
	const prepared = await client.prepare(input);
	await Promise.all([
		client.commit(requirePrepared(prepared)),
		client.commit(requirePrepared(prepared)),
	]);
	expect(f.effects()).toBe(1);
});

it("keeps exact inventory ownership when the nested form makes its parent inert", async () => {
	const f = installFixture(true);
	const client = createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
	});
	const prepared = requirePrepared(await client.prepare(input));
	expect(await client.commit(prepared)).toMatchObject({
		status: "awaiting-human",
		effectDispatched: true,
	});
	expect(f.effects()).toBe(1);
});

function bindNativeLive(f: ReturnType<typeof installFixture>, account = "fixture-user") {
	const record = {
		connectorId: "connector-native",
		displayName: "Example",
		type: "live",
		serverUrl: null,
		originScope: 3,
		originScopeId: account,
	};
	const owner: { current: unknown } = { current: null };
	const host: { tag: number; stateNode: unknown; return: unknown; sibling: unknown } = {
		tag: 5,
		stateNode: f.installed,
		return: null,
		sibling: null,
	};
	const card: {
		tag: number;
		key: string;
		memoizedProps: unknown;
		child: unknown;
		return: unknown;
		sibling: unknown;
	} = {
		tag: 0,
		key: record.connectorId,
		memoizedProps: { label: { props: { connector: record } } },
		child: host,
		return: null,
		sibling: null,
	};
	const scope: {
		tag: number;
		stateNode: unknown;
		child: unknown;
		return: unknown;
		sibling: unknown;
	} = { tag: 5, stateNode: f.plugins, child: card, return: null, sibling: null };
	const root = { tag: 3, stateNode: owner, child: scope, return: null, sibling: null };
	owner.current = root;
	scope.return = root;
	card.return = scope;
	host.return = card;
	Object.defineProperty(f.installed, "__reactFiber$fixture", { value: host, enumerable: true });
	f.detail.children = f.detail.children.filter((n) => !n.innerText.includes("Server URL"));
}
it("prepares a custom MCP beside an account-bound native integration without an MCP URL", async () => {
	const f = installFixture();
	bindNativeLive(f);
	const result = await createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
		providerUserId: "fixture-user",
	}).prepare(input);
	expect(result.status).toBe("prepared");
	expect(f.effects()).toBe(0);
});
it("cannot use native transport metadata to bypass a name collision or foreign account", async () => {
	for (const collision of [true, false]) {
		const f = installFixture();
		bindNativeLive(f, collision ? "fixture-user" : "foreign-user");
		const result = await createGrokConnectorInstallationClient(f.runtime, {
			providerAccountRef: "account-hash",
			providerUserId: "fixture-user",
		}).prepare({ ...input, ...(collision ? { name: "Example" } : {}) });
		expect(result.status).toBe("unsupported");
		expect(f.effects()).toBe(0);
		expect(f.form.hidden).toBe(true);
	}
});

it("reports the owned native terminal connection failure without replaying Add", async () => {
	const f = installFixture(true);
	f.form.setAttribute("data-analytics-name", "add-connector-modal");
	const originalAdd = f.add.onClick;
	f.add.onClick = () => {
		originalAdd?.();
		f.form.ownText = "Connecting";
		setTimeout(() => {
			f.form.ownText =
				"Custom Connector\n\nConnection failed\n\nSorry, there was a problem connecting to this MCP server.";
			f.form.children = [new N("button", "Go Back")];
			f.form.children[0].parentElement = f.form;
		}, 20);
	};
	const client = createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
	});
	const prepared = requirePrepared(await client.prepare(input));
	expect(await client.commit(prepared)).toMatchObject({
		status: "failed",
		code: "grok_connector_install_connection_failed",
		effectDispatched: true,
	});
	expect(f.effects()).toBe(1);
	expect((await client.commit(prepared)).code).toBe("grok_connector_install_reconcile_required");
	expect(f.effects()).toBe(1);
});

it("does not settle a terminal message after the prepared modal owner changes", async () => {
	const f = installFixture(true);
	f.form.setAttribute("data-analytics-name", "add-connector-modal");
	const originalAdd = f.add.onClick;
	f.add.onClick = () => {
		originalAdd?.();
		f.form.setAttribute("data-auracall-install-owner", "foreign-owner");
		f.form.ownText =
			"Custom Connector\n\nConnection failed\n\nSorry, there was a problem connecting to this MCP server.";
		f.form.children = [new N("button", "Go Back")];
		f.form.children[0].parentElement = f.form;
	};
	const client = createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
	});
	const result = await client.commit(requirePrepared(await client.prepare(input)));
	expect(result.status).toBe("unconfirmed");
	expect(result.code).not.toBe("grok_connector_install_connection_failed");
	expect(f.effects()).toBe(1);
});

// Public preparation seam: rendering may settle after the single New Connector click.
it("waits for the custom form before filling once without dispatching Add", async () => {
	vi.useFakeTimers();
	try {
		const f = installFixture();
		const open = f.plugins.children.find(
			(node) => node.getAttribute("aria-label") === "New Connector",
		);
		if (!open) throw new Error("fixture missing opener");
		let openings = 0;
		open.onClick = () => {
			openings++;
			setTimeout(() => {
				f.form.hidden = false;
			}, 100);
		};
		const client = createGrokConnectorInstallationClient(f.runtime, {
			providerAccountRef: "account-hash",
		});
		const pending = client.prepare(input);
		await vi.advanceTimersByTimeAsync(200);
		expect(await pending).toMatchObject({ status: "prepared", effectDispatched: false });
		expect(f.name.value).toBe("New Example");
		expect(f.endpoint.value).toBe("https://new.example.test/mcp");
		expect(openings).toBe(1);
		expect(f.effects()).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});

it.each([
	"absent",
	"ambiguous",
	"foreign",
])("refuses %s form readiness without filling or dispatching Add", async (mode) => {
	vi.useFakeTimers();
	try {
		const f = installFixture();
		const open = f.plugins.children.find(
			(node) => node.getAttribute("aria-label") === "New Connector",
		);
		if (!open) throw new Error("fixture missing opener");
		let openings = 0;
		open.onClick = () => {
			openings++;
			if (mode === "absent") return;
			f.form.hidden = false;
			if (mode === "ambiguous") {
				const duplicate = new N("input", "", { placeholder: "My Connector" });
				duplicate.parentElement = f.form;
				f.form.children.push(duplicate);
			} else {
				const foreign = new N("div", "Unrelated", { role: "dialog" });
				foreign.parentElement = f.document;
				f.document.children.push(foreign);
			}
		};
		const pending = createGrokConnectorInstallationClient(f.runtime, {
			providerAccountRef: "account-hash",
		}).prepare(input);
		await vi.advanceTimersByTimeAsync(2000);
		expect(await pending).toMatchObject({ status: "unsupported", effectDispatched: false });
		expect(f.name.value).toBe("");
		expect(f.endpoint.value).toBe("");
		expect(openings).toBe(1);
		expect(f.effects()).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});

it("selects Custom from the connector picker before preparing the custom form", async () => {
	const f = installFixture();
	const custom = new N("button", "Custom\nAdd your own custom connector");
	const picker = new N(
		"div",
		"New Connector",
		{ role: "dialog", "data-analytics-name": "add-connector-modal" },
		[custom],
	);
	picker.hidden = true;
	picker.parentElement = f.document;
	f.document.children.push(picker);
	const open = f.plugins.children.find(
		(node) => node.getAttribute("aria-label") === "New Connector",
	);
	if (!open) throw new Error("fixture missing opener");
	let openings = 0,
		selections = 0;
	open.onClick = () => {
		openings++;
		picker.hidden = false;
	};
	custom.onClick = () => {
		selections++;
		picker.hidden = true;
		f.form.hidden = false;
	};
	const client = createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
	});
	const outcome = await client.prepare(input);
	expect(outcome).toMatchObject({ status: "prepared", effectDispatched: false });
	expect(openings).toBe(1);
	expect(selections).toBe(1);
	expect(f.name.value).toBe("New Example");
	expect(f.endpoint.value).toBe("https://new.example.test/mcp");
	expect(f.effects()).toBe(0);
	const committed = await client.commit(requirePrepared(outcome));
	expect(committed).toMatchObject({ status: "awaiting-human", effectDispatched: true });
	expect(f.effects()).toBe(1);
});

it("refuses to prepare controls hidden by an ancestor panel", async () => {
	vi.useFakeTimers();
	try {
		const f = installFixture();
		const panel = new N("div", "", { "aria-hidden": "true" }, [f.form]);
		f.document.children = f.document.children.filter((node) => node !== f.form);
		panel.parentElement = f.document;
		f.document.children.push(panel);
		const pending = createGrokConnectorInstallationClient(f.runtime, {
			providerAccountRef: "account-hash",
		}).prepare(input);
		await vi.advanceTimersByTimeAsync(2000);
		expect(await pending).toMatchObject({ status: "unsupported", effectDispatched: false });
		expect(f.name.value).toBe("");
		expect(f.endpoint.value).toBe("");
		expect(f.effects()).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});

it.each([
	"ambiguous",
	"disabled",
	"foreign",
])("refuses the %s Custom picker without selecting or filling", async (mode) => {
	const f = installFixture();
	const custom = new N("button", "Custom");
	if (mode === "disabled") custom.setAttribute("aria-disabled", "true");
	const picker = new N(
		"div",
		"New Connector",
		{ role: "dialog", "data-analytics-name": "add-connector-modal" },
		[custom],
	);
	if (mode === "ambiguous") {
		const extra = new N("button", "Custom");
		extra.parentElement = picker;
		picker.children.push(extra);
	}
	picker.hidden = true;
	picker.parentElement = f.document;
	f.document.children.push(picker);
	const open = f.plugins.children.find(
		(node) => node.getAttribute("aria-label") === "New Connector",
	);
	if (!open) throw new Error("fixture missing opener");
	let selections = 0;
	open.onClick = () => {
		picker.hidden = false;
		if (mode === "foreign") {
			const foreign = new N("div", "Unrelated", { role: "dialog" });
			foreign.parentElement = f.document;
			f.document.children.push(foreign);
		}
	};
	custom.onClick = () => {
		selections++;
		picker.hidden = true;
		f.form.hidden = false;
	};
	const result = await createGrokConnectorInstallationClient(f.runtime, {
		providerAccountRef: "account-hash",
	}).prepare(input);
	expect(result).toMatchObject({ status: "unsupported", effectDispatched: false });
	expect(selections).toBe(0);
	expect(f.name.value).toBe("");
	expect(f.endpoint.value).toBe("");
	expect(f.effects()).toBe(0);
});

it("selects Custom only once while waiting for the picker to become the form", async () => {
	vi.useFakeTimers();
	try {
		const f = installFixture();
		const custom = new N("div", "Custom", { role: "button" });
		const picker = new N(
			"div",
			"New Connector",
			{ role: "dialog", "data-analytics-name": "add-connector-modal" },
			[custom],
		);
		picker.hidden = true;
		picker.parentElement = f.document;
		f.document.children.push(picker);
		const open = f.plugins.children.find(
			(node) => node.getAttribute("aria-label") === "New Connector",
		);
		if (!open) throw new Error("fixture missing opener");
		open.onClick = () => {
			picker.hidden = false;
		};
		let selections = 0;
		custom.onClick = () => {
			selections++;
			setTimeout(() => {
				picker.hidden = true;
				f.form.hidden = false;
			}, 100);
		};
		const pending = createGrokConnectorInstallationClient(f.runtime, {
			providerAccountRef: "account-hash",
		}).prepare(input);
		await vi.advanceTimersByTimeAsync(250);
		expect(await pending).toMatchObject({ status: "prepared", effectDispatched: false });
		expect(selections).toBe(1);
		expect(f.effects()).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});
