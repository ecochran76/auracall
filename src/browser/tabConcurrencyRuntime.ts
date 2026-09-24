import path from "node:path";

import {
	createFileBackedProviderInteractionLedger,
	type ProviderInteractionLedger,
} from "../../packages/browser-service/src/service/interactionLedger.js";
import {
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

	const storageRoot = path.join(getAuracallHomeDir(), "browser-coordination");
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
			return {
				mode,
				enabled: true,
				storageRoot,
				leaseCount: leases.length,
				fencedLeaseCount: leases.filter((lease) =>
					["active", "idle", "retiring", "lost"].includes(lease.state),
				).length,
				interactionCount: interactions.length,
				activeInteractionCount: interactions.filter(
					(interaction) => interaction.state === "reserved" || interaction.state === "started",
				).length,
				providerWarningEventCount: events.filter(
					(event) => event.type === "provider-warning-observed",
				).length,
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
	};
}
