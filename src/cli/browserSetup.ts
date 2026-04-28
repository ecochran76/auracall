import type { ModelName } from '../oracle.js';
import type { AuracallBrowserDoctorContract } from '../browser/profileDoctor.js';

export type BrowserSetupTarget = 'chatgpt' | 'gemini' | 'grok';
export const AURACALL_BROWSER_SETUP_CONTRACT_VERSION = 1 as const;

export type BrowserSetupStepStatus = 'completed' | 'skipped' | 'failed';

export interface BrowserSetupLoginStep {
  status: BrowserSetupStepStatus;
  exportCookies: boolean;
  managedProfileSeedPolicy: 'reseed-if-source-newer' | 'force-reseed';
  manualLoginProfileDir: string;
  chromeProfile: string;
  launchTargetUrl: string;
  error: string | null;
}

export interface BrowserSetupVerificationStep {
  status: BrowserSetupStepStatus;
  model: ModelName | null;
  prompt: string | null;
  sessionId: string | null;
  error: string | null;
}

export interface AuracallBrowserSetupContract {
  contract: 'auracall.browser-setup';
  version: typeof AURACALL_BROWSER_SETUP_CONTRACT_VERSION;
  generatedAt: string;
  target: BrowserSetupTarget;
  status: 'completed' | 'failed';
  initialDoctor: AuracallBrowserDoctorContract;
  finalDoctor: AuracallBrowserDoctorContract | null;
  finalDoctorError: string | null;
  login: BrowserSetupLoginStep;
  verification: BrowserSetupVerificationStep;
}

export function resolveBrowserSetupTarget(options: {
  explicitTarget?: string | null;
  aliasChatgpt?: boolean;
  aliasGemini?: boolean;
  aliasGrok?: boolean;
  fallbackTarget?: BrowserSetupTarget | null;
}): BrowserSetupTarget {
  const aliasTarget = options.aliasGrok
    ? 'grok'
    : options.aliasGemini
      ? 'gemini'
      : options.aliasChatgpt
        ? 'chatgpt'
        : undefined;
  const explicitTarget = options.explicitTarget?.trim() ?? '';
  if (explicitTarget && aliasTarget && explicitTarget !== aliasTarget) {
    throw new Error('Do not combine --target with --chatgpt/--gemini/--grok.');
  }
  const target = (explicitTarget || aliasTarget || options.fallbackTarget || 'chatgpt') as BrowserSetupTarget;
  if (target !== 'chatgpt' && target !== 'gemini' && target !== 'grok') {
    throw new Error(`Invalid browser target "${target}". Use "chatgpt", "gemini", or "grok".`);
  }
  return target;
}

export function resolveSetupVerificationModel(options: {
  target: BrowserSetupTarget;
  resolvedModel: ModelName;
  modelSource?: string | null;
}): ModelName {
  const source = options.modelSource ?? null;
  if (!source || source === 'default') {
    return defaultVerificationModelForTarget(options.target);
  }

  const family = inferBrowserTargetFromModel(options.resolvedModel);
  if (!family) {
    throw new Error(
      `Browser setup verification only supports ChatGPT, Gemini, or Grok models. Received "${options.resolvedModel}".`,
    );
  }
  if (family !== options.target) {
    throw new Error(
      `Model "${options.resolvedModel}" targets ${family}, but setup is targeting ${options.target}. ` +
        'Choose a model for the same browser service or omit --model to use the setup default.',
    );
  }
  return options.resolvedModel;
}

export function defaultSetupVerificationPrompt(_target: BrowserSetupTarget): string {
  return 'ping';
}

export function createAuracallBrowserSetupContract(
  input: {
    target: BrowserSetupTarget;
    initialDoctor: AuracallBrowserDoctorContract;
    finalDoctor?: AuracallBrowserDoctorContract | null;
    finalDoctorError?: string | null;
    login: BrowserSetupLoginStep;
    verification: BrowserSetupVerificationStep;
  },
  options: { generatedAt?: string } = {},
): AuracallBrowserSetupContract {
  const finalDoctorError = input.finalDoctorError ?? null;
  const status =
    input.login.status === 'failed' ||
    input.verification.status === 'failed' ||
    finalDoctorError
      ? 'failed'
      : 'completed';
  return {
    contract: 'auracall.browser-setup',
    version: AURACALL_BROWSER_SETUP_CONTRACT_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    target: input.target,
    status,
    initialDoctor: input.initialDoctor,
    finalDoctor: input.finalDoctor ?? null,
    finalDoctorError,
    login: input.login,
    verification: input.verification,
  };
}

function defaultVerificationModelForTarget(target: BrowserSetupTarget): ModelName {
  switch (target) {
    case 'gemini':
      return 'gemini-3-pro';
    case 'grok':
      return 'grok-4.20';
    default:
      return 'gpt-5.2';
  }
}

function inferBrowserTargetFromModel(model: ModelName): BrowserSetupTarget | null {
  const normalized = model.toLowerCase();
  if (normalized.startsWith('grok')) return 'grok';
  if (normalized.startsWith('gemini')) return 'gemini';
  if (normalized.startsWith('gpt-') && !normalized.includes('codex')) return 'chatgpt';
  return null;
}
