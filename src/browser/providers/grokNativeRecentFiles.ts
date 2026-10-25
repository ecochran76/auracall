import { GROK_COMMITTED_REACT_PATH } from "./grokCommittedReact.js";

/** Native Recent uses an account-scoped assets list and menu-item React keys.
 * The key, not the label or list position, joins each committed row to its DTO. */
export const GROK_NATIVE_RECENT_FILES = `
${GROK_COMMITTED_REACT_PATH}
const hasNativeRecentAuthority = root => Array.from(root.querySelectorAll('button')).some(b=>visible(b)&&/^(attach|attach files)$/i.test(b.getAttribute('aria-label')||b.innerText||'')&&!!b.getAttribute('aria-controls'));
const ownedRecentMenus = root => {
 const attach=Array.from(root.querySelectorAll('button')).filter(b=>visible(b)&&/^(attach|attach files)$/i.test(b.getAttribute('aria-label')||b.innerText||''));
 if(attach.length!==1)return null;
 const parentId=attach[0].getAttribute('aria-controls');if(!parentId)return null;
 const parent=document.getElementById(parentId);
 if(!parent||!visible(parent)||parent.getAttribute('role')!=='menu'||parent.getAttribute('aria-labelledby')!==attach[0].getAttribute('id'))return null;
 const recent=Array.from(parent.querySelectorAll('[role="menuitem"]')).filter(e=>visible(e)&&(e.innerText||'').trim()==='Recent files');
 if(recent.length!==1)return {parent,chooser:null};
 const chooser=document.getElementById(recent[0].getAttribute('aria-controls'));
 if(!chooser||!visible(chooser)||chooser.getAttribute('role')!=='menu'||chooser.getAttribute('aria-labelledby')!==recent[0].getAttribute('id'))return {parent,chooser:null};
 return {attach:attach[0],recent:recent[0],parent,chooser};
};
const nativeRecentFiles = (root,userId) => {
 const menus=ownedRecentMenus(root);if(!menus?.chooser||!userId)return null;
 const chooser=menus.chooser,proofs=[];
 const currentHost=node=>{const keys=Object.keys(node).filter(k=>k.startsWith('__reactFiber'));const proof=keys.length===1?committedPath(node[keys[0]],node,node):null;if(proof)proofs.push(proof);return proof;};
 if(!currentHost(root)||!currentHost(menus.attach)||!currentHost(menus.recent)||!currentHost(chooser))return null;
 const rows=Array.from(chooser.querySelectorAll('[role="menuitem"]')).filter(visible);
 if(!rows.length||rows.length>100)return null;
 const result=[],ids=new Set();
 for(const row of rows){
  const proof=currentHost(row);if(!proof)return null;
  const keys=new Set();const candidates=[];
  for(const fiber of proof.path){
   if(typeof fiber.key==='string')keys.add(fiber.key);
   const assets=fiber.memoizedProps?.assets;
   if(Array.isArray(assets)){
    if(assets.length>100)return null;
    for(const asset of assets)if(asset&&keys.has(asset.assetId))candidates.push(asset);
    break;
   }
   if(fiber.stateNode===chooser)break;
  }
  if(candidates.length!==1)return null;
  const asset=candidates[0],id=asset.assetId;
  if(typeof id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)||ids.has(id)||asset.ownerUserId!==userId||asset.key!=='users/'+userId+'/'+id+'/content'||asset.fileSource!=='SELF_UPLOAD_FILE_SOURCE'||asset.isDeleted!==false||typeof asset.name!=='string'||!asset.name||typeof asset.mimeType!=='string'||typeof asset.sizeBytes!=='number'||!Number.isSafeInteger(asset.sizeBytes)||asset.sizeBytes<0||!(row.innerText||'').includes(asset.name))return null;
  ids.add(id);result.push({row,file:{id,name:asset.name,state:'unknown'}});
 }
 if(proofs.some(p=>p.owner.current!==p.current))return null;
 return {chooser,rows:result};
};
`;
