// biome-ignore-all lint/style/useNamingConvention: Chrome DevTools Protocol domain names are case-sensitive.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createChatgptAdapter } from "../../src/browser/providers/chatgptAdapter.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

const promptActionMocks = vi.hoisted(() => ({
	ensurePromptReady: vi.fn(async () => undefined),
	ensureChatgptComposerMode: vi.fn(async () => undefined),
	ensureModelSelection: vi.fn(async () => undefined),
	ensureChatgptWorkModelSelection: vi.fn(async () => undefined),
	ensureThinkingTime: vi.fn(async () => undefined),
	ensureChatgptComposerTool: vi.fn(async () => undefined),
	clearComposerAttachments: vi.fn(async () => undefined),
	uploadAttachmentFile: vi.fn(async () => true),
	waitForAttachmentCompletion: vi.fn(async () => undefined),
	submitPrompt: vi.fn(async (options: { onPromptDispatched?: () => Promise<void> }) => {
		await options.onPromptDispatched?.();
		return 1;
	}),
}));

const chatgptConnectionMocks = vi.hoisted(() => ({
	connectToChromeTarget: vi.fn(),
}));

vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: chatgptConnectionMocks.connectToChromeTarget,
}));

vi.mock("../../src/browser/actions/navigation.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/navigation.js")>()),
	ensurePromptReady: promptActionMocks.ensurePromptReady,
}));

vi.mock("../../src/browser/actions/chatgptComposerMode.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/chatgptComposerMode.js")>()),
	ensureChatgptComposerMode: promptActionMocks.ensureChatgptComposerMode,
}));

vi.mock("../../src/browser/actions/modelSelection.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/modelSelection.js")>()),
	ensureModelSelection: promptActionMocks.ensureModelSelection,
}));

vi.mock("../../src/browser/actions/chatgptWorkModelSelection.js", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/browser/actions/chatgptWorkModelSelection.js")
	>()),
	ensureChatgptWorkModelSelection: promptActionMocks.ensureChatgptWorkModelSelection,
}));

vi.mock("../../src/browser/actions/thinkingTime.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/thinkingTime.js")>()),
	ensureThinkingTime: promptActionMocks.ensureThinkingTime,
}));

vi.mock("../../src/browser/actions/chatgptComposerTool.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/chatgptComposerTool.js")>()),
	ensureChatgptComposerTool: promptActionMocks.ensureChatgptComposerTool,
}));

vi.mock("../../src/browser/actions/attachments.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/attachments.js")>()),
	clearComposerAttachments: promptActionMocks.clearComposerAttachments,
	uploadAttachmentFile: promptActionMocks.uploadAttachmentFile,
	waitForAttachmentCompletion: promptActionMocks.waitForAttachmentCompletion,
}));

vi.mock("../../src/browser/actions/promptComposer.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/browser/actions/promptComposer.js")>()),
	submitPrompt: promptActionMocks.submitPrompt,
}));

