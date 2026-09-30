import type {
	ConversationArtifact,
	ConversationContext,
	FileRef,
} from "../browser/providers/domain.js";

export interface AccountMirrorVisitTelemetrySnapshot {
	cdpCalls: Readonly<Record<string, number>>;
}

export interface AccountMirrorPhysicalVisitReceipt {
	object: "account_mirror_physical_visit_receipt";
	version: 1;
	targetsCreated: number;
	navigations: number;
	reloads: number;
}

export interface ConversationVisitBundle {
	object: "account_mirror_conversation_visit_bundle";
	version: 1;
	conversationId: string;
	freshnessEpoch: string;
	detail: {
		observed: boolean;
		complete: boolean;
		messageCount: number;
		fingerprint: string | null;
	};
	artifacts: ConversationArtifact[];
	files: FileRef[];
	route: {
		state: "routeable" | "unknown";
	};
	physicalVisit: AccountMirrorPhysicalVisitReceipt;
}

export function createConversationVisitBundle(input: {
	conversationId: string;
	freshnessEpoch: string;
	context: ConversationContext | null;
	detailComplete?: boolean;
	before: AccountMirrorVisitTelemetrySnapshot;
	after: AccountMirrorVisitTelemetrySnapshot;
}): ConversationVisitBundle {
	const physicalVisit = createPhysicalVisitReceipt(input.before, input.after);
	if (physicalVisit.navigations > 1) {
		throw new Error(
			`Conversation visit invariant violated: ${physicalVisit.navigations} navigations were observed for one row.`,
		);
	}
	return {
		object: "account_mirror_conversation_visit_bundle",
		version: 1,
		conversationId: input.conversationId,
		freshnessEpoch: input.freshnessEpoch,
		detail: {
			observed: input.context !== null,
			complete: input.context !== null && input.detailComplete !== false,
			messageCount: input.context?.messages.length ?? 0,
			fingerprint: input.context ? fingerprintContext(input.context) : null,
		},
		artifacts: [...(input.context?.artifacts ?? [])],
		files: [...(input.context?.files ?? [])],
		route: { state: input.context ? "routeable" : "unknown" },
		physicalVisit,
	};
}

function fingerprintContext(context: ConversationContext): string {
	return `sha256:${createHash("sha256")
		.update(
			JSON.stringify({
				conversationId: context.conversationId,
				messageCount: context.messages.length,
				artifactIds: (context.artifacts ?? []).map((item) => item.id),
				fileIds: (context.files ?? []).map((item) => item.id),
			}),
		)
		.digest("hex")
		.slice(0, 32)}`;
}

export function snapshotAccountMirrorVisitTelemetry(
	value:
		| {
				cdpCalls?: Readonly<Record<string, number>> | null;
		  }
		| null
		| undefined,
): AccountMirrorVisitTelemetrySnapshot {
	return { cdpCalls: { ...(value?.cdpCalls ?? {}) } };
}

function createPhysicalVisitReceipt(
	before: AccountMirrorVisitTelemetrySnapshot,
	after: AccountMirrorVisitTelemetrySnapshot,
): AccountMirrorPhysicalVisitReceipt {
	return {
		object: "account_mirror_physical_visit_receipt",
		version: 1,
		targetsCreated: delta(before, after, "Target.createTarget"),
		navigations: delta(before, after, "Page.navigate"),
		reloads: delta(before, after, "Page.reload"),
	};
}

function delta(
	before: AccountMirrorVisitTelemetrySnapshot,
	after: AccountMirrorVisitTelemetrySnapshot,
	key: string,
): number {
	return Math.max(0, Math.floor((after.cdpCalls[key] ?? 0) - (before.cdpCalls[key] ?? 0)));
}

import { createHash } from "node:crypto";
