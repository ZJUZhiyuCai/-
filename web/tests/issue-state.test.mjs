import test from 'node:test';
import assert from 'node:assert/strict';
import {articleKey,proofSnapshot,bindProof,describeBinding,hasUnsavedEdits,revisionLabel,createRun,STOP} from '../public/issue-state.mjs';

const A={projectId:'book-a',revision:2,title:'公式与图文锚定样稿'},B={projectId:'book-b',revision:2,title:'版心与栏式样稿'};
const proof=(over={})=>({
 status:'complete',stale:false,pages:24,
 projectId:'issue-1',revision:10,sourceArticles:[{projectId:'book-a',revision:2},{projectId:'book-b',revision:2}],
 report:{quality:{status:'PASS'},articles:[{...A,firstPage:1,lastPage:12},{...B,firstPage:13,lastPage:24}]},
 ...over,
});
const current=(over={})=>({issueId:'issue-1',revision:10,articles:[A,B],dirty:false,...over});

test('一致的校样按“源稿@修订”绑定页码',()=>{
 const b=bindProof(proofSnapshot(proof()),current());
 assert.equal(b.bound,true);assert.deepEqual(b.reasons,[]);
 assert.equal(b.folios.get(articleKey(A)),'1–12');assert.equal(b.folios.get(articleKey(B)),'13–24');
});

test('浏览器仍停在旧修订：后端 stale 为 false 也不能当作当前方案',()=>{
 const b=bindProof(proofSnapshot(proof({projectId:'issue-1',revision:11})),current());
 assert.equal(b.bound,false);assert.deepEqual(b.reasons,['revision']);assert.equal(b.folios,null);
 assert.match(describeBinding(b,proofSnapshot(proof({projectId:'issue-1',revision:11})),{revision:10}),/r11，当前为 r10/);
});

test('另一个方案的校样不绑定',()=>{
 assert.deepEqual(bindProof(proofSnapshot(proof()),current({issueId:'issue-2'})).reasons,['issue']);
});

test('未保存草稿使校样失效，撤回修改后恢复',()=>{
 const snap=proofSnapshot(proof());
 assert.deepEqual(bindProof(snap,current({dirty:true})).reasons,['draft']);
 assert.equal(bindProof(snap,current({dirty:false})).bound,true);
});

test('顺序、源修订或篇目不同都不绑定',()=>{
 const snap=proofSnapshot(proof());
 assert.deepEqual(bindProof(snap,current({articles:[B,A]})).reasons,['articles']);
 assert.deepEqual(bindProof(snap,current({articles:[A,{...B,revision:3}]})).reasons,['articles']);
 assert.deepEqual(bindProof(snap,current({articles:[A]})).reasons,['articles']);
});

test('题名修改不影响源稿绑定，但会经由未保存草稿使其失效',()=>{
 const snap=proofSnapshot(proof());
 assert.equal(bindProof(snap,current({articles:[{...A,title:'新题名'},B]})).bound,true);
 assert.equal(bindProof(snap,current({articles:[{...A,title:'新题名'},B],dirty:true})).bound,false);
});

test('服务器判定过期时不绑定',()=>{
 assert.deepEqual(bindProof(proofSnapshot(proof({stale:true})),current()).reasons,['server-stale']);
});

test('缺少顶层方案身份或报告条目缺字段时无法确认，不绑定',()=>{
 assert.deepEqual(bindProof(proofSnapshot(proof({projectId:undefined,revision:undefined})),current()).reasons,['unknown']);
 assert.deepEqual(bindProof(proofSnapshot(proof({report:{articles:[{title:'x',firstPage:1,lastPage:2}]}})),current()).reasons,['unknown']);
 assert.equal(bindProof(null,current()).bound,false);
});

test('sourceArticles 与报告不一致时不绑定；结构无法识别时只依据报告',()=>{
 const conflicting=proof({projectId:'issue-1',revision:10,sourceArticles:[{projectId:'book-b',revision:2},{projectId:'book-a',revision:2}]});
 assert.ok(bindProof(proofSnapshot(conflicting),current()).reasons.includes('report'));
 const opaque=proof({projectId:'issue-1',revision:10,sourceArticles:['book-a','book-b']});
 assert.equal(bindProof(proofSnapshot(opaque),current()).bound,true);
});

