import type { GrokBuildInspectRequest } from "../grokBuildService.js";
import { GROK_COMMITTED_REACT_PATH } from "./grokCommittedReact.js";
/** Native exact-current-root header/menu relations observed on the retained Build canary. */
export function grokBuildExportControlExpression(
	request: GrokBuildInspectRequest,
	gatewayRowId: string,
	token: string,
	action: "more" | "download" | "read",
) {
	return `(() => {
  const token=${JSON.stringify(token)},action=${JSON.stringify(action)};
  const result={stage:'route',ownershipQualified:false,headerOwnershipQualified:false,menuOwnershipQualified:false,flags:{},actionsPerformed:[],appVersionIdentityQualified:false};
  const finish=stage=>({...result,stage,observedAt:new Date().toISOString()});
  result.flags.routeMatches=location.origin==='https://grok.com'&&location.pathname===${JSON.stringify(`/c/${request.conversationId}`)};if(!result.flags.routeMatches)return finish('route-mismatch');
  const attrs=el=>Object.fromEntries(Array.from(el.attributes).filter(a=>['id','role','aria-controls','aria-expanded','aria-labelledby','aria-label','aria-hidden','data-state','data-open','data-closed','data-slot'].includes(a.name)).map(a=>[a.name,a.value]));
  const overlayClosed=el=>{for(let p=el;p&&p!==document.body;p=p.parentElement)if(['menu','dialog','listbox'].includes(p.getAttribute('role'))&&(p.getAttribute('data-state')==='closed'||['','true'].includes(p.getAttribute('data-closed'))))return true;return false;};
  const visible=el=>el instanceof HTMLElement&&!el.closest('[inert]')&&!el.closest('[aria-hidden="true"]')&&!overlayClosed(el)&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0;
  const allPlanes=Array.from(document.querySelectorAll('[data-transcript-renderer="plane"]'));
  const ownedPlanes=allPlanes.filter(p=>Array.from(p.querySelectorAll('[data-testid="assistant-message"]')).some(el=>el.closest('[id^="response-"]')?.getAttribute('id')===${JSON.stringify(request.responseId)}&&el.closest('[data-plane-row]')?.getAttribute('data-plane-row')===${JSON.stringify(gatewayRowId)}));
  result.flags.planeCount=allPlanes.length;result.flags.ownedPlaneCount=ownedPlanes.length;if(ownedPlanes.length!==1)return finish('background-plane-unqualified');const plane=ownedPlanes[0];
  result.flags.backgroundMayBeInert=true;
  if(plane.querySelectorAll('[data-testid="assistant-message"]').length!==1)return finish('workspace-response-ambiguous');
  ${GROK_COMMITTED_REACT_PATH}
  const qualify=el=>{const key=Object.keys(el).find(k=>k.startsWith('__reactFiber$'));return key?committedPath(el[key],el,el):null;};
  const buttons=Array.from(document.querySelectorAll('button[aria-label="More options"][aria-haspopup="menu"]')).filter(el=>!plane.contains(el));result.flags.moreTriggerCount=buttons.length;
  const assessed=buttons.map(node=>{const q=qualify(node);return{node,q,rootQualified:Boolean(q),overflowQualified:Boolean(q&&q.path.some(f=>f.memoizedProps?.overflow?.download&&typeof f.memoizedProps.overflow.download.downloadWorkspace==='function')),conversationQualified:Boolean(q&&q.path.some(f=>f.memoizedProps?.conversationId===${JSON.stringify(request.conversationId)}))};});
  result.triggerDiagnostics=assessed.map(a=>({attrs:attrs(a.node),rootQualified:a.rootQualified,overflowQualified:a.overflowQualified,conversationQualified:a.conversationQualified}));
  const owned=assessed.filter(a=>a.rootQualified&&a.overflowQualified&&a.conversationQualified);result.flags.ownedMoreTriggerCount=owned.length;
  const expanded=owned.filter(a=>a.node.getAttribute('aria-expanded')==='true');result.flags.expandedOwnedTriggerCount=expanded.length;
  const visibleOwned=owned.filter(a=>visible(a.node));const chosen=expanded.length===1?expanded[0]:expanded.length===0&&visibleOwned.length===1?visibleOwned[0]:null;if(!chosen)return finish('more-trigger-unqualified');const {node:trigger,q}=chosen;
  const header=q.path.find(f=>f.memoizedProps?.previewLabel==='Preview'&&f.memoizedProps?.filesLabel==='Files'&&typeof f.memoizedProps.isFilesActive==='boolean');
  if(header){result.headerOwnershipQualified=true;result.headerState={filesActive:header.memoizedProps.isFilesActive,previewActive:header.memoizedProps.isPreviewActive};const stack=header.child?[header.child]:[],seen=new Set();let budget=5000,present=false;while(stack.length&&budget-->0){const f=stack.pop();if(!f||seen.has(f))continue;seen.add(f);if(f.stateNode instanceof HTMLElement&&!plane.contains(f.stateNode)&&String(f.stateNode.textContent||'').trim()==='Workspace inactive')present=true;if(f.sibling)stack.push(f.sibling);if(f.child)stack.push(f.child);}result.workspaceInactiveMessageInOwnedBackground=present;result.flags.paneTraversalTruncated=stack.length>0;}
  if(!header)return finish('header-owner-unqualified');
  if(action==='more') {
   if(!visible(trigger)||trigger.disabled||trigger.getAttribute('aria-disabled')==='true'||trigger.getAttribute('aria-expanded')!=='false'||q.owner.current!==q.current)return finish('more-unavailable');
   trigger.setAttribute('data-auracall-build-download',token);return finish('owned-more-prepared');
  }
  const controls=(trigger.getAttribute('aria-controls')||'').split(/\\s+/).filter(Boolean),triggerId=trigger.getAttribute('id');
  const controlled=controls.map(id=>document.getElementById(id)).filter(Boolean);result.flags.controlledElementCount=controlled.length;
  result.activeMenuDiagnostics=Array.from(document.querySelectorAll('[role="menu"]')).filter(visible).slice(0,10).map(el=>({attrs:attrs(el),isControlled:controlled.includes(el),labelledByTrigger:Boolean(triggerId&&(el.getAttribute('aria-labelledby')||'').split(/\\s+/).includes(triggerId))}));
  const matches=controlled.filter(el=>visible(el)&&el.getAttribute('role')==='menu'&&triggerId&&(el.getAttribute('aria-labelledby')||'').split(/\\s+/).includes(triggerId));result.flags.matchingActiveMenuCount=matches.length;
  if(trigger.getAttribute('aria-expanded')!=='true'||matches.length!==1){result.flags.ownerCurrentUnchanged=q.owner.current===q.current;return finish('active-menu-relation-unqualified');}
  const menu=matches[0],mq=qualify(menu);result.flags.menuCurrentRootQualified=Boolean(mq);result.flags.sameCurrentOwner=Boolean(mq&&mq.owner===q.owner&&mq.current===q.current);
  if(!mq||mq.owner!==q.owner||mq.current!==q.current)return finish('menu-current-root-unqualified');
  if(q.owner.current!==q.current||mq.owner.current!==mq.current)return finish('current-root-changed');
  result.ownershipQualified=true;result.menuOwnershipQualified=true;result.menu={attrs:attrs(menu),text:(menu.innerText||menu.textContent||'').slice(0,32000),html:menu.outerHTML.slice(0,131072),htmlTruncated:menu.outerHTML.length>131072,items:Array.from(menu.querySelectorAll('[role="menuitem"],button,a[href]')).filter(visible).slice(0,40).map(el=>({label:(el.innerText||el.textContent||'').slice(0,200),attrs:attrs(el),disabled:el.getAttribute('aria-disabled')==='true'||el.disabled===true}))};
  const downloads=Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(el=>visible(el)&&String(el.innerText||el.textContent||'').trim()==='Download'&&el.getAttribute('aria-disabled')!=='true'&&!el.disabled);
  if(downloads.length!==1)return finish('download-item-unqualified');
  if(action==='download')downloads[0].setAttribute('data-auracall-build-download',${JSON.stringify(token)});
  return finish('owned-menu-observed');
 })()`;
}
