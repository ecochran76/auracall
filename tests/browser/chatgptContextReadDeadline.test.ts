import { expect, test, vi } from "vitest";
import { createChatgptAdapter } from "../../src/browser/providers/chatgptAdapter.js";
import { createProviderSessionAuthorization } from "../../src/browser/providers/providerSessionAuthority.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

test.each([
	"stalled",
	"fallback-stalled",
	"responsive",
])("context read identity evaluation after target retention: %s", async (scenario) => {
	vi.useFakeTimers();
	const evaluate = vi.fn(() => {
		if (scenario === "fallback-stalled" && evaluate.mock.calls.length === 1)
			return Promise.resolve({
				result: { value: { user: { id: "fixture-user", email: "operator@example.test" } } },
			});
		return scenario !== "responsive"
			? new Promise<never>(() => {})
			: Promise.resolve({ result: { value: null } });
	});
	const close = vi.fn(async () => undefined);
	const connection = {
		// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
		client: { Runtime: { evaluate }, close },
		targetId: "owned-crawler",
		host: "127.0.0.1",
		port: 45011,
		shouldClose: false,
		usedExisting: true,
	};
	const options: BrowserProviderListOptions = {
		host: connection.host,
		port: connection.port,
		tabTargetId: connection.targetId,
		useProviderSession: true,
		preserveActiveTab: true,
		accountMirrorInventory: true,
		providerSession: {
			providerId: "chatgpt",
			key: "chatgpt:127.0.0.1:45011:https://chatgpt.com/c/fixture",
			value: { connection },
			close,
		},
		providerSessionAuthorization: createProviderSessionAuthorization(
			{
				runtimeProfiles: {
					default: { services: { chatgpt: { identity: { email: "operator@example.test" } } } },
				},
			},
			{
				providerId: "chatgpt",
				auracallRuntimeProfile: "default",
				browserProfile: "default",
				managedBrowserProfile: "/managed/chatgpt",
				browserProcessId: 1,
				browserTargetId: connection.targetId,
				devtoolsHost: connection.host,
				devtoolsPort: connection.port,
			},
		),
	};
	try {
		const adapter = createChatgptAdapter();
		if (!adapter.readConversationContext) throw new Error("Context read entry point is missing");
		const outcome = Promise.race([
			adapter.readConversationContext("fixture", undefined, options).then(
				() => "unexpected-success",
				(error: Error) => error.message,
			),
			new Promise<string>((resolve) =>
				setTimeout(() => resolve("stalled beyond identity deadline"), 20_000),
			),
		]);
		await vi.advanceTimersByTimeAsync(20_000);
		expect(evaluate.mock.calls[0]).toEqual([
			expect.objectContaining({ expression: expect.stringContaining("/api/auth/session") }),
		]);
		if (scenario !== "responsive") {
			expect(await outcome).toContain(
				scenario === "stalled"
					? "Timed out reading ChatGPT auth-session identity"
					: "Timed out reading ChatGPT fallback identity",
			);
		} else {
			expect(await outcome).not.toBe("stalled beyond identity deadline");
			expect(await outcome).not.toBe("unexpected-success");
		}
	} finally {
		vi.useRealTimers();
	}
});
