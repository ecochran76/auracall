import type { LlmService } from "../llmService.js";
import type { CacheIdentity } from "../types.js";
import type { BrowserProviderListOptions } from "../../providers/types.js";

type BrowserContextIdentityResolver = Pick<LlmService, "resolveCacheIdentity">;

/**
 * Resolve optional prompt-session cache metadata without touching the live provider.
 * The actual browser run owns provider-session identity enforcement.
 */
export function resolveNonInteractiveBrowserContextIdentity(
	service: BrowserContextIdentityResolver,
	listOptions: BrowserProviderListOptions,
): Promise<CacheIdentity> {
	return service.resolveCacheIdentity(
		{ ...listOptions, skipFeatureSignature: true },
		{ prompt: false, detect: false },
	);
}
