import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserAutomationError } from "../../oracle/errors.js";
import { runGrokUiOperation } from "../grokUiOperation.js";
import type { ChromeClient } from "../types.js";
import type { ConversationArtifact, FileRef } from "./domain.js";
import { GROK_COMMITTED_REACT_PATH } from "./grokCommittedReact.js";
import type { GrokFileRuntime } from "./grokFiles.js";
import { resolveProviderTrafficGovernor } from "./mutationAudit.js";

export interface GrokReferencedFileObservation {
	version: 1;
	conversationId: string;
	providerResponseId: string;
	messageDomId: string;
	gatewayRowId: string | null;
	fileMetadataId: string;
	fileName: string;
	mimeType: string;
	fileUriSha256: string;
	appId: null;
	appVersion: null;
}

/** The actual human response DTO and its fileAttachments IDs establish membership.
 * DOM response IDs and gateway row IDs retain their distinct namespaces. */
async function observeGrokReferencedFiles(
	runtime: GrokFileRuntime,
	conversationId: string,
	providerUserId: string | null,
	operation: "discover" | "open" | "download" | "read-download" = "discover",
	selection?: GrokReferencedFileObservation,
	messageDomIds?: string[],
): Promise<{
	files: GrokReferencedFileObservation[];
	previewOpened?: boolean;
	download?: GrokReferencedFileObservation & { downloadUrlSha256: string };
}> {
	const result = await runtime.evaluate({
		awaitPromise: true,
		returnByValue: true,
		expression: `(async()=>{
 const expected=${JSON.stringify({ conversationId, providerUserId, operation, selection, messageDomIds, maxBytes: 25 * 1024 * 1024 })};
 const fail=reason=>{throw Error('grok_referenced_file_'+reason);};
 if(location.origin!=='https://grok.com'||location.pathname!=='/c/'+expected.conversationId)fail('route_mismatch');
 const own=(o,k)=>{const d=o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k):null;return d&&'value'in d?d.value:undefined;};
 const visible=e=>{if(!(e instanceof HTMLElement)||e.closest('[aria-hidden="true"],[inert]'))return false;for(let p=e;p;p=p.parentElement)if(['menu','dialog','listbox'].includes(p.getAttribute('role'))&&p.getAttribute('data-state')==='closed')return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
 ${GROK_COMMITTED_REACT_PATH}
 const buttons=Array.from(document.querySelectorAll('button[aria-label="Open attachment"]')).filter(e=>e.getAttribute('aria-label')==='Open attachment'&&visible(e)&&e.closest('[id^="response-"]')&&(!expected.messageDomIds||expected.messageDomIds.includes(e.closest('[id^="response-"]')?.id)));
 if(buttons.length>100)fail('inventory_bound');const files=[],bindings=[],seen=new Set();
 for(const button of buttons){
  const row=button.closest('[id^="response-"]'),key=Object.keys(button).find(k=>k.startsWith('__reactFiber$')),q=key?committedPath(own(button,key),button,button):null;if(!q)fail('commit_unqualified');
  const responses=q.path.map(f=>own(own(f,'memoizedProps'),'response')).filter(r=>own(r,'conversationId')===expected.conversationId&&'response-'+own(r,'responseId')===row.id);
  if(!responses.length)fail('response_unqualified');const response=responses[0];
  if(own(response,'sender')!=='human')continue;
  if(!expected.providerUserId||responses.some(r=>own(r,'responseId')!==own(response,'responseId')||own(r,'sender')!=='human'))fail('response_conflict');
  const metadata=q.path.map(f=>own(own(f,'memoizedProps'),'metadata')).filter(m=>typeof own(m,'fileMetadataId')==='string');if(!metadata.length)fail('metadata_unqualified');const m=metadata[0];
  const id=own(m,'fileMetadataId'),name=own(m,'fileName'),mime=own(m,'fileMimeType'),uri=own(m,'fileUri'),responseId=own(response,'responseId'),members=own(response,'fileAttachments');
  if(typeof id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)||typeof name!=='string'||!name||name.length>255||/[\\/\\\\\\0]/.test(name)||name==='.'||name==='..'||typeof mime!=='string'||!mime||uri!=='users/'+expected.providerUserId+'/'+id+'/content'||own(m,'fileSource')!=='SELF_UPLOAD_FILE_SOURCE'||!Array.isArray(members)||!members.includes(id)||metadata.some(n=>own(n,'fileMetadataId')!==id||own(n,'fileName')!==name||own(n,'fileMimeType')!==mime||own(n,'fileUri')!==uri||own(n,'fileSource')!=='SELF_UPLOAD_FILE_SOURCE'))fail('metadata_conflict');
  if(seen.has(id))fail('duplicate_reference');seen.add(id);
  const fileUriSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uri)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(q.owner.current!==q.current||own(response,'fileAttachments')!==members||!members.includes(id)||own(m,'fileUri')!==uri||own(m,'fileMetadataId')!==id)fail('commit_changed');
  bindings.push({button,row,q,response,m,members});
  files.push({version:1,conversationId:expected.conversationId,providerResponseId:responseId,messageDomId:row.id,gatewayRowId:row.closest('[data-plane-row]')?.getAttribute('data-plane-row')||null,fileMetadataId:id,fileName:name,mimeType:mime,fileUriSha256,appId:null,appVersion:null});
 }
 if(expected.operation==='discover')return{files};
 const indexes=files.map((file,index)=>({file,index})).filter(({file})=>file.fileMetadataId===expected.selection?.fileMetadataId&&file.providerResponseId===expected.selection?.providerResponseId);
 if(indexes.length!==1)fail('selection_unqualified');const {file,index}=indexes[0],binding=bindings[index];
 if(['conversationId','providerResponseId','messageDomId','fileMetadataId','fileName','mimeType','fileUriSha256'].some(k=>file[k]!==expected.selection[k]))fail('selection_changed');
 const previewBinding=()=>{const matches=[];for(const button of Array.from(document.querySelectorAll('button[aria-label="Download"]')).filter(visible)){const key=Object.keys(button).find(k=>k.startsWith('__reactFiber$')),q=key?committedPath(own(button,key),button,button):null;if(!q||q.owner!==binding.q.owner||q.current!==binding.q.current)continue;for(const f of q.path){if(typeof f.type!=='function')continue;const source=Function.prototype.toString.call(f.type);if(!source.includes('ASSET_SERVER_URL')||!source.includes('SidePanel:assetDownload'))continue;const data=own(own(own(f,'updateQueue'),'memoCache'),'data'),block=Array.isArray(data)?data[0]:null;if(!Array.isArray(block))continue;const base=own(block,'0'),active=own(block,'1'),raw=own(block,'2'),meta=own(active,'data');if(typeof base!=='string'||typeof raw!=='string'||own(active,'type')!=='asset'||own(meta,'fileMetadataId')!==file.fileMetadataId)continue;const uri=own(binding.m,'fileUri');if(own(meta,'fileName')!==file.fileName||own(meta,'fileMimeType')!==file.mimeType||own(meta,'fileUri')!==uri||own(meta,'fileSource')!=='SELF_UPLOAD_FILE_SOURCE')fail('preview_conflict');let url,baseUrl;try{url=new URL(raw);baseUrl=new URL(base)}catch{fail('preview_url_unqualified');}if(url.protocol!=='https:'||url.origin!=='https://assets.grok.com'||url.origin!==baseUrl.origin||url.pathname!=='/'+uri||url.username||url.password||url.hash)fail('preview_url_unqualified');matches.push({button,q,f,data,block,base,active,meta,raw,uri});}}if(matches.length>1)fail('preview_ambiguous');return matches[0]||null;};
 const preview=previewBinding();
 if(expected.operation==='open'){
  if(preview)return{files,previewOpened:false};
  if(Array.from(document.querySelectorAll('[role="dialog"]')).some(visible)||binding.button.disabled||binding.button.getAttribute('aria-disabled')==='true'||binding.q.owner.current!==binding.q.current)fail('preview_open_unqualified');
  binding.button.click();await new Promise(r=>setTimeout(r,300));return{files,previewOpened:true};
 }
 if(!preview)fail('preview_unqualified');
 const downloadUrlSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(preview.raw)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(binding.q.owner.current!==binding.q.current||preview.q.owner.current!==preview.q.current||own(binding.response,'fileAttachments')!==binding.members||!binding.members.includes(file.fileMetadataId)||own(binding.m,'fileUri')!==preview.uri||own(preview.block,'0')!==preview.base||own(preview.block,'1')!==preview.active||own(preview.block,'2')!==preview.raw||own(preview.active,'data')!==preview.meta||own(preview.meta,'fileMetadataId')!==file.fileMetadataId||own(preview.meta,'fileUri')!==preview.uri||own(own(own(preview.f,'updateQueue'),'memoCache'),'data')!==preview.data)fail('commit_changed');
 if(expected.operation==='download'){if(preview.button.disabled||preview.button.getAttribute('aria-disabled')==='true')fail('download_disabled');preview.button.click();}
 return{files,download:{...file,downloadUrlSha256}};
 })()`,
	});
	if (
		result.exceptionDetails ||
		!Array.isArray((result.result?.value as { files?: unknown })?.files)
	)
		throw new Error("Grok native referenced-file inventory could not be qualified.");
	return result.result?.value as {
		files: GrokReferencedFileObservation[];
		previewOpened?: boolean;
		download?: GrokReferencedFileObservation & { downloadUrlSha256: string };
	};
}

