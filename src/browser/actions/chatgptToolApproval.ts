import { BrowserAutomationError } from "../../oracle/errors.js";
import type { BrowserLogger, ChatgptToolApprovalPolicy, ChromeClient } from "../types.js";

const CHATGPT_TOOL_APPROVAL_SETTLE_MS = 120;
const CHATGPT_TOOL_APPROVAL_CONFIRM_ATTEMPTS = 30;
const CHATGPT_TOOL_APPROVAL_CONFIRM_INTERVAL_MS = 100;

type ToolApprovalControlObservation = {
	tagName: string;
	role: string | null;
	disabled: boolean;
	ariaDisabled: string | null;
	dataState: string | null;
	isConnected: boolean;
	hitTargetIsControl: boolean;
	hitTargetLabel: string | null;
	pointerEvents: string | null;
	eventReceipt?: {
		counts: Record<string, number>;
		trustedCounts: Record<string, number>;
		lastType: string | null;
		lastTrusted: boolean | null;
	};
};

type ToolApprovalProbe =
	| { status: "none" }
	| { status: "ambiguous"; count: number }
	| {
			status: "approval-required";
			fingerprint: string;
			surfaceId?: string;
			controlId?: string;
			actionLabel: "Allow once" | "Always allow";
			activated?: boolean;
			x: number;
			y: number;
			control?: ToolApprovalControlObservation;
	  };

export type ChatgptToolApprovalObservation = {
	phase: "detected" | "settled" | "pointer-dispatched" | "post-action";
	observedAt: string;
	confirmationAttempt?: number;
	status: ToolApprovalProbe["status"];
	actionLabel?: "Allow once" | "Always allow";
	surfaceId?: string;
	controlId?: string;
	x?: number;
	y?: number;
	control?: ToolApprovalControlObservation;
};

export type ChatgptToolApprovalOutcome =
	| { status: "none" }
	| {
			status: "approved";
			action: Exclude<ChatgptToolApprovalPolicy, "manual">;
			label: "Allow once" | "Always allow";
			fingerprint: string;
			surfaceId?: string;
			controlId?: string;
	  };

