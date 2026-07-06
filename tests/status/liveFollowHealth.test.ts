import { describe, expect, it } from "vitest";
import { summarizeLiveFollowMaterializationBacklog } from "../../src/status/liveFollowHealth.js";

describe("summarizeLiveFollowMaterializationBacklog", () => {
	it("reports metadata-current local backlog separately from required materialization", () => {
		expect(
			summarizeLiveFollowMaterializationBacklog({
				materializationPolicy: "metadata_only",
				mirrorCompleteness: "complete",
				assetInventory: {
					state: "complete",
					localMaterialized: { artifacts: 2, files: 1, media: 0 },
					remoteKnownMissingLocal: { artifacts: 4, files: 2, media: 0 },
					unknownOrDeferred: { artifacts: 0, files: 0, media: 0 },
				},
			}),
		).toMatchObject({
			state: "metadata_current_backlog",
			policy: "metadata_only",
			metadataCurrent: true,
			localRequired: false,
			remoteKnownMissingLocal: {
				artifacts: 4,
				files: 2,
				media: 0,
				total: 6,
			},
		});
	});

	it("marks missing local assets as required when the active policy asks for them", () => {
		expect(
			summarizeLiveFollowMaterializationBacklog({
				materializationPolicy: "full_missing_assets",
				mirrorCompleteness: "complete",
				assetInventory: {
					state: "complete",
					localMaterialized: { artifacts: 0, files: 0, media: 0 },
					remoteKnownMissingLocal: { artifacts: 1, files: 0, media: 1 },
					unknownOrDeferred: { artifacts: 0, files: 0, media: 0 },
				},
			}),
		).toMatchObject({
			state: "materialization_required",
			policy: "full_missing_assets",
			metadataCurrent: true,
			localRequired: true,
			remoteKnownMissingLocal: {
				artifacts: 1,
				files: 0,
				media: 1,
				total: 2,
			},
		});
	});
});
