// biome-ignore-all lint/style/useNamingConvention: Native DOM/CDP wire names.

import { withCdpCommandTimeout } from "../../../packages/browser-service/src/guardedCdp.js";
import type { GrokConnectorRuntime } from "./grokConnectors.js";
export interface GrokBotConfiguration {
	id: string;
	name: string;
	title: string;
	description: string;
}
export interface GrokBotConfigurationPatch {
	name?: string;
	title?: string;
	description?: string;
	instructions?: string;
	model?: string;
}
export interface GrokBotLifecycleResult {
	status: "supported" | "unavailable" | "unknown";
	code: string;
	providerAccountRef: string | null;
	targetId?: string;
	bot: GrokBotConfiguration | null;
	effectState: "none" | "completed" | "unknown";
	capabilities: {
		name: boolean;
		title: boolean;
		description: boolean;
		instructions: false;
		model: false;
	};
	operationId?: string;
	journalPersistence?: "failed";
}
export const grokBotLifecycleUnknown = (
	code = "grok_bot_settings_unknown",
): GrokBotLifecycleResult => ({
	status: "unknown",
	code,
	providerAccountRef: null,
	bot: null,
	effectState: "none",
	capabilities: {
		name: false,
		title: false,
		description: false,
		instructions: false,
		model: false,
	},
});
export interface GrokBotLifecycleClientOptions {
	abortSignal?: AbortSignal;
	beforeCommit?: () => Promise<void>;
	effect?: <T>(
		kind: "input" | "in-page-click",
		source: string,
		run: () => Promise<T>,
	) => Promise<T>;
}
const helpers = String.raw`
 const visible=e=>e&&!e.closest?.('[aria-hidden="true"]')&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
 const all=(root,selector)=>Array.from(root.querySelectorAll(selector)).filter(visible);
 const text=e=>(e.innerText||e.textContent||'').trim();
 const route=()=>{const u=new URL(location.href);const m=/^\/bot\/([a-f0-9-]{36})\/?$/.exec(u.pathname);return u.origin==='https://grok.com'&&m?m[1]:null;};
 const settings=()=>all(document,'[role="dialog"]').filter(r=>all(r,'[id="bot-settings-name"]').length===1&&all(r,'[id="bot-settings-title"]').length===1&&all(r,'[id="bot-settings-description"]').length===1);
 const set=(e,value)=>{const proto=e.tagName?.toLowerCase()==='textarea'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
`;
export function createGrokBotLifecycleClient(
	runtime: GrokConnectorRuntime,
	options: GrokBotLifecycleClientOptions = {},
) {
	const effect =
		options.effect ?? (async <T>(_kind: string, _source: string, run: () => Promise<T>) => run());
	async function evaluate<T>(body: string): Promise<T> {
		options.abortSignal?.throwIfAborted();
		const r = await withCdpCommandTimeout(
			runtime,
			{
				timeoutMs: 20000,
				timeoutMessage: "grok_bot_settings_dom_timeout",
				abortSignal: options.abortSignal,
			},
			() =>
				runtime.evaluate({
					expression: `(async()=>{${helpers}\n${body}})()`,
					returnByValue: true,
					awaitPromise: true,
				}),
		);
		if (r.exceptionDetails) throw Error("grok_bot_settings_dom_failed");
		return r.result.value as T;
	}
	async function wait(body: string) {
		return evaluate(
			`const read=()=>{${body}};const initial=read();if(initial)return initial;return new Promise(resolve=>{let done=false;let timer;let observer;const finish=x=>{if(done)return;done=true;observer?.disconnect();clearTimeout(timer);resolve(x);};observer=new MutationObserver(()=>{const x=read();if(x)finish(x);});observer.observe(document,{subtree:true,childList:true,attributes:true});timer=setTimeout(()=>finish(false),15000);});`,
		);
	}
	async function inspect(selector: { id: string; name: string }): Promise<GrokBotLifecycleResult> {
		const result = await evaluate<{
			id: string;
			name: string;
			title: string;
			description: string;
		} | null>(
			`if(route()!==${JSON.stringify(selector.id)})return null;const roots=settings();if(roots.length!==1)return null;const r=roots[0];return {id:route(),name:all(r,'[id="bot-settings-name"]')[0].value,title:all(r,'[id="bot-settings-title"]')[0].value,description:all(r,'[id="bot-settings-description"]')[0].value};`,
		);
		if (!result || result.name !== selector.name)
			return grokBotLifecycleUnknown("grok_bot_exact_settings_unknown");
		return {
			...grokBotLifecycleUnknown(),
			status: "supported",
			code: "grok_bot_settings_observed",
			bot: result,
			capabilities: {
				name: true,
				title: true,
				description: true,
				instructions: false,
				model: false,
			},
		};
	}
	async function open(selector: { id: string; name: string }) {
		if ((await inspect(selector)).status === "supported") return true;
		const opened = await effect("in-page-click", "bot-settings-open", () =>
			evaluate<boolean>(
				`if(route()!==${JSON.stringify(selector.id)}||all(document,'[role="dialog"],[role="menu"]').length)return false;const b=all(document,'button').filter(e=>text(e)===${JSON.stringify(selector.name)});if(b.length!==1||b[0].disabled)return false;b[0].click();return true;`,
			),
		);
		return opened && Boolean(await wait("return settings().length===1;"));
	}
	async function edit(
		selector: { id: string; name: string },
		patch: GrokBotConfigurationPatch,
	): Promise<GrokBotLifecycleResult> {
		// Never map native Description to Instructions or infer hidden model controls.
		if (patch.instructions !== undefined || patch.model !== undefined)
			return {
				...grokBotLifecycleUnknown(
					patch.instructions !== undefined
						? "grok_bot_instructions_unavailable"
						: "grok_bot_model_defaults_unavailable",
				),
				status: "unavailable",
			};
		if (
			!Object.keys(patch).length ||
			Object.entries(patch).some(
				([key, value]) =>
					!["name", "title", "description"].includes(key) ||
					typeof value !== "string" ||
					value.length > (key === "name" ? 80 : 10000),
			) ||
			(patch.name !== undefined && !patch.name.trim())
		)
			return grokBotLifecycleUnknown("grok_bot_settings_request_invalid");
		if (!(await open(selector))) return grokBotLifecycleUnknown("grok_bot_exact_settings_unknown");
		const before = await inspect(selector);
		if (!before.bot) return before;
		const expected = { ...before.bot, ...patch };
		const prepared = await effect("input", "bot-settings-prepare", () =>
			evaluate<boolean>(
				`if(route()!==${JSON.stringify(selector.id)})return false;const roots=settings();if(roots.length!==1)return false;const r=roots[0];const before=${JSON.stringify(before.bot)};for(const key of ['name','title','description'])if(all(r,'[id="bot-settings-'+key+'"]')[0].value!==before[key])return false;const patch=${JSON.stringify(patch)};for(const key of Object.keys(patch))set(all(r,'[id="bot-settings-'+key+'"]')[0],patch[key]);return true;`,
			),
		);
		if (!prepared) return grokBotLifecycleUnknown("grok_bot_settings_changed_before_input");
		await options.beforeCommit?.();
		let dispatched = false;
		try {
			const saved = await effect("in-page-click", "bot-settings-save", () =>
				evaluate<boolean>(
					`if(route()!==${JSON.stringify(selector.id)})return false;const roots=settings();if(roots.length!==1)return false;const r=roots[0];const expected=${JSON.stringify(expected)};for(const key of ['name','title','description'])if(all(r,'[id="bot-settings-'+key+'"]')[0].value!==expected[key])return false;const buttons=all(r,'button').filter(e=>text(e)==='Save'&&e.getAttribute('type')==='submit');if(buttons.length!==1||buttons[0].disabled||buttons[0].getAttribute('aria-disabled')==='true')return false;buttons[0].click();return true;`,
				),
			);
			dispatched = saved;
			if (!saved) return grokBotLifecycleUnknown("grok_bot_save_guard_rejected");
			if (!(await wait("return settings().length===0;")))
				return { ...grokBotLifecycleUnknown("grok_bot_save_unconfirmed"), effectState: "unknown" };
			if (!(await open({ id: selector.id, name: expected.name })))
				return {
					...grokBotLifecycleUnknown("grok_bot_saved_readback_unavailable"),
					effectState: "unknown",
				};
			const read = await inspect({ id: selector.id, name: expected.name });
			if (!read.bot || JSON.stringify(read.bot) !== JSON.stringify(expected))
				return {
					...read,
					status: "unknown",
					code: "grok_bot_saved_readback_mismatch",
					effectState: "unknown",
				};
			return { ...read, code: "grok_bot_settings_saved", effectState: "completed" };
		} catch (error) {
			if (dispatched)
				throw Object.assign(
					error instanceof Error ? error : new Error("grok_bot_save_unconfirmed"),
					{ effectState: "unknown" },
				);
			throw error;
		}
	}
	async function create(name: string): Promise<GrokBotLifecycleResult> {
		if (!name.trim() || name.length > 80) return grokBotLifecycleUnknown("grok_bot_name_invalid");
		const rootEmpty = await evaluate<boolean>(
			`const u=new URL(location.href);const e=all(document,'[contenteditable="true"],textarea');return u.origin==='https://grok.com'&&u.pathname==='/'&&e.length===1&&!text(e[0])&&!e[0].value&&all(document,'[role="dialog"]').length===0&&!Array.from(document.querySelectorAll('input')).some(i=>i.getAttribute('type')==='file'&&i.files?.length)&&!all(document,'[data-file-id],[data-attachment-id]').length;`,
		);
		if (!rootEmpty) return grokBotLifecycleUnknown("grok_bot_create_requires_empty_root");
		const click = async (body: string, source: string) =>
			effect("in-page-click", source, () => evaluate<boolean>(body));
		if (
			!(await click(
				`const b=all(document,'button').filter(e=>e.getAttribute('aria-label')==='Plugins');if(b.length!==1||b[0].disabled)return false;b[0].click();return true;`,
				"bot-create-catalog",
			))
		)
			return grokBotLifecycleUnknown("grok_bot_catalog_control_unknown");
		if (
			!(await wait(
				`return all(document,'[role="dialog"]').length===1&&all(document,'[role="tab"]').some(e=>text(e)==='Bots');`,
			))
		)
			return grokBotLifecycleUnknown("grok_bot_catalog_unavailable");
		if (
			!(await click(
				`const roots=all(document,'[role="dialog"]');if(roots.length!==1)return false;const b=all(roots[0],'[role="tab"]').filter(e=>text(e)==='Bots');if(b.length!==1)return false;b[0].click();return true;`,
				"bot-create-bots",
			))
		)
			return grokBotLifecycleUnknown("grok_bot_bots_tab_unknown");
		if (
			!(await wait(
				`return all(document,'button').some(e=>e.getAttribute('aria-label')==='New Bot');`,
			))
		)
			return grokBotLifecycleUnknown("grok_bot_create_control_unknown");
		if (
			!(await click(
				`const roots=all(document,'[role="dialog"]');if(roots.length!==1)return false;const existing=all(roots[0],'a,button').filter(e=>text(e)===${JSON.stringify(name)});if(existing.length)return false;const b=all(roots[0],'button').filter(e=>e.getAttribute('aria-label')==='New Bot');if(b.length!==1||b[0].disabled)return false;b[0].click();return true;`,
				"bot-create-form",
			))
		)
			return grokBotLifecycleUnknown("grok_bot_existing_or_form_unknown");
		if (!(await wait(`return all(document,'[id="bot-create-name"]').length===1;`)))
			return grokBotLifecycleUnknown("grok_bot_create_form_unavailable");
		const ready = await effect("input", "bot-create-name", () =>
			evaluate<boolean>(
				`const roots=all(document,'[role="dialog"]').filter(r=>all(r,'[id="bot-create-name"]').length===1);if(roots.length!==1)return false;const r=roots[0];const fields=all(r,'[id="bot-create-name"]');const terms=all(r,'a').filter(e=>text(e)==='Terms'&&e.getAttribute('href')==='https://x.ai/legal/grok-bot-terms');if(fields.length!==1||fields[0].disabled||!['','New Bot'].includes(fields[0].value)||terms.length!==1)return false;set(fields[0],${JSON.stringify(name)});return true;`,
			),
		);
		if (!ready) return grokBotLifecycleUnknown("grok_bot_create_form_changed");
		await options.beforeCommit?.();
		const submitted = await click(
			`const roots=all(document,'[role="dialog"]').filter(r=>all(r,'[id="bot-create-name"]').some(e=>e.value===${JSON.stringify(name)}));if(roots.length!==1)return false;const b=all(roots[0],'button').filter(e=>text(e)==='Create Bot'&&e.getAttribute('type')==='submit');if(b.length!==1||b[0].disabled||b[0].getAttribute('aria-disabled')==='true')return false;b[0].click();return true;`,
			"bot-create-submit",
		);
		if (!submitted) return grokBotLifecycleUnknown("grok_bot_create_guard_rejected");
		if (
			!(await wait(
				`return route()&&all(document,'button').some(e=>text(e)===${JSON.stringify(name)});`,
			))
		)
			return { ...grokBotLifecycleUnknown("grok_bot_create_unconfirmed"), effectState: "unknown" };
		const id = await evaluate<string>("return route();");
		if (!(await open({ id, name })))
			return {
				...grokBotLifecycleUnknown("grok_bot_created_editor_unavailable"),
				effectState: "unknown",
			};
		const read = await inspect({ id, name });
		return {
			...read,
			code: read.status === "supported" ? "grok_bot_created" : "grok_bot_create_unconfirmed",
			effectState: read.status === "supported" ? "completed" : "unknown",
		};
	}
	async function reconcile(name: string, expectedId?: string): Promise<GrokBotLifecycleResult> {
		if (await evaluate<boolean>("return settings().length>0;"))
			return {
				...grokBotLifecycleUnknown("grok_bot_reconciliation_open_editor_unsaved"),
				effectState: "unknown",
			};
		const id = await evaluate<string | null>(
			`const id=route();if(!id||(${JSON.stringify(expectedId ?? null)}&&id!==${JSON.stringify(expectedId ?? null)}))return null;return all(document,'button').some(e=>text(e)===${JSON.stringify(name)})||settings().some(r=>all(r,'[id="bot-settings-name"]')[0].value===${JSON.stringify(name)})?id:null;`,
		);
		if (!id || !(await open({ id, name })))
			return {
				...grokBotLifecycleUnknown("grok_bot_reconciliation_unconfirmed"),
				effectState: "unknown",
			};
		return inspect({ id, name });
	}
	return { inspect, open, edit, create, reconcile };
}
