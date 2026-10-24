import type { ProviderInteractionRecord } from "../../packages/browser-service/src/service/interactionLedger.js";
import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import {
	resolveGrokOperationsPerMinute,
	resolveGrokOperationBudgetWaitMs,
	resolveGrokBackendRequestsPerMinute,
	resolveGrokBackendRequestBudgetWaitMs,
} from "../runtime/grokTrafficLimits.js";

export interface GrokTrafficControlStatus {
	maxOperationsPerMinute: number | null;
	maxBackendRequestsPerMinute: number | null;
	backendRequestBudgetWaitMs: number;
	usedBackendRequestsLastMinute: number;
	remainingBackendRequests: number | null;
	backendAdmissionEnabled: boolean;
	operationBudgetWaitMs: number;
	usedOperationsLastMinute: number;
	remainingOperations: number | null;
	nextEligibleAt: string | null;
	blockedReason:
		| "provider-warning"
		| "minute-interaction-limit"
		| "minute-backend-request-limit"
		| null;
}

export function summarizeGrokTrafficControls(input: {
	config: Record<string, unknown>;
	interactions: ProviderInteractionRecord[];
	warnings: Array<{ provider: string; tenantKey: string; cooldownUntil: string | null }>;
	now: Date;
	managedScopes?: Array<{
		runtimeProfileId: string;
		managedBrowserProfile: string;
		tenantKey: string;
		service: string;
	}>;
}): GrokTrafficControlStatus {
	const profile =
		typeof input.config.auracallProfile === "string" ? input.config.auracallProfile : "default";
	const account = resolveConfiguredServiceAccountId(input.config, {
		serviceId: "grok",
		runtimeProfileId: profile,
	});
	const fallbackAccounts = new Set(
		[
			...input.interactions
				.filter((item) => item.scope.provider === "grok" && item.scope.runtimeProfileId === profile)
				.map((item) => ({ ...item.scope, service: item.scope.provider })),
			...(input.managedScopes ?? []).filter(
				(scope) => scope.service === "grok" && scope.runtimeProfileId === profile,
			),
		]
			.filter(
				(scope) =>
					scope.tenantKey === `managed-browser:${scope.managedBrowserProfile}`.toLowerCase(),
			)
			.map((scope) => scope.tenantKey),
	);
	const matchesAccount = (tenantKey: string) =>
		account ? tenantKey === account : fallbackAccounts.has(tenantKey);
	const configuredLimit = resolveGrokOperationsPerMinute(input.config, profile);
	const recent = input.interactions.filter(
		(item) =>
			item.scope.provider === "grok" &&
			matchesAccount(item.scope.tenantKey) &&
			Date.parse(item.startedAt ?? item.reservedAt) >= input.now.getTime() - 60_000,
	);
	const limits = [configuredLimit, ...recent.map((item) => item.maxInteractionsPerMinute)].filter(
		(n): n is number => typeof n === "number",
	);
	const limit = limits.length ? Math.min(...limits) : null;
	const counted = recent
		.filter(
			(item) =>
				item.interactionClass !== "backend-request" &&
				(item.state === "reserved" ||
					item.state === "started" ||
					((item.state === "settled" || item.state === "frozen") && item.effectState !== "none")),
		)
		.sort(
			(a, b) => Date.parse(a.startedAt ?? a.reservedAt) - Date.parse(b.startedAt ?? b.reservedAt),
		);
	const requests = recent
		.filter(
			(item) =>
				item.interactionClass === "backend-request" &&
				(item.state === "reserved" ||
					item.state === "started" ||
					((item.state === "settled" || item.state === "frozen") && item.effectState !== "none")),
		)
		.sort(
			(a, b) => Date.parse(a.startedAt ?? a.reservedAt) - Date.parse(b.startedAt ?? b.reservedAt),
		);
	const configuredBackendLimit = resolveGrokBackendRequestsPerMinute(input.config, profile);
	const backendLimits = [
		configuredBackendLimit,
		...recent.map((item) => item.maxBackendRequestsPerMinute),
	].filter((n): n is number => typeof n === "number");
	const backendLimit = backendLimits.length ? Math.min(...backendLimits) : null;
	const backendLimited = backendLimit !== null && requests.length >= backendLimit;
	const backendRecord =
		backendLimited && backendLimit !== null ? requests[requests.length - backendLimit] : undefined;
	const backendUntil = backendRecord
		? new Date(
				Date.parse(backendRecord.startedAt ?? backendRecord.reservedAt) + 60_001,
			).toISOString()
		: null;
	const warning = input.warnings.filter(
		(item) => item.provider === "grok" && matchesAccount(item.tenantKey),
	);
	const limited = limit !== null && counted.length >= limit;
	const warningUntil = warning.some((item) => item.cooldownUntil === null)
		? null
		: warning.length
			? new Date(
					Math.max(...warning.map((item) => Date.parse(item.cooldownUntil ?? ""))),
				).toISOString()
			: null;
	const capacityRecord = limited && limit !== null ? counted[counted.length - limit] : undefined;
	const capacityUntil = capacityRecord
		? new Date(
				Date.parse(capacityRecord.startedAt ?? capacityRecord.reservedAt) + 60_001,
			).toISOString()
		: null;
	const eligibilityTimes = [warningUntil, capacityUntil, backendUntil].filter(
		(value): value is string => value !== null,
	);
	return {
		maxBackendRequestsPerMinute: backendLimit,
		backendRequestBudgetWaitMs: resolveGrokBackendRequestBudgetWaitMs(input.config, profile),
		usedBackendRequestsLastMinute: requests.length,
		remainingBackendRequests:
			backendLimit === null ? null : Math.max(0, backendLimit - requests.length),
		backendAdmissionEnabled: configuredBackendLimit !== undefined,
		maxOperationsPerMinute: limit,
		operationBudgetWaitMs: resolveGrokOperationBudgetWaitMs(input.config, profile),
		usedOperationsLastMinute: counted.length,
		remainingOperations: limit === null ? null : Math.max(0, limit - counted.length),
		nextEligibleAt:
			warning.length && warningUntil === null
				? null
				: eligibilityTimes.length
					? new Date(Math.max(...eligibilityTimes.map(Date.parse))).toISOString()
					: null,
		blockedReason: warning.length
			? "provider-warning"
			: limited
				? "minute-interaction-limit"
				: backendLimited
					? "minute-backend-request-limit"
					: null,
	};
}
