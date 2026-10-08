import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { createChatgptAdapter } from "../../src/browser/providers/chatgptAdapter.js";
import { createProviderSessionAuthorization } from "../../src/browser/providers/providerSessionAuthority.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

test.each([
	{ routeProject: "g-p-0123456789abcdef-fixture", ready: true, richLabel: null },
	{ routeProject: "g-p-fedcba9876543210-fixture", ready: false, richLabel: null },
	{ routeProject: null, ready: true, richLabel: "Ask ChatGPT" },
	{ routeProject: null, ready: false, richLabel: "Unrelated editor" },
])("single-visit context read preserves project identity for $routeProject and $richLabel", async ({
	routeProject,
	ready,
	richLabel,
}) => {
	const conversationId = "fixture-conversation";
	const projectId = routeProject === null ? undefined : "g-p-0123456789abcdef";
	const canonical = projectId
		? `https://chatgpt.com/g/${projectId}/c/${conversationId}`
		: `https://chatgpt.com/c/${conversationId}`;
	const location = new URL(
		routeProject ? `https://chatgpt.com/g/${routeProject}/c/${conversationId}` : canonical,
	);
	const richAttributes: Record<string, string> = {
		"data-composer-markdown": "",
		contenteditable: "true",
		role: "textbox",
		"aria-label": richLabel ?? "",
	};
	const querySelector = (selector: string) => {
		if (!richLabel) return {};
		for (const part of selector.split(",").map((value) => value.trim())) {
			const tag = part.match(/^[a-z]+/)?.[0];
			if (tag && tag !== "div") continue;
			const attributes = [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
			if (
				!attributes.length ||
				part
					.replace(/^[a-z]+/, "")
					.replace(/\[[^\]]+\]/g, "")
					.trim()
			)
				continue;
			if (
				attributes.every(
					([, name, value]) =>
						Object.hasOwn(richAttributes, name) &&
						(value === undefined || richAttributes[name] === value),
				)
			)
				return {};
		}
		return null;
	};
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
						document: { title: "Fixture", querySelector, readyState: "complete" },
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
	vi.useFakeTimers();
	try {
		const pending = adapter.readConversationContext(conversationId, projectId, options).then(
			(value) => ({ value, error: null }),
			(error) => ({ value: null, error }),
		);
		await vi.runAllTimersAsync();
		const outcome = await pending;
		if (!ready) {
			expect(outcome.error).toMatchObject({
				message: expect.stringContaining("Provider traffic budget exhausted"),
			});
			expect(navigate).toHaveBeenCalledTimes(1);
			expect(evaluate).not.toHaveBeenCalledWith(
				expect.objectContaining({
					expression: expect.stringContaining("/backend-api/conversation/"),
				}),
			);
			return;
		}
		expect(outcome.error).toBeNull();
		expect(outcome.value).toMatchObject({
			conversationId,
			messages: [{ role: "assistant", text: "Fixture response" }],
		});
		expect(navigate).not.toHaveBeenCalled();
		expect(evaluate).toHaveBeenCalledWith(
			expect.objectContaining({
				expression: expect.stringContaining("/backend-api/conversation/"),
			}),
		);
	} finally {
		vi.useRealTimers();
	}
});
