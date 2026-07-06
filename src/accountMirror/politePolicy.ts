import {
	accountMirrorIdentityKeysMismatch,
	normalizeAccountMirrorIdentityKey,
	normalizeAccountMirrorProviderIdentityKey,
} from "./tenantBinding.js";

export type AccountMirrorProvider = "chatgpt" | "gemini" | "grok";

export type AccountMirrorPolitenessPosture = "eligible" | "delay" | "blocked";

export type AccountMirrorDelayReason =
	| "eligible"
	| "already-running"
	| "already-queued"
	| "expected-identity-missing"
	| "identity-mismatch"
	| "provider-manual-clear-required"
	| "provider-guard-cooldown"
	| "provider-hard-stop"
	| "provider-cooldown"
	| "minimum-interval"
	| "failure-backoff";

export type AccountMirrorIdentityEvidenceSource =
	| "provider-app"
	| "chrome-google"
	| "display-name-plan"
	| "configured"
	| "legacy"
	| "unknown";

export type AccountMirrorIdentityEvidenceConfidence =
	| "authoritative"
	| "diagnostic"
	| "legacy"
	| "unknown";

export type AccountMirrorProviderGuardKind =
	| "google-sorry"
	| "captcha"
	| "cloudflare"
	| "account-auth"
	| "human-verification"
	| "unknown";

export type AccountMirrorProviderGuardState = {
	state: "manual_clear_required" | "cooldown";
	kind: AccountMirrorProviderGuardKind;
	summary: string;
	detectedAtMs: number;
	clearedAtMs?: number | null;
	cooldownUntilMs?: number | null;
	url?: string | null;
	action?: string | null;
};

export interface AccountMirrorProviderPolitenessPolicy {
	provider: AccountMirrorProvider;
	minIntervalMs: number;
	explicitRefreshMinIntervalMs: number;
	jitterMaxMs: number;
	failureBaseCooldownMs: number;
	failureMaxCooldownMs: number;
	hardStopCooldownMs: number;
	maxBrowserInteractionsPerMinute: number;
	maxPageReadsPerCycle: number;
	maxConversationRowsPerCycle: number;
	maxArtifactRowsPerCycle: number;
	freshFrontierThreshold: number;
	conversationReadCooldownMs: number;
	pageRefreshCooldownMs: number;
	renavigationCooldownMs: number;
}

export interface AccountMirrorPolitenessInput {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	expectedIdentityKey?: string | null;
	detectedIdentityKey?: string | null;
	detectedIdentitySource?: AccountMirrorIdentityEvidenceSource | string | null;
	detectedIdentityObservedAtMs?: number | null;
	detectedIdentityConfidence?: AccountMirrorIdentityEvidenceConfidence | string | null;
	lastAttemptAtMs?: number | null;
	lastSuccessAtMs?: number | null;
	lastFailureAtMs?: number | null;
	consecutiveFailureCount?: number | null;
	providerCooldownUntilMs?: number | null;
	providerHardStopAtMs?: number | null;
	providerGuard?: AccountMirrorProviderGuardState | null;
	queued?: boolean;
	running?: boolean;
	explicitRefresh?: boolean;
	ignoreMinimumInterval?: boolean;
	ignoreFailureBackoff?: boolean;
	nowMs?: number;
	policy?: Partial<AccountMirrorProviderPolitenessPolicy>;
}

export interface AccountMirrorPolitenessDecision {
	posture: AccountMirrorPolitenessPosture;
	reason: AccountMirrorDelayReason;
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId: string | null;
	expectedIdentityKey: string | null;
	detectedIdentityKey: string | null;
	identityEvidence: {
		source: AccountMirrorIdentityEvidenceSource;
		confidence: AccountMirrorIdentityEvidenceConfidence;
		observedAtMs: number | null;
		recheckable: boolean;
		repairStatus: "none" | "stale_mismatch_recheck" | "current_mismatch";
		previousDetectedIdentityKey: string | null;
		currentDetectedIdentityKey: string | null;
	};
	eligibleAtMs: number | null;
	delayMs: number;
	limits: {
		minIntervalMs: number;
		explicitRefreshMinIntervalMs: number;
		jitterMs: number;
		jitterMaxMs: number;
		failureCooldownMs: number;
		hardStopCooldownMs: number;
		maxBrowserInteractionsPerMinute: number;
		maxPageReadsPerCycle: number;
		maxConversationRowsPerCycle: number;
		maxArtifactRowsPerCycle: number;
		freshFrontierThreshold: number;
		conversationReadCooldownMs: number;
		pageRefreshCooldownMs: number;
		renavigationCooldownMs: number;
	};
}

