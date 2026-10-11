import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseCatalog,preferDefault,toolCycleSucceeded,selectWorkingFreeModel,withBootstrap} from '../../deploy/docker/opencode-first-run.mjs';
const line=e=>JSON.stringify(e);
const toolRun=token=>[line({type:'step_start'}),line({type:'tool_use',part:{type:'tool',tool:'read',state:{status:'completed'}}}),line({type:'step_finish'}),line({type:'step_start'}),line({type:'text',part:{text:token}}),line({type:'step_finish'})].join('\n');
const entry=(id,cost=0)=>`opencode/${id}\n${JSON.stringify({id,providerID:'opencode',name:id,status:'active',cost:{input:cost,output:cost},capabilities:{toolcall:true},release_date:'2026-09-01'},null,2)}`;
test('only native explicitly zero-priced tool models are eligible',()=>{
 assert.deepEqual(parseCatalog(entry('free')+'\n'+entry('paid',1)).map(x=>x.id),['opencode/free']);
});
test('only a completed read tool call followed by the file token counts as working',()=>{
 const token='SPACEAPP-0123456789ab';
 assert.equal(toolCycleSucceeded({code:0,stdout:toolRun(token)},token),true);
 assert.equal(toolCycleSucceeded({code:0,stdout:''},token),false);
 // A plain completion without the tool call is not enough.
 assert.equal(toolCycleSucceeded({code:0,stdout:[line({type:'text',part:{text:token}}),line({type:'step_finish'})].join('\n')},token),false);
 // The tool ran but the follow-up turn failed upstream.
 assert.equal(toolCycleSucceeded({code:0,stdout:[line({type:'tool_use',part:{tool:'read',state:{status:'completed'}}}),line({type:'error',error:{name:'APIError'}})].join('\n')},token),false);
 // A different token (a guessed answer) does not count.
 assert.equal(toolCycleSucceeded({code:0,stdout:toolRun('SPACEAPP-guess')},token),false);
 assert.equal(toolCycleSucceeded({code:1,stdout:toolRun(token)},token),false);
});
test('a model that fails the tool cycle falls through to another free model without provider override',async()=>{
 const calls=[];
 const selected=await selectWorkingFreeModel({executeNative:async(args,env,cwd)=>{
 calls.push(args); assert.equal(env.OPENCODE_API_KEY,undefined);
 if(args[0]==='models')return {code:0,stdout:entry('unavailable')+'\n'+entry('working')};
 const token=readFileSync(join(cwd,'spaceapp-check.txt'),'utf8').trim();
 assert.match(token,/^SPACEAPP-[0-9a-f]{12}$/);
 if(args.includes('opencode/unavailable'))return {code:0,stdout:[line({type:'tool_use',part:{tool:'read',state:{status:'completed'}}}),line({type:'error'})].join('\n')};
 return {code:0,stdout:toolRun(token)};
 }});
 assert.equal(selected.id,'opencode/working');assert.equal(selected.verification,'tool-call');assert.equal(calls.length,3);
});

test('bootstrap loads installation memory and authorizes only its external directory',()=>{
 const c=withBootstrap({model:'owner/model',instructions:['/owner/rules.md']});
 assert.equal(c.model,'owner/model');
 assert.ok(c.instructions.includes('/owner/rules.md'));
 assert.ok(c.instructions.includes('/var/lib/spaceapp/memory/*.md'));
 assert.equal(c.permission.external_directory['*'],'ask');
 assert.equal(c.permission.external_directory['/var/lib/spaceapp/memory/*'],'allow');
 assert.deepEqual(withBootstrap(c),c);
});
test('an explicit owner permission policy is preserved, including global denial',()=>{
 for(const permission of ['deny',{'*':'deny'},{external_directory:'deny'},{external_directory:{'*':'deny'}}]){
  const c=withBootstrap({model:'owner/model',permission});
  assert.deepEqual(c.permission,permission);
 }
 assert.throws(()=>withBootstrap({instructions:'invalid'}),/existing settings were preserved/);
});

test('Big Pickle is tried first, then the newest free models',async()=>{
 assert.deepEqual(preferDefault([{id:'opencode/new-free'},{id:'opencode/big-pickle'}]).map(x=>x.id),['opencode/big-pickle','opencode/new-free']);
 const tried=[];
 const selected=await selectWorkingFreeModel({executeNative:async(args,env,cwd)=>{
  if(args[0]==='models')return {code:0,stdout:entry('new-free')+'\n'+entry('big-pickle')};
  tried.push(args[args.indexOf('--model')+1]);
  if(args.includes('opencode/big-pickle'))return {code:0,stdout:line({type:'error'})};
  return {code:0,stdout:toolRun(readFileSync(join(cwd,'spaceapp-check.txt'),'utf8').trim())};
 }});
 assert.deepEqual(tried,['opencode/big-pickle','opencode/new-free']);
 assert.equal(selected.id,'opencode/new-free');
});
