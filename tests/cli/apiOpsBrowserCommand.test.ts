import { describe, expect, it } from 'vitest';
import {
  assertApiOpsBrowserStatus,
  formatApiOpsBrowserStatusCliSummary,
  readApiOpsBrowserStatusForCli,
} from '../../src/cli/apiOpsBrowserCommand.js';

const dashboardHtml = `
<section><h2>Mirror Live Follow</h2></section>
<div id="mirrorTargetTable"><table id="mirrorTargetAccounts"></table></div>
<button data-completion-id="acctmirror_paused" onclick="fillMirrorCompletionId(this.dataset.completionId)">Use ID</button>
<button data-completion-id="acctmirror_paused" data-completion-action="pause" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Pause</button>
<button data-completion-id="acctmirror_paused" data-completion-action="resume" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Resume</button>
<button data-completion-id="acctmirror_paused" data-completion-action="cancel" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Cancel</button>
<pre id="mirrorTargets">status.liveFollow.targets</pre>
<script>
  async function controlMirrorCompletion(action) {
    await fetch('/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountMirrorCompletion: { id, action } }),
    });
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
      hasLiveFollowTargetTable: true,
      hasCompletionIdFillControl: true,
      hasInlineCompletionActionControls: true,
      usesStatusControlPath: true,
      usesAccountMirrorCompletionPayload: true,
      hasPauseBinding: true,
      hasResumeBinding: true,
      hasCancelBinding: true,
    });
    expect(summary.status.liveFollow.severity).toBe('paused');
    expect(() => assertApiOpsBrowserStatus(summary, {
      expectedSeverity: 'paused',
      expectedActive: 1,
      expectedPaused: 1,
    })).not.toThrow();
    expect(formatApiOpsBrowserStatusCliSummary(summary)).toContain(
      'Dashboard completion control: path=/status payload=accountMirrorCompletion input=ok rowActions=ok pause=ok resume=ok cancel=ok',
    );
  });

  it('fails when dashboard control wiring drifts', async () => {
    const fetchImpl = async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/ops/browser')) {
        return new Response('<h2>Mirror Live Follow</h2><div id="mirrorTargetTable"><table id="mirrorTargetAccounts"></table></div><button data-completion-id="acctmirror_paused" onclick="fillMirrorCompletionId(this.dataset.completionId)">Use ID</button><button data-completion-id="acctmirror_paused" data-completion-action="pause" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Pause</button><button data-completion-id="acctmirror_paused" data-completion-action="resume" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Resume</button><button data-completion-id="acctmirror_paused" data-completion-action="cancel" onclick="controlMirrorCompletionById(this.dataset.completionId, this.dataset.completionAction)">Cancel</button><pre id="mirrorTargets">status.liveFollow.targets</pre>', {
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