const HOUR_MS = 60 * 60_000;
const MINUTE_MS = 60_000;
const IDENTITY_MISMATCH_RECHECK_AFTER_MS = 12 * HOUR_MS;

const DEFAULT_POLICIES: Record<AccountMirrorProvider, AccountMirrorProviderPolitenessPolicy> = {
	chatgpt: {
		provider: "chatgpt",
		minIntervalMs: 6 * HOUR_MS,
		explicitRefreshMinIntervalMs: 10 * MINUTE_MS,
		jitterMaxMs: 20 * MINUTE_MS,
		failureBaseCooldownMs: 2 * MINUTE_MS,
		failureMaxCooldownMs: 10 * MINUTE_MS,
		hardStopCooldownMs: 12 * HOUR_MS,
		maxBrowserInteractionsPerMinute: 30,
		maxPageReadsPerCycle: 4,
		maxConversationRowsPerCycle: 30,
		maxArtifactRowsPerCycle: 24,
		freshFrontierThreshold: 3,
		conversationReadCooldownMs: 0,
		pageRefreshCooldownMs: 0,
		renavigationCooldownMs: 0,
	},
	gemini: {
		provider: "gemini",
		minIntervalMs: 18 * HOUR_MS,
		explicitRefreshMinIntervalMs: 2 * MINUTE_MS,
		jitterMaxMs: 1 * MINUTE_MS,
		failureBaseCooldownMs: 2 * MINUTE_MS,
		failureMaxCooldownMs: 10 * MINUTE_MS,
		hardStopCooldownMs: 24 * HOUR_MS,
		maxBrowserInteractionsPerMinute: 6,
		maxPageReadsPerCycle: 4,
		maxConversationRowsPerCycle: 80,
		maxArtifactRowsPerCycle: 24,
		freshFrontierThreshold: 3,
		conversationReadCooldownMs: 0,
		pageRefreshCooldownMs: 0,
		renavigationCooldownMs: 0,
	},
	grok: {
		provider: "grok",
		minIntervalMs: 8 * HOUR_MS,
		explicitRefreshMinIntervalMs: 20 * MINUTE_MS,
		jitterMaxMs: 30 * MINUTE_MS,
		failureBaseCooldownMs: 60 * MINUTE_MS,
		failureMaxCooldownMs: 12 * HOUR_MS,
		hardStopCooldownMs: 12 * HOUR_MS,
		maxBrowserInteractionsPerMinute: 12,
		maxPageReadsPerCycle: 8,
		maxConversationRowsPerCycle: 160,
		maxArtifactRowsPerCycle: 80,
		freshFrontierThreshold: 3,
		conversationReadCooldownMs: 0,
		pageRefreshCooldownMs: 0,
		renavigationCooldownMs: 0,
	},
};

function normalizeTimestamp(value: number | null | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function mergePolicy(
	provider: AccountMirrorProvider,
	override: Partial<AccountMirrorProviderPolitenessPolicy> | null | undefined,
): AccountMirrorProviderPolitenessPolicy {
	return {
		...DEFAULT_POLICIES[provider],
		...override,
		provider,
	};
}

function hashForJitter(value: string): number {
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
	}
	return hash;
}

