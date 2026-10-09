import { createHash } from 'node:crypto';
import { setCdpCommandAdmissionResolver } from '../../../packages/browser-service/src/guardedCdp.js';
import { DesktopBindingStore, type DesktopBinding } from './desktopBindings.js';
import { DesktopControlGate } from './desktopControlGate.js';

export function desktopBindingGeneration(binding: DesktopBinding): string {
  return createHash('sha256').update(JSON.stringify([
    binding.browserId, binding.session, binding.managedProfileDir,
    binding.routePoolEntryId, binding.routeId, binding.displayAllocationId,
    binding.cdpHost, binding.cdpPort,
  ])).digest('hex');
}

setCdpCommandAdmissionResolver(async ({ host, port }) => {
  const store = new DesktopBindingStore();
  const canonicalHost = (value: string | undefined) => value === 'localhost' ? '127.0.0.1' : value;
  const bindings = (await store.list()).filter((binding) => canonicalHost(binding.cdpHost) === canonicalHost(host) && binding.cdpPort === port);
  if (!bindings.length) return undefined;
  if (bindings.length !== 1) throw new Error('Ambiguous AuraCall desktop endpoint ownership.');
  const binding = bindings[0];
  const generation = desktopBindingGeneration(binding);
  const gate = new DesktopControlGate(binding.displayAllocationId);
  return { run: async (_command, effect) => gate.withAutomation(generation, async () => {
    const current = (await store.list()).filter((item) => item.managedProfileDir === binding.managedProfileDir);
    if (current.length !== 1 || desktopBindingGeneration(current[0]) !== generation) {
      throw new Error('AuraCall desktop browser ownership changed; reconnect before resuming automation.');
    }
    return effect();
  }) };
});
