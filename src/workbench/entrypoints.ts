import type { WorkbenchCapabilityProvider } from './types.js';

export type WorkbenchCapabilityEntrypoint = 'grok-imagine';

export function normalizeWorkbenchCapabilityEntrypoint(value: unknown): WorkbenchCapabilityEntrypoint | null {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'grok-imagine' || normalized === 'imagine') return 'grok-imagine';
  throw new Error(`Invalid workbench entrypoint "${value}". Use "grok-imagine".`);
}

export function resolveWorkbenchCapabilityEntrypointUrl(input: {
  provider?: WorkbenchCapabilityProvider | null;
  entrypoint?: WorkbenchCapabilityEntrypoint | null;
}): string | null {
  if (input.provider === 'grok' && input.entrypoint === 'grok-imagine') {
    return 'https://grok.com/imagine';
  }
  return null;
}
