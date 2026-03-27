import os from 'node:os';
import path from 'node:path';

let auracallHomeDirOverride: string | null = null;

/**
 * Test-only hook: avoid mutating process.env (shared across Vitest worker threads).
 * This override is scoped to the current Node worker.
 */
export function setAuracallHomeDirOverrideForTest(dir: string | null): void {
  auracallHomeDirOverride = dir;
}

export function getAuracallHomeDir(): string {
  return auracallHomeDirOverride ?? process.env.AURACALL_HOME_DIR ?? path.join(os.homedir(), '.auracall');
}
