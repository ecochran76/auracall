import {
  assertApiStatusCompletionMetrics,
  assertApiStatusLiveFollowSeverity,
  readApiStatusForCli,
  type ApiStatusCliOptions,
  type ApiStatusCliSummary,
  type ApiStatusCompletionMetricsExpectation,
  type ApiStatusLiveFollowSeverityExpectation,
} from './apiStatusCommand.js';

export interface ApiOpsBrowserStatusCliOptions extends ApiStatusCliOptions {
  dashboardUrl?: string | null;
}

export interface ApiOpsBrowserDashboardSummary {
  route: '/ops/browser';
  hasNavigationScaffold: boolean;
  hasConfigBackedNavigationRoutes: boolean;
  hasConfigPage: boolean;
  hasConfigIdentityProjection: boolean;
  hasConfigLiveFollowProjection: boolean;
  hasConfigLiveFollowControls: boolean;
  hasAgentsTeamsPage: boolean;
  hasAgentsRecentRunsBrowser: boolean;
  hasAgentsRuntimeConversationView: boolean;
  hasAgentsRuntimeProviderConversationLinks: boolean;
  hasAgentsRuntimeProviderConversationDirectLinks: boolean;
  hasAgentsRuntimeProviderConversationCacheBadges: boolean;
  hasAgentsRecentRunMirrorDetailAction: boolean;
  hasAgentsRecentRunMirrorSummary: boolean;
  hasAgentsRecentRunMirrorSummaryDirectLink: boolean;
  hasAgentsRecentRunMirrorCacheBadges: boolean;
  hasOperationsPanel: boolean;
  hasServiceDiscoveryPanel: boolean;
  hasBackgroundDrainControls: boolean;
  hasMirrorSchedulerControls: boolean;
  hasRunOnceSchedulerControl: boolean;
  usesBackgroundDrainPayload: boolean;
  usesAccountMirrorSchedulerPayload: boolean;
  hasMirrorLiveFollowPanel: boolean;
  hasLiveFollowTargetsPanel: boolean;
  hasAttentionQueue: boolean;
  hasLiveFollowTargetTable: boolean;
  hasActiveCompletionTable: boolean;
  hasCompletionInspectAction: boolean;
  hasCompletionResultToast: boolean;
  hasCompletionInputInspectControl: boolean;
  hasCompletionIdFillControl: boolean;
  hasInlineCompletionActionControls: boolean;
  hasStateAwareCompletionActions: boolean;
  hasCancelConfirmation: boolean;
  hasControlFeedbackNotice: boolean;
  usesStatusControlPath: boolean;
  usesAccountMirrorCompletionPayload: boolean;
  hasPauseBinding: boolean;
  hasResumeBinding: boolean;
  hasCancelBinding: boolean;
  hasAccountMirrorCatalogPanel: boolean;
  hasAccountMirrorPreviewSessionPage: boolean;
  hasCatalogSearchControls: boolean;
  hasCatalogResultsTable: boolean;
  hasAccountMirrorPageLink: boolean;
  hasCatalogSavedFilterState: boolean;
  hasCatalogDetailInspection: boolean;
  hasConversationChatDetailView: boolean;
  hasConversationTranscriptAffordance: boolean;
  hasConversationTranscriptOnlyFilter: boolean;
  hasConversationTranscriptDownload: boolean;
  hasConversationTranscriptSearch: boolean;
  hasConversationRelatedItemNavigation: boolean;
  hasCatalogAssetDetailInspector: boolean;
  hasCatalogAssetPreview: boolean;
  hasCatalogLocalAssetRoute: boolean;
  hasCatalogMaterializationBadges: boolean;
  hasCatalogMaterializationControls: boolean;
  hasCatalogRowPreviewActions: boolean;
  hasCatalogBatchPreviewUrlDrawer: boolean;
  hasCatalogBatchPreviewSessionReview: boolean;
  hasCatalogBatchPreviewUrlOpen: boolean;
  hasCatalogBatchDetailLinkCopy: boolean;
  hasCatalogBatchPreviewUrlCopy: boolean;
  hasCatalogBatchPreviewUrlDownload: boolean;
  usesAccountMirrorCatalogItemPath: boolean;
  usesAccountMirrorCatalogPath: boolean;
}

export interface ApiOpsBrowserStatusSummary {
  host: string;
  port: number;
  dashboardUrl: string;
  serviceDiscovery: {
    localBaseUrl?: string;
    externalBaseUrl?: string;
    proxyTarget?: string;
    auth?: string;
  };
  dashboard: ApiOpsBrowserDashboardSummary;
  status: ApiStatusCliSummary;
}

export type ApiOpsBrowserStatusExpectation =
  ApiStatusLiveFollowSeverityExpectation
  & ApiStatusCompletionMetricsExpectation;

