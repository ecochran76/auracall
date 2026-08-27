import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildChatgptToolApprovalProbeExpressionForTest,
	createChatgptToolApprovalHandler,
} from "../../src/browser/actions/chatgptToolApproval.js";

class FixtureElement {
	textContent: string;
	parentElement: FixtureElement | null = null;
	focusCount = 0;
	clickCount = 0;
	private readonly attributes = new Map<string, string>();
	private readonly children: FixtureElement[] = [];
	private readonly rect: { left: number; top: number; width: number; height: number };

	constructor(
		text: string,
		attributes: Record<string, string> = {},
		rect = { left: 0, top: 0, width: 100, height: 30 },
	) {
		this.textContent = text;
		this.rect = rect;
		for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
	}

	append(...children: FixtureElement[]): void {
		for (const child of children) {
			child.parentElement = this;
			this.children.push(child);
		}
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	getBoundingClientRect() {
		return this.rect;
	}

	focus(): void {
		this.focusCount += 1;
	}

	click(): void {
		this.clickCount += 1;
	}

	closest(selector: string): FixtureElement | null {
		let current: FixtureElement | null = this;
		while (current) {
			if (
				selector.includes('[data-testid="tool-approval-card"]') &&
				current.getAttribute("data-testid") === "tool-approval-card"
			)
				return current;
			if (selector.includes('[role="dialog"]') && current.getAttribute("role") === "dialog")
				return current;
			if (
				selector.includes('section[data-testid^="conversation-turn-"]') &&
				current.getAttribute("data-testid")?.startsWith("conversation-turn-")
			)
				return current;
			current = current.parentElement;
		}
		return null;
	}

	querySelectorAll(selector: string): FixtureElement[] {
		const descendants = this.children.flatMap((child) => [
			child,
			...child.querySelectorAll(selector),
		]);
		if (selector === 'button,[role="button"]') {
			return descendants.filter((child) => child.getAttribute("role") === "button");
		}
		return [];
	}
}

afterEach(() => vi.unstubAllGlobals());

function createClient(
	evaluate: ReturnType<typeof vi.fn>,
	dispatchMouseEvent: ReturnType<typeof vi.fn>,
) {
	return Object.fromEntries([
		["Runtime", { evaluate }],
		["Input", { dispatchMouseEvent }],
	]) as never;
}

describe("ChatGPT tool approval handling", () => {
	it("activates exact Allow once when the operator selected allow-once", async () => {
		const evaluate = vi
			.fn()
			.mockResolvedValueOnce({
				result: {
					value: {
						status: "approval-required",
						fingerprint: "tool-approval-1",
						actionLabel: "Allow once",
						x: 120,
						y: 240,
					},
				},
			})
			.mockResolvedValueOnce({
				result: {
					value: {
						status: "approval-required",
						fingerprint: "tool-approval-1",
						actionLabel: "Allow once",
						activated: true,
						x: 120,
						y: 240,
					},
				},
			})
			.mockResolvedValueOnce({ result: { value: { status: "none" } } });
		const dispatchMouseEvent = vi.fn().mockResolvedValue(undefined);
		const logger = vi.fn();
		const handle = createChatgptToolApprovalHandler({
			client: createClient(evaluate, dispatchMouseEvent),
			policy: "allow-once",
			logger,
		});

		await expect(handle()).resolves.toMatchObject({
			status: "approved",
			action: "allow-once",
			label: "Allow once",
		});
		expect(dispatchMouseEvent).not.toHaveBeenCalled();
		expect(evaluate).toHaveBeenNthCalledWith(2, expect.objectContaining({ userGesture: true }));
		expect(logger).toHaveBeenCalledWith("ChatGPT tool approval: Allow once");
	});

	it("waits for the approval surface to settle and activates that exact control", async () => {
		const initialApproval = {
			result: {
				value: {
					status: "approval-required",
					fingerprint: "settling-tool-approval",
					actionLabel: "Allow once",
					x: 120,
					y: 240,
				},
			},
		};
		const settledApproval = {
			result: {
				value: {
					status: "approval-required",
					fingerprint: "settling-tool-approval",
					actionLabel: "Allow once",
					activated: true,
					x: 180,
					y: 300,
				},
			},
		};
		const evaluate = vi
			.fn()
			.mockResolvedValueOnce(initialApproval)
			.mockResolvedValueOnce(settledApproval)
			.mockResolvedValueOnce({ result: { value: { status: "none" } } });
		const dispatchMouseEvent = vi.fn().mockResolvedValue(undefined);
		const handle = createChatgptToolApprovalHandler({
			client: createClient(evaluate, dispatchMouseEvent),
			policy: "allow-once",
			logger: vi.fn<(message: string) => void>(),
		});

		await expect(handle()).resolves.toMatchObject({ status: "approved" });
		expect(dispatchMouseEvent).not.toHaveBeenCalled();
		expect(evaluate).toHaveBeenNthCalledWith(2, expect.objectContaining({ userGesture: true }));
	});

	it("fails closed when the approval changes before click", async () => {
		const evaluate = vi
			.fn()
			.mockResolvedValueOnce({
				result: {
					value: {
						status: "approval-required",
						fingerprint: "approval-before-settle",
						actionLabel: "Allow once",
						x: 120,
						y: 240,
					},
				},
			})
			.mockResolvedValueOnce({
				result: {
					value: {
						status: "approval-required",
						fingerprint: "replacement-approval",
						actionLabel: "Allow once",
						x: 180,
						y: 300,
					},
				},
			});
		const dispatchMouseEvent = vi.fn();
		const handle = createChatgptToolApprovalHandler({
			client: createClient(evaluate, dispatchMouseEvent),
			policy: "allow-once",
			logger: vi.fn<(message: string) => void>(),
		});

		await expect(handle()).rejects.toThrow(/changed while settling/i);
		expect(dispatchMouseEvent).not.toHaveBeenCalled();
	});

	it("fails closed when the approval becomes ambiguous before click", async () => {
		const evaluate = vi
			.fn()
			.mockResolvedValueOnce({
				result: {
					value: {
						status: "approval-required",
						fingerprint: "approval-before-ambiguity",
						actionLabel: "Allow once",
						x: 120,
						y: 240,
					},
				},
			})
			.mockResolvedValueOnce({ result: { value: { status: "ambiguous", count: 2 } } });
		const dispatchMouseEvent = vi.fn();
		const handle = createChatgptToolApprovalHandler({
			client: createClient(evaluate, dispatchMouseEvent),
			policy: "allow-once",
			logger: vi.fn<(message: string) => void>(),
		});

		await expect(handle()).rejects.toThrow(/became ambiguous.*2/i);
		expect(dispatchMouseEvent).not.toHaveBeenCalled();
	});

	it("does not click when the approval disappears while settling", async () => {
		const evaluate = vi
			.fn()
			.mockResolvedValueOnce({
				result: {
					value: {
						status: "approval-required",
						fingerprint: "disappearing-approval",
						actionLabel: "Allow once",
						x: 120,
						y: 240,
					},
				},
			})
			.mockResolvedValueOnce({ result: { value: { status: "none" } } });
		const dispatchMouseEvent = vi.fn();
		const handle = createChatgptToolApprovalHandler({
			client: createClient(evaluate, dispatchMouseEvent),
			policy: "allow-once",
			logger: vi.fn<(message: string) => void>(),
		});

		await expect(handle()).resolves.toEqual({ status: "none" });
		expect(dispatchMouseEvent).not.toHaveBeenCalled();
	});

	it("fails fast without clicking when approval policy is manual", async () => {
		const evaluate = vi.fn().mockResolvedValue({
			result: {
				value: {
					status: "approval-required",
					fingerprint: "tool-approval-manual",
					actionLabel: "Allow once",
					x: 120,
					y: 240,
				},
			},
		});
		const dispatchMouseEvent = vi.fn();
		const handle = createChatgptToolApprovalHandler({
			client: createClient(evaluate, dispatchMouseEvent),
			policy: "manual",
			logger: vi.fn<(message: string) => void>(),
		});

		await expect(handle()).rejects.toThrow(/tool approval.*manual.*allow-once.*always-allow/i);
		expect(dispatchMouseEvent).not.toHaveBeenCalled();
	});

	it("detects only the exact paired approval actions in one visible surface", () => {
		const allowOnce = new FixtureElement(
			"Allow once",
			{ role: "button" },
			{ left: 100, top: 200, width: 80, height: 40 },
		);
		const alwaysAllow = new FixtureElement(
			"Always allow",
			{ role: "button" },
			{ left: 200, top: 200, width: 100, height: 40 },
		);
		const approval = new FixtureElement("LitScout wants to use a tool Allow once Always allow", {
			role: "dialog",
		});
		approval.append(allowOnce, alwaysAllow);
		const answerNow = new FixtureElement("Answer now", { role: "button" });
		vi.stubGlobal("Element", FixtureElement);
		vi.stubGlobal("HTMLElement", FixtureElement);
		vi.stubGlobal("document", {
			querySelectorAll: (selector: string) => {
				if (selector === 'button,[role="button"]') return [answerNow, allowOnce, alwaysAllow];
				return [];
			},
		});

		const expression = buildChatgptToolApprovalProbeExpressionForTest("allow-once");
		const result = new Function(`return ${expression}`)();

		expect(result).toMatchObject({
			status: "approval-required",
			actionLabel: "Allow once",
			x: 140,
			y: 220,
		});
		expect(result.fingerprint).toContain("litscout wants to use a tool");
	});

	it("fingerprints the exact approval card instead of the shared assistant turn prefix", () => {
		const allowOnce = new FixtureElement("Allow once", { role: "button" });
		const alwaysAllow = new FixtureElement("Always allow", { role: "button" });
		const card = new FixtureElement(
			"LitScout Execute research action token rea_current Always allow Deny Allow once",
			{ "data-testid": "tool-approval-card" },
		);
		card.append(allowOnce, alwaysAllow);
		const turn = new FixtureElement(
			`${"Earlier assistant reasoning. ".repeat(30)}${card.textContent}`,
			{ "data-testid": "conversation-turn-8" },
		);
		turn.append(card);
		vi.stubGlobal("Element", FixtureElement);
		vi.stubGlobal("HTMLElement", FixtureElement);
		vi.stubGlobal("document", {
			querySelectorAll: (selector: string) => {
				if (selector === 'button,[role="button"]') return [allowOnce, alwaysAllow];
				return [];
			},
		});

		const expression = buildChatgptToolApprovalProbeExpressionForTest("allow-once");
		const result = new Function(`return ${expression}`)();

		expect(result).toMatchObject({ status: "approval-required" });
		expect(result.fingerprint).toContain("rea_current");
		expect(result.fingerprint).not.toContain("earlier assistant reasoning");
	});

	it("assigns stable identity to one exact card and new identity to its replacement", () => {
		const firstAllowOnce = new FixtureElement("Allow once", { role: "button" });
		const firstAlwaysAllow = new FixtureElement("Always allow", { role: "button" });
		const firstCard = new FixtureElement("LitScout Same action Allow once Always allow", {
			"data-testid": "tool-approval-card",
		});
		firstCard.append(firstAllowOnce, firstAlwaysAllow);
		let controls = [firstAllowOnce, firstAlwaysAllow];
		vi.stubGlobal("Element", FixtureElement);
		vi.stubGlobal("HTMLElement", FixtureElement);
		vi.stubGlobal("document", {
			querySelectorAll: (selector: string) =>
				selector === 'button,[role="button"]' ? controls : [],
		});
		const expression = buildChatgptToolApprovalProbeExpressionForTest("always-allow");

		const first = new Function(`return ${expression}`)();
		const same = new Function(`return ${expression}`)();
		const replacementAllowOnce = new FixtureElement("Allow once", { role: "button" });
		const replacementAlwaysAllow = new FixtureElement("Always allow", { role: "button" });
		const replacementCard = new FixtureElement("LitScout Same action Allow once Always allow", {
			"data-testid": "tool-approval-card",
		});
		replacementCard.append(replacementAllowOnce, replacementAlwaysAllow);
		controls = [replacementAllowOnce, replacementAlwaysAllow];
		const replacement = new Function(`return ${expression}`)();

		expect(same.surfaceId).toBe(first.surfaceId);
		expect(replacement.fingerprint).toBe(first.fingerprint);
		expect(replacement.surfaceId).not.toBe(first.surfaceId);
	});

	it("activates the exact DOM control bound by the settled probe", () => {
		const allowOnce = new FixtureElement("Allow once", { role: "button" });
		const alwaysAllow = new FixtureElement("Always allow", { role: "button" });
		const card = new FixtureElement("Corel33t Same action Allow once Always allow", {
			"data-testid": "tool-approval-card",
		});
		card.append(allowOnce, alwaysAllow);
		vi.stubGlobal("Element", FixtureElement);
		vi.stubGlobal("HTMLElement", FixtureElement);
		vi.stubGlobal("document", {
			querySelectorAll: (selector: string) =>
				selector === 'button,[role="button"]' ? [allowOnce, alwaysAllow] : [],
		});
		const probe = new Function(
			`return ${buildChatgptToolApprovalProbeExpressionForTest("always-allow")}`,
		)();
		const activated = new Function(
			`return ${buildChatgptToolApprovalProbeExpressionForTest("always-allow", {
				fingerprint: probe.fingerprint,
				surfaceId: probe.surfaceId,
				actionLabel: "Always allow",
			})}`,
		)();

		expect(activated).toMatchObject({
			status: "approval-required",
			activated: true,
			surfaceId: probe.surfaceId,
		});
		expect(alwaysAllow.focusCount).toBe(1);
		expect(alwaysAllow.clickCount).toBe(1);
		expect(allowOnce.clickCount).toBe(0);
	});

	it("fails closed when more than one approval surface is visible", async () => {
		const evaluate = vi.fn().mockResolvedValue({
			result: { value: { status: "ambiguous", count: 2 } },
		});
		const dispatchMouseEvent = vi.fn();
		const handle = createChatgptToolApprovalHandler({
			client: createClient(evaluate, dispatchMouseEvent),
			policy: "always-allow",
			logger: vi.fn<(message: string) => void>(),
		});

		await expect(handle()).rejects.toThrow(/ambiguous.*2/i);
		expect(dispatchMouseEvent).not.toHaveBeenCalled();
	});

	it("does not click the same approval twice when disappearance is unconfirmed", async () => {
		const persistentApproval = {
			result: {
				value: {
					status: "approval-required",
					fingerprint: "persistent-tool-approval",
					surfaceId: "persistent-surface-1",
					actionLabel: "Always allow",
					activated: true,
					x: 120,
					y: 240,
				},
			},
		};
		const evaluate = vi.fn().mockResolvedValue(persistentApproval);
		const dispatchMouseEvent = vi.fn().mockResolvedValue(undefined);
		const handle = createChatgptToolApprovalHandler({
			client: createClient(evaluate, dispatchMouseEvent),
			policy: "always-allow",
			logger: vi.fn<(message: string) => void>(),
		});

		await expect(handle()).rejects.toThrow(/did not disappear/i);
		await expect(handle()).rejects.toThrow(/already attempted/i);
		expect(dispatchMouseEvent).not.toHaveBeenCalled();
	});

	it("continues across sequential exact approval cards in one assistant turn", async () => {
		const firstApproval = {
			result: {
				value: {
					status: "approval-required",
					fingerprint: "approve-enrichment-card-rea_first",
					actionLabel: "Allow once",
					activated: true,
					x: 120,
					y: 240,
				},
			},
		};
		const nextApproval = {
			result: {
				value: {
					status: "approval-required",
					fingerprint: "execute-enrichment-card-rea_next",
					actionLabel: "Allow once",
					activated: true,
					x: 140,
					y: 260,
				},
			},
		};
		const evaluate = vi
			.fn()
			.mockResolvedValueOnce(firstApproval)
			.mockResolvedValueOnce(firstApproval)
			.mockResolvedValueOnce(nextApproval)
			.mockResolvedValueOnce(nextApproval)
			.mockResolvedValueOnce(nextApproval)
			.mockResolvedValueOnce({ result: { value: { status: "none" } } });
		const dispatchMouseEvent = vi.fn().mockResolvedValue(undefined);
		const handle = createChatgptToolApprovalHandler({
			client: createClient(evaluate, dispatchMouseEvent),
			policy: "allow-once",
			logger: vi.fn<(message: string) => void>(),
		});

		await expect(handle()).resolves.toMatchObject({
			status: "approved",
			fingerprint: "approve-enrichment-card-rea_first",
		});
		await expect(handle()).resolves.toMatchObject({
			status: "approved",
			fingerprint: "execute-enrichment-card-rea_next",
		});
		expect(dispatchMouseEvent).not.toHaveBeenCalled();
	});

	it("acknowledges an identical-looking successor card by exact DOM instance", async () => {
		const firstApproval = {
			result: {
				value: {
					status: "approval-required",
					fingerprint: "identical-visible-tool-approval",
					surfaceId: "approval-surface-1",
					actionLabel: "Always allow",
					activated: true,
					x: 120,
					y: 240,
				},
			},
		};
		const replacementApproval = {
			result: {
				value: {
					status: "approval-required",
					fingerprint: "identical-visible-tool-approval",
					surfaceId: "approval-surface-2",
					actionLabel: "Always allow",
					x: 120,
					y: 240,
				},
			},
		};
		const evaluate = vi
			.fn()
			.mockResolvedValueOnce(firstApproval)
			.mockResolvedValueOnce(firstApproval)
			.mockResolvedValue(replacementApproval);
		const dispatchMouseEvent = vi.fn().mockResolvedValue(undefined);
		const handle = createChatgptToolApprovalHandler({
			client: createClient(evaluate, dispatchMouseEvent),
			policy: "always-allow",
			logger: vi.fn<(message: string) => void>(),
		});

		await expect(handle()).resolves.toMatchObject({
			status: "approved",
			fingerprint: "identical-visible-tool-approval",
			surfaceId: "approval-surface-1",
		});
		expect(dispatchMouseEvent).not.toHaveBeenCalled();
	});

	it("allows a later confirmed approval with the same visible fingerprint", async () => {
		const approval = {
			result: {
				value: {
					status: "approval-required",
					fingerprint: "repeated-tool-approval",
					actionLabel: "Allow once",
					activated: true,
					x: 120,
					y: 240,
				},
			},
		};
		const gone = { result: { value: { status: "none" } } };
		const evaluate = vi
			.fn()
			.mockResolvedValueOnce(approval)
			.mockResolvedValueOnce(approval)
			.mockResolvedValueOnce(gone)
			.mockResolvedValueOnce(approval)
			.mockResolvedValueOnce(approval)
			.mockResolvedValueOnce(gone);
		const dispatchMouseEvent = vi.fn().mockResolvedValue(undefined);
		const handle = createChatgptToolApprovalHandler({
			client: createClient(evaluate, dispatchMouseEvent),
			policy: "allow-once",
			logger: vi.fn<(message: string) => void>(),
		});

		await expect(handle()).resolves.toMatchObject({ status: "approved" });
		await expect(handle()).resolves.toMatchObject({ status: "approved" });
		expect(dispatchMouseEvent).not.toHaveBeenCalled();
	});

	it("selects exact Always allow only for the always-allow policy", () => {
		const allowOnce = new FixtureElement(
			"Allow once",
			{ role: "button" },
			{ left: 100, top: 200, width: 80, height: 40 },
		);
		const alwaysAllow = new FixtureElement(
			"Always allow",
			{ role: "button" },
			{ left: 220, top: 200, width: 100, height: 40 },
		);
		const approval = new FixtureElement("Approve Finance Connector Allow once Always allow", {
			role: "dialog",
		});
		approval.append(allowOnce, alwaysAllow);
		vi.stubGlobal("Element", FixtureElement);
		vi.stubGlobal("HTMLElement", FixtureElement);
		vi.stubGlobal("document", {
			querySelectorAll: (selector: string) =>
				selector === 'button,[role="button"]' ? [allowOnce, alwaysAllow] : [],
		});

		const result = new Function(
			`return ${buildChatgptToolApprovalProbeExpressionForTest("always-allow")}`,
		)();

		expect(result).toMatchObject({
			status: "approval-required",
			actionLabel: "Always allow",
			x: 270,
			y: 220,
		});
	});

	it("ignores Answer now and incomplete approval surfaces", () => {
		const allowOnce = new FixtureElement("Allow once", { role: "button" });
		const answerNow = new FixtureElement("Answer now", { role: "button" });
		const dialog = new FixtureElement("Allow once Answer now", { role: "dialog" });
		dialog.append(allowOnce, answerNow);
		const hiddenAllowOnce = new FixtureElement(
			"Allow once",
			{ role: "button" },
			{ left: 0, top: 0, width: 0, height: 0 },
		);
		const hiddenAlwaysAllow = new FixtureElement(
			"Always allow",
			{ role: "button" },
			{ left: 0, top: 0, width: 0, height: 0 },
		);
		const hiddenDialog = new FixtureElement("Allow once Always allow", { role: "dialog" });
		hiddenDialog.append(hiddenAllowOnce, hiddenAlwaysAllow);
		vi.stubGlobal("Element", FixtureElement);
		vi.stubGlobal("HTMLElement", FixtureElement);
		vi.stubGlobal("document", {
			querySelectorAll: (selector: string) =>
				selector === 'button,[role="button"]'
					? [allowOnce, answerNow, hiddenAllowOnce, hiddenAlwaysAllow]
					: [],
		});

		const result = new Function(
			`return ${buildChatgptToolApprovalProbeExpressionForTest("allow-once")}`,
		)();

		expect(result).toEqual({ status: "none" });
	});
});
