export const RAW_DEVTOOLS_ALLOW_FLAG = '--allow-raw-cdp';
export const RAW_DEVTOOLS_ALLOW_ENV = 'AURACALL_ALLOW_RAW_CDP';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on']);

export function consumeRawDevToolsEscapeHatch(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flagIndex = argv.findIndex((entry) =>
    entry === RAW_DEVTOOLS_ALLOW_FLAG || entry === `${RAW_DEVTOOLS_ALLOW_FLAG}=true`,
  );
  if (flagIndex >= 0) {
    argv.splice(flagIndex, 1);
    return true;
  }
  const envValue = env[RAW_DEVTOOLS_ALLOW_ENV];
  return TRUE_VALUES.has(String(envValue ?? '').trim().toLowerCase());
}

export function requireRawDevToolsEscapeHatch(options: {
  scriptName?: string;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
} = {}): void {
  if (consumeRawDevToolsEscapeHatch(options.argv, options.env)) {
    return;
  }
  const scriptName = options.scriptName ?? process.argv[1] ?? 'direct-CDP script';
  throw new Error(
    [
      `${scriptName} uses a raw Chrome DevTools Protocol connection outside the normal browser-service command surface.`,
      `Use browser-service tooling first, for example scripts/browser-tools.ts --port <port> ...`,
      `To run this legacy debug script anyway, pass ${RAW_DEVTOOLS_ALLOW_FLAG} or set ${RAW_DEVTOOLS_ALLOW_ENV}=1.`,
    ].join(' '),
  );
}

export function enforceRawDevToolsEscapeHatchForCli(options: {
  scriptName?: string;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
} = {}): void {
  try {
    requireRawDevToolsEscapeHatch(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