export async function readApiOpsBrowserStatusForCli(
  options: ApiOpsBrowserStatusCliOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<ApiOpsBrowserStatusSummary> {
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const dashboardHtml = await fetchDashboardHtml({ host, port, timeoutMs }, fetchImpl);
  const status = await readApiStatusForCli({ host, port, timeoutMs }, fetchImpl);
  return {
    host,
    port,
    dashboardUrl:
      normalizeDashboardUrl(options.dashboardUrl)
      ?? readStatusDashboardUrl(status.raw)
      ?? formatDashboardUrl(host, port),
    serviceDiscovery: readStatusServiceDiscovery(status.raw),
    dashboard: summarizeDashboardHtml(dashboardHtml),
    status,
  };
}

export function assertApiOpsBrowserStatus(
  summary: ApiOpsBrowserStatusSummary,
  expectation: ApiOpsBrowserStatusExpectation = {},
): void {
  assertDashboardContract(summary.dashboard);
  assertApiStatusLiveFollowSeverity(summary.status, expectation);
  assertApiStatusCompletionMetrics(summary.status, expectation);
}

export function formatApiOpsBrowserStatusCliSummary(summary: ApiOpsBrowserStatusSummary): string {
  const dashboard = summary.dashboard;
  return [
    `AuraCall ops browser: ok (${summary.host}:${summary.port}${dashboard.route})`,
    `Dashboard URL: ${summary.dashboardUrl}`,
    `Service discovery: local=${summary.serviceDiscovery.localBaseUrl ?? 'unknown'} external=${summary.serviceDiscovery.externalBaseUrl ?? 'none'} proxy=${summary.serviceDiscovery.proxyTarget ?? 'none'} auth=${summary.serviceDiscovery.auth ?? 'none'}`,
    `Dashboard config: page=${formatBoolean(dashboard.hasConfigPage)} identities=${formatBoolean(dashboard.hasConfigIdentityProjection)} liveFollow=${formatBoolean(dashboard.hasConfigLiveFollowProjection)} controls=${formatBoolean(dashboard.hasConfigLiveFollowControls)} agents=${formatBoolean(dashboard.hasAgentsTeamsPage)} recentRuns=${formatBoolean(dashboard.hasAgentsRecentRunsBrowser)} runtimeChat=${formatBoolean(dashboard.hasAgentsRuntimeConversationView)} runtimeProviderLinks=${formatBoolean(dashboard.hasAgentsRuntimeProviderConversationLinks)} runtimeProviderDirectLinks=${formatBoolean(dashboard.hasAgentsRuntimeProviderConversationDirectLinks)} runtimeProviderCacheBadges=${formatBoolean(dashboard.hasAgentsRuntimeProviderConversationCacheBadges)} recentMirrorDetail=${formatBoolean(dashboard.hasAgentsRecentRunMirrorDetailAction)} recentMirrorSummary=${formatBoolean(dashboard.hasAgentsRecentRunMirrorSummary)} recentMirrorDirectLink=${formatBoolean(dashboard.hasAgentsRecentRunMirrorSummaryDirectLink)} recentMirrorCacheBadges=${formatBoolean(dashboard.hasAgentsRecentRunMirrorCacheBadges)}`,
    `Dashboard service control: nav=${formatBoolean(dashboard.hasNavigationScaffold)} operations=${formatBoolean(dashboard.hasOperationsPanel)} backgroundDrain=${formatBoolean(dashboard.hasBackgroundDrainControls)} scheduler=${formatBoolean(dashboard.hasMirrorSchedulerControls)} runOnce=${formatBoolean(dashboard.hasRunOnceSchedulerControl)}`,
    `Dashboard cache browse: catalog=${formatBoolean(dashboard.hasAccountMirrorCatalogPanel)} page=${formatBoolean(dashboard.hasAccountMirrorPageLink)} previewSession=${formatBoolean(dashboard.hasAccountMirrorPreviewSessionPage)} search=${formatBoolean(dashboard.hasCatalogSearchControls)} savedFilters=${formatBoolean(dashboard.hasCatalogSavedFilterState)} table=${formatBoolean(dashboard.hasCatalogResultsTable)} detail=${formatBoolean(dashboard.hasCatalogDetailInspection)} chat=${formatBoolean(dashboard.hasConversationChatDetailView)} transcript=${formatBoolean(dashboard.hasConversationTranscriptAffordance)} transcriptFilter=${formatBoolean(dashboard.hasConversationTranscriptOnlyFilter)} transcriptDownload=${formatBoolean(dashboard.hasConversationTranscriptDownload)} transcriptSearch=${formatBoolean(dashboard.hasConversationTranscriptSearch)} related=${formatBoolean(dashboard.hasConversationRelatedItemNavigation)} assetInspector=${formatBoolean(dashboard.hasCatalogAssetDetailInspector)} assetPreview=${formatBoolean(dashboard.hasCatalogAssetPreview)} localAsset=${formatBoolean(dashboard.hasCatalogLocalAssetRoute)} materialization=${formatBoolean(dashboard.hasCatalogMaterializationBadges)} materializationControls=${formatBoolean(dashboard.hasCatalogMaterializationControls)} rowPreviewActions=${formatBoolean(dashboard.hasCatalogRowPreviewActions)} batchPreviewDrawer=${formatBoolean(dashboard.hasCatalogBatchPreviewUrlDrawer)} batchPreviewReview=${formatBoolean(dashboard.hasCatalogBatchPreviewSessionReview)} batchPreviewOpen=${formatBoolean(dashboard.hasCatalogBatchPreviewUrlOpen)} batchDetailCopy=${formatBoolean(dashboard.hasCatalogBatchDetailLinkCopy)} batchPreviewCopy=${formatBoolean(dashboard.hasCatalogBatchPreviewUrlCopy)} batchPreviewDownload=${formatBoolean(dashboard.hasCatalogBatchPreviewUrlDownload)} path=${dashboard.usesAccountMirrorCatalogPath ? '/v1/account-mirrors/catalog' : 'unknown'} itemPath=${dashboard.usesAccountMirrorCatalogItemPath ? '/v1/account-mirrors/catalog/items/{id}' : 'unknown'}`,
    `Dashboard completion control: path=${dashboard.usesStatusControlPath ? '/status' : 'unknown'} payload=${dashboard.usesAccountMirrorCompletionPayload ? 'accountMirrorCompletion' : 'unknown'} attention=${formatBoolean(dashboard.hasAttentionQueue)} activeTable=${formatBoolean(dashboard.hasActiveCompletionTable)} inspect=${formatBoolean(dashboard.hasCompletionInspectAction)} resultToast=${formatBoolean(dashboard.hasCompletionResultToast)} inputInspect=${formatBoolean(dashboard.hasCompletionInputInspectControl)} input=${formatBoolean(dashboard.hasCompletionIdFillControl)} rowActions=${formatBoolean(dashboard.hasInlineCompletionActionControls)} stateAware=${formatBoolean(dashboard.hasStateAwareCompletionActions)} confirmCancel=${formatBoolean(dashboard.hasCancelConfirmation)} feedback=${formatBoolean(dashboard.hasControlFeedbackNotice)} pause=${formatBoolean(dashboard.hasPauseBinding)} resume=${formatBoolean(dashboard.hasResumeBinding)} cancel=${formatBoolean(dashboard.hasCancelBinding)}`,
    summary.status.liveFollow.line,
    `Account mirror completions: active=${formatNullableNumber(summary.status.completions.metrics.active)} paused=${formatNullableNumber(summary.status.completions.metrics.paused)} failed=${formatNullableNumber(summary.status.completions.metrics.failed)} cancelled=${formatNullableNumber(summary.status.completions.metrics.cancelled)} total=${formatNullableNumber(summary.status.completions.metrics.total)}`,
  ].join('\n');
}

function assertDashboardContract(summary: ApiOpsBrowserDashboardSummary): void {
  const checks: Array<[boolean, string]> = [
    [summary.hasNavigationScaffold, 'Expected /ops/browser to include the AuraCall navigation scaffold.'],
    [summary.hasConfigBackedNavigationRoutes, 'Expected /ops/browser navigation to be backed by configured service discovery routes.'],
    [summary.hasConfigPage, 'Expected /ops/browser to include the read-only Config page contract.'],
    [summary.hasConfigIdentityProjection, 'Expected /ops/browser Config page to expose bound identity projections.'],
    [summary.hasConfigLiveFollowProjection, 'Expected /ops/browser Config page to expose live-follow eligibility projections.'],
    [summary.hasConfigLiveFollowControls, 'Expected /ops/browser Config page to expose live-follow target controls.'],
    [summary.hasAgentsTeamsPage, 'Expected /ops/browser to include the read-only Agents / Teams inspection page.'],
    [summary.hasAgentsRecentRunsBrowser, 'Expected /ops/browser Agents / Teams page to browse recent runtime runs.'],
    [
      summary.hasAgentsRuntimeConversationView,
      'Expected /ops/browser Agents / Teams page to render runtime runs as chat-style conversation views.',
    ],
    [
      summary.hasAgentsRuntimeProviderConversationLinks,
      'Expected /ops/browser Agents / Teams page to link runtime provider conversations to account-mirror cache detail.',
    ],
    [
      summary.hasAgentsRuntimeProviderConversationDirectLinks,
      'Expected /ops/browser Agents / Teams runtime provider conversation links to expose direct cache navigation.',
    ],
    [
      summary.hasAgentsRuntimeProviderConversationCacheBadges,
      'Expected /ops/browser Agents / Teams runtime provider conversation links to expose cache transcript/materialization badges.',
    ],
    [
      summary.hasAgentsRecentRunMirrorDetailAction,
      'Expected /ops/browser Agents / Teams recent-run rows to open linked account-mirror detail.',
    ],
    [
      summary.hasAgentsRecentRunMirrorSummary,
      'Expected /ops/browser Agents / Teams recent-run rows to summarize linked account-mirror availability.',
    ],
    [
      summary.hasAgentsRecentRunMirrorSummaryDirectLink,
      'Expected /ops/browser Agents / Teams recent-run mirror summaries to open a single cached conversation directly.',
    ],
    [
      summary.hasAgentsRecentRunMirrorCacheBadges,
      'Expected /ops/browser Agents / Teams recent-run mirror summaries to hydrate cache transcript/materialization badges.',
    ],
    [summary.hasOperationsPanel, 'Expected /ops/browser to include the Operations panel.'],
    [summary.hasServiceDiscoveryPanel, 'Expected /ops/browser to include the Service Discovery panel.'],
    [summary.hasBackgroundDrainControls, 'Expected /ops/browser to include background drain controls.'],
    [summary.hasMirrorSchedulerControls, 'Expected /ops/browser to include mirror scheduler controls.'],
    [summary.hasRunOnceSchedulerControl, 'Expected /ops/browser to include a scheduler run-once control.'],
    [summary.usesBackgroundDrainPayload, 'Expected /ops/browser to send backgroundDrain status-control payloads.'],
    [summary.usesAccountMirrorSchedulerPayload, 'Expected /ops/browser to send accountMirrorScheduler status-control payloads.'],
    [summary.hasMirrorLiveFollowPanel, 'Expected /ops/browser to include the Mirror Live Follow panel.'],
    [summary.hasLiveFollowTargetsPanel, 'Expected /ops/browser to render status.liveFollow.targets.'],
    [summary.hasAttentionQueue, 'Expected /ops/browser to render the live-follow attention queue.'],
    [summary.hasLiveFollowTargetTable, 'Expected /ops/browser to render the live-follow target account table.'],
    [summary.hasActiveCompletionTable, 'Expected /ops/browser to render the active completion operations table.'],
    [summary.hasCompletionInspectAction, 'Expected /ops/browser active completion rows to inspect completion detail.'],
    [summary.hasCompletionResultToast, 'Expected /ops/browser completion controls to render compact result feedback.'],
    [summary.hasCompletionInputInspectControl, 'Expected /ops/browser completion id input to inspect completion detail.'],
    [summary.hasCompletionIdFillControl, 'Expected /ops/browser target rows to fill the completion-control id.'],
    [summary.hasInlineCompletionActionControls, 'Expected /ops/browser target rows to control active completions directly.'],
    [summary.hasStateAwareCompletionActions, 'Expected /ops/browser target row controls to be state-aware.'],
    [summary.hasCancelConfirmation, 'Expected /ops/browser cancel controls to require confirmation.'],
    [summary.hasControlFeedbackNotice, 'Expected /ops/browser completion controls to show operator feedback.'],
    [summary.usesStatusControlPath, 'Expected /ops/browser completion controls to call POST /status.'],
    [
      summary.usesAccountMirrorCompletionPayload,
      'Expected /ops/browser completion controls to send accountMirrorCompletion status-control payloads.',
    ],
    [summary.hasPauseBinding, 'Expected /ops/browser to bind pauseMirrorCompletion.'],
    [summary.hasResumeBinding, 'Expected /ops/browser to bind resumeMirrorCompletion.'],
    [summary.hasCancelBinding, 'Expected /ops/browser to bind cancelMirrorCompletion.'],
    [summary.hasAccountMirrorCatalogPanel, 'Expected /ops/browser to include cache-backed account mirror catalog browsing.'],
    [summary.hasAccountMirrorPageLink, 'Expected /ops/browser to link the Account Mirror page route.'],
    [summary.hasAccountMirrorPreviewSessionPage, 'Expected /ops/browser to link the Account Mirror preview session page route.'],
    [summary.hasCatalogSearchControls, 'Expected /ops/browser to include account mirror catalog search controls.'],
    [summary.hasCatalogSavedFilterState, 'Expected /ops/browser to persist account mirror catalog filters in the URL.'],
    [summary.hasCatalogResultsTable, 'Expected /ops/browser to render cached account mirror catalog rows.'],
    [summary.hasCatalogDetailInspection, 'Expected /ops/browser to inspect cached catalog row details.'],
    [summary.hasConversationChatDetailView, 'Expected /ops/browser to render cached conversation details as a chat dialog.'],
    [summary.hasConversationTranscriptAffordance, 'Expected /ops/browser catalog rows to show cached conversation transcript availability.'],
    [summary.hasConversationTranscriptOnlyFilter, 'Expected /ops/browser to filter cached conversation rows by transcript availability.'],
    [summary.hasConversationTranscriptDownload, 'Expected /ops/browser conversation details to download cached transcripts.'],
    [summary.hasConversationTranscriptSearch, 'Expected /ops/browser conversation details to search cached transcripts.'],
    [summary.hasConversationRelatedItemNavigation, 'Expected /ops/browser conversation details to navigate cached related items.'],
    [summary.hasCatalogAssetDetailInspector, 'Expected /ops/browser file/artifact details to render a compact inspector.'],
    [summary.hasCatalogAssetPreview, 'Expected /ops/browser file/artifact details to render cached asset previews.'],
    [summary.hasCatalogLocalAssetRoute, 'Expected /ops/browser file/artifact details to route local cached assets through the API.'],
    [summary.hasCatalogMaterializationBadges, 'Expected /ops/browser catalog rows to show asset materialization status.'],
    [summary.hasCatalogMaterializationControls, 'Expected /ops/browser catalog rows to filter and sort by asset materialization status.'],
    [summary.hasCatalogRowPreviewActions, 'Expected /ops/browser catalog rows to open and copy cached asset preview URLs.'],
    [summary.hasCatalogBatchPreviewUrlDrawer, 'Expected /ops/browser catalog rows to inspect visible cached asset preview URLs before export.'],
    [summary.hasCatalogBatchPreviewSessionReview, 'Expected /ops/browser catalog rows to review visible cached asset previews in a dashboard session.'],
    [summary.hasCatalogBatchPreviewUrlOpen, 'Expected /ops/browser catalog rows to open visible cached asset preview URLs.'],
    [summary.hasCatalogBatchDetailLinkCopy, 'Expected /ops/browser catalog rows to copy visible account-mirror detail links.'],
    [summary.hasCatalogBatchPreviewUrlCopy, 'Expected /ops/browser catalog rows to copy visible cached asset preview URLs.'],
    [summary.hasCatalogBatchPreviewUrlDownload, 'Expected /ops/browser catalog rows to download visible cached asset preview URLs.'],
    [summary.usesAccountMirrorCatalogPath, 'Expected /ops/browser to read /v1/account-mirrors/catalog.'],
    [summary.usesAccountMirrorCatalogItemPath, 'Expected /ops/browser to read /v1/account-mirrors/catalog/items/{id}.'],
  ];
  for (const [ok, message] of checks) {
    if (!ok) throw new Error(message);
  }
}

async function fetchDashboardHtml(
  options: { host: string; port: number; timeoutMs: number },
  fetchImpl: typeof fetch,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetchImpl(`http://${options.host}:${options.port}/ops/browser`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`AuraCall ops browser returned HTTP ${response.status}.`);
    }
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeDashboardHtml(html: string): ApiOpsBrowserDashboardSummary {
  return {
    route: '/ops/browser',
    hasNavigationScaffold: html.includes('aria-label="AuraCall sections"')
      && html.includes('Browser Ops')
      && html.includes('Account Mirror')
      && html.includes('Agents / Teams')
      && html.includes('Config'),
    hasConfigBackedNavigationRoutes: html.includes('OPERATOR_DASHBOARD_ROUTES')
      && html.includes('data-route-key="dashboardPath"')
      && html.includes('data-route-key="accountMirrorPath"')
      && html.includes('data-route-key="previewSessionPath"')
      && html.includes('data-route-key="configPath"')
      && html.includes('data-route-key="agentsPath"')
      && html.includes('applyServiceDiscoveryRoutes')
      && html.includes('routing.configPath')
      && html.includes('routing.previewSessionPath')
      && html.includes('isAccountMirrorRoute')
      && html.includes('isPreviewSessionRoute')
      && html.includes('isAgentsTeamsRoute'),
    hasConfigPage: html.includes('navConfig')
      && html.includes('href="/config"')
      && html.includes('configRoutingPanel')
      && html.includes('configRoutingSummary')
      && html.includes('configRoutingRaw')
      && html.includes('renderConfigRouting')
      && html.includes('operatorConfigDashboard')
      && html.includes('publicOperatorBrowserDashboardUrl')
      && html.includes('externalServiceBaseUrl'),
    hasConfigIdentityProjection: html.includes('configIdentityPanel')
      && html.includes('configIdentitySummary')
      && html.includes('renderConfigIdentityProjection')
      && html.includes('expectedIdentityKey')
      && html.includes('detectedIdentityKey')
      && html.includes('accountLevel'),
    hasConfigLiveFollowProjection: html.includes('configLiveFollowPanel')
      && html.includes('configLiveFollowSummary')
      && html.includes('renderConfigLiveFollowProjection')
      && html.includes('status.liveFollow')
      && html.includes('desiredState')
      && html.includes('nextAttemptAt')
      && html.includes('mirrorCompleteness'),
    hasConfigLiveFollowControls: html.includes('renderLiveFollowAccountControls')
      && html.includes('startMirrorCompletionForTarget')
      && html.includes("postJson('/v1/account-mirrors/completions'")
      && html.includes('data-runtime-profile')
      && html.includes('not live-follow enabled'),
    hasAgentsTeamsPage: html.includes('navAgentsTeams')
      && html.includes('href="/agents"')
      && html.includes('agentsTeamsPanel')
      && html.includes('inspectAgentsTeamRun')
      && html.includes('inspectAgentsRuntimeRun')
      && html.includes('/v1/team-runs/inspect?')
      && html.includes('/v1/runtime-runs/inspect?'),
    hasAgentsRecentRunsBrowser: html.includes('agentsRecentRuns')
      && html.includes('loadAgentsRecentRuns')
      && html.includes('agentsRecentRunsTable')
      && html.includes('agentsRecentMirrorCacheFilter')
      && html.includes('agentsRecentMirrorCacheSort')
      && html.includes('agentsRecentMirrorCacheVisibleCount')
      && html.includes('data-agents-recent-mirror-cache-visible-count')
      && html.includes('showing 0 of 0')
      && html.includes('copyVisibleAgentsRecentMirrorLinks')
      && html.includes('collectVisibleAgentsRecentMirrorLinks')
      && html.includes('Copy visible mirror links')
      && html.includes('visible mirror link(s)')
      && html.includes('applyAgentsRecentMirrorCacheControls')
      && html.includes('/v1/runtime-runs/recent?')
      && html.includes('useAgentsRecentRun')
      && html.includes('inspectAgentsRecentRuntimeRun'),
    hasAgentsRecentRunMirrorDetailAction: html.includes('openAgentsRecentMirrorDetail')
      && html.includes('readAgentsRuntimeMirrorDetailPath')
      && html.includes('Open Mirror Detail')
      && html.includes("window.location.href = path")
      && html.includes('providerConversationRefs')
      && html.includes('accountMirrorPath'),
    hasAgentsRecentRunMirrorSummary: html.includes('renderAgentsRecentMirrorSummary')
      && html.includes('hasAgentsRecentMirrorDetail')
      && html.includes('data-agents-recent-mirror-summary')
      && html.includes('data-mirror-detail-available')
      && html.includes('No stored provider conversation link for this run')
      && html.includes('<th>Mirror</th>'),
    hasAgentsRecentRunMirrorSummaryDirectLink: html.includes('openAgentsRecentMirrorSummary')
      && html.includes('data-account-mirror-path')
      && html.includes('summary.firstAccountMirrorPath')
      && html.includes("window.location.href = path")
      && html.includes('No cached provider conversation link is available for this summary.'),
    hasAgentsRecentRunMirrorCacheBadges: html.includes('renderAgentsRecentMirrorCacheBadge')
      && html.includes('renderAgentsRecentMirrorRefExpansion')
      && html.includes('renderAgentsRecentMirrorCacheBadgeButton')
      && html.includes('renderAgentsRecentMirrorCacheSummary')
      && html.includes('summarizeAgentsRecentMirrorCacheRows')
      && html.includes('formatAgentsRecentMirrorCacheSummary')
      && html.includes('openAgentsRecentMirrorCacheBadge')
      && html.includes('data-agents-recent-mirror-cache-badge')
      && html.includes('data-agents-recent-mirror-cache-summary')
      && html.includes('data-agents-recent-mirror-cache-state')
      && html.includes('rankAgentsRecentMirrorCacheState')
      && html.includes('classifyAgentsRecentMirrorCacheCounts')
      && html.includes('data-agents-recent-mirror-ref-expansion')
      && html.includes('cache summary pending')
      && html.includes('metadata only')
      && html.includes('inline-details')
      && html.includes('<summary class="link-button">+')
      && html.includes('summary.firstCatalogItemPath')
      && html.includes('summary.conversations')
      && html.includes('data-runtime-provider-catalog-item-path')
      && html.includes('data-account-mirror-path')
      && html.includes('hydrateAgentsRuntimeProviderCacheBadges'),
    hasAgentsRuntimeConversationView: html.includes('agentsTeamsConversation')
      && html.includes('renderAgentsRuntimeConversation')
      && html.includes('renderAgentsRuntimeConversationTurn')
      && html.includes('agents-runtime-conversation')
      && html.includes('Runtime Conversation'),
    hasAgentsRuntimeProviderConversationLinks: html.includes('providerConversationRefs')
      && html.includes('renderAgentsRuntimeProviderConversationRefs')
      && html.includes('renderAgentsRuntimeProviderConversationRef')
      && html.includes('Cached provider conversations')
      && html.includes('agents-runtime-provider-conversations')
      && html.includes('data-runtime-provider-conversation-path')
      && html.includes('data-runtime-provider-catalog-item-path'),
    hasAgentsRuntimeProviderConversationDirectLinks: html.includes('data-runtime-provider-conversation-direct-link')
      && html.includes('data-runtime-provider-conversation-path')
      && html.includes('link-button'),
    hasAgentsRuntimeProviderConversationCacheBadges: html.includes('hydrateAgentsRuntimeProviderCacheBadges')
      && html.includes('summarizeAgentsRuntimeProviderCacheDetail')
      && html.includes('renderAgentsRuntimeProviderCacheSummary')
      && html.includes('summarizeAgentsRuntimeProviderCacheRows')
      && html.includes('countAgentsRuntimeProviderCacheBadges')
      && html.includes('data-runtime-provider-cache-badge')
      && html.includes('data-runtime-provider-cache-badge-state')
      && html.includes('data-runtime-provider-cache-summary')
      && html.includes('checking cache')
      && html.includes('cache summary pending')
      && html.includes('cached transcript')
      && html.includes('metadata only')
      && html.includes('metadata + assets'),
    hasOperationsPanel: html.includes('<h2>Operations</h2>')
      && html.includes('opsControls')
      && html.includes('opsControlNotice')
      && html.includes('renderOpsControls'),
    hasServiceDiscoveryPanel: html.includes('<h2>Service Discovery</h2>')
      && html.includes('serviceDiscoverySummary')
      && html.includes('renderServiceDiscovery')
      && html.includes('status.serviceDiscovery')
      && html.includes('Local Dashboard')
      && html.includes('External Dashboard')
      && html.includes('Preview Session Path')
      && html.includes('Config Path')
      && html.includes('Proxy Target')
      && html.includes('Auth Guard'),
    hasBackgroundDrainControls: html.includes('backgroundDrainControls')
      && html.includes('pauseBackgroundDrain')
      && html.includes('resumeBackgroundDrain')
      && html.includes('controlBackgroundDrain'),
    hasMirrorSchedulerControls: html.includes('mirrorSchedulerControls')
      && html.includes('pauseMirrorScheduler')
      && html.includes('resumeMirrorScheduler')
      && html.includes('controlMirrorScheduler'),
    hasRunOnceSchedulerControl: html.includes('runMirrorScheduler')
      && html.includes('dryRunMirrorScheduler')
      && html.includes("'run-once'"),
    hasMirrorLiveFollowPanel: html.includes('Mirror Live Follow'),
    hasLiveFollowTargetsPanel: html.includes('mirrorTargets') && html.includes('status.liveFollow.targets'),
    hasAttentionQueue: html.includes('mirrorAttentionQueue')
      && html.includes('mirrorAttentionItems')
      && html.includes('renderAttentionQueue')
      && html.includes('collectAttentionRows'),
    hasLiveFollowTargetTable: html.includes('mirrorTargetTable') && html.includes('mirrorTargetAccounts'),
    hasActiveCompletionTable: html.includes('mirrorActiveCompletionTable') && html.includes('mirrorActiveCompletions'),
    hasCompletionInspectAction: html.includes('inspectMirrorCompletion') && html.includes('/v1/account-mirrors/completions/'),
    hasCompletionResultToast: html.includes('mirrorControlResultToast')
      && html.includes('setMirrorControlResultToast')
      && html.includes('control-result-toast')
      && html.includes('Completion control succeeded')
      && html.includes('Live follow started'),
    hasCompletionInputInspectControl: html.includes('inspectMirrorCompletionById')
      && html.includes('inspectSelectedMirrorCompletion')
      && html.includes("$('inspectMirrorCompletionById').addEventListener('click', inspectSelectedMirrorCompletion)"),
    hasCompletionIdFillControl: html.includes('fillMirrorCompletionId') && html.includes('data-completion-id'),
    hasInlineCompletionActionControls: html.includes('controlMirrorCompletionById')
      && hasInlineCompletionAction(html, 'pause', 'Pause')
      && hasInlineCompletionAction(html, 'resume', 'Resume')
      && hasInlineCompletionAction(html, 'cancel', 'Cancel'),
    hasStateAwareCompletionActions: html.includes('completionActionsForStatus')
      && html.includes("status === 'paused'")
      && html.includes("status === 'queued' || status === 'running' || status === 'refreshing'"),
    hasCancelConfirmation: html.includes('confirmMirrorCompletionCancel')
      && html.includes("action === 'cancel'")
      && html.includes('window.confirm')
      && html.includes('Cancel not sent'),
    hasControlFeedbackNotice: html.includes('mirrorControlNotice') && html.includes('setMirrorControlNotice'),
    usesStatusControlPath: html.includes("fetch('/status'"),
    usesBackgroundDrainPayload: html.includes('backgroundDrain: { action }'),
    usesAccountMirrorSchedulerPayload: html.includes('accountMirrorScheduler: { action }'),
    usesAccountMirrorCompletionPayload: html.includes('accountMirrorCompletion: { id, action }'),
    hasPauseBinding: html.includes("$('pauseMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('pause'))"),
    hasResumeBinding: html.includes("$('resumeMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('resume'))"),
    hasCancelBinding: html.includes("$('cancelMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('cancel'))"),
    hasAccountMirrorCatalogPanel: html.includes('Account Mirrors')
      && html.includes('mirrorCatalogSummary')
      && html.includes('mirrorCatalogResults')
      && html.includes('mirrorCatalogRaw'),
    hasCatalogSearchControls: html.includes('mirrorCatalogProvider')
      && html.includes('mirrorCatalogRuntimeProfile')
      && html.includes('mirrorCatalogKind')
      && html.includes('mirrorCatalogSearch')
      && html.includes('mirrorCatalogLimit')
      && html.includes('loadMirrorCatalog')
      && html.includes('Search Cache'),
    hasAccountMirrorPageLink: html.includes('href="/account-mirror"') && html.includes('Account Mirror'),
    hasAccountMirrorPreviewSessionPage: html.includes('href="/account-mirror/preview-session"')
      && html.includes('Preview Session')
      && html.includes('mirrorPreviewSessionPanel')
      && html.includes('initializeMirrorPreviewSession')
      && html.includes('renderMirrorPreviewSession')
      && html.includes('readMirrorPreviewSessionUrls')
      && html.includes('Cached Preview Session')
      && html.includes('preview-session-grid'),
    hasCatalogSavedFilterState: html.includes('initializeMirrorCatalogFiltersFromUrl')
      && html.includes('updateMirrorCatalogUrl')
      && html.includes('updateMirrorCatalogDetailUrl')
      && html.includes('readMirrorCatalogDetailSelectionFromUrl')
      && html.includes('openSelectedMirrorCatalogDetailFromUrl')
      && html.includes('buildMirrorCatalogItemPathFromSelection')
      && html.includes('updateMirrorCatalogDetailUrlFromPath')
      && html.includes('window.history.replaceState')
      && html.includes("params.get('provider')")
      && html.includes("params.get('search')")
      && html.includes("params.get('item')")
      && html.includes("params.get('itemKind')"),
    hasCatalogResultsTable: html.includes('renderMirrorCatalogTable')
      && html.includes('mirrorCatalogItems')
      && html.includes('flattenMirrorCatalogEntries')
      && html.includes('filterMirrorCatalogRows')
      && html.includes('Cached item browser')
      && html.includes('mirrorCatalogKindTabs')
      && html.includes('setMirrorCatalogKindFilter')
      && html.includes('openDefaultMirrorCatalogDetail')
      && html.includes('catalog-row-selected')
      && html.includes('mirrorCatalogNavigator')
      && html.includes('renderMirrorCatalogNavigator')
      && html.includes('renderMirrorCatalogNavigatorItem')
      && html.includes('catalog-result-sidebar')
      && html.includes('catalog-nav-selected')
      && html.includes('focusMirrorCatalogSearch')
      && html.includes('handleMirrorCatalogKeyboard')
      && html.includes("event.key === '/'")
      && html.includes("event.key === 'ArrowDown'")
      && html.includes("'ArrowUp'"),
    hasCatalogDetailInspection: html.includes('mirrorCatalogDetail')
      && html.includes('mirrorCatalogDetailRaw')
      && html.includes('showMirrorCatalogDetailByIndex')
      && html.includes('showMirrorCatalogDetailByPath')
      && html.includes('data-catalog-row-index')
      && html.includes('data-catalog-item-path')
      && html.includes('Details'),
    hasConversationChatDetailView: html.includes('renderConversationDetailView')
      && html.includes('extractConversationTurns')
      && html.includes('renderChatTurn')
      && html.includes('chat-transcript')
      && html.includes('chat-bubble'),
    hasConversationTranscriptAffordance: html.includes('renderCatalogTranscriptBadge')
      && html.includes('formatCatalogTranscriptStatus')
      && html.includes('hasCachedTranscript')
      && html.includes('messageCount')
      && html.includes('Transcript'),
    hasConversationTranscriptOnlyFilter: html.includes('mirrorCatalogWithTranscriptOnly')
      && html.includes('withTranscript')
      && html.includes('hasCachedCatalogTranscript')
      && html.includes('withTranscriptOnly'),
    hasConversationTranscriptDownload: html.includes('downloadCurrentMirrorConversationTranscript')
      && html.includes('renderConversationTranscriptMarkdown')
      && html.includes('formatTranscriptFilename')
      && html.includes('Download Transcript.md')
      && html.includes('text/markdown'),
    hasConversationTranscriptSearch: html.includes('mirrorConversationTranscriptSearch')
      && html.includes('filterCurrentMirrorConversationTranscript')
      && html.includes('clearCurrentMirrorConversationTranscriptSearch')
      && html.includes('normalizeTranscriptSearchTerm')
      && html.includes('Search cached transcript')
      && html.includes('turn.textContent'),
    hasConversationRelatedItemNavigation: html.includes('renderConversationRelatedItems')
      && html.includes('renderConversationRelatedLink')
      && html.includes('buildRelatedCatalogItemPath')
      && html.includes('data-related-item-path')
      && html.includes('Cached related items')
      && html.includes("kind,")
      && html.includes('target="_blank" rel="noreferrer"'),
    hasCatalogAssetDetailInspector: html.includes('renderCachedAssetDetailView')
      && html.includes('renderCatalogItemInspectorFields')
      && html.includes('renderCatalogItemExternalLinks')
      && html.includes('renderCatalogExternalLink')
      && html.includes('Cached item inspector')
      && html.includes('Cached URLs')
      && html.includes('formatCatalogItemSize'),
    hasCatalogAssetPreview: html.includes('renderCatalogItemPreview')
      && html.includes('resolveCatalogItemPreview')
      && html.includes('buildCatalogItemAssetPath')
      && html.includes('readCatalogPreviewUrl')
      && html.includes('isSafePreviewUrl')
      && html.includes('Cached preview')
      && html.includes('asset-preview'),
    hasCatalogLocalAssetRoute: html.includes("'/v1/account-mirrors/catalog/items/' + encodeURIComponent(itemId) + '/asset?'")
      && html.includes('assetStorageRelpath')
      && html.includes('storageRelpath'),
    hasCatalogMaterializationBadges: html.includes('renderCatalogMaterializationBadge')
      && html.includes('formatCatalogMaterializationStatus')
      && html.includes('classifyCatalogItemPreview')
      && html.includes('hasCatalogItemPreviewSignal')
      && html.includes('countPreviewableCatalogRows')
      && html.includes('Preview')
      && html.includes('previewable')
      && html.includes('local cached asset')
      && html.includes('metadata only asset'),
    hasCatalogMaterializationControls: html.includes('mirrorCatalogPreviewFilter')
      && html.includes('mirrorCatalogSort')
      && html.includes('matchesCatalogPreviewFilter')
      && html.includes('sortMirrorCatalogRows')
      && html.includes('compareMirrorCatalogRows')
      && html.includes('compareCatalogPreviewRank')
      && html.includes("params.get('preview')")
      && html.includes("params.get('sort')")
      && html.includes('previewable first')
      && html.includes('metadata only'),
    hasCatalogRowPreviewActions: html.includes('renderCatalogRowActions')
      && html.includes('resolveCatalogRowPreviewUrl')
      && html.includes('buildMirrorCatalogItemAssetPath')
      && html.includes('copyCatalogPreviewUrl')
      && html.includes('data-catalog-preview-url')
      && html.includes('Open Preview')
      && html.includes('Copy URL')
      && html.includes('navigator.clipboard.writeText')
      && html.includes('catalog-row-actions')
      && html.includes('link-button'),
    hasCatalogBatchPreviewUrlCopy: html.includes('copyVisibleMirrorCatalogPreviewUrls')
      && html.includes('collectVisibleCatalogPreviewUrls')
      && html.includes('setMirrorCatalogBatchNotice')
      && html.includes('mirrorCatalogBatchNotice')
      && html.includes('copyVisibleMirrorCatalogPreviewUrls')
      && html.includes('Copy visible preview URLs')
      && html.includes("urls.join('\\n')")
      && html.includes('Copied ')
      && html.includes('visible preview URL(s)'),
    hasCatalogBatchDetailLinkCopy: html.includes('copyVisibleMirrorCatalogDetailLinks')
      && html.includes('collectVisibleCatalogDetailLinks')
      && html.includes('buildMirrorCatalogAccountMirrorPath')
      && html.includes('Copy visible detail links')
      && html.includes('visible detail link(s)')
      && html.includes('No visible detail links to copy.')
      && html.includes('Could not copy visible detail links.'),
    hasCatalogBatchPreviewUrlDrawer: html.includes('showVisibleMirrorCatalogPreviewUrls')
      && html.includes('hideVisibleMirrorCatalogPreviewUrls')
      && html.includes('mirrorCatalogPreviewUrlDrawer')
      && html.includes('mirrorCatalogPreviewUrlList')
      && html.includes('Preview visible URL list')
      && html.includes('Visible preview URLs')
      && html.includes('No visible preview URLs.')
      && html.includes('Previewing ')
      && html.includes("urls.join('\\n')"),
    hasCatalogBatchPreviewSessionReview: html.includes('reviewVisibleMirrorCatalogPreviews')
      && html.includes('collectVisibleCatalogPreviewEntries')
      && html.includes('Review visible previews')
      && html.includes('routeWithQuery(OPERATOR_DASHBOARD_ROUTES.previewSessionPath')
      && html.includes('auracall.previewSession.')
      && html.includes('items: selectedEntries')
      && html.includes('Opened preview session for ')
      && html.includes('Rendering ')
      && html.includes('cached preview URL(s)')
      && html.includes('normalizeMirrorPreviewSessionItems')
      && html.includes('renderMirrorPreviewSessionItem')
      && html.includes('boundIdentity')
      && html.includes('<dt>Item ID</dt>')
      && html.includes('mirror-preview-session-select')
      && html.includes('selectedMirrorPreviewSessionUrls')
      && html.includes('setMirrorPreviewSessionSelection')
      && html.includes('updateMirrorPreviewSessionSelection')
      && html.includes('Copy selected URLs')
      && html.includes('Download selected URL list')
      && html.includes('Download selected manifest')
      && html.includes('Save named session')
      && html.includes('Refresh saved sessions')
      && html.includes('Load saved session')
      && html.includes('mirrorPreviewSessionName')
      && html.includes('savedMirrorPreviewSessions')
      && html.includes('saveMirrorPreviewSession')
      && html.includes('refreshSavedMirrorPreviewSessions')
      && html.includes('loadSelectedSavedMirrorPreviewSession')
      && html.includes('loadSavedMirrorPreviewSessionById')
      && html.includes('renameSelectedSavedMirrorPreviewSession')
      && html.includes('deleteSelectedSavedMirrorPreviewSession')
      && html.includes('Rename saved session')
      && html.includes('Delete saved session')
      && html.includes('patchJson')
      && html.includes('deleteJson')
      && html.includes('savedMirrorPreviewSessionSearch')
      && html.includes('savedMirrorPreviewSessionTable')
      && html.includes('renderSavedMirrorPreviewSessionTable')
      && html.includes('handleSavedMirrorPreviewSessionTableClick')
      && html.includes('data-saved-preview-action="load"')
      && html.includes("'saved=' + encodeURIComponent(id)")
      && html.includes('/v1/account-mirrors/preview-sessions')
      && html.includes('Load manifest')
      && html.includes('loadMirrorPreviewSessionManifest')
      && html.includes('selectedMirrorPreviewSessionItems')
      && html.includes('buildSelectedMirrorPreviewSessionManifest')
      && html.includes('normalizeMirrorPreviewSessionManifest')
      && html.includes('loadMirrorPreviewSessionManifestFile')
      && html.includes('copyMirrorPreviewSessionUrls')
      && html.includes('downloadMirrorPreviewSessionUrls')
      && html.includes('downloadMirrorPreviewSessionManifest')
      && html.includes('auracall.preview-session-manifest.v1'),
    hasCatalogBatchPreviewUrlOpen: html.includes('openVisibleMirrorCatalogPreviewUrls')
      && html.includes('Open visible previews')
      && html.includes("window.open(url, '_blank', 'noopener,noreferrer')")
      && html.includes('No visible preview URLs to open.')
      && html.includes('Opened ')
      && html.includes('Limited to first ')
      && html.includes('visible preview URL(s)'),
    hasCatalogBatchPreviewUrlDownload: html.includes('downloadVisibleMirrorCatalogPreviewUrls')
      && html.includes('formatVisibleCatalogPreviewUrlsFilename')
      && html.includes('downloadVisibleMirrorCatalogPreviewUrls')
      && html.includes('Download visible preview URL list')
      && html.includes('auracall-preview-urls-')
      && html.includes('text/plain;charset=utf-8')
      && html.includes('URL.createObjectURL')
      && html.includes('URL.revokeObjectURL')
      && html.includes('Downloaded ')
      && html.includes('visible preview URL(s)'),
    usesAccountMirrorCatalogItemPath: html.includes('/v1/account-mirrors/catalog/items/'),
    usesAccountMirrorCatalogPath: html.includes('/v1/account-mirrors/catalog'),
  };
}

function hasInlineCompletionAction(html: string, action: string, label: string): boolean {
  return html.includes(`renderCompletionActionButton(id, '${action}', '${label}')`)
    || (html.includes('renderCompletionActionButton(id, action, labelForCompletionAction(action))')
      && html.includes(`if (action === '${action}') return '${label}'`))
    || html.includes(`data-completion-action="${action}"`);
}

function formatDashboardUrl(host: string, port: number): string {
  return `http://${host}:${port}/ops/browser`;
}

function normalizeDashboardUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readStatusDashboardUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const routes = (raw as { routes?: unknown }).routes;
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) return null;
  const dashboardUrl = (routes as { operatorBrowserDashboardUrl?: unknown }).operatorBrowserDashboardUrl;
  return typeof dashboardUrl === 'string' ? normalizeDashboardUrl(dashboardUrl) : null;
}

