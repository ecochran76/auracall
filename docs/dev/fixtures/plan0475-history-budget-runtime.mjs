import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const originalHistoryHash='d71876bf3751912f8b81b38a40cf4d49964a334962cbfdc54db2f16ec147abf1';
const originalSharingHash='42752bcc88aca3d87c0432eeab74c31aa170cb720bfeb5ccfc4cbb33a4ca3d6c';
const adapterPath='src/browser/providers/chatgptAdapter.js';
const sharingPath='src/browser/sharedConversationListing.js';
const governorPath='packages/browser-service/src/service/providerTrafficGovernor.js';
const budgetImport='import { ProviderBackendRequestBudgetExceededError } from "../../../packages/browser-service/src/service/providerTrafficGovernor.js";\n';
const digest=value=>createHash('sha256').update(value).digest('hex');
function history(source){
 const start=source.indexOf('async function readChatgptConversationHistory(');
 const end=source.indexOf('\nasync function scrollChatgptConversationHistoryRail(',start);
 assert(start>=0&&end>start,'Expected compiled history function boundaries');
 return source.slice(start,end);
}
function files(root,prefix=''){
 return fs.readdirSync(path.join(root,prefix),{withFileTypes:true}).flatMap(entry=>{
  const relative=path.join(prefix,entry.name);
  return entry.isDirectory()?files(root,relative):entry.isFile()?[relative]:[];
 });
}

/** Preserve the active native/attachment fixes; never overwrite an install prefix.
 * This packet replaces one verified function/import and one complete coordinator
 * module. It is not a general runtime patcher or deployment command. */
export function assembleHistoryBudgetRuntime(basePrefix,buildDist,outputPrefix,sourceCommit){
 assert(/^[a-f0-9]{40}$/.test(sourceCommit),'Full source commit is required');
 const base=path.resolve(basePrefix),build=path.resolve(buildDist),output=path.resolve(outputPrefix);
 assert(!fs.existsSync(output),'Candidate prefix must be new');
 const baseDist=path.join(base,'node_modules/auracall/dist');
 const baseAdapter=fs.readFileSync(path.join(baseDist,adapterPath),'utf8');
 const oldHistory=history(baseAdapter);
 assert.equal(digest(oldHistory),originalHistoryHash,'History implementation drifted; reconcile first');
 assert.equal(digest(fs.readFileSync(path.join(baseDist,sharingPath))),originalSharingHash,'Coordinator drifted; reconcile first');
 assert.equal(digest(fs.readFileSync(path.join(baseDist,governorPath))),digest(fs.readFileSync(path.join(build,governorPath))),'Governor ABI input changed');
 const builtAdapter=fs.readFileSync(path.join(build,adapterPath),'utf8');
 const newHistory=history(builtAdapter);
 assert(builtAdapter.includes(budgetImport)&&newHistory.includes('assertHistoryRequestBudget'),'Corrected build is required');
 assert(!baseAdapter.includes(budgetImport),'Unexpected existing budget import');
 const composedAdapter=budgetImport+baseAdapter.replace(oldHistory,newHistory);
 assert.equal(composedAdapter.slice(budgetImport.length).replace(newHistory,oldHistory),baseAdapter,'Unrelated adapter bytes changed');
 fs.mkdirSync(output,{mode:0o700});
 fs.cpSync(base,output,{recursive:true,verbatimSymlinks:true});
 const outputDist=path.join(output,'node_modules/auracall/dist');
 fs.writeFileSync(path.join(outputDist,adapterPath),composedAdapter);
 fs.copyFileSync(path.join(build,sharingPath),path.join(outputDist,sharingPath));
 const changed=files(baseDist).filter(relative=>digest(fs.readFileSync(path.join(baseDist,relative)))!==digest(fs.readFileSync(path.join(outputDist,relative))));
 assert.deepEqual(changed.sort(),[adapterPath,sharingPath].sort(),'Only qualified adapter/coordinator changes are allowed');
 const receipt={basePrefix:base,buildDist:build,outputPrefix:output,sourceCommit,compiledFiles:files(outputDist).length,changedCompiledFiles:changed,originalHistoryHash,newHistoryHash:digest(newHistory),unrelatedAdapterBytesPreserved:true,allOtherDistFilesPreserved:true};
 fs.writeFileSync(path.join(output,'auracall-history-budget-assembly.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 return receipt;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 assert.equal(args.length,4,'Usage: node plan0475-history-budget-runtime.mjs BASE_PREFIX BUILD_DIST NEW_PREFIX SOURCE_COMMIT');
 console.log(JSON.stringify(assembleHistoryBudgetRuntime(...args)));
}
