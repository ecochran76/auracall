import { describe, expect, it, vi } from 'vitest';
import type {
  AccountMirrorArtifactRecoveryPlanResult,
  AccountMirrorArtifactRecoveryPlanner,
} from '../src/accountMirror/artifactRecoveryPlanner.js';
import { createAccountMirrorRecoveryCandidatesToolHandler } from '../src/mcp/tools/accountMirrorRecovery.js';

describe('mcp account mirror recovery tool', () => {
  it('plans recovery candidates through the shared planner', async () => {
    const planResult: AccountMirrorArtifactRecoveryPlanResult = {
      object: 'account_mirror_artifact_recovery_plan' as const,
      generatedAt: '2026-05-30T16:45:00.000Z',
      query: {
        provider: 'chatgpt' as const,
        runtimeProfileId: 'default',
        tenantKey: null,
        status: null,
        action: null,
        includeSearchRows: true,
        limit: 5,
      },
      candidates: [{
        object: 'account_mirror_artifact_recovery_candidate' as const,
        id: 'status:chatgpt:default:operator@example.com',
        source: 'account_mirror_status' as const,
        provider: 'chatgpt',
        tenantKey: 'operator@example.com',
        bindingKey: 'binding:chatgpt:default:default',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        status: 'eligible',
        action: 'queue_history_materialization',
        reason: 'Target has remote-known missing local assets.',
        evidenceConfidence: 'high' as const,
        materializationPolicy: null,
        assetInventory: null,
        counts: {
          remoteKnownMissingLocal: { artifacts: 1, files: 0, media: 0, total: 1 },
          retrievableMissingLocal: { artifacts: 1, files: 0, media: 0, total: 1 },
          localMaterialized: { artifacts: 0, files: 0, media: 0, total: 0 },
          unknownOrDeferred: { artifacts: 0, files: 0, media: 0, total: 0 },
          duplicateAliases: { artifacts: 0, files: 0, media: 0, total: 0 },
          unsupportedMetadataOnly: { artifacts: 0, files: 0, media: 0, total: 0 },
          staticFalsePositive: { artifacts: 0, files: 0, media: 0, total: 0 },
          failedTerminal: { artifacts: 0, files: 0, media: 0, total: 0 },
          accountLibrary: zeroAccountLibraryCounts(),
        },
        sourceItem: null,
        createRequest: null,
      }],
      omitted: { candidates: 0 },
      metrics: {
        total: 1,
        returned: 1,
        byStatus: {
          eligible: 1,
          needs_detail_refresh: 0,
          deferred: 0,
          blocked: 0,
          unsupported: 0,
          terminal: 0,
        },
        byAction: {
          queue_history_materialization: 1,
          refresh_detail_inventory: 0,
          start_materialization_policy_completion: 0,
          inspect_archive_materialization: 0,
          none: 0,
        },
        remoteKnownMissingLocal: { artifacts: 1, files: 0, media: 0, total: 1 },
        retrievableMissingLocal: { artifacts: 1, files: 0, media: 0, total: 1 },
        duplicateAliases: { artifacts: 0, files: 0, media: 0, total: 0 },
        unsupportedMetadataOnly: { artifacts: 0, files: 0, media: 0, total: 0 },
        staticFalsePositive: { artifacts: 0, files: 0, media: 0, total: 0 },
        failedTerminal: { artifacts: 0, files: 0, media: 0, total: 0 },
        accountLibrary: zeroAccountLibraryCounts(),
        unknownOrDeferred: { artifacts: 0, files: 0, media: 0, total: 0 },
      },
    };
    const plan = vi.fn(async () => planResult);
    const handler = createAccountMirrorRecoveryCandidatesToolHandler({
      planner: { plan } satisfies AccountMirrorArtifactRecoveryPlanner,
    });

    const result = await handler({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      limit: 5,
    });

    expect(plan).toHaveBeenCalledWith({
      provider: 'chatgpt',
      runtimeProfileId: 'default',
      limit: 5,
    });
    expect(result).toMatchObject({
      content: [{
        text: 'Account mirror recovery candidates: 1/1.',
      }],
      structuredContent: {
        object: 'account_mirror_artifact_recovery_plan',
        metrics: {
          total: 1,
        },
      },
    });
  });
});

function zeroAccountLibraryCounts() {
  const zero = () => ({ artifacts: 0, files: 0, media: 0, total: 0 });
  return {
    remoteKnownMissingLocal: zero(),
    retrievableMissingLocal: zero(),
    unsupportedMetadataOnly: zero(),
    duplicateAliases: zero(),
    failedTerminal: zero(),
    inventory: {
      total: zero(),
      stableIdentity: zero(),
      directDownload: zero(),
      needsBrowserDetail: zero(),
      unsupportedNoAuthority: zero(),
      detailRoutes: {
        libraryFileDetail: zero(),
        libraryArtifactDetail: zero(),
        libraryCanvasDetail: zero(),
        conversationDetail: zero(),
        externalOrInlineAsset: zero(),
        unknown: zero(),
      },
    },
  };
}
