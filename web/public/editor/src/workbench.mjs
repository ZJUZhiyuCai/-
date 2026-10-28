import {documentFingerprint} from './project-sync.mjs';
const labels={width:'页面宽度',height:'页面高度',top:'上边距',bottom:'下边距',inner:'内侧边距',outer:'外侧边距',fontSize:'正文字号',lineHeight:'正文行距',columns:'栏数',gap:'栏距'};
const units={fontSize:' pt',lineHeight:' 倍',columns:' 栏'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,fn,cls)=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
const messages={LAYOUT_ASSISTANT_UNAVAILABLE:'当前服务器尚未配置排版助手。',ASSISTANT_BUSY_RETRY:'另一项建议正在生成，请稍后重试。',ASSISTANT_COMPOSITION_NOT_SUPPORTED:'自由版面请使用精确排版工具；当前助手支持流式与期刊版式。',REVISION_CONFLICT:'文稿版本已变化，请重新生成建议。',PLAN_NOT_REVIEWABLE:'这份建议已处理，不能重复应用。',PLAN_NOT_APPLIED:'当前没有可撤销的助手修改。',MODEL_INCOMPLETE_RESPONSE:'模型没有完整返回建议，请重试。',ASSISTANT_MODEL_NOT_INSTALLED:'排版模型尚未准备好，请联系部署管理员。'};
export function commandGroup(name){
 if(/批注|笔迹/.test(name))return '批改';
 if(/PDF|打印|校样/.test(name))return '校样';
 if(/PDML|自由版面|工程库|版本比较/.test(name))return '高级';
 if(/打开|导入|保存|另存|备份|版本|恢复|新建/.test(name))return '文稿';
 if(/插入|＋|目录|索引|注释|文献|符号|书签|^表格$|^公式$/.test(name))return '插入';
 return '版式';
}
export function setupWorkbench({getDoc,connection,fit}){
 document.body.classList.add('workbench');
 const canvas=document.querySelector('.canvas'),workspace=document.querySelector('.workspace');
 const oldActions=[...document.querySelectorAll('.file-actions button,.toolbar button')];
 const cloudSave=oldActions.find(b=>b.textContent==='保存到云端');
 const commands=oldActions.filter(b=>!['undo','redo'].includes(b.id)&&b!==cloudSave);
 commands.push(document.getElementById('newDoc'));
 commands.push(button('当前段落属性',()=>{toggle(inspector,formatButton);document.getElementById('tabBlock').click();}));
 const dialog=el('dialog',undefined,'command-dialog');dialog.setAttribute('aria-labelledby','commandTitle');
 const dialogHead=el('div',undefined,'command-heading'),title=el('h2','全部工具');title.id='commandTitle';
 dialogHead.append(title,button('关闭',()=>dialog.close()));
 const search=el('input');search.type='search';search.placeholder='搜索工具，如表格、公式、笔迹…';search.setAttribute('aria-label','搜索工具');
 const commandBody=el('div',undefined,'command-body');dialog.append(dialogHead,search,commandBody);document.body.append(dialog);
 const registry=commands.map(node=>({node,name:node.textContent.trim(),group:commandGroup(node.textContent)}));
 for(const group of ['文稿','插入','版式','校样','批改','高级']){
  const section=el('section');section.append(el('h3',group));const row=el('div',undefined,'command-items');
  for(const item of registry.filter(x=>x.group===group)){
   item.node.classList.remove('primary');item.node.addEventListener('click',()=>dialog.close(),{capture:true});row.append(item.node);
  }
  if(group==='文稿'){
   const revisionPolicy=document.querySelector('select[aria-label="Word 修订导入策略"]');
   if(revisionPolicy){const label=el('label','导入 Word 时的修订处理');label.append(revisionPolicy);row.append(label);}
  }
  section.append(row);commandBody.append(section);
 }
 const filter=()=>{const q=search.value.trim();let visible=0;for(const item of registry){item.node.hidden=!!q&&!item.name.includes(q)&&!item.group.includes(q);if(!item.node.hidden)visible++;}for(const section of commandBody.children)section.hidden=![...section.querySelectorAll('button')].some(b=>!b.hidden);empty.hidden=!!visible;};
 const empty=el('p','没有匹配工具。');empty.hidden=true;dialog.append(empty);search.oninput=filter;
 const openCommands=q=>{search.value=q||'';filter();dialog.showModal();search.focus();};
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!dialog.open)openCommands('');}});
 const header=el('header',undefined,'workbench-header');
 const back=document.querySelector('.back-library');back.textContent='← 书页';back.title='返回项目库';
 const name=document.getElementById('title'),state=document.getElementById('saveState');
 const route=el('span',undefined,'workbench-route');
 header.append(back,name,route,state);
 if(cloudSave){cloudSave.textContent='保存';cloudSave.classList.remove('primary');header.append(cloudSave);}
 const assistantToggle=button('排版助手',()=>{const open=document.body.classList.toggle('assistant-open');assistantToggle.setAttribute('aria-expanded',String(open));if(open)(form.hidden?editRequest:prompt).focus();},'assistant-toggle');assistantToggle.setAttribute('aria-expanded','false');assistantToggle.setAttribute('aria-controls','layoutAssistant');
 const proofButton=button('出校样',()=>runProof(), 'primary');header.append(proofButton,button('全部工具 ⌘K',()=>openCommands('')),assistantToggle);
 document.body.prepend(header);
 const rail=el('nav',undefined,'workbench-rail');rail.setAttribute('aria-label','工作区视图');
 const structure=document.querySelector('.structure'),inspector=document.querySelector('.inspector');structure.hidden=true;inspector.hidden=true;
 const toggle=(panel,trigger)=>{document.body.classList.remove('assistant-open');assistantToggle.setAttribute('aria-expanded','false');const open=panel.hidden;structure.hidden=true;inspector.hidden=true;panel.hidden=!open;for(const b of rail.querySelectorAll('button'))b.setAttribute('aria-pressed','false');trigger?.setAttribute('aria-pressed',String(open));};
 const outlineButton=button('文稿',()=>toggle(structure,outlineButton)),formatButton=button('版式',()=>toggle(inspector,formatButton));
 rail.append(outlineButton,formatButton,button('批改',()=>openCommands('批改')),button('插入',()=>openCommands('插入')));workspace.prepend(rail);
 for(const panel of [structure,inspector]){const close=button('收起',()=>{panel.hidden=true;for(const b of rail.querySelectorAll('button'))b.setAttribute('aria-pressed','false');},'panel-close');panel.prepend(close);}
 const context=el('div',undefined,'workbench-context');context.append(document.getElementById('undo'),document.getElementById('redo'));
 const zoomLabel=document.getElementById('zoom').parentElement,guideLabel=document.getElementById('guides').parentElement;
 const view=el('div',undefined,'workbench-view');view.append(guideLabel,zoomLabel);context.append(view);canvas.prepend(context);
 const panel=el('aside',undefined,'assistant-panel');panel.id='layoutAssistant';panel.setAttribute('aria-label','排版助手');workspace.append(panel);
 const heading=el('div',undefined,'assistant-heading');heading.append(el('span','排版助手'),el('span','AI','assistant-tag'));panel.append(heading);
 const intro=el('p','描述你想要的版式，先看建议，再决定应用。','assistant-intro');panel.append(intro);
 const form=el('form'),prompt=el('textarea');prompt.rows=3;prompt.maxLength=1200;prompt.placeholder='例如：内外边距改为 25 毫米，正文行距设为 1.6 倍';prompt.setAttribute('aria-label','排版要求');
 const submit=el('button','生成建议','primary');submit.type='submit';const promptActions=el('div',undefined,'assistant-form-actions');promptActions.append(submit);
 const availability=el('p','正在连接助手…','assistant-hint');form.append(prompt,promptActions,availability);
 const editRequest=button('调整要求',()=>{form.hidden=!form.hidden;editRequest.textContent=form.hidden?'调整要求':'收起要求';if(!form.hidden)prompt.focus();},'assistant-edit-request');editRequest.hidden=true;panel.append(editRequest,form);
 const notice=el('p','', 'assistant-notice');notice.setAttribute('role','status');panel.append(notice);
 const result=el('section',undefined,'assistant-result');result.setAttribute('aria-label','排版建议');panel.append(result);
 const scope=el('p','可调整页边距、分栏、字号与行距。正文和公式保持原样。','assistant-scope');panel.append(scope);
 let enabled=false,busy=false,plan=null,applyButton,undoButton,pollGeneration=0,proofBusy=false,compactedPlanId,trackedProject=connection.projectId;
 const planKey=()=>`shuye-layout-plan-${connection.projectId}`;
 const api=(name,args={})=>connection.api(name,args);
 const tell=(text,error=false)=>{notice.textContent=text;notice.classList.toggle('error',error);};
 const clean=()=>!!connection.projectId&&!connection.dirty;
 const identity=()=>({projectId:plan.projectId,planId:plan.planId});
 function sync(){
  const d=getDoc();route.textContent=d.composition?'自由版面':d.journal?'期刊':'流式文稿';proofButton.textContent=d.journal&&!d.composition?'生成校样':'校样 / 输出';
  submit.disabled=!enabled||busy||!connection.projectId||!!d.composition;submit.textContent=busy?'正在生成…':connection.dirty?'保存并生成建议':'生成建议';
  if(applyButton)applyButton.disabled=busy||connection.writing||!clean()||plan?.stale||connection.projectId!==plan?.projectId||connection.revision!==plan?.revision;
  if(undoButton)undoButton.disabled=busy||connection.writing||!clean()||connection.projectId!==plan?.projectId||connection.revision!==plan?.appliedRevision;
 }
 async function saved(){if(!connection.projectId)throw Error('请先保存文稿，再使用助手。');if(connection.dirty)await connection.save();if(connection.dirty)throw Error('保存期间有新输入，请再次生成建议。');}
 async function run(fn){if(busy)return;busy=true;sync();try{await fn();}catch(e){tell(messages[e.message]||e.message,true);}finally{busy=false;sync();}}
 function draw(){
  result.replaceChildren();applyButton=undoButton=null;
  intro.hidden=!!plan;editRequest.hidden=!plan;
  if(plan&&plan.status!=='running'&&plan.planId!==compactedPlanId){compactedPlanId=plan.planId;form.hidden=true;editRequest.textContent='调整要求';}
  if(!plan){result.append(el('div','01  提出要求\n02  核对差异\n03  应用并看校样','assistant-steps'));return;}
  const names={running:'正在拟定版式',review:'待你核对',applied:'已应用',undone:'已撤销',failed:'建议生成失败',cancelled:'已取消',unsupported:'需要调整要求'};
  result.append(el('h3',names[plan.status]||plan.status),el('p',`基于文稿 r${plan.revision}`,'assistant-hint'));
  if(plan.summary)result.append(el('p',plan.summary));
  if(plan.error)result.append(el('p',messages[plan.error]||plan.error,'error'));
  if(plan.changes?.length){const table=el('table',undefined,'assistant-diff'),head=el('tr');for(const text of ['参数','原来','建议'])head.append(el('th',text));table.append(head);for(const c of plan.changes){const row=el('tr');row.append(el('th',labels[c.field]||c.field),el('td',String(c.before)+(units[c.field]??' mm')),el('td',String(c.after)+(units[c.field]??' mm')));table.append(row);}result.append(table);}
  if(plan.stale)result.append(el('p','文稿版本已变化，请重新生成建议。','error'));
  else if(connection.dirty)result.append(el('p','有尚未保存的修改，当前建议暂不能应用。请保存后重新生成。','assistant-hint'));
  const actions=el('div',undefined,'assistant-plan-actions');
  if(plan.status==='running')actions.append(button('取消生成',async()=>{try{plan=await api('cancel_layout_plan',identity());draw();}catch(e){tell(e.message,true);}}));
  if(plan.status==='review'){applyButton=button(`应用这 ${plan.changes.length} 项修改`,()=>mutate('apply_layout_plan'),'primary');actions.append(applyButton);}
  if(plan.status==='applied'){
   actions.append(button('生成校样',()=>runProof(),'primary'));undoButton=button('撤销本次修改',()=>mutate('undo_layout_plan'));actions.append(undoButton);
   result.append(el('p',`已保存为 r${plan.appliedRevision} · 请核对新校样`,'assistant-hint'));
  }
  if(plan.status==='undone')result.append(el('p',`已恢复原版式，当前 r${plan.undoneRevision}。`));
  result.append(actions);sync();
 }
 async function poll(generation){while(plan?.status==='running'&&generation===pollGeneration){await new Promise(r=>setTimeout(r,1200));if(generation!==pollGeneration)return;const args=identity(),next=await api('get_layout_plan',args);if(generation!==pollGeneration||connection.projectId!==args.projectId)return;plan=next;draw();}if(generation===pollGeneration&&plan?.status==='review')tell('参数预检已通过。请核对差异，再应用。');}
 form.onsubmit=e=>{e.preventDefault();if(!prompt.value.trim())return;tell('');run(async()=>{
  const generation=++pollGeneration;await saved();const projectId=connection.projectId,started=await api('start_layout_plan',{projectId,expectedRevision:connection.revision,instruction:prompt.value.trim()});
  try{localStorage.setItem(`shuye-layout-plan-${projectId}`,started.planId);}catch{}
  if(generation!==pollGeneration||connection.projectId!==projectId)return;plan=started;draw();await poll(generation);
 });};
 async function mutate(tool){await run(async()=>{
  if(!clean()||connection.projectId!==plan.projectId)throw Error('请先处理本地修改，再重新生成建议。');
  const before=documentFingerprint(getDoc()),projectId=connection.projectId;connection.busy=true;
  try{
   const next=await api(tool,{...identity(),expectedRevision:connection.revision});
   if(connection.projectId!==projectId){tell('处理结果已保留在原工程中。');return;}plan=next;
   if(documentFingerprint(getDoc())!==before){tell('云端已处理；操作期间的新输入已保留，请先备份再打开云端版本。',true);draw();return;}
   if(await connection.open(projectId)===false)throw Error('已切换工程；处理结果保留在原工程中。');draw();tell(tool==='apply_layout_plan'?'已应用并保存。现在可以生成校样。':'已撤销本次修改，原版式已恢复。');
  }finally{connection.busy=false;}
 });}
 async function runProof(){
  if(proofBusy)return;
  if(!getDoc().journal||getDoc().composition){openCommands('校样');return;}
  proofBusy=true;proofButton.disabled=true;tell('正在生成当前版本的期刊校样…');
  try{const proof=await connection.journalUI.generateProof();tell(`校样 r${proof.revision} 已生成：${proof.pages} 页，PDF 与检查报告已下载。${proof.report?.quality?.status==='BLOCKED'?'存在质量阻断，请查看报告。':'请核对实际页面。'}`);}
  catch(e){tell(messages[e.message]||e.message,true);}finally{proofBusy=false;proofButton.disabled=false;}
 }
 document.addEventListener('shuye:document-changed',()=>queueMicrotask(()=>{sync();fit();}));
 document.addEventListener('shuye:connection-changed',()=>{if(trackedProject!==connection.projectId){trackedProject=connection.projectId;pollGeneration++;plan=null;compactedPlanId=null;form.hidden=false;tell('');draw();}else if(plan){plan.stale=connection.revision!==(plan.status==='applied'?plan.appliedRevision:plan.status==='undone'?plan.undoneRevision:plan.revision);draw();}sync();fit();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open&&document.body.classList.contains('assistant-open')){document.body.classList.remove('assistant-open');assistantToggle.setAttribute('aria-expanded','false');assistantToggle.focus();}});
 const observer=new ResizeObserver(()=>{if(document.getElementById('zoom').value==='fit')fit();});observer.observe(canvas);
 draw();sync();fit();
 api('get_layout_assistant').then(c=>{enabled=c.enabled;availability.textContent=enabled?'建议由本机模型生成，应用前均需核对。':'排版助手尚未配置，仍可使用全部编辑工具。';sync();}).catch(()=>{availability.textContent='暂时无法连接助手；编辑工具仍可使用。';});
 try{const planId=localStorage.getItem(planKey()),projectId=connection.projectId,generation=pollGeneration;if(planId)api('get_layout_plan',{projectId,planId}).then(async p=>{if(busy||generation!==pollGeneration||connection.projectId!==projectId)return;plan=p;prompt.value=p.instruction;draw();if(p.status==='running')await run(()=>poll(++pollGeneration));}).catch(()=>{});}catch{}
 return {openCommands};
}
