import { describe, expect, test } from "vitest";

import {
	buildLiveFollowWarningEvidence,
	classifyLiveFollowFailureEffectState,
	classifyLiveFollowWarning,
} from "../../src/accountMirror/configuredLiveFollowAffinity.js";

describe("configured live-follow affinity", () => {
	test("settles read-only failures without an outcome-unknown fence", () => {
		expect(classifyLiveFollowFailureEffectState()).toBe("settled");
	});

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

	test("builds privacy-bounded warning evidence without provider identifiers", () => {
		expect(
			buildLiveFollowWarningEvidence({ reason: "Too many requests; temporarily limited." }, 7),
		).toEqual({
			classifierVersion: "chatgpt-visible-blocking-surface-v1",
			visibleSummary: "Too many requests; temporarily limited.",
			sourceTargetClass: "leased-page",
			openTargetCount: 7,
			resourcePathClasses: [],
		});
	});
});
