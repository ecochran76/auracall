import { describe, expect, test, vi } from "vitest";

import { probeVisibleChatgptRateLimitWarning } from "../../src/browser/chatgptProviderTraffic.js";

describe("ChatGPT provider traffic warning probe", () => {
	test("classifies the visible too-many-requests dialog without clicking it", async () => {
		const evaluate = vi.fn(async () => ({
			result: { value: "Too many requests You’re making requests too quickly." },
		}));

		await expect(probeVisibleChatgptRateLimitWarning({ evaluate })).resolves.toEqual({
			classification: "rate-limit",
			reason: "Too many requests You’re making requests too quickly.",
		});
		expect(evaluate).toHaveBeenCalledOnce();
	});

	test("returns null when no blocking surface is visible", async () => {
		await expect(
			probeVisibleChatgptRateLimitWarning({
				evaluate: vi.fn(async () => ({ result: { value: null } })),
			}),
		).resolves.toBeNull();
	});
});
