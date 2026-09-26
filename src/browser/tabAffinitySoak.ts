import type { BrowserTabConcurrencyStatus } from "./tabConcurrencyRuntime.js";

export const TAB_AFFINITY_SOAK_MINIMUM_MS = 24 * 60 * 60 * 1000;
export const TAB_AFFINITY_SOAK_TARGET_MAXIMUM_MS = 48 * 60 * 60 * 1000;

export interface TabAffinitySoakIdentity {
	runtimeProfileId: string;
	expectedIdentity: string;
	sourceCommit: string;
	installedVersion: string;
}

export interface TabAffinitySoakSnapshot {
	observedAt: string;
	status: BrowserTabConcurrencyStatus;
}

export interface TabAffinitySoakEvaluation {
	accepted: boolean;
	hardStops: string[];
}

export interface TabAffinitySoakEvent {
	schemaVersion: 1;
	receiptId: string;
	type: "started" | "snapshot" | "finished";
	observedAt: string;
	identity: TabAffinitySoakIdentity;
	snapshot: BrowserTabConcurrencyStatus;
	evaluation: TabAffinitySoakEvaluation;
	elapsedMs: number;
	targetWindowMs: { minimum: number; maximum: number };
}

export function evaluateTabAffinitySoakSnapshot(input: {
	baseline: BrowserTabConcurrencyStatus;
	current: BrowserTabConcurrencyStatus;
}): TabAffinitySoakEvaluation {
	const { baseline, current } = input;
	const hardStops: string[] = [];
	if (current.mode !== "tab-affinity" || !current.enabled) hardStops.push("tab-affinity-disabled");
	if (current.providerWarnings.active > 0) hardStops.push("provider-warning-active");
	if (current.leaseStates.lost > 0) hardStops.push("lost-lease");
	if (current.attention.outcomeUnknown > 0) hardStops.push("outcome-unknown");
	if (current.attention.restartUnverified > 0) hardStops.push("restart-unverified");
	if (current.attention.expiredIdle > 0) hardStops.push("expired-idle");
	const baselineNonCrawlerNavigations = nonCrawlerNavigationCount(baseline);
	const currentNonCrawlerNavigations = nonCrawlerNavigationCount(current);
	if (currentNonCrawlerNavigations > baselineNonCrawlerNavigations) {
		hardStops.push("navigation-churn");
	}
	if (current.targetActions.reloads > baseline.targetActions.reloads)
		hardStops.push("reload-churn");
	if (current.targetActions.focuses > baseline.targetActions.focuses) hardStops.push("focus-churn");
	return { accepted: hardStops.length === 0, hardStops };
}

function nonCrawlerNavigationCount(status: BrowserTabConcurrencyStatus): number {
	return (
		status.targetActionsByWorkload.conversations.navigations +
		status.targetActionsByWorkload.newConversations.navigations +
		status.targetActionsByWorkload.ephemeral.navigations
	);
}

export function createTabAffinitySoakEvent(input: {
	receiptId: string;
	type: TabAffinitySoakEvent["type"];
	identity: TabAffinitySoakIdentity;
	startedAt: string;
	snapshot: TabAffinitySoakSnapshot;
	baseline: BrowserTabConcurrencyStatus;
}): TabAffinitySoakEvent {
	const elapsedMs = Math.max(
		0,
		Date.parse(input.snapshot.observedAt) - Date.parse(input.startedAt),
	);
	const evaluation = evaluateTabAffinitySoakSnapshot({
		baseline: input.baseline,
		current: input.snapshot.status,
	});
	if (input.type === "finished" && elapsedMs < TAB_AFFINITY_SOAK_MINIMUM_MS) {
		evaluation.hardStops.push("minimum-window-not-elapsed");
		evaluation.accepted = false;
	}
	return {
		schemaVersion: 1,
		receiptId: input.receiptId,
		type: input.type,
		observedAt: input.snapshot.observedAt,
		identity: input.identity,
		snapshot: input.snapshot.status,
		evaluation,
		elapsedMs,
		targetWindowMs: {
			minimum: TAB_AFFINITY_SOAK_MINIMUM_MS,
			maximum: TAB_AFFINITY_SOAK_TARGET_MAXIMUM_MS,
		},
	};
}
