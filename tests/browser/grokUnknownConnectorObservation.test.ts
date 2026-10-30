// biome-ignore-all lint/style/useNamingConvention: Browser protocol domains retain native spelling.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import GuardedCDP, {
	setCdpCommandAdmissionResolver,
} from "../../packages/browser-service/src/guardedCdp.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { observeConfiguredGrokUnknownConnectorOutcome } from "../../src/browser/configuredProviderTrafficAuthority.js";
import { projectGrokAccountReference } from "../../src/browser/grokAccountReference.js";
import { BrowserService } from "../../src/browser/service/browserService.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";
import { resolveConfiguredServiceAccountId } from "../../src/config/serviceAccountIdentity.js";
import { connectorDomFixture, ConnectorFixtureNode as N } from "./grok404ConnectorDomFixture.js";

const transport = vi.hoisted(() => ({ connect: vi.fn(), raw: undefined as unknown }));
vi.mock("chrome-remote-interface", () => ({ default: vi.fn(async () => transport.raw) }));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: transport.connect,
}));
const roots: string[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
	setCdpCommandAdmissionResolver(undefined);
	setAuracallHomeDirOverrideForTest(null);
	await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
async function fixture(active = false, backendLimit?: number) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok-fixed-observer-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const managed = path.join(root, "managed");
	const config = {
		auracallProfile: "default",
		defaultRuntimeProfile: "default",
		profiles: {
			default: {
				engine: "browser",
				services: { grok: { identity: { email: "operator@example.test" } } },
			},
		},
		browser: { cache: {} },
		services: {
			grok: {
				identity: { email: "operator@example.test" },
				maxBackendRequestsPerMinute: backendLimit,
			},
		},
	} as never;
	const dom = connectorDomFixture();
	dom.plugins.hidden = true;
	const modal = new N(
		"div",
		"New Connector",
		{ role: "dialog", "data-analytics-name": "add-connector-modal" },
		[new N("button", "Custom")],
	);
	modal.parentElement = dom.document;
	dom.document.children.push(modal);
	const handlers = new Set<(event: unknown) => unknown>();
	const raw = {
		send: async () => {},
		Page: { enable: async () => {} },
		Runtime: { ...dom.runtime, enable: async () => {} },
		Network: {
			enable: async () => {},
			responseReceived: () => () => {},
			loadingFailed: () => () => {},
		},
		Fetch: {
			enable: vi.fn(async () => {}),
			disable: vi.fn(async () => {}),
			requestPaused: (handler: (event: unknown) => unknown) => {
				handlers.add(handler);
				return () => handlers.delete(handler);
			},
			continueRequest: vi.fn(async () => {}),
			failRequest: vi.fn(async () => {}),
		},
		close: vi.fn(async () => {}),
	};
	transport.raw = raw;
	setCdpCommandAdmissionResolver(async () => ({
		run: (_command, effect) => effect(),
		hold: async () => ({ run: (_command, effect) => effect(), close: async () => {} }),
	}));
	transport.connect.mockImplementation(() => GuardedCDP({ host: "127.0.0.1", port: 45040 }));
	vi.spyOn(BrowserService, "fromConfig").mockReturnValue({
		resolveServiceTarget: async () => ({
			host: "127.0.0.1",
			port: 45040,
			browserProcessId: process.pid,
			browserProfile: "fixture",
			managedBrowserProfile: managed,
			tab: null,
		}),
		getConfig: () => ({}),
		getMutationAuditSink: () => async () => {},
	} as unknown as BrowserService);
	const runtime = createBrowserTabConcurrencyRuntime(config);
	if (!runtime.registry) throw Error("missing fixture registry");
	const scope = {
		runtimeProfileId: "default",
		managedBrowserProfile: managed,
		service: "grok",
		tenantKey:
			resolveConfiguredServiceAccountId(config, {
				serviceId: "grok",
				runtimeProfileId: "default",
			}) ?? `managed-browser:${managed}`,
	};
	const reserved = await runtime.registry.reserve({
		scope,
		targetId: "owned-target",
		workload: { kind: "ephemeral", operationId: "grok-serialized-utility" },
		operationId: "original-unknown-operation",
		now: new Date().toISOString(),
		idleTtlMs: 300000,
		absoluteTtlMs: 3600000,
		exclusiveGroup: "grok-serialized-utility",
	});
	if (!reserved.ok) throw Error("fixture reservation failed");
	const idled = active
		? { ok: true as const, value: reserved.value.lease }
		: await runtime.registry.idle({
				claim: reserved.value.claim,
				now: new Date().toISOString(),
				effectState: "outcome-unknown",
			});
	if (!idled.ok) throw Error("fixture idle failed");
	const stat = await fs.readFile(`/proc/${process.pid}/stat`, "utf8");
	const request = {
		leaseId: idled.value.leaseId,
		expectedRevision: idled.value.revision,
		targetId: "owned-target",
		scope,
		browserProcessId: process.pid,
		browserStartTime: stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19],
		expectedProviderAccountRef: projectGrokAccountReference({ id: "fixture-user" }, "typed-v1"),
		connector: { name: "Fixture connector", endpoint: "https://example.test/mcp" },
	};
	const file = path.join(root, "browser-coordination", "tab-leases", "tab-leases.v1.json");
	return { root, config, dom, modal, raw, handlers, runtime, request, file };
}
test("fixed observation reads an ownerless unknown target without rewriting uncertainty", async () => {
	const f = await fixture();
	const before = await fs.readFile(f.file);
	const result = await observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request);
	expect(result).toMatchObject({
		status: "observed",
		category: "connector-picker",
		effectState: "outcome-unknown",
		leaseId: f.request.leaseId,
		leaseRevision: f.request.expectedRevision,
	});
	expect(await fs.readFile(f.file)).toEqual(before);
	expect(f.raw.Fetch.failRequest).not.toHaveBeenCalled();
	expect(Object.keys(result)).not.toEqual(
		expect.arrayContaining(["client", "governor", "evaluate"]),
	);
});

