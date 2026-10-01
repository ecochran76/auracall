export type AccountMirrorProviderTrafficPhase =
	| "bootstrap"
	| "index"
	| "detail"
	| "materialization"
	| "cleanup"
	| "unattributed";

export type AccountMirrorProviderTrafficEffectKind =
	| "target_create"
	| "route_visit"
	| "page_navigate"
	| "reload"
	| "top_level_document"
	| "frame_navigation"
	| "snapshot_refresh"
	| "artifact_resolution"
	| "download_attempt"
	| "network_request"
	| "chatgpt_request"
	| "third_party_request";

export interface AccountMirrorProviderTrafficEffect {
	phase: AccountMirrorProviderTrafficPhase;
	kind: AccountMirrorProviderTrafficEffectKind;
	count: number;
}

export interface AccountMirrorProviderTrafficObservation {
	object: "account_mirror_provider_traffic_observation";
	version: 1;
	scope: "bounded_steady_follow_pass";
	observedAt: string;
	logicalInteractions: number;
	effects: AccountMirrorProviderTrafficEffect[];
	requestKinds?: Readonly<Record<string, number>>;
	warningObserved: boolean;
}

export interface AccountMirrorProviderTrafficBudget {
	phase: Exclude<AccountMirrorProviderTrafficPhase, "unattributed">;
	kind: AccountMirrorProviderTrafficEffectKind;
	limit: number;
}

export interface AccountMirrorProviderTrafficPlan {
	object: "account_mirror_provider_traffic_plan";
	version: 1;
	budgets: AccountMirrorProviderTrafficBudget[];
}

export interface AccountMirrorProviderTrafficReconciliation {
	object: "account_mirror_provider_traffic_reconciliation";
	version: 1;
	totals: {
		pageNavigations: number;
		topLevelDocuments: number;
		frameNavigations: number;
		networkRequests: number;
	};
	observedEffects: AccountMirrorProviderTrafficEffect[];
	unattributedControllableEffects: Array<{
		kind: AccountMirrorProviderTrafficEffectKind;
		count: number;
	}>;
	budgetViolations: Array<{
		phase: Exclude<AccountMirrorProviderTrafficPhase, "unattributed">;
		kind: AccountMirrorProviderTrafficEffectKind;
		observed: number;
		limit: number;
	}>;
}

const CONTROLLABLE_EFFECTS = new Set<AccountMirrorProviderTrafficEffectKind>([
	"target_create",
	"route_visit",
	"page_navigate",
	"reload",
	"top_level_document",
	"snapshot_refresh",
	"artifact_resolution",
	"download_attempt",
]);

export class ProviderTrafficBudgetExceededError extends Error {
	constructor(
		readonly trafficPhase: AccountMirrorProviderTrafficPhase,
		readonly kind: AccountMirrorProviderTrafficEffectKind,
		readonly limit: number,
	) {
		super(`Provider traffic budget exhausted for ${trafficPhase}/${kind} at limit ${limit}.`);
		this.name = "ProviderTrafficBudgetExceededError";
	}
}

export function withAccountMirrorProviderTrafficPlan(
	governor: ProviderTrafficGovernor,
	plan: AccountMirrorProviderTrafficPlan,
): ProviderTrafficGovernor {
	const limits = new Map<string, number>();
	for (const budget of plan.budgets) {
		const key = `${budget.phase}:${budget.kind}`;
		limits.set(key, (limits.get(key) ?? 0) + Math.max(0, Math.floor(budget.limit)));
	}
	const admitted = new Map<string, number>();
	return {
		attribution: governor.attribution,
		async begin(input) {
			const kind = mutationEffectKind(input.kind);
			if (!kind) return governor.begin(input);
			const phase = input.trafficPhase ?? "unattributed";
			const key = `${phase}:${kind}`;
			const limit = limits.get(key) ?? 0;
			const next = (admitted.get(key) ?? 0) + 1;
			if (next > limit) throw new ProviderTrafficBudgetExceededError(phase, kind, limit);
			admitted.set(key, next);
			try {
				return await governor.begin(input);
			} catch (error) {
				admitted.set(key, next - 1);
				throw error;
			}
		},
	};
}

export function createAccountMirrorProviderTrafficObservation(input: {
	observedAt: string;
	logicalInteractions: number;
	mutations: readonly BrowserMutationRecord[];
	cdpEffects?: readonly AccountMirrorProviderTrafficEffect[];
	requestKinds?: Readonly<Record<string, number>>;
	warningObserved: boolean;
}): AccountMirrorProviderTrafficObservation {
	const effects: AccountMirrorProviderTrafficEffect[] = [];
	for (const mutation of input.mutations) {
		if (mutation.phase !== "complete") continue;
		const kind = mutationEffectKind(mutation.kind);
		if (!kind) continue;
		effects.push({
			phase: mutation.trafficPhase ?? "unattributed",
			kind,
			count: 1,
		});
	}
	effects.push(...(input.cdpEffects ?? []).map(normalizeEffect));
	return {
		object: "account_mirror_provider_traffic_observation",
		version: 1,
		scope: "bounded_steady_follow_pass",
		observedAt: input.observedAt,
		logicalInteractions: Math.max(0, Math.floor(input.logicalInteractions)),
		effects: aggregateEffects(effects),
		...(input.requestKinds ? { requestKinds: { ...input.requestKinds } } : {}),
		warningObserved: input.warningObserved,
	};
}

