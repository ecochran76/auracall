import type { Conversation } from "../browser/providers/domain.js";
import {
	type AccountMirrorFrontierAction,
	normalizeAccountMirrorConversationWorkState,
} from "./changeFrontierState.js";

export interface AccountMirrorChangeFrontierMetrics {
	version: 1;
	indexRows: number;
	actions: Record<AccountMirrorFrontierAction | "unplanned", number>;
	physical: {
		visits: number;
		navigations: number;
		reloads: number;
		snapshotRefreshes: number;
		artifactResolutions: number;
		downloads: number;
		duplicates: number;
	};
	deferredRows: number;
	amplification: { physicalActions: number; perActionableRow: number };
}

export function deriveAccountMirrorChangeFrontierMetrics(
	conversations: readonly Conversation[],
): AccountMirrorChangeFrontierMetrics {
	const metrics: AccountMirrorChangeFrontierMetrics = {
		version: 1,
		indexRows: conversations.length,
		actions: { skip: 0, visit_once: 0, materialize_retained: 0, defer: 0, unplanned: 0 },
		physical: {
			visits: 0,
			navigations: 0,
			reloads: 0,
			snapshotRefreshes: 0,
			artifactResolutions: 0,
			downloads: 0,
			duplicates: 0,
		},
		deferredRows: 0,
		amplification: { physicalActions: 0, perActionableRow: 0 },
	};
	for (const conversation of conversations) {
		const metadata = isRecord(conversation.metadata) ? conversation.metadata : {};
		const state = normalizeAccountMirrorConversationWorkState(metadata.changeFrontierState);
		const action = state?.action ?? "unplanned";
		metrics.actions[action] += 1;
		if (!state) continue;
		if (state.outcome === "deferred") metrics.deferredRows += 1;
		metrics.physical.visits += state.physicalActivity.targetsCreated;
		metrics.physical.navigations += state.physicalActivity.navigations;
		metrics.physical.reloads += state.physicalActivity.reloads;
		metrics.physical.snapshotRefreshes += state.physicalActivity.snapshotRefreshes;
		metrics.physical.artifactResolutions += state.physicalActivity.artifactResolutions;
		metrics.physical.downloads += state.physicalActivity.downloads;
		metrics.physical.duplicates += state.physicalActivity.duplicates;
	}
	metrics.amplification.physicalActions =
		metrics.physical.visits +
		metrics.physical.navigations +
		metrics.physical.reloads +
		metrics.physical.snapshotRefreshes +
		metrics.physical.artifactResolutions;
	const actionableRows = metrics.actions.visit_once + metrics.actions.materialize_retained;
	metrics.amplification.perActionableRow =
		actionableRows === 0
			? 0
			: Number((metrics.amplification.physicalActions / actionableRows).toFixed(3));
	return metrics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
