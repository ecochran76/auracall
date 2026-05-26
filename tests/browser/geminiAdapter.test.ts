import { describe, expect, test } from "vitest";
import {
	canReuseGeminiConversationSurfaceForTarget,
	classifyGeminiBlockingState,
	extractGeminiIdentityFromLabel,
	geminiUrlMatchesPreference,
	normalizeGeminiConversationHistoryLimit,
	resolveGeminiConversationRailTargetUrl,
	selectPreferredGeminiTarget,
	shouldHydrateGeminiConversationHistory,
} from "../../src/browser/providers/geminiAdapter.js";

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
});
