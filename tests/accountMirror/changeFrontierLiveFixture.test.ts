import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

type Observation = {
	case: string;
	logicalRows: number;
	logicalActiveInteractions: number | null;
	physicalRequests: number;
	topFrameNavigations: number;
	sameConversationNavigations: number;
	assetAttempts: number;
	warningDetected: boolean;
	outcome: string;
	assetPersistence?: "persistent" | "volatile";
	terminalReasonClass?: string;
	expectedAvailability?: "available" | "unavailable" | "unknown";
};

async function readFixture(): Promise<{ observations: Observation[] }> {
	return JSON.parse(
		await fs.readFile(
			new URL("../fixtures/account-mirror/issue139-live-cdp-observations.json", import.meta.url),
			"utf8",
		),
	) as { observations: Observation[] };
}

async function readCapture(fileName: string): Promise<{
	metrics: { requestCount: number; navigationCount: number };
	warning: unknown;
	events: Array<{ kind: string; route?: string }>;
}> {
	return JSON.parse(
		await fs.readFile(new URL(`../../docs/dev/notes/${fileName}`, import.meta.url), "utf8"),
	) as {
		metrics: { requestCount: number; navigationCount: number };
		warning: unknown;
		events: Array<{ kind: string; route?: string }>;
	};
}

describe("Issue 139 live-CDP frontier fixture", () => {
	it("is derived from the retained sanitized CDP captures", async () => {
		const { observations } = await readFixture();
		const captures = new Map([
			["detail-pass-1", await readCapture("2026-09-30-issue139-cdp-detail-pass-01.json")],
			["detail-pass-2", await readCapture("2026-09-30-issue139-cdp-detail-pass-02.json")],
			[
				"retained-reconciliation",
				await readCapture("2026-09-30-issue139-cdp-materialize-retained-02.json"),
			],
			[
				"persistent-library-file",
				await readCapture("2026-09-30-issue139-cdp-materialize-library-02.json"),
			],
			[
				"volatile-upload-terminal",
				await readCapture("2026-09-30-issue139-cdp-materialize-upload-01.json"),
			],
		]);

		for (const observation of observations) {
			const capture = captures.get(observation.case);
			expect(capture, observation.case).toBeDefined();
			expect(capture?.metrics.requestCount, observation.case).toBe(observation.physicalRequests);
			expect(capture?.metrics.navigationCount, observation.case).toBe(
				observation.topFrameNavigations,
			);
			expect(Boolean(capture?.warning), observation.case).toBe(observation.warningDetected);
			if (observation.case.startsWith("detail-pass-")) {
				expect(
					capture?.events.filter(
						(event) => event.kind === "cdp.page.navigated" && event.route === "/c/:conversation",
					).length,
					observation.case,
				).toBe(observation.sameConversationNavigations);
			}
		}
	});

	it("reproduces deterministic detail amplification across independent passes", async () => {
		const { observations } = await readFixture();
		const detailPasses = observations.filter((entry) => entry.case.startsWith("detail-pass-"));

		expect(detailPasses).toHaveLength(2);
		expect(detailPasses.map((entry) => entry.logicalRows)).toEqual([1, 1]);
		expect(detailPasses.map((entry) => entry.logicalActiveInteractions)).toEqual([2, 2]);
		expect(detailPasses.map((entry) => entry.sameConversationNavigations)).toEqual([3, 3]);
		expect(detailPasses.every((entry) => entry.physicalRequests > 800)).toBe(true);
		expect(detailPasses.every((entry) => entry.warningDetected === false)).toBe(true);
	});

	it("proves retained materialization performs provider work before actionability", async () => {
		const { observations } = await readFixture();
		const retained = observations.find((entry) => entry.case === "retained-reconciliation");

		expect(retained).toMatchObject({
			logicalRows: 1,
			physicalRequests: 239,
			topFrameNavigations: 1,
			assetAttempts: 0,
			outcome: "skipped",
			warningDetected: false,
		});
	});

	it("keeps persistent retrieval failure distinct from volatile terminal unavailability", async () => {
		const { observations } = await readFixture();
		const persistent = observations.find((entry) => entry.case === "persistent-library-file");
		const volatile = observations.find((entry) => entry.case === "volatile-upload-terminal");

		expect(persistent).toMatchObject({
			assetPersistence: "persistent",
			outcome: "retrieval_failed",
			expectedAvailability: "unknown",
			assetAttempts: 1,
		});
		expect(volatile).toMatchObject({
			assetPersistence: "volatile",
			terminalReasonClass: "tile_not_found",
			expectedAvailability: "unavailable",
			physicalRequests: 0,
			assetAttempts: 0,
		});
	});
});
