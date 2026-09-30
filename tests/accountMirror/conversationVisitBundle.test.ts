import { describe, expect, it } from "vitest";
import {
	createConversationVisitBundle,
	snapshotAccountMirrorVisitTelemetry,
} from "../../src/accountMirror/conversationVisitBundle.js";

describe("account-mirror conversation visit bundle", () => {
	it("binds detail and artifact refs to one physical visit receipt", () => {
		const bundle = createConversationVisitBundle({
			conversationId: "conversation_fixture",
			freshnessEpoch: "epoch_fixture",
			context: {
				conversationId: "conversation_fixture",
				provider: "chatgpt",
				messages: [{ role: "user", text: "fixture" }],
				artifacts: [
					{ id: "artifact_1", title: "Artifact", kind: "download", uri: "fixture://artifact" },
				],
				files: [{ id: "file_1", name: "fixture.txt", provider: "chatgpt", source: "conversation" }],
				sources: [],
			},
			before: snapshotAccountMirrorVisitTelemetry({
				cdpCalls: { "Target.createTarget": 2, "Page.navigate": 4, "Page.reload": 1 },
			}),
			after: snapshotAccountMirrorVisitTelemetry({
				cdpCalls: { "Target.createTarget": 3, "Page.navigate": 5, "Page.reload": 1 },
			}),
		});

		expect(bundle).toMatchObject({
			object: "account_mirror_conversation_visit_bundle",
			conversationId: "conversation_fixture",
			freshnessEpoch: "epoch_fixture",
			detail: { observed: true, messageCount: 1 },
			route: { state: "routeable" },
			physicalVisit: { targetsCreated: 1, navigations: 1, reloads: 0 },
		});
		expect(bundle.artifacts).toHaveLength(1);
		expect(bundle.files).toHaveLength(1);
	});

	it("fails closed when one logical row navigates more than once", () => {
		expect(() =>
			createConversationVisitBundle({
				conversationId: "conversation_fixture",
				freshnessEpoch: "epoch_fixture",
				context: null,
				before: snapshotAccountMirrorVisitTelemetry({ cdpCalls: { "Page.navigate": 2 } }),
				after: snapshotAccountMirrorVisitTelemetry({ cdpCalls: { "Page.navigate": 4 } }),
			}),
		).toThrow("2 navigations were observed for one row");
	});
});
