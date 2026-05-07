import { describe, expect, it } from 'vitest';
import {
  assertApiOpsBrowserStatus,
  formatApiOpsBrowserStatusCliSummary,
  readApiOpsBrowserStatusForCli,
} from '../../src/cli/apiOpsBrowserCommand.js';

const dashboardHtml = `
<nav aria-label="AuraCall sections">
  <a href="/ops/browser" data-route-key="dashboardPath" aria-current="page">Browser Ops</a>
  <a href="/account-mirror" data-route-key="accountMirrorPath">Account Mirror</a>
  <a href="/account-mirror/preview-session" data-route-key="previewSessionPath">Preview Session</a>
  <a id="navConfig" href="/config" data-route-key="configPath">Config</a>
  <a id="navAgentsTeams" href="/agents" data-route-key="agentsPath">Agents / Teams</a>
</nav>
<h1>AuraCall Config</h1>
<section><h2>Operations</h2><div id="opsControlNotice"></div><div id="opsControls"></div></section>
<section><h2>Account Mirrors</h2>
  <select id="mirrorCatalogProvider"></select>
  <input id="mirrorCatalogRuntimeProfile">
  <select id="mirrorCatalogKind"></select>
  <input id="mirrorCatalogSearch">
  <select id="mirrorCatalogPreviewFilter"><option>metadata only</option></select>
  <select id="mirrorCatalogSort"><option>previewable first</option></select>
  <input id="mirrorCatalogWithTranscriptOnly" type="checkbox">
  <input id="mirrorCatalogLimit">
  <button id="loadMirrorCatalog">Search Cache</button>
  <div id="mirrorCatalogSummary"></div>
  <div id="mirrorCatalogResults"></div>
  <div id="mirrorCatalogKindTabs">Cached item browser</div>
  <aside class="catalog-result-sidebar"><span id="mirrorCatalogNavigatorSummary">1 shown</span><div id="mirrorCatalogNavigator"></div></aside>
  <div id="mirrorCatalogDetail"></div>
  <div id="mirrorCatalogDetailView"></div>
  <pre id="mirrorCatalogDetailRaw"></pre>
  <pre id="mirrorCatalogRaw"></pre>
</section>
<section><h2>Service Discovery</h2><dl id="serviceDiscoverySummary"><dt>Local Dashboard</dt><dd>http://auracall.localhost/ops/browser</dd><dt>External Dashboard</dt><dd>https://auracall.ecochran.dyndns.org/ops/browser</dd><dt>Preview Session Path</dt><dd>/account-mirror/preview-session</dd><dt>Config Path</dt><dd>/config</dd><dt>Proxy Target</dt><dd>http://127.0.0.1:18080</dd><dt>Auth Guard</dt><dd>authelia</dd></dl></section>
<section id="configRoutingPanel"><h2>Config</h2><dl id="configRoutingSummary"></dl><pre id="configRoutingRaw">operatorConfigDashboard publicOperatorBrowserDashboardUrl externalServiceBaseUrl</pre></section>
<section id="configIdentityPanel"><h2>Bound Identities</h2><div id="configIdentitySummary">expectedIdentityKey detectedIdentityKey accountLevel</div></section>
<section id="configLiveFollowPanel"><h2>Live Follow Eligibility</h2><div id="configLiveFollowSummary">status.liveFollow desiredState nextAttemptAt mirrorCompleteness data-runtime-profile not live-follow enabled</div></section>
<section id="agentsTeamsPanel"><h2>Agents / Teams</h2><button id="loadAgentsRecentRuns">Load Recent Runs</button><div id="agentsRecentRuns"><table id="agentsRecentRunsTable"><thead><tr><th>Mirror</th></tr></thead><tbody><tr><td><button class="link-button" data-agents-recent-mirror-summary="available" data-account-mirror-path="/account-mirror?item=conv_1" onclick="openAgentsRecentMirrorSummary(this)">1 cached conversation</button><span data-agents-recent-mirror-cache-badge="pending" data-runtime-provider-cache-badge="pending" data-runtime-provider-cache-badge-state="pending" data-runtime-provider-catalog-item-path="/v1/account-mirrors/catalog/items/conv_1">checking cache</span></td><td><button data-mirror-detail-available="true" onclick="openAgentsRecentMirrorDetail(this)">Open Mirror Detail</button></td></tr></tbody></table></div><button id="inspectTeamRun">Inspect Team</button><button id="inspectRuntimeRun">Inspect Runtime</button><div id="agentsTeamsConversation" class="agents-runtime-conversation"><div class="agents-runtime-provider-conversations">Cached provider conversations <a class="link-button" data-runtime-provider-conversation-path="/account-mirror?item=conv_1" data-runtime-provider-conversation-direct-link="true">Conversation</a><span data-runtime-provider-cache-badge="pending" data-runtime-provider-cache-badge-state="pending">checking cache</span><a data-runtime-provider-catalog-item-path="/v1/account-mirrors/catalog/items/conv_1">cache item</a></div>Runtime Conversation</div><pre id="agentsTeamsRaw"></pre></section>
<section><h2>Mirror Live Follow</h2></section>
<div id="mirrorAttentionQueue"><table id="mirrorAttentionItems"></table></div>
<div id="mirrorTargetTable"><table id="mirrorTargetAccounts"></table></div>
<div id="mirrorActiveCompletionTable"><table id="mirrorActiveCompletions"></table></div>
<button data-completion-id="acctmirror_paused" onclick="fillMirrorCompletionId(this.dataset.completionId)">Use ID</button>
<button id="inspectMirrorCompletionById">Inspect</button>
<button data-completion-id="acctmirror_paused" onclick="inspectMirrorCompletion(this.dataset.completionId)">Inspect</button>
<button data-completion-id="acctmirror_paused" data-completion-action="pause" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Pause</button>
<button data-completion-id="acctmirror_paused" data-completion-action="resume" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Resume</button>
<button data-completion-id="acctmirror_paused" data-completion-action="cancel" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Cancel</button>
<div id="mirrorControlNotice" role="status" aria-live="polite"></div>
<div id="mirrorControlResultToast" class="notice control-result-toast">Completion control succeeded Live follow started</div>
<pre id="mirrorTargets">status.liveFollow.targets</pre>
<script>
  const OPERATOR_DASHBOARD_ROUTES = { dashboardPath: '/ops/browser', accountMirrorPath: '/account-mirror', previewSessionPath: '/account-mirror/preview-session', configPath: '/config', agentsPath: '/agents' };
  function setMirrorControlNotice(message, tone) {}
  function setMirrorControlResultToast(input) { return input.operation.nextAttemptAt; }
  function confirmMirrorCompletionCancel(id, action = 'cancel') { if (action === 'cancel') return window.confirm('Cancel live-follow completion ' + id + '?'); return 'Cancel not sent'; }
  function renderOpsControls() {}
  function renderServiceDiscovery(status) { return status.serviceDiscovery.routing.previewSessionPath + status.serviceDiscovery.routing.configPath; }
  function renderConfigRouting(status) { return status.routes.operatorConfigDashboard; }
  function renderConfigIdentityProjection(status) { return status.accountMirrorStatus.entries[0].expectedIdentityKey; }
  function renderConfigLiveFollowProjection(status) { return status.liveFollow.targets.accounts[0].desiredState; }
  function renderLiveFollowAccountControls(target) { return target.activeCompletionId || 'not live-follow enabled'; }
  async function startMirrorCompletionForTarget(provider, runtimeProfile) { return postJson('/v1/account-mirrors/completions', { provider, runtimeProfile }); }
  function applyServiceDiscoveryRoutes() {}
  function isAccountMirrorRoute() {}
  function isPreviewSessionRoute() {}
  function isAgentsTeamsRoute() {}
  async function loadAgentsRecentRuns() { return fetchJson('/v1/runtime-runs/recent?' + new URLSearchParams({ limit: '25' }).toString()); }
  function useAgentsRecentRun() {}
  async function inspectAgentsRecentRuntimeRun() {}
  function renderAgentsRecentMirrorSummary(summary) { return summary.firstAccountMirrorPath + summary.firstCatalogItemPath + summary.conversations + renderAgentsRecentMirrorCacheBadge(summary) + '<button data-account-mirror-path="/account-mirror?item=conv_1" onclick="openAgentsRecentMirrorSummary(this)">1 cached conversation</button>'; }
  function renderAgentsRecentMirrorCacheBadge(summary) { return '<span data-agents-recent-mirror-cache-badge="pending" data-runtime-provider-catalog-item-path="' + summary.firstCatalogItemPath + '"></span>'; }
  function renderAgentsRecentMirrorCacheBadgeButton(ref) { return '<button data-account-mirror-path="' + ref.accountMirrorPath + '"></button>'; }
  function openAgentsRecentMirrorCacheBadge(button) { window.location.href = button.dataset.accountMirrorPath; }
  function openAgentsRecentMirrorSummary(button) { const path = button.dataset.accountMirrorPath || ''; if (!path) return 'No cached provider conversation link is available for this summary.'; window.location.href = path; }
  function hasAgentsRecentMirrorDetail() { return 'No stored provider conversation link for this run'; }
  function renderAgentsRuntimeConversation() {}
  function renderAgentsRuntimeConversationTurn() {}
  function renderAgentsRuntimeProviderConversationRefs() { return providerConversationRefs; }
  function renderAgentsRuntimeProviderConversationRef() {}
  function hydrateAgentsRuntimeProviderCacheBadges() { return fetchJson('/v1/account-mirrors/catalog/items/conv_1').then(summarizeAgentsRuntimeProviderCacheDetail); }
  function summarizeAgentsRuntimeProviderCacheDetail(item) { return String(item.hasCachedTranscript) + String(item.messageCount) + 'cached transcript metadata only metadata + assets'; }
  async function openAgentsRecentMirrorDetail() { const path = readAgentsRuntimeMirrorDetailPath({ inspection: { conversation: { providerConversationRefs: [{ accountMirrorPath: '/account-mirror?item=conv_1' }] } } }); window.location.href = path; }
  function readAgentsRuntimeMirrorDetailPath(payload) { return payload.inspection.conversation.providerConversationRefs[0].accountMirrorPath; }
  async function inspectAgentsTeamRun() { return fetchJson('/v1/team-runs/inspect?' + new URLSearchParams({ teamRunId: 'team' }).toString()); }
  async function inspectAgentsRuntimeRun() { return fetchJson('/v1/runtime-runs/inspect?' + new URLSearchParams({ runtimeRunId: 'runtime' }).toString()); }
  function renderAttentionQueue() {}
  function collectAttentionRows() {}
  function flattenMirrorCatalogEntries() {}
  function filterMirrorCatalogRows() {}
  function hasCachedCatalogTranscript() {}
  function renderCatalogMaterializationBadge() { return 'asset local'; }
  function formatCatalogMaterializationStatus() { return 'local cached asset metadata only asset'; }
  function classifyCatalogItemPreview() {}
  function hasCatalogItemPreviewSignal() {}
  function countPreviewableCatalogRows() { return 'previewable'; }
  function matchesCatalogPreviewFilter() {}
  function sortMirrorCatalogRows() {}
  function compareMirrorCatalogRows() {}
  function compareCatalogPreviewRank() {}
  function renderCatalogRowActions() { return '<span class="catalog-row-actions"><a>Open Preview</a><button class="link-button" data-catalog-preview-url="/asset">Copy URL</button></span>'; }
  function resolveCatalogRowPreviewUrl() {}
  function buildMirrorCatalogItemAssetPath() {}
  async function copyCatalogPreviewUrl() { await navigator.clipboard.writeText('url'); }
  function collectVisibleCatalogPreviewUrls() { return []; }
  function collectVisibleCatalogPreviewEntries() { return [{ url: 'https://example.com/asset.png', provider: 'chatgpt', kind: 'artifacts', title: 'Example Asset', itemId: 'artifact_1', boundIdentity: 'default', updatedAt: '2026-05-04T00:00:00.000Z' }]; }
  function showVisibleMirrorCatalogPreviewUrls() {
    mirrorCatalogPreviewUrlDrawer.hidden = false;
    mirrorCatalogPreviewUrlList.textContent = collectVisibleCatalogPreviewUrls().join('\\n') || 'No visible preview URLs.';
    setMirrorCatalogBatchNotice('Previewing 1 visible preview URL(s).', 'ok');
  }
  function hideVisibleMirrorCatalogPreviewUrls() { mirrorCatalogPreviewUrlDrawer.hidden = true; }
  function reviewVisibleMirrorCatalogPreviews() {
    const selectedEntries = collectVisibleCatalogPreviewEntries();
    localStorage.setItem('auracall.previewSession.preview-1', JSON.stringify({ items: selectedEntries, urls: selectedEntries.map((entry) => entry.url) }));
    window.open(routeWithQuery(OPERATOR_DASHBOARD_ROUTES.previewSessionPath || '/account-mirror/preview-session', 'session=' + encodeURIComponent('preview-1')), '_blank', 'noopener,noreferrer');
    setMirrorCatalogBatchNotice('Opened preview session for 1 visible preview URL(s).', 'ok');
  }
  function openVisibleMirrorCatalogPreviewUrls() {
    if (!collectVisibleCatalogPreviewUrls().length) setMirrorCatalogBatchNotice('No visible preview URLs to open.', 'warn');
    collectVisibleCatalogPreviewUrls().slice(0, 8).forEach((url) => window.open(url, '_blank', 'noopener,noreferrer'));
    setMirrorCatalogBatchNotice('Opened 1 visible preview URL(s). Limited to first 8 of 9.', 'ok');
  }
  async function copyVisibleMirrorCatalogPreviewUrls() {
    const urls = collectVisibleCatalogPreviewUrls();
    await navigator.clipboard.writeText(urls.join('\\n'));
    setMirrorCatalogBatchNotice('Copied ' + String(urls.length) + ' visible preview URL(s)', 'ok');
  }
  function setMirrorCatalogBatchNotice() { mirrorCatalogBatchNotice.textContent = 'Copied'; }
  <button id="showVisibleMirrorCatalogPreviewUrls">Preview visible URL list</button>
  <button id="reviewVisibleMirrorCatalogPreviews">Review visible previews</button>
  <button id="openVisibleMirrorCatalogPreviewUrls">Open visible previews</button>
  <button id="copyVisibleMirrorCatalogPreviewUrls">Copy visible preview URLs</button>
  <button id="downloadVisibleMirrorCatalogPreviewUrls">Download visible preview URL list</button>
  <button id="hideVisibleMirrorCatalogPreviewUrls">Close</button>
  <div id="mirrorCatalogBatchNotice"></div>
  <div id="mirrorCatalogPreviewUrlDrawer"><strong>Visible preview URLs</strong><pre id="mirrorCatalogPreviewUrlList">No visible preview URLs.</pre></div>
  <section id="mirrorPreviewSessionPanel"><h2>Cached Preview Session</h2><input id="savedMirrorPreviewSessionSearch"><button id="refreshSavedMirrorPreviewSessionTable">Refresh saved session list</button><div id="savedMirrorPreviewSessionTable"><button data-saved-preview-action="load">Load</button><a href="'saved=' + encodeURIComponent(id)">Open</a></div><button id="selectAllMirrorPreviewSessionItems">Select all</button><button id="clearMirrorPreviewSessionSelection">Select none</button><button>Copy selected URLs</button><button>Download selected URL list</button><button>Download selected manifest</button><input id="mirrorPreviewSessionName"><button id="saveMirrorPreviewSession">Save named session</button><button id="refreshMirrorPreviewSessionList">Refresh saved sessions</button><select id="savedMirrorPreviewSessions"></select><button id="loadSavedMirrorPreviewSession">Load saved session</button><button id="renameSavedMirrorPreviewSession">Rename saved session</button><button id="deleteSavedMirrorPreviewSession">Delete saved session</button><label>Load manifest <input id="loadMirrorPreviewSessionManifest" type="file"></label><div id="mirrorPreviewSessionNotice">Rendering 1 cached preview URL(s)</div><div id="mirrorPreviewSessionGrid" class="preview-session-grid"></div></section>
  function initializeMirrorPreviewSession() {}
  async function refreshSavedMirrorPreviewSessions() { await fetchJson('/v1/account-mirrors/preview-sessions?limit=50'); }
  async function saveMirrorPreviewSession() { await postJson('/v1/account-mirrors/preview-sessions', {}); }
  async function loadSelectedSavedMirrorPreviewSession() {}
  async function loadSavedMirrorPreviewSessionById(id) { await fetchJson('/v1/account-mirrors/preview-sessions/' + encodeURIComponent(id)); }
  async function renameSelectedSavedMirrorPreviewSession() { await patchJson('/v1/account-mirrors/preview-sessions/session', {}); }
  async function deleteSelectedSavedMirrorPreviewSession() { await deleteJson('/v1/account-mirrors/preview-sessions/session'); }
  async function patchJson() {}
  async function deleteJson() {}
  function renderSavedMirrorPreviewSessionTable() {}
  function handleSavedMirrorPreviewSessionTableClick() {}
  function readMirrorPreviewSessionUrls() { return []; }
  function normalizeMirrorPreviewSessionManifest() { return []; }
  function normalizeMirrorPreviewSessionItems() { return []; }
  function renderMirrorPreviewSession() { return 'Rendering cached preview URL(s)'; }
  function renderMirrorPreviewSessionItem() { return '<input class="mirror-preview-session-select" data-preview-url="https://example.com/asset.png"><dt>Item ID</dt><dd>artifact_1</dd><span>boundIdentity</span>'; }
  function selectedMirrorPreviewSessionUrls() { return []; }
  function selectedMirrorPreviewSessionItems() { return []; }
  function setMirrorPreviewSessionSelection() {}
  function updateMirrorPreviewSessionSelection() {}
  async function copyMirrorPreviewSessionUrls() {}
  function downloadMirrorPreviewSessionUrls() {}
  function buildSelectedMirrorPreviewSessionManifest() { return {}; }
  function downloadMirrorPreviewSessionManifest() { return 'auracall.preview-session-manifest.v1'; }
  async function loadMirrorPreviewSessionManifestFile() {}
  function downloadVisibleMirrorCatalogPreviewUrls() {
    new Blob([], { type: 'text/plain;charset=utf-8' });
    URL.createObjectURL(new Blob());
    URL.revokeObjectURL('blob:preview');
    setMirrorCatalogBatchNotice('Downloaded 1 visible preview URL(s)', 'ok');
  }
  function formatVisibleCatalogPreviewUrlsFilename() { return 'auracall-preview-urls-chatgpt-artifacts.txt'; }
  function renderMirrorCatalogTable() {
    return '<table id="mirrorCatalogItems"><thead><tr><th>Transcript</th><th>Preview</th></tr></thead><tr class="catalog-row-selected" data-catalog-row-index="0"><td><a href="/v1/account-mirrors/catalog/items/conv_1?provider=chatgpt&runtimeProfile=default&kind=conversations" data-catalog-item-path="/v1/account-mirrors/catalog/items/conv_1?provider=chatgpt&runtimeProfile=default&kind=conversations">Details</a></td></tr></table>';
  }
  function renderMirrorCatalogNavigator() { return '<button class="catalog-result-button catalog-nav-selected">Conversation</button>'; }
  function renderMirrorCatalogNavigatorItem() {}
  function focusMirrorCatalogSearch() {}
  function handleMirrorCatalogKeyboard(event) {
    if (event.key === '/') focusMirrorCatalogSearch();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') showMirrorCatalogDetailByIndex('0');
  }
  document.addEventListener('keydown', handleMirrorCatalogKeyboard);
  function setMirrorCatalogKindFilter() {}
  function openDefaultMirrorCatalogDetail() {}
  function renderCatalogTranscriptBadge(row) {
    return row.hasCachedTranscript ? String(row.messageCount) : 'none';
  }
  function formatCatalogTranscriptStatus(item) {
    return item.hasCachedTranscript ? String(item.messageCount) : 'none';
  }
  function initializeMirrorCatalogFiltersFromUrl() {
    params.get('provider');
    params.get('search');
    params.get('item');
    params.get('itemKind');
    params.get('preview');
    params.get('sort');
    params.get('withTranscript');
  }
  function updateMirrorCatalogUrl() {
    const withTranscriptOnly = true;
    window.history.replaceState(null, '', '/account-mirror?provider=chatgpt&search=test&withTranscript=1&item=conv_1&itemKind=conversations');
  }
  function updateMirrorCatalogDetailUrl() {}
  function readMirrorCatalogDetailSelectionFromUrl() {}
  function openSelectedMirrorCatalogDetailFromUrl() {}
  function buildMirrorCatalogItemPathFromSelection() {}
  function updateMirrorCatalogDetailUrlFromPath() {}
  function showMirrorCatalogDetailByIndex(index) {
    $('mirrorCatalogDetailRaw').textContent = index;
  }
  async function showMirrorCatalogDetailByPath(path) {
    await fetch(path);
  }
  function renderConversationDetailView() {
    return '<div>Cached related items</div><a data-related-item-path="/v1/account-mirrors/catalog/items/file_1?provider=chatgpt&runtimeProfile=default&kind=files" target="_blank" rel="noreferrer">file</a><input id="mirrorConversationTranscriptSearch" placeholder="Search cached transcript" /><button>Download Transcript.md</button><div class="chat-transcript"><div class="chat-bubble">hello</div></div>';
  }
  function renderConversationRelatedItems() {}
  function renderConversationRelatedLink() {}
  function buildRelatedCatalogItemPath() { return { kind, }; }
  function renderCachedAssetDetailView() { return '<strong>Cached item inspector</strong><div>Cached URLs</div><div class="asset-preview">Cached preview</div>'; }
  function renderCatalogItemInspectorFields() {}
  function renderCatalogItemExternalLinks() {}
  function renderCatalogExternalLink() {}
  function renderCatalogItemPreview() {}
  function resolveCatalogItemPreview() {}
  function buildCatalogItemAssetPath() {
    return '/v1/account-mirrors/catalog/items/' + encodeURIComponent(itemId) + '/asset?' + String(assetStorageRelpath || storageRelpath);
  }
  function readCatalogPreviewUrl() {}
  function isSafePreviewUrl() {}
  function formatCatalogItemSize() {}
  function extractConversationTurns() {}
  function renderChatTurn() {}
  function downloadCurrentMirrorConversationTranscript() {
    new Blob([], { type: 'text/markdown;charset=utf-8' });
  }
  function renderConversationTranscriptMarkdown() {}
  function formatTranscriptFilename() {}
  function filterCurrentMirrorConversationTranscript() { turn.textContent; }
  function clearCurrentMirrorConversationTranscriptSearch() {}
  function normalizeTranscriptSearchTerm() {}
  async function loadMirrorCatalog() {
    await fetch('/v1/account-mirrors/catalog?kind=all&limit=50');
  }
  async function controlBackgroundDrain(action) {
    await fetch('/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backgroundDrain: { action } }),
    });
  }
  async function controlMirrorScheduler(action, dryRun) {
    await fetch('/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountMirrorScheduler: { action } }),
    });
  }
  '<div id="backgroundDrainControls"><button id="pauseBackgroundDrain">Pause</button><button id="resumeBackgroundDrain">Resume</button></div>';
  '<div id="mirrorSchedulerControls"><button id="runMirrorScheduler">Run Now</button><button id="dryRunMirrorScheduler">Dry Run</button><button id="pauseMirrorScheduler">Pause</button><button id="resumeMirrorScheduler">Resume</button></div>';
  controlMirrorScheduler('run-once', false);
  function completionActionsForStatus(status) {
    if (status === 'paused') return ['resume', 'cancel'];
    if (status === 'queued' || status === 'running' || status === 'refreshing') return ['pause', 'cancel'];
    return [];
  }
  async function controlMirrorCompletion(action) {
    await fetch('/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountMirrorCompletion: { id, action } }),
    });
  }
  async function inspectMirrorCompletion(id) {
    await fetch('/v1/account-mirrors/completions/' + encodeURIComponent(id));
  }
  async function inspectSelectedMirrorCompletion() {
    await inspectMirrorCompletion($('mirrorCompletionId').value.trim());
  }
  $('inspectMirrorCompletionById').addEventListener('click', inspectSelectedMirrorCompletion);
  $('pauseMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('pause'));
  $('resumeMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('resume'));
  $('cancelMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('cancel'));
</script>`;