export function getAccountMirrorJitterMs(input: {
	provider: AccountMirrorProvider;
	runtimeProfileId: string;
	browserProfileId?: string | null;
	expectedIdentityKey?: string | null;
	anchorMs?: number | null;
	jitterMaxMs: number;
}): number {
	const jitterMaxMs = Math.max(0, Math.floor(input.jitterMaxMs));
	if (jitterMaxMs === 0) return 0;
	const seed = [
		input.provider,
		input.runtimeProfileId,
		input.browserProfileId ?? "",
		normalizeAccountMirrorIdentityKey(input.expectedIdentityKey) ?? "",
		String(Math.floor((input.anchorMs ?? 0) / MINUTE_MS)),
	].join("|");
	return hashForJitter(seed) % (jitterMaxMs + 1);
}

function getFailureCooldownMs(
	policy: AccountMirrorProviderPolitenessPolicy,
	failureCount: number,
): number {
	const normalizedFailureCount = Math.max(0, Math.floor(failureCount));
	if (normalizedFailureCount <= 0) return 0;
	const multiplier = 2 ** Math.min(8, normalizedFailureCount - 1);
	return Math.min(policy.failureMaxCooldownMs, policy.failureBaseCooldownMs * multiplier);
}

function createDecision(
	input: AccountMirrorPolitenessInput,
	policy: AccountMirrorProviderPolitenessPolicy,
	reason: AccountMirrorDelayReason,
	eligibleAtMs: number | null,
	jitterMs: number,
): AccountMirrorPolitenessDecision {
	const nowMs = input.nowMs ?? Date.now();
	const failureCooldownMs = getFailureCooldownMs(policy, input.consecutiveFailureCount ?? 0);
	const delayMs = eligibleAtMs === null ? 0 : Math.max(0, eligibleAtMs - nowMs);
	const identityEvidence = classifyIdentityEvidence(input, nowMs);
	return {
		posture:
			reason === "eligible"
				? "eligible"
				: reason === "expected-identity-missing" ||
						reason === "identity-mismatch" ||
						reason === "provider-manual-clear-required"
					? "blocked"
					: "delay",
		reason,
		provider: input.provider,
		runtimeProfileId: input.runtimeProfileId,
		browserProfileId: input.browserProfileId ?? null,
		expectedIdentityKey: normalizeAccountMirrorProviderIdentityKey(
			input.provider,
			input.expectedIdentityKey,
		),
		detectedIdentityKey: normalizeAccountMirrorProviderIdentityKey(
			input.provider,
			input.detectedIdentityKey,
		),
		identityEvidence,
		eligibleAtMs,
		delayMs,
		limits: {
			minIntervalMs: policy.minIntervalMs,
			explicitRefreshMinIntervalMs: policy.explicitRefreshMinIntervalMs,
			jitterMs,
			jitterMaxMs: policy.jitterMaxMs,
			failureCooldownMs,
			hardStopCooldownMs: policy.hardStopCooldownMs,
			maxBrowserInteractionsPerMinute: policy.maxBrowserInteractionsPerMinute,
			maxPageReadsPerCycle: policy.maxPageReadsPerCycle,
			maxConversationRowsPerCycle: policy.maxConversationRowsPerCycle,
			maxArtifactRowsPerCycle: policy.maxArtifactRowsPerCycle,
			freshFrontierThreshold: policy.freshFrontierThreshold,
			conversationReadCooldownMs: policy.conversationReadCooldownMs,
			pageRefreshCooldownMs: policy.pageRefreshCooldownMs,
			renavigationCooldownMs: policy.renavigationCooldownMs,
		},
	};
}

