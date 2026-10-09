import { RemoteViewConfigSchema } from '../../schema/types.js';
import type { AgentBrowserRdpConfig } from '../types.js';

/** Resolve a named desktop once, before any browser I/O. Undefined preserves legacy behavior. */
export function resolveDesktopLaunch(input: {
  remoteView: unknown;
  desktop: unknown;
}): AgentBrowserRdpConfig | undefined {
  const config = input.remoteView === undefined ? undefined : RemoteViewConfigSchema.parse(input.remoteView);
  const name = input.desktop ?? config?.defaultDesktop;
  if (name === undefined) return undefined;
  if (typeof name !== 'string' || !name.trim()) throw new Error('Desktop assignment must be a nonempty name.');
  if (name === 'root') return { enabled: false, runtimeProfile: 'root', desktopName: 'root' };
  const desktop = config && Object.hasOwn(config.desktops, name) ? config.desktops[name] : undefined;
  if (!desktop) throw new Error(`Unknown AuraCall desktop "${name}". Configure remoteView.desktops or select "root".`);
  return {
    enabled: true,
    runtimeProfile: desktop.runtimeProfile,
    routePoolEntryId: desktop.routePoolEntryId,
    desktopName: name,
    ...(desktop.command ? { command: desktop.command } : {}),
    ...(desktop.jobTimeoutMs ? { jobTimeoutMs: desktop.jobTimeoutMs } : {}),
  };
}
