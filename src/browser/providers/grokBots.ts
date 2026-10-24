import { withCdpCommandTimeout } from "../../../packages/browser-service/src/guardedCdp.js";
import type { GrokConnectorRuntime } from "./grokConnectors.js";

export type GrokBotSource = "owned" | "catalog";
export interface GrokBotIdentity {
	id: string;
	name: string;
	author: string | null;
	source: GrokBotSource;
}
export interface GrokBotSelector {
	id: string;
	source: GrokBotSource;
	author?: string;
}
export interface GrokBotInventory {
	status: "supported" | "blocked" | "unknown";
	code: string;
	providerAccountRef: string | null;
	bots: GrokBotIdentity[];
	coverage: { scope: "visible"; complete: false };
}
export interface GrokBotSelection {
	status: "supported" | "blocked" | "unknown";
	code: string;
	bot: GrokBotIdentity | null;
}
const helpers = `
 const visible = el => el && el.getAttribute('aria-hidden') !== 'true' && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
 const text = el => String(el?.innerText || el?.textContent || '').trim();
 const all = (root,selector) => Array.from(root.querySelectorAll(selector)).filter(visible);
 const editor = () => { const es = all(document,'[contenteditable="true"],textarea').filter(e => !e.closest?.('[role="dialog"]')); return es.length === 1 ? es[0] : null; };
 const id = el => { const explicit=el.getAttribute('data-bot-id'); if(explicit) return explicit; const href=el.getAttribute('href'); if(!href) return null; try {const url=new URL(href,location.href); if(url.origin!=='https://grok.com')return null; return /^\\/(?:bot|bots)\\/([^/?#]+)\\/?$/.exec(url.pathname)?.[1] || null;} catch{return null;} };
 const identity = (el,source) => { const lines=text(el).split(/\\n+/).map(x=>x.trim()).filter(Boolean); const author=el.getAttribute('data-author') || lines.find(x=>/^by /i.test(x))?.replace(/^by /i,'') || null; return {id:id(el),name:lines[0] || '',author,source}; };
`;
const expr = (body: string) => `(() => {${helpers}\n${body}})()`;
export function createGrokBotClient(
	runtime: GrokConnectorRuntime,
	options: { abortSignal?: AbortSignal } = {},
) {
	async function evaluate<T>(body: string): Promise<T> {
		options.abortSignal?.throwIfAborted();
		const value = await withCdpCommandTimeout(
			runtime,
			{ timeoutMs: 5000, timeoutMessage: "grok_bot_dom_timeout", abortSignal: options.abortSignal },
			() => runtime.evaluate({ expression: expr(body), returnByValue: true }),
		);
		if (value.exceptionDetails) throw new Error("grok_bot_dom_failed");
		return value.result.value as T;
	}
	async function list(source: GrokBotSource): Promise<GrokBotInventory> {
		const probe = await evaluate<{ code: string; bots: GrokBotIdentity[] }>(`
   const source=${JSON.stringify(source)};
   let roots;
   if(source==='catalog') roots=all(document,'[role="dialog"]').filter(r=>all(r,'[role="tab"]').some(t=>text(t)==='Bots' && t.getAttribute('aria-selected')==='true'));
   else roots=all(document,'[role="listbox"],[role="menu"]').filter(r=>/Bots/.test(text(r)));
   if(roots.length!==1)return {code:'grok_bot_surface_unknown',bots:[]};
   const root=roots[0];
   if(/sign in required|upgrade to continue/i.test(text(root)))return {code:'grok_bot_account_gated',bots:[]};
   if(/couldn.t load|failed to load/i.test(text(root)))return {code:'grok_bot_inventory_unknown',bots:[]};
   const bots=[]; const seen=new Set(); let missing=false;
   for(const row of all(root,'a,button,[role="option"],[role="menuitem"]')) {
    const bot=identity(row,source); if(!bot.id){ if(row.getAttribute('data-bot-id')!==null)missing=true; continue; }
    if(!bot.name || (source==='catalog'&&!bot.author)){missing=true;continue;}
    const key=bot.id+'|'+bot.author; if(seen.has(key))continue;seen.add(key);bots.push(bot);
   }
   return {code:missing||!bots.length?'grok_bot_inventory_unknown':'grok_bot_inventory_visible',bots:bots.slice(0,100)};
  `);
		return {
			status:
				probe.code === "grok_bot_account_gated"
					? "blocked"
					: probe.code === "grok_bot_inventory_visible"
						? "supported"
						: "unknown",
			code: probe.code,
			providerAccountRef: null,
			bots: probe.bots,
			coverage: { scope: "visible", complete: false },
		};
	}
	return {
		list,
		readArtifactReferences: (responseId: string) =>
			evaluate<{
				status: "observed" | "unknown";
				references: { id: string; name: string; url: string }[];
			}>(`
         const responseId=${JSON.stringify(responseId)};
         const roots=all(document,'[id],[data-message-id]').filter(el=>el.getAttribute('id')===responseId||el.getAttribute('data-message-id')===responseId);
         if(roots.length!==1)return {status:'unknown',references:[]};
         const references=[];const seen=new Set();
         for(const link of all(roots[0],'a')) {
          try {const url=new URL(link.getAttribute('href'),location.href);
           const match=/^\\/files\\/([^/?#]+)\\/?$/.exec(url.pathname);
           if(url.origin!=='https://grok.com'||!match||seen.has(match[1]))continue;
           const name=link.getAttribute('download')||text(link);if(!name)continue;
           seen.add(match[1]);references.push({id:match[1],name,url:url.origin+url.pathname});
          }catch{}
         }
         return {status:'observed',references:references.slice(0,100)};
        `),
		openCatalog: () =>
			evaluate<boolean>(`
   const roots=all(document,'[role="dialog"]');
   const existing=roots.filter(r=>all(r,'[role="tab"]').some(t=>text(t)==='Bots'));
   if(existing.length===1 && roots.length===1){const tabs=all(existing[0],'[role="tab"]').filter(t=>text(t)==='Bots');if(tabs.length!==1)return false;tabs[0].click();return true;}
   if(roots.length)return false;
   const buttons=all(document,'button,[role="button"]').filter(b=>b.getAttribute('aria-label')==='Plugins'||text(b)==='Plugins');
   if(buttons.length!==1)return false;buttons[0].click();return true;
  `),
		focusEmptyComposer: () =>
			evaluate<boolean>(`
   const el=editor(); if(!el||text(el)||el.value||all(el,'[contenteditable="false"]').length)return false;
   if(!/^https:\\/\\/grok.com\\/?(?:[?#].*)?$/.test(location.href))return false;
   el.focus();return true;
  `),
		select: async (selector: GrokBotSelector): Promise<GrokBotSelection> => {
			if (selector.source !== "owned")
				return { status: "blocked", code: "grok_bot_catalog_installation_deferred", bot: null };
			const observed = await list("owned");
			const matches = observed.bots.filter(
				(bot) => bot.id === selector.id && (!selector.author || bot.author === selector.author),
			);
			if (matches.length !== 1)
				return { status: "unknown", code: "grok_bot_selection_ambiguous", bot: null };
			const expected = matches[0];
			const selected = await evaluate<boolean>(`
    const expected=${JSON.stringify(expected)};
    const roots=all(document,'[role="listbox"],[role="menu"]').filter(r=>/Bots/.test(text(r)));if(roots.length!==1)return false;
    const rows=all(roots[0],'a,button,[role="option"],[role="menuitem"]').filter(row=>{const bot=identity(row,'owned');return bot.id===expected.id&&bot.name===expected.name&&bot.author===expected.author;});
    if(rows.length!==1)return false;rows[0].click();return true;
   `);
			if (!selected) return { status: "unknown", code: "grok_bot_selection_unverified", bot: null };
			const verified = await evaluate<boolean>(`
    const el=editor();if(!el)return false;
    const tokens=all(el,'[contenteditable="false"]');
    const expected=${JSON.stringify(expected)};
    return tokens.length===1 && id(tokens[0])===expected.id && text(tokens[0]).replace(/^@/,'')===expected.name;
   `);
			return {
				status: verified ? "supported" : "unknown",
				code: verified ? "grok_bot_selected" : "grok_bot_selection_unverified",
				bot: verified ? expected : null,
			};
		},
	};
}
