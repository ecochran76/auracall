// Opt-in installed-runtime proof. Opens only about:blank in one managed browser.
// Requires scheduler/completions paused and strict native absence before launch.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = process.argv[2] ?? path.join(os.homedir(), '.auracall/user-runtime/node_modules/auracall');
const receiptPath = process.argv[3] ?? '/tmp/auracall-plan0390-installed-tab-proof.json';
const imported = async relative => import(pathToFileURL(path.join(root, 'dist', relative)).href);
const [{loadUserConfig}, {resolveRuntimeProfileUserConfig}, {BrowserService},
  {resolveConfiguredServiceAccountId}, {createBrowserTabConcurrencyRuntime},
  {acquireLiveFollowCrawlerTab, acquireEphemeralBrowserTab},
  {runConfiguredChatgptTabMaintenance}, {releaseAbsentBrowserTabLeases},
  {verifyChromeProcessAbsent,findChromeProcessUsingUserDataDir}, {fetchWithLocalApiAuth}] = await Promise.all([
  'src/config.js', 'src/browser/service/profileConfig.js', 'src/browser/service/browserService.js',
  'src/config/serviceAccountIdentity.js', 'src/browser/tabConcurrencyRuntime.js',
  'src/accountMirror/liveFollowTabCoordinator.js', 'src/browser/configuredChatgptTabMaintenance.js',
  'packages/browser-service/src/service/tabInventory.js', 'packages/browser-service/src/processCheck.js',
  'src/cli/localApiClient.js',
].map(imported));
const CDP = createRequire(path.join(root, 'package.json'))('chrome-remote-interface');
const runtimeProfileId = 'wsl-chrome-3';
const config = resolveRuntimeProfileUserConfig((await loadUserConfig(os.homedir())).config,
  {runtimeProfileId,provider:'chatgpt'});
assert.equal(config.browser.tabConcurrencyMode,'tab-affinity');
const scopedConfig = {...config, profiles:{[runtimeProfileId]:config.profiles[runtimeProfileId]}};
delete scopedConfig.runtimeProfiles;
const service = BrowserService.fromConfig(config,'chatgpt');
const managedBrowserProfile = service.resolveLaunchContext('chatgpt').managedBrowserProfile.directory;
const tenantKey = resolveConfiguredServiceAccountId(config,{serviceId:'chatgpt',runtimeProfileId});
assert.ok(tenantKey);
const scope = {runtimeProfileId,managedBrowserProfile,service:'chatgpt',tenantKey};
const {registry} = createBrowserTabConcurrencyRuntime(config);
const receipt = {startedAt:new Date().toISOString(),runtimeRoot:root,processId:process.pid,
  runtimeProfileId,managedBrowserProfile,providerNavigationCount:0,phases:[]};
async function record(phase,details={}) {
  const item={at:new Date().toISOString(),phase,...details};receipt.phases.push(item);
  await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(item));
}
const response=await fetchWithLocalApiAuth('http://127.0.0.1:18095/status',
  {signal:AbortSignal.timeout(20000)},fetch);