function classifyIdentityEvidence(
	input: AccountMirrorPolitenessInput,
	nowMs: number,
): AccountMirrorPolitenessDecision["identityEvidence"] {
	const previousDetectedIdentityKey = normalizeAccountMirrorProviderIdentityKey(
		input.provider,
		input.detectedIdentityKey,
	);
	const source = normalizeIdentityEvidenceSource(input.detectedIdentitySource);
	const confidence = normalizeIdentityEvidenceConfidence(input.detectedIdentityConfidence, source);
	const observedAtMs = normalizeTimestamp(input.detectedIdentityObservedAtMs);
	const expectedIdentityKey = normalizeAccountMirrorProviderIdentityKey(
		input.provider,
		input.expectedIdentityKey,
	);
	const mismatch = accountMirrorIdentityKeysMismatch({
		provider: input.provider,
		expectedIdentityKey,
		detectedIdentityKey: previousDetectedIdentityKey,
	});
	const authoritative = source === "provider-app" && confidence === "authoritative";
	const stale = observedAtMs === null || nowMs - observedAtMs >= IDENTITY_MISMATCH_RECHECK_AFTER_MS;
	const malformed = isMalformedProviderIdentityKey(input.provider, previousDetectedIdentityKey);
	const recheckable = mismatch && (!authoritative || stale || malformed);
	return {
		source,
		confidence,
		observedAtMs,
		recheckable,
		repairStatus: mismatch ? (recheckable ? "stale_mismatch_recheck" : "current_mismatch") : "none",
		previousDetectedIdentityKey,
		currentDetectedIdentityKey: previousDetectedIdentityKey,
	};
}

function normalizeIdentityEvidenceSource(
	value: AccountMirrorPolitenessInput["detectedIdentitySource"],
): AccountMirrorIdentityEvidenceSource {
	switch (value) {
		case "provider-app":
		case "chrome-google":
		case "display-name-plan":
		case "configured":
		case "legacy":
		case "unknown":
			return value;
		default:
			return value ? "legacy" : "unknown";
	}
}

function normalizeIdentityEvidenceConfidence(
	value: AccountMirrorPolitenessInput["detectedIdentityConfidence"],
	source: AccountMirrorIdentityEvidenceSource,
): AccountMirrorIdentityEvidenceConfidence {
	switch (value) {
		case "authoritative":
		case "diagnostic":
		case "legacy":
		case "unknown":
			return value;
		default:
			if (source === "provider-app" || source === "configured") return "authoritative";
			if (source === "chrome-google" || source === "display-name-plan") return "diagnostic";
			if (source === "legacy") return "legacy";
			return "unknown";
	}
}

function isMalformedProviderIdentityKey(
	provider: AccountMirrorProvider,
	value: string | null,
): boolean {
	if (!value) return false;
	if (
		(provider === "chatgpt" || provider === "gemini") &&
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
	) {
		return true;
	}
	return false;
}

