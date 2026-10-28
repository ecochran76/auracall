// biome-ignore-all lint/style/useNamingConvention: CDP protocol names are case-sensitive.
import { readGrokConnectorToolTrace } from "./providers/grokConnectorToolTrace.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import type { ChromeClient } from "./types.js";
import type {
	GrokConnectorInvocationPort,
	GrokConnectorInvocationRequest,
} from "./grokConnectorInvocationService.js";
import {
	connectToGrokTab,
	checkGrokBrowserAuthPreflight,
	ensureGrokTabVisible,
} from "./providers/grokAdapter.js";
import { projectGrokAccountReference } from "./grokAccountReference.js";
import { readGrokNativeConnectorDetail } from "./providers/grokNativeConnectorDetail.js";
import { observeGrokComposerConnector } from "./providers/grokConnectorSelection.js";
import { resolveProviderTrafficGovernor } from "./providers/mutationAudit.js";
import { runGrokUiOperation } from "./grokUiOperation.js";
import {
	readGrokAssistantSnapshotForRuntime,
	setGrokPrompt,
	submitGrokPrompt,
	waitForGrokAssistantResult,
} from "./actions/grok.js";
import { delay } from "./utils.js";

export async function openGrokConnectorInvocationBrowser(
	options: BrowserProviderListOptions,
	request: GrokConnectorInvocationRequest,
): Promise<GrokConnectorInvocationPort> {
	const connection = await connectToGrokTab({
		...options,
		providerTrafficRequired: true,
		tabLifecycle: "retain",
	});
	const client = connection.client as ChromeClient;
	const governor = resolveProviderTrafficGovernor(client);
	let action: Awaited<ReturnType<NonNullable<typeof governor>["begin"]>> | undefined;
	let baseline: Awaited<ReturnType<typeof readGrokAssistantSnapshotForRuntime>> | undefined;
	let actor: string | undefined;
	let submitted = false;
	const verify = async () => {
		const proof = await checkGrokBrowserAuthPreflight(client.Runtime, options);
		if (
			!proof.ok ||
			projectGrokAccountReference(proof.actualIdentity, "typed-v1") !==
				request.expectedProviderAccountRef
		)
			throw new Error("grok_connector_account_not_verified");
		actor = proof.actualIdentity?.id;
	};
	try {
		if (
			!governor ||
			!governor.admitBackendRequest ||
			connection.targetId !== request.targetId ||
			governor.attribution.targetId !== request.targetId
		)
			throw new Error("grok_connector_target_not_verified");
		action = await governor.begin({
			kind: "provider-read",
			interactionClass: "generic",
			source: "provider:grok:connector-invocation",
			targetId: request.targetId,
			abortSignal: options.abortSignal,
		});
		await verify();
	} catch (error) {
		try {
			await action?.settle({
				outcome: "failed",
				probeContext: client.Runtime,
				error: "grok_connector_invocation_open_failed",
			});
		} finally {
			await client.close();
		}
		throw error;
	}
	const ui = <T>(kind: "input" | "in-page-click", source: string, effect: () => Promise<T>) =>
		runGrokUiOperation({
			governor,
			runtime: client.Runtime,
			kind,
			source: `provider:grok:connector-${source}`,
			effect,
			abortSignal: options.abortSignal,
		});
	const evaluate = async <T>(body: string): Promise<T> => {
		const result = await client.Runtime.evaluate({
			returnByValue: true,
			expression: `(()=>{const visible=e=>e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&!e.closest('[aria-hidden="true"],[data-closed]');${body}})()`,
		});
		if (result.exceptionDetails) throw new Error("grok_connector_composer_observation_failed");
		return result.result.value as T;
	};
	async function selection() {
		let selected = await observeGrokComposerConnector(client.Runtime, request.selector);
		if (!selected) {
			for (const stage of ["attach", "connectors"]) {
				await ui("in-page-click", `menu-${stage}`, () =>
					evaluate<boolean>(`
     if(Array.from(document.querySelectorAll('[role="dialog"]')).some(visible))return false;
     const candidates=Array.from(document.querySelectorAll(${JSON.stringify(stage === "attach" ? "button" : '[role="menuitem"]')})).filter(e=>visible(e)&&${stage === "attach" ? "e.getAttribute('aria-label')==='Attach'" : "String(e.innerText||e.textContent||'').trim()==='Connectors'&&e.closest('[role=menu]')"});
     if(candidates.length!==1)return false;candidates[0].click();return true;`),
				);
				const deadline = Date.now() + 1500;
				do {
					selected = await observeGrokComposerConnector(client.Runtime, request.selector);
					if (selected) break;
					await delay(25);
				} while (Date.now() < deadline);
				if (selected) break;
			}
		}
		if (!selected?.enabled) return false;
		// Dismiss only the owned native Attach menu, with its actual focus owner.
		for (let step = 0; step < 2; step++) {
			const focused = await ui("input", "menu-dismiss", () =>
				evaluate<boolean>(`
    if(globalThis.__auracallSuppressFocus)return false;
    const rows=Array.from(document.querySelectorAll('[data-testid]')).filter(e=>visible(e)&&e.getAttribute('data-testid')===${JSON.stringify(`attach-connector-${request.selector.name}`)});
    const menus=Array.from(document.querySelectorAll('[role="menu"]')).filter(visible);
    const menu=rows.length===1?rows[0].closest('[role="menu"]'):menus.length===1&&Array.from(menus[0].querySelectorAll('[role="menuitem"]')).some(e=>String(e.innerText||'').trim()==='Connectors')?menus[0]:null;
    if(!menu)return false;menu.focus({preventScroll:true});return document.activeElement===menu||menu.contains(document.activeElement);`),
			);
			if (!focused) break;
			await ui("input", "menu-escape", async () => {
				await client.Input.dispatchKeyEvent({
					type: "keyDown",
					key: "Escape",
					code: "Escape",
					windowsVirtualKeyCode: 27,
				});
				await client.Input.dispatchKeyEvent({
					type: "keyUp",
					key: "Escape",
					code: "Escape",
					windowsVirtualKeyCode: 27,
				});
			});
			await delay(50);
		}
		return !(await evaluate<boolean>(
			"return Array.from(document.querySelectorAll('[role=menu],[role=dialog]')).some(visible);",
		));
	}
	return {
		async prepare() {
			await ui("input", "composer-visible", () => ensureGrokTabVisible(client));
			await verify();
			const detail = await readGrokNativeConnectorDetail(
				client.Runtime,
				request.selector,
				actor ?? "",
				options.abortSignal,
			);
			if (
				detail.status !== "complete" ||
				detail.connector?.id !== request.selector.id ||
				detail.endpoint !== request.selector.endpoint
			)
				return "grok_connector_invocation_detail_not_verified";
			if (!(await selection())) return "grok_connector_invocation_menu_not_dismissed";
			const draftSafe = await evaluate<boolean>(
				`const editors=Array.from(document.querySelectorAll('textarea,[contenteditable="true"]')).filter(visible);if(editors.length!==1)return false;const value=String(editors[0].value??editors[0].innerText??'');return value.trim()===''||value===${JSON.stringify(request.prompt)};`,
			);
			if (!draftSafe) return "grok_connector_invocation_existing_draft";
			baseline = await readGrokAssistantSnapshotForRuntime(client.Runtime);
			await ui("input", "prompt", () =>
				setGrokPrompt(client.Input, client.Runtime, request.prompt),
			);
			await verify();
			return (await selection()) ? true : "grok_connector_invocation_selection_changed";
		},
		async submit() {
			await verify();
			submitted = true;
			await ui("in-page-click", "submit", () => submitGrokPrompt(client.Input, client.Runtime));
		},
		async observe() {
			if (submitted && baseline)
				await waitForGrokAssistantResult(client.Runtime, 120000, () => {}, {
					baseline,
					abortSignal: options.abortSignal,
					checkWarning: () => governor?.checkWarning?.(client.Runtime) ?? Promise.resolve(),
				});
			const snapshot = await readGrokAssistantSnapshotForRuntime(client.Runtime);
			await verify();
			const toolTrace = snapshot.responseId
				? await readGrokConnectorToolTrace(client.Runtime, {
						responseId: snapshot.responseId,
						connector: request.selector,
					})
				: null;
			return {
				responseId: snapshot.responseId ?? null,
				text: snapshot.lastText ?? null,
				toolTrace,
			};
		},
		async close() {
			try {
				await action?.settle({
					outcome: "succeeded",
					effectState: submitted ? "outcome-unknown" : "settled",
					probeContext: client.Runtime,
				});
			} finally {
				await client.close();
			}
		},
	};
}
