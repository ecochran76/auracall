// biome-ignore-all lint/style/useNamingConvention: CDP protocol domains preserve platform names.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import GuardedCDP, {
	setCdpCommandAdmissionResolver,
} from "../../packages/browser-service/src/guardedCdp.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { createConfiguredGrokBotsService } from "../../src/browser/configuredGrokDiscovery.js";
import { GrokService } from "../../src/browser/llmService/providers/grokService.js";
import {
	checkGrokBrowserAuthPreflight,
	connectToGrokTab,
} from "../../src/browser/providers/grokAdapter.js";
import { BrowserService } from "../../src/browser/service/browserService.js";
import type { ChromeClient } from "../../src/browser/types.js";
import { connectorDomFixture, ConnectorFixtureNode as N } from "./grok404ConnectorDomFixture.js";

const transport = vi.hoisted(() => ({
	list: vi.fn(),
	connect: vi.fn(),
	open: vi.fn(),
	close: vi.fn(),
	navigate: vi.fn(),
	raw: undefined as unknown,
}));
vi.mock("chrome-remote-interface", () => ({
	default: Object.assign(
		vi.fn(async () => transport.raw),
		{ List: transport.list, Close: transport.close },
	),
}));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: transport.connect,
	openChromeTarget: transport.open,
}));
vi.mock("../../src/browser/service/ui.js", async (original) => ({
	...(await original<typeof import("../../src/browser/service/ui.js")>()),
	navigateAndSettle: transport.navigate,
}));
const roots: string[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
	setCdpCommandAdmissionResolver(undefined);
	setAuracallHomeDirOverrideForTest(null);
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-session-binding-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const dom = connectorDomFixture();
	const menu = new N("div", "Bots", { role: "menu" }, [
		new N("a", "Owned Helper", { href: "/bot/owned-fixture", "data-bot-id": "owned-fixture" }),
	]);
	dom.document.children.push(menu);
	menu.parentElement = dom.document;
	const raw = {
		send: async () => {},
		Page: { enable: async () => {} },
		Runtime: { ...dom.runtime, enable: async () => {} },
		Network: {
			enable: async () => {},
			responseReceived: () => () => {},
			loadingFailed: () => () => {},
		},
		Fetch: { requestPaused: () => () => {}, enable: async () => {}, disable: async () => {} },
		close: vi.fn(async () => {}),
	};
	transport.raw = raw;
	setCdpCommandAdmissionResolver(async () => ({
		run: (_command, effect) => effect(),
		hold: async () => ({ run: (_command, effect) => effect(), close: async () => {} }),
	}));
	const client = await GuardedCDP({ host: "127.0.0.1", port: 45040 });
	transport.connect.mockResolvedValue(client);
	transport.list.mockResolvedValue([
		{ id: "attached-target", type: "page", url: "https://grok.com/" },
	]);
	const config = {
		auracallProfile: "default",
		browser: { cache: {} },
		services: { grok: { identity: { email: "operator@example.test" } } },
	} as never;
	const browserService = {
		resolveServiceTarget: vi.fn(async () => ({
			host: "127.0.0.1",
			port: 45040,
			browserProcessId: 12345,
			browserProfile: "fixture",
			managedBrowserProfile: "/managed/grok",
			tab: null,
		})),
		getConfig: () => ({}),
	};
	vi.spyOn(BrowserService, "fromConfig").mockReturnValue(
		browserService as unknown as BrowserService,
	);
	return { dom, client: client as unknown as ChromeClient, config, browserService };
}
test("configured owned-Bot read binds the actually attached retained target before strict account proof", async () => {
	const f = await fixture();
	const service = await createConfiguredGrokBotsService(f.config);
	const result = await service.list("owned");
	expect(result).toMatchObject({
		status: "unknown",
		code: "grok_bot_empty_root_composer_required",
		bots: [],
	});
	expect(result.providerAccountRef).toMatch(/^[a-f0-9]{64}$/);
	expect(transport.open).not.toHaveBeenCalled();
});
test.each([
	"exact",
	"retained",
	"owned",
] as const)("binds %s attachment and discards its previous target proof", async (mode) => {
	const f = await fixture();
	const service = GrokService.create(f.config);
	const options = await service.buildListOptions({}, { ensurePort: false });
	if (mode === "exact") options.tabTargetId = "attached-target";
	if (mode === "owned") {
		transport.list.mockResolvedValue([]);
		transport.open.mockResolvedValue({ id: "new-owned-target", type: "page", url: "about:blank" });
	}
	const auth = options.providerSessionAuthorization;
	if (!auth) throw new Error("Fixture authorization missing");
	auth.context = { ...auth.context, browserTargetId: "previous-target" };
	const old = auth.authority.verify({
		context: auth.context,
		expectation: auth.expectation,
		observation: { email: "operator@example.test" },
	});
	expect(old.verdict).toBe("match");
	auth.proof = old;
	const connection = await connectToGrokTab(options);
	try {
		expect(auth.context.browserTargetId).toBe(
			mode === "owned" ? "new-owned-target" : "attached-target",
		);
		expect(auth.proof).toBeNull();
		const result = await checkGrokBrowserAuthPreflight(connection.client.Runtime, options);
		expect(result.ok).toBe(true);
		expect(result.providerSessionProof?.sessionFingerprint).not.toBe(old.sessionFingerprint);
		expect(result.providerSessionProof?.provenance.browserProcessId).toBe(12345);
		if (mode === "owned") expect(transport.navigate).toHaveBeenCalledTimes(1);
	} finally {
		await connection.client.close();
	}
});
test("attachment never invents missing process provenance or accepts a stale matching identity proof", async () => {
	const f = await fixture();
	const service = GrokService.create(f.config);
	const options = await service.buildListOptions({}, { ensurePort: false });
	const auth = options.providerSessionAuthorization;
	if (!auth) throw new Error("Fixture authorization missing");
	auth.context = { ...auth.context, browserProcessId: null };
	const connection = await connectToGrokTab(options);
	try {
		expect(await checkGrokBrowserAuthPreflight(connection.client.Runtime, options)).toMatchObject({
			ok: false,
			reason: "provider_session_provenance_missing",
		});
		auth.context = { ...auth.context, browserProcessId: 12345 };
		f.dom.setUserEmail("other@example.test");
		expect(await checkGrokBrowserAuthPreflight(connection.client.Runtime, options)).toMatchObject({
			ok: false,
			reason: "provider_session_dimension_conflict",
		});
	} finally {
		await connection.client.close();
	}
});
test("a changed endpoint cannot borrow the previous browser process provenance", async () => {
	const f = await fixture();
	const options = await GrokService.create(f.config).buildListOptions({}, { ensurePort: false });
	f.browserService.resolveServiceTarget.mockResolvedValue({
		host: "127.0.0.2",
		port: 45041,
		browserProcessId: 54321,
		browserProfile: "fixture",
		managedBrowserProfile: "/managed/grok",
		tab: null,
	});
	const connection = await connectToGrokTab(options);
	try {
		expect(options.providerSessionAuthorization?.context.browserProcessId).toBeNull();
		expect(await checkGrokBrowserAuthPreflight(connection.client.Runtime, options)).toMatchObject({
			ok: false,
			reason: "provider_session_provenance_missing",
		});
	} finally {
		await connection.client.close();
	}
});

