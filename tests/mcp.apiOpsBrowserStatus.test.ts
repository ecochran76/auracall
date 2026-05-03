import { describe, expect, it } from 'vitest';
import { createApiOpsBrowserStatusToolHandler } from '../src/mcp/tools/apiOpsBrowserStatus.js';

const dashboardHtml = `
<section><h2>Mirror Live Follow</h2></section>
<div id="mirrorTargetTable"><table id="mirrorTargetAccounts"></table></div>
<div id="mirrorActiveCompletionTable"><table id="mirrorActiveCompletions"></table></div>
<button data-completion-id="acctmirror_paused" onclick="fillMirrorCompletionId(this.dataset.completionId)">Use ID</button>
<button data-completion-id="acctmirror_paused" onclick="inspectMirrorCompletion(this.dataset.completionId)">Inspect</button>
<button data-completion-id="acctmirror_paused" data-completion-action="pause" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Pause</button>
<button data-completion-id="acctmirror_paused" data-completion-action="resume" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Resume</button>
<button data-completion-id="acctmirror_paused" data-completion-action="cancel" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Cancel</button>
<div id="mirrorControlNotice" role="status" aria-live="polite"></div>
<pre id="mirrorTargets">status.liveFollow.targets</pre>
<script>
  function setMirrorControlNotice(message, tone) {}
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

describe('mcp api_ops_browser_status tool', () => {
  it('checks dashboard control wiring and linked status expectations', async () => {
    const handler = createApiOpsBrowserStatusToolHandler({
      fetchImpl: async (input: string | URL | Request) => {
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
      },
    });

    const result = await handler({
      port: 18080,
      expectedLiveFollowSeverity: 'paused',
      expectedCompletionActive: 1,
      expectedCompletionPaused: 1,
    });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'AuraCall ops browser 127.0.0.1:18080 is ok; dashboard completion controls use /status; Live follow health: severity=paused posture=healthy state=idle active=1 paused=1 failed=0 cancelled=0 backpressure=none latestYield=none',
        },
      ],
      structuredContent: {
        host: '127.0.0.1',
        port: 18080,
        dashboard: {
          route: '/ops/browser',
          hasMirrorLiveFollowPanel: true,
          hasLiveFollowTargetsPanel: true,
          hasLiveFollowTargetTable: true,
          hasActiveCompletionTable: true,
          hasCompletionInspectAction: true,
          hasCompletionIdFillControl: true,
          hasInlineCompletionActionControls: true,
          hasStateAwareCompletionActions: true,
          hasControlFeedbackNotice: true,
          usesStatusControlPath: true,
          usesAccountMirrorCompletionPayload: true,
          hasPauseBinding: true,
          hasResumeBinding: true,
          hasCancelBinding: true,
        },
        status: {
          liveFollow: {
            severity: 'paused',
          },
          completions: {
            metrics: {
              active: 1,
              paused: 1,
            },
          },
        },
      },
    });
  });

  it('fails when dashboard control wiring drifts', async () => {
    const handler = createApiOpsBrowserStatusToolHandler({
      fetchImpl: async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/ops/browser')) {
          return new Response(`<h2>Mirror Live Follow</h2><div id="mirrorTargetTable"><table id="mirrorTargetAccounts"></table></div><div id="mirrorActiveCompletionTable"><table id="mirrorActiveCompletions"></table></div><button data-completion-id="acctmirror_paused" onclick="fillMirrorCompletionId(this.dataset.completionId)">Use ID</button><button data-completion-id="acctmirror_paused" onclick="inspectMirrorCompletion(this.dataset.completionId)">Inspect</button><button data-completion-id="acctmirror_paused" data-completion-action="pause" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Pause</button><button data-completion-id="acctmirror_paused" data-completion-action="resume" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Resume</button><button data-completion-id="acctmirror_paused" data-completion-action="cancel" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Cancel</button><div id="mirrorControlNotice" role="status" aria-live="polite"></div><script>function setMirrorControlNotice(message, tone) {} function inspectMirrorCompletion(id) { return fetch('/v1/account-mirrors/completions/' + encodeURIComponent(id)); } function completionActionsForStatus(status) { if (status === 'paused') return ['resume', 'cancel']; if (status === 'queued' || status === 'running' || status === 'refreshing') return ['pause', 'cancel']; return []; }</script><pre id="mirrorTargets">status.liveFollow.targets</pre>`, {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        }
        return Response.json(statusPayload);
      },
    });

    await expect(handler({ port: 18080 })).rejects.toThrow(
      'Expected /ops/browser completion controls to call POST /status.',
    );
  });
});
