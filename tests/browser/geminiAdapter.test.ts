// biome-ignore-all lint/style/useNamingConvention: Chrome DevTools Protocol domain names are case-sensitive.
import { describe, expect, test, vi } from "vitest";

const geminiRunPromptMocks = vi.hoisted(() => ({
	connectToChromeTarget: vi.fn(),
}));

vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (importOriginal) => {
	const actual = await importOriginal<
		typeof import("../../packages/browser-service/src/chromeLifecycle.js")
	>();
	return {
		...actual,
		connectToChromeTarget: geminiRunPromptMocks.connectToChromeTarget,
	};
});

import {
	canReuseGeminiConversationSurfaceForTarget,
	classifyGeminiBlockingState,
	createGeminiAdapter,
	extractGeminiIdentityFromLabel,
	geminiUrlMatchesPreference,
	isEditableGeminiProjectProbe,
	normalizeGeminiConversationHistoryLimit,
	resolveGeminiConversationRailTargetUrl,
	selectPreferredGeminiTarget,
	shouldDisposeGeminiTabConnectionForTest,
	shouldForceNewGeminiTabConnectionForTest,
	shouldHydrateGeminiConversationHistory,
} from "../../src/browser/providers/geminiAdapter.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

describe("Gemini browser adapter", () => {
	test("clamps account-mirror history hydration limits", () => {
		expect(normalizeGeminiConversationHistoryLimit(undefined)).toBe(80);
		expect(normalizeGeminiConversationHistoryLimit(0)).toBe(1);
		expect(normalizeGeminiConversationHistoryLimit(57.8)).toBe(57);
		expect(normalizeGeminiConversationHistoryLimit(900)).toBe(500);
	});

	test("hydrates conversation history whenever account mirror asks for history", () => {
		expect(shouldHydrateGeminiConversationHistory({ includeHistory: true })).toBe(true);
		expect(shouldHydrateGeminiConversationHistory({ includeHistory: false })).toBe(false);
		expect(shouldHydrateGeminiConversationHistory(null)).toBe(false);
	});

	test("filters Gemini project probes to editable My Gems rows", () => {
		expect(
			isEditableGeminiProjectProbe({ editUrl: "https://gemini.google.com/gems/edit/my-gem" }),
		).toBe(true);
		expect(isEditableGeminiProjectProbe({ editable: true })).toBe(false);
		expect(isEditableGeminiProjectProbe({ editable: false })).toBe(false);
		expect(
			isEditableGeminiProjectProbe({
				id: "chess-champ",
				url: "https://gemini.google.com/gem/chess-champ",
				editUrl: "https://gemini.google.com/gems/edit/chess-champ",
			}),
		).toBe(false);
		expect(
			isEditableGeminiProjectProbe({
				id: "brainstormer",
				url: "https://gemini.google.com/gem/brainstormer",
				editUrl: "https://gemini.google.com/gems/edit/brainstormer",
			}),
		).toBe(false);
		expect(
			isEditableGeminiProjectProbe({
				id: "storybook",
				url: "https://gemini.google.com/gem/storybook",
				editUrl: "https://gemini.google.com/gems/edit/storybook",
			}),
		).toBe(false);
	});

	test("reuses an already loaded Gemini conversation tab for root rail reads", () => {
		expect(
			geminiUrlMatchesPreference(
				"https://gemini.google.com/app/abc123",
				"https://gemini.google.com/app",
			),
		).toBe(true);
		expect(
			canReuseGeminiConversationSurfaceForTarget(
				"https://gemini.google.com/app/abc123",
				"https://gemini.google.com/app",
			),
		).toBe(true);
		expect(
			canReuseGeminiConversationSurfaceForTarget(
				"https://gemini.google.com/app/abc123",
				"https://gemini.google.com/app/abc123",
			),
		).toBe(true);
		expect(
			canReuseGeminiConversationSurfaceForTarget(
				"https://gemini.google.com/app/abc123",
				"https://gemini.google.com/app/other",
			),
		).toBe(false);
		expect(
			canReuseGeminiConversationSurfaceForTarget(
				"https://gemini.google.com/gem/project_1",
				"https://gemini.google.com/app",
			),
		).toBe(false);
		expect(
			canReuseGeminiConversationSurfaceForTarget(
				"https://gemini.google.com/gem/chess-champ",
				"https://gemini.google.com/gem/chess-champ",
			),
		).toBe(true);
		expect(
			selectPreferredGeminiTarget(
				[{ url: "https://gemini.google.com/app/abc123" }],
				"https://gemini.google.com/app",
			),
		).toEqual({ url: "https://gemini.google.com/app/abc123" });
	});

	test("strips direct conversation routes from rail-backed conversation reads", () => {
		expect(
			resolveGeminiConversationRailTargetUrl({
				configuredUrl: "https://gemini.google.com/app/abc123",
			}),
		).toBe("https://gemini.google.com/app");
		expect(
			resolveGeminiConversationRailTargetUrl({
				configuredUrl: "https://gemini.google.com/app",
			}),
		).toBe("https://gemini.google.com/app");
		expect(
			resolveGeminiConversationRailTargetUrl({
				configuredUrl: "https://gemini.google.com/gems/view",
			}),
		).toBe("https://gemini.google.com/app");
		expect(
			resolveGeminiConversationRailTargetUrl({
				configuredUrl: "https://gemini.google.com/gem/project_1",
			}),
		).toBe("https://gemini.google.com/app");
		expect(
			resolveGeminiConversationRailTargetUrl(
				{
					configuredUrl: "https://gemini.google.com/app/abc123",
				},
				"gem-project-1",
			),
		).toBe("https://gemini.google.com/gem/gem-project-1");
	});

	test("extracts Google account identity from Gemini account labels", () => {
		expect(
			extractGeminiIdentityFromLabel("Google Account: Eric Cochran (ECOCHRAN76@gmail.com)"),
		).toEqual({
			name: "Eric Cochran",
			email: "ecochran76@gmail.com",
			source: "google-account-label",
		});
		expect(extractGeminiIdentityFromLabel("Settings")).toBeNull();
	});

	test("classifies Gemini manual-clear guard states before refresh work", () => {
		expect(
			classifyGeminiBlockingState({
				href: "https://www.google.com/sorry/index?continue=https://gemini.google.com/app",
				title: "About this page",
				bodyText: "Our systems have detected unusual traffic from your computer network.",
			}),
		).toContain("google.com/sorry");
		expect(
			classifyGeminiBlockingState({
				href: "https://accounts.google.com/signin/v2/identifier",
				title: "Sign in - Google Accounts",
				bodyText: "Use your Google Account to continue to Gemini.",
			}),
		).toContain("account chooser");
		expect(
			classifyGeminiBlockingState({
				href: "https://gemini.google.com/app",
				title: "reCAPTCHA",
				bodyText: "Complete the CAPTCHA challenge to continue.",
			}),
		).toContain("CAPTCHA");
		expect(
			classifyGeminiBlockingState({
				href: "https://gemini.google.com/app",
				title: "Gemini",
				bodyText: "Verify you are human to continue.",
			}),
		).toContain("Human-verification");
	});

	test("uses disposable Gemini tabs only for explicit disposable inventory reads", () => {
		expect(
			shouldForceNewGeminiTabConnectionForTest({
				tabLifecycle: "dispose-new",
			}),
		).toBe(true);
		expect(
			shouldDisposeGeminiTabConnectionForTest(
				{ shouldClose: true, targetId: "target-1" } as never,
				{ tabLifecycle: "dispose-new" },
			),
		).toBe(true);
		expect(
			shouldForceNewGeminiTabConnectionForTest({
				tabLifecycle: "dispose-new",
				tabTargetId: "submitted-target",
			}),
		).toBe(false);
		expect(
			shouldDisposeGeminiTabConnectionForTest(
				{ shouldClose: true, targetId: "target-1" } as never,
				{ tabLifecycle: "dispose-new", preserveActiveTab: true },
			),
		).toBe(false);
		expect(shouldForceNewGeminiTabConnectionForTest({ useProviderSession: true })).toBe(false);
	});

	test("runs an authorized prompt through a retained Gemini provider session", async () => {
		const prompt = "Gemini parity prompt";
		const targetUrl = "https://gemini.google.com/app";
		const conversationUrl = "https://gemini.google.com/app/gemini-conversation-1";
		let promptInserted = false;
		let submitted = false;
		const operations: string[] = [];
		const Runtime = {
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression === "location.href") {
					return { result: { value: submitted ? conversationUrl : targetUrl } };
				}
				if (expression.includes("/^Google Account:/i")) {
					operations.push("identity_observed");
					return {
						result: { value: "Google Account: Operator (operator@example.com)" },
					};
				}
				if (expression.includes("use your precise location")) {
					return { result: { value: { present: false } } };
				}
				if (expression.includes("const responseSelectors")) {
					return {
						result: {
							value: {
								href: submitted ? conversationUrl : targetUrl,
								conversationId: submitted ? "gemini-conversation-1" : null,
								composerText: submitted ? "" : promptInserted ? prompt : "",
								userTexts: submitted ? [prompt] : [],
								assistantTexts: [],
								hasActiveAvatarSpinner: submitted,
								hasGeneratedMedia: false,
								hasStopControl: false,
								isGenerating: submitted,
							},
						},
					};
				}
				if (expression.includes("deleteByCut")) {
					return { result: { value: { ok: true, mode: "contenteditable" } } };
				}
				if (expression.includes("return { text: normalize")) {
					return { result: { value: { text: prompt } } };
				}
				if (expression.includes("return { x: rect.left")) {
					return { result: { value: { x: 10, y: 20 } } };
				}
				return { result: { value: true } };
			}),
		};
		const Input = {
			insertText: vi.fn(async () => {
				operations.push("prompt_mutated");
				promptInserted = true;
			}),
			dispatchMouseEvent: vi.fn(async ({ type }: { type: string }) => {
				if (type === "mouseReleased") submitted = true;
			}),
			dispatchKeyEvent: vi.fn(async () => undefined),
		};
		const client = {
			Runtime,
			Input,
			Page: {},
			close: vi.fn(async () => undefined),
		};
		const host = "127.0.0.1";
		const port = 45007;
		const targetId = "gemini-target-1";
		const authority = createProviderSessionAuthority({
			services: { gemini: { identity: { email: "operator@example.com" } } },
		});
		const context = {
			providerId: "gemini" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/gemini",
			browserProcessId: 1234,
			browserTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		};
		const onProof = vi.fn();
		const closeSession = vi.fn(async () => undefined);
		const options: BrowserProviderListOptions = {
			host,
			port,
			configuredUrl: targetUrl,
			useProviderSession: true,
			providerSession: {
				providerId: "gemini",
				key: `gemini:${host}:${port}:${targetUrl}`,
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
				close: closeSession,
			},
			providerSessionAuthorization: {
				authority,
				context,
				expectation: authority.resolveExpectation(context),
				onProof,
			},
		};
		const progress: string[] = [];

		const result = await createGeminiAdapter().runPrompt?.(
			{
				prompt,
				completionMode: "prompt_submitted",
				targetUrl,
				onProgress: (event) => {
					progress.push(event.phase);
				},
			},
			options,
		);

		expect(result).toEqual({
			text: "",
			conversationId: "gemini-conversation-1",
			url: conversationUrl,
			tabTargetId: targetId,
		});
		expect(onProof).toHaveBeenCalledTimes(1);
		expect(progress).toEqual([
			"browser_target_attached",
			"provider_auth_preflight",
			"gemini_surface_ready",
			"capability_selected",
			"composer_ready",
			"prompt_inserted",
			"send_attempted",
			"send_attempted",
			"submitted_state_observed",
		]);
		expect(Input.insertText).toHaveBeenCalledWith({ text: prompt });
		expect(operations).toEqual(["identity_observed", "prompt_mutated"]);
		expect(closeSession).not.toHaveBeenCalled();
		expect(client.close).not.toHaveBeenCalled();
	});

	test("closes an owned Gemini connection when prompt mutation fails after authorization", async () => {
		const prompt = "Gemini cleanup prompt";
		const targetUrl = "https://gemini.google.com/app";
		const operations: string[] = [];
		const failure = new Error("Gemini prompt insertion failed");
		const Runtime = {
			enable: vi.fn(async () => undefined),
			evaluate: vi.fn(async ({ expression }: { expression: string }) => {
				if (expression === "location.href") {
					return { result: { value: targetUrl } };
				}
				if (expression.includes("/^Google Account:/i")) {
					operations.push("identity_observed");
					return {
						result: { value: "Google Account: Operator (operator@example.com)" },
					};
				}
				if (expression.includes("use your precise location")) {
					return { result: { value: { present: false } } };
				}
				if (expression.includes("const responseSelectors")) {
					return {
						result: {
							value: {
								href: targetUrl,
								conversationId: null,
								composerText: "",
								userTexts: [],
								assistantTexts: [],
								hasActiveAvatarSpinner: false,
								hasGeneratedMedia: false,
								hasStopControl: false,
								isGenerating: false,
							},
						},
					};
				}
				if (expression.includes("deleteByCut")) {
					return { result: { value: { ok: true, mode: "contenteditable" } } };
				}
				return { result: { value: true } };
			}),
		};
		const client = {
			Runtime,
			Input: {
				insertText: vi.fn(async () => {
					operations.push("prompt_mutation_attempted");
					throw failure;
				}),
				dispatchMouseEvent: vi.fn(async () => undefined),
				dispatchKeyEvent: vi.fn(async () => undefined),
			},
			Page: { enable: vi.fn(async () => undefined) },
			close: vi.fn(async () => undefined),
		};
		geminiRunPromptMocks.connectToChromeTarget.mockResolvedValueOnce(client);
		const host = "127.0.0.1";
		const port = 45008;
		const targetId = "gemini-target-owned";
		const authority = createProviderSessionAuthority({
			services: { gemini: { identity: { email: "operator@example.com" } } },
		});
		const context = {
			providerId: "gemini" as const,
			auracallRuntimeProfile: "default",
			browserProfile: "default",
			sourceBrowserProfile: "Default",
			managedBrowserProfile: "/managed/default/gemini",
			browserProcessId: 1234,
			browserTargetId: targetId,
			devtoolsHost: host,
			devtoolsPort: port,
		};

		await expect(
			createGeminiAdapter().runPrompt?.(
				{ prompt, completionMode: "prompt_submitted", targetUrl },
				{
					host,
					port,
					tabTargetId: targetId,
					tabUrl: targetUrl,
					providerSessionAuthorization: {
						authority,
						context,
						expectation: authority.resolveExpectation(context),
					},
				},
			),
		).rejects.toBe(failure);
		expect(operations).toEqual(["identity_observed", "prompt_mutation_attempted"]);
		expect(client.close).toHaveBeenCalledTimes(1);
	});

	test("fails closed on prompt attachments before connecting to Gemini", async () => {
		await expect(
			createGeminiAdapter().runPrompt?.({
				prompt: "Summarize the attachment",
				attachments: [
					{ path: "/tmp/gemini.txt", displayPath: "gemini.txt", sizeBytes: 12 },
				],
			}),
		).rejects.toThrowError("Gemini browser prompt execution does not support attachments.");
	});
});