test.each([
	"action",
	"script",
	"callback",
])("rejects caller-supplied %s before opening a transport", async (key) => {
	const f = await fixture();
	const before = await fs.readFile(f.file);
	await expect(
		observeConfiguredGrokUnknownConnectorOutcome(f.config, { ...f.request, [key]: "arbitrary" }),
	).rejects.toThrow();
	expect(transport.connect).not.toHaveBeenCalled();
	expect(await fs.readFile(f.file)).toEqual(before);
});
test.each([
	"revision",
	"target",
	"scope",
	"account",
	"process",
	"generation",
])("rejects mismatched %s and preserves unknown custody", async (kind) => {
	const f = await fixture();
	const before = await fs.readFile(f.file);
	const request = structuredClone(f.request);
	if (kind === "revision") request.expectedRevision++;
	if (kind === "target") request.targetId = "foreign-target";
	if (kind === "scope") request.scope.tenantKey = "foreign-scope";
	if (kind === "account") request.expectedProviderAccountRef = "a".repeat(64);
	if (kind === "process") request.browserProcessId++;
	if (kind === "generation") request.browserStartTime = "0";
	await expect(observeConfiguredGrokUnknownConnectorOutcome(f.config, request)).rejects.toThrow();
	expect(await fs.readFile(f.file)).toEqual(before);
	if (kind !== "account") expect(transport.connect).not.toHaveBeenCalled();
});
test("does not observe an actively owned target", async () => {
	const f = await fixture(true);
	const before = await fs.readFile(f.file);
	await expect(observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).rejects.toThrow(
		"lease_mismatch",
	);
	expect(transport.connect).not.toHaveBeenCalled();
	expect(await fs.readFile(f.file)).toEqual(before);
});
test("detects peer revision change during a fixed read without restoring the prior state", async () => {
	const f = await fixture();
	const evaluate = f.raw.Runtime.evaluate;
	let changed: Buffer | undefined;
	f.raw.Runtime.evaluate = async (args) => {
		const result = await evaluate(args);
		if (!changed) {
			await f.runtime.registry?.markLost({
				leaseId: f.request.leaseId,
				expectedRevision: f.request.expectedRevision,
				now: new Date().toISOString(),
				reason: "identity-conflict",
			});
			changed = await fs.readFile(f.file);
		}
		return result;
	};
	await expect(observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).rejects.toThrow(
		"lease_mismatch",
	);
	expect(changed).toBeDefined();
	expect(await fs.readFile(f.file)).toEqual(changed);
});
test.each([
	false,
	true,
])("preserves unknown lease on cancellation (after attach=%s)", async (during) => {
	const f = await fixture();
	const before = await fs.readFile(f.file);
	const controller = new AbortController();
	if (during) {
		const evaluate = f.raw.Runtime.evaluate;
		f.raw.Runtime.evaluate = async (args) => {
			const result = await evaluate(args);
			controller.abort(Error("fixture cancellation"));
			return result;
		};
	} else controller.abort(Error("fixture cancellation"));
	await expect(
		observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request, controller.signal),
	).rejects.toThrow("fixture cancellation");
	expect(await fs.readFile(f.file)).toEqual(before);
	if (!during) expect(transport.connect).not.toHaveBeenCalled();
});
test("preserves original uncertainty when transport cleanup fails", async () => {
	const f = await fixture();
	const before = await fs.readFile(f.file);
	f.raw.close.mockRejectedValue(Error("fixture close failure"));
	await expect(observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).rejects.toThrow();
	expect(await fs.readFile(f.file)).toEqual(before);
});
test("normal background backend admission is retained without new blanket denial", async () => {
	const f = await fixture(false, 1);
	const before = await fs.readFile(f.file);
	const evaluate = f.raw.Runtime.evaluate;
	let observed = false;
	f.raw.Runtime.evaluate = async (args) => {
		if (!observed && args.expression.includes("grok-unknown-connector-outcome")) {
			observed = true;
			for (const handler of f.handlers)
				await handler({
					requestId: "original-background",
					request: { url: "https://grok.com/rest/connectors/get", method: "POST" },
					resourceType: "XHR",
				});
		}
		return evaluate(args);
	};
	expect(await observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).toMatchObject({
		category: "connector-picker",
		effectState: "outcome-unknown",
	});
	expect(f.raw.Fetch.continueRequest).toHaveBeenCalledOnce();
	expect(f.raw.Fetch.failRequest).not.toHaveBeenCalled();
	expect(await fs.readFile(f.file)).toEqual(before);
});

