import { GROK_COMMITTED_REACT_PATH } from "./grokCommittedReact.js";
import type { GrokComposerFile, GrokFileRuntime } from "./grokFiles.js";

export interface GrokLocalFileSource {
	name: string;
	size: number;
	sha256: string;
}
export interface GrokNativeBindingResult {
	status: "verified" | "unavailable" | "conflict";
	files: GrokComposerFile[];
}

/** Native discovery: the attachment component retains the exact input File
 * alongside metadata.fileMetadataId. A name or a newly mounted chip is never
 * this relationship. Ready requires the actual committed native submit gate;
 * attachment phase alone is presentation state. */
export async function observeGrokNativeFileBinding(
	runtime: GrokFileRuntime,
	input: {
		composerId: string;
		uploadToken: string | null;
		providerUserId: string;
		sources: GrokLocalFileSource[] | null;
	},
): Promise<GrokNativeBindingResult> {
	const response = await runtime.evaluate({
		awaitPromise: true,
		returnByValue: true,
		expression: `(async () => {
      const expected = ${JSON.stringify(input)};
      const unavailable = {status:'unavailable',files:[]};
      const conflict = {status:'conflict',files:[]};
      const root = document.querySelector('[data-auracall-files-composer="'+expected.composerId+'"]');
      if (!root || !expected.providerUserId) return unavailable;
      const allInputs = Array.from(root.querySelectorAll('input[type="file"]'));
      const inputs = allInputs.filter(input => {
        const token = input.getAttribute('data-auracall-upload');
        return expected.uploadToken ? token === expected.uploadToken : typeof token === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(token);
      });
      const nativeInput=inputs.length===1?inputs[0]:expected.sources===null&&!expected.uploadToken&&allInputs.length===1?allInputs[0]:null;
      if(!nativeInput)return unavailable;
      const selected = Array.from(nativeInput.files || []);
      const metadataOnly=expected.sources===null&&!expected.uploadToken&&selected.length===0;
      if ((!selected.length&&!metadataOnly) || selected.length > 100) return unavailable;
      const observedSources = [];
      if (expected.sources === null) {
        for (const local of selected) {
          if (typeof local.arrayBuffer !== 'function') return unavailable;
          const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await local.arrayBuffer()))).map(value=>value.toString(16).padStart(2,'0')).join('');
          observedSources.push({name:local.name,size:local.size,sha256});
        }
      }
      const sources = expected.sources ?? observedSources;
      if (selected.length !== sources.length) return conflict;
      const buttons = Array.from(root.querySelectorAll('button[aria-label="Open attachment"]'));
      if (!buttons.length || buttons.length>100 || (!metadataOnly&&buttons.length !== selected.length)) return unavailable;
      // The DOM key may retain an inactive alternate. Locate the root from
      // it, then qualify the exact host through the committed child topology.
      ${GROK_COMMITTED_REACT_PATH}
      // Native submit's handler and aria-disabled are both gated by the
      // committed isQueryable prop. Attachment phase alone is presentation
      // state once a valid metadata object exists.
      let submitGate = null;
      const submits = Array.from(root.querySelectorAll('button[data-testid="chat-submit"]'));
      if (submits.length === 1) {
        const submit = submits[0];
        const keys = Object.keys(submit).filter(key=>key.startsWith('__reactFiber'));
        const committed = keys.length === 1 ? committedPath(submit[keys[0]],submit,root) : null;
        if (committed) {
          const flags = committed.path.filter(fiber=>fiber.memoizedProps && Object.prototype.hasOwnProperty.call(fiber.memoizedProps,'isQueryable')).map(fiber=>fiber.memoizedProps.isQueryable);
          const disabled = committed.path.some(fiber=>fiber.memoizedProps?.disabled===true || fiber.memoizedProps?.isDisabled===true);
          submitGate = {owner:committed.owner,current:committed.current,ready:flags.length>0 && flags.every(flag=>flag===true) && !disabled && submit.disabled===false && submit.getAttribute('aria-disabled')==='false' && submit.getAttribute('type')==='submit'};
        }
      }
      const bindings = new Map();
      const denied = new Set();
      const ids = new Map();
      let observedRoot = null;
      for (const [buttonIndex,button] of buttons.entries()) {
        const keys = Object.keys(button).filter(key => key.startsWith('__reactFiber'));
        if (keys.length !== 1) return unavailable;
        const committed = committedPath(button[keys[0]],button,root);
        if (!committed) return unavailable;
        if (observedRoot && (observedRoot.owner !== committed.owner || observedRoot.current !== committed.current)) return unavailable;
        observedRoot = committed;
        for (const fiber of committed.path) {
          const props = fiber.memoizedProps;
          if (props && typeof props === 'object') {
            const local = props.localFile ?? props.file;
            const index = metadataOnly?buttonIndex:selected.indexOf(local);
            if (index >= 0 && props.metadata) {
              const metadata = props.metadata;
              if (metadata instanceof Error || Object.prototype.toString.call(metadata)==='[object Error]') return conflict;
              const source = sources[index];
              const id = metadata.fileMetadataId;
              if (typeof id !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id) ||
                  metadata.fileSource !== 'SELF_UPLOAD_FILE_SOURCE' ||
                  metadata.fileUri !== 'users/'+expected.providerUserId+'/'+id+'/content'||typeof metadata.fileName!=='string'||!metadata.fileName||typeof metadata.fileMimeType!=='string')return conflict;
              let binding={id,name:metadata.fileName,sourceBinding:'native-metadata',sourceAgreement:'observed-native'};
              if(!metadataOnly){
              if(metadata.fileName !== local.name || metadata.fileMimeType !== local.type ||
                  local.name !== source.name || local.size !== source.size || typeof local.arrayBuffer !== 'function') return conflict;
              const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await local.arrayBuffer()))).map(value=>value.toString(16).padStart(2,'0')).join('');
              if (digest !== source.sha256) return conflict;
              binding = {id,name:metadata.fileName,sourceSha256:digest,sourceBinding:'native-file-object',sourceAgreement:expected.sources===null?'observed-native':'local-manifest'};
              }
              if (committed.owner.current !== committed.current) return unavailable;
              if (props.metadata !== metadata || metadata.fileMetadataId !== id || metadata.fileUri !== 'users/'+expected.providerUserId+'/'+id+'/content') return conflict;
              if (props.isPrivate===true || props.isDisabled===true || props.isClickDisabled===true || props.isDeleted===true || button.disabled===true || button.getAttribute('aria-disabled')==='true') denied.add(index);

              const old = bindings.get(index);
              if ((old && JSON.stringify(old) !== JSON.stringify(binding)) || (ids.has(id) && ids.get(id) !== index)) return conflict;
              bindings.set(index,binding);ids.set(id,index);
            }
          }
          if (fiber.stateNode === root) break;
        }
        if (committed.owner.current !== committed.current) return unavailable;
      }
      if (!observedRoot || observedRoot.owner.current !== observedRoot.current || bindings.size !== (metadataOnly?buttons.length:selected.length)) return unavailable;
      if (submitGate && (submitGate.owner !== observedRoot.owner || submitGate.current !== observedRoot.current || submitGate.owner.current !== submitGate.current)) return unavailable;
      return {status:'verified',files:Array.from(bindings.entries()).sort((a,b)=>a[0]-b[0]).map(([index,file])=>({...file,state:submitGate?.ready && !denied.has(index)?'ready':'unknown'}))};
    })()`,
	});
	if (response.exceptionDetails) return { status: "unavailable", files: [] };
	const value = response.result?.value as GrokNativeBindingResult | undefined;
	return value ?? { status: "unavailable", files: [] };
}
