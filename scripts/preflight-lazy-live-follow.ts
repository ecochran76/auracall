#!/usr/bin/env tsx
import { spawn } from 'node:child_process';

interface Step {
  label: string;
  command: string;
  args: string[];
}

const steps: Step[] = [
  {
    label: 'completion controls',
    command: 'pnpm',
    args: ['run', 'smoke:completion-control'],
  },
  {
    label: 'completion hydration',
    command: 'pnpm',
    args: ['run', 'smoke:completion-hydration'],
  },
  {
    label: 'live-follow health parity',
    command: 'pnpm',
    args: ['run', 'smoke:live-follow-health'],
  },
  {
    label: 'ops-browser dashboard controls',
    command: 'pnpm',
    args: ['run', 'smoke:ops-browser-control'],
  },
  {
    label: 'install user runtime',
    command: 'pnpm',
    args: ['run', 'install:user-runtime'],
  },
  {
    label: 'installed MCP api_status',
    command: 'pnpm',
    args: ['run', 'smoke:mcp-api-status'],
  },
  {
    label: 'installed MCP api_ops_browser_status',
    command: 'pnpm',
    args: ['run', 'smoke:mcp-ops-browser'],
  },
];

function runStep(step: Step): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n==== ${step.label} ====`);
    console.log(`>> ${[step.command, ...step.args].join(' ')}`);
    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
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
  for (const step of steps) {
    await runStep(step);
  }
  console.log('\nlazy-live-follow preflight: pass');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
