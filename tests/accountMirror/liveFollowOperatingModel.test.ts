import { describe, expect, it } from "vitest";
import {
	isLiveFollowCollectorPhase,
	isLiveFollowRoutinePhase,
	isLiveFollowRoutinePhaseStatus,
	LIVE_FOLLOW_COLLECTOR_PHASES,
	LIVE_FOLLOW_MATERIALIZATION_BACKLOG_STATES,
	LIVE_FOLLOW_ROUTINE_DECISION_STATES,
	LIVE_FOLLOW_ROUTINE_PHASES,
	normalizeLiveFollowMaterializationBacklogState,
	normalizeLiveFollowRoutineDecisionState,
} from "../../src/accountMirror/liveFollowOperatingModel.js";

describe("live follow operating model contract", () => {
	it("keeps the collector and routine phase vocabularies explicit", () => {
		expect(LIVE_FOLLOW_COLLECTOR_PHASES).toEqual([
			"identity",
			"projects",
			"root-conversations",
			"project-conversations",
			"chatgpt-library",
			"detail-inventory",
			"merge-persisted-catalog",
			"complete",
		]);
		expect(LIVE_FOLLOW_ROUTINE_PHASES).toEqual([
			...LIVE_FOLLOW_COLLECTOR_PHASES,
			"materialization",
			"account-library",
		]);
		expect(isLiveFollowCollectorPhase("detail-inventory")).toBe(true);
		expect(isLiveFollowCollectorPhase("materialization")).toBe(false);
		expect(isLiveFollowRoutinePhase("materialization")).toBe(true);
		expect(isLiveFollowRoutinePhase("unknown")).toBe(false);
		expect(isLiveFollowRoutinePhaseStatus("yielded")).toBe(true);
		expect(isLiveFollowRoutinePhaseStatus("waiting")).toBe(false);
	});

	it("owns routine decision states used by scheduler, status, and operator readback", () => {
		expect(LIVE_FOLLOW_ROUTINE_DECISION_STATES).toEqual([
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
		]);
		expect(normalizeLiveFollowRoutineDecisionState("operator_preempted")).toBe(
			"operator_preempted",
		);
		expect(normalizeLiveFollowRoutineDecisionState("stuck")).toBe("delayed");
		expect(normalizeLiveFollowRoutineDecisionState(null, "attention_needed")).toBe(
			"attention_needed",
		);
	});

	it("owns materialization backlog states separately from detail scrape state", () => {
		expect(LIVE_FOLLOW_MATERIALIZATION_BACKLOG_STATES).toEqual([
			"none",
			"metadata_current_backlog",
			"materialization_required",
			"inventory_unknown",
		]);
		expect(normalizeLiveFollowMaterializationBacklogState("metadata_current_backlog")).toBe(
			"metadata_current_backlog",
		);
		expect(normalizeLiveFollowMaterializationBacklogState("needs_detail")).toBe(
			"inventory_unknown",
		);
	});
});
