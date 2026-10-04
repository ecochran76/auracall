// biome-ignore-all lint/style/useNamingConvention: CDP domain names are case-sensitive.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { createLlmService } from "../../src/browser/llmService/providers/index.js";
import { createChatgptAdapter } from "../../src/browser/providers/chatgptAdapter.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: mocks.connect,
}));
test.each([
	"match",
	"conflict",
] as const)("identity proof releases its private session on %s", async (verdict) => {
	const home = await mkdtemp(path.join(os.tmpdir(), "auracall-proof-session-"));
	setAuracallHomeDirOverrideForTest(home);
	const url = "https://chatgpt.com/c/fixture";
	const clients: Array<{ close: () => Promise<void>; transportClose: ReturnType<typeof vi.fn> }> =
		[];
	mocks.connect.mockImplementation(async () => {
		const transportClose = vi.fn(async () => undefined);
		const client = {
			Page: { enable: vi.fn(async () => undefined) },
			Runtime: {
				enable: vi.fn(async () => undefined),
				evaluate: vi.fn(async ({ expression }: { expression: string }) => ({
					result: {
						value:
							expression === "location.href"
								? url
								: expression.includes("fetch('/api/auth/session'")
									? {
											user: {
												email: verdict === "match" ? "operator@example.com" : "other@example.com",
											},
											account: null,
										}
									: null,
					},
				})),
			},
			close: transportClose,
			transportClose,
		};
		clients.push(client);
		return client;
	});
	const config = {
		auracallProfile: "fixture",
		browser: { cache: {} },
		services: { chatgpt: { identity: { email: "operator@example.com" } } },
	} as never;
	const browserService = {
		getConfig: () => config,
		resolveServiceTarget: vi.fn(async () => ({
			host: "127.0.0.1",
			port: 45009,
			managedBrowserProfile: "/managed/chatgpt",
			browserProfile: "fixture",
			browserProcessId: 1234,
			tab: { targetId: "owned-target", url },
		})),
	} as never;
	const service = createLlmService("chatgpt", config, { browserService });
	const options = {
		host: "127.0.0.1",
		port: 45009,
		tabTargetId: "owned-target",
		configuredUrl: url,
		useProviderSession: true,
		abortSignal: new AbortController().signal,
	};
	try {
		if (verdict === "match") {
			expect((await service.getProviderSessionProof(options)).verdict).toBe("match");
		} else {
			await expect(service.getProviderSessionProof(options)).rejects.toThrow(
				"provider_session_dimension_conflict",
			);
		}
		expect(clients[0]?.transportClose).toHaveBeenCalledTimes(1);
		const nextOptions = await service.buildListOptions(options, { ensurePort: false });
		if (!nextOptions.providerTrafficAuthorityFactory) throw new Error("Fixture authority missing");
		const nextAuthority = await nextOptions.providerTrafficAuthorityFactory.acquire({
			targetId: "owned-target",
		});
		await nextAuthority.close();
		if (verdict === "match") {
			await createChatgptAdapter().getUserIdentity?.(nextOptions);
			const callerSession = nextOptions.providerSession;
			if (!callerSession) throw new Error("Fixture caller session missing");
			expect((await service.getProviderSessionProof(nextOptions)).verdict).toBe("match");
			expect(nextOptions.providerSession).toBe(callerSession);
			expect((await createBrowserTabConcurrencyRuntime(config).readStatus()).fencedLeaseCount).toBe(
				1,
			);
			await callerSession.close();
		}

		expect((await createBrowserTabConcurrencyRuntime(config).readStatus()).fencedLeaseCount).toBe(
			0,
		);
	} finally {
		await Promise.all(clients.map((client) => client.close()));
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});
