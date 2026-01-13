#!/usr/bin/env tsx
/**
 * Lightweight browser connectivity smoke test.
 * - Reuses an existing DevTools port when available, otherwise launches Chrome on a fallback port.
 * - Verifies the DevTools /json/version endpoint responds.
 * - Prints a WSL-friendly firewall hint if the port is unreachable.
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from 'chrome-launcher';
import { resolveWslHost, buildWslFirewallHint } from '../src/browser/chromeLifecycle.js';
import { resolveScriptBrowserTarget } from './browser-target.js';

const DEFAULT_PORT = 45871;
const hostHint = resolveWslHost();
const targetHost = hostHint ?? '127.0.0.1';

async function fetchVersion(host: string, devtoolsPort: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`http://${host}:${devtoolsPort}/json/version`, { signal: controller.signal });
    if (!res.ok) return false;
    const json = (await res.json()) as { webSocketDebuggerUrl?: string };
    return Boolean(json.webSocketDebuggerUrl);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  // Oracle-only tool: keep using Oracle's browser-service wrappers for config + registry lookup.
  const { host, port } = await resolveScriptBrowserTarget({ fallbackPort: DEFAULT_PORT });
  let ok = await fetchVersion(host, port);
  if (ok) {
    console.log(`[browser-test] PASS: DevTools responding on ${host}:${port}`);
    process.exit(0);
  }

  console.log(`[browser-test] launching Chrome on ${targetHost}:${port} (headful)…`);
  const chrome = await launch({
    port,
    chromeFlags: ['--remote-debugging-address=0.0.0.0'],
  });

  ok = await fetchVersion(targetHost, chrome.port);
  if (!ok) {
    await sleep(500);
    ok = await fetchVersion(targetHost, chrome.port);
  }

  await chrome.kill();

  if (ok) {
    console.log(`[browser-test] PASS: DevTools responding on ${targetHost}:${chrome.port}`);
    process.exit(0);
  }

  const hint = buildWslFirewallHint(targetHost, chrome.port);
  console.error(`[browser-test] FAIL: DevTools not reachable at ${targetHost}:${chrome.port}`);
  if (hint) {
    console.error(`${hint}\n\nRe-run ./runner pnpm test:browser after adding the rule.`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error('[browser-test] Unexpected failure:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