export async function readGrokReferencedFiles(
	runtime: GrokFileRuntime,
	conversationId: string,
	providerUserId: string | null,
	messageDomIds?: string[],
) {
	return (
		await observeGrokReferencedFiles(
			runtime,
			conversationId,
			providerUserId,
			"discover",
			undefined,
			messageDomIds,
		)
	).files;
}
export async function prepareGrokReferencedFilePreview(
	runtime: GrokFileRuntime,
	conversationId: string,
	providerUserId: string | null,
	selection: GrokReferencedFileObservation,
) {
	return observeGrokReferencedFiles(runtime, conversationId, providerUserId, "open", selection);
}
interface ReferenceDownloadState {
	setup: "not_attempted" | "attempted" | "acknowledged";
	reset: "not_needed" | "pending" | "default_acknowledged" | "unknown";
}
async function captureNativeReference(directory: string, fileName: string, signal?: AbortSignal) {
	const deadline = Date.now() + 30000;
	let previous = "",
		stable = 0;
	while (Date.now() < deadline) {
		signal?.throwIfAborted();
		const names = await fs.readdir(directory),
			entries = await Promise.all(
				names.map(async (name) => ({ name, stat: await fs.lstat(path.join(directory, name)) })),
			);
		if (
			entries.some(
				(e) => !e.stat.isFile() || e.stat.isSymbolicLink() || e.stat.size > 25 * 1024 * 1024,
			)
		)
			throw Error("grok_reference_capture_invalid");
		const signature = JSON.stringify(
			entries.map((e) => ({ name: e.name, size: e.stat.size, mtime: e.stat.mtimeMs })),
		);
		stable =
			entries.length === 1 && entries[0].name === fileName && signature === previous
				? stable + 1
				: 0;
		previous = signature;
		if (stable >= 3) {
			const localPath = path.join(directory, fileName),
				handle = await fs.open(localPath, constants.O_RDONLY | constants.O_NOFOLLOW);
			try {
				const before = await handle.stat(),
					buffer = Buffer.alloc(before.size + 1),
					{ bytesRead } = await handle.read(buffer, 0, buffer.length, 0),
					bytes = buffer.subarray(0, bytesRead),
					after = await handle.stat();
				if (
					!after.isFile() ||
					before.ino !== after.ino ||
					before.dev !== after.dev ||
					before.size !== after.size ||
					before.mtimeMs !== after.mtimeMs ||
					bytes.length !== before.size ||
					bytes.length > 25 * 1024 * 1024
				)
					throw Error("grok_reference_capture_changed");
				await fs.chmod(localPath, 0o600);
				return {
					localPath,
					sizeBytes: bytes.length,
					sha256: createHash("sha256").update(bytes).digest("hex"),
				};
			} finally {
				await handle.close();
			}
		}
		await delay(100, undefined, { signal });
	}
	throw Error("grok_reference_capture_deadline");
}
export async function materializeGrokReferencedFile(
	client: ChromeClient,
	input: {
		conversationId: string;
		artifact: ConversationArtifact;
		destDir: string;
		targetId: string;
		providerUserId: string | null;
		providerAccountRef: string;
		providerAccountRefFormat: "legacy-untagged";
		verifyPrincipal: () => Promise<boolean>;
		acknowledgeTargetDefaultReset?: true;
		abortSignal?: AbortSignal;
	},
): Promise<FileRef> {
	if (input.acknowledgeTargetDefaultReset !== true)
		throw new BrowserAutomationError(
			"Grok reference transfer requires acknowledgeTargetDefaultReset=true.",
			{ stage: "grok-reference-download", effectState: "pre_effect", retrySafe: true },
		);
	const selection = input.artifact.metadata?.grokReferencedFile as
		| GrokReferencedFileObservation
		| undefined;
	if (
		selection?.version !== 1 ||
		selection.conversationId !== input.conversationId ||
		selection.fileMetadataId !== input.artifact.id
	)
		throw Error("Grok referenced-file selection is unqualified.");
	const governor = resolveProviderTrafficGovernor(client);
	if (
		!governor ||
		governor.attribution.provider !== "grok" ||
		governor.attribution.targetId !== input.targetId
	)
		throw Error("Grok referenced-file download authority is unqualified.");
	const page = client.Page as unknown as {
			setDownloadBehavior?: (input: {
				behavior: "allow" | "default";
				downloadPath?: string;
			}) => Promise<unknown>;
		},
		setPolicy = page.setDownloadBehavior?.bind(page);
	if (!setPolicy) throw Error("Grok native target download policy is unavailable.");
	await runGrokUiOperation({
		governor,
		runtime: client.Runtime,
		kind: "in-page-click",
		source: "provider:grok:referenced-file-preview",
		abortSignal: input.abortSignal,
		effect: () =>
			prepareGrokReferencedFilePreview(
				client.Runtime,
				input.conversationId,
				input.providerUserId,
				selection,
			),
	});
	const prepared = await observeGrokReferencedFiles(
		client.Runtime,
		input.conversationId,
		input.providerUserId,
		"read-download",
		selection,
	);
	if (!prepared.download) throw Error("Grok native reference Download control is unqualified.");
	await fs.mkdir(input.destDir, { recursive: true, mode: 0o700 });
	const captureDir = path.join(input.destDir, `reference-capture-${randomUUID()}`);
	await fs.mkdir(captureDir, { mode: 0o700 });
	const state: ReferenceDownloadState = { setup: "not_attempted", reset: "not_needed" };
	let attempted = false,
		retained: FileRef | undefined,
		failure: unknown;
	const intentPath = path.join(captureDir, "..", `reference-intent-${randomUUID()}.json`);
	const persist = async () => {
		if (retained) {
			const receipt = retained.metadata?.materializationReceiptPath as string;
			await fs.writeFile(
				receipt,
				JSON.stringify(
					{
						object: "grok_referenced_file_capture",
						fileName: retained.name,
						proof: retained.metadata?.grokReferencedFile,
					},
					null,
					2,
				),
				{ mode: 0o600 },
			);
		}
	};
	try {
		await fs.writeFile(
			intentPath,
			JSON.stringify(
				{
					object: "grok_reference_download_intent",
					selection,
					targetId: input.targetId,
					downloadCapture: state,
					captureDir,
				},
				null,
				2,
			),
			{ mode: 0o600, flag: "wx" },
		);
		state.setup = "attempted";
		state.reset = "pending";
		await setPolicy({ behavior: "allow", downloadPath: captureDir });
		state.setup = "acknowledged";
		if (!(await input.verifyPrincipal()))
			throw Error("Grok reference account changed before download.");
		attempted = true;
		const dispatched = await runGrokUiOperation({
			governor,
			runtime: client.Runtime,
			kind: "in-page-click",
			source: "provider:grok:referenced-file-download",
			abortSignal: input.abortSignal,
			effect: () =>
				observeGrokReferencedFiles(
					client.Runtime,
					input.conversationId,
					input.providerUserId,
					"download",
					selection,
				),
		});
		if (dispatched.download?.downloadUrlSha256 !== prepared.download.downloadUrlSha256)
			throw Error("Grok reference native download selection changed.");
		const captured = await captureNativeReference(
			captureDir,
			selection.fileName,
			input.abortSignal,
		);
		const after = await observeGrokReferencedFiles(
			client.Runtime,
			input.conversationId,
			input.providerUserId,
			"read-download",
			selection,
		);
		if (
			after.download?.downloadUrlSha256 !== prepared.download.downloadUrlSha256 ||
			!(await input.verifyPrincipal())
		)
			throw Error("Grok reference account or native selection changed before retention.");
		const proof = {
			...after.download,
			targetId: input.targetId,
			providerAccountRef: input.providerAccountRef,
			providerAccountRefFormat: input.providerAccountRefFormat,
			sha256: captured.sha256,
			sizeBytes: captured.sizeBytes,
			coverage: { scope: "visible-conversation-references", complete: false },
			downloadCapture: state,
		};
		const receiptPath = `${captured.localPath}.grok-reference-receipt.json`;
		retained = {
			id: selection.fileMetadataId,
			name: selection.fileName,
			provider: "grok",
			source: "conversation",
			localPath: captured.localPath,
			mimeType: selection.mimeType,
			size: captured.sizeBytes,
			checksumSha256: captured.sha256,
			metadata: {
				materialization: "grok-native-conversation-reference",
				grokReferencedFile: proof,
				materializationReceiptPath: receiptPath,
			},
		};
		await persist();
	} catch (error) {
		failure = error;
	} finally {
		if (state.setup !== "not_attempted") {
			try {
				await setPolicy({ behavior: "default" });
				state.reset = "default_acknowledged";
			} catch (error) {
				state.reset = "unknown";
				failure = failure ?? error;
			}
		}
		try {
			await persist();
		} catch (error) {
			failure = failure ?? error;
		}
	}
	if (failure || state.reset === "unknown" || !retained)
		throw new BrowserAutomationError(
			"Grok referenced-file native download outcome is unknown; preserve its capture and reconcile before retry.",
			{
				stage: "grok-reference-download",
				effectState: attempted ? "unknown" : "pre_effect",
				retrySafe: !attempted && state.reset !== "unknown",
				downloadCapture: state,
				captureDir,
				intentPath,
				...(retained ? { retainedFile: retained } : {}),
			},
			failure,
		);
	return retained;
}
