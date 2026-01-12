#!/usr/bin/env ts-node

/**
 * Minimal Chrome DevTools helpers inspired by Mario Zechner's
 * "What if you don't need MCP?" article.
 *
 * Keeps everything in one TypeScript CLI so agents (or humans) can drive Chrome
 * directly via the DevTools protocol without pulling in a large MCP server.
 */
import { Command } from 'commander';
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import puppeteer from 'puppeteer-core';
import { loadUserConfig } from '../src/config.js';
import { resolveBrowserConfig } from '../src/browser/config.js';
import { launchManualLoginSession } from '../src/browser/manualLogin.js';
import { BrowserService } from '../src/browser/service/browserService.js';
import {
  DEFAULT_DEBUG_PORT,
  DEFAULT_DEBUG_PORT_RANGE,
  pickAvailableDebugPort,
} from '../src/browser/portSelection.js';

/** Utility type so TypeScript knows the async function constructor */
type AsyncFunctionCtor = new (...args: string[]) => (...fnArgs: unknown[]) => Promise<unknown>;

const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.cache', 'scraping');
const DEFAULT_CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function browserURL(port: number): string {
  return `http://localhost:${port}`;
}

async function connectBrowser(port: number) {
  return puppeteer.connect({ browserURL: browserURL(port), defaultViewport: null });
}

async function copyProfileIfRequested(baseDir: string, copyProfile: boolean): Promise<string | null> {
  if (!copyProfile) return null;
  await fs.mkdir(baseDir, { recursive: true });
  const userDataDir = await fs.mkdtemp(path.join(baseDir, 'browser-tools-'));
  const source = `${path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')}/`;
  execSync(`rsync -a --delete "${source}" "${userDataDir}/"`, { stdio: 'ignore' });
  return userDataDir;
}

async function resolvePortOrLaunch(options: {
  port?: number;
  chromePath?: string;
  profileDir?: string;
  copyProfile?: boolean;
}): Promise<number> {
  if (options.port) {
    return options.port;
  }
  const { config: userConfig } = await loadUserConfig();
  const browserService = BrowserService.fromConfig(userConfig);
  const target = await browserService.resolveDevToolsTarget({ ensurePort: false });
  if (target.port) {
    return target.port;
  }
  const resolved = resolveBrowserConfig(userConfig.browser);
  const baseDir =
    options.profileDir ??
    resolved.manualLoginProfileDir ??
    path.join(os.homedir(), '.oracle', 'browser-profile');
  const copiedDir = await copyProfileIfRequested(baseDir, Boolean(options.copyProfile));
  const userDataDir = copiedDir ?? baseDir;
  const debugPortRange = resolved.debugPortRange ?? DEFAULT_DEBUG_PORT_RANGE;
  const logger = (message: string) => console.log(message);
  const debugPort = await pickAvailableDebugPort(DEFAULT_DEBUG_PORT, logger, debugPortRange);
  const { chrome } = await launchManualLoginSession({
    chromePath: options.chromePath ?? resolved.chromePath ?? DEFAULT_CHROME_BIN,
    profileName: resolved.chromeProfile ?? 'Default',
    userDataDir,
    url: resolved.target === 'grok'
      ? resolved.grokUrl ?? 'https://grok.com'
      : resolved.target === 'gemini'
        ? resolved.geminiUrl ?? 'https://gemini.google.com/app'
        : resolved.chatgptUrl ?? 'https://chatgpt.com/',
    logger,
    debugPort,
    debugPortRange,
  });
  if (!chrome.port) {
    throw new Error('Chrome launch did not return a DevTools port.');
  }
  return chrome.port;
}

async function getActivePage(port: number) {
  const browser = await connectBrowser(port);
  const pages = await browser.pages();
  const page = pages.at(-1);
  if (!page) {
    await browser.disconnect();
    throw new Error('No active tab found');
  }
  return { browser, page };
}

const program = new Command();
program
  .name('browser-tools')
  .description('Lightweight Chrome DevTools helpers (no MCP required).')
  .configureHelp({ sortSubcommands: true })
  .showSuggestionAfterError();

program
  .command('start')
  .description('Launch Chrome with remote debugging enabled.')
  .option('-p, --port <number>', 'Remote debugging port (default: from registry or range)', (value) => Number.parseInt(value, 10))
  .option('--profile', 'Copy your default Chrome profile before launch.', false)
  .option('--profile-dir <path>', 'Directory for the temporary Chrome profile.', DEFAULT_PROFILE_DIR)
  .option('--chrome-path <path>', 'Path to the Chrome binary.', DEFAULT_CHROME_BIN)
  .action(async (options) => {
    const { port, profile, profileDir, chromePath } = options as {
      port?: number;
      profile: boolean;
      profileDir: string;
      chromePath: string;
    };

    try {
      execSync("killall 'Google Chrome'", { stdio: 'ignore' });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      // ignore missing processes
    }
    const resolvedPort = await resolvePortOrLaunch({
      port,
      chromePath,
      profileDir,
      copyProfile: profile,
    });
    console.log(`✓ Chrome listening on http://localhost:${resolvedPort}${profile ? ' (profile copied)' : ''}`);
  });

