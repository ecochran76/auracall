import type { GrokBuildInspectRequest } from "../grokBuildService.js";
import { GROK_COMMITTED_REACT_PATH } from "./grokCommittedReact.js";

/** Observes the actual native controller; never invokes provider callbacks or Publish. */
export function grokBuildPublicationControlExpression(
	request: GrokBuildInspectRequest,
	token: string,
	action: "open" | "read" | "focus" | "dismissed",
) {
	return `(()=>{
 const expected=${JSON.stringify(request.conversationId)},token=${JSON.stringify(token)},action=${JSON.stringify(action)};
 if(location.origin!=='https://grok.com'||location.pathname!=='/c/'+expected)return{code:'route_mismatch'};
 const own=(o,k)=>{const d=o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k):null;return d&&'value'in d?d.value:undefined;};
 const visible=e=>{if(!(e instanceof HTMLElement)||e.closest('[aria-hidden="true"],[inert]'))return false;for(let p=e;p;p=p.parentElement)if(['menu','dialog','listbox'].includes(p.getAttribute('role'))&&(p.getAttribute('data-state')==='closed'||['','true'].includes(p.getAttribute('data-closed'))))return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
 ${GROK_COMMITTED_REACT_PATH}
 const qualify=e=>{const k=Object.keys(e).find(k=>k.startsWith('__reactFiber$'));return k?committedPath(own(e,k),e,e):null;};
 const dialogs=Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible);
 const triggers=Array.from(document.querySelectorAll('button[aria-haspopup="dialog"]')).filter(e=>['Publish','Published','Changes','Retry','Publishing'].includes(e.getAttribute('aria-label'))).map(node=>({node,q:qualify(node)})).filter(({q})=>q&&q.path.some(f=>own(own(f,'memoizedProps'),'conversationId')===expected)&&q.path.some(f=>{const p=own(f,'memoizedProps');return own(p,'previewLabel')==='Preview'&&own(p,'filesLabel')==='Files'&&own(p,'headerActionsVisible')===true;}));
 const candidates=triggers.filter(({node})=>action==='open'?visible(node):node.getAttribute('aria-expanded')==='true'||action==='dismissed'&&node.getAttribute('data-auracall-publication-inspect')===token);
 if(candidates.length!==1)return{code:'trigger_unqualified'};const {node:trigger,q}=candidates[0];
 if(action==='dismissed')return{code:trigger.getAttribute('data-auracall-publication-inspect')===token&&trigger.getAttribute('aria-expanded')==='false'&&dialogs.length===0?'dismissed':'dismissal_unconfirmed'};
 if(action==='open'){
  if(dialogs.length||trigger.disabled||trigger.getAttribute('aria-disabled')==='true'||trigger.getAttribute('aria-expanded')!=='false'||q.owner.current!==q.current)return{code:'open_unqualified'};
  trigger.setAttribute('data-auracall-publication-inspect',token);trigger.click();return{code:'opened'};
 }
 if(trigger.getAttribute('data-auracall-publication-inspect')!==token||dialogs.length!==1)return{code:'dialog_unqualified'};
 const dialog=dialogs[0],dq=qualify(dialog);
 if(!dq||dq.owner!==q.owner||dq.current!==q.current||dialog.getAttribute('id')!==trigger.getAttribute('aria-controls')||!dq.path.some(f=>own(own(f,'memoizedProps'),'conversationId')===expected))return{code:'dialog_owner_unqualified'};
 if(action==='focus'){dialog.focus({preventScroll:true});return{code:document.activeElement===dialog||dialog.contains(document.activeElement)?'focused':'focus_unconfirmed'};}
 const buttons=Array.from(dialog.querySelectorAll('button')).filter(e=>visible(e)&&e.innerText.trim()==='Publish');
 if(buttons.length!==1)return{code:'confirmation_unqualified'};const button=buttons[0],bq=qualify(button);
 const controllers=bq?.path.map(f=>own(f,'memoizedProps')).filter(p=>own(p,'conversationId')===expected&&typeof own(p,'ready')==='boolean'&&typeof own(p,'phase')==='string'&&typeof own(p,'onDeploy')==='function'&&Object.prototype.hasOwnProperty.call(p,'deployment'))||[];
 if(!controllers.length||bq.owner!==q.owner||bq.current!==q.current)return{code:'controller_unqualified'};
 const p=controllers[0],phase=own(p,'phase'),deployment=own(p,'deployment');
 if(!['idle','deploying','error','success'].includes(phase)||controllers.some(c=>own(c,'phase')!==phase||own(c,'deployment')!==deployment||own(c,'ready')!==own(p,'ready'))||q.owner.current!==q.current)return{code:'controller_changed'};
 const inputs=Array.from(dialog.querySelectorAll('input')).filter(e=>visible(e)&&e.type==='text'),name=inputs.length===1?inputs[0].value:null;
 return{code:'observed',controls:{state:deployment!==null?'deployment_observed':phase==='idle'?'not_published':'unknown',phase,publishEnabled:own(p,'ready')===true&&!button.disabled&&button.getAttribute('aria-disabled')!=='true',proposedName:typeof name==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)&&name.length<=100?name:null,snapshotBinding:'unqualified'}};
 })()`;
}
