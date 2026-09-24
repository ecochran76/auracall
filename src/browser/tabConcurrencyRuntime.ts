import path from "node:path";

import {
	createFileBackedProviderInteractionLedger,
	type ProviderInteractionLedger,
} from "../../packages/browser-service/src/service/interactionLedger.js";
import {
	type BrowserTabActionCounts,
	type BrowserTabLease,
	type BrowserTabLeaseRegistry,
	createFileBackedBrowserTabLeaseRegistry,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { getAuracallHomeDir } from "../auracallHome.js";
import type { ResolvedUserConfig } from "../config.js";

export type BrowserTabConcurrencyMode = "serialized" | "tab-affinity";

export interface BrowserTabConcurrencyStatus {
	mode: BrowserTabConcurrencyMode;
	enabled: boolean;
	storageRoot: string | null;
	leaseCount: number;
	fencedLeaseCount: number;
	interactionCount: number;
	activeInteractionCount: number;
	providerWarningEventCount: number;
	leaseStates: {
		active: number;
		idle: number;
		retiring: number;
		released: number;
		lost: number;
	};
	workloads: {
		conversations: number;
		newConversations: number;
		liveFollow: number;
		ephemeral: number;
	};
	attention: {
		expiredIdle: number;
		outcomeUnknown: number;
	};
	bindingLifetimes: Array<{
		workloadKind: BrowserTabLease["workload"]["kind"];
		state: BrowserTabLease["state"];
		effectState: BrowserTabLease["effectState"];
		ageMs: number;
		idleRemainingMs: number;
		absoluteRemainingMs: number;
		idleExpired: boolean;
		absoluteExpired: boolean;
	}>;
	targetActions: BrowserTabActionCounts;
	retirements: {
		closed: number;
		alreadyMissing: number;
		preserved: number;
	};
}

export interface BrowserTabConcurrencyRuntime {
	mode: BrowserTabConcurrencyMode;
	enabled: boolean;
	storageRoot: string | null;
	registry: BrowserTabLeaseRegistry | null;
	ledger: ProviderInteractionLedger | null;
	readStatus(): Promise<BrowserTabConcurrencyStatus>;
}

export function createBrowserTabConcurrencyRuntime(
	userConfig: ResolvedUserConfig,
	options: { storageRoot?: string; now?: () => Date } = {},
): BrowserTabConcurrencyRuntime {
	const mode = userConfig.browser?.tabConcurrencyMode ?? "serialized";
	if (mode === "serialized") {
		return {
			mode,
			enabled: false,
			storageRoot: null,
			registry: null,
			ledger: null,
			readStatus: async () => emptyStatus(mode),
		};
	}

	const storageRoot =
		options.storageRoot ?? path.join(getAuracallHomeDir(), "browser-coordination");
	const registry = createFileBackedBrowserTabLeaseRegistry({
		registryRoot: path.join(storageRoot, "tab-leases"),
	});
	const ledger = createFileBackedProviderInteractionLedger({
		ledgerRoot: path.join(storageRoot, "provider-interactions"),
	});
	return {
		mode,
		enabled: true,
		storageRoot,
		registry,
		ledger,
		readStatus: async () => {
			const [leases, interactions, events] = await Promise.all([
				registry.list(),
				ledger.list(),
				ledger.listEvents(),
			]);
			const nowMs = (options.now ?? (() => new Date()))().getTime();
			const fencedLeases = leases.filter((lease) =>
				["active", "idle", "retiring", "lost"].includes(lease.state),
			);
			return {
				mode,
				enabled: true,
				storageRoot,
				leaseCount: leases.length,
				fencedLeaseCount: fencedLeases.length,
				interactionCount: interactions.length,
				activeInteractionCount: interactions.filter(
					(interaction) => interaction.state === "reserved" || interaction.state === "started",
				).length,
				providerWarningEventCount: events.filter(
					(event) => event.type === "provider-warning-observed",
				).length,
				leaseStates: {
					active: leases.filter((lease) => lease.state === "active").length,
					idle: leases.filter((lease) => lease.state === "idle").length,
					retiring: leases.filter((lease) => lease.state === "retiring").length,
					released: leases.filter((lease) => lease.state === "released").length,
					lost: leases.filter((lease) => lease.state === "lost").length,
				},
				workloads: {
					conversations: leases.filter((lease) => lease.workload.kind === "conversation").length,
					newConversations: leases.filter((lease) => lease.workload.kind === "new-conversation")
						.length,
					liveFollow: leases.filter((lease) => lease.workload.kind === "live-follow").length,
					ephemeral: leases.filter((lease) => lease.workload.kind === "ephemeral").length,
				},
				attention: {
					expiredIdle: leases.filter(
						(lease) =>
							lease.state === "idle" &&
							(nowMs >= Date.parse(lease.idleExpiresAt) ||
								nowMs >= Date.parse(lease.absoluteExpiresAt)),
					).length,
					outcomeUnknown: leases.filter((lease) => lease.effectState === "outcome-unknown").length,
				},
				bindingLifetimes: fencedLeases
					.map((lease) => ({
						workloadKind: lease.workload.kind,
						state: lease.state,
						effectState: lease.effectState,
						ageMs: Math.max(0, nowMs - Date.parse(lease.acquiredAt)),
						idleRemainingMs: Math.max(0, Date.parse(lease.idleExpiresAt) - nowMs),
						absoluteRemainingMs: Math.max(0, Date.parse(lease.absoluteExpiresAt) - nowMs),
						idleExpired: nowMs >= Date.parse(lease.idleExpiresAt),
						absoluteExpired: nowMs >= Date.parse(lease.absoluteExpiresAt),
					}))
					.sort(
						(left, right) =>
							[
								left.workloadKind.localeCompare(right.workloadKind),
								left.state.localeCompare(right.state),
								left.effectState.localeCompare(right.effectState),
								left.ageMs - right.ageMs,
								left.absoluteRemainingMs - right.absoluteRemainingMs,
							].find((value) => value !== 0) ?? 0,
					),
				targetActions: leases.reduce<BrowserTabActionCounts>(
					(totals, lease) => ({
						targetCreations: totals.targetCreations + lease.actionCounts.targetCreations,
						adoptions: totals.adoptions + lease.actionCounts.adoptions,
						navigations: totals.navigations + lease.actionCounts.navigations,
						reloads: totals.reloads + lease.actionCounts.reloads,
						focuses: totals.focuses + lease.actionCounts.focuses,
						closes: totals.closes + lease.actionCounts.closes,
					}),
					emptyActionCounts(),
				),
				retirements: {
					closed: leases.filter((lease) => lease.finalDisposition === "closed").length,
					alreadyMissing: leases.filter((lease) => lease.finalDisposition === "already-missing")
						.length,
					preserved: leases.filter((lease) => lease.finalDisposition === "preserved").length,
				},
			};
		},
	};
}

function emptyStatus(mode: BrowserTabConcurrencyMode): BrowserTabConcurrencyStatus {
	return {
		mode,
		enabled: false,
		storageRoot: null,
		leaseCount: 0,
		fencedLeaseCount: 0,
		interactionCount: 0,
		activeInteractionCount: 0,
		providerWarningEventCount: 0,
		leaseStates: { active: 0, idle: 0, retiring: 0, released: 0, lost: 0 },
		workloads: { conversations: 0, newConversations: 0, liveFollow: 0, ephemeral: 0 },
		attention: { expiredIdle: 0, outcomeUnknown: 0 },
		bindingLifetimes: [],
		targetActions: emptyActionCounts(),
		retirements: { closed: 0, alreadyMissing: 0, preserved: 0 },
	};
}

function emptyActionCounts(): BrowserTabActionCounts {
	return {
		targetCreations: 0,
		adoptions: 0,
		navigations: 0,
		reloads: 0,
		focuses: 0,
		closes: 0,
	};
}
