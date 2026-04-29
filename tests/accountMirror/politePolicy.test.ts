import { describe, expect, test } from 'vitest';
import {
  evaluateAccountMirrorPoliteness,
  getAccountMirrorJitterMs,
  getDefaultAccountMirrorPolitenessPolicy,
} from '../../src/accountMirror/politePolicy.js';

describe('account mirror polite policy', () => {
  test('blocks mirror work when no expected identity is bound', () => {
    const decision = evaluateAccountMirrorPoliteness({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      nowMs: 1_000,
    });

    expect(decision).toMatchObject({
      posture: 'blocked',
      reason: 'expected-identity-missing',
      eligibleAtMs: null,
      delayMs: 0,
    });
  });

  test('blocks mirror work when detected identity mismatches the bound identity', () => {
    const decision = evaluateAccountMirrorPoliteness({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      expectedIdentityKey: 'ecochran76@gmail.com',
      detectedIdentityKey: 'consult@polymerconsultinggroup.com',
      nowMs: 1_000,
    });

    expect(decision).toMatchObject({
      posture: 'blocked',
      reason: 'identity-mismatch',
      expectedIdentityKey: 'ecochran76@gmail.com',
      detectedIdentityKey: 'consult@polymerconsultinggroup.com',
    });
  });

  test('adds deterministic jitter to routine mirror refreshes', () => {
    const policy = getDefaultAccountMirrorPolitenessPolicy('chatgpt');
    const jitterMs = getAccountMirrorJitterMs({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      expectedIdentityKey: 'ecochran76@gmail.com',
      anchorMs: 10_000,
      jitterMaxMs: policy.jitterMaxMs,
    });
    const decision = evaluateAccountMirrorPoliteness({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      expectedIdentityKey: 'ecochran76@gmail.com',
      lastSuccessAtMs: 10_000,
      nowMs: 10_000 + policy.minIntervalMs,
    });

    expect(jitterMs).toBeGreaterThanOrEqual(0);
    expect(jitterMs).toBeLessThanOrEqual(policy.jitterMaxMs);
    expect(decision).toMatchObject({
      posture: jitterMs > 0 ? 'delay' : 'eligible',
      reason: jitterMs > 0 ? 'minimum-interval' : 'eligible',
      eligibleAtMs: 10_000 + policy.minIntervalMs + jitterMs,
    });
    expect(decision.limits.jitterMs).toBe(jitterMs);
  });

  test('uses a narrower explicit-refresh interval without removing jitter', () => {
    const policy = getDefaultAccountMirrorPolitenessPolicy('grok');
    const decision = evaluateAccountMirrorPoliteness({
      provider: 'grok',
      runtimeProfileId: 'auracall-grok-auto',
      browserProfileId: 'default',
      expectedIdentityKey: 'ez86944@gmail.com',
      lastAttemptAtMs: 50_000,
      explicitRefresh: true,
      nowMs: 50_000 + policy.explicitRefreshMinIntervalMs - 1,
    });

    expect(decision.posture).toBe('delay');
    expect(decision.reason).toBe('minimum-interval');
    expect(decision.eligibleAtMs).toBeGreaterThanOrEqual(50_000 + policy.explicitRefreshMinIntervalMs);
  });

  test('backs off after failures before considering routine interval freshness', () => {
    const decision = evaluateAccountMirrorPoliteness({
      provider: 'gemini',
      runtimeProfileId: 'auracall-gemini-pro',
      browserProfileId: 'default',
      expectedIdentityKey: 'ecochran76@gmail.com',
      lastSuccessAtMs: 1_000,
      lastFailureAtMs: 20_000,
      consecutiveFailureCount: 2,
      nowMs: 20_000 + 60_000,
    });

    expect(decision).toMatchObject({
      posture: 'delay',
      reason: 'failure-backoff',
    });
    expect(decision.limits.failureCooldownMs).toBe(4 * 60 * 60_000);
  });

  test('applies long hard-stop cooldowns for bot-sensitive provider pages', () => {
    const policy = getDefaultAccountMirrorPolitenessPolicy('gemini');
    const decision = evaluateAccountMirrorPoliteness({
      provider: 'gemini',
      runtimeProfileId: 'auracall-gemini-pro',
      browserProfileId: 'default',
      expectedIdentityKey: 'ecochran76@gmail.com',
      providerHardStopAtMs: 100_000,
      nowMs: 100_000 + 60_000,
    });

    expect(decision).toMatchObject({
      posture: 'delay',
      reason: 'provider-hard-stop',
      eligibleAtMs: 100_000 + policy.hardStopCooldownMs,
    });
  });

  test('carries conservative page and row budgets in every decision', () => {
    const decision = evaluateAccountMirrorPoliteness({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      expectedIdentityKey: 'ecochran76@gmail.com',
      nowMs: 1_000,
    });

    expect(decision.posture).toBe('eligible');
    expect(decision.limits.maxPageReadsPerCycle).toBe(12);
    expect(decision.limits.maxConversationRowsPerCycle).toBe(250);
    expect(decision.limits.maxArtifactRowsPerCycle).toBe(80);
  });
});
