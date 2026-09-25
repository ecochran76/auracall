import { describe, expect, test } from "vitest";

import { classifyLiveFollowWarning } from "../../src/accountMirror/configuredLiveFollowAffinity.js";

describe("configured live-follow affinity", () => {
	test("projects an Account Mirror census warning into the aggregate warning taxonomy", () => {
		const error = Object.assign(new Error("Requests too quickly"), {
			details: {
				providerGuard: {
					kind: "requests-too-quickly",
					summary: "ChatGPT requests-too-quickly warning detected.",
				},
			},
		});

		expect(classifyLiveFollowWarning(error)).toEqual({
			classification: "rate-limit",
			reason: "ChatGPT requests-too-quickly warning detected.",
		});
	});
});
