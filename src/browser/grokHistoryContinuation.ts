import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { createFileBackedBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { getAuracallHomeDir } from "../auracallHome.js";
import type { BrowserProviderListOptions } from "./providers/types.js";

export class GrokHistoryCursorRestartRequiredError extends Error {
	readonly coverage: import("./providers/grokHistoryInventory.js").GrokHistoryCoverage;
	constructor(projectId?: string) {
		super("Legacy Grok history cursor requires an account-qualified restart.");
		this.coverage = {
			state: "incomplete",
			source: "visible-chats",
			scope: projectId ? "project" : "root",
			reason: "cursor-restart-required",
			loadedCount: 0,
			pages: 0,
			nextCursor: null,
			observedAt: new Date().toISOString(),
		};
	}
}

export interface GrokHistoryTransport {
	list(host: string, port: number): Promise<Array<{ id: string; url?: string; type?: string }>>;
	open(host: string, port: number): Promise<{ id: string }>;
	close(host: string, port: number, id: string): Promise<void>;
}

/** A continuation owns an exact leased target, never a provider-origin candidate.
 * The existing registry provides cross-process exclusion and durable custody. */
export async function acquireGrokHistoryContinuation(
	options: BrowserProviderListOptions,
	queryScope: { projectId?: string; query?: string; since?: string },
	suppliedTransport?: GrokHistoryTransport,
) {
	const transport = suppliedTransport ?? {
		list: async (host: string, port: number) => {
			const { default: CDP } = await import("./cdp.js");
			return CDP.List({ host, port });
		},
		open: async (host: string, port: number) => {
			const { openChromeTarget } = await import(
				"../../packages/browser-service/src/chromeLifecycle.js"
			);
			const target = await openChromeTarget(port, "about:blank", host, undefined, {
				kind: "pre-lease-target-acquisition",
				operationId: randomUUID(),
				reason: "Grok owned history continuation",
			});
			const id =
				(target as { id?: string; targetId?: string }).id ??
				(target as { targetId?: string }).targetId;
			if (!id) throw new Error("Grok owned history target creation failed.");
			return { id };
		},
		close: async (host: string, port: number, id: string) => {
			const { default: CDP } = await import("./cdp.js");
			await CDP.Close({ host, port, id });
		},
	};
	options.abortSignal?.throwIfAborted();
	const authorization = options.providerSessionAuthorization;
	const context = authorization?.context;
	const account = authorization?.expectation.configuredServiceAccountId;
	const host = options.host ?? context?.devtoolsHost;
	const port = options.port ?? context?.devtoolsPort;
	if (
		!account ||
		!context?.managedBrowserProfile ||
		!Number.isSafeInteger(context.browserProcessId) ||
		(context.browserProcessId ?? 0) < 1 ||
		!host ||
		!port
	)
		throw new Error("Grok history continuation requires account and browser custody.");
	// The configured traffic factory uses default for a global (unnamed) runtime.
	const runtimeProfileId = context.auracallRuntimeProfile?.trim() || "default";
	const accountScope = createHash("sha256")
		.update(JSON.stringify([runtimeProfileId, context.managedBrowserProfile, account]))
		.digest("hex");
	if (options.historyCursor) {
		let cursor: { v?: number; scope?: string; after?: unknown };
		try {
			if (options.historyCursor.length > 4096) throw new Error("long cursor");
			cursor = JSON.parse(Buffer.from(options.historyCursor, "base64url").toString("utf8"));
		} catch {
			throw new Error("Grok history cursor scope or format does not match this query.");
		}
		const queryParts = [
			queryScope.projectId ?? null,
			queryScope.query?.trim().toLowerCase() ?? "",
			queryScope.since ?? null,
		];
		const hash = (parts: unknown[]) =>
			createHash("sha256").update(JSON.stringify(parts)).digest("hex");
		if (typeof cursor.after !== "string" || cursor.after.length > 200)
			throw new Error("Grok history cursor scope or format does not match this query.");
		if (cursor.v === 1 && cursor.scope === hash(queryParts))
			throw new GrokHistoryCursorRestartRequiredError(queryScope.projectId);
		if (cursor.v !== 2 || cursor.scope !== hash([...queryParts, accountScope]))
			throw new Error("Grok history cursor scope or format does not match this query.");
	}

	const queryKey = createHash("sha256")
		.update(
			JSON.stringify([
				accountScope,
				queryScope.projectId ?? null,
				queryScope.query?.trim().toLowerCase() ?? "",
				queryScope.since ?? null,
			]),
		)
		.digest("hex");
	const scope = {
		runtimeProfileId,
		managedBrowserProfile: context.managedBrowserProfile,
		service: "grok",
		tenantKey: account,
	};
	const workload = { kind: "ephemeral" as const, operationId: `grok-history:${queryKey}` };
	const registry = createFileBackedBrowserTabLeaseRegistry({
		registryRoot: path.join(getAuracallHomeDir(), "browser-coordination", "tab-leases"),
	});
	const now = () => new Date().toISOString();
	const legacy = (await registry.list({ scope })).find(
		(lease) =>
			lease.state !== "released" &&
			!lease.exclusiveGroup &&
			lease.workload.kind === "ephemeral" &&
			lease.workload.operationId === "grok-serialized-utility",
	);
	if (legacy) throw new Error("Legacy Grok utility custody must settle before history admission.");
	let existing = await registry.findByWorkload(scope, workload);
	const targets = await transport.list(host, port);
	options.abortSignal?.throwIfAborted();
	if (existing && !targets.some((target) => target.id === existing?.targetId)) {
		if (existing.state !== "idle" || existing.effectState === "outcome-unknown")
			throw new Error("Grok history continuation has uncertain target custody.");
		const lost = await registry.markLost({
			leaseId: existing.leaseId,
			expectedRevision: existing.revision,
			now: now(),
			reason: "target-missing",
		});
		if (!lost.ok) throw new Error("Grok history continuation target loss could not be fenced.");
		const released = await registry.releaseLost({
			leaseId: lost.value.leaseId,
			expectedRevision: lost.value.revision,
			now: now(),
			disposition: "already-missing",
		});
		if (!released.ok)
			throw new Error("Grok history continuation target loss could not be released.");
		existing = null;
	}
	const fingerprint = JSON.stringify([host, port, context.browserProcessId ?? null]);
	if (existing && existing.targetFingerprint !== fingerprint)
		throw new Error("Grok history continuation browser generation changed.");
	if (existing && existing.state !== "idle")
		throw new Error("Grok history continuation is already in use or fenced.");
	if (existing) {
		const target = targets.find((target) => target.id === existing?.targetId);
		let compatible = false;
		try {
			const url = new URL(target?.url ?? "");
			compatible =
				url.origin === "https://grok.com" &&
				(queryScope.projectId
					? url.pathname === `/project/${encodeURIComponent(queryScope.projectId)}`
					: url.pathname === "/");
		} catch {}
		if (!compatible)
			throw new Error("Grok history continuation target route changed; preserve its custody.");
		if (
			Date.now() >= Date.parse(existing.idleExpiresAt) ||
			Date.now() >= Date.parse(existing.absoluteExpiresAt)
		) {
			if (existing.effectState === "outcome-unknown")
				throw new Error("Grok history continuation expiry has uncertain custody.");
			const retiring = await registry.beginRetirement({
				leaseId: existing.leaseId,
				expectedRevision: existing.revision,
				now: now(),
				reason:
					Date.now() >= Date.parse(existing.absoluteExpiresAt)
						? "absolute-expired"
						: "idle-expired",
			});
			if (!retiring.ok) throw new Error("Expired Grok history continuation could not be retired.");
			await transport.close(host, port, existing.targetId);
			const retired = await registry.finishRetirement({
				leaseId: existing.leaseId,
				retirementRevision: retiring.value.retirementRevision,
				now: now(),
				disposition: "closed",
			});
			if (!retired.ok) throw new Error("Expired Grok history continuation cleanup is unconfirmed.");
			existing = null;
		}
	}
	const operationId = randomUUID();
	let targetId = existing?.targetId;
	if (!targetId) targetId = (await transport.open(host, port)).id;
	if (options.abortSignal?.aborted) {
		if (!existing) await transport.close(host, port, targetId);
		options.abortSignal.throwIfAborted();
	}
	const acquired = existing
		? await registry.acquire({ scope, workload, operationId, now: now() })
		: await registry.reserve({
				scope,
				workload,
				operationId,
				targetId,
				now: now(),
				idleTtlMs: 15 * 60_000,
				absoluteTtlMs: 60 * 60_000,
				targetFingerprint: fingerprint,
				exclusiveGroup: "grok-serialized-utility",
			});
	if (!acquired.ok) {
		if (!existing) await transport.close(host, port, targetId);
		throw new Error(`Grok history continuation lease refused: ${acquired.conflict.kind}.`);
	}
	let claim = acquired.value.claim;
	let finished = false;
	return {
		options: {
			...options,
			host,
			port,
			tabTargetId: targetId,
			configuredUrl: queryScope.projectId
				? `https://grok.com/project/${encodeURIComponent(queryScope.projectId)}`
				: "https://grok.com/",
			tabUrl: existing ? undefined : "about:blank",
			historyAccountScope: accountScope,
			historySessionId: acquired.value.lease.leaseId,
			historyRetainDialog: true,
			historyOwnedLease: { claim, scope },
			historyFreshDialog: !existing,
			...(authorization
				? {
						providerSessionAuthorization: {
							...authorization,
							context: { ...authorization.context },
							proof: null,
						},
					}
				: {}),
		},
		accountScope,
		sessionId: acquired.value.lease.leaseId,
		targetId,
		host,
		port,
		fresh: !existing,
		async finish(complete: boolean, cleanupConfirmed: boolean) {
			if (finished) return;
			finished = true;
			const used = await registry.recordMeaningfulUse({
				claim,
				now: now(),
				idleTtlMs: 15 * 60_000,
				effectState: cleanupConfirmed ? "settled" : "outcome-unknown",
			});
			if (!used.ok) throw new Error("Grok history continuation settlement lost its lease.");
			claim = used.value.claim;
			if (!cleanupConfirmed) {
				await registry.idle({ claim, now: now(), effectState: "outcome-unknown" });
				return;
			}
			if (complete) {
				const idle = await registry.idle({ claim, now: now(), effectState: "settled" });
				if (!idle.ok)
					throw new Error("Grok history continuation completion could not idle its lease.");
				const retiring = await registry.beginRetirement({
					leaseId: claim.leaseId,
					expectedRevision: idle.value.revision,
					now: now(),
					reason: "operator",
				});
				if (!retiring.ok) throw new Error("Grok history continuation retirement refused.");
				await transport.close(host, port, targetId);
				const retired = await registry.finishRetirement({
					leaseId: claim.leaseId,
					retirementRevision: retiring.value.retirementRevision,
					now: now(),
					disposition: "closed",
				});
				if (!retired.ok) throw new Error("Grok history continuation retirement unconfirmed.");
			} else {
				const idle = await registry.idle({ claim, now: now(), effectState: "settled" });
				if (!idle.ok) throw new Error("Grok history continuation idle transition refused.");
			}
		},
	};
}
