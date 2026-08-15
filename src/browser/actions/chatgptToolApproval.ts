import type { ChromeClient, BrowserLogger, ChatgptToolApprovalPolicy } from "../types.js";
import { BrowserAutomationError } from "../../oracle/errors.js";

type ToolApprovalProbe =
	| { status: "none" }
	| { status: "ambiguous"; count: number }
	| {
			status: "approval-required";
			fingerprint: string;
			actionLabel: "Allow once" | "Always allow";
			x: number;
			y: number;
	  };

export type ChatgptToolApprovalOutcome =
	| { status: "none" }
	| {
			status: "approved";
			action: Exclude<ChatgptToolApprovalPolicy, "manual">;
			label: "Allow once" | "Always allow";
			fingerprint: string;
	  };

export function createChatgptToolApprovalHandler(options: {
	client: Pick<ChromeClient, "Runtime" | "Input">;
	policy: ChatgptToolApprovalPolicy;
	logger: BrowserLogger;
}): () => Promise<ChatgptToolApprovalOutcome> {
	const attemptedFingerprints = new Set<string>();
	const readProbe = async (): Promise<ToolApprovalProbe> => {
		const { result } = await options.client.Runtime.evaluate({
			expression: buildChatgptToolApprovalProbeExpression(options.policy),
			returnByValue: true,
		});
		return (result?.value as ToolApprovalProbe | null | undefined) ?? { status: "none" };
	};
	return async () => {
		const probe = await readProbe();
		if (probe.status === "none") return { status: "none" };
		if (probe.status === "ambiguous") {
			throw new BrowserAutomationError(
				`ChatGPT tool approval is ambiguous: ${probe.count} approval surfaces are visible.`,
				{
					stage: "chatgpt-tool-approval",
					code: "chatgpt-tool-approval-ambiguous",
					count: probe.count,
				},
			);
		}

		if (options.policy === "manual") {
			throw new BrowserAutomationError(
				"ChatGPT is waiting for third-party tool approval, but the approval policy is manual. " +
					"Set ChatGPT tool approval to allow-once or always-allow for unattended runs.",
				{
					stage: "chatgpt-tool-approval",
					code: "chatgpt-tool-approval-required",
					fingerprint: probe.fingerprint,
				},
			);
		}

		if (attemptedFingerprints.has(probe.fingerprint)) {
			throw new BrowserAutomationError(
				"ChatGPT tool approval was already attempted for this visible approval surface; refusing to click it twice.",
				{
					stage: "chatgpt-tool-approval",
					code: "chatgpt-tool-approval-already-attempted",
					fingerprint: probe.fingerprint,
				},
			);
		}
		attemptedFingerprints.add(probe.fingerprint);

		const action = options.policy;
		await options.client.Input.dispatchMouseEvent({ type: "mouseMoved", x: probe.x, y: probe.y });
		await options.client.Input.dispatchMouseEvent({
			type: "mousePressed",
			x: probe.x,
			y: probe.y,
			button: "left",
			clickCount: 1,
		});
		await options.client.Input.dispatchMouseEvent({
			type: "mouseReleased",
			x: probe.x,
			y: probe.y,
			button: "left",
			clickCount: 1,
		});
		let confirmed = false;
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const after = await readProbe();
			if (after.status === "none") {
				confirmed = true;
				break;
			}
			if (after.status === "approval-required" && after.fingerprint !== probe.fingerprint) {
				confirmed = true;
				break;
			}
			if (after.status === "ambiguous") break;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		if (!confirmed) {
			throw new BrowserAutomationError(
				`ChatGPT tool approval surface did not disappear after selecting ${probe.actionLabel}.`,
				{
					stage: "chatgpt-tool-approval",
					code: "chatgpt-tool-approval-not-confirmed",
					fingerprint: probe.fingerprint,
					action,
				},
			);
		}
		attemptedFingerprints.delete(probe.fingerprint);
		options.logger(`ChatGPT tool approval: ${probe.actionLabel}`);
		return {
			status: "approved",
			action,
			label: probe.actionLabel,
			fingerprint: probe.fingerprint,
		};
	};
}

function buildChatgptToolApprovalProbeExpression(policy: ChatgptToolApprovalPolicy): string {
	const desiredLabel = policy === "always-allow" ? "always allow" : "allow once";
	return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const visible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const labelOf = (node) => normalize(node.getAttribute('aria-label') || node.textContent || '');
    const controls = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible);
    const approvalControls = controls.filter((node) => {
      const label = labelOf(node);
      return label === 'allow once' || label === 'always allow';
    });
    const roots = [];
    for (const control of approvalControls) {
      const root = control.closest(
        '[role="dialog"], [aria-modal="true"], section[data-testid^="conversation-turn-"], article',
      ) || control.parentElement;
      if (root && visible(root) && !roots.includes(root)) roots.push(root);
    }
    const matches = [];
    for (const root of roots) {
      const rootControls = Array.from(root.querySelectorAll('button,[role="button"]')).filter(visible);
      const once = rootControls.filter((node) => labelOf(node) === 'allow once');
      const always = rootControls.filter((node) => labelOf(node) === 'always allow');
      if (once.length !== 1 || always.length !== 1) continue;
      const target = ${JSON.stringify(desiredLabel)} === 'always allow' ? always[0] : once[0];
      const rect = target.getBoundingClientRect();
      matches.push({
        status: 'approval-required',
        fingerprint: normalize(root.textContent || '').slice(0, 500),
        actionLabel: labelOf(target) === 'always allow' ? 'Always allow' : 'Allow once',
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
    if (matches.length === 0) return { status: 'none' };
    if (matches.length > 1) return { status: 'ambiguous', count: matches.length };
    return matches[0];
  })()`;
}

export function buildChatgptToolApprovalProbeExpressionForTest(
	policy: ChatgptToolApprovalPolicy,
): string {
	return buildChatgptToolApprovalProbeExpression(policy);
}
