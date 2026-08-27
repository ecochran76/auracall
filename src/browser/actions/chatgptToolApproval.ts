import { BrowserAutomationError } from "../../oracle/errors.js";
import type { BrowserLogger, ChatgptToolApprovalPolicy, ChromeClient } from "../types.js";

const CHATGPT_TOOL_APPROVAL_SETTLE_MS = 120;

type ToolApprovalProbe =
	| { status: "none" }
	| { status: "ambiguous"; count: number }
	| {
			status: "approval-required";
			fingerprint: string;
			surfaceId?: string;
			actionLabel: "Allow once" | "Always allow";
			activated?: boolean;
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
			surfaceId?: string;
	  };

export function createChatgptToolApprovalHandler(options: {
	client: Pick<ChromeClient, "Runtime" | "Input">;
	policy: ChatgptToolApprovalPolicy;
	logger: BrowserLogger;
}): () => Promise<ChatgptToolApprovalOutcome> {
	const attemptedSurfaces = new Set<string>();
	const approvalKey = (probe: Extract<ToolApprovalProbe, { status: "approval-required" }>) =>
		probe.surfaceId ? `surface:${probe.surfaceId}` : `fingerprint:${probe.fingerprint}`;
	const readProbe = async (activation?: {
		fingerprint: string;
		surfaceId?: string;
		actionLabel: "Allow once" | "Always allow";
	}): Promise<ToolApprovalProbe> => {
		const { result } = await options.client.Runtime.evaluate({
			expression: buildChatgptToolApprovalProbeExpression(options.policy, activation),
			returnByValue: true,
			userGesture: Boolean(activation),
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

		if (attemptedSurfaces.has(approvalKey(probe))) {
			throw new BrowserAutomationError(
				"ChatGPT tool approval was already attempted for this visible approval surface; refusing to click it twice.",
				{
					stage: "chatgpt-tool-approval",
					code: "chatgpt-tool-approval-already-attempted",
					fingerprint: probe.fingerprint,
				},
			);
		}

		await new Promise((resolve) => setTimeout(resolve, CHATGPT_TOOL_APPROVAL_SETTLE_MS));
		const settledProbe = await readProbe({
			fingerprint: probe.fingerprint,
			surfaceId: probe.surfaceId,
			actionLabel: probe.actionLabel,
		});
		if (settledProbe.status === "none") return { status: "none" };
		if (settledProbe.status === "ambiguous") {
			throw new BrowserAutomationError(
				`ChatGPT tool approval became ambiguous before click: ${settledProbe.count} approval surfaces are visible.`,
				{
					stage: "chatgpt-tool-approval",
					code: "chatgpt-tool-approval-ambiguous",
					count: settledProbe.count,
				},
			);
		}
		if (
			settledProbe.fingerprint !== probe.fingerprint ||
			settledProbe.actionLabel !== probe.actionLabel ||
			((settledProbe.surfaceId || probe.surfaceId) && settledProbe.surfaceId !== probe.surfaceId)
		) {
			throw new BrowserAutomationError(
				"ChatGPT tool approval changed while settling; refusing to click an unconfirmed surface.",
				{
					stage: "chatgpt-tool-approval",
					code: "chatgpt-tool-approval-changed-before-click",
					initialFingerprint: probe.fingerprint,
					settledFingerprint: settledProbe.fingerprint,
					initialSurfaceId: probe.surfaceId,
					settledSurfaceId: settledProbe.surfaceId,
					initialActionLabel: probe.actionLabel,
					settledActionLabel: settledProbe.actionLabel,
				},
			);
		}
		const settledApprovalKey = approvalKey(settledProbe);
		attemptedSurfaces.add(settledApprovalKey);
		if (!settledProbe.activated) {
			throw new BrowserAutomationError(
				"ChatGPT tool approval could not focus and activate the exact settled control.",
				{
					stage: "chatgpt-tool-approval",
					code: "chatgpt-tool-approval-activation-failed",
					fingerprint: settledProbe.fingerprint,
					surfaceId: settledProbe.surfaceId,
					action: options.policy,
				},
			);
		}

		const action = options.policy;
		let confirmed = false;
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const after = await readProbe();
			if (after.status === "none") {
				confirmed = true;
				break;
			}
			if (
				after.status === "approval-required" &&
				(after.fingerprint !== settledProbe.fingerprint ||
					Boolean(
						after.surfaceId && settledProbe.surfaceId && after.surfaceId !== settledProbe.surfaceId,
					))
			) {
				confirmed = true;
				break;
			}
			if (after.status === "ambiguous") break;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		if (!confirmed) {
			throw new BrowserAutomationError(
				`ChatGPT tool approval surface did not disappear after selecting ${settledProbe.actionLabel}.`,
				{
					stage: "chatgpt-tool-approval",
					code: "chatgpt-tool-approval-not-confirmed",
					fingerprint: settledProbe.fingerprint,
					action,
				},
			);
		}
		attemptedSurfaces.delete(settledApprovalKey);
		options.logger(`ChatGPT tool approval: ${settledProbe.actionLabel}`);
		return {
			status: "approved",
			action,
			label: settledProbe.actionLabel,
			fingerprint: settledProbe.fingerprint,
			surfaceId: settledProbe.surfaceId,
		};
	};
}

function buildChatgptToolApprovalProbeExpression(
	policy: ChatgptToolApprovalPolicy,
	activation?: {
		fingerprint: string;
		surfaceId?: string;
		actionLabel: "Allow once" | "Always allow";
	},
): string {
	const desiredLabel = policy === "always-allow" ? "always allow" : "allow once";
	const activationJson = JSON.stringify(activation ?? null);
	return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const visible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const labelOf = (node) => normalize(node.getAttribute('aria-label') || node.textContent || '');
    const identityKey = '__auracallChatgptToolApprovalIdentityV1';
    let identityState = globalThis[identityKey];
    if (!identityState || !(identityState.ids instanceof WeakMap)) {
      identityState = { ids: new WeakMap(), next: 0 };
      Object.defineProperty(globalThis, identityKey, {
        value: identityState,
        configurable: true,
      });
    }
    const surfaceIdFor = (node) => {
      const existing = identityState.ids.get(node);
      if (existing) return existing;
      identityState.next += 1;
      const created = 'approval-surface-' + identityState.next;
      identityState.ids.set(node, created);
      return created;
    };
    const controls = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible);
    const approvalControls = controls.filter((node) => {
      const label = labelOf(node);
      return label === 'allow once' || label === 'always allow';
    });
    const roots = [];
    for (const control of approvalControls) {
      const root = control.closest(
        '[data-testid="tool-approval-card"], [role="dialog"], [aria-modal="true"], section[data-testid^="conversation-turn-"], article',
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
        surfaceId: surfaceIdFor(root),
        actionLabel: labelOf(target) === 'always allow' ? 'Always allow' : 'Allow once',
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        target,
      });
    }
    if (matches.length === 0) return { status: 'none' };
    if (matches.length > 1) return { status: 'ambiguous', count: matches.length };
    const match = matches[0];
    const activation = ${activationJson};
    let activated = false;
    if (activation) {
      const exactSurface = !activation.surfaceId || activation.surfaceId === match.surfaceId;
      const exactMatch = exactSurface &&
        activation.fingerprint === match.fingerprint &&
        activation.actionLabel === match.actionLabel;
      if (exactMatch) {
        match.target.focus();
        match.target.click();
        activated = true;
      }
    }
    return {
      status: match.status,
      fingerprint: match.fingerprint,
      surfaceId: match.surfaceId,
      actionLabel: match.actionLabel,
      activated,
      x: match.x,
      y: match.y,
    };
  })()`;
}

export function buildChatgptToolApprovalProbeExpressionForTest(
	policy: ChatgptToolApprovalPolicy,
	activation?: {
		fingerprint: string;
		surfaceId?: string;
		actionLabel: "Allow once" | "Always allow";
	},
): string {
	return buildChatgptToolApprovalProbeExpression(policy, activation);
}
