import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import { DesktopControlGate } from '../../src/browser/service/desktopControlGate.js';

test.skipIf(process.platform !== 'linux').each(['acquisition', 'release', 'human-release', 'paused-contender'])('recovers desktop acquisition after a process dies inside a transition (%s)', async (phase) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-transition-crash-'));
  const gate = new DesktopControlGate('fixture', directory);
  const human = phase === 'human-release' ? await gate.takeControl('generation-1') : undefined;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import fs from 'node:fs/promises';
    import { DesktopControlGate } from './src/browser/service/desktopControlGate.ts';
    process.on('message', () => {});
    const gate = new DesktopControlGate('fixture', process.argv[1]);
    const parkInTransition = () => {
      const readFile = fs.readFile.bind(fs);
      fs.readFile = async (...args) => {
        if (String(args[0]).endsWith('/owner.json')) {
          process.send('transition-created');
          await new Promise(() => {});
        }
        return readFile(...args);
      };
    };
    if (process.argv[2] === 'release') {
      await gate.withAutomation('generation-1', async () => { parkInTransition(); });
    } else if (process.argv[2] === 'human-release') {
      parkInTransition();
      await gate.releaseControl(process.argv[3], 'generation-1');
    } else {
      parkInTransition();
      await gate.takeControl('generation-1');
    }
  `, directory, phase, human?.token ?? ''], { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = '';
  child.stderr?.on('data', value => { stderr += value; });
  try {
    const exited = once(child, 'exit');
    const ready = await Promise.race([
      once(child, 'message').then(([message]) => message),
      exited.then(() => { throw new Error(`Crash fixture exited before transition: ${stderr}`); }),
    ]);
    expect(ready).toBe('transition-created');
    if (phase === 'acquisition') {
      await expect(gate.takeControl('generation-1')).rejects.toThrow('coordination is busy');
    }
    child.kill('SIGKILL');
    await exited;
    expect(child.signalCode).toBe('SIGKILL');
    if (human) {
      await expect(gate.takeControl('generation-2')).rejects.toThrow('another human owns');
      await gate.assertControl(human.token, 'generation-1');
      await expect(gate.releaseControl(human.token, 'generation-2')).rejects.toThrow('ownership changed');
      await gate.releaseControl(human.token, 'generation-1');
    }
    if (phase === 'paused-contender') {
      const link = fs.link.bind(fs);
      let reached!: () => void;
      let resume!: () => void;
      const reachedClaim = new Promise<void>(resolve => { reached = resolve; });
      const resumed = new Promise<void>(resolve => { resume = resolve; });
      let paused = false;
      const spy = vi.spyOn(fs, 'link').mockImplementation(async (...args) => {
        if (!paused && String(args[1]).includes('.retired-')) {
          paused = true;
          reached();
          await resumed;
        }
        return link(...args);
      });
      const stale = gate.takeControl('generation-1');
      const staleOutcome = stale.then(() => undefined, error => error);
      try {
        await reachedClaim;
        const successor = await new DesktopControlGate('fixture', directory).takeControl('generation-1');
        resume();
        expect(await staleOutcome).toBeInstanceOf(Error);
        await gate.assertControl(successor.token, 'generation-1');
        await gate.releaseControl(successor.token, 'generation-1');
      } finally { resume(); await staleOutcome; spy.mockRestore(); }
    }
    const control = await gate.takeControl('generation-1');
    await gate.assertControl(control.token, 'generation-1');
    await gate.releaseControl(control.token, 'generation-1');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
}, 10000);

test('removing only an empty orphaned transition restores acquisition', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-transition-control-'));
  const transition = path.join(directory, `${createHash('sha256').update('fixture').digest('hex')}.transition`);
  const gate = new DesktopControlGate('fixture', directory);
  try {
    await fs.mkdir(transition);
    await expect(gate.takeControl('generation-1')).rejects.toThrow('coordination is busy');
    await fs.rm(transition, { recursive: true });
    const control = await gate.takeControl('generation-1');
    await gate.releaseControl(control.token, 'generation-1');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('normal release leaves acquisition available', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-transition-normal-'));
  const gate = new DesktopControlGate('fixture', directory);
  try {
    const first = await gate.takeControl('generation-1');
    await gate.releaseControl(first.token, 'generation-1');
    const second = await gate.takeControl('generation-1');
    await gate.releaseControl(second.token, 'generation-1');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test.skipIf(process.platform !== 'linux').each(['live', 'foreign-boot', 'malformed', 'invalid-generation', 'claimed-recovery'])('preserves an unqualified transition (%s)', async (kind) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-transition-preserve-'));
  const transition = path.join(directory, `${createHash('sha256').update('fixture').digest('hex')}.transition`);
  const exited = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
  expect(exited.status).toBe(0);
  const identity = {
    version: 1,
    id: kind === 'invalid-generation' ? '-'.repeat(36) : '11111111-1111-4111-8111-111111111111',
    ownerPid: kind === 'live' ? process.pid : exited.pid,
    bootId: kind === 'foreign-boot' ? 'foreign-boot' : (await fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
  };
  const raw = kind === 'malformed' ? '{' : JSON.stringify(identity);
  try {
    await fs.writeFile(transition, raw);
    if (kind === 'claimed-recovery') await fs.link(transition, `${transition}.retired-${identity.id}`);
    const gate = new DesktopControlGate('fixture', directory);
    await expect(gate.takeControl('generation-1')).rejects.toThrow('coordination is busy');
    expect(await fs.readFile(transition, 'utf8')).toBe(raw);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
