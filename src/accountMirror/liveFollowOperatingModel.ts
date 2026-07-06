export const LIVE_FOLLOW_COLLECTOR_PHASES = [
	"identity",
	"projects",
	"root-conversations",
	"project-conversations",
	"chatgpt-library",
	"detail-inventory",
	"merge-persisted-catalog",
	"complete",
] as const;

export type LiveFollowCollectorPhase = (typeof LIVE_FOLLOW_COLLECTOR_PHASES)[number];

export const LIVE_FOLLOW_ROUTINE_PHASES = [
	...LIVE_FOLLOW_COLLECTOR_PHASES,
	"materialization",
	"account-library",
] as const;

export type LiveFollowRoutinePhase = (typeof LIVE_FOLLOW_ROUTINE_PHASES)[number];

export const LIVE_FOLLOW_ROUTINE_PHASE_STATUSES = [
	"pending",
	"running",
	"yielded",
	"complete",
	"skipped",
	"blocked",
] as const;

export type LiveFollowRoutinePhaseStatus = (typeof LIVE_FOLLOW_ROUTINE_PHASE_STATUSES)[number];

export const LIVE_FOLLOW_ROUTINE_DECISION_STATES = [
	"disabled",
	"unsupported",
	"missing_identity",
	"provider_guarded",
	"operator_preempted",
	"running",
	"queued",
	"paused",
	"attention_needed",
	"backfilling",
	"steady_follow",
	"materialization_pending",
	"account_library_catchup",
	"caught_up",
	"eligible",
	"delayed",
] as const;

export type LiveFollowRoutineDecisionState = (typeof LIVE_FOLLOW_ROUTINE_DECISION_STATES)[number];

export const LIVE_FOLLOW_MATERIALIZATION_BACKLOG_STATES = [
	"none",
	"metadata_current_backlog",
	"materialization_required",
	"inventory_unknown",
] as const;

export type LiveFollowMaterializationBacklogState =
	(typeof LIVE_FOLLOW_MATERIALIZATION_BACKLOG_STATES)[number];

export function isLiveFollowCollectorPhase(value: unknown): value is LiveFollowCollectorPhase {
	return includesString(LIVE_FOLLOW_COLLECTOR_PHASES, value);
}

export function isLiveFollowRoutinePhase(value: unknown): value is LiveFollowRoutinePhase {
	return includesString(LIVE_FOLLOW_ROUTINE_PHASES, value);
}

export function isLiveFollowRoutinePhaseStatus(
	value: unknown,
): value is LiveFollowRoutinePhaseStatus {
	return includesString(LIVE_FOLLOW_ROUTINE_PHASE_STATUSES, value);
}

export function isLiveFollowRoutineDecisionState(
	value: unknown,
): value is LiveFollowRoutineDecisionState {
	return includesString(LIVE_FOLLOW_ROUTINE_DECISION_STATES, value);
}

export function normalizeLiveFollowRoutineDecisionState(
	value: unknown,
	fallback: LiveFollowRoutineDecisionState = "delayed",
): LiveFollowRoutineDecisionState {
	return isLiveFollowRoutineDecisionState(value) ? value : fallback;
}

export function isLiveFollowMaterializationBacklogState(
	value: unknown,
): value is LiveFollowMaterializationBacklogState {
	return includesString(LIVE_FOLLOW_MATERIALIZATION_BACKLOG_STATES, value);
}

export function normalizeLiveFollowMaterializationBacklogState(
	value: unknown,
	fallback: LiveFollowMaterializationBacklogState = "inventory_unknown",
): LiveFollowMaterializationBacklogState {
	return isLiveFollowMaterializationBacklogState(value) ? value : fallback;
}

function includesString<const Values extends readonly string[]>(
	values: Values,
	value: unknown,
): value is Values[number] {
	return typeof value === "string" && values.includes(value);
}
