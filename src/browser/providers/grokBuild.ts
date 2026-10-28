import type { ChromeClient } from "../types.js";
import { GROK_PROVIDER } from "./grok.js";

/** A Build submission starts only on the observed root composer, preserving drafts
 * and existing conversations. These selectors are the shared Grok text surface. */
export async function hasEmptyGrokBuildRoot(runtime: ChromeClient["Runtime"]): Promise<boolean> {
	const result = await runtime.evaluate({
		expression: `(() => {
    const url = new URL(location.href);
    if (url.origin !== 'https://grok.com' || url.pathname !== '/') return false;
    const visible = el => el instanceof HTMLElement && !el.closest('[role="dialog"], [aria-hidden="true"]') && !el.hasAttribute('disabled') &&
      window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const editors = [...new Set(${JSON.stringify(GROK_PROVIDER.selectors.input)}.flatMap(selector => Array.from(document.querySelectorAll(selector))))].filter(visible);
    if (editors.length !== 1) return false;
    const editor = editors[0];
    if (String(editor.value ?? editor.textContent ?? '').trim() || editor.querySelectorAll('[contenteditable="false"]').length) return false;
    const form = editor.closest('form') || editor.parentElement;
    return Boolean(form) && !form.querySelectorAll('[data-file-id], [data-attachment-id]').length &&
      !Array.from(form.querySelectorAll('input[type="file"]')).some(input => input.files && input.files.length > 0);
  })()`,
		returnByValue: true,
	});
	if (result.exceptionDetails) throw new Error("grok_build_composer_read_failed");
	return result.result?.value === true;
}
export async function readGrokBuildResponseIdentity(
	runtime: ChromeClient["Runtime"],
	responseId: string,
): Promise<{ conversationId: string; conversationUrl: string } | null> {
	const result = await runtime.evaluate({
		expression: `(() => {
    const url = new URL(location.href);
    if (url.origin !== 'https://grok.com') return null;
    const conversationId = /^\\/c\\/([^/?#]+)\\/?$/.exec(url.pathname)?.[1];
    const responses = Array.from(document.querySelectorAll('[id]')).filter(node => node.getAttribute('id') === ${JSON.stringify(responseId)});
    if (!conversationId || responses.length !== 1) return null;
    return {conversationId, conversationUrl:url.origin + url.pathname};
  })()`,
		returnByValue: true,
	});
	if (result.exceptionDetails) throw new Error("grok_build_response_read_failed");
	return result.result?.value ?? null;
}

/** Build's plane transcript is distinct from the legacy main-based text surface.
 * The auth preview URL is deliberately never returned: it contains a bearer. */
/** Native completion UI is a direct assistant child, never text inside its prose. */
export const GROK_BUILD_PLANE_COMPLETION_EXPRESSION = `(message, visible) => {
  const prose=message.querySelector('.response-content-markdown');
  if(!prose||!visible(prose)||!String(prose.innerText||prose.textContent||'').trim())return false;
  const thinking=Array.from(message.children).filter(el=>String(el.getAttribute('class')||'').split(/\\s+/).includes('thinking-container'));
  const markers=thinking.flatMap(el=>Array.from(el.querySelectorAll('[data-testid="canvas-trigger"]')))
    .filter(el=>visible(el)&&!el.closest('.response-content-markdown')&&/^Worked for\\s+\\d+[hms](?:\\s+\\d+[hms])*$/i.test(String(el.innerText||el.textContent||'').trim()));
  return markers.length===1;
}`;
export interface GrokBuildPlaneSnapshot {
	state: "completed" | "running" | "unknown";
	code: string;
	conversationId: string | null;
	conversationUrl: string | null;
	responseId: string | null;
	gatewayRowId: string | null;
	text: string | null;
	previewAvailable: boolean;
}
export async function readGrokBuildPlaneSnapshot(
	runtime: ChromeClient["Runtime"],
	request: { conversationId: string; responseId?: string; allowInertBackground?: boolean },
): Promise<GrokBuildPlaneSnapshot> {
	const reply = await runtime.evaluate({
		returnByValue: true,
		expression: `(() => {
      const expected = ${JSON.stringify(request)};
      const empty = code => ({state:'unknown',code,conversationId:null,conversationUrl:null,responseId:null,gatewayRowId:null,text:null,previewAvailable:false});
      const url = new URL(location.href);
      const id = /^\\/c\\/([^/?#]+)\\/?$/.exec(url.pathname)?.[1];
      if(url.origin!=='https://grok.com'||id!==expected.conversationId)return empty('grok_build_conversation_not_verified');
      const visible = el => el instanceof HTMLElement && !el.closest(expected.allowInertBackground?'[data-state="closed"], [data-closed=""], [data-closed="true"]':'[aria-hidden="true"], [data-state="closed"], [data-closed=""], [data-closed="true"]') &&
        window.getComputedStyle(el).display!=='none'&&window.getComputedStyle(el).visibility!=='hidden'&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0;
      const planes = Array.from(document.querySelectorAll('[data-transcript-renderer="plane"]')).filter(visible);
      if(planes.length!==1)return empty('grok_build_plane_not_verified');
      let messages = Array.from(planes[0].querySelectorAll('[data-testid="assistant-message"]')).filter(visible);
      if(messages.length>40)return empty('grok_build_plane_limit_exceeded');
      if(expected.responseId)messages=messages.filter(node=>node.closest('[id^="response-"]')?.getAttribute('id')===expected.responseId);
      if(messages.length!==1)return empty('grok_build_response_not_observed');
      const message=messages[0], response=message.closest('[id^="response-"]'), row=message.closest('[data-plane-row]');
      const responseId=response?.getAttribute('id'), gatewayRowId=row?.getAttribute('data-plane-row');
      if(!responseId||!gatewayRowId?.startsWith('gateway:')||!planes[0].contains(row)||Array.from(document.querySelectorAll('[id]')).filter(el=>el.getAttribute('id')===responseId).length!==1)return empty('grok_build_response_not_verified');
      const prose=message.querySelector('.response-content-markdown');
      const text=prose&&visible(prose)?String(prose.innerText||prose.textContent||'').replace(/\\u200b/g,'').trim():'';
      if(text.length>128000)return empty('grok_build_plane_limit_exceeded');
      const nativeComplete=(${GROK_BUILD_PLANE_COMPLETION_EXPRESSION})(message,visible);
      const stop=Array.from(document.querySelectorAll('button')).some(el=>visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&String(el.getAttribute('aria-label')||el.innerText||'').trim()==='Stop model response');
      const previewAvailable=Array.from(document.querySelectorAll('iframe')).filter(visible).some(el=>{
        try{const src=new URL(el.getAttribute('src')||'');return src.protocol==='https:'&&src.hostname.endsWith('.grok-sandbox.com')&&src.pathname==='/__grok-preview/auth'&&src.searchParams.has('token');}catch{return false;}
      });
      const state=stop?'running':nativeComplete&&text?'completed':'unknown';
      return {state,code:state==='completed'?'grok_build_plane_completed':state==='running'?'grok_build_generation_running':'grok_build_completion_unobserved',conversationId:id,conversationUrl:url.origin+url.pathname,responseId,gatewayRowId,text:text||null,previewAvailable};
    })()`,
	});
	if (reply.exceptionDetails) throw new Error("grok_build_plane_read_failed");
	const value = reply.result?.value as GrokBuildPlaneSnapshot | undefined;
	if (!value || !["completed", "running", "unknown"].includes(value.state))
		throw new Error("grok_build_plane_read_failed");
	return { ...value, text: value.text === null ? null : redactGrokBuildPreviewBearers(value.text) };
}

