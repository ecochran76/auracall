import { describe, expect, it } from 'vitest';
import {
  assertApiOpsBrowserStatus,
  formatApiOpsBrowserStatusCliSummary,
  readApiOpsBrowserStatusForCli,
} from '../../src/cli/apiOpsBrowserCommand.js';

const dashboardHtml = `
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
<pre id="mirrorTargets">status.liveFollow.targets</pre>
<script>
  function setMirrorControlNotice(message, tone) {}
  function renderAttentionQueue() {}
  function collectAttentionRows() {}
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
      hasMirrorLiveFollowPanel: true,
      hasLiveFollowTargetsPanel: true,
      hasAttentionQueue: true,
      hasLiveFollowTargetTable: true,
      hasActiveCompletionTable: true,
      hasCompletionInspectAction: true,
      hasCompletionInputInspectControl: true,
      hasCompletionIdFillControl: true,
      hasInlineCompletionActionControls: true,
      hasStateAwareCompletionActions: true,
      hasControlFeedbackNotice: true,
      usesStatusControlPath: true,
      usesAccountMirrorCompletionPayload: true,
      hasPauseBinding: true,
      hasResumeBinding: true,
      hasCancelBinding: true,
    });
    expect(summary.dashboardUrl).toBe('http://127.0.0.1:18080/ops/browser');
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
      'Dashboard completion control: path=/status payload=accountMirrorCompletion attention=ok activeTable=ok inspect=ok inputInspect=ok input=ok rowActions=ok stateAware=ok feedback=ok pause=ok resume=ok cancel=ok',
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
        return new Response(`<h2>Mirror Live Follow</h2><div id="mirrorAttentionQueue"><table id="mirrorAttentionItems"></table></div><div id="mirrorTargetTable"><table id="mirrorTargetAccounts"></table></div><div id="mirrorActiveCompletionTable"><table id="mirrorActiveCompletions"></table></div><button id="inspectMirrorCompletionById">Inspect</button><button data-completion-id="acctmirror_paused" onclick="fillMirrorCompletionId(this.dataset.completionId)">Use ID</button><button data-completion-id="acctmirror_paused" onclick="inspectMirrorCompletion(this.dataset.completionId)">Inspect</button><button data-completion-id="acctmirror_paused" data-completion-action="pause" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Pause</button><button data-completion-id="acctmirror_paused" data-completion-action="resume" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Resume</button><button data-completion-id="acctmirror_paused" data-completion-action="cancel" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Cancel</button><div id="mirrorControlNotice" role="status" aria-live="polite"></div><script>function setMirrorControlNotice(message, tone) {} function renderAttentionQueue() {} function collectAttentionRows() {} function inspectMirrorCompletion(id) { return fetch('/v1/account-mirrors/completions/' + encodeURIComponent(id)); } function inspectSelectedMirrorCompletion() { return inspectMirrorCompletion('acctmirror_paused'); } $('inspectMirrorCompletionById').addEventListener('click', inspectSelectedMirrorCompletion); function completionActionsForStatus(status) { if (status === 'paused') return ['resume', 'cancel']; if (status === 'queued' || status === 'running' || status === 'refreshing') return ['pause', 'cancel']; return []; }</script><pre id="mirrorTargets">status.liveFollow.targets</pre>`, {
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
