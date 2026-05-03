import {
  assertApiStatusCompletionMetrics,
  assertApiStatusLiveFollowSeverity,
  readApiStatusForCli,
  type ApiStatusCliOptions,
  type ApiStatusCliSummary,
  type ApiStatusCompletionMetricsExpectation,
  type ApiStatusLiveFollowSeverityExpectation,
} from './apiStatusCommand.js';

export interface ApiOpsBrowserStatusCliOptions extends ApiStatusCliOptions {}

export interface ApiOpsBrowserDashboardSummary {
  route: '/ops/browser';
  hasMirrorLiveFollowPanel: boolean;
  hasLiveFollowTargetsPanel: boolean;
  hasLiveFollowTargetTable: boolean;
  hasCompletionIdFillControl: boolean;
  usesStatusControlPath: boolean;
  usesAccountMirrorCompletionPayload: boolean;
  hasPauseBinding: boolean;
  hasResumeBinding: boolean;
  hasCancelBinding: boolean;
}

export interface ApiOpsBrowserStatusSummary {
  host: string;
  port: number;
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
  return {
    host,
    port,
    dashboard: summarizeDashboardHtml(dashboardHtml),
    status: await readApiStatusForCli({ host, port, timeoutMs }, fetchImpl),
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
    `Dashboard completion control: path=${dashboard.usesStatusControlPath ? '/status' : 'unknown'} payload=${dashboard.usesAccountMirrorCompletionPayload ? 'accountMirrorCompletion' : 'unknown'} pause=${formatBoolean(dashboard.hasPauseBinding)} resume=${formatBoolean(dashboard.hasResumeBinding)} cancel=${formatBoolean(dashboard.hasCancelBinding)}`,
    summary.status.liveFollow.line,
    `Account mirror completions: active=${formatNullableNumber(summary.status.completions.metrics.active)} paused=${formatNullableNumber(summary.status.completions.metrics.paused)} failed=${formatNullableNumber(summary.status.completions.metrics.failed)} cancelled=${formatNullableNumber(summary.status.completions.metrics.cancelled)} total=${formatNullableNumber(summary.status.completions.metrics.total)}`,
  ].join('\n');
}

function assertDashboardContract(summary: ApiOpsBrowserDashboardSummary): void {
  const checks: Array<[boolean, string]> = [
    [summary.hasMirrorLiveFollowPanel, 'Expected /ops/browser to include the Mirror Live Follow panel.'],
    [summary.hasLiveFollowTargetsPanel, 'Expected /ops/browser to render status.liveFollow.targets.'],
    [summary.hasLiveFollowTargetTable, 'Expected /ops/browser to render the live-follow target account table.'],
    [summary.hasCompletionIdFillControl, 'Expected /ops/browser target rows to fill the completion-control id.'],
    [summary.usesStatusControlPath, 'Expected /ops/browser completion controls to call POST /status.'],
    [
      summary.usesAccountMirrorCompletionPayload,
      'Expected /ops/browser completion controls to send accountMirrorCompletion status-control payloads.',
    ],
    [summary.hasPauseBinding, 'Expected /ops/browser to bind pauseMirrorCompletion.'],
    [summary.hasResumeBinding, 'Expected /ops/browser to bind resumeMirrorCompletion.'],
    [summary.hasCancelBinding, 'Expected /ops/browser to bind cancelMirrorCompletion.'],
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
    hasMirrorLiveFollowPanel: html.includes('Mirror Live Follow'),
    hasLiveFollowTargetsPanel: html.includes('mirrorTargets') && html.includes('status.liveFollow.targets'),
    hasLiveFollowTargetTable: html.includes('mirrorTargetTable') && html.includes('mirrorTargetAccounts'),
    hasCompletionIdFillControl: html.includes('fillMirrorCompletionId') && html.includes('data-completion-id'),
    usesStatusControlPath: html.includes("fetch('/status'"),
    usesAccountMirrorCompletionPayload: html.includes('accountMirrorCompletion: { id, action }'),
    hasPauseBinding: html.includes("$('pauseMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('pause'))"),
    hasResumeBinding: html.includes("$('resumeMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('resume'))"),
    hasCancelBinding: html.includes("$('cancelMirrorCompletion').addEventListener('click', () => controlMirrorCompletion('cancel'))"),
  };
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
