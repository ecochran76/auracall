import { GROK_COMMITTED_REACT_PATH } from "./grokCommittedReact.js";
import type { GrokConnectorRuntime } from "./grokConnectors.js";
export interface GrokNativeConnectorRow {
	handle: string;
	id: string;
	type: "mcp" | "live";
	endpoint: string | null;
}
/** Actual connector-card label props carry the account-scoped server DTO.
 * Its stable connectorId must also be the committed card fiber's key. */
export async function observeGrokNativeConnectorRows(
	runtime: GrokConnectorRuntime,
	input: {
		providerUserId: string;
		rows: { handle: string; name: string; kind: "installed" | "catalog" }[];
	},
): Promise<GrokNativeConnectorRow[]> {
	const response = await runtime.evaluate({
		returnByValue: true,
		awaitPromise: true,
		expression: `(() => {
  const expected=${JSON.stringify(input)};
  const visible=e=>{for(let n=e;n;n=n.parentElement)if(n.getAttribute('role')==='dialog'&&n.getAttribute('data-closed')!==null)return false;return e&&e.getAttribute('aria-hidden')!=='true'&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;};
  const roots=Array.from(document.querySelectorAll('[role="dialog"]')).filter(d=>visible(d)&&Array.from(d.querySelectorAll('[role="tab"]')).some(t=>String(t.innerText||t.textContent||'').trim()==='Connectors'));
  if(roots.length!==1||!expected.providerUserId)return [];
  const root=roots[0];
  ${GROK_COMMITTED_REACT_PATH}
  const result=[];let observed=null;
  for(const row of expected.rows){
   if(row.kind!=='installed'||!/^row-[0-9]+$/.test(row.handle))continue;
   const buttons=Array.from(root.querySelectorAll('[data-auracall-connector-read]')).filter(b=>visible(b)&&b.getAttribute('data-auracall-connector-read')===row.handle&&String(b.innerText||b.textContent||'').split(/\\n+/)[0].trim()===row.name);
   if(buttons.length!==1)return [];
   const button=buttons[0],keys=Object.keys(button).filter(k=>k.startsWith('__reactFiber'));
   if(keys.length!==1)continue;
   const current=committedPath(button[keys[0]],button,root);
   if(!current)return [];
   if(observed&&(observed.owner!==current.owner||observed.current!==current.current))return [];
   observed=current;
   const candidates=[];
   for(const fiber of current.path){
    const record=fiber.memoizedProps?.label?.props?.connector;
    if(!record)continue;
    if(typeof record.connectorId!=='string'||!record.connectorId||record.connectorId.length>200||fiber.key!==record.connectorId||record.displayName!==row.name||record.originScope!==3||record.originScopeId!==expected.providerUserId||!['mcp','live'].includes(record.type))return [];
    if(record.type==='mcp'&&(typeof record.serverUrl!=='string'||!record.serverUrl))return [];
    if(record.type==='live'&&record.serverUrl!=null)return [];
    candidates.push({handle:row.handle,id:record.connectorId,type:record.type,endpoint:record.type==='mcp'?record.serverUrl:null});
   }
   if(candidates.length){if(candidates.some(c=>JSON.stringify(c)!==JSON.stringify(candidates[0])))return [];result.push(candidates[0]);}
  }
  if(observed&&observed.owner.current!==observed.current)return [];
  return result;
 })()`,
	});
	if (response.exceptionDetails || !Array.isArray(response.result.value)) return [];
	return response.result.value as GrokNativeConnectorRow[];
}