export function evaluateAccountMirrorPoliteness(
	input: AccountMirrorPolitenessInput,
): AccountMirrorPolitenessDecision {
	const policy = mergePolicy(input.provider, input.policy);
	const nowMs = input.nowMs ?? Date.now();
	const expectedIdentityKey = normalizeAccountMirrorProviderIdentityKey(
		input.provider,
		input.expectedIdentityKey,
	);
	const detectedIdentityKey = normalizeAccountMirrorProviderIdentityKey(
		input.provider,
		input.detectedIdentityKey,
	);
	const zeroJitter = 0;

	if (!expectedIdentityKey) {
		return createDecision(input, policy, "expected-identity-missing", null, zeroJitter);
	}

	const identityEvidence = classifyIdentityEvidence(input, nowMs);
	if (
		detectedIdentityKey &&
		accountMirrorIdentityKeysMismatch({
			provider: input.provider,
			expectedIdentityKey,
			detectedIdentityKey,
		}) &&
		!identityEvidence.recheckable
	) {
		return createDecision(input, policy, "identity-mismatch", null, zeroJitter);
	}

	if (input.running) {
		return createDecision(input, policy, "already-running", null, zeroJitter);
	}

	if (input.queued) {
		return createDecision(input, policy, "already-queued", null, zeroJitter);
	}

	const providerGuard = normalizeProviderGuard(input.providerGuard);
	if (providerGuard?.state === "manual_clear_required") {
		return createDecision(input, policy, "provider-manual-clear-required", null, zeroJitter);
	}
	if (providerGuard?.state === "cooldown") {
		const cooldownUntilMs = normalizeTimestamp(providerGuard.cooldownUntilMs);
		if (cooldownUntilMs && cooldownUntilMs > nowMs) {
			return createDecision(input, policy, "provider-guard-cooldown", cooldownUntilMs, zeroJitter);
		}
	}

	const providerCooldownUntilMs = normalizeTimestamp(input.providerCooldownUntilMs);
	if (providerCooldownUntilMs && providerCooldownUntilMs > nowMs) {
		return createDecision(input, policy, "provider-cooldown", providerCooldownUntilMs, zeroJitter);
	}

	const providerHardStopAtMs = normalizeTimestamp(input.providerHardStopAtMs);
	if (providerHardStopAtMs) {
		const hardStopEligibleAtMs = providerHardStopAtMs + policy.hardStopCooldownMs;
		if (hardStopEligibleAtMs > nowMs) {
			return createDecision(input, policy, "provider-hard-stop", hardStopEligibleAtMs, zeroJitter);
		}
	}

	const failureCount = Math.max(0, Math.floor(input.consecutiveFailureCount ?? 0));
	const failureCooldownMs = getFailureCooldownMs(policy, failureCount);
	const lastFailureAtMs = normalizeTimestamp(input.lastFailureAtMs);
	if (lastFailureAtMs && failureCooldownMs > 0 && input.ignoreFailureBackoff !== true) {
		const failureEligibleAtMs = lastFailureAtMs + failureCooldownMs;
		if (failureEligibleAtMs > nowMs) {
			return createDecision(input, policy, "failure-backoff", failureEligibleAtMs, zeroJitter);
		}
	}

	const lastAttemptAtMs = normalizeTimestamp(input.lastAttemptAtMs);
	const lastSuccessAtMs = normalizeTimestamp(input.lastSuccessAtMs);
	const intervalAnchorMs = Math.max(lastAttemptAtMs ?? 0, lastSuccessAtMs ?? 0);
	if (intervalAnchorMs > 0 && input.ignoreMinimumInterval !== true) {
		const intervalMs = input.explicitRefresh
			? policy.explicitRefreshMinIntervalMs
			: policy.minIntervalMs;
		const jitterMs = getAccountMirrorJitterMs({
			provider: input.provider,
			runtimeProfileId: input.runtimeProfileId,
			browserProfileId: input.browserProfileId,
			expectedIdentityKey,
			anchorMs: intervalAnchorMs,
			jitterMaxMs: policy.jitterMaxMs,
		});
		const intervalEligibleAtMs = intervalAnchorMs + intervalMs + jitterMs;
		if (intervalEligibleAtMs > nowMs) {
			return createDecision(input, policy, "minimum-interval", intervalEligibleAtMs, jitterMs);
		}
		return createDecision(input, policy, "eligible", intervalEligibleAtMs, jitterMs);
	}

	return createDecision(input, policy, "eligible", nowMs, zeroJitter);
}

function normalizeProviderGuard(
	value: AccountMirrorProviderGuardState | null | undefined,
): AccountMirrorProviderGuardState | null {
	if (!value) return null;
	const state =
		value.state === "manual_clear_required" || value.state === "cooldown" ? value.state : null;
	if (!state) return null;
	return {
		state,
		kind: value.kind ?? "unknown",
		summary: String(value.summary ?? "").trim() || "Provider guard is active.",
		detectedAtMs: normalizeTimestamp(value.detectedAtMs) ?? Date.now(),
		clearedAtMs: normalizeTimestamp(value.clearedAtMs),
		cooldownUntilMs: normalizeTimestamp(value.cooldownUntilMs),
		url: typeof value.url === "string" && value.url.trim().length > 0 ? value.url.trim() : null,
		action:
			typeof value.action === "string" && value.action.trim().length > 0
				? value.action.trim()
				: null,
	};
}

export function getDefaultAccountMirrorPolitenessPolicy(
	provider: AccountMirrorProvider,
): AccountMirrorProviderPolitenessPolicy {
	return { ...DEFAULT_POLICIES[provider] };
}
