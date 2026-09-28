// biome-ignore-all lint/style/useNamingConvention: Chrome DevTools Protocol domain names are case-sensitive.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureChatgptEcosystemMention,
	selectChatgptEcosystemMentionWithObservedIdentity,
	assertChatgptEcosystemMentionSelected,
	readChatgptEcosystemMention,
} from "../../src/browser/actions/chatgptEcosystemMention.js";

const uiMocks = vi.hoisted(() => ({
	dismissOpenMenus: vi.fn(async () => undefined),
	pressButton: vi.fn(),
}));

vi.mock("../../src/browser/service/ui.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/service/ui.js")>()),
	dismissOpenMenus: uiMocks.dismissOpenMenus,
	pressButton: uiMocks.pressButton,
}));

describe("ChatGPT ecosystem mention selection", () => {
	it.each([
		null,
		{ label: "LitScout", pluginId: "plugin_other" },
	])("refuses changed or ambiguous pre-Send selection: %j", async (selection) => {
		const client = { Runtime: { evaluate: vi.fn(async () => ({ result: { value: selection } })) } };
		await expect(
			assertChatgptEcosystemMentionSelected(client as never, {
				label: "LitScout",
				acceptedPluginIds: ["asdk_app_litscout"],
			}),
		).rejects.toThrow("selection changed before Send");
	});
	it("revalidates normalized exact identity without reopening the picker", async () => {
		const client = {
			Runtime: {
				evaluate: vi.fn(async () => ({
					result: { value: { label: "LitScout", pluginId: "plugin:asdk_app_litscout" } },
				})),
			},
		};
		await expect(
			assertChatgptEcosystemMentionSelected(client as never, {
				label: "LitScout",
				acceptedPluginIds: ["plugin_asdk_app_litscout"],
			}),
		).resolves.toBeUndefined();
		expect(uiMocks.pressButton).not.toHaveBeenCalled();
	});
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("selects and verifies one exact developer-app pill", async () => {
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression.includes("pills.length === 0")) return { result: { value: true } };
				if (expression.includes("document.getSelection")) return { result: { value: true } };
				return {
					result: {
						value: { label: "LitScout", pluginId: "plugin:asdk_app_litscout" },
					},
				};
			}),
		};
		const Input = { insertText: vi.fn(async () => undefined) };
		uiMocks.pressButton
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: true, matchedLabel: "LitScout" });

		await expect(
			ensureChatgptEcosystemMention({ Runtime, Input } as never, {
				label: "LitScout",
				acceptedPluginIds: ["plugin_asdk_app_litscout", "asdk_app_litscout"],
			}),
		).resolves.toBeUndefined();

		expect(uiMocks.dismissOpenMenus).toHaveBeenCalledWith(Runtime);
		expect(Input.insertText).toHaveBeenCalledWith({ text: "@LitScout" });
	});

	it("allows a connected capability in a conversation-bound tab while keeping the composer empty", async () => {
		const evaluatedExpressions: string[] = [];
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				evaluatedExpressions.push(expression);
				if (expression.includes("pills.length === 0")) return { result: { value: true } };
				if (expression.includes("document.getSelection")) return { result: { value: true } };
				return {
					result: {
						value: { label: "Gmail", pluginId: "plugin:connector_gmail" },
					},
				};
			}),
		};
		uiMocks.pressButton
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: true, matchedLabel: "Gmail" });

		await ensureChatgptEcosystemMention(
			{ Runtime, Input: { insertText: vi.fn(async () => undefined) } } as never,
			{
				label: "Gmail",
				acceptedPluginIds: ["connector_gmail"],
				requireFreshConversation: false,
			},
		);

		const pristineExpression = evaluatedExpressions.find((expression) =>
			expression.includes("pills.length === 0"),
		);
		expect(pristineExpression).toContain("(false ? turns.length === 0 : true)");
	});

	it("captures provider identity from a verified connected-app mention when menu rows omit it", async () => {
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression.includes("pills.length === 0")) return { result: { value: true } };
				if (expression.includes("document.getSelection")) return { result: { value: true } };
				return {
					result: {
						value: { label: "GitHub", pluginId: "plugin:connector_github" },
					},
				};
			}),
		};
		const Input = { insertText: vi.fn(async () => undefined) };
		uiMocks.pressButton
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: true, matchedLabel: "GitHub" });

		await expect(
			selectChatgptEcosystemMentionWithObservedIdentity(
				{ Runtime, Input } as never,
				{ label: "GitHub", requireFreshConversation: false },
			),
		).resolves.toEqual({ label: "GitHub", pluginId: "plugin:connector_github" });
		expect(Input.insertText).toHaveBeenCalledWith({ text: "@GitHub" });
	});

	it("fails closed when a markerless app mention exposes no provider identity", async () => {
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression.includes("pills.length === 0")) return { result: { value: true } };
				if (expression.includes("document.getSelection")) return { result: { value: true } };
				return { result: { value: { label: "GitHub", pluginId: null } } };
			}),
		};
		uiMocks.pressButton
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: true, matchedLabel: "GitHub" });

		await expect(
			selectChatgptEcosystemMentionWithObservedIdentity(
				{ Runtime, Input: { insertText: vi.fn(async () => undefined) } } as never,
				{ label: "GitHub", requireFreshConversation: false },
			),
		).rejects.toThrow(/exposed no provider identity/);
	});

	it("rejects a pill from a different app identity", async () => {
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression.includes("pills.length === 0")) return { result: { value: true } };
				if (expression.includes("document.getSelection")) return { result: { value: true } };
				if (expression.startsWith("JSON.stringify")) {
					return { result: { value: '{"url":"https://chatgpt.com/"}' } };
				}
				return {
					result: { value: { label: "Other App", pluginId: "plugin:asdk_app_other" } },
				};
			}),
		};
		uiMocks.pressButton
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({ ok: true, matchedLabel: "LitScout" });

		await expect(
			ensureChatgptEcosystemMention(
				{ Runtime, Input: { insertText: vi.fn(async () => undefined) } } as never,
				{ label: "LitScout", acceptedPluginIds: ["asdk_app_litscout"] },
			),
		).rejects.toThrow(/exact app pill not verified/);
	});

	it("reads no selection when the composer pill contract is ambiguous", async () => {
		const client = {
			Runtime: { evaluate: vi.fn(async () => ({ result: { value: null } })) },
		};
		await expect(readChatgptEcosystemMention(client as never)).resolves.toBeNull();
	});
});
