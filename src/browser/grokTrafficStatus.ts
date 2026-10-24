import type { ProviderInteractionRecord } from "../../packages/browser-service/src/service/interactionLedger.js";
import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import {
	resolveGrokOperationsPerMinute,
	resolveGrokOperationBudgetWaitMs,
} from "../runtime/grokTrafficLimits.js";

export interface GrokTrafficControlStatus {
	maxOperationsPerMinute: number | null;
	operationBudgetWaitMs: number;
	usedOperationsLastMinute: number;
	remainingOperations: number | null;
	nextEligibleAt: string | null;
	blockedReason: "provider-warning" | "minute-interaction-limit" | null;
}

export function summarizeGrokTrafficControls(input: {
	config: Record<string, unknown>;
	interactions: ProviderInteractionRecord[];
	warnings: Array<{ provider: string; tenantKey: string; cooldownUntil: string | null }>;
	now: Date;
}): GrokTrafficControlStatus {
	const profile =
		typeof input.config.auracallProfile === "string" ? input.config.auracallProfile : "default";
	const account = resolveConfiguredServiceAccountId(input.config, {
		serviceId: "grok",
		runtimeProfileId: profile,
	});
	const configuredLimit = resolveGrokOperationsPerMinute(input.config, profile);
	const recent = input.interactions.filter(
		(item) =>
			item.scope.provider === "grok" &&
			item.scope.tenantKey === account &&
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
	const warning = input.warnings.filter(
		(item) => item.provider === "grok" && item.tenantKey === account,
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
	return {
		maxOperationsPerMinute: limit,
		operationBudgetWaitMs: resolveGrokOperationBudgetWaitMs(input.config, profile),
		usedOperationsLastMinute: counted.length,
		remainingOperations: limit === null ? null : Math.max(0, limit - counted.length),
		nextEligibleAt: warning.length ? warningUntil : capacityUntil,
		blockedReason: warning.length
			? "provider-warning"
			: limited
				? "minute-interaction-limit"
				: null,
	};
}
