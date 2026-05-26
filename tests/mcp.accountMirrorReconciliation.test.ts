import { describe, expect, it, vi } from 'vitest';
import { registerAccountMirrorReconciliationTools } from '../src/mcp/tools/accountMirrorReconciliation.js';
import type {
  AccountMirrorReconciliationCampaign,
  AccountMirrorReconciliationCampaignService,
} from '../src/accountMirror/reconciliationCampaignService.js';

describe('mcp account mirror reconciliation tools', () => {
  it('passes dry-run campaign options to the shared reconciliation service', async () => {
    const campaign = accountMirrorReconciliationCampaign();
    const create = vi.fn(async () => campaign);
    const tools = new Map<string, (input: unknown) => Promise<unknown>>();
    registerAccountMirrorReconciliationTools({
      registerTool: vi.fn((name: string, _config: unknown, handler: (input: unknown) => Promise<unknown>) => {
        tools.set(name, handler);
      }),
    } as never, {
      service: {
        create,
        list: vi.fn(),
        read: vi.fn(),
        control: vi.fn(),
      } satisfies AccountMirrorReconciliationCampaignService,
    });

    const handler = tools.get('account_mirror_reconciliation_create');
    if (!handler) throw new Error('Expected account_mirror_reconciliation_create tool.');
    const result = await handler({
      provider: 'gemini',
      runtimeProfile: 'auracall-gemini-pro',
      identity: 'operator@example.com',
      maxTargets: 2,
      maxActiveTargets: 1,
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['media'],
      materializationMaxItems: 5,
      dryRun: true,
    });

    expect(create).toHaveBeenCalledWith({
      provider: 'gemini',
      runtimeProfileId: 'auracall-gemini-pro',
      identity: 'operator@example.com',
      includeDisabled: undefined,
      maxTargets: 2,
      maxActiveTargets: 1,
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['media'],
      materializationMaxItems: 5,
      dryRun: true,
    });
    expect(result).toMatchObject({
      structuredContent: {
        id: 'acctmirror_reconciliation_mcp',
        status: 'planned',
      },
    });
  });

  it('normalizes run-next-pass campaign control action', async () => {
    const campaign = {
      ...accountMirrorReconciliationCampaign(),
      dryRun: false,
      status: 'running',
    } satisfies AccountMirrorReconciliationCampaign;
    const control = vi.fn(async () => campaign);
    const tools = new Map<string, (input: unknown) => Promise<unknown>>();
    registerAccountMirrorReconciliationTools({
      registerTool: vi.fn((name: string, _config: unknown, handler: (input: unknown) => Promise<unknown>) => {
        tools.set(name, handler);
      }),
    } as never, {
      service: {
        create: vi.fn(),
        list: vi.fn(),
        read: vi.fn(),
        control,
      } satisfies AccountMirrorReconciliationCampaignService,
    });

    const handler = tools.get('account_mirror_reconciliation_control');
    if (!handler) throw new Error('Expected account_mirror_reconciliation_control tool.');
    const result = await handler({
      id: 'acctmirror_reconciliation_mcp',
      action: 'run-next-pass',
    });

    expect(control).toHaveBeenCalledWith({
      id: 'acctmirror_reconciliation_mcp',
      action: 'run_next_pass',
    });
    expect(result).toMatchObject({
      structuredContent: {
        id: 'acctmirror_reconciliation_mcp',
        status: 'running',
      },
    });
  });
});

function accountMirrorReconciliationCampaign(): AccountMirrorReconciliationCampaign {
  return {
    object: 'account_mirror_reconciliation_campaign',
    id: 'acctmirror_reconciliation_mcp',
    dryRun: true,
    status: 'planned',
    createdAt: '2026-05-24T12:00:00.000Z',
    updatedAt: '2026-05-24T12:00:00.000Z',
    completedAt: null,
    filters: {
      provider: 'gemini',
      runtimeProfileId: 'auracall-gemini-pro',
      identity: 'operator@example.com',
      includeDisabled: false,
      maxTargets: 2,
      maxActiveTargets: 1,
    },
    policy: {
      sweepMode: 'full_sweep',
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['media'],
      materializationMaxItems: 5,
    },
    metrics: {
      totalTargets: 0,
      selectedTargets: 0,
      targetStates: {
        eligible: 0,
        disabled: 0,
        unconfigured: 0,
        unsupported_provider: 0,
        missing_identity: 0,
        identity_mismatch: 0,
        provider_guard: 0,
        cooldown_wait: 0,
        foreground_backpressure: 0,
        already_active: 0,
      },
      byProvider: {
        chatgpt: {
          totalTargets: 0,
          selectedTargets: 0,
          targetStates: {
            eligible: 0,
            disabled: 0,
            unconfigured: 0,
            unsupported_provider: 0,
            missing_identity: 0,
            identity_mismatch: 0,
            provider_guard: 0,
            cooldown_wait: 0,
            foreground_backpressure: 0,
            already_active: 0,
          },
        },
        gemini: {
          totalTargets: 0,
          selectedTargets: 0,
          targetStates: {
            eligible: 0,
            disabled: 0,
            unconfigured: 0,
            unsupported_provider: 0,
            missing_identity: 0,
            identity_mismatch: 0,
            provider_guard: 0,
            cooldown_wait: 0,
            foreground_backpressure: 0,
            already_active: 0,
          },
        },
        grok: {
          totalTargets: 0,
          selectedTargets: 0,
          targetStates: {
            eligible: 0,
            disabled: 0,
            unconfigured: 0,
            unsupported_provider: 0,
            missing_identity: 0,
            identity_mismatch: 0,
            provider_guard: 0,
            cooldown_wait: 0,
            foreground_backpressure: 0,
            already_active: 0,
          },
        },
      },
      materialization: {
        jobs: 0,
        activeJobs: 0,
        terminalJobs: 0,
        conversations: 0,
        materialized: 0,
        skipped: 0,
        failed: 0,
        archiveItems: 0,
        checksummedAssets: 0,
        terminalUnavailableConversations: 0,
        guardedConversations: 0,
        identityMismatchConversations: 0,
      },
    },
    targets: [],
    events: [],
  };
}
