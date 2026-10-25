import { expect, it } from "vitest";
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