const statusPayload = {
  ok: true,
  serviceDiscovery: {
    bind: {
      host: '127.0.0.1',
      port: 18080,
      url: 'http://127.0.0.1:18080',
      localOnly: true,
    },
    local: {
      hostname: 'auracall.localhost',
      baseUrl: 'http://auracall.localhost',
      dashboardUrl: 'http://auracall.localhost/ops/browser',
      accountMirrorUrl: 'http://auracall.localhost/account-mirror',
    },
    external: {
      hostname: 'auracall.ecochran.dyndns.org',
      baseUrl: 'https://auracall.ecochran.dyndns.org',
      dashboardUrl: 'https://auracall.ecochran.dyndns.org/ops/browser',
      accountMirrorUrl: 'https://auracall.ecochran.dyndns.org/account-mirror',
    },
    routing: {
      dashboardPath: '/ops/browser',
      accountMirrorPath: '/account-mirror',
      previewSessionPath: '/account-mirror/preview-session',
      configPath: '/config',
      agentsPath: '/agents',
      proxyTarget: 'http://127.0.0.1:18080',
      auth: 'authelia',
      ingress: 'traefik',
    },
  },
  accountMirrorScheduler: {
    enabled: true,
    state: 'idle',
    dryRun: true,
    operatorStatus: {
      posture: 'healthy',
      reason: null,
      backpressureReason: 'none',
    },
    lastPass: {
      backpressure: {
        reason: 'none',
      },
    },
  },
  accountMirrorCompletions: {
    object: 'account_mirror_completion_summary',
    generatedAt: '2026-05-01T12:00:00.000Z',
    metrics: {
      total: 1,
      active: 1,
      queued: 0,
      running: 0,
      paused: 1,
      completed: 0,
      blocked: 0,
      failed: 0,
      cancelled: 0,
    },
    active: [
      {
        id: 'acctmirror_paused',
        provider: 'chatgpt',
        runtimeProfileId: 'default',
        mode: 'live_follow',
        phase: 'steady_follow',
        status: 'paused',
        startedAt: '2026-05-01T11:00:00.000Z',
        completedAt: null,
        nextAttemptAt: '2026-05-01T12:05:00.000Z',
        passCount: 3,
        error: null,
      },
    ],
    recent: [],
  },
};

