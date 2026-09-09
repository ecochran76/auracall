// biome-ignore-all lint/style/useNamingConvention: Chrome DevTools Protocol domain names are case-sensitive.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureChatgptEcosystemMention,
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
