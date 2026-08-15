import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const launchResolutionFiles = [
  'src/browser/service/browserLaunchPlan.ts',
  'src/browser/service/profileResolution.ts',
  'src/browser/service/profileConfig.ts',
  'src/browser/config.ts',
  'src/config/model.ts',
] as const;
const migratedCallers = [
  'scripts/browser-tools.ts',
  'src/accountMirror/refreshService.ts',
  'src/browser/index.ts',
  'src/browser/login.ts',
  'src/browser/profileDoctor.ts',
  'src/browser/reattach.ts',
  'src/browser/reattachCore.ts',
  'src/browser/service/browserService.ts',
  'src/browser/service/portResolution.ts',
  'src/browser/service/registryDiagnostics.ts',
  'src/gemini-web/browserNative.ts',
  'src/media/browserExecutor.ts',
  'src/runtime/historyMaterializationService.ts',
] as const;
const supersededLaunchContextNames = [
  'resolveBrowserProfileResolutionFromResolvedConfig',
  'resolveUserBrowserLaunchContext',
  'resolveManagedBrowserLaunchContextFromResolvedConfig',
  'resolveSessionBrowserLaunchContext',
] as const;

async function read(relativePath: string): Promise<string> {
  return fs.readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

describe('browser launch plan module structure', () => {
  test('keeps browser config normalization below profile and launch resolution', async () => {
    const source = await read('src/browser/config.ts');

    expect(source).not.toContain('profileResolution');
    expect(source).not.toContain('browserLaunchPlan');
  });

  test('keeps the launch-resolution module graph acyclic', async () => {
    const sourceByFile = new Map<string, string>(
      await Promise.all(launchResolutionFiles.map(async (file) => [file, await read(file)] as const)),
    );
    const dependencies = new Map<string, string[]>();
    for (const [file, source] of sourceByFile) {
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
        .map((match) => match[1])
        .filter((specifier): specifier is string => Boolean(specifier?.startsWith('.')))
        .map((specifier) => path.normalize(path.join(path.dirname(file), specifier)).replace(/\.js$/, '.ts'))
        .filter((dependency) => sourceByFile.has(dependency));
      dependencies.set(file, imports);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (file: string): boolean => {
      if (visiting.has(file)) return true;
      if (visited.has(file)) return false;
      visiting.add(file);
      for (const dependency of dependencies.get(file) ?? []) {
        if (visit(dependency)) return true;
      }
      visiting.delete(file);
      visited.add(file);
      return false;
    };

    expect(launchResolutionFiles.some((file) => visit(file))).toBe(false);
  });

  test('routes production callers through the single public launch-plan seam', async () => {
    const sources = await Promise.all(migratedCallers.map(read));

    for (const source of sources) {
      expect(source).toContain('resolveBrowserLaunchPlan');
      for (const supersededName of supersededLaunchContextNames) {
        expect(source).not.toContain(supersededName);
      }
    }
  });

  test('performs one compatibility profile resolution pass', async () => {
    const source = await read('src/browser/service/profileConfig.ts');

    expect(source.match(/resolveSelectedBrowserProfileResolution\(/g)).toHaveLength(1);
  });
});
