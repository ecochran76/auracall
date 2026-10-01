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
	"top_level_document",
	"snapshot_refresh",
	"artifact_resolution",
	"download_attempt",
]);

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

function sumEffects(
	effects: readonly AccountMirrorProviderTrafficEffect[],
	kind: AccountMirrorProviderTrafficEffectKind,
): number {
	return effects.reduce((total, effect) => total + (effect.kind === kind ? effect.count : 0), 0);
}
