#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface InstallServiceOptions {
  serviceName: string;
  binPath: string;
  logPath: string;
  dryRun: boolean;
  enable: boolean;
  start: boolean;
  restart: boolean;
}

function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseArgs(argv: string[]): InstallServiceOptions {
  const options: InstallServiceOptions = {
    serviceName: 'auracall-api',
    binPath: path.join(os.homedir(), '.local', 'bin', 'auracall'),
    logPath: path.join(os.homedir(), '.auracall', 'logs', 'api-18095.log'),
    dryRun: false,
    enable: true,
    start: true,
    restart: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-enable') {
      options.enable = false;
      continue;
    }
    if (arg === '--no-start') {
      options.start = false;
      continue;
    }
    if (arg === '--no-restart') {
      options.restart = false;
      continue;
    }
    if (arg === '--service-name') {
      const value = argv[index + 1];
      if (!value) throw new Error('--service-name requires a value.');
      options.serviceName = value.trim();
      index += 1;
      continue;
    }
    if (arg === '--bin') {
      const value = argv[index + 1];
      if (!value) throw new Error('--bin requires a path.');
      options.binPath = path.resolve(expandHome(value));
      index += 1;
      continue;
    }
    if (arg === '--log') {
      const value = argv[index + 1];
      if (!value) throw new Error('--log requires a path.');
      options.logPath = path.resolve(expandHome(value));
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (!/^[A-Za-z0-9_.@-]+$/.test(options.serviceName)) {
    throw new Error('--service-name may only contain letters, numbers, dot, underscore, at, or dash.');
  }
  return options;
}

function printHelp(): void {
  console.log(`Install AuraCall api serve as a user-scoped systemd service.

Usage:
  pnpm tsx scripts/install-user-api-service.ts [options]

Options:
  --service-name <name>  Unit base name. Default: auracall-api
  --bin <path>          Installed auracall binary. Default: ~/.local/bin/auracall
  --log <path>          Service log file. Default: ~/.auracall/logs/api-18095.log
  --no-enable           Write unit but do not enable it
  --no-start            Write unit but do not start it
  --no-restart          Use start instead of restart when starting
  --dry-run             Print actions without changing files
  -h, --help            Show this help
`);
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function run(command: string, args: string[], dryRun: boolean): void {
  const rendered = [command, ...args.map(shellEscape)].join(' ');
  if (dryRun) {
    console.log(`[dry-run] ${rendered}`);
    return;
  }
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 'signal'}): ${rendered}`);
  }
}

function createUnit(options: InstallServiceOptions): string {
  return `[Unit]
Description=AuraCall local API service
Documentation=https://github.com/ecochran76/auracall
After=default.target

[Service]
Type=simple
WorkingDirectory=%h
ExecStart=${options.binPath} api serve
Restart=on-failure
RestartSec=5s
TimeoutStopSec=20s
StandardOutput=append:${options.logPath}
StandardError=append:${options.logPath}

[Install]
WantedBy=default.target
`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const unitFileName = `${options.serviceName}.service`;
  const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  const unitPath = path.join(unitDir, unitFileName);
  const logDir = path.dirname(options.logPath);
  const unit = createUnit(options);

  if (options.dryRun) {
    console.log(`[dry-run] create ${unitDir}`);
    console.log(`[dry-run] create ${logDir}`);
    console.log(`[dry-run] write ${unitPath}`);
    console.log(unit.trimEnd());
  } else {
    fs.mkdirSync(unitDir, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(unitPath, unit);
  }

  run('systemctl', ['--user', 'daemon-reload'], options.dryRun);
  if (options.enable) {
    run('systemctl', ['--user', 'enable', unitFileName], options.dryRun);
  }
  if (options.start) {
    run('systemctl', ['--user', options.restart ? 'restart' : 'start', unitFileName], options.dryRun);
  }

  console.log(`Installed AuraCall user service: ${unitFileName}`);
  console.log(`Unit: ${unitPath}`);
  console.log(`Log: ${options.logPath}`);
  if (options.start) {
    console.log(`Status: systemctl --user status ${unitFileName}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
