import type { BrowserTabLease } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";

export interface LiveFollowLeasedTabVisitInput {
	conversationId: string;
	targetId: string;
	host: string;
	port: number;
	abortSignal?: AbortSignal;
}

export async function runLiveFollowTraversalOnLeasedTab<TResult>(input: {
	lease: BrowserTabLease;
	operationId: string;
	endpoint: {
		host: string;
		port: number;
	};
	conversationIds: readonly string[];
	visitConversation: (input: LiveFollowLeasedTabVisitInput) => Promise<TResult>;
	abortSignal?: AbortSignal;
}): Promise<TResult[]> {
	assertLiveFollowLease(input.lease, input.operationId);
	if (
		!input.endpoint.host.trim() ||
		!Number.isInteger(input.endpoint.port) ||
		input.endpoint.port <= 0
	) {
		throw new Error(
			"Live-follow leased traversal requires an exact DevTools host and positive integer port.",
		);
	}

	const results: TResult[] = [];
	for (const rawConversationId of input.conversationIds) {
		throwIfAborted(input.abortSignal);
		const conversationId = rawConversationId.trim();
		if (!conversationId) {
			throw new Error("Live-follow leased traversal received an empty conversation ID.");
		}
		results.push(
			await input.visitConversation({
				conversationId,
				targetId: input.lease.targetId,
				host: input.endpoint.host,
				port: input.endpoint.port,
				abortSignal: input.abortSignal,
			}),
		);
	}
	return results;
}

function assertLiveFollowLease(lease: BrowserTabLease, operationId: string): void {
	if (lease.state !== "active") {
		throw new Error(`Tab lease ${lease.leaseId} is ${lease.state}, not active.`);
	}
	if (lease.ownerOperationId !== operationId) {
		throw new Error(
			`Tab lease ${lease.leaseId} is owned by operation ${lease.ownerOperationId ?? "(none)"}, not ${operationId}.`,
		);
	}
	if (lease.workload.kind !== "live-follow") {
		throw new Error(`A ${lease.workload.kind} tab lease cannot run live-follow traversal.`);
	}
	if (lease.workload.operationId !== operationId) {
		throw new Error(
			`Live-follow tab lease ${lease.leaseId} belongs to workload ${lease.workload.operationId}, not ${operationId}.`,
		);
	}
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (!signal?.aborted) return;
	throw signal.reason instanceof Error
		? signal.reason
		: new Error("Live-follow traversal aborted.");
}
