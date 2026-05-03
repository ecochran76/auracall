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
  hasOperationsPanel: boolean;
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
  hasCompletionInputInspectControl: boolean;
  hasCompletionIdFillControl: boolean;
  hasInlineCompletionActionControls: boolean;
  hasStateAwareCompletionActions: boolean;
  hasControlFeedbackNotice: boolean;
  usesStatusControlPath: boolean;
  usesAccountMirrorCompletionPayload: boolean;
  hasPauseBinding: boolean;
  hasResumeBinding: boolean;
  hasCancelBinding: boolean;
  hasAccountMirrorCatalogPanel: boolean;
  hasCatalogSearchControls: boolean;
  hasCatalogResultsTable: boolean;
  hasAccountMirrorPageLink: boolean;
  hasCatalogSavedFilterState: boolean;
  hasCatalogDetailInspection: boolean;
  usesAccountMirrorCatalogPath: boolean;
}

export interface ApiOpsBrowserStatusSummary {
  host: string;
  port: number;
  dashboardUrl: string;
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
    `Dashboard service control: nav=${formatBoolean(dashboard.hasNavigationScaffold)} operations=${formatBoolean(dashboard.hasOperationsPanel)} backgroundDrain=${formatBoolean(dashboard.hasBackgroundDrainControls)} scheduler=${formatBoolean(dashboard.hasMirrorSchedulerControls)} runOnce=${formatBoolean(dashboard.hasRunOnceSchedulerControl)}`,
    `Dashboard cache browse: catalog=${formatBoolean(dashboard.hasAccountMirrorCatalogPanel)} page=${formatBoolean(dashboard.hasAccountMirrorPageLink)} search=${formatBoolean(dashboard.hasCatalogSearchControls)} savedFilters=${formatBoolean(dashboard.hasCatalogSavedFilterState)} table=${formatBoolean(dashboard.hasCatalogResultsTable)} detail=${formatBoolean(dashboard.hasCatalogDetailInspection)} path=${dashboard.usesAccountMirrorCatalogPath ? '/v1/account-mirrors/catalog' : 'unknown'}`,
    `Dashboard completion control: path=${dashboard.usesStatusControlPath ? '/status' : 'unknown'} payload=${dashboard.usesAccountMirrorCompletionPayload ? 'accountMirrorCompletion' : 'unknown'} attention=${formatBoolean(dashboard.hasAttentionQueue)} activeTable=${formatBoolean(dashboard.hasActiveCompletionTable)} inspect=${formatBoolean(dashboard.hasCompletionInspectAction)} inputInspect=${formatBoolean(dashboard.hasCompletionInputInspectControl)} input=${formatBoolean(dashboard.hasCompletionIdFillControl)} rowActions=${formatBoolean(dashboard.hasInlineCompletionActionControls)} stateAware=${formatBoolean(dashboard.hasStateAwareCompletionActions)} feedback=${formatBoolean(dashboard.hasControlFeedbackNotice)} pause=${formatBoolean(dashboard.hasPauseBinding)} resume=${formatBoolean(dashboard.hasResumeBinding)} cancel=${formatBoolean(dashboard.hasCancelBinding)}`,
    summary.status.liveFollow.line,
    `Account mirror completions: active=${formatNullableNumber(summary.status.completions.metrics.active)} paused=${formatNullableNumber(summary.status.completions.metrics.paused)} failed=${formatNullableNumber(summary.status.completions.metrics.failed)} cancelled=${formatNullableNumber(summary.status.completions.metrics.cancelled)} total=${formatNullableNumber(summary.status.completions.metrics.total)}`,
  ].join('\n');
}

function assertDashboardContract(summary: ApiOpsBrowserDashboardSummary): void {
  const checks: Array<[boolean, string]> = [
    [summary.hasNavigationScaffold, 'Expected /ops/browser to include the AuraCall navigation scaffold.'],
    [summary.hasOperationsPanel, 'Expected /ops/browser to include the Operations panel.'],
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
    [summary.hasCompletionInputInspectControl, 'Expected /ops/browser completion id input to inspect completion detail.'],
    [summary.hasCompletionIdFillControl, 'Expected /ops/browser target rows to fill the completion-control id.'],
    [summary.hasInlineCompletionActionControls, 'Expected /ops/browser target rows to control active completions directly.'],
    [summary.hasStateAwareCompletionActions, 'Expected /ops/browser target row controls to be state-aware.'],
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
    [summary.hasCatalogSearchControls, 'Expected /ops/browser to include account mirror catalog search controls.'],
    [summary.hasCatalogSavedFilterState, 'Expected /ops/browser to persist account mirror catalog filters in the URL.'],
    [summary.hasCatalogResultsTable, 'Expected /ops/browser to render cached account mirror catalog rows.'],
    [summary.hasCatalogDetailInspection, 'Expected /ops/browser to inspect cached catalog row details.'],
    [summary.usesAccountMirrorCatalogPath, 'Expected /ops/browser to read /v1/account-mirrors/catalog.'],
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
    hasOperationsPanel: html.includes('<h2>Operations</h2>')
      && html.includes('opsControls')
      && html.includes('opsControlNotice')
      && html.includes('renderOpsControls'),
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
    hasCatalogSavedFilterState: html.includes('initializeMirrorCatalogFiltersFromUrl')
      && html.includes('updateMirrorCatalogUrl')
      && html.includes('window.history.replaceState')
      && html.includes("params.get('provider')")
      && html.includes("params.get('search')"),
    hasCatalogResultsTable: html.includes('renderMirrorCatalogTable')
      && html.includes('mirrorCatalogItems')
      && html.includes('flattenMirrorCatalogEntries')
      && html.includes('filterMirrorCatalogRows'),
    hasCatalogDetailInspection: html.includes('mirrorCatalogDetail')
      && html.includes('mirrorCatalogDetailRaw')
      && html.includes('showMirrorCatalogDetailByIndex')
      && html.includes('data-catalog-row-index')
      && html.includes('Details'),
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
