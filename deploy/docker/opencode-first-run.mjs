// Uses the native catalog and native completion path; never overrides provider.opencode.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
export function parseCatalog(text) {
  const candidates=[];
  for(const match of text.matchAll(/^opencode\/([^\r\n]+)\r?\n(\{[\s\S]*?^\})/gm)){
    try{const model=JSON.parse(match[2]);if(model.providerID==='opencode'&&model.cost?.input===0&&model.cost?.output===0&&model.capabilities?.toolcall===true&&model.status==='active')candidates.push({id:`opencode/${model.id}`,name:model.name,api:model.api,cost:model.cost,release:model.release_date??''});}catch{}
  }
  return candidates.sort((a,b)=>b.release.localeCompare(a.release));
}
function execute(args,env,cwd,timeout=60000){return new Promise(resolve=>{
  const child=spawn('opencode',args,{env,cwd,stdio:['ignore','pipe','pipe']});let stdout='';let stderr='';let timedOut=false;
  child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),2000).unref();},timeout);
  child.once('error',()=>{clearTimeout(timer);resolve({code:1,stdout,stderr});});
  child.once('close',code=>{clearTimeout(timer);resolve({code:timedOut?124:code,stdout,stderr});});
});}
const CHECK_FILE='spaceapp-check.txt';
const CHECK_PROMPT=`Use the read tool to read the file ${CHECK_FILE} in the current directory, then reply with exactly its contents and nothing else.`;
const events=stdout=>stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
// A model counts as working only after a full tool cycle: it calls the read
// tool, receives the result and answers with the random token from the file.
// A plain completion is not enough; some free models fail on tool follow-ups.
export function toolCycleSucceeded(result,token) {
  if(result.code!==0||!token)return false;
  const list=events(result.stdout);
  if(list.some(e=>e.type==='error'))return false;
  const tool=list.findIndex(e=>e.type==='tool_use'&&e.part?.tool==='read'&&e.part?.state?.status==='completed');
  if(tool<0)return false;
  const answer=list.findIndex((e,i)=>i>tool&&e.type==='text'&&e.part?.text?.includes(token));
  return answer>tool&&list.some((e,i)=>i>answer&&e.type==='step_finish');
}
export function withBootstrap(config) {
  if(config.instructions!==undefined&&!Array.isArray(config.instructions))throw new Error('OpenCode instructions must be an array; existing settings were preserved.');
  const instructions=[...new Set([...(config.instructions??[]),
    '/etc/AGENTS.md','/etc/spaceapp-installation-guide.md','/var/lib/spaceapp/memory/*.md'])];
  const next={...config,instructions};
  // Respect an owner's explicit permission policy. Fresh installs authorize
  // only their shared private memory directory; other external paths still ask.
  if(config.permission===undefined || (typeof config.permission==='object' &&
      config.permission!==null && !('*' in config.permission) &&
      !('external_directory' in config.permission))) {
    next.permission={...(config.permission??{}),external_directory:{
      '*':'ask','/var/lib/spaceapp/memory':'allow','/var/lib/spaceapp/memory/*':'allow'}};
  }
  return next;
}
// Catalog (20 s) plus selection stays under the 130 s OpenCode credential-smoke timeout in the API.
const SELECTION_BUDGET_MS=100000;
export async function selectWorkingFreeModel({env=process.env,executeNative=execute}={}) {
  const directory=await mkdtemp(join(tmpdir(),'spaceapp-free-model-'));
  const isolated={PATH:env.PATH,LANG:env.LANG,USER:env.USER,HOME:directory,XDG_CONFIG_HOME:join(directory,'config'),XDG_DATA_HOME:join(directory,'data'),XDG_CACHE_HOME:join(directory,'cache'),XDG_STATE_HOME:join(directory,'state')};
  try {
    const deadline=Date.now()+SELECTION_BUDGET_MS;
    const listed=await executeNative(['models','opencode','--refresh','--verbose'],isolated,directory,20000);
    if(listed.code!==0)throw new Error('Native OpenCode catalog could not be refreshed. Retry when online.');
    const candidates=parseCatalog(listed.stdout);
    const work=join(directory,'work');await mkdir(work);
    for(const candidate of candidates.slice(0,5)) {
      const remaining=deadline-Date.now(); if(remaining<10000)break;
      process.stderr.write(`Checking free OpenCode model: ${candidate.name}\n`);
      const token=`SPACEAPP-${randomBytes(6).toString('hex')}`;
      await writeFile(join(work,CHECK_FILE),token+'\n');
      const res=await executeNative(['run','--format','json','--model',candidate.id,CHECK_PROMPT],isolated,work,Math.min(40000,remaining));
      if(toolCycleSucceeded(res,token)){
        return {...candidate,verification:'tool-call',verifiedAt:new Date().toISOString(),nativeSessionId:events(res.stdout).find(e=>e.sessionID)?.sessionID ?? null};
      }
    }
    throw new Error('No free OpenCode model completed a tool call. The app remains available; retry OpenCode later or choose a provider in Settings.');
  } finally {await rm(directory,{recursive:true,force:true});}
}
export async function configureFirstRun(env=process.env) {
  const configDir=env.XDG_CONFIG_HOME;
  if(!configDir)throw new Error('OpenCode config directory is required');
  const directory=join(configDir,'opencode');
  await mkdir(directory,{recursive:true});
  const path=join(directory,'opencode.json');
  const lock=join(directory,'.spaceapp-first-run.lock');
  const deadline=Date.now()+SELECTION_BUDGET_MS+20000;
  for(;;){
    try {await mkdir(lock);break;} catch(error){
      if(error.code!=='EEXIST')throw error;
      if(Date.now()>=deadline)throw new Error('OpenCode initialization is already running. Retry after it finishes.');
      await delay(500);
    }
  }
  try {
    const previous=await readFile(path,'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
    const config=previous===null?{}:JSON.parse(previous);
    const model=config.model?null:await selectWorkingFreeModel({env});
    const next=withBootstrap(model?{...config,model:model.id}:config);
    if(JSON.stringify(next)===JSON.stringify(config))return;
    const current=await readFile(path,'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
    if(current!==previous)throw new Error('OpenCode configuration changed during discovery. Retry to preserve your settings.');
    await writeFile(path,JSON.stringify(next,null,2),{mode:0o600,flag:previous===null?'wx':'w'});
    if(model) {
      const memory='/var/lib/spaceapp/memory';await mkdir(memory,{recursive:true});
      await writeFile(join(memory,'installation-model.json'),JSON.stringify(model,null,2),{mode:0o600});
    }
  } finally { await rm(lock,{recursive:true,force:true}); }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) configureFirstRun().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