export function createChatgptToolApprovalHandler(options: {
	client: Pick<ChromeClient, "Runtime" | "Input">;
	policy: ChatgptToolApprovalPolicy;
	logger: BrowserLogger;
	onObservation?: (observation: ChatgptToolApprovalObservation) => void;
}): () => Promise<ChatgptToolApprovalOutcome> {
	const attemptedSurfaces = new Set<string>();
	const approvalKey = (probe: Extract<ToolApprovalProbe, { status: "approval-required" }>) =>
		probe.controlId
			? `control:${probe.controlId}`
			: probe.surfaceId
				? `surface:${probe.surfaceId}`
				: `fingerprint:${probe.fingerprint}`;
	const observe = (
		phase: ChatgptToolApprovalObservation["phase"],
		probe: ToolApprovalProbe,
		confirmationAttempt?: number,
	) => {
		const observation: ChatgptToolApprovalObservation = {
			phase,
			observedAt: new Date().toISOString(),
			confirmationAttempt,
			status: probe.status,
			...(probe.status === "approval-required"
				? {
						actionLabel: probe.actionLabel,
						surfaceId: probe.surfaceId,
						controlId: probe.controlId,
						x: probe.x,
						y: probe.y,
						control: probe.control,
					}
				: {}),
		};
		options.onObservation?.(observation);
		options.logger(`ChatGPT tool approval observation: ${JSON.stringify(observation)}`);
	};
	const readProbe = async (activation?: {
		fingerprint: string;
		surfaceId?: string;
		controlId?: string;
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
		observe("detected", probe);
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
			controlId: probe.controlId,
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
		observe("settled", settledProbe);
		if (
			settledProbe.fingerprint !== probe.fingerprint ||
			settledProbe.actionLabel !== probe.actionLabel ||
			((settledProbe.surfaceId || probe.surfaceId) && settledProbe.surfaceId !== probe.surfaceId) ||
			((settledProbe.controlId || probe.controlId) && settledProbe.controlId !== probe.controlId)
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
					initialControlId: probe.controlId,
					settledControlId: settledProbe.controlId,
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
		if (settledProbe.control && !settledProbe.control.hitTargetIsControl) {
			throw new BrowserAutomationError(
				"ChatGPT tool approval exact control is not the topmost hit-test target at its center.",
				{
					stage: "chatgpt-tool-approval",
					code: "chatgpt-tool-approval-hit-target-mismatch",
					fingerprint: settledProbe.fingerprint,
					surfaceId: settledProbe.surfaceId,
					controlId: settledProbe.controlId,
					hitTargetLabel: settledProbe.control?.hitTargetLabel,
				},
			);
		}
		await options.client.Input.dispatchMouseEvent({
			type: "mouseMoved",
			x: settledProbe.x,
			y: settledProbe.y,
		});
		await options.client.Input.dispatchMouseEvent({
			type: "mousePressed",
			x: settledProbe.x,
			y: settledProbe.y,
			button: "left",
			clickCount: 1,
		});
		await options.client.Input.dispatchMouseEvent({
			type: "mouseReleased",
			x: settledProbe.x,
			y: settledProbe.y,
			button: "left",
			clickCount: 1,
		});
		observe("pointer-dispatched", settledProbe);

		const action = options.policy;
		let confirmed = false;
		for (let attempt = 0; attempt < CHATGPT_TOOL_APPROVAL_CONFIRM_ATTEMPTS; attempt += 1) {
			const after = await readProbe();
			observe("post-action", after, attempt + 1);
			if (after.status === "none") {
				confirmed = true;
				break;
			}
			if (
				after.status === "approval-required" &&
				(after.fingerprint !== settledProbe.fingerprint ||
					Boolean(
						after.surfaceId && settledProbe.surfaceId && after.surfaceId !== settledProbe.surfaceId,
					) ||
					Boolean(
						after.controlId && settledProbe.controlId && after.controlId !== settledProbe.controlId,
					))
			) {
				confirmed = true;
				break;
			}
			if (after.status === "ambiguous") break;
			await new Promise((resolve) =>
				setTimeout(resolve, CHATGPT_TOOL_APPROVAL_CONFIRM_INTERVAL_MS),
			);
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
			controlId: settledProbe.controlId,
		};
	};
}

function buildChatgptToolApprovalProbeExpression(
	policy: ChatgptToolApprovalPolicy,
	activation?: {
		fingerprint: string;
		surfaceId?: string;
		controlId?: string;
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
      identityState = { ids: new WeakMap(), events: new Map(), next: 0 };
      Object.defineProperty(globalThis, identityKey, {
        value: identityState,
        configurable: true,
      });
    }
    if (!(identityState.events instanceof Map)) identityState.events = new Map();
    const identityFor = (node, prefix) => {
      const existing = identityState.ids.get(node);
      if (existing) return existing;
      identityState.next += 1;
      const created = prefix + '-' + identityState.next;
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
        surfaceId: identityFor(root, 'approval-surface'),
        controlId: identityFor(target, 'approval-control'),
        actionLabel: labelOf(target) === 'always allow' ? 'Always allow' : 'Allow once',
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        target,
      });
    }
    if (matches.length === 0) return { status: 'none' };
    if (matches.length > 1) return { status: 'ambiguous', count: matches.length };
    const match = matches[0];
    let eventReceipt = identityState.events.get(match.controlId);
    if (!eventReceipt) {
      eventReceipt = {
        counts: { pointerdown: 0, mousedown: 0, mouseup: 0, click: 0 },
        trustedCounts: { pointerdown: 0, mousedown: 0, mouseup: 0, click: 0 },
        lastType: null,
        lastTrusted: null,
      };
      for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
        match.target.addEventListener?.(type, (event) => {
          eventReceipt.counts[type] += 1;
          if (event.isTrusted) eventReceipt.trustedCounts[type] += 1;
          eventReceipt.lastType = type;
          eventReceipt.lastTrusted = Boolean(event.isTrusted);
        }, true);
      }
      identityState.events.set(match.controlId, eventReceipt);
    }
    const activation = ${activationJson};
    let activated = false;
    if (activation) {
      const exactSurface = !activation.surfaceId || activation.surfaceId === match.surfaceId;
      const exactControl = !activation.controlId || activation.controlId === match.controlId;
      const exactMatch = exactSurface && exactControl &&
        activation.fingerprint === match.fingerprint &&
        activation.actionLabel === match.actionLabel;
      if (exactMatch) {
        match.target.focus();
        activated = true;
      }
    }
    const hitTarget = document.elementFromPoint?.(match.x, match.y) || match.target;
    const hitTargetIsControl = hitTarget === match.target || Boolean(match.target.contains?.(hitTarget));
    const computed = globalThis.getComputedStyle?.(match.target);
    return {
      status: match.status,
      fingerprint: match.fingerprint,
      surfaceId: match.surfaceId,
      controlId: match.controlId,
      actionLabel: match.actionLabel,
      activated,
      x: match.x,
      y: match.y,
      control: {
        tagName: String(match.target.tagName || '').toLowerCase(),
        role: match.target.getAttribute('role'),
        disabled: Boolean(match.target.disabled || match.target.hasAttribute?.('disabled')),
        ariaDisabled: match.target.getAttribute('aria-disabled'),
        dataState: match.target.getAttribute('data-state'),
        isConnected: match.target.isConnected !== false,
        hitTargetIsControl,
        hitTargetLabel: hitTarget ? labelOf(hitTarget) : null,
        pointerEvents: computed?.pointerEvents || null,
        eventReceipt: {
          counts: { ...eventReceipt.counts },
          trustedCounts: { ...eventReceipt.trustedCounts },
          lastType: eventReceipt.lastType,
          lastTrusted: eventReceipt.lastTrusted,
        },
      },
    };
  })()`;
}

export function buildChatgptToolApprovalProbeExpressionForTest(
	policy: ChatgptToolApprovalPolicy,
	activation?: {
		fingerprint: string;
		surfaceId?: string;
		controlId?: string;
		actionLabel: "Allow once" | "Always allow";
	},
): string {
	return buildChatgptToolApprovalProbeExpression(policy, activation);
}
