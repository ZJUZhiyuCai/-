import {articleKey,proofSnapshot,bindProof,describeBinding,hasUnsavedEdits,revisionLabel,createRun,STOP} from './issue-state.mjs';
const base=new URL('./',location.href),el=id=>document.getElementById(id);
async function api(tool,args={}){const r=await fetch(new URL('api/mcp-projects',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool,arguments:args})});if(r.status===401){location.assign(new URL('login',base));throw Error('请先登录');}const v=await r.json();if(!r.ok)throw Error(v.error||'请求失败');return v;}
const projectNames=new Map(),projectRevisions=new Map(),ineligible=new Set();
// previewKey：正在预览的历史修订载入时的方案快照；lastProof：最近一次取回的校样及其绑定信息；run：当前这一次“启动 + 轮询”的取消标识。
let issueId='issue-'+crypto.randomUUID(),revision=0,articles=[],history=[],busy=false,savedKey='',previewing=null,previewKey=null,lastProof=null,run=null,drag=null,clock=0,issueReady=false;

// —— 状态与提示
const friendly=text=>String(text).startsWith('WORD_RUNTIME_UNAVAILABLE')?'整期校样服务暂不可用，请检查 LibreOffice 与 UNO 配置。':String(text);
function status(text,error=false){
 const message=error?friendly(text):text;
 el('status').textContent=message;el('status').className=error?'error':'';
 el('error-text').textContent=error?message:'';el('error-notice').hidden=!error;
}
el('error-close').onclick=()=>{el('error-notice').hidden=true;};

// —— 方案
function plan(){return {title:el('title').value,firstPage:Number(el('firstPage').value),width:Number(el('width').value),height:Number(el('height').value),articles};}
const planKey=()=>JSON.stringify(plan());
// dirty：与服务器上的当前修订不同（保存会产生新修订）；edited：有会丢失的手工编辑（纯预览历史不算）。
const dirty=()=>planKey()!==savedKey;
const edited=()=>hasUnsavedEdits({key:planKey(),savedKey,previewKey});
const binding=()=>bindProof(lastProof?.snap,{issueId,revision,articles,dirty:dirty()});
function apply(p){for(const k of ['title','firstPage','width','height'])el(k).value=p[k];articles=structuredClone(p.articles);draw();}
function settle(){previewing=null;previewKey=null;}

// —— 小部件
const SVG='http://www.w3.org/2000/svg',paths={up:'M5.5 12.5 10 8l4.5 4.5',down:'M5.5 7.5 10 12l4.5-4.5',close:'M6 6l8 8M14 6l-8 8',plus:'M10 5v10M5 10h10',check:'M5 10.5l3.2 3L15 7'};
function icon(name){const s=document.createElementNS(SVG,'svg');s.setAttribute('viewBox','0 0 20 20');s.setAttribute('aria-hidden','true');s.setAttribute('class','icon');const p=document.createElementNS(SVG,'path');p.setAttribute('d',paths[name]);s.append(p);return s;}
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function button(text,fn,{cls='',label='',glyph='',off=false}={}){const b=node('button',cls);b.type='button';if(glyph)b.append(icon(glyph));if(text)b.append(text);if(label){b.setAttribute('aria-label',label);b.title=label;}setOff(b,off);b.onclick=()=>guard(fn);return b;}
// guard 会禁用全部控件；dataset.off 记录控件本来的禁用状态，结束后据此恢复。
function setOff(n,off){n.disabled=off;if(off)n.dataset.off='1';else delete n.dataset.off;}
async function guard(fn){
 if(busy)return;busy=true;document.body.classList.add('is-busy');
 for(const n of document.querySelectorAll('button,input,select'))if(!n.dataset.keep)n.disabled=true;
 try{await fn();}catch(e){status(e.message,true);}
 finally{busy=false;document.body.classList.remove('is-busy');for(const n of document.querySelectorAll('button,input,select'))if(!n.dataset.keep)n.disabled=n.dataset.off==='1';paintChrome();}
}

