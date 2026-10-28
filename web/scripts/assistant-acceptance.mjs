// Opt-in acceptance against a local standalone server with a real installed model.
// Uses synthetic content only. TEST_PASSWORD is never written to the evidence.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {documentFingerprint} from '../public/editor/src/project-sync.mjs';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8789';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Local standalone server required');
if(!process.env.TEST_PASSWORD)throw Error('TEST_PASSWORD required');
const prefix=process.env.TEST_PROJECT_PREFIX||'assistant-'+Date.now();
const out=resolve(process.env.TEST_OUTPUT||'assistant-acceptance-'+Date.now());
await mkdir(out,{recursive:false});
const record=(name,value)=>writeFile(resolve(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
const sign=await fetch(origin+'/shuye/login',{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:process.env.TEST_PASSWORD})});
assert.equal(sign.status,303);
const cookie=sign.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');assert.ok(cookie);
const call=async(name,args={})=>{
 const r=await fetch(origin+'/shuye/mcp',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
 const j=await r.json();if(j.error||j.result?.isError)throw Error(j.error?.message||j.result.content[0].text);assert.ok(j.result?.structuredContent,name);return j.result.structuredContent;
};
const paragraph=(id,text,role)=>({id,type:'paragraph',text,...(role?{role}:{})});
const document={format:'open-typesetter',version:4,title:'留白与秩序 · 合成校样',
 layout:{width:170,height:240,top:24,bottom:22,inner:22,outer:20,fontSize:10.5,lineHeight:1.5,columns:1,gap:8,fontSet:'fandol',header:'书页 · 合成验证',headerEven:'书页 · 合成验证',footer:'{page}',footerEven:'{page}'},
 journal:{template:'cn-academic',name:'书页测试期刊',nameEn:'Shuye Design Notes',year:'2026',volume:'1',issue:'1',shortTitle:'留白与秩序',latinFont:'tex-default',mathFont:'tex-default'},
 blocks:[
  paragraph('title-zh','留白与秩序：让编辑回到内容','title-zh'),paragraph('authors-zh','合成作者','authors-zh'),paragraph('affiliation-zh','书页产品验证实验室','affiliation-zh'),
  paragraph('abstract-zh','本文用合成材料验证自然语言排版工作流。模型提出参数建议，编辑确认差异后才改变文稿。校样与修改前后的修订号绑定，撤销恢复原始版式。','abstract-zh'),paragraph('keywords-zh','排版；人工智能；版式审查','keywords-zh'),paragraph('classification','中图分类号：TP391　文献标志码：A','classification'),
  paragraph('title-en','Space and Order: Editing with Clear Intent','title-en'),paragraph('authors-en','Synthetic Author','authors-en'),paragraph('affiliation-en','Shuye Product Validation Lab','affiliation-en'),paragraph('abstract-en','This synthetic manuscript tests a complete layout workflow. A local model proposes changes. The editor reviews the differences, applies them, checks a bound PDF proof, and restores the previous layout.','abstract-en'),paragraph('keywords-en','typesetting; artificial intelligence; layout review','keywords-en'),
  {id:'heading',type:'heading',level:1,text:'1　从意图到校样'},
  paragraph('body-1','编辑提出要求时，不必先理解每一个技术参数。工作台先解释即将改变什么，让编辑核对后再应用。页面边距、栏数与正文行距可以改变，但正文、公式、数据和语义关系保持原样。'),
  paragraph('body-2','视觉层级应该帮助判断。大面积纸面用于阅读，相关工具随任务出现。每次修改都留下源版本与结果版本，生成的校样用于核查实际分页。随后输入的新内容不会被旧建议覆盖。'),
  {id:'formula',type:'equation',text:'E = mc^2',equationNumber:'1'},
  {id:'data',type:'table',text:'表 1　合成验证数据',rows:[['项目','数值'],['样本数','120'],['通过率','96%']],headerRows:1,borderStyle:'three-line'},
  paragraph('closing','本稿完全为测试编写，不代表真实研究。通过参数差异、文稿内容摘要与实际页面对照，检查修改是否符合明确要求。')
 ]};
await record('fixture',document);
const projectId=prefix+'-loop';await call('create_project',{projectId,document});
await call('create_project',{projectId:prefix+'-ui',document});
const before=await call('get_project',{projectId});await record('before',before);
const capability=await call('get_layout_assistant');assert.equal(capability.enabled,true);await record('capability',capability);
const proof=async(label,revision)=>{
 let p=await call('start_journal_proof',{projectId,expectedRevision:revision});
 const deadline=Date.now()+120000;
 while(p.status==='running'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,1000));p=await call('get_journal_proof',{proofId:p.proofId});}
 await record(label+'-proof',p);assert.equal(p.status,'complete',JSON.stringify(p));assert.equal(p.stale,false);assert.equal(p.revision,revision);
 const download=await call('download_journal_pdf',{proofId:p.proofId});await writeFile(resolve(out,label+'.pdf'),Buffer.from(download.base64,'base64'));
 return p;
};
const beforeProof=await proof('before',before.revision);
let plan=await call('start_layout_plan',{projectId,expectedRevision:before.revision,instruction:'内侧边距设为30毫米，外侧边距设为26毫米，正文行距设为1.65倍。其他保持不变。'});
await record('started',plan);console.log('Real model inference started:',plan.planId);
const deadline=Date.now()+100000;
while(plan.status==='running'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,1000));plan=await call('get_layout_plan',{projectId,planId:plan.planId});}
await record('review',plan);assert.equal(plan.status,'review',JSON.stringify(plan));
assert.deepEqual(Object.fromEntries(plan.changes.map(c=>[c.field,c.after])),{inner:30,outer:26,lineHeight:1.65});
assert.match(plan.model.sha256,/^[a-f0-9]{64}$/);assert.equal((await call('get_project',{projectId})).revision,before.revision);
const identity={projectId,planId:plan.planId};
const applied=await call('apply_layout_plan',{...identity,expectedRevision:before.revision});await record('applied',applied);
await assert.rejects(()=>call('apply_layout_plan',{...identity,expectedRevision:before.revision}),/NOT_REVIEWABLE/);
const after=await call('get_project',{projectId});await record('after',after);assert.deepEqual(after.document.blocks,before.document.blocks);
const afterProof=await proof('after',after.revision);
const undone=await call('undo_layout_plan',{...identity,expectedRevision:after.revision});await record('undone',undone);
const restored=await call('get_project',{projectId});await record('restored',restored);assert.equal(documentFingerprint(restored.document),documentFingerprint(before.document));
const restoredProof=await proof('restored',restored.revision);
const result={passed:true,projectId,uiProjectId:prefix+'-ui',model:plan.model,revisions:[before.revision,after.revision,restored.revision],pages:[beforeProof.pages,afterProof.pages,restoredProof.pages],quality:[beforeProof.report?.quality,afterProof.report?.quality,restoredProof.report?.quality],changes:plan.changes,contentPreserved:true,restoredExact:true};
await record('result',result);console.log(JSON.stringify(result));
