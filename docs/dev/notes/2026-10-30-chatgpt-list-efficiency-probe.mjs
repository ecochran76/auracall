// Offline research probe. Executes current source functions; never opens a browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const filename = 'src/browser/providers/chatgptAdapter.ts';
const source = fs.readFileSync(filename, 'utf8');
const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
function load(name, bindings) {
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  const text = declaration.getText(ast).replace(/^export\s+/, '');
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return vm.runInNewContext(`${js}\n${name}`, bindings);
}

async function listing({ virtual = false, concurrent = 1, cancel = false } = {}) {
  let reads = 0, scrolls = 0, sleeps = 0, recoveryOptions;
  const controller = new AbortController();
  if (cancel) controller.abort();
  const jobs = Array.from({ length: concurrent }, async () => {
    let page = 0;
    const read = async () => {
      reads++;
      const size = virtual ? 8 : Math.min(24, 8 * (page + 1));
      return Array.from({ length: size }, (_, index) => ({ id: `conversation-${virtual ? page * 8 + index : index}`, title: 'fixture', provider: 'chatgpt' }));
    };
    const history = load('readChatgptConversationHistory', {
      Math: { ...Math, min: Math.min, max: Math.max, ceil: Math.ceil, floor: Math.floor, random: () => 0 },
      sleep: async () => { sleeps++; },
      scrollChatgptConversationHistoryRail: async () => {
        scrolls++; page++;
        return { moved: virtual || page < 3, canScroll: virtual || page < 3, anchorCount: 8 };
      },
    });
    const scrape = load('scrapeChatgptConversations', {
      normalizeChatgptProjectId: () => null,
      normalizeChatgptConversationHistoryLimit: (n) => n,
      ensureChatgptSidebarOpen: async () => {},
      CHATGPT_CONVERSATION_OPTIONS_PREFIX: 'open conversation options for',
      normalizeChatgptConversationLinkProbes: (value) => value,
      readChatgptConversationHistory: history,
      buildChatgptListReopen: () => async () => ({}),
      withChatgptBlockingSurfaceRecovery: async (_client, _action, fn, options) => { recoveryOptions = options; return fn(); },
    });
    return scrape({ Runtime: { evaluate: async () => ({ result: { value: await read() } }) } }, null,
      { includeHistory: true, historyLimit: virtual ? 40 : 25, accountMirrorInventory: true, allowNavigation: false, abortSignal: controller.signal });
  });
  const results = await Promise.all(jobs);
  return { reads, scrolls, sleeps, returned: results.map((rows) => rows.length), firstIds: results.map((rows) => rows[0]?.id), recoveryReceivedProviderOptions: recoveryOptions?.providerOptions !== undefined };
}

const cumulative = await listing();
const concurrent = await listing({ concurrent: 3 });
const virtualized = await listing({ virtual: true });
const alreadyAborted = await listing({ cancel: true });
assert.deepEqual(cumulative.returned, [24]);
assert.equal(cumulative.reads, 7);
assert.equal(cumulative.scrolls, 5);
assert.equal(concurrent.reads, cumulative.reads * 3);
assert.deepEqual(virtualized.returned, [8]);
assert.equal(virtualized.firstIds[0], 'conversation-40');
assert.equal(virtualized.recoveryReceivedProviderOptions, false);
assert.equal(alreadyAborted.scrolls, cumulative.scrolls);

// Execute the generated auth expression with an offline fetch boundary.
let authFetches = 0;
const expression = load('buildChatgptAuthSessionIdentityExpression', {})();
const contexts = Array.from({ length: 3 }, () => vm.runInNewContext(expression, {
  AbortController, setTimeout, clearTimeout,
  fetch: async (url) => { assert.equal(url, '/api/auth/session'); authFetches++; return { ok: true, json: async () => ({ user: { id: 'synthetic', email: 'fixture@example.invalid' } }) }; },
}));
await Promise.all(contexts);
assert.equal(authFetches, 3);

// Exercise the actual recovery wrapper and actual reopen callback, with effects
// intercepted. A synthetic rate-limit warning must not touch a live provider.
let recoveryEffects = 0, reopens = 0;
const hardStop = load('isChatgptAccountMirrorHardStop', {});
const recovery = load('withChatgptBlockingSurfaceRecovery', {
  CHATGPT_RATE_LIMIT_RECOVERY_PAUSE_MS: 15_000,
  isChatgptAccountMirrorHardStop: hardStop,
  createChatgptBlockingSurfaceError: () => new Error('synthetic hard stop'),
  beforeChatgptBrowserInteraction: async () => {},
  recoverVisibleChatgptBlockingSurfaceWithClient: async () => { recoveryEffects++; return { action: 'dismiss-overlay' }; },
  withBlockingSurfaceRecovery: async (_fn, options) => { await options.dismiss({ kind: 'rate-limit', summary: 'synthetic warning' }); return []; },
});
const reopen = load('buildChatgptListReopen', {
  navigateToChatgptUrl: async () => { reopens++; },
  resolveChatgptConversationListUrl: () => 'https://chatgpt.com/',
  normalizeChatgptProjectId: () => null,
});
const warningScrape = load('scrapeChatgptConversations', {
  withChatgptBlockingSurfaceRecovery: recovery,
  buildChatgptListReopen: reopen,
});
await warningScrape({}, null, { accountMirrorInventory: true, allowNavigation: false });
assert.equal(recoveryEffects, 1);
assert.equal(reopens, 1);
// Control: supplying the dropped options to the wrapper enforces the hard stop.
await assert.rejects(recovery({}, 'fixture', async () => [], {
  providerOptions: { accountMirrorInventory: true, allowNavigation: false },
}), /synthetic hard stop/);
assert.equal(recoveryEffects, 1);
assert.equal(reopens, 1);
console.log(JSON.stringify({ cumulative, concurrent, virtualized, alreadyAborted, threeAuthObservationsFetches: authFetches, syntheticRateLimit: { recoveryEffects, reopens, forwardedOptionsControlStops: true }, boundary: 'actual source loops, recovery wrapper/reopen and generated auth expression; simulated DOM/scroll/effect/fetch boundaries; zero provider traffic' }, null, 2));