assert.equal(response.status,200);const status=await response.json();
assert.equal(status.accountMirrorScheduler.paused,true);
assert.ok(status.accountMirrorCompletions.active.every(x=>x.status==='paused'));
assert.equal(await verifyChromeProcessAbsent(managedBrowserProfile),true);
assert.equal((await registry.list({scope:{managedBrowserProfile,service:'chatgpt'},states:['active','idle','lost','retiring']})).length,0);
await record('preflight-passed');
let endpoint=null, browserPid=null;
const pages=async()=> (await CDP.List({host:endpoint.host,port:endpoint.port})).filter(x=>x.type==='page');
const common={registry,scope,targetUrl:'about:blank',idleTtlMs:1000,absoluteTtlMs:1000,
  resolveExistingEndpoint:async()=>endpoint,
  verifyBrowserAbsent:()=>verifyChromeProcessAbsent(managedBrowserProfile),
  startBrowser:async()=>{
    const started=await service.resolveServiceTarget({serviceId:'chatgpt',configuredUrl:'about:blank',ensurePort:true});
    assert.ok(started.port);assert.equal(started.managedBrowserProfile,managedBrowserProfile);
    endpoint={host:started.host??'127.0.0.1',port:started.port,managedBrowserProfile};
    const owner=await findChromeProcessUsingUserDataDir(managedBrowserProfile);assert.ok(owner);
    const stat=await fs.readFile(`/proc/${owner.pid}/stat`,'utf8');
    const parent=Number(stat.slice(stat.lastIndexOf(')')+2).split(' ')[1]);
    assert.equal(parent,process.pid,'Fixture must own the native browser it will close');browserPid=owner.pid;
    await record('native-browser-started',{browserPid,port:endpoint.port,startupPages:(await pages()).length});
    return endpoint;
  },
  listTargets:async()=> (await pages()).map(x=>({targetId:x.id,url:x.url})),
  inspectTarget:async(_endpoint,targetId)=>{const target=(await pages()).find(x=>x.id===targetId);return target?{url:target.url}:null;},
  openTarget:async()=>{const target=await CDP.New({host:endpoint.host,port:endpoint.port,url:'about:blank'});return {targetId:target.id,url:target.url};},
  closeTarget:async({targetId})=>CDP.Close({host:endpoint.host,port:endpoint.port,id:targetId}),
};
const maintenance=()=>runConfiguredChatgptTabMaintenance({userConfig:scopedConfig});
try {
  const first=await acquireLiveFollowCrawlerTab({...common,operationId:'plan0390-proof-follow-1'});
  assert.ok((await registry.idle({claim:first.claim,now:new Date().toISOString(),effectState:'settled'})).ok);
  const child=await acquireEphemeralBrowserTab({...common,operationId:'plan0390-proof-child'});
  assert.equal(child.lease.targetId,first.lease.targetId);
  assert.ok((await registry.idle({claim:child.claim,now:new Date().toISOString(),effectState:'settled'})).ok);
  const second=await acquireLiveFollowCrawlerTab({...common,operationId:'plan0390-proof-follow-2'});
  assert.equal(second.lease.targetId,first.lease.targetId);
  assert.ok((await registry.idle({claim:second.claim,now:new Date().toISOString(),effectState:'settled'})).ok);
  assert.equal((await pages()).length,1);
  await record('follow-child-follow-reused',{targetId:first.lease.targetId,leaseId:first.lease.leaseId,pageCount:1});
  const extras=[];for(let i=0;i<3;i++)extras.push((await CDP.New({host:endpoint.host,port:endpoint.port,url:'about:blank'})).id);
  const initialMaintenance=await maintenance();
  const deadlines=(await registry.list({scope:{managedBrowserProfile,service:'chatgpt'},states:['idle']}))
    .filter(x=>extras.includes(x.targetId)).map(x=>({leaseId:x.leaseId,targetId:x.targetId,idleExpiresAt:x.idleExpiresAt,absoluteExpiresAt:x.absoluteExpiresAt}));
  assert.equal(deadlines.length,3);for(const d of deadlines)assert.ok(Date.parse(d.absoluteExpiresAt)>Date.now());
  const expiry=Math.max(...deadlines.map(x=>Date.parse(x.absoluteExpiresAt)));
  await record('extra-pages-have-persisted-ttl',{pageCount:(await pages()).length,deadlines,maintenanceErrors:initialMaintenance.errors.length});
  while(Date.now()<expiry+3000){
    await new Promise(resolve=>setTimeout(resolve,30000));
    await maintenance();
    const current=await registry.list({scope:{managedBrowserProfile,service:'chatgpt'},states:['idle','released']});
    for(const d of deadlines){const lease=current.find(x=>x.leaseId===d.leaseId);assert.equal(lease.absoluteExpiresAt,d.absoluteExpiresAt);}
    await record('elapsed-time-check',{pageCount:(await pages()).length,secondsUntilExpiry:Math.max(0,Math.ceil((expiry-Date.now())/1000))});
  }
  await maintenance();const remaining=await pages();assert.deepEqual(remaining.map(x=>x.id),[first.lease.targetId]);
  const follow=await registry.findByProcess(scope);assert.equal(follow.targetId,first.lease.targetId);assert.equal(follow.retention,'live-follow');
  await record('physical-ttl-proof-passed',{pageCount:1,retainedTargetId:first.lease.targetId,elapsedMs:Date.now()-Date.parse(receipt.startedAt)});
  receipt.result='passed';
} catch(error) {receipt.result='failed';receipt.error=String(error);await record('failure',{error:String(error)});process.exitCode=1;}
finally {
  if(endpoint && browserPid){
    const owner=await findChromeProcessUsingUserDataDir(managedBrowserProfile);assert.equal(owner?.pid,browserPid);
    const version=await CDP.Version({host:endpoint.host,port:endpoint.port});
    const browser=await CDP({target:version.webSocketDebuggerUrl});await browser.Browser.close();await browser.close().catch(()=>{});
    for(let i=0;i<30 && !(await verifyChromeProcessAbsent(managedBrowserProfile));i++)await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(await verifyChromeProcessAbsent(managedBrowserProfile),true);
    await releaseAbsentBrowserTabLeases({registry,scope:{managedBrowserProfile,service:'chatgpt'},now:new Date().toISOString()});
    await record('cleanup-verified',{nativeBrowserAbsent:true,fencedLeaseCount:(await registry.list({scope:{managedBrowserProfile,service:'chatgpt'},states:['active','idle','lost','retiring']})).length});
  }
  receipt.completedAt=new Date().toISOString();await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
}
