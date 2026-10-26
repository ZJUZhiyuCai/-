import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLayoutAssistant,inferLayout,modelConfiguration} from '../standalone/layout-assistant.mjs';
import {openStorage} from '../standalone/storage.mjs';
import {CloudStore} from '../lib/cloud-store.mjs';
import {callTool} from '../lib/cloud-tools.mjs';
import {documentFingerprint} from '../public/editor/src/project-sync.mjs';
import {makeTemplate} from '../public/editor/src/templates.mjs';

async function fixture(t,respond){
 const directory=await mkdtemp(join(tmpdir(),'shuye-assistant-')),storage=await openStorage(directory),seen=[];
 const modelServer=createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'test-model',digest:'a'.repeat(64)}]}));return;}
  let body='';for await(const part of req)body+=part;const input=JSON.parse(body);seen.push(input);
  const content=await respond?.(input)||JSON.stringify({kind:'proposal',summary:'内外边距调整为 25 毫米。',patch:{inner:25,outer:25}});
  if(!res.destroyed)res.end(JSON.stringify({model:'test-model',done:true,done_reason:'stop',message:{content}}));
 });
 await new Promise(r=>modelServer.listen(0,'127.0.0.1',r));
 const options={directory:join(directory,'plans'),url:'http://127.0.0.1:'+modelServer.address().port,model:'test-model'};
 let runtime=await createLayoutAssistant(options);
 const makeStore=owner=>Object.assign(new CloudStore(storage.DB,storage.BUCKET,owner),{layoutAssistant:runtime});
 const alice=makeStore('alice'),bob=makeStore('bob'),doc=makeTemplate('academic','保留原稿与公式');await alice.create('paper',doc);
 const wait=async(start)=>{for(let i=0;i<150;i++){const p=await callTool(alice,'get_layout_plan',{projectId:'paper',planId:start.planId});if(p.status!=='running')return p;await new Promise(r=>setTimeout(r,10));}throw Error('timeout');};
 const start=()=>callTool(alice,'start_layout_plan',{projectId:'paper',expectedRevision:1,instruction:'内外边距设为25毫米'});
 t.after(async()=>{await runtime.close();modelServer.closeAllConnections();await new Promise(r=>modelServer.close(r));storage.close();await rm(directory,{recursive:true,force:true});});
 return {alice,bob,seen,wait,start,async restart(){await runtime.close();runtime=await createLayoutAssistant(options);alice.layoutAssistant=runtime;bob.layoutAssistant=runtime;}};
}

