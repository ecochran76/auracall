import { describe, expect, test } from "vitest";

import {
	createLibraryInventoryDiagnosticsRecorder,
	type LibraryInventoryCleanupPhase,
	type LibraryInventoryStage,
} from "../../src/browser/libraryInventoryDiagnostics.js";

describe("Library inventory diagnostics", () => {
	test("keeps a capped closed-vocabulary timeline without sensitive values", () => {
		let tick = 0;
		const recorder = createLibraryInventoryDiagnosticsRecorder(
			() => new Date(Date.UTC(2026, 8, 28, 20, 0, 0, tick++)),
		);

		for (let index = 0; index < 40; index += 1) {
			recorder.lifecycle.onStageEntered(
				index % 2 === 0 ? "service-build-list-options" : "service-provider-read",
			);
		}
		(recorder.lifecycle.onStageEntered as (stage: string) => void)(
			"https://chatgpt.com/library?target=private",
		);
		(recorder.lifecycle.onCleanupPhase as (phase: string) => void)("account@example.com");
		recorder.lifecycle.onCleanupPhase("provider-abort-requested");
		recorder.lifecycle.onCleanupPhase("provider-abort-requested");

		const snapshot = recorder.snapshot();

		expect(snapshot.timeline).toHaveLength(32);
		expect(snapshot.lastStage).toBe("service-provider-read");
		expect(snapshot.cleanupPhase).toBe("provider-abort-requested");
		expect(
			snapshot.timeline.filter(
				(event) => event.kind === "cleanup" && event.phase === "provider-abort-requested",
			),
		).toHaveLength(1);
		expect(JSON.stringify(snapshot)).not.toContain("chatgpt.com");
		expect(JSON.stringify(snapshot)).not.toContain("account@example.com");
	});

	test("exposes typed stage and cleanup callbacks", () => {
		const stage: LibraryInventoryStage = "dom-inventory";
		const phase: LibraryInventoryCleanupPhase = "affinity-settlement-settled";
		const recorder = createLibraryInventoryDiagnosticsRecorder();

		recorder.lifecycle.onStageEntered(stage);
		recorder.lifecycle.onCleanupPhase(phase);

		expect(recorder.snapshot()).toMatchObject({
			lastStage: stage,
			cleanupPhase: phase,
		});
	});
});
