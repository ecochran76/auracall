import type { ResolvedUserConfig } from "../config.js";
import {
	readTerminalSessionReceiptStatus,
	reconcileTerminalSessionReceipts,
	type TerminalReceiptReconciliationSummary,
	type TerminalReceiptStatus,
	type TerminalReceiptVerification,
	verifyTerminalSessionReceipt,
} from "../terminalSessionReceipts.js";

export interface TerminalSessionReceiptStatusPayload {
	status: TerminalReceiptStatus;
	reconciliation: TerminalReceiptReconciliationSummary | null;
	verification: TerminalReceiptVerification | null;
}

export async function buildTerminalSessionReceiptStatusPayload(input: {
	config: ResolvedUserConfig;
	reconcile?: boolean;
	sessionId?: string | null;
}): Promise<TerminalSessionReceiptStatusPayload> {
	const reconciliationResult = input.reconcile
		? await reconcileTerminalSessionReceipts(input.config)
		: null;
	if (reconciliationResult?.status === "failed") {
		throw new Error(
			`Terminal receipt reconciliation failed (${reconciliationResult.failure?.code ?? "unknown"}).`,
		);
	}
	const verificationResult = input.sessionId
		? await verifyTerminalSessionReceipt(input.sessionId, input.config)
		: null;
	if (verificationResult?.status === "failed") {
		throw new Error(
			`Terminal receipt verification failed (${verificationResult.failure?.code ?? "unknown"}).`,
		);
	}
	return {
		status: await readTerminalSessionReceiptStatus(input.config),
		reconciliation: reconciliationResult?.value ?? null,
		verification: verificationResult?.value ?? null,
	};
}

export function formatTerminalSessionReceiptStatusPayload(
	payload: TerminalSessionReceiptStatusPayload,
): string {
	const { status } = payload;
	const lines = [
		`Terminal session receipts: ${status.enabled ? "enabled" : "disabled"}`,
		`Schema version: ${status.schemaVersion}`,
		`Allowed root: ${status.configuredRoot.display ?? "(not configured)"}`,
		`Allowed root fingerprint: ${status.configuredRoot.fingerprint ?? "n/a"}`,
		`Root state: ${status.rootState}${status.rootFailureCode ? ` (${status.rootFailureCode})` : ""}`,
	];
	if (status.lastSuccessfulEmission) {
		lines.push(
			`Last emission: ${status.lastSuccessfulEmission.eventId} at ${status.lastSuccessfulEmission.publishedAt} (${status.lastSuccessfulEmission.disposition})`,
		);
	} else {
		lines.push("Last emission: none");
	}
	if (status.lastFailure) {
		lines.push(`Last failure: ${status.lastFailure.code} at ${status.lastFailure.at}`);
	} else {
		lines.push("Last failure: none");
	}
	if (status.reconciliation) {
		const item = status.reconciliation;
		lines.push(
			`Last reconciliation: scanned=${item.scanned} emitted=${item.emitted} deduplicated=${item.deduplicated} skipped=${item.skipped} failed=${item.failed} at ${item.completedAt}`,
		);
	} else {
		lines.push("Last reconciliation: none");
	}
	if (payload.reconciliation) {
		const item = payload.reconciliation;
		lines.push(
			`Current reconciliation: scanned=${item.scanned} emitted=${item.emitted} deduplicated=${item.deduplicated} skipped=${item.skipped} failed=${item.failed}`,
		);
	}
	if (payload.verification) {
		const item = payload.verification;
		lines.push(`Verification: ${item.verified ? "verified" : "failed"} (${item.eventId})`);
		lines.push(`Receipt locator: ${item.receiptLocator}`);
		if (item.result) {
			lines.push(
				`Result locator: ${item.result.locator} (${item.result.bytes} bytes, ${item.result.digest})`,
			);
		}
	}
	return lines.join("\n");
}