test('real HTTP model transport -> persisted review -> guarded apply -> restore preserves all content',async t=>{
 const f=await fixture(t),before=await f.alice.get('paper'),p=await f.wait(await f.start());
 assert.equal(p.status,'review');assert.deepEqual(p.changes.map(c=>c.field),['inner','outer']);assert.equal((await f.alice.get('paper')).revision,1);
 const input=JSON.parse(f.seen[0].messages[1].content);assert.equal('blocks' in input,false);assert.equal('title' in input,false);assert.equal('header' in input.layout,false);assert.equal('footer' in input.layout,false);assert.equal(f.seen[0].stream,false);
 await f.restart();assert.equal((await callTool(f.alice,'get_layout_plan',{projectId:'paper',planId:p.planId})).status,'review');
 const args={projectId:'paper',planId:p.planId,expectedRevision:1};
 await assert.rejects(()=>callTool(f.bob,'apply_layout_plan',args),/NOT_FOUND/);
 await assert.rejects(()=>callTool(f.alice,'apply_layout_plan',{...args,operations:[{op:'set_title',title:'injected'}]}));
 const applied=await callTool(f.alice,'apply_layout_plan',args);assert.equal(applied.appliedRevision,2);
 const after=await f.alice.get('paper');assert.equal(after.document.layout.inner,25);assert.deepEqual(after.document.blocks,before.document.blocks);
 await assert.rejects(()=>callTool(f.alice,'apply_layout_plan',args),/NOT_REVIEWABLE/);
 const undone=await callTool(f.alice,'undo_layout_plan',{...args,expectedRevision:2});assert.equal(undone.undoneRevision,3);
 assert.equal(documentFingerprint((await f.alice.get('paper')).document),documentFingerprint(before.document));
});
test('stale plans and undo never overwrite intervening edits',async t=>{
 const f=await fixture(t),p=await f.wait(await f.start());await f.alice.edit('paper',1,[{op:'set_title',title:'人工新标题'}]);
 assert.equal((await callTool(f.alice,'get_layout_plan',{projectId:'paper',planId:p.planId})).stale,true);
 await assert.rejects(()=>callTool(f.alice,'apply_layout_plan',{projectId:'paper',planId:p.planId,expectedRevision:1}),/CONFLICT/);
 const second=await f.wait(await callTool(f.alice,'start_layout_plan',{projectId:'paper',expectedRevision:2,instruction:'调整边距'}));
 await callTool(f.alice,'apply_layout_plan',{projectId:'paper',planId:second.planId,expectedRevision:2});
 await f.alice.edit('paper',3,[{op:'set_title',title:'后续人工编辑'}]);
 await assert.rejects(()=>callTool(f.alice,'undo_layout_plan',{projectId:'paper',planId:second.planId,expectedRevision:4}),/CONFLICT/);
 assert.equal((await f.alice.get('paper')).document.title,'后续人工编辑');
});
test('model text edits and invalid geometry are rejected before any write',async t=>{
 for(const patch of [{text:'injected'},{inner:999},{inner:70,outer:70,width:100}]){
  await t.test(JSON.stringify(patch),async st=>{const f=await fixture(st,()=>JSON.stringify({kind:'proposal',summary:'bad',patch}));const p=await f.wait(await f.start());assert.equal(p.status,'failed');assert.equal((await f.alice.get('paper')).revision,1);});
 }
});
test('bounded job concurrency and cancellation keep the source unchanged',async t=>{
 const f=await fixture(t,async()=>{await new Promise(r=>setTimeout(r,300));return JSON.stringify({kind:'proposal',summary:'delayed',patch:{inner:25}});});
 const starts=await Promise.allSettled([f.start(),f.start()]);assert.equal(starts.filter(x=>x.status==='fulfilled').length,1);
 const p=starts.find(x=>x.status==='fulfilled').value;
 const cancelled=await callTool(f.alice,'cancel_layout_plan',{projectId:'paper',planId:p.planId});assert.equal(cancelled.status,'cancelled');
 assert.equal((await f.alice.get('paper')).revision,1);
});
test('source edit during inference makes the dry run fail',async t=>{
 let release;const gate=new Promise(r=>release=r);const f=await fixture(t,async()=>{await gate;return JSON.stringify({kind:'proposal',summary:'late',patch:{inner:25}});});
 const p=await f.start();await f.alice.edit('paper',1,[{op:'set_title',title:'new'}]);release();const done=await f.wait(p);assert.equal(done.status,'failed');assert.match(done.error,/CONFLICT/);
});
test('shutdown cancels active inference and rejects new work',async t=>{
 const f=await fixture(t,async()=>{await new Promise(r=>setTimeout(r,150));return JSON.stringify({kind:'proposal',summary:'late',patch:{inner:25}});});
 const p=await f.start();await f.alice.layoutAssistant.close();
 assert.equal((await callTool(f.alice,'get_layout_plan',{projectId:'paper',planId:p.planId})).status,'cancelled');
 await assert.rejects(()=>f.start(),/CLOSING/);assert.equal((await f.alice.get('paper')).revision,1);
});
test('unsupported model intent remains an explanation without a mutation',async t=>{
 const f=await fixture(t,()=>JSON.stringify({kind:'unsupported',summary:'请明确想调整的版式目标。',patch:{}}));
 assert.equal((await f.wait(await f.start())).status,'unsupported');assert.equal((await f.alice.get('paper')).revision,1);
});
test('oversized output and a provider timeout fail closed',async()=>{
 const config=modelConfiguration({model:'x',timeoutMs:100});
 await assert.rejects(()=>inferLayout(config,{},new AbortController().signal,async()=>new Response('x'.repeat(131073))),/TOO_LARGE/);
 const pending=inferLayout(config,{},new AbortController().signal,async(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
 // Keep the test alive: AbortSignal.timeout uses an unref'ed timer in Node.
 const timer=setTimeout(()=>{},200);try{await assert.rejects(()=>pending,/timeout|timed out/i);}finally{clearTimeout(timer);}
});
test('provider rejects remote endpoints, redirects, partial results and changed model identity',async()=>{
 for(const url of ['https://example.com','http://localhost:11434','http://127.0.0.1:11434/other','http://user@127.0.0.1:11434'])assert.throws(()=>modelConfiguration({url,model:'x'}));
 const config=modelConfiguration({model:'x'});let n=0;
 const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
 const tags=d=>({models:[{name:'x',digest:d.repeat(64)}]});
 await assert.rejects(()=>inferLayout(config,{},new AbortController().signal,async()=>response({},302)),/MODEL_SERVICE_ERROR/);
 await assert.rejects(()=>inferLayout(config,{},new AbortController().signal,async url=>url.endsWith('tags')?response(tags('a')):response({model:'x',done:false,message:{content:'{}'}})),/INCOMPLETE/);
 await assert.rejects(()=>inferLayout(config,{},new AbortController().signal,async url=>url.endsWith('tags')?response(tags(++n===1?'a':'b')):response({model:'x',done:true,message:{content:'{}'}})),/IDENTITY_CHANGED/);
});