export function reconcileAccountMirrorProviderTraffic(input: {
	plan: AccountMirrorProviderTrafficPlan;
	observation: AccountMirrorProviderTrafficObservation;
}): AccountMirrorProviderTrafficReconciliation {
	const effects = input.observation.effects.map(normalizeEffect);
	const budgetViolations = collectBudgetViolations(input.plan, effects);
	return {
		object: "account_mirror_provider_traffic_reconciliation",
		version: 1,
		totals: {
			pageNavigations: sumEffects(effects, "page_navigate"),
			topLevelDocuments: sumEffects(effects, "top_level_document"),
			frameNavigations: sumEffects(effects, "frame_navigation"),
			networkRequests: sumEffects(effects, "network_request"),
		},
		observedEffects: effects,
		unattributedControllableEffects: effects
			.filter((effect) => effect.phase === "unattributed" && CONTROLLABLE_EFFECTS.has(effect.kind))
			.map(({ kind, count }) => ({ kind, count })),
		budgetViolations,
	};
}

export function assertAccountMirrorProviderTrafficReconciled(
	reconciliation: AccountMirrorProviderTrafficReconciliation,
): void {
	const unattributedCount = reconciliation.unattributedControllableEffects.reduce(
		(total, effect) => total + effect.count,
		0,
	);
	if (unattributedCount > 0) {
		throw new Error(
			`Provider traffic reconciliation failed: ${unattributedCount} unattributed controllable provider effects.`,
		);
	}
	if (reconciliation.budgetViolations.length > 0) {
		throw new Error(
			`Provider traffic reconciliation failed: ${reconciliation.budgetViolations.length} provider traffic budget violation${reconciliation.budgetViolations.length === 1 ? "" : "s"}.`,
		);
	}
}

function collectBudgetViolations(
	plan: AccountMirrorProviderTrafficPlan,
	effects: readonly AccountMirrorProviderTrafficEffect[],
): AccountMirrorProviderTrafficReconciliation["budgetViolations"] {
	const observed = new Map<
		string,
		{
			phase: Exclude<AccountMirrorProviderTrafficPhase, "unattributed">;
			kind: AccountMirrorProviderTrafficEffectKind;
			count: number;
		}
	>();
	for (const effect of effects) {
		if (effect.phase === "unattributed" || !CONTROLLABLE_EFFECTS.has(effect.kind)) continue;
		const key = `${effect.phase}:${effect.kind}`;
		const current = observed.get(key);
		observed.set(key, {
			phase: effect.phase,
			kind: effect.kind,
			count: (current?.count ?? 0) + effect.count,
		});
	}
	const limits = new Map<string, number>();
	for (const budget of plan.budgets) {
		const key = `${budget.phase}:${budget.kind}`;
		limits.set(key, (limits.get(key) ?? 0) + Math.max(0, Math.floor(budget.limit)));
	}
	return [...observed.entries()]
		.filter(([key, effect]) => effect.count > (limits.get(key) ?? 0))
		.map(([key, effect]) => ({
			phase: effect.phase,
			kind: effect.kind,
			observed: effect.count,
			limit: limits.get(key) ?? 0,
		}));
}

function normalizeEffect(
	effect: AccountMirrorProviderTrafficEffect,
): AccountMirrorProviderTrafficEffect {
	return {
		phase: effect.phase,
		kind: effect.kind,
		count: Math.max(0, Math.floor(effect.count)),
	};
}

function mutationEffectKind(
	kind: BrowserMutationRecord["kind"],
): AccountMirrorProviderTrafficEffectKind | null {
	if (kind === "navigate" || kind === "location-assign") return "page_navigate";
	if (kind === "reload") return "reload";
	if (kind === "target-open-or-reuse") return "target_create";
	if (kind === "in-page-click") return "route_visit";
	return null;
}

function aggregateEffects(
	effects: readonly AccountMirrorProviderTrafficEffect[],
): AccountMirrorProviderTrafficEffect[] {
	const aggregated = new Map<string, AccountMirrorProviderTrafficEffect>();
	for (const rawEffect of effects) {
		const effect = normalizeEffect(rawEffect);
		const key = `${effect.phase}:${effect.kind}`;
		const previous = aggregated.get(key);
		aggregated.set(key, { ...effect, count: (previous?.count ?? 0) + effect.count });
	}
	return [...aggregated.values()];
}

function sumEffects(
	effects: readonly AccountMirrorProviderTrafficEffect[],
	kind: AccountMirrorProviderTrafficEffectKind,
): number {
	return effects.reduce((total, effect) => total + (effect.kind === kind ? effect.count : 0), 0);
}

import type { BrowserMutationRecord } from "../../packages/browser-service/src/service/mutationDispatcher.js";
import type { ProviderTrafficGovernor } from "../../packages/browser-service/src/service/providerTrafficGovernor.js";