describe('api ops browser CLI helpers', () => {
  it('checks dashboard control wiring and linked status expectations', async () => {
    const fetchImpl = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/ops/browser')) {
        return new Response(dashboardHtml, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      if (url.endsWith('/status')) {
        return Response.json(statusPayload);
      }
      return new Response('not found', { status: 404 });
    };

    const summary = await readApiOpsBrowserStatusForCli({
      host: '127.0.0.1',
      port: 18080,
    }, fetchImpl as typeof fetch);

    expect(summary.dashboard).toMatchObject({
      hasNavigationScaffold: true,
      hasConfigBackedNavigationRoutes: true,
      hasConfigPage: true,
      hasConfigIdentityProjection: true,
      hasConfigLiveFollowProjection: true,
      hasConfigLiveFollowControls: true,
      hasAgentsTeamsPage: true,
      hasAgentsRecentRunsBrowser: true,
      hasAgentsRuntimeConversationView: true,
      hasAgentsRuntimeProviderConversationLinks: true,
      hasAgentsRuntimeProviderConversationDirectLinks: true,
      hasAgentsRuntimeProviderConversationCacheBadges: true,
      hasAgentsRecentRunMirrorDetailAction: true,
      hasAgentsRecentRunMirrorSummary: true,
      hasAgentsRecentRunMirrorSummaryDirectLink: true,
      hasAgentsRecentRunMirrorCacheBadges: true,
      hasOperationsPanel: true,
      hasServiceDiscoveryPanel: true,
      hasBackgroundDrainControls: true,
      hasMirrorSchedulerControls: true,
      hasRunOnceSchedulerControl: true,
      usesBackgroundDrainPayload: true,
      usesAccountMirrorSchedulerPayload: true,
      hasMirrorLiveFollowPanel: true,
      hasLiveFollowTargetsPanel: true,
      hasAttentionQueue: true,
      hasLiveFollowTargetTable: true,
      hasActiveCompletionTable: true,
      hasCompletionInspectAction: true,
      hasCompletionResultToast: true,
      hasCompletionInputInspectControl: true,
      hasCompletionIdFillControl: true,
      hasInlineCompletionActionControls: true,
      hasStateAwareCompletionActions: true,
      hasCancelConfirmation: true,
      hasControlFeedbackNotice: true,
      usesStatusControlPath: true,
      usesAccountMirrorCompletionPayload: true,
      hasPauseBinding: true,
      hasResumeBinding: true,
      hasCancelBinding: true,
      hasAccountMirrorCatalogPanel: true,
      hasCatalogSearchControls: true,
      hasCatalogResultsTable: true,
      hasAccountMirrorPageLink: true,
      hasAccountMirrorPreviewSessionPage: true,
      hasCatalogSavedFilterState: true,
      hasCatalogDetailInspection: true,
      hasConversationChatDetailView: true,
      hasConversationTranscriptAffordance: true,
      hasConversationTranscriptOnlyFilter: true,
      hasConversationTranscriptDownload: true,
      hasConversationTranscriptSearch: true,
      hasConversationRelatedItemNavigation: true,
      hasCatalogAssetDetailInspector: true,
      hasCatalogAssetPreview: true,
      hasCatalogLocalAssetRoute: true,
      hasCatalogMaterializationBadges: true,
      hasCatalogMaterializationControls: true,
      hasCatalogRowPreviewActions: true,
      hasCatalogBatchPreviewUrlDrawer: true,
      hasCatalogBatchPreviewSessionReview: true,
      hasCatalogBatchPreviewUrlOpen: true,
      hasCatalogBatchPreviewUrlCopy: true,
      hasCatalogBatchPreviewUrlDownload: true,
      usesAccountMirrorCatalogItemPath: true,
      usesAccountMirrorCatalogPath: true,
    });
    expect(summary.dashboardUrl).toBe('http://127.0.0.1:18080/ops/browser');
    expect(summary.serviceDiscovery).toMatchObject({
      localBaseUrl: 'http://auracall.localhost',
      externalBaseUrl: 'https://auracall.ecochran.dyndns.org',
      proxyTarget: 'http://127.0.0.1:18080',
      auth: 'authelia',
    });
    expect(summary.status.liveFollow.severity).toBe('paused');
    expect(() => assertApiOpsBrowserStatus(summary, {
      expectedSeverity: 'paused',
      expectedActive: 1,
      expectedPaused: 1,
    })).not.toThrow();
    expect(formatApiOpsBrowserStatusCliSummary(summary)).toContain(
      'Dashboard URL: http://127.0.0.1:18080/ops/browser',
    );
    expect(formatApiOpsBrowserStatusCliSummary(summary)).toContain(
      'Service discovery: local=http://auracall.localhost external=https://auracall.ecochran.dyndns.org proxy=http://127.0.0.1:18080 auth=authelia',
    );
    expect(formatApiOpsBrowserStatusCliSummary(summary)).toContain(
      'Dashboard config: page=ok identities=ok liveFollow=ok controls=ok agents=ok recentRuns=ok runtimeChat=ok runtimeProviderLinks=ok runtimeProviderDirectLinks=ok runtimeProviderCacheBadges=ok recentMirrorDetail=ok recentMirrorSummary=ok recentMirrorDirectLink=ok recentMirrorCacheBadges=ok',
    );
    expect(formatApiOpsBrowserStatusCliSummary(summary)).toContain(
      'Dashboard service control: nav=ok operations=ok backgroundDrain=ok scheduler=ok runOnce=ok',
    );
    expect(formatApiOpsBrowserStatusCliSummary(summary)).toContain(
      'Dashboard cache browse: catalog=ok page=ok previewSession=ok search=ok savedFilters=ok table=ok detail=ok chat=ok transcript=ok transcriptFilter=ok transcriptDownload=ok transcriptSearch=ok related=ok assetInspector=ok assetPreview=ok localAsset=ok materialization=ok materializationControls=ok rowPreviewActions=ok batchPreviewDrawer=ok batchPreviewReview=ok batchPreviewOpen=ok batchPreviewCopy=ok batchPreviewDownload=ok path=/v1/account-mirrors/catalog itemPath=/v1/account-mirrors/catalog/items/{id}',
    );
    expect(formatApiOpsBrowserStatusCliSummary(summary)).toContain(
      'Dashboard completion control: path=/status payload=accountMirrorCompletion attention=ok activeTable=ok inspect=ok resultToast=ok inputInspect=ok input=ok rowActions=ok stateAware=ok confirmCancel=ok feedback=ok pause=ok resume=ok cancel=ok',
    );
  });

  it('prefers the configured dashboard URL advertised by status', async () => {
    const fetchImpl = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/ops/browser')) {
        return new Response(dashboardHtml, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      if (url.endsWith('/status')) {
        return Response.json({
          ...statusPayload,
          routes: {
            operatorBrowserDashboard: '/ops/browser',
            operatorBrowserDashboardUrl: 'http://auracall.localhost/ops/browser',
          },
        });
      }
      return new Response('not found', { status: 404 });
    };

    const summary = await readApiOpsBrowserStatusForCli({
      host: '127.0.0.1',
      port: 18080,
    }, fetchImpl as typeof fetch);

    expect(summary.dashboardUrl).toBe('http://auracall.localhost/ops/browser');
  });

  it('lets an explicit dashboard URL override status metadata', async () => {
    const fetchImpl = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/ops/browser')) {
        return new Response(dashboardHtml, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      return Response.json({
        ...statusPayload,
        routes: {
          operatorBrowserDashboard: '/ops/browser',
          operatorBrowserDashboardUrl: 'http://auracall.localhost/ops/browser',
        },
      });
    };

    const summary = await readApiOpsBrowserStatusForCli({
      host: '127.0.0.1',
      port: 18080,
      dashboardUrl: 'https://auracall.ecochran.dyndns.org/ops/browser',
    }, fetchImpl as typeof fetch);

    expect(summary.dashboardUrl).toBe('https://auracall.ecochran.dyndns.org/ops/browser');
  });

  it('fails when dashboard control wiring drifts', async () => {
    const fetchImpl = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/ops/browser')) {
        return new Response(dashboardHtml.replaceAll("fetch('/status'", "fetch('/wrong-status'"), {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      return Response.json(statusPayload);
    };

    const summary = await readApiOpsBrowserStatusForCli({
      host: '127.0.0.1',
      port: 18080,
    }, fetchImpl as typeof fetch);

    expect(() => assertApiOpsBrowserStatus(summary)).toThrow(
      'Expected /ops/browser completion controls to call POST /status.',
    );
  });
});