describe("ChatGPT provider prompt adapter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("rejects unsupported completion before browser interaction", async () => {
		const adapter = createChatgptAdapter();

		expect(adapter.runPrompt).toBeDefined();
		await expect(
			adapter.runPrompt?.({
				prompt: "Wait for the assistant response",
				completionMode: "assistant_response",
			}),
		).rejects.toThrow(
			"ChatGPT llmService prompt execution currently supports completionMode=prompt_submitted only.",
		);
	});

	test("authorizes before submitting and projects a prompt-submitted result", async () => {
		const events: string[] = [];
		const targetUrl = "https://chatgpt.com/";
		const submittedUrl = "https://chatgpt.com/c/conversation-1";
		let locationReads = 0;
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression === "location.href") {
					locationReads += 1;
					return { result: { value: locationReads > 1 ? submittedUrl : targetUrl } };
				}
				events.push("authorize");
				return {
					result: {
						value: {
							user: { email: "operator@example.com" },
							account: null,
						},
					},
				};
			}),
		};
		promptActionMocks.ensurePromptReady.mockImplementation(async () => {
			events.push("composer-ready");
		});
		promptActionMocks.submitPrompt.mockImplementation(
			async (options: { onPromptDispatched?: () => Promise<void> }) => {
				events.push("submit");
				await options.onPromptDispatched?.();
				return 1;
			},
		);
		const client = {
			Runtime,
			Page: {},
			Input: {},
			DOM: {},
			close: vi.fn(async () => undefined),
		};
		const host = "127.0.0.1";
		const port = 45005;
		const targetId = "chatgpt-target-1";
		const connection = {
			client,
			targetId,
			shouldClose: false,
			host,
			port,
			usedExisting: true,
		};
		const authority = createProviderSessionAuthority({
			services: { chatgpt: { identity: { email: "operator@example.com" } } },
		});
		const context = {
			providerId: "chatgpt" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/chatgpt",
			browserProcessId: 1234,
			browserTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		};
		const onProof = vi.fn();
		const onProgress = vi.fn();
		const options: BrowserProviderListOptions = {
			host,
			port,
			configuredUrl: targetUrl,
			useProviderSession: true,
			providerSession: {
				providerId: "chatgpt",
				key: `chatgpt:${host}:${port}:${targetUrl}`,
				value: { connection },
				close: vi.fn(async () => undefined),
			},
			providerSessionAuthorization: {
				authority,
				context,
				expectation: authority.resolveExpectation(context),
				onProof,
			},
			browserService: {
				getConfig: () => ({
					modelStrategy: "select",
					composerTool: "deep-research",
					inputTimeoutMs: 5_000,
				}),
			} as never,
		};

		const result = await createChatgptAdapter().runPrompt?.(
			{
				prompt: "Generate an image",
				capabilityId: "chatgpt.media.create_image",
				completionMode: "prompt_submitted",
				targetUrl,
				onProgress,
			},
			options,
		);

		expect(events.indexOf("authorize")).toBeLessThan(events.indexOf("composer-ready"));
		expect(events.indexOf("composer-ready")).toBeLessThan(events.indexOf("submit"));
		expect(onProof).toHaveBeenCalledTimes(1);
		expect(promptActionMocks.ensureModelSelection).not.toHaveBeenCalled();
		expect(promptActionMocks.ensureChatgptComposerTool).toHaveBeenCalledWith(
			client,
			"create image",
			expect.any(Function),
		);
		expect(result).toEqual({
			text: "",
			conversationId: "conversation-1",
			url: submittedUrl,
			tabTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		});
		expect(onProgress).toHaveBeenCalledWith({
			phase: "submit_path_observed",
			details: expect.objectContaining({ provider: "chatgpt" }),
		});
	});

	test("uploads and settles attachments before submitting their names", async () => {
		const events: string[] = [];
		const targetUrl = "https://chatgpt.com/c/conversation-attachments";
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression === "location.href") {
					return { result: { value: targetUrl } };
				}
				return {
					result: { value: { user: { email: "operator@example.com" }, account: null } },
				};
			}),
		};
		promptActionMocks.uploadAttachmentFile.mockImplementation(async () => {
			events.push("upload");
			return true;
		});
		promptActionMocks.waitForAttachmentCompletion.mockImplementation(async () => {
			events.push("settled");
		});
		promptActionMocks.submitPrompt.mockImplementation(async () => {
			events.push("submit");
			return 1;
		});
		const client = {
			Runtime,
			Page: {},
			Input: {},
			DOM: {},
			close: vi.fn(async () => undefined),
		};
		const host = "127.0.0.1";
		const port = 45006;
		const targetId = "chatgpt-target-attachments";
		const authority = createProviderSessionAuthority({
			services: { chatgpt: { identity: { email: "operator@example.com" } } },
		});
		const context = {
			providerId: "chatgpt" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/chatgpt",
			browserProcessId: 1234,
			browserTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		};
		const options: BrowserProviderListOptions = {
			host,
			port,
			configuredUrl: targetUrl,
			useProviderSession: true,
			providerSession: {
				providerId: "chatgpt",
				key: `chatgpt:${host}:${port}:${targetUrl}`,
				value: {
					connection: {
						client,
						targetId,
						shouldClose: false,
						host,
						port,
						usedExisting: true,
					},
				},
				close: vi.fn(async () => undefined),
			},
			providerSessionAuthorization: {
				authority,
				context,
				expectation: authority.resolveExpectation(context),
			},
			browserService: {
				getConfig: () => ({ modelStrategy: "ignore", inputTimeoutMs: 5_000 }),
			} as never,
		};
		const attachment = {
			path: "/tmp/handoff-context.txt",
			displayPath: "handoff-context.txt",
			sizeBytes: 42,
		};

		await createChatgptAdapter().runPrompt?.(
			{
				prompt: "Continue with attached context.",
				attachments: [attachment],
				completionMode: "prompt_submitted",
				targetUrl,
			},
			options,
		);

		expect(events).toEqual(["upload", "settled", "submit"]);
		expect(promptActionMocks.clearComposerAttachments).toHaveBeenCalledWith(
			Runtime,
			5_000,
			expect.any(Function),
		);
		expect(promptActionMocks.uploadAttachmentFile).toHaveBeenCalledWith(
			{ runtime: Runtime, dom: client.DOM, input: client.Input, page: client.Page },
			attachment,
			expect.any(Function),
			{ expectedCount: 1 },
		);
		expect(promptActionMocks.waitForAttachmentCompletion).toHaveBeenCalledWith(
			Runtime,
			45_000,
			["handoff-context.txt"],
			expect.any(Function),
		);
		expect(promptActionMocks.submitPrompt).toHaveBeenCalledWith(
			expect.objectContaining({ attachmentNames: ["handoff-context.txt"] }),
			"Continue with attached context.",
			expect.any(Function),
		);
	});

	test("closes an owned ChatGPT connection when prompt preparation fails after authorization", async () => {
		const targetUrl = "https://chatgpt.com/";
		const failure = new Error("ChatGPT prompt preparation failed");
		const Runtime = {
			enable: vi.fn(async () => undefined),
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression === "location.href") {
					return { result: { value: targetUrl } };
				}
				return {
					result: { value: { user: { email: "operator@example.com" }, account: null } },
				};
			}),
		};
		const client = {
			Runtime,
			Page: { enable: vi.fn(async () => undefined) },
			Input: {},
			DOM: {},
			close: vi.fn(async () => undefined),
		};
		chatgptConnectionMocks.connectToChromeTarget.mockResolvedValueOnce(client);
		promptActionMocks.ensurePromptReady.mockRejectedValueOnce(failure);
		const host = "127.0.0.1";
		const port = 45009;
		const targetId = "chatgpt-target-owned";
		const authority = createProviderSessionAuthority({
			services: { chatgpt: { identity: { email: "operator@example.com" } } },
		});
		const context = {
			providerId: "chatgpt" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/chatgpt",
			browserProcessId: 1234,
			browserTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		};

		await expect(
			createChatgptAdapter().runPrompt?.(
				{ prompt: "Fail after authorization", completionMode: "prompt_submitted", targetUrl },
				{
					host,
					port,
					tabTargetId: targetId,
					providerSessionAuthorization: {
						authority,
						context,
						expectation: authority.resolveExpectation(context),
					},
					browserService: {
						getConfig: () => ({ modelStrategy: "ignore", inputTimeoutMs: 5_000 }),
					} as never,
				},
			),
		).rejects.toBe(failure);
		expect(promptActionMocks.ensurePromptReady).toHaveBeenCalledTimes(1);
		expect(client.close).toHaveBeenCalledTimes(1);
	});
});
