import { describe, expect, test } from 'vitest';
import {
  CHATGPT_OBSERVATION_RECOVERY_COOLDOWN_MS,
  decideChatgptObservationRecovery,
} from '../../src/browser/observationLease.js';

const activeProgress = {
  state: 'assistant-text',
  assistantTextChars: 33_688,
  assistantTextFingerprint: '33688:424242',
  stopVisible: true,
  completionVisible: false,
  dialogVisible: false,
  connectionInterrupted: false,
};

describe('ChatGPT observation lease recovery', () => {
  test('records healthy progress without refreshing the active conversation', () => {
    expect(
      decideChatgptObservationRecovery({
        progress: activeProgress,
        nowMs: 1_000_000,
        lastProgressChangeAtMs: 999_000,
        lastRecoveryAtMs: null,
      }),
    ).toEqual({ action: 'heartbeat', reason: 'progress-current' });
  });

  test('allows one read-only refresh after fifteen minutes of stale active generation', () => {
    expect(
      decideChatgptObservationRecovery({
        progress: activeProgress,
        nowMs: 2_000_000,
        lastProgressChangeAtMs: 2_000_000 - CHATGPT_OBSERVATION_RECOVERY_COOLDOWN_MS,
        lastRecoveryAtMs: null,
      }),
    ).toEqual({ action: 'refresh', reason: 'progress-stale' });
  });

  test('blocks a second stale or interrupted refresh inside the fifteen-minute window', () => {
    expect(
      decideChatgptObservationRecovery({
        progress: { ...activeProgress, connectionInterrupted: true },
        nowMs: 3_000_000,
        lastProgressChangeAtMs: 1_000_000,
        lastRecoveryAtMs: 3_000_000 - CHATGPT_OBSERVATION_RECOVERY_COOLDOWN_MS + 1,
      }),
    ).toEqual({ action: 'wait', reason: 'recovery-cooldown' });
  });

  test('never refreshes completed, provider-error, dialog, or identity-unknown state', () => {
    expect(
      decideChatgptObservationRecovery({
        progress: { ...activeProgress, stopVisible: false, completionVisible: true },
        nowMs: 4_000_000,
        lastProgressChangeAtMs: 1_000_000,
        lastRecoveryAtMs: null,
      }),
    ).toEqual({ action: 'none', reason: 'generation-not-active' });
    expect(
      decideChatgptObservationRecovery({
        progress: { ...activeProgress, dialogVisible: true },
        nowMs: 4_000_000,
        lastProgressChangeAtMs: 1_000_000,
        lastRecoveryAtMs: null,
      }),
    ).toEqual({ action: 'none', reason: 'generation-not-active' });
  });
});