/** Preview authentication is browser custody, including URLs quoted in prose. */
export function redactGrokBuildPreviewBearers(value: string): string {
	return value.replace(/https:\/\/[^\s<>"')\]]+/g, (candidate) => {
		try {
			const url = new URL(candidate);
			if (
				url.hostname.endsWith(".grok-sandbox.com") &&
				url.pathname === "/__grok-preview/auth" &&
				url.searchParams.has("token")
			)
				return "[authenticated Grok preview in retained tab]";
		} catch {
			/* Non-URL response text is retained. */
		}
		return candidate;
	});
}

/** Committed Files readiness is current authority. Historical overflow visibility
 * (`everReady`) cannot establish that a workspace is still active. This read
 * never invokes provider hooks, store getters, or filesystem callbacks. */
export async function readGrokBuildWorkspaceReadiness(
	runtime: ChromeClient["Runtime"],
	conversationId: string,
): Promise<"inactive" | "unobserved"> {
	const reply = await runtime.evaluate({
		returnByValue: true,
		expression: `(() => {
      const expected=${JSON.stringify(conversationId)}, url=new URL(location.href);
      if(url.origin!=='https://grok.com'||url.pathname!=='/c/'+expected)return 'unobserved';
      const visible=el=>el instanceof HTMLElement&&!el.closest('[aria-hidden="true"],[data-state="closed"],[data-closed=""],[data-closed="true"]')&&window.getComputedStyle(el).display!=='none'&&window.getComputedStyle(el).visibility!=='hidden'&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0;
      const buttons=Array.from(document.querySelectorAll('button[aria-label="File tree"]')).filter(visible);
      if(buttons.length!==1)return 'unobserved';
      const own=(object,key)=>{if(!object||typeof object!=='object')return undefined;const descriptor=Object.getOwnPropertyDescriptor(object,key);return descriptor&&'value' in descriptor?descriptor.value:undefined;};
      const keys=Object.keys(buttons[0]).filter(key=>key.startsWith('__reactFiber$'));
      if(keys.length!==1)return 'unobserved';
      let fiber=own(buttons[0],keys[0]), inactive=false, filesystem=false;
      for(let depth=0;fiber&&depth<45;depth++,fiber=own(fiber,'return')){
        const props=own(fiber,'memoizedProps');
        if(own(props,'status')==='inactive'&&Array.isArray(own(props,'tree')))inactive=true;
        const fs=own(props,'fs');
        if(fs){if(own(fs,'fsKey')!=='conversation:'+expected)return 'unobserved';filesystem=true;}
        const owner=own(props,'conversationId');
        if(owner!==undefined)return owner===expected&&filesystem&&inactive?'inactive':'unobserved';
      }
      return 'unobserved';
    })()`,
	});
	if (reply.exceptionDetails) throw new Error("grok_build_workspace_read_failed");
	return reply.result?.value === "inactive" ? "inactive" : "unobserved";
}
