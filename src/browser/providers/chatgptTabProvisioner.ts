import type {
	BrowserProfileControlClaim,
	BrowserTabLeaseRegistry,
	TabLeaseScope,
	TabLeaseWorkload,
} from "../../../packages/browser-service/src/service/tabLeaseRegistry.js";
import type { ProvisionedChatgptTab } from "../chatgptAffinityExecutor.js";

export interface ChatgptManagedBrowserEndpoint {
	host: string;
	port: number;
	managedBrowserProfile: string;
}

export interface ChatgptOpenedTarget {
	targetId: string;
	url: string;
}

export function createChatgptTabProvisioner(input: {
	registry: BrowserTabLeaseRegistry;
	scope: TabLeaseScope;
	workload: Extract<TabLeaseWorkload, { kind: "conversation" | "new-conversation" }>;
	operationId: string;
	targetUrl: string;
	idleTtlMs: number;
	absoluteTtlMs: number;
	profileControlTtlMs?: number;
	now?: () => Date;
	resolveExistingEndpoint: () => Promise<ChatgptManagedBrowserEndpoint | null>;
	startBrowser: () => Promise<ChatgptManagedBrowserEndpoint>;
	openTarget: (input: { host: string; port: number; url: string }) => Promise<ChatgptOpenedTarget>;
	closeTarget: (input: { host: string; port: number; targetId: string }) => Promise<void>;
}): (request: { interactionReservationId: string }) => Promise<ProvisionedChatgptTab> {
	return async (request) => {
		requireNonEmpty(request.interactionReservationId, "interactionReservationId");
		const now = input.now ?? (() => new Date());
		let endpoint = await input.resolveExistingEndpoint();
		if (!endpoint) {
			let controlClaim: BrowserProfileControlClaim | null = null;
			const acquired = await input.registry.acquireProfileControl({
				scope: input.scope,
				kind: "browser-startup",
				operationId: input.operationId,
				now: now().toISOString(),
				ttlMs: input.profileControlTtlMs ?? 60_000,
			});
			if (!acquired.acquired) {
				throw new Error(`ChatGPT browser startup control denied: ${acquired.reason}.`);
			}
			controlClaim = acquired.claim;
			let startupError: unknown = null;
			try {
				endpoint = await input.startBrowser();
			} catch (error) {
				startupError = error;
			}
			let releaseError: unknown = null;
			let released = false;
			try {
				released = await input.registry.releaseProfileControl({
					claim: controlClaim,
					releasedAt: now().toISOString(),
				});
			} catch (error) {
				releaseError = error;
			}
			if (startupError && releaseError) {
				throw new AggregateError(
					[startupError, releaseError],
					"ChatGPT browser startup and profile-control release both failed.",
				);
			}
			if (startupError) throw startupError;
			if (releaseError) throw releaseError;
			if (!released) throw new Error("ChatGPT browser startup control release failed.");
		}

		if (!endpoint) throw new Error("ChatGPT browser startup returned no endpoint.");
		assertEndpoint(endpoint, input.scope.managedBrowserProfile);
		const target = await input.openTarget({
			host: endpoint.host,
			port: endpoint.port,
			url: input.targetUrl,
		});
		const targetId = requireNonEmpty(target.targetId, "targetId");
		const targetUrl = requireNonEmpty(target.url, "targetUrl");
		const reserved = await input.registry.reserve({
			scope: input.scope,
			targetId,
			workload: input.workload,
			operationId: input.operationId,
			now: now().toISOString(),
			idleTtlMs: input.idleTtlMs,
			absoluteTtlMs: input.absoluteTtlMs,
			targetFingerprint: targetUrl,
		});
		if (!reserved.ok) {
			await input.closeTarget({ host: endpoint.host, port: endpoint.port, targetId });
			throw new Error(`ChatGPT target lease reservation failed: ${reserved.conflict.kind}.`);
		}

		let lease = reserved.value.lease;
		let claim = reserved.value.claim;
		const created = await input.registry.recordTargetAction({
			claim,
			action: "target-created",
			occurredAt: now().toISOString(),
			idleTtlMs: input.idleTtlMs,
		});
		if (!created.ok)
			throw new Error(`ChatGPT target creation accounting failed: ${created.conflict.kind}.`);
		lease = created.value.lease;
		claim = created.value.claim;

		if (input.workload.kind === "conversation") {
			const navigated = await input.registry.recordTargetAction({
				claim,
				action: "navigation",
				occurredAt: now().toISOString(),
				idleTtlMs: input.idleTtlMs,
			});
			if (!navigated.ok) {
				throw new Error(`ChatGPT target navigation accounting failed: ${navigated.conflict.kind}.`);
			}
			lease = navigated.value.lease;
			claim = navigated.value.claim;
		}

		return {
			lease,
			claim,
			endpoint: { host: endpoint.host, port: endpoint.port },
		};
	};
}

function assertEndpoint(endpoint: ChatgptManagedBrowserEndpoint, expectedProfile: string): void {
	if (!endpoint.host.trim() || !Number.isInteger(endpoint.port) || endpoint.port <= 0) {
		throw new Error("ChatGPT tab provisioning requires an exact DevTools endpoint.");
	}
	if (endpoint.managedBrowserProfile !== expectedProfile) {
		throw new Error(
			`ChatGPT endpoint belongs to managed browser profile ${endpoint.managedBrowserProfile}, not ${expectedProfile}.`,
		);
	}
}

function requireNonEmpty(value: string, name: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`${name} must not be empty.`);
	return normalized;
}