test('纯预览历史不算编辑；预览之后手工修改需要保护',()=>{
 assert.equal(hasUnsavedEdits({key:'r9',savedKey:'r10',previewKey:'r9'}),false);
 assert.equal(hasUnsavedEdits({key:'r9+edit',savedKey:'r10',previewKey:'r9'}),true);
 assert.equal(hasUnsavedEdits({key:'r10',savedKey:'r10'}),false);
 assert.equal(hasUnsavedEdits({key:'r10+edit',savedKey:'r10',previewKey:null}),true);
});

test('启动请求尚未返回时停止：立即得到 STOP，迟到的 proofId 不再激活轮询',async()=>{
 const run=createRun();let release;const start=new Promise(ok=>{release=ok;});
 const waiting=run.until(start);
 run.stop();
 assert.equal(await waiting,STOP);
 release('proof-1');
 assert.equal(await run.until(Promise.resolve({status:'complete'})),STOP,'同一次运行中后续的轮询也必须被拦下');
 assert.equal(run.stopped,true);
});

test('未停止时照常返回结果与错误；被放弃的请求稍后失败不会产生未处理的 rejection',async()=>{
 const run=createRun();
 assert.equal(await run.until(Promise.resolve('proof-2')),'proof-2');
 await assert.rejects(run.until(Promise.reject(Error('WORD_RUNTIME_UNAVAILABLE'))),/WORD_RUNTIME_UNAVAILABLE/);
 let fail;const late=new Promise((_,no)=>{fail=no;});
 const waiting=run.until(late);run.stop();
 assert.equal(await waiting,STOP);
 let unhandled=false;const onUnhandled=()=>{unhandled=true;};process.on('unhandledRejection',onUnhandled);
 fail(Error('late'));await new Promise(ok=>setTimeout(ok,10));
 process.off('unhandledRejection',onUnhandled);
 assert.equal(unhandled,false);
});

test('每次运行各自独立：停止旧运行不影响新运行',async()=>{
 const first=createRun(),second=createRun();
 first.stop();
 assert.equal(await second.until(Promise.resolve('ok')),'ok');
});

test('修订标签区分已保存、有修改与预览',()=>{
 assert.equal(revisionLabel({revision:0,dirty:true,edited:true}),'尚未保存');
 assert.equal(revisionLabel({revision:10,dirty:false,edited:false}),'r10 · 已保存');
 assert.equal(revisionLabel({revision:10,dirty:true,edited:true}),'r10 · 有修改');
 assert.equal(revisionLabel({revision:10,previewing:9,dirty:true,edited:false}),'r10 · 预览 r9');
 assert.equal(revisionLabel({revision:10,previewing:9,dirty:true,edited:true}),'r10 · 预览 r9 · 有修改');
});

// Codex 接入验证：走真实 MCP 工具函数的响应封装，避免仅用假定的数据形状测试自己。
test('get_issue_proof 的真实响应封装可绑定；服务器新修订不能套用到旧浏览器方案',async()=>{
 const {callTool}=await import('../lib/cloud-tools.mjs');
 const sample=proof(),meta={...sample,kind:'issue'};delete meta.report;
 const store={owner:'ui-test',get:async id=>id===A.projectId?A:B,journalRuntime:{
  issues:{get:async()=>({revision:10})},status:async()=>meta,report:async()=>sample.report,
 }};
 const result=await callTool(store,'get_issue_proof',{proofId:'proof-ui-1'});
 assert.equal(result.metadata,undefined);assert.equal(result.projectId,'issue-1');
 assert.equal(bindProof(proofSnapshot(result),current()).bound,true);
 meta.revision=11;store.journalRuntime.issues.get=async()=>({revision:11});
 const newer=await callTool(store,'get_issue_proof',{proofId:'proof-ui-1'});
 assert.equal(newer.stale,false);assert.equal(bindProof(proofSnapshot(newer),current()).bound,false);
});
