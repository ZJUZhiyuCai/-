import test from 'node:test';
import assert from 'node:assert/strict';
import {ProofSession,proofDisposition} from '../public/editor/src/proof-session.mjs';
import {setupJournalCloud} from '../public/editor/src/journal-cloud-ui.mjs';
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
const proof={proofId:'proof-1',projectId:'paper',revision:7,status:'complete',stale:false,pages:1,report:{quality:{diagnostics:[]},formulaCoverage:{total:1}}};
test('a completed proof is available only for its clean, matching source revision',()=>{
 const c={projectId:'paper',revision:7,dirty:false};
 assert.equal(proofDisposition(proof,c),'ready');
 for(const patch of [{dirty:true},{revision:8}])assert.equal(proofDisposition(proof,{...c,...patch}),'stale');
 assert.equal(proofDisposition({...proof,stale:true},c),'stale');
 assert.equal(proofDisposition(proof,{...c,projectId:'other'}),'missing');
 assert.equal(proofDisposition({...proof,status:'running'},c),'running');
 assert.equal(proofDisposition({...proof,status:'failed'},c),'failed');
});
test('late proof lookup cannot replace a newer job or cross project boundaries',async()=>{
 const pending=deferred(),connection={projectId:'paper',revision:7};
 const s=new ProofSession({connection,api:()=>pending.promise,readId:()=>proof.proofId,writeId:()=>{}});
 const read=s.refresh();s.remember({...proof,proofId:'proof-new'});pending.resolve(proof);await read;
 assert.equal(s.proof.proofId,'proof-new');
 const later=deferred();s.api=()=>later.promise;const reading=s.refresh();connection.projectId='other';later.resolve(proof);await reading;
 assert.equal(s.state,'missing');
});
test('missing artifacts may be regenerated, but network failure is not mistaken for a missing proof',async()=>{
 const s=new ProofSession({connection:{projectId:'paper',revision:7},readId:()=>proof.proofId,writeId:()=>{},api:async()=>{throw Error('PROOF_NOT_FOUND');}});
 await s.refresh();assert.equal(s.state,'missing');
 s.api=async()=>{throw Error('NETWORK_OFFLINE');};await assert.rejects(s.refresh(),/NETWORK_OFFLINE/);
});
function environment(t){
 const original=['document','localStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]),nodes=[];
 t.after(()=>{for(const [k,v] of original)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});
 const element=tag=>{const node={tag,style:{},children:[],append(...v){this.children.push(...v);},setAttribute(){},addEventListener(){},showModal(){},close(){},remove(){}};nodes.push(node);return node;};
 globalThis.document={createElement:element,body:element('body'),addEventListener(){},dispatchEvent(){}};
 const entries=new Map([['shuye-proof-paper','proof-1']]);globalThis.localStorage={getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v)};
 return nodes;
}
test('repeated proof actions reuse the current PDF, and an edited revision starts one new job',async t=>{
 environment(t);const calls=[],connection={projectId:'paper',revision:7,dirty:false,async save(){this.dirty=false;this.revision++;}};
 const ui=setupJournalCloud({connection,getDoc:()=>({title:'Synthetic'}),button(){},status(){},api:async(name,args)=>{
  calls.push(name);const revision=args.proofId==='proof-new'?8:7;
  if(name==='start_journal_proof')return {...proof,proofId:'proof-new',revision:8,status:'running'};
  if(name==='get_journal_proof')return {...proof,proofId:args.proofId,revision,stale:revision!==connection.revision};
  if(name==='download_journal_pdf')return {...proof,revision,base64:'AA=='};
  throw Error(name);
 }});
 await Promise.resolve();
 const first=ui.generateProof(),second=ui.generateProof();assert.equal(first,second);await first;
 assert.equal(calls.filter(n=>n==='start_journal_proof').length,0);assert.equal(calls.filter(n=>n==='download_journal_pdf').length,1);
 connection.dirty=true;assert.equal(ui.proofState(),'stale');await ui.generateProof();
 assert.equal(calls.filter(n=>n==='start_journal_proof').length,1);assert.equal(ui.proofState(),'ready');
});
test('typing during PDF retrieval prevents delivery of the old revision',async t=>{
 const nodes=environment(t),connection={projectId:'paper',revision:7,dirty:false};
 const ui=setupJournalCloud({connection,getDoc:()=>({title:'Synthetic'}),button(){},status(){},api:async name=>{
  if(name==='get_journal_proof')return proof;
  if(name==='download_journal_pdf'){connection.dirty=true;return {...proof,base64:'AA=='};}
  throw Error('Should not compile');
 }});
 await assert.rejects(ui.generateProof(),/下载期间文稿/);assert.equal(nodes.filter(n=>n.tag==='dialog').length,0);assert.equal(ui.proofState(),'stale');
});

test('an already open report rejects cached downloads after a remote save or local edit',async t=>{
 const nodes=environment(t),connection={projectId:'paper',revision:7,dirty:false};let stale=false;
 const ui=setupJournalCloud({connection,getDoc:()=>({title:'Synthetic'}),button(){},status(){},api:async name=>{
  if(name==='get_journal_proof')return {...proof,stale};
  if(name==='download_journal_pdf')return {...proof,base64:'AA=='};
  throw Error('Should not compile');
 }});
 await ui.generateProof();stale=true;
 await nodes.find(n=>n.tag==='button'&&n.textContent==='下载 PDF').onclick();
 assert.ok(nodes.some(n=>n.textContent?.includes('校样已过期')));
 stale=false;connection.dirty=true;
 await nodes.find(n=>n.tag==='button'&&n.textContent==='检查报告').onclick();
 assert.ok(nodes.some(n=>n.textContent?.includes('文稿已变化')));
 assert.equal(nodes.filter(n=>n.tag==='a').length,0);
});
