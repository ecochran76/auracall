import type { BrowserMutationAuditSink } from '../../../packages/browser-service/src/service/mutationDispatcher.js';
import type { ChromeClient } from '../types.js';
import type { BrowserProviderListOptions } from './types.js';

type MutationContextCarrier = {
  __auracallMutationAudit?: BrowserMutationAuditSink;
  __auracallMutationSourcePrefix?: string;
};

function asMutationContextCarrier(value: unknown): MutationContextCarrier | null {
  return typeof value === 'object' && value !== null ? (value as MutationContextCarrier) : null;
}

function isBrowserProviderListOptions(value: unknown): value is BrowserProviderListOptions {
  return typeof value === 'object' && value !== null && ('mutationAudit' in value || 'mutationSourcePrefix' in value);
}

function normalizeMutationSourcePrefix(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

export function annotateClientMutationContext(
  client: ChromeClient,
  options: BrowserProviderListOptions | undefined,
  defaultSourcePrefix: string,
): void {
  const extendedClient = client as ChromeClient & MutationContextCarrier;
  extendedClient.__auracallMutationAudit = options?.mutationAudit;
  extendedClient.__auracallMutationSourcePrefix =
    normalizeMutationSourcePrefix(options?.mutationSourcePrefix) ?? defaultSourcePrefix;
}

export function resolveMutationAudit(
  clientOrOptions: unknown,
): BrowserMutationAuditSink | undefined {
  if (!clientOrOptions) {
    return undefined;
  }
  if (isBrowserProviderListOptions(clientOrOptions)) {
    return clientOrOptions.mutationAudit;
  }
  return asMutationContextCarrier(clientOrOptions)?.__auracallMutationAudit;
}

export function resolveMutationSource(
  clientOrOptions: unknown,
  defaultSourcePrefix: string,
  action: string,
): string {
  const explicitPrefix = isBrowserProviderListOptions(clientOrOptions)
    ? normalizeMutationSourcePrefix(clientOrOptions.mutationSourcePrefix)
    : normalizeMutationSourcePrefix(asMutationContextCarrier(clientOrOptions)?.__auracallMutationSourcePrefix);
  const prefix = explicitPrefix ?? defaultSourcePrefix;
  return `${prefix}:${action}`;
}
