# Issue165 completed detail does not complete missing assets

PR188 canonical c0bfc0493 installed; collector artifact SHA-256
1931114696fc59950f90327739986be1f1659c0f615eb2923de5d1751dbb82e5
matched the canonical build. API PID38866 was active. Scheduler stayed paused.
No live provider control was performed after this install.

Readback found complete detail and partial assets with a completed work-state
checkpoint. The deterministic planner regression reproduced same_epoch_complete
skipping a row with four known missing assets. Completion of a detail read
must not suppress retained asset materialization. The same-epoch shortcut now
requires zero missing local assets and no missing-assets freshness state;
otherwise normal guards and retained-evidence checks choose the action.

The regression failed before the fix. Installed acceptance of the repair and
scheduler resume remain open; this local check prevented a wasted provider
control. Original explicit full sweeps retain their existing semantics.

Focused provider-free validation: 114 tests passed in 4.05 seconds with no
retries. Typecheck, production build, scoped lint, diff hygiene and plan audit
passed. No installed acceptance of this repair is claimed.