program
  .command('nav <url>')
  .description('Navigate the current tab or open a new tab.')
  .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
  .option('--new', 'Open in a new tab.', false)
  .action(async (url: string, options) => {
    const port = await resolvePortOrLaunch({ port: options.port as number | undefined });
    const browser = await connectBrowser(port);
    try {
      if (options.new) {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        console.log('✓ Opened in new tab:', url);
      } else {
        const pages = await browser.pages();
        const page = pages.at(-1);
        if (!page) {
          throw new Error('No active tab found');
        }
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        console.log('✓ Navigated current tab to:', url);
      }
    } finally {
      await browser.disconnect();
    }
  });

program
  .command('eval <code...>')
  .description('Evaluate JavaScript in the active page context.')
  .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
  .action(async (code: string[], options) => {
    const snippet = code.join(' ');
    const port = await resolvePortOrLaunch({ port: options.port as number | undefined });
    const { browser, page } = await getActivePage(port);
    try {
      const result = await page.evaluate((body) => {
        const ASYNC_FN = Object.getPrototypeOf(async () => {}).constructor as AsyncFunctionCtor;
        return new ASYNC_FN(`return (${body})`)();
      }, snippet);

      if (Array.isArray(result)) {
        result.forEach((entry, index) => {
          if (index > 0) {
            console.log('');
          }
          Object.entries(entry).forEach(([key, value]) => {
            console.log(`${key}: ${value}`);
          });
        });
      } else if (typeof result === 'object' && result !== null) {
        Object.entries(result).forEach(([key, value]) => {
          console.log(`${key}: ${value}`);
        });
      } else {
        console.log(result);
      }
    } finally {
      await browser.disconnect();
    }
  });

program
  .command('screenshot')
  .description('Capture the current viewport and print the temp PNG path.')
  .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
  .action(async (options) => {
    const port = await resolvePortOrLaunch({ port: options.port as number | undefined });
    const { browser, page } = await getActivePage(port);
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(
        os.tmpdir(),
        `screenshot-${timestamp}.png`,
      ) as `${string}.png`;
      await page.screenshot({ path: filePath });
      console.log(filePath);
    } finally {
      await browser.disconnect();
    }
  });

program
  .command('pick <message...>')
  .description('Interactive DOM picker that prints metadata for clicked elements.')
  .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
  .action(async (messageParts: string[], options) => {
    const message = messageParts.join(' ');
    const port = await resolvePortOrLaunch({ port: options.port as number | undefined });
    const { browser, page } = await getActivePage(port);
    try {
      const pickScript = `
(() => {
  const scope = globalThis;
  scope.pickOverlayInjected = true;
  scope.pickOverlayVersion = '2';
  scope.pick = (prompt) =>
    new Promise((resolve) => {
      const selections = [];
      const selectedElements = new Set();

      const overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none';

      const highlight = document.createElement('div');
      highlight.style.cssText =
        'position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);transition:all 0.05s ease';
      overlay.appendChild(highlight);

      const banner = document.createElement('div');
      banner.style.cssText =
        'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:12px 24px;border-radius:8px;font:14px system-ui;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;z-index:2147483647';

      const updateBanner = () => {
        banner.textContent = prompt + ' (' + selections.length + ' selected, Cmd/Ctrl+click to add, Enter to finish, ESC to cancel)';
      };

      const cleanup = () => {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        banner.remove();
        selectedElements.forEach((el) => {
          el.style.outline = '';
        });
      };

      const serialize = (el) => {
        const parents = [];
        let current = el.parentElement;
        while (current && current !== document.body) {
          const id = current.id ? '#' + current.id : '';
          const cls = current.className ? '.' + current.className.trim().split(/\\s+/).join('.') : '';
          parents.push(current.tagName.toLowerCase() + id + cls);
          current = current.parentElement;
        }
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          class: el.className || null,
          text: (el.textContent || '').trim().slice(0, 200) || null,
          html: el.outerHTML.slice(0, 500),
          parents: parents.join(' > '),
        };
      };

      const onMove = (event) => {
        const node = document.elementFromPoint(event.clientX, event.clientY);
        if (!node || overlay.contains(node) || banner.contains(node)) return;
        const rect = node.getBoundingClientRect();
        highlight.style.cssText =
          'position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);top:' +
          rect.top +
          'px;left:' +
          rect.left +
          'px;width:' +
          rect.width +
          'px;height:' +
          rect.height +
          'px';
      };
      const onClick = (event) => {
        if (banner.contains(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        const node = document.elementFromPoint(event.clientX, event.clientY);
        if (!node || overlay.contains(node) || banner.contains(node)) return;

        if (event.metaKey || event.ctrlKey) {
          if (!selectedElements.has(node)) {
            selectedElements.add(node);
            node.style.outline = '3px solid #10b981';
            selections.push(serialize(node));
            updateBanner();
          }
        } else {
          cleanup();
          const info = serialize(node);
          resolve(selections.length > 0 ? selections : info);
        }
      };

      const onKey = (event) => {
        if (event.key === 'Escape') {
          cleanup();
          resolve(null);
        } else if (event.key === 'Enter' && selections.length > 0) {
          cleanup();
          resolve(selections);
        }
      };

      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);

      document.body.append(overlay, banner);
      updateBanner();
    });
})();
`;
      await page.evaluate((script) => {
        (0, eval)(script);
      }, pickScript);

      const result = await page.evaluate((msg) => {
        const pickFn = (window as Window & { pick?: (message: string) => Promise<unknown> }).pick;
        if (!pickFn) {
          return null;
        }
        return pickFn(msg);
      }, message);

      if (Array.isArray(result)) {
        result.forEach((entry, index) => {
          if (index > 0) {
            console.log('');
          }
          Object.entries(entry).forEach(([key, value]) => {
            console.log(`${key}: ${value}`);
          });
        });
      } else if (result && typeof result === 'object') {
        Object.entries(result).forEach(([key, value]) => {
          console.log(`${key}: ${value}`);
        });
      } else {
        console.log(result);
      }
    } finally {
      await browser.disconnect();
    }
  });

