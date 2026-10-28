import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ConversationArtifact, FileRef } from "./domain.js";
import type { GrokFileRuntime } from "./grokFiles.js";
import { GROK_COMMITTED_REACT_PATH } from "./grokCommittedReact.js";

const MAX_BYTES = 25 * 1024 * 1024;
export interface GrokWorkspaceFileObservation {
	conversationId: string;
	fsKey: string;
	filePath: string;
	fileName: string;
	mimeType: string;
	dataUrlSha256: string;
	contentRevision: string | number | null;
	appId: null;
	appVersion: null;
	sizeBytes?: number;
	sha256?: string;
	bytesBase64?: string;
}

/** Reads one actually selected native viewer. It never selects files or invokes
 * React hooks, provider callbacks, network requests or generated code. */
export async function readGrokWorkspaceFile(
	runtime: GrokFileRuntime,
	conversationId: string,
	selection?: { filePath: string; dataUrlSha256: string; captureBytes?: boolean },
): Promise<GrokWorkspaceFileObservation> {
	const reply = await runtime.evaluate({
		awaitPromise: true,
		returnByValue: true,
		expression: `(async()=>{
  const expected=${JSON.stringify({ conversationId, selection, maxBytes: MAX_BYTES })};
  const fail=reason=>{throw new Error('grok_workspace_file_'+reason);};
  if(location.origin!=='https://grok.com'||location.pathname!=='/c/'+expected.conversationId)fail('route_mismatch');
  const own=(o,k)=>{const d=o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k):null;return d&&'value'in d?d.value:undefined;};
  const visible=e=>e instanceof HTMLElement&&!e.closest('[aria-hidden="true"],[data-state="closed"],[data-closed="true"]')&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
  ${GROK_COMMITTED_REACT_PATH}
  const buttons=Array.from(document.querySelectorAll('button[aria-label="File tree"]')).filter(visible);
  if(buttons.length!==1)fail('tree_unqualified');const button=buttons[0],key=Object.keys(button).find(k=>k.startsWith('__reactFiber$'));
  const committed=key?committedPath(own(button,key),button,button):null;if(!committed)fail('commit_unqualified');
  const scope=committed.path.find(f=>own(own(own(f,'memoizedProps'),'fs'),'fsKey')==='conversation:'+expected.conversationId);
  if(!scope)fail('filesystem_mismatch');
  const scopeProps=own(scope,'memoizedProps'),nativeFs=own(scopeProps,'fs');
  const todo=[scope],seen=new Set(),viewers=[],trees=[];let budget=8000;
  while(todo.length&&budget-->0){const f=todo.pop();if(!f||seen.has(f))continue;seen.add(f);const p=own(f,'memoizedProps');
   if(p){if(own(p,'status')==='ready'&&Array.isArray(own(p,'tree')))trees.push(own(p,'tree'));
    const filePath=own(p,'filePath');if(typeof filePath==='string'&&(!expected.selection||filePath===expected.selection.filePath))viewers.push(f);
   }if(f.sibling&&f!==scope)todo.push(f.sibling);if(f.child)todo.push(f.child);
  }
  if(todo.length||viewers.length!==1)fail('viewer_ambiguous');
  const viewer=viewers[0],props=own(viewer,'memoizedProps'),filePath=own(props,'filePath');
  if(!filePath.startsWith('/')||filePath.includes('\\0')||filePath.split('/').some(p=>p==='..'||p==='.'))fail('path_unqualified');
  const nodes=trees.flat(),paths=new Set();budget=4000;while(nodes.length&&budget-->0){const n=nodes.pop();if(own(n,'isDir')===false)paths.add(own(n,'path'));const children=own(n,'children');if(Array.isArray(children))nodes.push(...children);}
  if(nodes.length||!paths.has(filePath))fail('path_not_in_ready_tree');
  const scan=()=>{const stack=[{v:own(viewer,'memoizedState'),d:0},{v:own(viewer,'updateQueue'),d:0}],seen=new Set(),assets=[],data=[];let remaining=4000;
   while(stack.length&&remaining-->0){const {v:o,d}=stack.pop();if(!o||typeof o!=='object'||o instanceof HTMLElement||seen.has(o)||d>10)continue;seen.add(o);
    if(typeof own(o,'assetUrl')==='string')assets.push(o);if(typeof own(o,'dataUrl')==='string')data.push(o);
    for(const k of Object.keys(o).slice(0,200)){if(Array.isArray(o)||['memoizedState','baseState','next','memoCache','data','value','current'].includes(k)){const v=own(o,k);if(v&&typeof v==='object')stack.push({v,d:d+1});}}
   }if(stack.length)fail('cache_bound');return{assets,data};
  };
  const state=scan(),fileName=filePath.split('/').pop();
  if(!state.assets.length||!state.data.length)fail('native_content_unobserved');
  const raw=own(state.assets[0],'assetUrl'),mimeType=own(state.assets[0],'mimeType');
  if(!raw.startsWith('data:')||raw.length>expected.maxBytes*4+1024||typeof mimeType!=='string')fail('data_url_unqualified');
  if(state.assets.some(o=>own(o,'assetUrl')!==raw||own(o,'fileName')!==fileName||own(o,'isLoading')!==false||own(o,'isError')!==false||own(o,'isWorkspaceInactive')!==false)||state.data.some(o=>own(o,'dataUrl')!==raw))fail('content_conflict');
  const fingerprint=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const dataUrlSha256=await fingerprint(new TextEncoder().encode(raw));
  if(expected.selection&&expected.selection.dataUrlSha256!==dataUrlSha256)fail('content_changed');
  const revision=own(state.assets[0],'contentRevision');
  const result={conversationId:expected.conversationId,fsKey:own(nativeFs,'fsKey'),filePath,fileName,mimeType,dataUrlSha256,contentRevision:typeof revision==='string'||typeof revision==='number'?revision:null,appId:null,appVersion:null};
  if(expected.selection?.captureBytes){
   const comma=raw.indexOf(',');if(comma<5)fail('data_url_malformed');const header=raw.slice(0,comma),encoded=raw.slice(comma+1);let bytes;
   if(/;base64$/i.test(header)){const binary=atob(encoded);if(binary.length>expected.maxBytes)fail('byte_budget');bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));}
   else{const values=[];for(let i=0;i<encoded.length;){if(encoded[i]==='%'){const hex=encoded.slice(i+1,i+3);if(!/^[a-f0-9]{2}$/i.test(hex))fail('data_url_malformed');values.push(parseInt(hex,16));i+=3;}else{const point=String.fromCodePoint(encoded.codePointAt(i));values.push(...new TextEncoder().encode(point));i+=point.length;}if(values.length>expected.maxBytes)fail('byte_budget');}bytes=Uint8Array.from(values);}
   result.sizeBytes=bytes.length;result.sha256=await fingerprint(bytes);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));result.bytesBase64=btoa(binary);
  }
  const fresh=scan();if(committed.owner.current!==committed.current||own(viewer,'memoizedProps')!==props||own(props,'filePath')!==filePath||own(scope,'memoizedProps')!==scopeProps||own(scopeProps,'fs')!==nativeFs||own(nativeFs,'fsKey')!=='conversation:'+expected.conversationId||fresh.assets.length!==state.assets.length||fresh.data.length!==state.data.length||fresh.assets.some((o,i)=>o!==state.assets[i]||own(o,'assetUrl')!==raw||own(o,'fileName')!==fileName||own(o,'mimeType')!==mimeType||own(o,'isLoading')!==false||own(o,'isError')!==false||own(o,'isWorkspaceInactive')!==false||own(o,'contentRevision')!==revision)||fresh.data.some((o,i)=>o!==state.data[i]||own(o,'dataUrl')!==raw))fail('commit_changed');
  return result;
 })()`,
	});
	if (reply.exceptionDetails)
		throw new Error("Grok selected workspace file could not be qualified.");
	const value = reply.result?.value as GrokWorkspaceFileObservation | undefined;
	if (
		!value ||
		value.conversationId !== conversationId ||
		value.fsKey !== `conversation:${conversationId}` ||
		typeof value.filePath !== "string" ||
		typeof value.fileName !== "string" ||
		value.fileName !== path.posix.basename(value.filePath) ||
		// biome-ignore lint/nursery/noUnnecessaryConditions: Optional selection is absent during metadata discovery.
		(selection &&
			(value.filePath !== selection.filePath || value.dataUrlSha256 !== selection.dataUrlSha256)) ||
		!/^([a-f0-9]{64})$/.test(value.dataUrlSha256)
	)
		throw new Error("Grok selected workspace file returned invalid evidence.");
	return value;
}

