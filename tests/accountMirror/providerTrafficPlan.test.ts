import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	type AccountMirrorProviderTrafficObservation,
	assertAccountMirrorProviderTrafficReconciled,
	reconcileAccountMirrorProviderTraffic,
} from "../../src/accountMirror/providerTrafficPlan.js";

const baseline = JSON.parse(
	readFileSync(
		new URL("../fixtures/accountMirror/issue151-provider-traffic-baseline.json", import.meta.url),
		"utf8",
	),
) as AccountMirrorProviderTrafficObservation;

describe("account-mirror provider traffic plan", () => {
	it("preserves the Issue 151 baseline while failing unexplained controllable effects", () => {
		const report = reconcileAccountMirrorProviderTraffic({
			plan: {
				object: "account_mirror_provider_traffic_plan",
				version: 1,
				budgets: [],
			},
			observation: baseline,
		});

		expect(report.totals).toEqual({
			pageNavigations: 4,
			topLevelDocuments: 11,
			frameNavigations: 56,
			networkRequests: 2146,
		});
		expect(report.unattributedControllableEffects).toEqual([
			{ kind: "page_navigate", count: 4 },
			{ kind: "top_level_document", count: 11 },
		]);
		expect(() => assertAccountMirrorProviderTrafficReconciled(report)).toThrow(
			"15 unattributed controllable provider effects",
		);
	});

	it("keeps subframe navigation and network hydration observable but non-controlling", () => {
		const report = reconcileAccountMirrorProviderTraffic({
			plan: {
				object: "account_mirror_provider_traffic_plan",
				version: 1,
				budgets: [],
			},
			observation: baseline,
		});

		expect(report.observedEffects).toContainEqual({
			phase: "unattributed",
			kind: "frame_navigation",
			count: 56,
		});
		expect(report.observedEffects).toContainEqual({
			phase: "unattributed",
			kind: "network_request",
			count: 2146,
		});
	});

	it("rejects attributed controllable effects that exceed their phase budget", () => {
		const report = reconcileAccountMirrorProviderTraffic({
			plan: {
				object: "account_mirror_provider_traffic_plan",
				version: 1,
				budgets: [
					{ phase: "detail", kind: "page_navigate", limit: 1 },
					{ phase: "detail", kind: "top_level_document", limit: 1 },
				],
			},
			observation: {
				object: "account_mirror_provider_traffic_observation",
				version: 1,
				scope: "bounded_steady_follow_pass",
				observedAt: "2026-09-30T00:00:00.000Z",
				logicalInteractions: 1,
				effects: [
					{ phase: "detail", kind: "page_navigate", count: 2 },
					{ phase: "detail", kind: "top_level_document", count: 1 },
					{ phase: "detail", kind: "network_request", count: 400 },
				],
				warningObserved: false,
			},
		});

		expect(report.budgetViolations).toEqual([
			{ phase: "detail", kind: "page_navigate", observed: 2, limit: 1 },
		]);
		expect(() => assertAccountMirrorProviderTrafficReconciled(report)).toThrow(
			"1 provider traffic budget violation",
		);
	});
});
