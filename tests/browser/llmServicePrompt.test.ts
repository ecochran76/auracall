import { describe, expect, test, vi } from "vitest";
import { GROK_URL } from "../../src/browser/constants.js";
import { LlmService } from "../../src/browser/llmService/llmService.js";
import type { LlmServiceAdapter, PromptResult } from "../../src/browser/llmService/types.js";
import { ProviderSessionAuthorityError } from "../../src/browser/providers/providerSessionAuthority.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";
import type { ResolvedUserConfig } from "../../src/config.js";

class PromptTestLlmService extends LlmService {
	constructor(
		userConfig: ResolvedUserConfig,
		provider: LlmServiceAdapter,
		browserService: unknown,
	) {
		super(userConfig, provider, browserService as never);
	}

	async listProjects(): Promise<[]> {
		return [];
	}

	async listConversations(): Promise<[]> {
		return [];
	}

	async renameConversation(): Promise<void> {}

	async deleteConversation(): Promise<void> {}

	async getUserIdentity(): Promise<null> {
		return null;
	}

	protected override getProviderGuardSettings(): null {
		return null;
	}
}

describe("LlmService provider prompt", () => {
	test("prepares a provider workbench through the shared service seam without planning a prompt", async () => {
		const result = {
			chatgptMode: "work" as const,
			modelSelectionKind: "work-model" as const,
			model: "GPT-5.6 Sol",
			messages: ["Work model picker: GPT-5.6 Sol selected"],
			url: "https://chatgpt.com/g/project",
		};
		const preparePromptWorkbench = vi.fn(async () => result);
		const service = new PromptTestLlmService(
			{ auracallProfile: "default", browser: { cache: {} } } as ResolvedUserConfig,
			{
				id: "chatgpt",
				config: { id: "chatgpt", selectors: {} as never },
				preparePromptWorkbench,
			} satisfies LlmServiceAdapter,
			{
				resolveServiceTarget: vi.fn(async () => ({
					host: "127.0.0.1",
					port: 45002,
					browserProfile: "default",
					sourceBrowserProfile: "Default",
					managedBrowserProfile: "/managed/default/chatgpt",
					browserProcessId: 1234,
					tab: { targetId: "target-workbench", url: result.url },
				})),
				getMutationAuditSink: () => undefined,
			},
		);
		const planPrompt = vi.spyOn(service, "planPrompt");

		await expect(
			service.preparePromptWorkbench({
				configuredUrl: result.url,
				chatgptMode: "work",
				workModel: "GPT-5.6 Sol",
				modelStrategy: "select",
			}),
		).resolves.toBe(result);
		expect(planPrompt).not.toHaveBeenCalled();
		expect(preparePromptWorkbench).toHaveBeenCalledWith(
			expect.objectContaining({
				targetUrl: result.url,
				chatgptMode: "work",
				workModel: "GPT-5.6 Sol",
				modelStrategy: "select",
			}),
			expect.objectContaining({ host: "127.0.0.1", port: 45002 }),
		);
	});

	test("fails with the exact unsupported-provider error before planning", async () => {
		const service = new PromptTestLlmService(
			{ browser: { cache: {} } } as ResolvedUserConfig,
			{
				id: "gemini",
				config: { id: "gemini", selectors: {} as never },
			} satisfies LlmServiceAdapter,
			{
				resolveServiceTarget: vi.fn(),
				getMutationAuditSink: () => undefined,
			},
		);
		const planPrompt = vi.spyOn(service, "planPrompt");

		await expect(service.runPrompt({ prompt: "unsupported" })).rejects.toThrow(
			"Prompt execution is not supported for gemini.",
		);
		expect(planPrompt).not.toHaveBeenCalled();
	});

	test("runs an ordinary provider prompt through the planned adapter seam", async () => {
		const result: PromptResult = {
			text: "submitted",
			conversationId: "conversation-1",
			url: "https://gemini.google.com/app/conversation-1",
			tabTargetId: "target-1",
			devtoolsHost: "127.0.0.1",
			devtoolsPort: 45001,
		};
		const runPrompt = vi.fn(async () => result);
		const provider = {
			id: "gemini",
			config: { id: "gemini", selectors: {} as never },
			runPrompt,
		} satisfies LlmServiceAdapter;
		const resolveServiceTarget = vi.fn(async () => ({
			host: "127.0.0.1",
			port: 45001,
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/gemini",
			browserProcessId: 1234,
			tab: {
				targetId: "target-1",
				url: "https://gemini.google.com/app",
			},
		}));
		const service = new PromptTestLlmService(
			{
				auracallProfile: "default",
				browser: { cache: {} },
			} as ResolvedUserConfig,
			provider,
			{
				resolveServiceTarget,
				getMutationAuditSink: () => undefined,
			},
		);
		const buildListOptions = vi.spyOn(service, "buildListOptions");
		const planPrompt = vi.spyOn(service, "planPrompt");

		const actual = await service.runPrompt({
			prompt: "Say hello",
			completionMode: "prompt_submitted",
			configuredUrl: "https://gemini.google.com/app",
		});

		expect(actual).toBe(result);
		expect(buildListOptions).toHaveBeenCalledTimes(1);
		expect(planPrompt).toHaveBeenCalledTimes(1);
		expect(resolveServiceTarget).toHaveBeenCalledTimes(1);
		expect(runPrompt).toHaveBeenCalledTimes(1);
		expect(runPrompt).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: "Say hello",
				completionMode: "prompt_submitted",
				targetUrl: "https://gemini.google.com/app",
			}),
			expect.objectContaining({
				host: "127.0.0.1",
				port: 45001,
				providerSessionAuthorization: expect.any(Object),
			}),
		);
	});

	test("preserves advanced provider prompt intent through the base seam", async () => {
		const runPrompt = vi.fn(async () => ({ text: "" }));
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			runPrompt,
		} satisfies LlmServiceAdapter;
		const service = new PromptTestLlmService(
			{ auracallProfile: "default", browser: { cache: {} } } as ResolvedUserConfig,
			provider,
			{
				resolveServiceTarget: vi.fn(async () => ({
					host: "127.0.0.1",
					port: 45002,
					browserProfile: "default",
					sourceBrowserProfile: "Default",
					managedBrowserProfile: "/managed/default/chatgpt",
					browserProcessId: 1234,
					tab: { targetId: "target-2", url: "https://chatgpt.com" },
				})),
				getMutationAuditSink: () => undefined,
			},
		);
		const onProgress = vi.fn();
		const attachments = [{ path: "/tmp/context.txt", displayPath: "context.txt", sizeBytes: 42 }];

		await service.runPrompt({
			prompt: "Continue with context",
			attachments,
			capabilityId: "chatgpt.media.create_image",
			completionMode: "prompt_submitted",
			configuredUrl: "https://chatgpt.com/c/conversation-2",
			projectId: "project-2",
			conversationId: "conversation-2",
			desiredModel: "GPT-5.6 Sol",
			modelStrategy: "select",
			thinkingTime: "extended",
			chatgptMode: "work",
			workModel: "GPT-5.6 Sol",
			modelSelector: "chatgpt:pro-extended",
			timeoutMs: 123_000,
			onProgress,
		});

		expect(runPrompt).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: "Continue with context",
				attachments,
				capabilityId: "chatgpt.media.create_image",
				completionMode: "prompt_submitted",
				targetUrl: "https://chatgpt.com/c/conversation-2",
				projectId: "project-2",
				conversationId: "conversation-2",
				desiredModel: "GPT-5.6 Sol",
				modelStrategy: "select",
				thinkingTime: "extended",
				chatgptMode: "work",
				workModel: "GPT-5.6 Sol",
				modelSelector: "chatgpt:pro-extended",
				timeoutMs: 123_000,
				onProgress,
			}),
			expect.any(Object),
		);
	});

	test("uses explicit method options instead of embedded prompt list options", async () => {
		const runPrompt = vi.fn(async () => ({ text: "" }));
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			runPrompt,
		} satisfies LlmServiceAdapter;
		const resolveServiceTarget = vi.fn();
		const service = new PromptTestLlmService(
			{ browser: { cache: {} } } as ResolvedUserConfig,
			provider,
			{ resolveServiceTarget, getMutationAuditSink: () => undefined },
		);

		await service.runPrompt(
			{
				prompt: "Use the explicit target",
				configuredUrl: "https://grok.com",
				listOptions: { host: "embedded-host", port: 41001 },
			},
			{ host: "explicit-host", port: 42002 },
		);

		expect(resolveServiceTarget).not.toHaveBeenCalled();
		expect(runPrompt).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({ host: "explicit-host", port: 42002 }),
		);
		const observedOptions = (runPrompt.mock.calls as unknown[][])[0]?.[1];
		expect(observedOptions).not.toMatchObject({
			host: "embedded-host",
			port: 41001,
		});
	});

	test("uses one configured URL precedence across launch resolution, planning, and dispatch", async () => {
		const runPrompt = vi.fn(async () => ({ text: "" }));
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			runPrompt,
		} satisfies LlmServiceAdapter;
		const resolveServiceTarget = vi.fn(async () => ({
			host: "127.0.0.1",
			port: 45008,
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/grok",
			browserProcessId: 1234,
			tab: { targetId: "target-8", url: "https://direct.example/prompt" },
		}));
		const service = new PromptTestLlmService(
			{
				browser: { cache: {}, grokUrl: "https://config.example/prompt" },
			} as ResolvedUserConfig,
			provider,
			{ resolveServiceTarget, getMutationAuditSink: () => undefined },
		);
		const planPrompt = vi.spyOn(service, "planPrompt");

		await service.runPrompt(
			{
				prompt: "Use one URL",
				configuredUrl: "https://direct.example/prompt",
				listOptions: { configuredUrl: "https://embedded.example/prompt" },
			},
			{ configuredUrl: "https://method.example/prompt" },
		);

		expect(resolveServiceTarget).toHaveBeenCalledWith(
			expect.objectContaining({ configuredUrl: "https://direct.example/prompt" }),
		);
		expect(planPrompt).toHaveBeenCalledWith(
			expect.objectContaining({ configuredUrl: "https://direct.example/prompt" }),
		);
		expect(runPrompt).toHaveBeenCalledWith(
			expect.objectContaining({ targetUrl: "https://direct.example/prompt" }),
			expect.objectContaining({ configuredUrl: "https://direct.example/prompt" }),
		);
	});

	test.each([
		{
			label: "explicit method URL after direct input is absent",
			inputConfiguredUrl: undefined,
			embeddedConfiguredUrl: "https://embedded.example/prompt",
			methodConfiguredUrl: "https://method.example/prompt",
			configConfiguredUrl: "https://config.example/prompt",
			expectedUrl: "https://method.example/prompt",
		},
		{
			label: "embedded URL after direct and method URLs are absent",
			inputConfiguredUrl: undefined,
			embeddedConfiguredUrl: "https://embedded.example/prompt",
			methodConfiguredUrl: undefined,
			configConfiguredUrl: "https://config.example/prompt",
			expectedUrl: "https://embedded.example/prompt",
		},
		{
			label: "provider config URL after caller URLs are absent",
			inputConfiguredUrl: undefined,
			embeddedConfiguredUrl: undefined,
			methodConfiguredUrl: undefined,
			configConfiguredUrl: "https://config.example/prompt",
			expectedUrl: "https://config.example/prompt",
		},
		{
			label: "provider default URL after all overrides are absent",
			inputConfiguredUrl: undefined,
			embeddedConfiguredUrl: undefined,
			methodConfiguredUrl: undefined,
			configConfiguredUrl: undefined,
			expectedUrl: GROK_URL,
		},
	])("uses the $label consistently", async (scenario) => {
		const runPrompt = vi.fn(async () => ({ text: "" }));
		const resolveServiceTarget = vi.fn(async ({ configuredUrl }) => ({
			host: "127.0.0.1",
			port: 45011,
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/grok",
			browserProcessId: 1234,
			tab: { targetId: "target-url-tier", url: configuredUrl },
		}));
		const service = new PromptTestLlmService(
			{
				browser: { cache: {}, grokUrl: scenario.configConfiguredUrl },
			} as ResolvedUserConfig,
			{
				id: "grok",
				config: { id: "grok", selectors: {} as never },
				runPrompt,
			} satisfies LlmServiceAdapter,
			{ resolveServiceTarget, getMutationAuditSink: () => undefined },
		);
		const planPrompt = vi.spyOn(service, "planPrompt");

		await service.runPrompt(
			{
				prompt: "Use the selected URL tier",
				configuredUrl: scenario.inputConfiguredUrl,
				listOptions: { configuredUrl: scenario.embeddedConfiguredUrl },
			},
			{ configuredUrl: scenario.methodConfiguredUrl },
		);

		expect(resolveServiceTarget).toHaveBeenCalledWith(
			expect.objectContaining({ configuredUrl: scenario.expectedUrl }),
		);
		expect(planPrompt).toHaveBeenCalledWith(
			expect.objectContaining({ configuredUrl: scenario.expectedUrl }),
		);
		expect(runPrompt).toHaveBeenCalledWith(
			expect.objectContaining({ targetUrl: scenario.expectedUrl }),
			expect.objectContaining({ configuredUrl: scenario.expectedUrl }),
		);
	});

	test("does not dispatch an already-aborted provider prompt", async () => {
		const runPrompt = vi.fn(async () => ({ text: "unexpected" }));
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			runPrompt,
		} satisfies LlmServiceAdapter;
		const service = new PromptTestLlmService(
			{ browser: { cache: {} } } as ResolvedUserConfig,
			provider,
			{
				resolveServiceTarget: vi.fn(async () => ({
					host: "127.0.0.1",
					port: 45003,
					browserProfile: "default",
					sourceBrowserProfile: "Default",
					managedBrowserProfile: "/managed/default/chatgpt",
					browserProcessId: 1234,
					tab: { targetId: "target-3", url: "https://chatgpt.com" },
				})),
				getMutationAuditSink: () => undefined,
			},
		);
		const controller = new AbortController();
		const reason = new Error("prompt aborted by caller");
		controller.abort(reason);

		await expect(
			service.runPrompt(
				{ prompt: "Do not send", configuredUrl: "https://chatgpt.com" },
				{ abortSignal: controller.signal },
			),
		).rejects.toBe(reason);
		expect(runPrompt).not.toHaveBeenCalled();
	});

	test("retries with one resolved destination and the exact authorization object", async () => {
		const observedAuthorizations: unknown[] = [];
		const observedTargets: unknown[] = [];
		let attempts = 0;
		const runPrompt = vi.fn(async (input, options?: BrowserProviderListOptions) => {
			observedTargets.push(input.targetUrl);
			observedAuthorizations.push(options?.providerSessionAuthorization);
			attempts += 1;
			if (attempts === 1) {
				throw new Error("ECONNRESET");
			}
			const authorization = options?.providerSessionAuthorization;
			if (!authorization) {
				throw new Error("authorization missing in test adapter");
			}
			const proof = authorization.authority.verify({
				context: authorization.context,
				expectation: authorization.expectation,
				observation: { email: "operator@example.com", source: "fixture" },
			});
			authorization.authority.assertProof(proof);
			authorization.onProof?.(proof);
			return { text: "submitted" };
		});
		const provider = {
			id: "grok",
			config: { id: "grok", selectors: {} as never },
			runPrompt,
		} satisfies LlmServiceAdapter;
		const resolveServiceTarget = vi.fn(async () => ({
			host: "127.0.0.1",
			port: 45004,
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/grok",
			browserProcessId: 1234,
			tab: { targetId: "target-4", url: "https://grok.com" },
		}));
		const onProviderSessionProof = vi.fn();
		const service = new PromptTestLlmService(
			{
				services: { grok: { identity: { email: "operator@example.com" } } },
				browser: { cache: {} },
			} as ResolvedUserConfig,
			provider,
			{ resolveServiceTarget, getMutationAuditSink: () => undefined },
		);

		await expect(
			service.runPrompt(
				{ prompt: "Retry once", configuredUrl: "https://grok.com" },
				{ onProviderSessionProof },
			),
		).resolves.toEqual({ text: "submitted" });

		expect(resolveServiceTarget).toHaveBeenCalledTimes(1);
		expect(runPrompt).toHaveBeenCalledTimes(2);
		expect(observedTargets).toEqual(["https://grok.com", "https://grok.com"]);
		expect(observedAuthorizations[0]).toBe(observedAuthorizations[1]);
		expect(onProviderSessionProof).toHaveBeenCalledTimes(1);
		expect(service.getLatestProviderSessionProof()).toBe(onProviderSessionProof.mock.calls[0]?.[0]);
	});

	test("does not retry an exact ProviderSessionAuthorityError", async () => {
		let authorityError: ProviderSessionAuthorityError | null = null;
		const runPrompt = vi.fn(async (_input, options?: BrowserProviderListOptions) => {
			const authorization = options?.providerSessionAuthorization;
			if (!authorization) throw new Error("authorization missing in test adapter");
			const proof = authorization.authority.verify({
				context: authorization.context,
				expectation: authorization.expectation,
				observation: { email: "different@example.com", source: "fixture" },
			});
			authorityError = new ProviderSessionAuthorityError(proof);
			throw authorityError;
		});
		const service = new PromptTestLlmService(
			{
				services: { chatgpt: { identity: { email: "connection failed@example.com" } } },
				browser: { cache: {} },
			} as ResolvedUserConfig,
			{
				id: "chatgpt",
				config: { id: "chatgpt", selectors: {} as never },
				runPrompt,
			} satisfies LlmServiceAdapter,
			{
				resolveServiceTarget: vi.fn(async () => ({
					host: "127.0.0.1",
					port: 45010,
					browserProfile: "default",
					sourceBrowserProfile: "Default",
					managedBrowserProfile: "/managed/default/chatgpt",
					browserProcessId: 1234,
					tab: { targetId: "target-authority", url: "https://chatgpt.com" },
				})),
				getMutationAuditSink: () => undefined,
			},
		);

		let caught: unknown;
		try {
			await service.runPrompt({ prompt: "Do not retry", configuredUrl: "https://chatgpt.com" });
		} catch (error) {
			caught = error;
		}

		expect(caught).toBe(authorityError);
		expect(caught).toBeInstanceOf(ProviderSessionAuthorityError);
		expect(runPrompt).toHaveBeenCalledTimes(1);
	});
});
