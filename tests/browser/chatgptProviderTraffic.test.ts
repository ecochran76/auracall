import { runInNewContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";

import { probeChatgptRateLimitWarning } from "../../src/browser/chatgptProviderTraffic.js";

describe("ChatGPT provider traffic warning probe", () => {
	test("classifies the visible too-many-requests dialog without clicking it", async () => {
		const evaluate = vi.fn(async () => ({
			result: { value: "Too many requests You’re making requests too quickly." },
		}));

		await expect(probeChatgptRateLimitWarning({ evaluate })).resolves.toEqual({
			classification: "rate-limit",
			reason: "Too many requests You’re making requests too quickly.",
		});
		expect(evaluate).toHaveBeenCalledOnce();
	});

	test("detects native conversation-list HTTP429 without a visible warning", async () => {
		const evaluate = vi.fn(async ({ expression }: { expression: string }) => ({
			result: {
				value: runInNewContext(expression, {
					document: { querySelectorAll: () => [] },
					location: {
						origin: "https://chatgpt.com",
						href: "https://chatgpt.com/c/test-conversation",
					},
					// biome-ignore lint/style/useNamingConvention: VM global must use the platform constructor name.
					URL,
					performance: {
						getEntriesByType: () => [
							{
								name: "https://chatgpt.com/backend-api/conversations?offset=0",
								responseStatus: 429,
								responseEnd: 100,
							},
						],
					},
				}),
			},
		}));
		await expect(probeChatgptRateLimitWarning({ evaluate })).resolves.toEqual({
			classification: "rate-limit",
			reason: "ChatGPT conversation requests returned HTTP 429.",
		});
		expect(evaluate).toHaveBeenCalledOnce();
	});

	test.each([
		[
			"later successful conversation response",
			[
				{
					name: "https://chatgpt.com/backend-api/conversations?offset=0",
					responseStatus: 429,
					responseEnd: 100,
				},
				{
					name: "https://chatgpt.com/backend-api/conversations?offset=30",
					responseStatus: 200,
					responseEnd: 200,
				},
			],
		],
		[
			"foreign-origin response",
			[
				{
					name: "https://example.com/backend-api/conversations",
					responseStatus: 429,
					responseEnd: 100,
				},
			],
		],
		[
			"unrelated same-origin response",
			[{ name: "https://chatgpt.com/api/v2/rum", responseStatus: 429, responseEnd: 100 }],
		],
	])("does not block on %s", async (_name, resources) => {
		const evaluate = vi.fn(async ({ expression }: { expression: string }) => ({
			result: {
				value: runInNewContext(expression, {
					document: { querySelectorAll: () => [] },
					location: {
						origin: "https://chatgpt.com",
						href: "https://chatgpt.com/c/test-conversation",
					},
					// biome-ignore lint/style/useNamingConvention: VM global must use the platform constructor name.
					URL,
					performance: { getEntriesByType: () => resources },
				}),
			},
		}));
		await expect(probeChatgptRateLimitWarning({ evaluate })).resolves.toBeNull();
	});

	test("returns null when no blocking surface is visible", async () => {
		await expect(
			probeChatgptRateLimitWarning({
				evaluate: vi.fn(async () => ({ result: { value: null } })),
			}),
		).resolves.toBeNull();
	});
});
