/**
 * End a completed one-shot browser probe after its final report is written.
 * Managed browser processes are external to this CLI process and remain alive.
 */
export function exitAfterCompletedBrowserProbeCommand(): never {
	process.exit(process.exitCode ?? 0);
}
