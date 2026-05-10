import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  clearAccountMirrorProviderGuard,
  type ClearAccountMirrorProviderGuardResult,
} from '../../accountMirror/providerGuardControl.js';
import type { AccountMirrorStatusRegistry } from '../../accountMirror/statusRegistry.js';

const accountMirrorProviderGuardClearInputShape = {
  provider: z.enum(['chatgpt', 'gemini', 'grok']),
  runtimeProfile: z.string().trim().min(1).default('default'),
  cooldownMs: z.number().int().nonnegative().optional(),
} satisfies z.ZodRawShape;

const accountMirrorProviderGuardClearOutputShape = {
  object: z.literal('account_mirror_provider_guard_clear'),
  kind: z.literal('account-mirror-provider-guard'),
  action: z.literal('clear'),
  provider: z.enum(['chatgpt', 'gemini', 'grok']),
  runtimeProfileId: z.string(),
  cooldownUntil: z.string().nullable(),
  mirrorStatus: z.record(z.string(), z.unknown()).nullable(),
} satisfies z.ZodRawShape;

export interface RegisterAccountMirrorProviderGuardToolsDeps {
  registry: AccountMirrorStatusRegistry;
  now?: () => Date;
}

export function registerAccountMirrorProviderGuardTools(
  server: McpServer,
  deps: RegisterAccountMirrorProviderGuardToolsDeps,
): void {
  server.registerTool(
    'account_mirror_provider_guard_clear',
    {
      title: 'Clear account mirror provider guard',
      description:
        'Clear a provider bot/human-verification guard for one account mirror target and apply a quiet cooldown before automation resumes.',
      inputSchema: accountMirrorProviderGuardClearInputShape,
      outputSchema: accountMirrorProviderGuardClearOutputShape,
    },
    createAccountMirrorProviderGuardClearToolHandler(deps),
  );
}

export function createAccountMirrorProviderGuardClearToolHandler(
  deps: RegisterAccountMirrorProviderGuardToolsDeps,
) {
  return async (rawInput: unknown) => {
    const payload = z.object(accountMirrorProviderGuardClearInputShape).parse(rawInput);
    const clearResult = clearAccountMirrorProviderGuard({
      registry: deps.registry,
      provider: payload.provider,
      runtimeProfileId: payload.runtimeProfile,
      cooldownMs: payload.cooldownMs,
      now: deps.now,
    });
    const structuredContent = formatProviderGuardClearResult(clearResult);
    return {
      isError: false,
      content: [
        {
          type: 'text' as const,
          text:
            `Account mirror provider guard cleared: ${clearResult.provider}/${clearResult.runtimeProfileId}; ` +
            `cooldownUntil=${clearResult.cooldownUntil ?? 'none'}.`,
        },
      ],
      structuredContent,
    };
  };
}

function formatProviderGuardClearResult(
  clearResult: ClearAccountMirrorProviderGuardResult,
): z.infer<z.ZodObject<typeof accountMirrorProviderGuardClearOutputShape>> {
  return {
    object: 'account_mirror_provider_guard_clear',
    kind: clearResult.kind,
    action: clearResult.action,
    provider: clearResult.provider,
    runtimeProfileId: clearResult.runtimeProfileId,
    cooldownUntil: clearResult.cooldownUntil,
    mirrorStatus: clearResult.statusEntry,
  };
}