program
  .command('cookies')
  .description('Dump cookies from the active tab as JSON.')
  .option('--port <number>', 'Debugger port (default: registry or spawned)', (value) => Number.parseInt(value, 10))
  .action(async (options) => {
    const port = await resolvePortOrLaunch({ port: options.port as number | undefined });
    const { browser, page } = await getActivePage(port);
    try {
      const cookies = await page.cookies();
      console.log(JSON.stringify(cookies, null, 2));
    } finally {
      await browser.disconnect();
    }
  });

program
  .command('inspect')
  .description('List Chrome processes launched with --remote-debugging-port and show their open tabs.')
  .option('--ports <list>', 'Comma-separated list of ports to include.', parseNumberListArg)
  .option('--pids <list>', 'Comma-separated list of PIDs to include.', parseNumberListArg)
  .option('--json', 'Emit machine-readable JSON output.', false)
  .action(async (options) => {
    const ports = (options.ports as number[] | undefined)?.filter((entry) => Number.isFinite(entry) && entry > 0);
    const pids = (options.pids as number[] | undefined)?.filter((entry) => Number.isFinite(entry) && entry > 0);
    const sessions = await describeChromeSessions({
      ports,
      pids,
      includeAll: !ports?.length && !pids?.length,
    });
    if (options.json) {
      console.log(JSON.stringify(sessions, null, 2));
      return;
    }
    if (sessions.length === 0) {
      console.log('No Chrome instances with DevTools ports found.');
      return;
    }
    sessions.forEach((session, index) => {
      if (index > 0) {
        console.log('');
      }
      const header = [`Chrome PID ${session.pid}`, `(port ${session.port})`];
      if (session.version?.Browser) {
        header.push(`- ${session.version.Browser}`);
      }
      console.log(header.join(' '));
      if (session.tabs.length === 0) {
        console.log('  (no tabs reported)');
        return;
      }
      session.tabs.forEach((tab, idx) => {
        const title = tab.title || '(untitled)';
        const url = tab.url || '(no url)';
        console.log(`  Tab ${idx + 1}: ${title}`);
        console.log(`           ${url}`);
      });
    });
  });

