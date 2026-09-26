import type { BrowserProviderListOptions } from "./types.js";

export function providerNavigationAllowed(options?: BrowserProviderListOptions): boolean {
	if (options?.allowNavigation !== undefined) {
		return options.allowNavigation;
	}
	return options?.preserveActiveTab !== true;
}