function readStatusServiceDiscovery(raw: unknown): ApiOpsBrowserStatusSummary['serviceDiscovery'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const serviceDiscovery = (raw as { serviceDiscovery?: unknown }).serviceDiscovery;
  if (!serviceDiscovery || typeof serviceDiscovery !== 'object' || Array.isArray(serviceDiscovery)) return {};
  const local = (serviceDiscovery as { local?: unknown }).local;
  const external = (serviceDiscovery as { external?: unknown }).external;
  const routing = (serviceDiscovery as { routing?: unknown }).routing;
  return {
    localBaseUrl: readStringField(local, 'baseUrl'),
    externalBaseUrl: readStringField(external, 'baseUrl'),
    proxyTarget: readStringField(routing, 'proxyTarget'),
    auth: readStringField(routing, 'auth'),
  };
}

function readStringField(source: unknown, field: string): string | undefined {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const value = (source as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeHost(value: string | null | undefined): string {
  const trimmed = String(value ?? '127.0.0.1').trim();
  return trimmed.length > 0 ? trimmed : '127.0.0.1';
}

function normalizePort(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('Use --port <number> to select the local AuraCall API server.');
  }
  return Math.trunc(value);
}

function normalizeTimeoutMs(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 5000;
  }
  return Math.max(100, Math.min(60_000, Math.trunc(value)));
}

function formatBoolean(value: boolean): string {
  return value ? 'ok' : 'missing';
}

function formatNullableNumber(value: number | null): string {
  return value === null ? 'unknown' : String(value);
}
