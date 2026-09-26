import type {
	BrowserProfileControlClaim,
	BrowserTabLease,
	BrowserTabLeaseRegistry,
	TabLeaseClaim,
	TabLeaseScope,
	TabLeaseWorkload,
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

export interface DedicatedBrowserTabInput {
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
	listTargets?: (
		endpoint: LiveFollowBrowserEndpoint,
	) => Promise<Array<{ targetId: string; url: string }>>;
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
}

export function acquireLiveFollowCrawlerTab(
	input: DedicatedBrowserTabInput,
): Promise<LiveFollowCrawlerTab> {
	return acquireDedicatedBrowserTab(input, {
		kind: "live-follow",
		operationId: input.operationId,
	});
}

export function acquireEphemeralBrowserTab(
	input: DedicatedBrowserTabInput,
): Promise<LiveFollowCrawlerTab> {
	return acquireDedicatedBrowserTab(input, {
		kind: "ephemeral",
		operationId: input.operationId,
	});
}

async function acquireDedicatedBrowserTab(
	input: DedicatedBrowserTabInput,
	workload: TabLeaseWorkload,
): Promise<LiveFollowCrawlerTab> {
	const now = input.now ?? (() => new Date());
	let endpoint = await input.resolveExistingEndpoint();
	let startedBrowser = false;
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
			startedBrowser = true;
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
	const reusableTarget = startedBrowser ? await prepareColdStartTarget(input, endpoint) : null;
	const target =
		reusableTarget ??
		(await input.openTarget({
			host: endpoint.host,
			port: endpoint.port,
			url: input.targetUrl,
		}));
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
		if (!reusableTarget) {
			await input.closeTarget({
				host: endpoint.host,
				port: endpoint.port,
				targetId: requireNonEmpty(target.targetId, "targetId"),
			});
		}
		throw new Error(`Live-follow crawler lease reservation failed: ${reserved.conflict.kind}.`);
	}
	const provisioningAction = reusableTarget ? "adopted" : "target-created";
	const provisioned = await input.registry.recordTargetAction({
		claim: reserved.value.claim,
		action: provisioningAction,
		occurredAt: now().toISOString(),
		idleTtlMs: input.idleTtlMs,
	});
	if (!provisioned.ok) {
		const actionLabel = reusableTarget ? "adoption" : "creation";
		const accountingError = new Error(
			`Live-follow crawler ${actionLabel} accounting failed: ${provisioned.conflict.kind}.`,
		);
		const lost = await input.registry.markLost({
			leaseId: reserved.value.lease.leaseId,
			expectedRevision: reserved.value.lease.revision,
			now: now().toISOString(),
			reason: "provisioning-failed",
		});
		if (!lost.ok) {
			throw new AggregateError(
				[accountingError, new Error(`Crawler rollback fence failed: ${lost.conflict.kind}.`)],
				"Live-follow crawler accounting and rollback fencing both failed.",
			);
		}
		try {
			await input.closeTarget({
				host: endpoint.host,
				port: endpoint.port,
				targetId: target.targetId,
			});
		} catch (closeError) {
			throw new AggregateError(
				[accountingError, closeError],
				"Live-follow crawler accounting failed and its lost target could not be closed.",
			);
		}
		const released = await input.registry.releaseLost({
			leaseId: lost.value.leaseId,
			expectedRevision: lost.value.revision,
			now: now().toISOString(),
			disposition: "closed",
		});
		if (!released.ok) {
			throw new AggregateError(
				[accountingError, new Error(`Crawler rollback release failed: ${released.conflict.kind}.`)],
				"Live-follow crawler accounting failed and its closed lease could not be released.",
			);
		}
		throw accountingError;
	}
	return { ...provisioned.value, endpoint };
}

async function prepareColdStartTarget(
	input: DedicatedBrowserTabInput,
	endpoint: LiveFollowBrowserEndpoint,
): Promise<{ targetId: string; url: string } | null> {
	if (!input.listTargets) return null;
	const ownedTargetIds = new Set(
		(await input.registry.list())
			.filter((lease) => lease.state !== "released")
			.map((lease) => lease.targetId),
	);
	const unowned = (await input.listTargets(endpoint)).filter(
		(target) => Boolean(target.targetId.trim()) && !ownedTargetIds.has(target.targetId),
	);
	const compatible = unowned.filter((target) => isProviderRoute(target.url, input.targetUrl));
	if (compatible.length > 1) {
		throw new Error("Live-follow browser startup returned multiple compatible unowned targets.");
	}
	if (compatible[0]) return compatible[0];
	if (unowned.length > 1) {
		throw new Error("Live-follow browser startup returned multiple incompatible unowned targets.");
	}
	const disposable = unowned[0];
	if (!disposable) return null;
	await input.closeTarget({
		host: endpoint.host,
		port: endpoint.port,
		targetId: disposable.targetId,
	});
	if (await input.inspectTarget(endpoint, disposable.targetId)) {
		throw new Error("Live-follow browser startup target remained present after close.");
	}
	return null;
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
