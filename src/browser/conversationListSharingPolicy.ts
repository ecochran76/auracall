import type { BrowserProviderListOptions } from "./providers/types.js";

// Enumerable symbols survive the CLI's option spreads without entering JSON.
const generatedOptions = Symbol("generated-conversation-list-options");
const scalarKeys = new Set([
	"host",
	"port",
	"configuredUrl",
	"projectId",
	"tabTargetId",
	"tabUrl",
	"includeHistory",
	"historyLimit",
	"historySince",
	"allowNavigation",
	"preserveActiveTab",
	"tabLifecycle",
	"accountMirrorInventory",
	"accountMirrorSingleConversationVisit",
	"skipFeatureSignature",
	"disableProjectClickFallback",
]);
type Marked = BrowserProviderListOptions & { [generatedOptions]?: BrowserProviderListOptions };

/** Custom custody, callbacks and traffic plans cannot be silently borrowed. */
export function shareableConversationListOptions(
	options: BrowserProviderListOptions = {},
): BrowserProviderListOptions | null {
	const original = (options as Marked)[generatedOptions];
	const portable: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(options)) {
		if (value === undefined || key === "abortSignal") continue;
		if (
			scalarKeys.has(key) &&
			(value === null || ["string", "number", "boolean"].includes(typeof value))
		) {
			portable[key] = value;
		} else if (!original || value !== (original as unknown as Record<string, unknown>)[key])
			return null;
	}
	return portable as BrowserProviderListOptions;
}

export function markGeneratedConversationListOptions(
	resolved: BrowserProviderListOptions,
	overrides: BrowserProviderListOptions,
): void {
	if (shareableConversationListOptions(overrides) === null) return;
	(resolved as Marked)[generatedOptions] = { ...resolved };
}