program
  .command('kill')
  .description('Terminate Chrome instances that have DevTools ports open.')
  .option('--ports <list>', 'Comma-separated list of ports to target.', parseNumberListArg)
  .option('--pids <list>', 'Comma-separated list of PIDs to target.', parseNumberListArg)
  .option('--all', 'Kill every matching Chrome instance.', false)
  .option('--force', 'Skip the confirmation prompt.', false)
  .action(async (options) => {
    const ports = (options.ports as number[] | undefined)?.filter((entry) => Number.isFinite(entry) && entry > 0);
    const pids = (options.pids as number[] | undefined)?.filter((entry) => Number.isFinite(entry) && entry > 0);
    const killAll = Boolean(options.all);
    if (!killAll && (!ports?.length && !pids?.length)) {
      console.error('Specify --all, --ports <list>, or --pids <list> to select targets.');
      process.exit(1);
    }
    const sessions = await describeChromeSessions({ ports, pids, includeAll: killAll });
    if (sessions.length === 0) {
      console.log('No matching Chrome instances found.');
      return;
    }
    if (!options.force) {
      console.log('About to terminate the following Chrome sessions:');
      sessions.forEach((session) => {
        console.log(`  PID ${session.pid} (port ${session.port})`);
      });
      const rl = readline.createInterface({ input, output });
      const answer = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
      rl.close();
      if (answer !== 'y' && answer !== 'yes') {
        console.log('Aborted.');
        return;
      }
    }
    const failures: { pid: number; error: string }[] = [];
    sessions.forEach((session) => {
      try {
        process.kill(session.pid);
        console.log(`✓ Killed Chrome PID ${session.pid} (port ${session.port})`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`✗ Failed to kill PID ${session.pid}: ${message}`);
        failures.push({ pid: session.pid, error: message });
      }
    });
    if (failures.length > 0) {
      process.exitCode = 1;
    }
  });

interface ChromeProcessInfo {
  pid: number;
  port: number;
  command: string;
}

interface ChromeTabInfo {
  id?: string;
  title?: string;
  url?: string;
  type?: string;
}

interface ChromeSessionDescription extends ChromeProcessInfo {
  version?: Record<string, string>;
  tabs: ChromeTabInfo[];
}

function parseNumberListArg(value: string): number[] {
  return parseNumberList(value) ?? [];
}

function parseNumberList(inputValue: string | undefined): number[] | undefined {
  if (!inputValue) {
    return undefined;
  }
  const parsed = inputValue
    .split(',')
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((value) => Number.isFinite(value));
  return parsed.length > 0 ? parsed : undefined;
}

async function describeChromeSessions(options: {
  ports?: number[];
  pids?: number[];
  includeAll?: boolean;
}): Promise<ChromeSessionDescription[]> {
  const { ports, pids, includeAll } = options;
  const processes = await listDevtoolsChromes();
  const portSet = new Set(ports ?? []);
  const pidSet = new Set(pids ?? []);
  const candidates = processes.filter((proc) => {
    if (includeAll) {
      return true;
    }
    if (portSet.size > 0 && portSet.has(proc.port)) {
      return true;
    }
    if (pidSet.size > 0 && pidSet.has(proc.pid)) {
      return true;
    }
    return false;
  });
  const results: ChromeSessionDescription[] = [];
  for (const proc of candidates) {
    const [version, tabs] = await Promise.all([
      fetchJson(`http://localhost:${proc.port}/json/version`).catch(() => undefined),
      fetchJson(`http://localhost:${proc.port}/json/list`).catch(() => []),
    ]);
    const filteredTabs = Array.isArray(tabs)
      ? (tabs as ChromeTabInfo[]).filter((tab) => {
          const type = tab.type?.toLowerCase() ?? '';
          if (type && type !== 'page' && type !== 'app') {
            if (!tab.url || tab.url.startsWith('devtools://') || tab.url.startsWith('chrome-extension://')) {
              return false;
            }
          }
          if (!tab.url || tab.url.trim().length === 0) {
            return false;
          }
          return true;
        })
      : [];
    results.push({
      ...proc,
      version: (version as Record<string, string>) ?? undefined,
      tabs: filteredTabs,
    });
  }
  return results;
}

async function listDevtoolsChromes(): Promise<ChromeProcessInfo[]> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    console.warn('Chrome inspection is only supported on macOS and Linux for now.');
    return [];
  }
  let output = '';
  try {
    output = execSync('ps -ax -o pid=,command=', { encoding: 'utf8' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to enumerate processes: ${message}`);
  }
  const processes: ChromeProcessInfo[] = [];
  output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) {
        return;
      }
      const pid = Number.parseInt(match[1], 10);
      const command = match[2];
      if (!Number.isFinite(pid) || pid <= 0) {
        return;
      }
      if (!/chrome/i.test(command) || !/--remote-debugging-port/.test(command)) {
        return;
      }
      const portMatch = command.match(/--remote-debugging-port(?:=|\s+)(\d+)/);
      if (!portMatch) {
        return;
      }
      const port = Number.parseInt(portMatch[1], 10);
      if (!Number.isFinite(port)) {
        return;
      }
      processes.push({ pid, port, command });
    });
  return processes;
}

function fetchJson(url: string, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(undefined);
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Request to ${url} timed out`));
    });
    request.on('error', (error) => {
      reject(error);
    });
  });
}

program.parseAsync(process.argv);
