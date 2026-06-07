import { describe, expect, test } from "vitest";
import {
	evaluateAccountMirrorPoliteness,
	getAccountMirrorJitterMs,
	getDefaultAccountMirrorPolitenessPolicy,
} from "../../src/accountMirror/politePolicy.js";

describe("account mirror polite policy", () => {
	test("blocks mirror work when no expected identity is bound", () => {
		const decision = evaluateAccountMirrorPoliteness({
			provider: "chatgpt",
			runtimeProfileId: "default",
			browserProfileId: "default",
			nowMs: 1_000,
		});

		expect(decision).toMatchObject({
			posture: "blocked",
			reason: "expected-identity-missing",
			eligibleAtMs: null,
			delayMs: 0,
		});
	});

	test("blocks mirror work when current provider-app identity mismatches the bound identity", () => {
		const decision = evaluateAccountMirrorPoliteness({
			provider: "chatgpt",
			runtimeProfileId: "default",
			browserProfileId: "default",
			expectedIdentityKey: "ecochran76@gmail.com",
			detectedIdentityKey: "consult@polymerconsultinggroup.com",
			detectedIdentitySource: "provider-app",
			detectedIdentityObservedAtMs: 1_000,
			detectedIdentityConfidence: "authoritative",
			nowMs: 1_000,
		});

		expect(decision).toMatchObject({
			posture: "blocked",
			reason: "identity-mismatch",
			expectedIdentityKey: "ecochran76@gmail.com",
			detectedIdentityKey: "consult@polymerconsultinggroup.com",
			identityEvidence: expect.objectContaining({
				source: "provider-app",
				confidence: "authoritative",
				recheckable: false,
				repairStatus: "current_mismatch",
			}),
		});
	});

	test("allows stale malformed ChatGPT identity mismatch state to recheck", () => {
		const decision = evaluateAccountMirrorPoliteness({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			browserProfileId: "wsl-chrome-2",
			expectedIdentityKey: "consult@polymerconsultinggroup.com",
			detectedIdentityKey: "consulting pcg pro",
			lastFailureAtMs: Date.parse("2026-05-31T08:02:50.016Z"),
			consecutiveFailureCount: 179,
			nowMs: Date.parse("2026-06-07T13:04:07.494Z"),
		});

		expect(decision).toMatchObject({
			posture: "eligible",
			reason: "eligible",
			expectedIdentityKey: "consult@polymerconsultinggroup.com",
			detectedIdentityKey: "consulting pcg pro",
			identityEvidence: expect.objectContaining({
				source: "unknown",
				confidence: "unknown",
				recheckable: true,
				repairStatus: "stale_mismatch_recheck",
				previousDetectedIdentityKey: "consulting pcg pro",
			}),
		});
	});

	test("ignores prompt-like Grok at-text as detected identity evidence", () => {
		const decision = evaluateAccountMirrorPoliteness({
			provider: "grok",
			runtimeProfileId: "default",
			browserProfileId: "default",
			expectedIdentityKey: "ez86944@gmail.com",
			detectedIdentityKey: "@google calendar what's on my schedule today?",
			nowMs: 1_000,
		});

		expect(decision).toMatchObject({
			posture: "eligible",
			reason: "eligible",
			expectedIdentityKey: "ez86944@gmail.com",
			detectedIdentityKey: null,
		});
	});

	test("adds deterministic jitter to routine mirror refreshes", () => {
		const policy = getDefaultAccountMirrorPolitenessPolicy("chatgpt");
		const jitterMs = getAccountMirrorJitterMs({
			provider: "chatgpt",
			runtimeProfileId: "default",
			browserProfileId: "default",
			expectedIdentityKey: "ecochran76@gmail.com",
			anchorMs: 10_000,
			jitterMaxMs: policy.jitterMaxMs,
		});
		const decision = evaluateAccountMirrorPoliteness({
			provider: "chatgpt",
			runtimeProfileId: "default",
			browserProfileId: "default",
			expectedIdentityKey: "ecochran76@gmail.com",
			lastSuccessAtMs: 10_000,
			nowMs: 10_000 + policy.minIntervalMs,
		});

		expect(jitterMs).toBeGreaterThanOrEqual(0);
		expect(jitterMs).toBeLessThanOrEqual(policy.jitterMaxMs);
		expect(decision).toMatchObject({
			posture: jitterMs > 0 ? "delay" : "eligible",
			reason: jitterMs > 0 ? "minimum-interval" : "eligible",
			eligibleAtMs: 10_000 + policy.minIntervalMs + jitterMs,
		});
		expect(decision.limits.jitterMs).toBe(jitterMs);
	});

	test("uses a narrower explicit-refresh interval without removing jitter", () => {
		const policy = getDefaultAccountMirrorPolitenessPolicy("grok");
		const decision = evaluateAccountMirrorPoliteness({
			provider: "grok",
			runtimeProfileId: "auracall-grok-auto",
			browserProfileId: "default",
			expectedIdentityKey: "ez86944@gmail.com",
			lastAttemptAtMs: 50_000,
			explicitRefresh: true,
			nowMs: 50_000 + policy.explicitRefreshMinIntervalMs - 1,
		});

		expect(decision.posture).toBe("delay");
		expect(decision.reason).toBe("minimum-interval");
		expect(decision.eligibleAtMs).toBeGreaterThanOrEqual(
			50_000 + policy.explicitRefreshMinIntervalMs,
		);
	});

	test("operator reconciliation can bypass routine minimum interval without bypassing guards", () => {
		const decision = evaluateAccountMirrorPoliteness({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-2",
			browserProfileId: "wsl-chrome-2",
			expectedIdentityKey: "user@example.com",
			lastAttemptAtMs: 50_000,
			explicitRefresh: true,
			ignoreMinimumInterval: true,
			nowMs: 55_000,
		});

		expect(decision).toMatchObject({
			posture: "eligible",
			reason: "eligible",
			eligibleAtMs: 55_000,
		});

		expect(
			evaluateAccountMirrorPoliteness({
				provider: "gemini",
				runtimeProfileId: "default",
				browserProfileId: "default",
				expectedIdentityKey: "user@example.com",
				lastAttemptAtMs: 50_000,
				explicitRefresh: true,
				ignoreMinimumInterval: true,
				nowMs: 55_000,
				providerGuard: {
					state: "manual_clear_required",
					kind: "captcha",
					summary: "Provider guard requires manual clearance.",
					detectedAtMs: 50_000,
				},
			}),
		).toMatchObject({
			posture: "blocked",
			reason: "provider-manual-clear-required",
		});
	});

	test("backs off after failures before considering routine interval freshness", () => {
		const decision = evaluateAccountMirrorPoliteness({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			browserProfileId: "default",
			expectedIdentityKey: "ecochran76@gmail.com",
			lastSuccessAtMs: 1_000,
			lastFailureAtMs: 20_000,
			consecutiveFailureCount: 2,
			nowMs: 20_000 + 60_000,
		});

		expect(decision).toMatchObject({
			posture: "delay",
			reason: "failure-backoff",
		});
		expect(decision.limits.failureCooldownMs).toBe(4 * 60_000);
	});

	test("keeps ChatGPT failure backoff short enough for operator-driven reconciliation tests", () => {
		const policy = getDefaultAccountMirrorPolitenessPolicy("chatgpt");
		const decision = evaluateAccountMirrorPoliteness({
			provider: "chatgpt",
			runtimeProfileId: "wsl-chrome-3",
			browserProfileId: "wsl-chrome-3",
			expectedIdentityKey: "user@example.com",
			lastFailureAtMs: 20_000,
			consecutiveFailureCount: 4,
			nowMs: 20_000 + 9 * 60_000,
			explicitRefresh: true,
		});

		expect(policy.failureBaseCooldownMs).toBe(2 * 60_000);
		expect(policy.failureMaxCooldownMs).toBe(10 * 60_000);
		expect(decision).toMatchObject({
			posture: "delay",
			reason: "failure-backoff",
			eligibleAtMs: 20_000 + 10 * 60_000,
		});
		expect(decision.limits.failureCooldownMs).toBe(10 * 60_000);
	});

	test("applies long hard-stop cooldowns for bot-sensitive provider pages", () => {
		const policy = getDefaultAccountMirrorPolitenessPolicy("gemini");
		const decision = evaluateAccountMirrorPoliteness({
			provider: "gemini",
			runtimeProfileId: "auracall-gemini-pro",
			browserProfileId: "default",
			expectedIdentityKey: "ecochran76@gmail.com",
			providerHardStopAtMs: 100_000,
			nowMs: 100_000 + 60_000,
		});

		expect(decision).toMatchObject({
			posture: "delay",
			reason: "provider-hard-stop",
			eligibleAtMs: 100_000 + policy.hardStopCooldownMs,
		});
	});

	test("carries conservative page and row budgets in every decision", () => {
		const decision = evaluateAccountMirrorPoliteness({
			provider: "chatgpt",
			runtimeProfileId: "default",
			browserProfileId: "default",
			expectedIdentityKey: "ecochran76@gmail.com",
			nowMs: 1_000,
		});

		expect(decision.posture).toBe("eligible");
		expect(decision.limits.maxPageReadsPerCycle).toBe(4);
		expect(decision.limits.maxConversationRowsPerCycle).toBe(30);
		expect(decision.limits.maxArtifactRowsPerCycle).toBe(24);
		expect(decision.limits.maxBrowserInteractionsPerMinute).toBe(30);
	});

	test("uses slower Gemini defaults for bot-sensitive live follow", () => {
		const policy = getDefaultAccountMirrorPolitenessPolicy("gemini");
		const decision = evaluateAccountMirrorPoliteness({
			provider: "gemini",
			runtimeProfileId: "default",
			browserProfileId: "default",
			expectedIdentityKey: "ecochran76@gmail.com",
			nowMs: 1_000,
		});

		expect(policy.minIntervalMs).toBe(18 * 60 * 60_000);
		expect(policy.explicitRefreshMinIntervalMs).toBe(2 * 60_000);
		expect(policy.jitterMaxMs).toBe(60_000);
		expect(policy.failureBaseCooldownMs).toBe(2 * 60_000);
		expect(policy.failureMaxCooldownMs).toBe(10 * 60_000);
		expect(decision.limits.maxBrowserInteractionsPerMinute).toBe(6);
		expect(decision.limits.maxPageReadsPerCycle).toBe(4);
		expect(decision.limits.maxConversationRowsPerCycle).toBe(80);
		expect(decision.limits.maxArtifactRowsPerCycle).toBe(24);
	});
});