test("retains normal backend request cap for background traffic", async () => {
	const f = await fixture(false, 1);
	const before = await fs.readFile(f.file);
	const evaluate = f.raw.Runtime.evaluate;
	let observed = false;
	f.raw.Runtime.evaluate = async (args) => {
		if (!observed && args.expression.includes("grok-unknown-connector-outcome")) {
			observed = true;
			for (const id of ["background-one", "background-two"])
				for (const handler of f.handlers)
					await handler({
						requestId: id,
						request: { url: "https://grok.com/rest/connectors/get", method: "POST" },
						resourceType: "XHR",
					});
		}
		return evaluate(args);
	};
	await expect(observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).rejects.toThrow();
	expect(f.raw.Fetch.continueRequest).toHaveBeenCalledOnce();
	expect(f.raw.Fetch.failRequest).toHaveBeenCalledOnce();
	expect(await fs.readFile(f.file)).toEqual(before);
});
test("rejects mutation begin even inside the private observation transport", async () => {
	const f = await fixture();
	const before = await fs.readFile(f.file);
	const connect = transport.connect.getMockImplementation();
	let owned: unknown;
	if (!connect) throw Error("fixture connect missing");
	transport.connect.mockImplementation(async (...args: unknown[]) => {
		owned = await connect(...args);
		return owned;
	});
	const evaluate = f.raw.Runtime.evaluate;
	let checked = false;
	f.raw.Runtime.evaluate = async (args) => {
		if (!checked && args.expression.includes("grok-unknown-connector-outcome")) {
			checked = true;
			const { resolveProviderTrafficGovernor } = await import(
				"../../src/browser/providers/mutationAudit.js"
			);
			const governor = resolveProviderTrafficGovernor(owned as never);
			if (!governor) throw Error("fixture governor missing");
			await expect(
				governor.begin({
					kind: "in-page-click",
					interactionClass: "generic",
					source: "fixture:attempted-mutation",
				}),
			).rejects.toThrow("read_only");
		}
		return evaluate(args);
	};
	expect(await observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).toMatchObject({
		category: "connector-picker",
	});
	expect(checked).toBe(true);
	expect(await fs.readFile(f.file)).toEqual(before);
});
test("shared provider warning still stops a fixed observation", async () => {
	const f = await fixture();
	const before = await fs.readFile(f.file);
	await f.runtime.ledger?.recordProviderWarning({
		scope: { ...f.request.scope, provider: "grok" },
		classification: "rate-limit",
		reason: "fixture warning",
		observedAt: new Date().toISOString(),
	});
	await expect(observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).rejects.toThrow(
		"provider-warning",
	);
	expect(await fs.readFile(f.file)).toEqual(before);
});

