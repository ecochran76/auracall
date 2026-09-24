import { describe, expect, test, vi } from "vitest";

import { submitChatgptHandoffWithConfiguredConcurrency } from "../../src/handoff/chatgptBrowserAdapter.js";
import type { HandoffProviderNativePromptInput } from "../../src/handoff/service.js";

const handoffInput: HandoffProviderNativePromptInput = {
	provider: "chatgpt",
	runtimeProfileId: "runtime-1",
	browserProfileId: null,
	conversationRef: "https://chatgpt.com/c/conversation-1",
	projectRef: null,
	modelSelector: null,
	prompt: "continue",
	compactContext: {},
	uploadedProviderFileIds: [],
	uploadedFiles: [],
	packageDigest: "digest-1",
};

describe("ChatGPT handoff concurrency routing", () => {
	test("routes explicit tab affinity through the coordinated browser client", async () => {
		const serializedRunner = { runPrompt: vi.fn() };
		const affinityRunner = {
			runPrompt: vi.fn(async () => ({
				text: "",
				conversationId: "conversation-1",
				url: "https://chatgpt.com/c/conversation-1",
				tabTargetId: "target-1",
			})),
		};
		const getAffinityRunner = vi.fn(async () => affinityRunner);

		const result = await submitChatgptHandoffWithConfiguredConcurrency({
			userConfig: { browser: { tabConcurrencyMode: "tab-affinity" } } as never,
			input: handoffInput,
			serializedRunner,
			getAffinityRunner,
		});

		expect(result.providerMessageId).toBe("chatgpt-tab:target-1");
		expect(getAffinityRunner).toHaveBeenCalledOnce();
		expect(affinityRunner.runPrompt).toHaveBeenCalledWith(
			expect.objectContaining({ conversationId: "conversation-1" }),
			expect.objectContaining({
				tabLifecycle: "retain",
				mutationSourcePrefix: "handoff:chatgpt-target-submit",
			}),
		);
		expect(serializedRunner.runPrompt).not.toHaveBeenCalled();
	});
});
