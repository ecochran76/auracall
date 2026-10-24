import { createHash } from "node:crypto";
import type { ConversationContext } from "./domain.js";

/** Mounted cards establish observed content, never an unobserved history boundary. */
export function boundObservedGrokContext(
	context: ConversationContext,
	chunk?: { startMessageIndex?: number | null; maxMessages?: number | null },
	identity: { projectId?: string; botId?: string } = {},
	observation?: { totalMessages: number; fingerprint: string },
): ConversationContext {
	const start = Math.max(0, Math.floor(chunk?.startMessageIndex ?? 0));
	const limit = Math.max(1, Math.floor(chunk?.maxMessages ?? Math.max(1, context.messages.length)));
	const total = observation?.totalMessages ?? context.messages.length;
	if (start > total)
		throw new Error(
			"Grok observed content changed before the continuation cursor; restart the detail read.",
		);
	const end = Math.min(total, start + limit);
	// biome-ignore lint/nursery/noUnnecessaryConditions: observation is optional for unsliced callers.
	const localStart = observation ? 0 : start;
	// biome-ignore lint/nursery/noUnnecessaryConditions: observation is optional for unsliced callers.
	const localEnd = observation ? limit : end;
	return {
		...context,
		messages: context.messages.slice(localStart, localEnd),
		sources: context.sources
			?.filter(
				(source) =>
					source.messageIndex == null ||
					(source.messageIndex >= localStart && source.messageIndex < localEnd),
			)
			.map((source) => ({
				...source,
				...(source.messageIndex == null ? {} : { messageIndex: source.messageIndex - localStart }),
			})),
		artifacts: context.artifacts
			?.filter(
				(artifact) =>
					artifact.messageIndex == null ||
					(artifact.messageIndex >= localStart && artifact.messageIndex < localEnd),
			)
			.map((artifact) => ({
				...artifact,
				...(artifact.messageIndex == null
					? {}
					: { messageIndex: artifact.messageIndex - localStart }),
			})),
		metadata: {
			...context.metadata,
			...identity,
			contextReadSource: "provider",
			botProvenanceSource: identity.botId ? "chats-index" : "unobserved",
			observedContent: {
				state: end === total ? "complete" : "partial",
				startMessageIndex: start,
				endMessageIndex: end,
			},
			historyCoverage: {
				state: "partial",
				source: "mounted-dom",
				reason: "history-boundary-unobserved",
				observedMessages: total,
				fingerprint:
					observation?.fingerprint ??
					createHash("sha256").update(JSON.stringify(context.messages)).digest("hex"),
			},
			accountMirrorContextChunk: {
				startMessageIndex: start,
				endMessageIndex: end,
				nextMessageIndex: end < total ? end : null,
				maxMessages: limit,
				totalMessages: null,
				complete: false,
			},
		},
	};
}

/** Persist a contiguous observed prefix; a changed mounted snapshot requires a fresh read. */
export function mergeObservedGrokContext(
	previous: ConversationContext,
	chunk: ConversationContext,
): ConversationContext {
	const cursor = chunk.metadata?.accountMirrorContextChunk as
		| { startMessageIndex?: number }
		| undefined;
	const start = cursor?.startMessageIndex ?? 0;
	if (start === 0) return chunk;
	const coverage = chunk.metadata?.historyCoverage as { fingerprint?: string } | undefined;
	const priorCoverage = previous.metadata?.historyCoverage as { fingerprint?: string } | undefined;
	if (
		previous.provider !== chunk.provider ||
		previous.conversationId !== chunk.conversationId ||
		previous.messages.length < start ||
		!coverage?.fingerprint ||
		coverage.fingerprint !== priorCoverage?.fingerprint ||
		previous.metadata?.projectId !== chunk.metadata?.projectId ||
		previous.metadata?.botId !== chunk.metadata?.botId
	) {
		throw new Error(
			"Grok detail continuation no longer matches its retained conversation snapshot; restart at message zero.",
		);
	}
	return {
		...chunk,
		messages: [...previous.messages.slice(0, start), ...chunk.messages],
		files: [
			...new Map(
				[...(previous.files ?? []), ...(chunk.files ?? [])].map((file) => [file.id, file]),
			).values(),
		],
		sources: [
			...(previous.sources ?? []).filter(
				(source) => source.messageIndex == null || source.messageIndex < start,
			),
			...(chunk.sources ?? []).map((source) => ({
				...source,
				...(source.messageIndex == null ? {} : { messageIndex: start + source.messageIndex }),
			})),
		],
		artifacts: [
			...(previous.artifacts ?? []).filter(
				(artifact) => artifact.messageIndex == null || artifact.messageIndex < start,
			),
			...(chunk.artifacts ?? []).map((artifact) => ({
				...artifact,
				...(artifact.messageIndex == null ? {} : { messageIndex: start + artifact.messageIndex }),
			})),
		],
	};
}
