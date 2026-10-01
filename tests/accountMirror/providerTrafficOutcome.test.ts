import { describe, expect, it } from "vitest";
import { classifyAccountMirrorProviderTrafficOutcome } from "../../src/accountMirror/providerTrafficOutcome.js";

describe("account-mirror provider traffic outcome", () => {
	it.each([
		[
			"failed",
			"Provider traffic budget exhausted for detail/page_navigate at limit 1.",
			"budget_exhausted",
		],
		["failed", "Provider traffic stopped after rate-limit: Too many requests", "warning_stop"],
		["failed", "Live-follow crawler idle transition failed: stale-claim.", "cleanup_failure"],
		["completed", null, "clean_completion"],
	] as const)("classifies %s / %s as %s", (status, message, expected) => {
		expect(
			classifyAccountMirrorProviderTrafficOutcome({
				status,
				error: message ? { message, code: null } : null,
			}),
		).toBe(expected);
	});
});
