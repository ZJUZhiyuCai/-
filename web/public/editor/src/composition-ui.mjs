import {mergeCells,splitCell,resizeTable} from './table-layout.mjs';
import {paginateStory} from './auto-flow.mjs';
import {rebaseTextSpans} from './frame-flow.mjs';
import {previewInk} from './ink.mjs';
import {emptyComposition,applyCompositionOperation,pageObjects,masterObjects,pageContext,compositionRichText,flowStory} from './composition.mjs';
export const fonts={serif:'"SimSun","Songti SC",serif',sans:'"Microsoft YaHei",sans-serif',kai:'"KaiTi",serif'};
const mm=96/25.4;
export function layoutComposition(doc) {
 const c=doc.composition,ctx=document.createElement('canvas').getContext('2d'),runs=new Map(),warnings=[];
 const measure=(text,f)=>{ctx.font=`${(f.fontSize||11)*96/72}px ${fonts[f.fontFamily||'serif']}`;return ctx.measureText(text).width*72/96;};
 const frames=new Map(c.pages.flatMap(p=>p.objects).map(o=>[o.id,o]));
 for(const s of c.stories){try{const r=flowStory(s,s.frameIds.map(id=>frames.get(id)),measure);for(const run of r.runs)runs.set(run.frameId,run);if(r.overset)warnings.push({storyId:s.id,message:s.blocks?`「${s.name}」${r.overset}`:`「${s.name}」有 ${[...r.overset].length} 字尚未排入文字框`});}catch(e){for(const id of s.frameIds)runs.set(id,{frameId:id,start:0,end:0,lines:[],rules:[]});warnings.push({storyId:s.id,message:`「${s.name}」无法排入当前框：${({RICH_TEXT_TOO_NARROW:'单元格或文字栏过窄，请扩大宽度或减小字号',RICH_TABLE_HEADER_TOO_TALL:'重复表头高于可用区域，请增加框高或减少表头行数',RICH_TOO_MANY_NOTES_ON_LINE:'单行注释超出脚注区域，请拆开引用'}[e.message]||e.message)}`});}}

 const pages=c.pages.map((p,i)=>({id:p.id,objects:pageObjects(c,p.id).map(o=>{
   if(o.type!=='text')return o;
   const rich=compositionRichText(doc,p.id,o.text||'',o.spans),text=rich.text,run=runs.get(o.id)||flowStory(rich,[o],measure).runs[0];
   if(!runs.has(o.id)&&run.end<text.length)warnings.push({frameId:o.id,message:`文字框 ${o.id} 有内容溢出`});return {...o,run};
 })}));return {pages,warnings};
}
export function renderComposition(doc,host,zoom,onSelect,onMove,selected) {
 const plan=layoutComposition(doc),frag=document.createDocumentFragment();
 for(const p of plan.pages){const wrap=document.createElement('div');wrap.className='paper-wrap';wrap.style.cssText=`width:${doc.layout.width*mm*zoom}px;height:${doc.layout.height*mm*zoom}px`;
  const paper=document.createElement('div');paper.className='paper composition-paper';paper.dataset.pageId=p.id;paper.style.cssText=`width:${doc.layout.width}mm;height:${doc.layout.height}mm;transform:scale(${zoom});transform-origin:top left`;
  for(const o of p.objects){const node=document.createElement('div');node.className='composition-object'+(o.id===selected?' is-selected':'');node.dataset.frameId=o.id;node.setAttribute('role','button');node.tabIndex=0;node.setAttribute('aria-label',`${o.masterObject?'母版':'页面'}${o.type==='text'?'文字框':o.type==='image'?'图片框':'色块'} ${o.id}`);
   node.style.cssText=`position:absolute;left:${o.x}mm;top:${o.y}mm;width:${o.width}mm;height:${o.height}mm;transform:rotate(${o.rotation||0}deg);background:${previewInk(o.fill)};color:${previewInk(o.color,'#111111')};font-family:${fonts[o.fontFamily||'serif']};font-size:${o.fontSize||11}pt;overflow:hidden;box-sizing:border-box;padding:${o.padding||0}mm`;
   if(o.type==='image'){const img=document.createElement('img');img.src=o.src;img.alt='';img.draggable=false;img.style.cssText='width:100%;height:100%;object-fit:contain';node.append(img);}
   if(o.type==='text')for(const rule of o.run.rules||[]){const el=document.createElement('div');el.className='composition-table-rule';el.style.cssText=`position:absolute;box-sizing:border-box;left:${rule.x}pt;top:${rule.y}pt;width:${rule.width}pt;height:${rule.height}pt;${rule.kind==='separator'?'background:':'border:.35pt solid '}${previewInk(rule.color)};pointer-events:none`;node.append(el);}
   if(o.type==='text')for(const line of o.run.lines)for(const s of line.segments){const el=document.createElement('span');el.textContent=s.text;el.className='composition-line';el.style.cssText=`position:absolute;white-space:pre;left:${s.x}pt;top:${s.y}pt;font-size:${s.style.fontSize}pt;line-height:1;font-family:${fonts[s.style.fontFamily]};color:${previewInk(s.style.color)};${s.rotation?'transform:rotate(90deg);transform-origin:center center;':''}`;node.append(el);}
   node.onclick=()=>onSelect(p.id,o.id,o.masterObject);node.onkeydown=e=>{if(e.key==='Enter')onSelect(p.id,o.id,o.masterObject);};
   node.onpointerdown=e=>{if(e.button!==0||o.locked||o.masterObject)return;const x=e.clientX,y=e.clientY;node.setPointerCapture(e.pointerId);node.onpointermove=ev=>{node.style.left=`${o.x+(ev.clientX-x)/mm/zoom}mm`;node.style.top=`${o.y+(ev.clientY-y)/mm/zoom}mm`;};node.onpointerup=ev=>{node.onpointermove=null;node.onpointerup=null;if(Math.hypot(ev.clientX-x,ev.clientY-y)>3)onMove(p.id,o,(ev.clientX-x)/mm/zoom,(ev.clientY-y)/mm/zoom);};node.onpointercancel=()=>{node.onpointermove=null;node.style.left=`${o.x}mm`;node.style.top=`${o.y}mm`;};};paper.append(node);
  }wrap.append(paper);frag.append(wrap);
 }host.replaceChildren(frag);return plan;
}
export function setupComposition({getDoc,change,refresh,status}) {
 let enabled=false,seen=false,selected=null,pageId=null,masterId=null,storyId=null;
 const panel=document.createElement('aside');panel.className='composition-inspector';panel.hidden=true;document.querySelector('.workspace').append(panel);
 const mode=document.createElement('button');mode.textContent='自由版面';document.querySelector('.toolbar').prepend(mode);
 const run=async op=>{let failure;const result=await change(()=>{try{applyCompositionOperation(getDoc(),op);}catch(e){failure=e;throw e;}});if(result===false){inspector();const messages={MASTER_INHERITANCE_CYCLE:'母版不能直接或间接继承自身，请选择其他父母版。',MASTER_IN_USE:'此母版仍被页面、子母版或章节使用，请先解除引用。',SECTION_START_PAGE_IN_USE:'这是章节起始页，请先修改或删除该章节规则。',MASTER_OBJECT_NOT_FOUND:'此修改会使已有覆盖失去来源，请先恢复相关对象的继承。',OBJECT_LOCKED:'对象已锁定，请先解锁再修改。',COMPOSITION_NEEDS_PAGE:'工程至少需要保留一页。',COMPOSITION_SIZE:'框的宽度和高度须在 1–900 mm 之间。',COMPOSITION_POSITION:'框坐标须在 -450–900 mm 之间。',COMPOSITION_PADDING:'内边距过大，框内必须保留排版空间。'};status(messages[failure?.message]||failure?.message||'修改未保存，请检查输入。',true);}return result;};
 const button=(parent,label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{document.activeElement?.blur();try{await fn();}catch(e){status(e.message,true);}};parent.append(b);return b;};
 const field=(label,value,fn,type='text',parent=panel)=>{const l=document.createElement('label');l.textContent=label;const input=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value??'';input.onchange=()=>fn(type==='number'?Number(input.value):input.value);l.append(input);parent.append(l);return input;};
 const select=(label,items,value,fn)=>{const l=document.createElement('label');l.textContent=label;const input=document.createElement('select');for(const [id,name] of items){const o=document.createElement('option');o.value=id;o.textContent=name;input.append(o);}input.value=value||'';input.onchange=()=>fn(input.value);l.append(input);panel.append(l);};
 const owner=()=>masterId?{masterId}:{pageId};
 const scrollToPage=()=>document.querySelector(`.composition-paper[data-page-id="${pageId}"]`)?.scrollIntoView({block:'start',inline:'nearest'});
 const current=()=>masterId?getDoc().composition.masters.find(m=>m.id===masterId):getDoc().composition.pages.find(p=>p.id===pageId);
 const frame=()=>current()?.objects.find(o=>o.id===selected);
 const patch=values=>{const f=frame();if(f)return run({op:'upsert_frame',...owner(),frame:{...f,...values}});};
 mode.onclick=async()=>{const next=!enabled;if(!getDoc().composition)await run({op:'set_composition',composition:emptyComposition()});enabled=next;refresh();};
 function richInspector(s){
  if(!s.blocks){button(panel,'启用表格与注释文字流',()=>run({op:'upsert_story',story:{...s,text:'',spans:[],blocks:[{id:'b-'+crypto.randomUUID(),type:'paragraph',text:s.text,spans:s.spans||[]}],notes:[]}}));return;}
  const title=document.createElement('h3');title.textContent='结构文字流 · 段落、表格与注释';panel.append(title);
  const hint=document.createElement('p');hint.textContent='横排矩形等宽栏；支持重复表头、合并格跨页拆分和续页脚注。正文以 [^注释标识] 引用，添加注释时自动插入标记。';panel.append(hint);
  const update=blocks=>run({op:'upsert_story',story:{...s,blocks}});
  const replace=b=>update(s.blocks.map(x=>x.id===b.id?b:x));
  for(const b of s.blocks){const group=document.createElement('details'),head=document.createElement('summary');head.textContent=(b.type==='table'?'表格':'段落')+' · '+b.id;group.append(head);panel.append(group);
   if(b.type==='paragraph')field('段落内容 '+b.id,b.text,text=>replace({...b,text,spans:rebaseTextSpans(b.text,text,b.spans)}),'textarea',group);
   else {
    const grid=document.createElement('table');grid.className='rich-story-grid';group.append(grid);
    for(let r=0;r<b.rows.length;r++){const row=document.createElement('tr');grid.append(row);for(let c=0;c<b.rows[r].length;c++){const cell=document.createElement('td'),input=document.createElement('textarea');input.setAttribute('aria-label',`表格 ${b.id} 第 ${r+1} 行第 ${c+1} 列`);input.value=b.rows[r][c];input.onchange=()=>{const rows=structuredClone(b.rows);rows[r][c]=input.value;replace({...b,rows});};cell.append(input);row.append(cell);}}
    field('重复表头行数 '+b.id,b.headerRows??1,headerRows=>replace({...b,headerRows}),'number',group);
    field('列宽比例 '+b.id,(b.columnWidths||b.rows[0].map(()=>1)).join(','),v=>replace({...b,columnWidths:v.split(',').map(Number)}),'text',group);
    const mergeRow=field('合并起始行（从 1 开始）',1,()=>{},'number',group),mergeCol=field('合并起始列（从 1 开始）',1,()=>{},'number',group),rows=field('合并行数',2,()=>{},'number',group),cols=field('合并列数',1,()=>{},'number',group);
    button(group,'合并选区',()=>replace(mergeCells(b,{row:Number(mergeRow.value)-1,col:Number(mergeCol.value)-1,rowspan:Number(rows.value),colspan:Number(cols.value)})));
    button(group,'拆分选中合并格',()=>replace(splitCell(b,Number(mergeRow.value)-1,Number(mergeCol.value)-1)));
    button(group,'在末尾增加一行',()=>replace(resizeTable(b,'row',b.rows.length)));button(group,'在末尾增加一列',()=>replace(resizeTable(b,'col',b.rows[0].length)));
   }
   button(group,'删除组件 '+b.id,()=>update(s.blocks.filter(x=>x.id!==b.id)));
  }
  button(panel,'添加结构段落',()=>update([...s.blocks,{id:'b-'+crypto.randomUUID(),type:'paragraph',text:'新段落'}]));
  button(panel,'添加跨页表格',()=>update([...s.blocks,{id:'t-'+crypto.randomUUID(),type:'table',headerRows:1,rows:[['项目','说明'],['条目','内容']],columnWidths:[1,2],merges:[]}]));
  for(const n of s.notes||[])field(`${n.kind==='endnote'?'尾注':'脚注'} ${n.id}`,n.text,text=>run({op:'upsert_story',story:{...s,notes:s.notes.map(x=>x.id===n.id?{...x,text}:x)}}),'textarea');
  const noteId=field('新注释标识','note-'+(s.notes?.length+1||1),()=>{}),noteText=field('新注释内容','',()=>{},'textarea');
  const appendNote=kind=>{const id=noteId.value;return run({op:'upsert_story',story:{...s,notes:[...(s.notes||[]),{id,text:noteText.value,kind}],blocks:[...s.blocks,{id:'b-'+crypto.randomUUID(),type:'paragraph',text:'注释引用[^'+id+']'}]}});};
  button(panel,'添加脚注及引用',()=>appendNote('footnote'));button(panel,'添加尾注及引用',()=>appendNote('endnote'));
 }
 function inspector(){
  const c=getDoc().composition;if(!c)return;pageId=c.pages.some(p=>p.id===pageId)?pageId:c.pages[0].id;if(masterId&&!c.masters.some(m=>m.id===masterId))masterId=null;
  panel.replaceChildren();const h=document.createElement('h2');h.textContent='页面与文字流';panel.append(h);
  select('页面',c.pages.map((p,i)=>[p.id,`第 ${i+1} 页`]),pageId,id=>{pageId=id;masterId=null;selected=null;document.querySelectorAll('.composition-object.is-selected').forEach(el=>el.classList.remove('is-selected'));inspector();scrollToPage();});
  const row=document.createElement('div');row.className='composition-actions';panel.append(row);
  button(row,'新增页',async()=>{pageId='p-'+crypto.randomUUID();masterId=null;selected=null;await run({op:'upsert_page',page:{id:pageId,objects:[],overrides:[]}});scrollToPage();});
  button(row,'删除此页（保留文字流）',()=>run({op:'delete_page',pageId}));
  button(row,'页面前移',()=>run({op:'move_page',pageId,index:Math.max(0,c.pages.findIndex(p=>p.id===pageId)-1)}));
  const activePage=c.pages.find(p=>p.id===pageId),context=pageContext(c,pageId);
  select('应用母版',[['auto','按章节规则'],['none','无母版'],...c.masters.map(m=>[m.id,m.name])],activePage.masterId===undefined?'auto':activePage.masterId===null?'none':activePage.masterId,master=>run({op:'assign_master',pageId,masterId:['auto','none'].includes(master)?null:master,inherit:master==='auto'}));
  const sectionInfo=document.createElement('p');sectionInfo.textContent=`${context.section?.name||'未设置章节'} · 章节第 ${context.sectionPage} 页 · ${c.masters.find(m=>m.id===context.masterId)?.name||'无母版'}`;panel.append(sectionInfo);
  const section=(c.sections||[]).find(s=>s.startPageId===pageId);
  if(!section)button(panel,'从此页开始新章节',()=>run({op:'upsert_section',section:{id:'sec-'+crypto.randomUUID(),name:'新章节',startPageId:pageId}}));
  else {
   field('章节名称',section.name,name=>run({op:'upsert_section',section:{...section,name}}));
   field('章节起始页码（留空连续）',section.pageStart??'',value=>run({op:'upsert_section',section:{...section,pageStart:value===''?undefined:Number(value)}}));select('页码格式',[['arabic','阿拉伯数字'],['roman-lower','小写罗马数字'],['roman-upper','大写罗马数字'],['chinese','中文数字']],section.numbering||'arabic',numbering=>run({op:'upsert_section',section:{...section,numbering}}));
   button(panel,'调整为右页起章',()=>run({op:'align_section_start',sectionId:section.id,side:'right'}));button(panel,'调整为左页起章',()=>run({op:'align_section_start',sectionId:section.id,side:'left'}));
   for(const [key,label] of [['firstMasterId','章节首页母版'],['oddMasterId','章节奇数页母版'],['evenMasterId','章节偶数页母版']])select(label,[...(key==='firstMasterId'?[['auto','沿用奇偶页规则']]:[]),['none','无母版'],...c.masters.map(m=>[m.id,m.name])],section[key]===undefined?(key==='firstMasterId'?'auto':'none'):section[key]===null?'none':section[key],value=>run({op:'upsert_section',section:{...section,[key]:value==='auto'?undefined:value==='none'?null:value}}));
   button(panel,'删除章节规则（保留页面）',()=>run({op:'delete_section',sectionId:section.id}));
  }
  select('编辑范围',[['','当前页面'],...c.masters.map(m=>[m.id,'母版 · '+m.name])],masterId,id=>{masterId=id||null;selected=null;inspector();});
  button(panel,'以当前页创建母版',()=>run({op:'master_from_page',pageId,newMasterId:'m-'+crypto.randomUUID(),name:'页面母版 '+(c.masters.length+1)}));
  button(panel,'新建母版',async()=>{masterId='m-'+crypto.randomUUID();await run({op:'upsert_master',master:{id:masterId,name:'母版 '+(c.masters.length+1),objects:[]}});});
  if(masterId){field('母版名称',current().name,name=>run({op:'upsert_master',master:{...current(),name}}));select('基于母版',[['','无父母版'],...c.masters.filter(m=>m.id!==masterId).map(m=>[m.id,m.name])],current().baseMasterId,id=>run({op:'upsert_master',master:{...current(),baseMasterId:id||undefined,overrides:[]}}));button(panel,'删除未使用的母版',()=>run({op:'delete_master',masterId}));}
  const add=document.createElement('div');add.className='composition-actions';panel.append(add);
  const addFrame=async(type,src)=>{selected='f-'+crypto.randomUUID();await run({op:'upsert_frame',...owner(),frame:{id:selected,type,x:20,y:25,width:65,height:40,...(type==='text'?{text:'',fontSize:11,lineHeight:1.5}:{}),...(type==='rect'?{fill:'#dcebea'}:{}),...(src?{src}:{})}});};
  button(add,'新增文字框',()=>addFrame('text'));button(add,'新增色块',()=>addFrame('rect'));
  const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.hidden=true;panel.append(file);
  button(add,'新增图片框',()=>file.click());file.onchange=()=>{const f=file.files[0];if(!f)return;if(f.size>5*1024*1024){status('图片不能超过 5 MB',true);return;}const reader=new FileReader();reader.onload=()=>addFrame('image',reader.result);reader.readAsDataURL(f);};
  select('对象',[['','选择对象'],...current().objects.map(o=>[o.id,`${o.type} · ${o.id.slice(0,10)}`])],selected,id=>{selected=id;inspector();});
  const f=frame();if(f){
   for(const [k,label] of [['x','横坐标 mm'],['y','纵坐标 mm'],['width','宽度 mm'],['height','高度 mm'],['rotation','旋转 °']])field(label,f[k]||0,v=>patch({[k]:v}),'number');
   button(panel,f.locked?'解锁对象':'锁定对象',()=>run({op:'set_frame_lock',...owner(),frameId:f.id,locked:!f.locked}));
   button(panel,'删除对象（保留文字流）',()=>run({op:'delete_frame',...owner(),frameId:f.id}));
   const editInk=(key,label,optional=false)=>{
    const value=f[key],space=value?.space||(value?'rgb':'none');
    select(label+'模式',[...(optional?[['none','无']]:[]),['rgb','RGB'],['cmyk','CMYK'],['spot','专色']],space==='none'&&!optional?'rgb':space,space=>patch({[key]:space==='none'?undefined:space==='rgb'?'#111111':space==='cmyk'?{space,values:[0,0,0,1]}:{space,name:'自定义专色',tint:1,alternate:[1,0,0,0]}}));
    if(space==='rgb'||(!value&&!optional))field(label+' RGB',value||'#111111',v=>patch({[key]:v}),'color');
    if(space==='cmyk'||space==='spot'){
     const prop=space==='cmyk'?'values':'alternate';
     if(space==='spot'){field(label+'专色名称',value.name,name=>patch({[key]:{...value,name}}));field(label+'专色浓度 %',value.tint*100,v=>patch({[key]:{...value,tint:v/100}}),'number');}
     ['C','M','Y','K'].forEach((channel,i)=>field(label+(space==='spot'?'替代色 ':' ')+channel+' %',value[prop][i]*100,v=>{const values=[...value[prop]];values[i]=v/100;return patch({[key]:{...value,[prop]:values}});},'number'));
    }
   };
   editInk('fill','填色',true);if(f.type==='text')editInk('color','文字颜色');
   if(f.type!=='image')select('叠印',[['no','关闭'],['yes','开启（OPM 1）']],f.overprint?'yes':'no',v=>patch({overprint:v==='yes'}));
   const inkNote=document.createElement('p');inkNote.textContent='CMYK 与专色为手工墨量；屏幕仅近似显示，未进行 ICC 转换或叠印预览。';panel.append(inkNote);
   if(f.type==='text'){
    select('文字方向',[['horizontal-tb','横排'],['vertical-rl','竖排（右起）']],f.writingMode||'horizontal-tb',v=>patch({writingMode:v}));
    select('框内对齐',[['left','起端'],['center','居中'],['right','末端']],f.align||'left',v=>patch({align:v}));
    field('栏宽比例（逗号分隔）',(f.columns||[1]).join(','),v=>patch({columns:v.split(',').map(Number)}));field('栏间距 mm',f.columnGap??4,v=>patch({columnGap:v}),'number');
    select('字体类别',[['serif','衬线'],['sans','无衬线'],['kai','楷体']],f.fontFamily||'serif',v=>patch({fontFamily:v}));
    field('字号 pt',f.fontSize||11,v=>patch({fontSize:v}),'number');field('行距倍数',f.lineHeight||1.5,v=>patch({lineHeight:v}),'number');
    const ownStory=c.stories.find(s=>s.frameIds.includes(f.id));
    if(!ownStory)field('内容槽标识（英文）',f.slot||'',slot=>patch({slot:slot||undefined}));
    if(!ownStory?.blocks)field(ownStory?'文字流全文':'框内文字（支持 {page}、{title}）',ownStory?.text||f.text||'',text=>ownStory?run({op:'upsert_story',story:{...ownStory,text,spans:rebaseTextSpans(ownStory.text,text,ownStory.spans)}}):patch({text,spans:rebaseTextSpans(f.text||'',text,f.spans)}),'textarea');
    if(!ownStory?.blocks){
    const textSource=ownStory||f,marks=textSource.spans||[];
    const rich=document.createElement('details'),richTitle=document.createElement('summary');richTitle.textContent='局部文字样式';rich.append(richTitle);panel.append(rich);
    const a=field('范围起点（字符偏移）',0,()=>{},'number',rich),b=field('范围终点（字符偏移）',textSource.text?.length||0,()=>{},'number',rich),size=field('局部字号 pt',f.fontSize||11,()=>{},'number',rich),color=field('局部颜色','#111111',()=>{},'color',rich);
    button(rich,'应用局部样式',()=>{const start=Number(a.value),end=Number(b.value);const spans=[...marks.flatMap(r=>r.end<=start||r.start>=end?[r]:[...(r.start<start?[{...r,end:start}]:[]),...(r.end>end?[{...r,start:end}]:[])]),{start,end,style:{fontSize:Number(size.value),color:color.value}}].sort((x,y)=>x.start-y.start);return ownStory?run({op:'upsert_story',story:{...ownStory,spans}}):patch({spans});});
    button(rich,'清除局部样式',()=>ownStory?run({op:'upsert_story',story:{...ownStory,spans:[]}}):patch({spans:[]}));
    }
    const geometry=document.createElement('details'),geometryTitle=document.createElement('summary');geometryTitle.textContent='异形排文与避让';geometry.append(geometryTitle);panel.append(geometry);
    button(geometry,'矩形排文',()=>patch({shape:undefined}));button(geometry,'梯形排文',()=>patch({shape:[[f.width*.2,0],[f.width*.8,0],[f.width,f.height],[0,f.height]]}));
    button(geometry,'添加中央避让区',()=>patch({exclusions:[...(f.exclusions||[]),{x:f.width*.3,y:f.height*.3,width:f.width*.4,height:f.height*.4}]}));button(geometry,'清除避让区',()=>patch({exclusions:[]}));
    if(ownStory)button(panel,'自动续排至新页面',()=>change(()=>{const ctx=document.createElement('canvas').getContext('2d'),measure=(text,style)=>{ctx.font=`${style.fontSize*96/72}px ${fonts[style.fontFamily||'serif']}`;return ctx.measureText(text).width*72/96;};getDoc().composition=paginateStory(getDoc().composition,ownStory.id,f.id,measure).composition;}));
    if(ownStory)button(panel,'断开此框（文字保留在原流）',()=>run({op:'thread_frames',storyId:ownStory.id,frameIds:ownStory.frameIds.filter(id=>id!==f.id)}));
   }
  }
  select('文字流',[['','选择文字流'],...c.stories.map(s=>[s.id,s.name])],storyId,id=>{storyId=id;inspector();});
  button(panel,'新建文字流',async()=>{storyId='s-'+crypto.randomUUID();await run({op:'upsert_story',story:{id:storyId,name:'文字流 '+(c.stories.length+1),text:'',frameIds:[]}});});
  const s=c.stories.find(s=>s.id===storyId);
  if(s){field('流名称',s.name,name=>run({op:'upsert_story',story:{...s,name}}));if(!s.blocks)field('全文（溢出内容也保留）',s.text,text=>run({op:'upsert_story',story:{...s,text,spans:rebaseTextSpans(s.text,text,s.spans)}}),'textarea');
   richInspector(s);
   const info=document.createElement('p');info.textContent='串接顺序：'+(s.frameIds.join(' → ')||'尚未连接文字框');panel.append(info);
   button(panel,'将选中框接到流末尾',async()=>{const f=frame();if(masterId||f?.type!=='text')throw Error('请选择页面上的文字框');if(c.stories.some(s=>s.frameIds.includes(f.id)))throw Error('该框已连接文字流，请先断开');if(s.blocks&&f.text)throw Error('结构文字流只能连接空框，请先保留框内文字。');await change(()=>{applyCompositionOperation(getDoc(),{op:'upsert_frame',pageId,frame:{...f,text:'',spans:[]}});applyCompositionOperation(getDoc(),{op:'upsert_story',story:{...s,text:s.text+(f.text||''),spans:[...(s.spans||[]),...(f.spans||[]).map(r=>({...r,start:r.start+s.text.length,end:r.end+s.text.length}))],frameIds:[...s.frameIds,f.id]}});});});
  }
  if(!masterId){const slotNames=[...new Set([...pageObjects(c,pageId).map(o=>o.slot).filter(Boolean),...(activePage.slotContents||[]).map(s=>s.name)])];for(const name of slotNames){const saved=(activePage.slotContents||[]).find(s=>s.name===name);field('内容槽 · '+name,saved?.text||'',text=>run({op:'set_slot_content',pageId,name,text,spans:rebaseTextSpans(saved?.text||'',text,saved?.spans)}),'textarea');button(panel,'恢复内容槽默认值 · '+name,()=>run({op:'set_slot_content',pageId,name,reset:true}));}}
  const p=current(),baseId=masterId?p.baseMasterId:context.masterId;
  if(baseId)for(const o of masterObjects(c,baseId)){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=(masterId?'子母版覆盖 · ':'页面覆盖 · ')+o.id;details.append(summary);panel.append(details);button(details,'隐藏继承对象',()=>run({op:'override_master_object',...owner(),objectId:o.id,hidden:true}));button(details,'恢复母版继承',()=>run({op:'override_master_object',...owner(),objectId:o.id,reset:true}));if(o.type==='text')field('母版局部文字 '+o.id,(p.overrides||[]).find(x=>x.objectId===o.id)?.patch?.text??o.text??'',text=>run({op:'override_master_object',...owner(),objectId:o.id,patch:{...((p.overrides||[]).find(x=>x.objectId===o.id)?.patch||{}),text}}),'textarea',details);}
 }
 return {active:()=>enabled&&!!getDoc().composition,render(host,zoom){
   if(getDoc().composition&&!seen)enabled=true;seen=!!getDoc().composition;
   document.querySelector('.workspace').classList.toggle('composition-mode',enabled&&!!getDoc().composition);panel.hidden=!(enabled&&getDoc().composition);mode.textContent=enabled?'返回正文':'自由版面';if(!enabled||!getDoc().composition)return null;inspector();
   return renderComposition(getDoc(),host,zoom,(pid,id,master)=>{pageId=pid;masterId=master?getDoc().composition.masters.find(m=>m.objects.some(o=>o.id===id))?.id:null;selected=id;host.querySelectorAll('.composition-object').forEach(el=>el.classList.toggle('is-selected',el.dataset.frameId===id));inspector();},(pid,f,dx,dy)=>{const source=getDoc().composition.pages.find(p=>p.id===pid).objects.find(o=>o.id===f.id);return run({op:'upsert_frame',pageId:pid,frame:{...source,x:Math.round((f.x+dx)*100)/100,y:Math.round((f.y+dy)*100)/100}});},selected);
 }};
}
