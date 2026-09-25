import type {
	BrowserTabLease,
	BrowserTabLeaseRegistry,
	TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import {
	retireExpiredTabLeases,
	type TabLeaseRetirementEndpoint,
	type TabLeaseRetirementOutcome,
} from "../../packages/browser-service/src/service/tabLeaseRetirement.js";

export function retireExpiredChatgptTabLeases(input: {
	registry: BrowserTabLeaseRegistry;
	scope: TabLeaseScope;
	endpoint: TabLeaseRetirementEndpoint | null;
	now?: () => Date;
	inspectTarget: (
		endpoint: TabLeaseRetirementEndpoint,
		targetId: string,
	) => Promise<{ url: string } | null>;
	closeTarget: (endpoint: TabLeaseRetirementEndpoint, targetId: string) => Promise<void>;
}): Promise<TabLeaseRetirementOutcome[]> {
	return retireExpiredTabLeases({
		registry: input.registry,
		scope: input.scope,
		now: input.now,
		resolveEndpoint: async () => input.endpoint,
		inspectTarget: input.inspectTarget,
		closeTarget: input.closeTarget,
		targetMatchesLease: chatgptTargetMatchesLease,
	});
}

export function chatgptTargetMatchesLease(
	lease: BrowserTabLease,
	target: { url: string },
): boolean {
	if (!lease.targetFingerprint) return false;
	try {
		const actual = new URL(target.url);
		const expected = new URL(lease.targetFingerprint);
		if (actual.hostname !== expected.hostname) return false;
		if (lease.workload.kind === "conversation") {
			const match = actual.pathname.match(/\/c\/([^/?#]+)/);
			return Boolean(match?.[1] && decodeURIComponent(match[1]) === lease.workload.conversationId);
		}
		if (lease.workload.kind === "live-follow") return true;
		return normalizeRoute(actual) === normalizeRoute(expected);
	} catch {
		return false;
	}
}

function normalizeRoute(url: URL): string {
	return `${url.origin}${url.pathname.replace(/\/+$/, "") || "/"}${url.search}`;
}
