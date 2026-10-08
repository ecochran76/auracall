import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { createChatgptAdapter } from "../../src/browser/providers/chatgptAdapter.js";
import { createProviderSessionAuthorization } from "../../src/browser/providers/providerSessionAuthority.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

test.each([
	{ routeProject: "g-p-0123456789abcdef-fixture", ready: true },
	{ routeProject: "g-p-fedcba9876543210-fixture", ready: false },
])("single-visit context read preserves project identity for $routeProject", async ({
	routeProject,
	ready,
}) => {
	const conversationId = "fixture-conversation";
	const projectId = "g-p-0123456789abcdef";
	const canonical = `https://chatgpt.com/g/${projectId}/c/${conversationId}`;
	const location = new URL(`https://chatgpt.com/g/${routeProject}/c/${conversationId}`);
	const navigate = vi.fn(async () => {
		throw new Error("Provider traffic budget exhausted for detail/page_navigate at limit 1.");
	});
	const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
		if (expression.includes("/api/auth/session")) {
			return {
				result: { value: { user: { id: "fixture-user", email: "operator@example.test" } } },
			};
		}
		if (expression === "location.href") return { result: { value: location.href } };
		if (expression.includes("const rawConversationId")) {
			return {
				result: {
					value: runInNewContext(expression, {
						location,
						document: { title: "Fixture", querySelector: () => ({}), readyState: "complete" },
					}),
				},
			};
		}
		if (expression.includes("document.readyState")) return { result: { value: true } };
		if (expression.includes("/backend-api/conversation/")) {
			return { result: { value: { ok: true, body: JSON.stringify({ mapping: {} }) } } };
		}
		if (expression.includes("const pageStart =")) {
			return {
				result: {
					value: {
						messages: [{ role: "assistant", text: "Fixture response" }],
						nextOffset: null,
						totalMessages: 1,
					},
				},
			};
		}
		return { result: { value: [] } };
	});
	const close = vi.fn(async () => undefined);
	const connection = {
		// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
		client: { Runtime: { evaluate }, Page: { navigate }, close },
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
		allowNavigation: true,
		accountMirrorInventory: true,
		accountMirrorSingleConversationVisit: true,
		providerSession: {
			providerId: "chatgpt",
			key: `chatgpt:127.0.0.1:45011:${canonical}`,
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
	const adapter = createChatgptAdapter();
	if (!adapter.readConversationContext) throw new Error("Context read entry point missing");
	if (!ready) {
		await expect(
			adapter.readConversationContext(conversationId, projectId, options),
		).rejects.toThrow("Provider traffic budget exhausted");
		expect(navigate).toHaveBeenCalledTimes(1);
		expect(evaluate).not.toHaveBeenCalledWith(
			expect.objectContaining({
				expression: expect.stringContaining("/backend-api/conversation/"),
			}),
		);
		return;
	}
	await expect(
		adapter.readConversationContext(conversationId, projectId, options),
	).resolves.toMatchObject({
		conversationId,
		messages: [{ role: "assistant", text: "Fixture response" }],
	});
	expect(navigate).not.toHaveBeenCalled();
	expect(evaluate).toHaveBeenCalledWith(
		expect.objectContaining({ expression: expect.stringContaining("/backend-api/conversation/") }),
	);
});
