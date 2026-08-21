import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildChatgptComposerModeExpressionForTest,
	ensureChatgptComposerMode,
	resolveChatgptModelSelectionPlanForTest,
} from "../../src/browser/actions/chatgptComposerMode.js";
import { buildChatgptWorkModelSelectionExpressionForTest } from "../../src/browser/actions/chatgptWorkModelSelection.js";

class FixtureElement extends EventTarget {
	textContent: string;
	private readonly attributes = new Map<string, string>();
	onClick?: () => void;
	closestResult: FixtureElement | null = null;
	querySelectorAllResult: FixtureElement[] = [];

	constructor(text: string, attributes: Record<string, string> = {}) {
		super();
		this.textContent = text;
		for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	getBoundingClientRect() {
		return { left: 0, top: 0, width: 100, height: 30 };
	}

	closest(): FixtureElement | null {
		return this.closestResult;
	}

	querySelectorAll(): FixtureElement[] {
		return this.querySelectorAllResult;
	}

	click(): void {
		this.onClick?.();
	}

	override dispatchEvent(event: Event): boolean {
		if (event.type === "click") this.onClick?.();
		return true;
	}
}

class FixtureMouseEvent extends Event {}

function installFixtureDocument(query: (selector: string) => FixtureElement[]): void {
	vi.stubGlobal("Element", FixtureElement);
	vi.stubGlobal("HTMLElement", FixtureElement);
	vi.stubGlobal("MouseEvent", FixtureMouseEvent);
	vi.stubGlobal("PointerEvent", FixtureMouseEvent);
	vi.stubGlobal("window", Object.fromEntries([["PointerEvent", FixtureMouseEvent]]));
	vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible", display: "block" }));
	vi.stubGlobal("document", { querySelectorAll: query });
}

afterEach(() => vi.unstubAllGlobals());

describe("ChatGPT composer mode", () => {
	it("targets exact Chat and Work radios and verifies Radix selected state", () => {
		const expression = buildChatgptComposerModeExpressionForTest("chat");

		expect(() => new Function(`return ${expression}`)).not.toThrow();
		expect(expression).toContain('[role="radio"]');
		expect(expression).toContain("label === 'chat' || label === 'work'");
		expect(expression).toContain("getAttribute('aria-checked') === 'true'");
		expect(expression).toContain("getAttribute('data-state') === 'on'");
	});

	it("supports the current mode trigger plus menuitemradio surface", () => {
		const expression = buildChatgptComposerModeExpressionForTest("work");

		expect(expression).toContain('button[aria-haspopup="menu"]');
		expect(expression).toContain('[role="menuitemradio"]');
		expect(expression).toContain("getAttribute('aria-expanded') === 'true'");
		expect(expression).toContain("triggerLabel === DESIRED_MODE");
	});

	it("switches the observed Chat menu trigger to Work provider-free", async () => {
		const chatTrigger = new FixtureElement("Chat", {
			"aria-haspopup": "menu",
			"aria-expanded": "false",
		});
		const chatOption = new FixtureElement("Chat", { "aria-checked": "true" });
		const workOption = new FixtureElement("Work", { "aria-checked": "false" });
		let menuOpen = false;
		chatTrigger.onClick = () => {
			menuOpen = true;
			chatTrigger.setAttribute("aria-expanded", "true");
		};
		workOption.onClick = () => {
			workOption.setAttribute("aria-checked", "true");
			chatTrigger.textContent = "Work";
		};
		installFixtureDocument((selector) => {
			if (selector === '[role="radio"]') return [];
			if (selector === 'button[aria-haspopup="menu"]') return [chatTrigger];
			if (selector === '[role="menuitemradio"]') return menuOpen ? [chatOption, workOption] : [];
			return [];
		});

		const expression = buildChatgptComposerModeExpressionForTest("work");
		const result = await new Function(`return ${expression}`)();

		expect(result).toEqual({ status: "switched", mode: "work" });
		expect(chatTrigger.textContent).toBe("Work");
	});

	it("accepts the already-selected Chat radio", async () => {
		const evaluate = vi.fn().mockResolvedValue({
			result: { value: { status: "already-selected", mode: "chat" } },
		});
		const logger = vi.fn();

		await ensureChatgptComposerMode({ evaluate } as never, "chat", logger);

		expect(logger).toHaveBeenCalledWith("ChatGPT mode: Chat (already selected)");
	});

	it("accepts a valid existing Chat conversation without an exposed mode control", async () => {
		const promptEditor = new FixtureElement("", {
			role: "textbox",
			"aria-label": "Chat with ChatGPT",
			contenteditable: "true",
		});
		installFixtureDocument((selector) => {
			if (selector === '[role="radio"]') return [];
			if (selector === 'button[aria-haspopup="menu"]') return [];
			if (selector.includes("#prompt-textarea")) return [promptEditor];
			if (selector === '[data-animated-slider-trigger="true"]') return [];
			return [];
		});

		const expression = buildChatgptComposerModeExpressionForTest("chat");
		const result = await new Function(`return ${expression}`)();

		expect(result).toEqual({ status: "already-selected", mode: "chat" });
	});

	it("waits for an existing Chat conversation composer to mount", async () => {
		const promptEditor = new FixtureElement("", {
			role: "textbox",
			"aria-label": "Chat with ChatGPT",
			contenteditable: "true",
		});
		let promptQueries = 0;
		installFixtureDocument((selector) => {
			if (selector === '[role="radio"]') return [];
			if (selector === 'button[aria-haspopup="menu"]') return [];
			if (selector.includes("#prompt-textarea")) {
				promptQueries += 1;
				return promptQueries >= 2 ? [promptEditor] : [];
			}
			if (selector === '[data-animated-slider-trigger="true"]') return [];
			return [];
		});

		const expression = buildChatgptComposerModeExpressionForTest("chat");
		const result = await new Function(`return ${expression}`)();

		expect(result).toEqual({ status: "already-selected", mode: "chat" });
		expect(promptQueries).toBeGreaterThanOrEqual(2);
	});

	it("does not infer Work from a conversation composer without a mode control", async () => {
		const promptEditor = new FixtureElement("", {
			role: "textbox",
			"aria-label": "Chat with ChatGPT",
			contenteditable: "true",
		});
		installFixtureDocument((selector) => {
			if (selector === '[role="radio"]') return [];
			if (selector === 'button[aria-haspopup="menu"]') return [];
			if (selector.includes("#prompt-textarea")) return [promptEditor];
			if (selector === '[data-animated-slider-trigger="true"]') return [];
			return [];
		});

		const expression = buildChatgptComposerModeExpressionForTest("work");
		const result = await new Function(`return ${expression}`)();

		expect(result).toEqual({ status: "mode-not-found", availableModes: [] });
	});

	it("accepts established Chat when the visible thinking control is High", async () => {
		const promptEditor = new FixtureElement("", {
			role: "textbox",
			"aria-label": "Chat with ChatGPT",
			contenteditable: "true",
		});
		const thinkingControl = new FixtureElement("High");
		installFixtureDocument((selector) => {
			if (selector === '[role="radio"]') return [];
			if (selector === 'button[aria-haspopup="menu"]') return [];
			if (selector.includes("#prompt-textarea")) return [promptEditor];
			if (selector === '[data-animated-slider-trigger="true"]') return [thinkingControl];
			return [];
		});

		const expression = buildChatgptComposerModeExpressionForTest("chat");
		const result = await new Function(`return ${expression}`)();

		expect(result).toEqual({ status: "already-selected", mode: "chat" });
	});

	it("accepts explicit Work from the active conversation Work badge", async () => {
		const workBadge = new FixtureElement("Work");
		const activeConversation = new FixtureElement("Existing conversationWork", {
			href: "/c/existing-work",
			"data-active": "",
		});
		activeConversation.querySelectorAllResult = [workBadge];
		vi.stubGlobal("location", {
			href: "https://chatgpt.com/c/existing-work",
			pathname: "/c/existing-work",
		});
		installFixtureDocument((selector) => {
			if (selector === '[role="radio"]') return [];
			if (selector === 'button[aria-haspopup="menu"]') return [];
			if (selector === "a[href][data-active]") return [activeConversation];
			return [];
		});

		const expression = buildChatgptComposerModeExpressionForTest("work");
		const result = await new Function(`return ${expression}`)();

		expect(result).toEqual({ status: "already-selected", mode: "work" });
	});

	it("rejects implicit Chat when the active conversation badge proves Work", async () => {
		const workBadge = new FixtureElement("Work");
		const activeConversation = new FixtureElement("Existing conversationWork", {
			href: "/c/existing-work",
			"data-active": "",
		});
		activeConversation.querySelectorAllResult = [workBadge];
		vi.stubGlobal("location", {
			href: "https://chatgpt.com/c/existing-work",
			pathname: "/c/existing-work",
		});
		installFixtureDocument((selector) => {
			if (selector === '[role="radio"]') return [];
			if (selector === 'button[aria-haspopup="menu"]') return [];
			if (selector === "a[href][data-active]") return [activeConversation];
			return [];
		});

		const expression = buildChatgptComposerModeExpressionForTest("chat");
		const result = await new Function(`return ${expression}`)();

		expect(result).toEqual({ status: "mode-not-found", availableModes: ["Work"] });
	});

	it("fails clearly when explicit Work is unavailable", async () => {
		const evaluate = vi.fn().mockResolvedValue({
			result: { value: { status: "mode-not-found", availableModes: ["Chat"] } },
		});

		const logger = vi.fn<(message: string) => void>();

		await expect(ensureChatgptComposerMode({ evaluate } as never, "work", logger)).rejects.toThrow(
			/Work.*Available: Chat/i,
		);
	});

	it("routes Chat and Work model selection through disjoint plans", () => {
		expect(
			resolveChatgptModelSelectionPlanForTest({
				mode: "chat",
				desiredModel: "GPT-5.6 Terra",
				workModel: null,
				strategy: "select",
			}),
		).toEqual({ kind: "chat-model", model: "GPT-5.6 Terra", strategy: "select" });

		expect(
			resolveChatgptModelSelectionPlanForTest({
				mode: "chat",
				desiredModel: "GPT-5.6 Luna",
				workModel: null,
				strategy: "current",
			}),
		).toEqual({ kind: "ignore" });

		expect(
			resolveChatgptModelSelectionPlanForTest({
				mode: "work",
				desiredModel: "GPT-5.6 Terra",
				workModel: null,
				strategy: "select",
			}),
		).toEqual({ kind: "work-current" });

		expect(
			resolveChatgptModelSelectionPlanForTest({
				mode: "work",
				desiredModel: "GPT-5.6 Terra",
				workModel: "Research",
				strategy: "select",
			}),
		).toEqual({ kind: "work-model", model: "Research", strategy: "select" });
	});

	it("uses the current Work slider and nested model menu without Chat picker controls", () => {
		const expression = buildChatgptWorkModelSelectionExpressionForTest("GPT-5.6 Terra");

		expect(() => new Function(`return ${expression}`)).not.toThrow();
		expect(expression).toContain('[data-animated-slider-trigger="true"]');
		expect(expression).toContain("label === 'show advanced options'");
		expect(expression).toContain("label.startsWith('model ')");
		expect(expression).toContain('[role="menuitemradio"]');
		expect(expression).toContain("replace(/^gpt\\s+/, '')");
		expect(expression).not.toContain("model-switcher-dropdown-button");
		expect(expression).not.toContain("Switch model");
		expect(expression).toContain("performance.now() - startedAt < 5000");
	});

	it("selects an observed nested Work model provider-free", async () => {
		const workTrigger = new FixtureElement("Work", { "aria-haspopup": "menu" });
		const sliderMarker = new FixtureElement("");
		const modelTrigger = new FixtureElement("5.6 Sol Light", { "aria-haspopup": "menu" });
		sliderMarker.closestResult = modelTrigger;
		const advanced = new FixtureElement("Show advanced options");
		const modelMenu = new FixtureElement("Model GPT-5.6 Sol", {
			"aria-haspopup": "menu",
			"aria-expanded": "false",
		});
		const sol = new FixtureElement("GPT-5.6 Sol", { "aria-checked": "true" });
		const terra = new FixtureElement("GPT-5.6 Terra", { "aria-checked": "false" });
		let compactOpen = false;
		let advancedOpen = false;
		let modelOpen = false;
		modelTrigger.onClick = () => {
			compactOpen = true;
		};
		advanced.onClick = () => {
			advancedOpen = true;
		};
		modelMenu.onClick = () => {
			modelOpen = true;
			modelMenu.setAttribute("aria-expanded", "true");
		};
		terra.onClick = () => {
			terra.setAttribute("aria-checked", "true");
			modelTrigger.textContent = "5.6 Terra Light";
		};
		installFixtureDocument((selector) => {
			if (selector === '[role="radio"], [role="menuitemradio"]') return [];
			if (selector === 'button[aria-haspopup="menu"]') return [workTrigger, modelTrigger];
			if (selector === '[data-animated-slider-trigger="true"]') return [sliderMarker];
			if (selector === '[role="menuitem"]') return compactOpen ? [advanced] : [];
			if (selector === '[role="menuitem"][aria-haspopup="menu"]') {
				return advancedOpen ? [modelMenu] : [];
			}
			if (selector === '[role="menuitemradio"]') return modelOpen ? [sol, terra] : [];
			return [];
		});

		const expression = buildChatgptWorkModelSelectionExpressionForTest("GPT-5.6 Terra");
		const result = await new Function(`return ${expression}`)();

		expect(result).toEqual({ status: "switched", label: "GPT-5.6 Terra" });
		expect(modelTrigger.textContent).toBe("5.6 Terra Light");
	});
});
