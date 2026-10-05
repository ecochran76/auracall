import type { TabLeaseScope } from './tabLeaseRegistry.js';

const pendingAcquisitions = new Map<string, Promise<void>>();

/** Serialize provisioning before browser I/O; lease revisions protect execution. */
export async function withProcessTabAcquisition<T>(
  scope: TabLeaseScope,
  acquire: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([scope.managedBrowserProfile, scope.service, scope.tenantKey]);
  const previous = pendingAcquisitions.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const pending = previous.then(() => gate);
  pendingAcquisitions.set(key, pending);
  await previous;
  try {
    return await acquire();
  } finally {
    release();
    if (pendingAcquisitions.get(key) === pending) pendingAcquisitions.delete(key);
  }
}