test.each([
	"retain-new",
	"dispose-new",
] as const)("%s creates a distinct governed root target without touching an existing draft or dialog", async (tabLifecycle) => {
	const f = await fixture();
	// The retained root may hold an unsent draft or provider dialog. Merely
	// matching its URL must never make it the new operation's composer.
	transport.open.mockResolvedValue({ id: "fresh-root", type: "page", url: "about:blank" });
	const options = await GrokService.create(f.config).buildListOptions(
		{ tabLifecycle, configuredUrl: "https://grok.com/" },
		{ ensurePort: false },
	);
	const connection = await connectToGrokTab(options);
	try {
		expect(connection).toMatchObject({ targetId: "fresh-root", usedExisting: false });
		expect(transport.open).toHaveBeenCalledExactlyOnceWith(
			45040,
			"about:blank",
			"127.0.0.1",
			undefined,
			expect.objectContaining({ kind: "pre-lease-target-acquisition" }),
		);
		expect(transport.connect).toHaveBeenCalledExactlyOnceWith({
			host: "127.0.0.1",
			port: 45040,
			target: "fresh-root",
		});
		expect(transport.navigate).toHaveBeenCalledExactlyOnceWith(connection.client, {
			url: "https://grok.com/",
		});
		expect(options.providerSessionAuthorization?.context.browserTargetId).toBe("fresh-root");
		expect(transport.close).not.toHaveBeenCalled();
	} finally {
		await connection.client.close();
	}
});