export async function materializeGrokWorkspaceFile(
	runtime: GrokFileRuntime,
	input: {
		conversationId: string;
		artifact: ConversationArtifact;
		destDir: string;
		targetId: string;
		providerAccountRef: string;
		providerAccountRefFormat: "legacy-untagged";
		verifyPrincipal: () => Promise<boolean>;
	},
): Promise<FileRef> {
	const selected = input.artifact.metadata?.grokWorkspaceFile as
		| { version?: unknown; conversationId?: unknown; filePath?: unknown; dataUrlSha256?: unknown }
		| undefined;
	if (
		selected?.version !== 1 ||
		selected.conversationId !== input.conversationId ||
		typeof selected.filePath !== "string" ||
		input.artifact.id !== selected.filePath ||
		typeof selected.dataUrlSha256 !== "string" ||
		!input.targetId ||
		!input.providerAccountRef ||
		input.providerAccountRefFormat !== "legacy-untagged"
	)
		throw new Error("Grok workspace selection lacks conversation/path provenance.");
	const captured = await readGrokWorkspaceFile(runtime, input.conversationId, {
		filePath: selected.filePath,
		dataUrlSha256: selected.dataUrlSha256,
		captureBytes: true,
	});
	const bytes = Buffer.from(captured.bytesBase64 ?? "", "base64"),
		sha256 = createHash("sha256").update(bytes).digest("hex");
	if (captured.sizeBytes !== bytes.length || bytes.length > MAX_BYTES || captured.sha256 !== sha256)
		throw new Error("Grok workspace bytes fail their capture receipt.");
	if (!(await input.verifyPrincipal()))
		throw new Error("Grok workspace account changed before retention.");
	await fs.mkdir(input.destDir, { recursive: true });
	const localPath = path.join(input.destDir, path.basename(captured.fileName));
	const temp = path.join(input.destDir, `.${randomUUID()}.part`);
	try {
		await fs.writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
		await fs.rename(temp, localPath);
	} finally {
		await fs.rm(temp, { force: true });
	}
	const file: FileRef = {
		id: captured.filePath,
		name: captured.fileName,
		provider: "grok",
		source: "conversation",
		localPath,
		mimeType: captured.mimeType,
		size: bytes.length,
		checksumSha256: sha256,
		metadata: {
			materialization: "grok-native-selected-workspace-data",
			grokWorkspaceFile: {
				version: 1,
				conversationId: captured.conversationId,
				fsKey: captured.fsKey,
				filePath: captured.filePath,
				dataUrlSha256: captured.dataUrlSha256,
				contentRevision: captured.contentRevision,
				appId: null,
				appVersion: null,
				targetId: input.targetId,
				providerAccountRef: input.providerAccountRef,
				providerAccountRefFormat: input.providerAccountRefFormat,
				sizeBytes: bytes.length,
				sha256,
			},
		},
	};
	const receiptPath = `${localPath}.grok-receipt.json`;
	const receiptTemp = path.join(input.destDir, `.${randomUUID()}.receipt.part`);
	try {
		await fs.writeFile(
			receiptTemp,
			JSON.stringify({
				object: "grok_workspace_file_capture",
				fileName: file.name,
				proof: file.metadata?.grokWorkspaceFile,
			}),
			{ flag: "wx", mode: 0o600 },
		);
		await fs.rename(receiptTemp, receiptPath);
	} finally {
		await fs.rm(receiptTemp, { force: true });
	}
	file.metadata = { ...file.metadata, materializationReceiptPath: receiptPath };
	return file;
}
