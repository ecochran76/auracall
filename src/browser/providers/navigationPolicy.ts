import type { BrowserProviderListOptions } from './types.js';

export function providerNavigationAllowed(options?: BrowserProviderListOptions): boolean {
  return options?.preserveActiveTab !== true;
}

