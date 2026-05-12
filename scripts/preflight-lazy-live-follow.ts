#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeLazyLiveFollowPreflightStatus } from '../src/preflightStatus.js';

interface Step {
  label: string;
  command: string;
  args: string[];
  cwd?: string;
}

const steps: Step[] = [
  createScriptStep('completion controls', 'smoke:completion-control', 'smoke-account-mirror-completion-control'),
  createScriptStep('completion hydration', 'smoke:completion-hydration', 'smoke-account-mirror-completion-hydration'),
  createScriptStep('live-follow health and diagnostics parity', 'smoke:live-follow-health', 'smoke-live-follow-health-parity'),
  createScriptStep('ops-browser dashboard controls', 'smoke:ops-browser-control', 'smoke-ops-browser-completion-control'),
  createScriptStep('ops-browser provider guard clear', 'smoke:ops-browser-provider-guard', 'smoke-ops-browser-provider-guard'),
  createScriptStep('ops-browser preflight run detail', 'smoke:ops-browser-preflight-run-detail', 'smoke-ops-browser-preflight-run-detail'),
  createScriptStep('operator API key issue', 'smoke:api-key-issue', 'smoke-api-key-issue'),
  createScriptStep('operator API key OpenAI client', 'smoke:api-key-openai-client', 'smoke-api-key-openai-client'),
  createScriptStep('scoped client handoff workflow', 'smoke:scoped-client-handoff', 'smoke-scoped-client-handoff-workflow'),
  createScriptStep('ChE 4470 grading batch workflow', 'smoke:che447-grading-batch', 'smoke-che447-grading-batch'),
  createInstallRuntimeStep(),
  createScriptStep('installed MCP api_status and api_log_tail', 'smoke:mcp-api-status', 'smoke-api-status-mcp'),
  createScriptStep('installed MCP api_ops_browser_status', 'smoke:mcp-ops-browser', 'smoke-ops-browser-mcp'),
  createScriptStep('installed MCP provider guard clear', 'smoke:mcp-provider-guard', 'smoke-account-mirror-provider-guard-mcp'),
];

function createScriptStep(label: string, packageScript: string, scriptName: string): Step {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const compiledScript = path.join(scriptDir, `${scriptName}.js`);
  if (existsSync(compiledScript)) {
    return {
      label,
      command: process.execPath,
      args: [compiledScript],
      cwd: path.resolve(scriptDir, '..'),
    };
  }
  return {
    label,
    command: 'pnpm',
    args: ['run', packageScript],
  };
}

function createInstallRuntimeStep(): Step {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const installedCli = path.join(scriptDir, '..', 'bin', 'auracall.js');
  if (existsSync(installedCli)) {
    return {
      label: 'installed user runtime version',
      command: process.execPath,
      args: [installedCli, '--version'],
      cwd: path.resolve(scriptDir, '..'),
    };
  }
  return {
    label: 'install user runtime',
    command: 'pnpm',
    args: ['run', 'install:user-runtime'],
  };
}

function runStep(step: Step): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n==== ${step.label} ====`);
    console.log(`>> ${[step.command, ...step.args].join(' ')}`);
    const child = spawn(step.command, step.args, {
      cwd: step.cwd ?? process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${step.label} failed: code=${code ?? 'null'} signal=${signal ?? 'null'}`));
    });
  });
}

async function main(): Promise<void> {
  const startedAt = new Date();
  for (const step of steps) {
    try {
      await runStep(step);
    } catch (error) {
      const completedAt = new Date();
      await writeLazyLiveFollowPreflightStatus({
        object: 'auracall_preflight_status',
        name: 'lazy-live-follow',
        status: 'failed',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        failedStep: step.label,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  const completedAt = new Date();
  await writeLazyLiveFollowPreflightStatus({
    object: 'auracall_preflight_status',
    name: 'lazy-live-follow',
    status: 'passed',
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    failedStep: null,
    errorMessage: null,
  });
  console.log('\nlazy-live-follow preflight: pass');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
