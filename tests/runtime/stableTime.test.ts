import { describe, expect, test } from "vitest";
import { qualifyStableTime } from "../../src/runtime/stableTime.js";

const qualified = {
	contract_version: "2.0",
	status: "qualified_live",
	bound: "finite",
	epoch: "authority",
	evidence_generation: 1,
	estimate: {
		utc: "2026-11-17T00:00:00.000Z",
		earliest_utc: "2026-11-16T23:59:59.000Z",
		latest_utc: "2026-11-17T00:00:01.000Z",
	},
};
describe("StableTime qualification", () => {
	test("retains the qualified service interval without WSL extrapolation", () => {
		expect(qualifyStableTime(qualified)).toEqual({
			utc: qualified.estimate.utc,
			earliestUtc: qualified.estimate.earliest_utc,
			latestUtc: qualified.estimate.latest_utc,
			epoch: "authority",
			evidenceGeneration: 1,
		});
	});
	test.each([
		{ ...qualified, status: "unavailable" },
		{ ...qualified, bound: "unbounded" },
		{ ...qualified, estimate: { ...qualified.estimate, earliest_utc: "2026-11-18T00:00:00Z" } },
		{ ...qualified, estimate: { ...qualified.estimate, utc: "local time" } },
	])("rejects unusable evidence instead of using local time", (value) => {
		expect(() => qualifyStableTime(value)).toThrow(/StableTime/);
	});
});
