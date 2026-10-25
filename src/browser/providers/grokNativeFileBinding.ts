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
 * this relationship. Unknown phases deliberately stay unknown. */
export async function observeGrokNativeFileBinding(
	runtime: GrokFileRuntime,
	input: {
		composerId: string;
		uploadToken: string;
		providerUserId: string;
		sources: GrokLocalFileSource[];
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
      const nativeInput = root?.querySelector('[data-auracall-upload="'+expected.uploadToken+'"]');
      if (!root || !nativeInput || !expected.providerUserId) return unavailable;
      const selected = Array.from(nativeInput.files || []);
      if (selected.length !== expected.sources.length) return conflict;
      const buttons = Array.from(root.querySelectorAll('button[aria-label="Open attachment"]'));
      if (!buttons.length) return unavailable;
      const bindings = new Map();
      const ids = new Map();
      for (const button of buttons) {
        const keys = Object.keys(button).filter(key => key.startsWith('__reactFiber'));
        if (keys.length !== 1) return unavailable;
        let fiber = button[keys[0]];
        const visited = new Set();
        for (let depth = 0; fiber && depth < 48; depth++, fiber = fiber.return) {
          if (visited.has(fiber)) return conflict;
          visited.add(fiber);
          const props = fiber.memoizedProps;
          if (props && typeof props === 'object') {
            const local = props.localFile ?? props.file;
            const index = selected.indexOf(local);
            if (index >= 0 && props.metadata) {
              const metadata = props.metadata;
              const source = expected.sources[index];
              const id = metadata.fileMetadataId;
              if (typeof id !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id) ||
                  metadata.fileSource !== 'SELF_UPLOAD_FILE_SOURCE' ||
                  metadata.fileUri !== 'users/'+expected.providerUserId+'/'+id+'/content' ||
                  metadata.fileName !== local.name || metadata.fileMimeType !== local.type ||
                  local.name !== source.name || local.size !== source.size || typeof local.arrayBuffer !== 'function') return conflict;
              const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await local.arrayBuffer()))).map(value=>value.toString(16).padStart(2,'0')).join('');
              if (digest !== source.sha256) return conflict;
              const phase = typeof props.phase === 'string' ? props.phase : null;
              const state = ['processing','uploading','retrying'].includes(phase) ? 'progress' : 'unknown';
              const binding = {id,name:metadata.fileName,state,sourceSha256:digest,sourceBinding:'native-file-object'};
              const old = bindings.get(index);
              if ((old && JSON.stringify(old) !== JSON.stringify(binding)) || (ids.has(id) && ids.get(id) !== index)) return conflict;
              bindings.set(index,binding);ids.set(id,index);
            }
          }
          if (fiber.stateNode === root) break;
        }
      }
      if (bindings.size !== selected.length) return unavailable;
      return {status:'verified',files:Array.from(bindings.entries()).sort((a,b)=>a[0]-b[0]).map(entry=>entry[1])};
    })()`,
	});
	if (response.exceptionDetails) return { status: "unavailable", files: [] };
	const value = response.result?.value as GrokNativeBindingResult | undefined;
	return value ?? { status: "unavailable", files: [] };
}
