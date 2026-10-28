// 整期编排的纯逻辑：校样与当前方案的绑定、未保存编辑判断、修订标签。无 DOM，可在 node:test 中直接验证。

export const articleKey=a=>`${a.projectId}@${a.revision}`;
const sameList=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const isRef=x=>!!x&&typeof x.projectId==='string'&&Number.isInteger(x.revision);

// 从 get_issue_proof 的结果中取出绑定所需的信息，只读取现有字段：
// 顶层 projectId（即 issueId）、revision、sourceArticles、report.articles、stale；API 展开运行时元数据。
export function proofSnapshot(proof){
 const meta=proof||{},reported=Array.isArray(proof?.report?.articles)?proof.report.articles:[];
 const source=Array.isArray(meta.sourceArticles)&&meta.sourceArticles.length&&meta.sourceArticles.every(isRef)?meta.sourceArticles.map(articleKey):null;
 return {
  issueId:typeof meta.projectId==='string'?meta.projectId:null,
  revision:Number.isInteger(meta.revision)?meta.revision:null,
  keys:reported.every(isRef)?reported.map(articleKey):null,
  source,
  folios:reported.filter(isRef).map(a=>[articleKey(a),`${a.firstPage}–${a.lastPage}`]),
  stale:!!proof?.stale,
 };
}

// 校样只有在“同一方案、同一已保存修订、无未保存草稿、源稿与顺序逐篇一致、服务器未判定过期”时才属于当前方案。
export function bindProof(snap,{issueId,revision,articles,dirty}){
 const reasons=[];
 if(!snap||snap.issueId===null||snap.revision===null||snap.keys===null)reasons.push('unknown');
 else{
  if(snap.issueId!==issueId)reasons.push('issue');
  else if(snap.revision!==revision)reasons.push('revision');
  if(snap.source&&!sameList(snap.source,snap.keys))reasons.push('report');
  if(!sameList(snap.keys,articles.map(articleKey)))reasons.push('articles');
 }
 if(snap?.stale)reasons.push('server-stale');
 if(dirty)reasons.push('draft');
 const bound=!reasons.length;
 return {bound,reasons,folios:bound?new Map(snap.folios):null};
}

export function describeBinding({reasons},snap,{revision}){
 const text={
  unknown:'校样缺少方案信息，无法确认它对应哪一版',
  issue:'这份校样属于另一个方案',
  revision:`这份校样基于方案 r${snap?.revision}，当前为 r${revision}`,
  report:'校样报告与来源记录不一致',
  articles:'文章、源修订或顺序与校样不同',
  'server-stale':'来源或方案已有新修订',
  draft:'当前有未保存的修改',
 };
 return reasons.map(r=>text[r]).filter(Boolean).join('；')+(reasons.length?'。请重新生成。':'');
}

// 一次“启动 + 轮询”共用的取消标识。stop() 之后，until() 包裹的任何等待（包括已经发出的启动请求）立即得到 STOP；
// 被放弃的请求稍后成功或失败都不再影响调用方，也不会成为未处理的 rejection。
export const STOP=Symbol('stop');
export function createRun(){
 let resolve;const halt=new Promise(ok=>{resolve=ok;});
 const run={stopped:false,
  stop(){if(!run.stopped){run.stopped=true;resolve(STOP);}},
  until(p){const work=Promise.resolve(p);work.catch(()=>{});return run.stopped?Promise.resolve(STOP):Promise.race([work,halt]);}};
 return run;
}

// 有没有会被丢掉的编辑：纯预览历史修订不算（历史仍在服务器上），预览之后再改才算。
export function hasUnsavedEdits({key,savedKey,previewKey=null}){return key!==(previewKey??savedKey);}

export function revisionLabel({revision,previewing=null,dirty,edited}){
 if(!revision)return '尚未保存';
 if(previewing!==null)return `r${revision} · 预览 r${previewing}`+(edited?' · 有修改':'');
 return `r${revision}`+(dirty?' · 有修改':' · 已保存');
}