test.each([
	"Custom",
	"Custom\nAdd your own custom connector",
])("observes only qualified picker caption %s", async (caption) => {
	const f = await fixture();
	f.modal.children[0].ownText = caption;
	expect(await observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).toMatchObject({
		category: "connector-picker",
		customControlCount: 1,
		effectState: "outcome-unknown",
	});
});
test.each(["hidden-ancestor", "unqualified-role"])("keeps %s picker inconclusive", async (kind) => {
	const f = await fixture();
	if (kind === "hidden-ancestor") f.dom.document.setAttribute("aria-hidden", "true");
	else {
		const plain = new N("div", "Custom");
		plain.parentElement = f.modal;
		f.modal.children = [plain];
	}
	expect(await observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).toMatchObject({
		category: "inconclusive",
		customControlCount: 0,
		effectState: "outcome-unknown",
	});
});
test.each([
	"extra",
	"malformed",
])("rejects %s DOM result without exposing page values", async (kind) => {
	const f = await fixture();
	const before = await fs.readFile(f.file);
	const evaluate = f.raw.Runtime.evaluate;
	f.raw.Runtime.evaluate = async (args) => {
		const result = await evaluate(args);
		if (args.expression.includes("grok-unknown-connector-outcome")) {
			const value = result.result.value as Record<string, unknown>;
			if (kind === "extra") value.privateRawText = "must not escape";
			else value.customControlCount = -1;
		}
		return result;
	};
	await expect(observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).rejects.toThrow();
	expect(await fs.readFile(f.file)).toEqual(before);
});

test("observes a pinned ownerless lost unknown target without changing it", async () => {
	const f = await fixture();
	const lost = await f.runtime.registry?.markLost({
		leaseId: f.request.leaseId,
		expectedRevision: f.request.expectedRevision,
		now: new Date().toISOString(),
		reason: "identity-conflict",
	});
	if (!lost?.ok) throw Error("fixture lost transition failed");
	f.request.expectedRevision = lost.value.revision;
	const before = await fs.readFile(f.file);
	expect(await observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).toMatchObject({
		category: "connector-picker",
		effectState: "outcome-unknown",
	});
	expect(await fs.readFile(f.file)).toEqual(before);
});

test("carries caller cancellation into guarded transport admission", async () => {
	const f = await fixture();
	const controller = new AbortController();
	let checked = false;
	f.raw.Page.enable = async () => {
		await (f.raw.send as (...args: unknown[]) => Promise<void>)("Page.enable", {});
	};
	const run = async <T>(
		command: string,
		effect: () => Promise<T>,
		options?: { abortSignal?: AbortSignal },
	) => {
		if (command === "Page.enable") {
			checked = true;
			expect(options?.abortSignal).toBe(controller.signal);
		}
		return effect();
	};
	setCdpCommandAdmissionResolver(async () => ({
		run,
		hold: async () => ({ run, close: async () => {} }),
	}));
	expect(
		await observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request, controller.signal),
	).toMatchObject({ effectState: "outcome-unknown" });
	expect(checked).toBe(true);
});

test("retains a provider warning raised during fixed observation settlement", async () => {
	const f = await fixture();
	const before = await fs.readFile(f.file);
	const evaluate = f.raw.Runtime.evaluate;
	let warned = false;
	f.raw.Runtime.evaluate = async (args) => {
		const result = await evaluate(args);
		if (!warned && args.expression.includes("grok-unknown-connector-outcome")) {
			warned = true;
			await f.runtime.ledger?.recordProviderWarning({
				scope: { ...f.request.scope, provider: "grok" },
				classification: "rate-limit",
				reason: "fixture late warning",
				observedAt: new Date().toISOString(),
			});
		}
		return result;
	};
	await expect(observeConfiguredGrokUnknownConnectorOutcome(f.config, f.request)).rejects.toThrow(
		"provider-warning",
	);
	expect(await fs.readFile(f.file)).toEqual(before);
});
