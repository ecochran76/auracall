import type {
	BrowserProfileControlClaim,
	BrowserTabLease,
	BrowserTabLeaseRegistry,
	TabLeaseClaim,
	TabLeaseScope,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";

export interface LiveFollowBrowserEndpoint {
	host: string;
	port: number;
	managedBrowserProfile: string;
}

export interface LiveFollowCrawlerTab {
	lease: BrowserTabLease;
	claim: TabLeaseClaim;
	endpoint: LiveFollowBrowserEndpoint;
}

export async function acquireLiveFollowCrawlerTab(input: {
	registry: BrowserTabLeaseRegistry;
	scope: TabLeaseScope;
	operationId: string;
	targetUrl: string;
	idleTtlMs: number;
	absoluteTtlMs: number;
	profileControlTtlMs?: number;
	now?: () => Date;
	resolveExistingEndpoint: () => Promise<LiveFollowBrowserEndpoint | null>;
	startBrowser: () => Promise<LiveFollowBrowserEndpoint>;
	inspectTarget: (
		endpoint: LiveFollowBrowserEndpoint,
		targetId: string,
	) => Promise<{ url: string } | null>;
	openTarget: (input: {
		host: string;
		port: number;
		url: string;
	}) => Promise<{ targetId: string; url: string }>;
	closeTarget: (input: { host: string; port: number; targetId: string }) => Promise<void>;
}): Promise<LiveFollowCrawlerTab> {
	const now = input.now ?? (() => new Date());
	const workload = { kind: "live-follow", operationId: input.operationId } as const;
	let endpoint = await input.resolveExistingEndpoint();
	const existing = await input.registry.findByWorkload(input.scope, workload);
	if (existing) {
		if (!endpoint) {
			throw new Error(
				"Live-follow crawler target cannot be verified without its browser endpoint.",
			);
		}
		assertEndpoint(endpoint, input.scope.managedBrowserProfile);
		const inspected = await input.inspectTarget(endpoint, existing.targetId);
		if (inspected && isProviderRoute(inspected.url, input.targetUrl)) {
			const acquired = await input.registry.acquire({
				scope: input.scope,
				workload,
				operationId: input.operationId,
				now: now().toISOString(),
			});
			if (!acquired.ok) {
				throw new Error(`Live-follow crawler lease acquisition failed: ${acquired.conflict.kind}.`);
			}
			const adopted = await input.registry.recordTargetAction({
				claim: acquired.value.claim,
				action: "adopted",
				occurredAt: now().toISOString(),
				idleTtlMs: input.idleTtlMs,
			});
			if (!adopted.ok) {
				throw new Error(
					`Live-follow crawler adoption accounting failed: ${adopted.conflict.kind}.`,
				);
			}
			return { ...adopted.value, endpoint };
		}
		if (inspected) {
			const lost = await input.registry.markLost({
				leaseId: existing.leaseId,
				expectedRevision: existing.revision,
				now: now().toISOString(),
				reason: "identity-conflict",
			});
			if (!lost.ok) throw new Error(`Live-follow crawler loss failed: ${lost.conflict.kind}.`);
			throw new Error("Live-follow crawler target is live on a different provider route.");
		}
		await releaseMissingCrawler(input.registry, existing, now().toISOString());
	}

	if (!endpoint) {
		let claim: BrowserProfileControlClaim | null = null;
		const control = await input.registry.acquireProfileControl({
			scope: input.scope,
			kind: "browser-startup",
			operationId: input.operationId,
			now: now().toISOString(),
			ttlMs: input.profileControlTtlMs ?? 60_000,
		});
		if (!control.acquired) {
			throw new Error(`Live-follow browser startup control denied: ${control.reason}.`);
		}
		claim = control.claim;
		let startupError: unknown = null;
		try {
			endpoint = await input.startBrowser();
		} catch (error) {
			startupError = error;
		}
		const released = await input.registry.releaseProfileControl({
			claim,
			releasedAt: now().toISOString(),
		});
		if (startupError) throw startupError;
		if (!released) throw new Error("Live-follow browser startup control release failed.");
	}
	if (!endpoint) throw new Error("Live-follow browser startup returned no endpoint.");
	assertEndpoint(endpoint, input.scope.managedBrowserProfile);
	const target = await input.openTarget({
		host: endpoint.host,
		port: endpoint.port,
		url: input.targetUrl,
	});
	const reserved = await input.registry.reserve({
		scope: input.scope,
		targetId: requireNonEmpty(target.targetId, "targetId"),
		workload,
		operationId: input.operationId,
		now: now().toISOString(),
		idleTtlMs: input.idleTtlMs,
		absoluteTtlMs: input.absoluteTtlMs,
		targetFingerprint: requireNonEmpty(target.url, "targetUrl"),
	});
	if (!reserved.ok) {
		await input.closeTarget({
			host: endpoint.host,
			port: endpoint.port,
			targetId: requireNonEmpty(target.targetId, "targetId"),
		});
		throw new Error(`Live-follow crawler lease reservation failed: ${reserved.conflict.kind}.`);
	}
	const created = await input.registry.recordTargetAction({
		claim: reserved.value.claim,
		action: "target-created",
		occurredAt: now().toISOString(),
		idleTtlMs: input.idleTtlMs,
	});
	if (!created.ok) {
		throw new Error(`Live-follow crawler creation accounting failed: ${created.conflict.kind}.`);
	}
	return { ...created.value, endpoint };
}

async function releaseMissingCrawler(
	registry: BrowserTabLeaseRegistry,
	lease: BrowserTabLease,
	now: string,
): Promise<void> {
	const lost = await registry.markLost({
		leaseId: lease.leaseId,
		expectedRevision: lease.revision,
		now,
		reason: "target-missing",
	});
	if (!lost.ok) throw new Error(`Live-follow missing crawler loss failed: ${lost.conflict.kind}.`);
	const released = await registry.releaseLost({
		leaseId: lost.value.leaseId,
		expectedRevision: lost.value.revision,
		now,
		disposition: "already-missing",
	});
	if (!released.ok) {
		throw new Error(`Live-follow missing crawler release failed: ${released.conflict.kind}.`);
	}
}

function assertEndpoint(endpoint: LiveFollowBrowserEndpoint, managedBrowserProfile: string): void {
	if (!endpoint.host.trim() || !Number.isInteger(endpoint.port) || endpoint.port <= 0) {
		throw new Error("Live-follow crawler requires an exact DevTools endpoint.");
	}
	if (endpoint.managedBrowserProfile !== managedBrowserProfile) {
		throw new Error("Live-follow crawler endpoint belongs to a different managed browser profile.");
	}
}

function isProviderRoute(actualUrl: string, expectedUrl: string): boolean {
	try {
		return new URL(actualUrl).hostname === new URL(expectedUrl).hostname;
	} catch {
		return false;
	}
}

function requireNonEmpty(value: string, name: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`${name} must not be empty.`);
	return normalized;
}