// —— 目录页（刊载顺序）
function move(from,to){if(to<0||to>=articles.length||from===to)return false;const [a]=articles.splice(from,1);articles.splice(to,0,a);draw();return true;}
const rowAt=i=>el('articles').children[i];
function focusIn(i,selector){const row=rowAt(Math.min(i,articles.length-1)),target=row?.querySelector(selector);(target&&!target.disabled?target:row?.querySelector('.entry-title'))?.focus();}
function draw(){
 const list=el('articles');list.replaceChildren();
 el('sequence-empty').hidden=articles.length>0;
 articles.forEach((a,i)=>{
  const li=node('li','entry'),handle=node('span','entry-handle'),number=node('span','entry-number',String(i+1).padStart(2,'0')),body=node('div','entry-body'),title=node('input','entry-title'),source=node('div','entry-source'),folio=node('span','entry-folio'),actions=node('div','entry-actions');
  li.dataset.index=String(i);handle.draggable=true;handle.title='拖动排序';handle.setAttribute('aria-hidden','true');
  title.value=a.title||'';title.placeholder='自动使用文章题名';title.ariaLabel='目录题名 '+(i+1);title.maxLength=300;
  title.oninput=()=>{if(title.value.trim())a.title=title.value;else delete a.title;paintChrome();};
  title.onkeydown=e=>{if(!e.altKey||busy||(e.key!=='ArrowUp'&&e.key!=='ArrowDown'))return;e.preventDefault();const to=i+(e.key==='ArrowUp'?-1:1);if(move(i,to)){focusIn(to,'.entry-title');status('第 '+(i+1)+' 篇已移到第 '+(to+1)+' 位');}};
  const known=projectNames.has(a.projectId),latest=projectRevisions.get(a.projectId);
  source.append(node('span','',(projectNames.get(a.projectId)||a.projectId)+' · 源修订 r'+a.revision));
  if(!known){li.classList.add('is-stale');source.append(node('span','entry-flag','源稿不在项目库中'));}
  else if(latest>a.revision){li.classList.add('is-stale');source.append(node('span','entry-flag','源稿已更新至 r'+latest),button('更新',()=>refreshArticle(i),{cls:'entry-update',label:'将第 '+(i+1)+' 篇更新到源修订 r'+latest}));}
  body.append(title,source);
  const up=button('',()=>{if(move(i,i-1))focusIn(i-1,'.entry-up');},{glyph:'up',label:'上移第 '+(i+1)+' 篇',off:i===0}),
   down=button('',()=>{if(move(i,i+1))focusIn(i+1,'.entry-down');},{glyph:'down',label:'下移第 '+(i+1)+' 篇',off:i===articles.length-1}),
   remove=button('',()=>{articles.splice(i,1);draw();if(articles.length)focusIn(i,'.entry-title');status('已移除第 '+(i+1)+' 篇');},{glyph:'close',label:'移除第 '+(i+1)+' 篇'});
  up.classList.add('entry-up');down.classList.add('entry-down');remove.classList.add('entry-remove');
  actions.append(up,down,remove);
  // 题名被清空时不传空串：部分浏览器对空数据项能否起拖不一致。
  handle.addEventListener('dragstart',e=>{if(busy){e.preventDefault();return;}drag={kind:'entry',from:i};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',a.title||projectNames.get(a.projectId)||a.projectId);e.dataTransfer.setDragImage(li,24,22);requestAnimationFrame(()=>li.classList.add('is-dragging'));});
  handle.addEventListener('dragend',()=>{drag=null;li.classList.remove('is-dragging');clearDrop();});
  li.append(handle,number,body,folio,actions);list.append(li);
 });
 el('article-count').textContent=articles.length+' 篇';
 paintSources();paintChrome();
}
async function addArticle(projectId,at=articles.length){
 if(articles.some(a=>a.projectId===projectId))throw Error('已加入此文章');
 const r=await api('get_project',{projectId});
 if(!r.document.journal||r.document.composition){ineligible.add(projectId);paintSources();throw Error('请先打开该工程并应用期刊排版');}
 ineligible.delete(projectId);projectRevisions.set(projectId,Math.max(r.revision,projectRevisions.get(projectId)||0));
 articles.splice(at,0,{projectId,revision:r.revision,title:r.document.blocks.find(b=>b.role==='title-zh')?.text||projectNames.get(projectId)||projectId});
 draw();status('已加入第 '+(at+1)+' 篇：'+(projectNames.get(projectId)||projectId));
}
// 原位重新绑定最新源修订；目录题名保留用户已有的写法。
async function refreshArticle(i){
 const a=articles[i],r=await api('get_project',{projectId:a.projectId});
 if(!r.document.journal||r.document.composition){ineligible.add(a.projectId);throw Error('该工程已不是期刊排版，请先打开并应用期刊排版');}
 projectRevisions.set(a.projectId,r.revision);articles[i]={...a,revision:r.revision};draw();focusIn(i,'.entry-title');
 status('第 '+(i+1)+' 篇已绑定源修订 r'+r.revision+'，目录题名保持不变。');
}

// —— 拖放：目录内排序；从左侧拖入到任意位置
const toc=el('toc');
function indexAt(y){const rows=[...el('articles').children];for(let i=0;i<rows.length;i++){const r=rows[i].getBoundingClientRect();if(y<r.top+r.height/2)return i;}return rows.length;}
function clearDrop(){for(const n of toc.querySelectorAll('.drop-before,.drop-after'))n.classList.remove('drop-before','drop-after');el('sequence-empty').classList.remove('is-target');}
function showDrop(i){clearDrop();const rows=el('articles').children;if(!rows.length)el('sequence-empty').classList.add('is-target');else if(i<rows.length)rows[i].classList.add('drop-before');else rows[rows.length-1].classList.add('drop-after');}
toc.addEventListener('dragover',e=>{if(!drag||busy)return;e.preventDefault();e.dataTransfer.dropEffect=drag.kind==='entry'?'move':'copy';showDrop(indexAt(e.clientY));});
toc.addEventListener('dragleave',e=>{if(!toc.contains(e.relatedTarget))clearDrop();});
toc.addEventListener('drop',e=>{
 if(!drag)return;e.preventDefault();const d=drag,at=indexAt(e.clientY);drag=null;clearDrop();
 if(d.kind==='entry'){const to=at>d.from?at-1:at;guard(()=>{if(move(d.from,to))status('第 '+(d.from+1)+' 篇已移到第 '+(to+1)+' 位');});}
 else guard(()=>addArticle(d.projectId,at));
});
// 本页拖起的文章只落在目录页；落在筛选框等其他输入上时不写入题名文本。外部拖入的文本（drag 为 null）不受影响。
document.addEventListener('dragover',e=>{if(drag&&!toc.contains(e.target)){e.preventDefault();e.dataTransfer.dropEffect='none';}});
document.addEventListener('drop',e=>{if(drag&&!toc.contains(e.target))e.preventDefault();});

// —— 左侧文章
function paintSources(){
 const q=el('source-filter').value.trim().toLowerCase();
 for(const row of el('projects').querySelectorAll('.source')){
  const id=row.dataset.projectId,joined=articles.some(a=>a.projectId===id),blocked=!joined&&ineligible.has(id),add=row.querySelector('.source-add');
  row.hidden=!!q&&!row.dataset.title.toLowerCase().includes(q);
  row.classList.toggle('is-joined',joined);row.classList.toggle('is-ineligible',blocked);row.draggable=!joined;
  row.querySelector('.source-note').textContent=blocked?'需期刊排版':'';
  add.replaceChildren(icon(joined?'check':'plus'));setOff(add,joined);if(busy)add.disabled=true;
  add.setAttribute('aria-label',(joined?'已加入 ':'加入 ')+row.dataset.title);add.title=joined?'已在目录中':'加入目录末尾';
 }
}
function drawSources(list){
 el('projects').replaceChildren();
 if(!list.length){el('projects').append(node('p','source-empty','暂无文章工程'));return;}
 for(const p of list){
  const row=node('div','source'),detail=node('div','source-detail'),name=node('span','source-name',p.title),meta=node('span','source-meta');
  row.setAttribute('role','listitem');row.dataset.projectId=p.projectId;row.dataset.title=p.title;name.title=p.title;
  meta.append(node('span','','r'+p.revision),node('em','source-note'));detail.append(name,meta);
  const add=button('',()=>addArticle(p.projectId),{cls:'source-add'});
  row.addEventListener('dragstart',e=>{if(busy||row.classList.contains('is-joined')){e.preventDefault();return;}drag={kind:'source',projectId:p.projectId};e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('text/plain',p.title);row.classList.add('is-dragging');});
  row.addEventListener('dragend',()=>{drag=null;row.classList.remove('is-dragging');clearDrop();});
  row.append(detail,add);el('projects').append(row);
 }
 paintSources();
}
el('source-filter').oninput=paintSources;

// —— 顶栏、纸张比例、页码、修订、校样（全部由当前状态推导，任何编辑后立即重算）
function paintChrome(){
 const d=dirty(),changed=edited();
 el('save').classList.toggle('is-dirty',d);el('save').setAttribute('aria-label',d?'保存方案，有未保存的修改':'保存方案');
 el('revision').textContent=revisionLabel({revision,previewing,dirty:d,edited:changed});el('revision').dataset.tone=changed?'dirty':previewing!==null?'preview':'';
 const n=(k,min,max,fallback)=>{const v=Number(el(k).value);return Number.isFinite(v)&&v>=min&&v<=max?v:fallback;};
 toc.style.aspectRatio=`${n('width',100,320,210)} / ${n('height',140,450,285)}`;
 const b=lastProof&&el('proof').dataset.state==='ready'?binding():null,show=!!b?.bound;
 // 页码按“源稿@修订”逐篇取用；只有整份校样与当前方案一致时才排进目录。
 toc.classList.toggle('has-folios',show);
 [...el('articles').children].forEach((li,i)=>{li.querySelector('.entry-folio').textContent=show?b.folios.get(articleKey(articles[i]))||'':'';});
 paintProof(b);
 for(const btn of el('history').querySelectorAll('button')){const r=Number(btn.dataset.revision);btn.classList.toggle('is-preview',r===previewing);if(r===revision&&previewing===null)btn.setAttribute('aria-current','true');else btn.removeAttribute('aria-current');}
}
for(const id of ['title','firstPage','width','height'])el(id).addEventListener('input',paintChrome);
function drawHistory(){
 const list=el('history');list.replaceChildren();el('history-section').hidden=!history.length;
 for(const h of [...history].sort((a,b)=>b.revision-a.revision)){
  const li=node('li'),b=node('button');b.type='button';b.dataset.revision=String(h.revision);
  b.append(node('span','history-rev','r'+h.revision),node('span','history-title',h.plan?.title||''),node('span','history-count',(h.plan?.articles?.length??0)+' 篇'));
  b.setAttribute('aria-label','预览方案 r'+h.revision);
  b.onclick=()=>{
   if(busy)return;
   // 纯预览之间来回切换不打扰；预览之后有手工编辑，或尚未保存的编辑，才需要确认。
   if(edited()&&!confirm('当前方案有未保存的修改，载入历史修订会替换它们。继续？'))return;
   apply(h.plan);
   if(h.revision===revision&&!dirty()){settle();status('已回到当前方案 r'+revision+'。');}
   else{previewing=h.revision;previewKey=planKey();status('已载入历史方案 r'+h.revision+'；点击保存将创建新修订，不覆盖历史。');}
   paintChrome();
  };
  li.append(b);list.append(li);
 }
 paintChrome();
}

// —— 方案读写
// 与已保存修订完全相同时不再新建修订：否则 Ctrl+S 或“生成”会让刚取回的校样因修订号变化失效（服务端也会判为过期并拒绝下载）。
async function save(){if(revision&&!dirty()){settle();paintChrome();status('方案 r'+revision+' 没有新的修改。');return null;}const sent=plan(),r=await api('save_issue',{issueId,expectedRevision:revision,plan:sent});revision=r.revision;history=r.history;savedKey=JSON.stringify(sent);settle();drawHistory();await loadIssues();status('整期方案 r'+revision+' 已保存；单篇源稿保持原状。');return r;}
async function loadIssues(){const data=await api('list_issues');el('issues').replaceChildren(new Option('新建方案',''));for(const r of data.issues)el('issues').add(new Option(r.title+' · r'+r.revision,r.issueId));el('issues').value=revision?issueId:'';}
async function loadProjects(){
 const data=await api('list_projects');projectNames.clear();projectRevisions.clear();ineligible.clear();
 for(const p of data.projects){projectNames.set(p.projectId,p.title);projectRevisions.set(p.projectId,p.revision);}
 const available=data.projects.filter(p=>!p.archived);el('project-count').textContent=String(available.length);drawSources(available);
}
el('issues').onchange=()=>{
 if(edited()&&!confirm('当前方案有未保存的修改，切换后将丢失。继续？')){el('issues').value=revision?issueId:'';return;}
 guard(async()=>{
  run?.stop();lastProof=null;proofState('idle');
  if(!el('issues').value){issueId='issue-'+crypto.randomUUID();revision=0;history=[];settle();articles=[];draw();drawHistory();savedKey=planKey();paintChrome();status('新方案：从左侧加入文章。');return;}
  const r=await api('get_issue',{issueId:el('issues').value});
  // An agent may have saved a newer issue or source revision since this tab opened.
  await loadProjects();issueId=r.issueId;revision=r.revision;history=r.history;
  const selected=[...el('issues').options].find(option=>option.value===issueId);
  if(selected)selected.textContent=r.plan.title+' · r'+revision;
  settle();apply(r.plan);savedKey=planKey();drawHistory();status('已读取整期方案 r'+revision);
 });
};
el('save').onclick=()=>guard(save);
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='s'){e.preventDefault();guard(save);}});
addEventListener('beforeunload',e=>{if(edited()){e.preventDefault();e.returnValue='';}});

// —— 校样
const elapsed=ms=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
function startClock(){const t0=Date.now();clearInterval(clock);el('proof-clock').textContent='0:00';clock=setInterval(()=>{el('proof-clock').textContent=elapsed(Date.now()-t0);},1000);}
function stopClock(){clearInterval(clock);clock=0;}
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
// idle / running / failed / stopped 是过程状态；ready 表示取回了一份校样，是否属于当前方案由 binding() 实时判定。
function proofState(state,message=''){
 const proof=el('proof');proof.dataset.state=state;proof.dataset.message=message;el('proof-run').hidden=state!=='running';
 if(state!=='ready')lastProof=null;
 paintChrome();
}
function paintProof(b){
 const proof=el('proof'),state=proof.dataset.state,generate=el('generate');
 let label={running:'排版中',failed:'未生成',stopped:'已停止等待'}[state]||'',message=proof.dataset.message||'',tone=state==='failed'?'error':'',outdated=false;
 if(state==='ready'&&lastProof&&b){
  if(b.bound){label=lastProof.blocked?'有阻断':'待审校';tone=lastProof.blocked?'warn':'ok';message=lastProof.pages?'共 '+lastProof.pages+' 页':'';}
  else{outdated=true;label=lastProof.snap.stale?'已过期':'需重新生成';tone='warn';message=describeBinding(b,lastProof.snap,{revision});}
 }
 // 不属于当前方案的校样：收起页码表与下载，只留下原因。
 el('delivery').hidden=!(state==='ready'&&b?.bound);
 el('proof-state').textContent=label;el('proof-message').textContent=message;proof.dataset.tone=tone;
 if(!issueReady&&state==='idle'){label='编排可用';message='当前环境未启用整期导出。可继续编排并保存方案，单篇校样请在编辑器生成。';el('proof-state').textContent=label;el('proof-message').textContent=message;}
 proof.hidden=state==='idle'&&!revision&&issueReady;el('resume').hidden=!revision||state==='running';
 generate.textContent=state==='running'?'排版中…':outdated?'重新生成校样':'生成整期校样';
 setOff(generate,!issueReady||!articles.length);if(busy)generate.disabled=true;
 generate.title=!issueReady?'当前环境未启用整期导出':!articles.length?'先加入文章':'';
 if(state==='running')generate.setAttribute('aria-busy','true');else generate.removeAttribute('aria-busy');
}
el('stop-wait').onclick=()=>run?.stop();
async function download(proofId,a){
 if(lastProof?.proofId!==proofId||!binding().bound)throw Error('这份校样与当前方案不一致，请重新生成后再下载。');
 let offset=0,chunks=[];while(true){const r=await api('download_issue_artifact',{proofId,artifactId:a.id,offset});chunks.push(Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0)));if(r.done)break;if(r.nextOffset<=offset)throw Error('下载分块未推进');offset=r.nextOffset;}const blob=new Blob(chunks,{type:a.mimeType}),digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());if(Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')!==a.sha256)throw Error('下载摘要不符');const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=a.filename;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),10000);status(a.filename+' 下载并校验完成');}
function present(proofId,r){
 const blocked=r.report?.quality?.status==='BLOCKED',reported=r.report?.articles||[];
 lastProof={proofId,snap:proofSnapshot(r),blocked,pages:r.pages};
 el('report').textContent=JSON.stringify(r.report,null,2);
 el('quality').textContent=blocked?'校样已生成，但存在质量阻断，不能发印。':'校样已生成，待编辑审校。';el('quality').dataset.tone=blocked?'error':'normal';
 el('contents').replaceChildren();for(const a of reported){const row=document.createElement('tr');for(const t of [a.title,a.firstPage+'–'+a.lastPage,a.quality?.status==='BLOCKED'?'有阻断':'待审校']){const c=document.createElement('td');c.textContent=t;row.append(c);}if(a.quality?.status==='BLOCKED')row.className='is-blocked';el('contents').append(row);}
 el('downloads').replaceChildren();for(const a of r.artifacts||[])el('downloads').append(button(({'issue-pdf':'整期 PDF','issue-word':'整期 Word','delivery':'全部交付物','report':'质量报告'})[a.id]||a.filename,()=>download(proofId,a),{cls:'download'}));
 proofState('ready');
 const b=binding();
 if(b.bound)status('整期校样 '+r.pages+' 页，'+(blocked?'存在质量阻断，不能发印。':'目录和实际起始页已核对。'),blocked);
 else status('已取回校样，但它不属于当前方案：'+describeBinding(b,lastProof.snap,{revision}));
}
// 一次“启动 + 轮询”共用同一个取消标识：停止后，仍在路上的启动或轮询结果都不会再改动界面；后台任务照常进行，可稍后取回。
async function runProof(start){
 run?.stop();
 const token=createRun(),until=p=>token.until(p);
 run=token;proofState('running');startClock();
 const stopped=known=>{proofState('stopped',known?'已停止本页等待；后台任务不受影响，可稍后取回。':'已停止等待；若任务已在后台创建，可稍后取回。');status('已停止等待整期校样。');};
 let proofId=null;
 try{
  const id=await until(start());
  if(id===STOP){stopped(false);return;}
  proofId=id;
  for(;;){
   const r=await until(api('get_issue_proof',{proofId}));
   if(r===STOP||token.stopped){stopped(true);return;}
   if(r.status==='failed')throw Error(r.error);
   if(r.status!=='running'){present(proofId,r);return;}
   status('整期正在排版并重算目录，可关闭页面后取回任务。');
   if(await until(delay(3000))===STOP){stopped(true);return;}
  }
 }catch(e){if(token.stopped){stopped(!!proofId);return;}proofState('failed',friendly(e.message));throw e;}
 finally{stopClock();if(run===token)run=null;}
}
el('generate').onclick=()=>guard(async()=>{
 if(!issueReady)throw Error('当前环境未启用整期导出，方案仍可正常保存。');
 await save();
 const id=issueId,expected=revision;
 await runProof(async()=>{const r=await api('start_issue_proof',{issueId:id,expectedRevision:expected});localStorage.setItem('shuye-issue-proof-'+id,r.proofId);return r.proofId;});
});
el('resume').onclick=()=>guard(async()=>{
 const id=issueId,issue=await api('get_issue',{issueId:id}),proofId=issue.latestProofId||localStorage.getItem('shuye-issue-proof-'+id);
 if(!proofId)throw Error('此方案尚未生成校样。');
 await runProof(async()=>proofId);
});

// —— 启动
await guard(async()=>{
 try{issueReady=(await api('get_journal_capabilities')).issue?.enabled===true;}catch{issueReady=false;}
 await loadIssues();await loadProjects();draw();savedKey=planKey();paintChrome();status('请选择文章工程，按刊载顺序保存方案。');
});
