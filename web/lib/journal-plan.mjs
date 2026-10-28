// Deterministic planning. No source text/image/equation is rewritten or removed.
// Agents can inspect the proposed operations, override roles, then dry-run/apply.
export function imagePixels(src){
 try{
  const bytes=Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0)),v=new DataView(bytes.buffer);
  if(bytes[0]===137&&bytes[1]===80&&bytes.length>=24)return {width:v.getUint32(16),height:v.getUint32(20)};
  if(bytes[0]===255&&bytes[1]===216){let p=2;while(p+8<bytes.length){if(bytes[p]!==255)break;const m=bytes[p+1],n=v.getUint16(p+2);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m))return {height:v.getUint16(p+5),width:v.getUint16(p+7)};if(n<2)break;p+=2+n;}}
 }catch{}return null;
}
export function journalPlan(doc,{width=210,height=285,minDpi=300,roles={},journal={},columns=1}={}){
 const blocks=doc.blocks,assigned=new Map(blocks.filter(b=>b.role).map(b=>[b.id,b.role])),diagnostics=[],operations=[];
 const text=b=>(b?.text||'').trim(),set=(b,role)=>{if(b&&['paragraph','heading'].includes(b.type)&&!assigned.has(b.id))assigned.set(b.id,role);};
 for(const [id,role]of Object.entries(roles)){if(!blocks.some(b=>b.id===id))throw Error('ROLE_BLOCK_NOT_FOUND: '+id);assigned.set(id,role);}
 for(const [lang,abstractRE,keywordsRE,affiliationRE] of [
  ['zh',/^摘\s*要(?:\s*[:：]|$)/,/^关\s*键\s*词\s*[:：]/,/(学院|大学|研究院|实验室)/],
  ['en',/^Abstract\s*[:：]/i,/^Key\s*words\s*[:：]/i,/(School|College|Department|University|Institute|Laboratory)/i],
 ]){
  const a=blocks.findIndex(b=>abstractRE.test(text(b))),k=blocks.findIndex((b,i)=>i>a&&keywordsRE.test(text(b)));
  if(a<0||k<0)continue;
  for(let i=a;i<k;i++)set(blocks[i],'abstract-'+lang);set(blocks[k],'keywords-'+lang);
  let affiliation=-1;
  for(let i=Math.max(0,a-7);i<a;i++)if(affiliationRE.test(text(blocks[i]))&&/^[（(\d]/.test(text(blocks[i]))){affiliation=i;break;}
  if(affiliation<2)continue;
  set(blocks[affiliation-2],'title-'+lang);set(blocks[affiliation-1],'authors-'+lang);
  for(let i=affiliation;i<a;i++)set(blocks[i],'affiliation-'+lang);
 }
 for(const b of blocks){if(/^(中图分类号|学科分类号)/.test(text(b)))set(b,'classification');if(/\[J\]/.test(text(b))&&blocks.indexOf(b)<5)set(b,'citation');}
 const settings={fontSet:'fandol',width,height,inner:24,outer:20,top:28,bottom:22,fontSize:10.5,lineHeight:1.55,columns,gap:8};
 operations.push({op:'set_layout',patch:settings},{op:'set_journal',journal:{template:'cn-academic',normalizeTypography:true,...doc.journal,...journal}});
 for(const [blockId,role]of assigned)if(blocks.find(b=>b.id===blockId)?.role!==role)operations.push({op:'update_block',blockId,patch:{role}});
 const bodyWidth=width-settings.inner-settings.outer,measure=(bodyWidth-settings.gap*(columns-1))/columns;
 const caption=b=>/^(图\s*\d|Fig\.?\s*\d|表\s*\d|Tab(?:le)?\.?\s*\d)/i.test(text(b));
 const owned=new Set(blocks.flatMap(b=>b.captionIds||[])),cellOwners=new Map();
 for(const b of blocks)for(const c of b.cellImages||[])cellOwners.set(c.imageId,{table:b,cell:c});
 const figureTitle=b=>{
  const match=text(b).match(/^图\s*(\d+)(.*)$/);if(!match)return false;
  const next=text(blocks[blocks.indexOf(b)+1]).match(/^Fig\.?\s*(\d+)\b/i);
  return /^(?:\s|[.:：])/.test(match[2])||next?.[1]===match[1];
 };
 const figureCaption=b=>(figureTitle(b)||/^(Fig\.?\s*\d|[（(][a-z][）)]|反应条件\s*[:：]|注\s*[:：])/i.test(text(b)))&&b?.type==='paragraph'&&text(b).length<1000;
 // Consecutive subfigures belong in one bounded grid, retaining every image
 // and caption ID. Existing Word cell ownership or explicit anchors win.
 for(let i=0;i<blocks.length;i++){
  const group=[];let j=i;
  while(j<blocks.length&&blocks[j].type==='image'&&!cellOwners.has(blocks[j].id)&&!blocks[j].anchor&&!blocks[j].captionIds?.length&&!blocks[j].sideTextIds?.length)group.push(blocks[j++]);
  if(group.length<2||group.length>6){if(group.length)i=j-1;continue;}
  const captions=[];while(j<blocks.length&&figureCaption(blocks[j])&&!owned.has(blocks[j].id)&&captions.length<8)captions.push(blocks[j++].id);
  if(!captions.length){i+=group.length-1;continue;}
  const table={id:'figure-'+group[0].id,type:'table',rows:Array.from({length:Math.ceil(group.length/2)},()=>['','']),columnWidths:[50,50],cellImages:group.map((b,k)=>({row:Math.floor(k/2),col:k%2,imageId:b.id})),headerRows:0,borderStyle:'none',fontSize:9,placement:'full-width',captionPosition:'below',captionIds:captions};
  operations.push({op:'insert_blocks',beforeId:group[0].id,blocks:[table]});captions.forEach(id=>owned.add(id));
  for(const cell of table.cellImages)cellOwners.set(cell.imageId,{table,cell,maxHeight:(height-settings.top-settings.bottom)*.7/table.rows.length});
  i+=group.length-1;
 }
 let references=false;
 for(const [i,b]of blocks.entries()){
  if(assigned.has(b.id))continue;
  const t=text(b);if(/^参考文献|^References\s*$/i.test(t)){references=true;operations.push({op:'set_text_block_type',blockId:b.id,type:'heading',level:1});continue;}
  if(references&&b.type==='paragraph'){operations.push({op:'update_block',blockId:b.id,patch:{role:'reference',fontSize:8.5}});continue;}
  const heading=t.match(/^(?:§\s*)?(\d+(?:\.\d+)*)(?:\.?\s+|(?=[\u3400-\u9fff]))[^\d]/);
  if(b.type==='paragraph'&&heading&&t.length<85&&!b.inlineMath?.length&&!caption(b))operations.push({op:'set_text_block_type',blockId:b.id,type:'heading',level:Math.min(4,heading[1].split('.').length)});
  if(!['table','image'].includes(b.type))continue;
  const patch={};
  if(b.type==='table'&&!b.cellImages?.length){
   Object.assign(patch,{fontSize:9,borderStyle:'three-line',headerRows:Math.max(1,b.headerRows||0),placement:'full-width'});
   // Reserve room for indivisible Latin/chemical tokens, then distribute the
   // remaining measure according to the source grid. Keep empty narrow columns.
   const n=b.rows[0].length,source=b.columnWidths||Array(n).fill(1),sum=source.reduce((a,v)=>a+v,0),pt=bodyWidth*72/25.4;
   const minima=source.map((v,c)=>{
    const tokens=b.rows.flatMap(row=>(row[c]||'').replace(/\[\[math:[^\]]+\]\]/g,'x').match(/[A-Za-z0-9/().%+\-]+/g)||[]);
    if(!b.rows.some(row=>row[c]?.trim()))return Math.min(1,pt*v/sum);
    return Math.min(110,Math.max(25,...tokens.map(t=>t.length*4.8+13)));
   }),minimum=minima.reduce((a,v)=>a+v,0);
   if(minimum<pt)patch.columnWidths=minima.map((v,c)=>(v+(pt-minimum)*source[c]/sum)/pt*100);
   else diagnostics.push({severity:'warning',code:'TABLE_MEASURE_REVIEW',blockId:b.id,message:'表格最小内容宽度接近版心，请用 PDF 预检决定分表或字号。'});
  }
  if(b.type==='image'){
   const pixels=imagePixels(b.src),owner=cellOwners.get(b.id);
   let available=measure;
   if(owner){const tb=owner.table,n=tb.rows[0].length,c=owner.cell,span=tb.merges?.find(m=>m.row===c.row&&m.col===c.col)?.colspan||1,weights=tb.columnWidths||Array(n).fill(100/n);available=bodyWidth*weights.slice(c.col,c.col+span).reduce((a,b)=>a+b,0)/weights.reduce((a,b)=>a+b,0);}
   if(pixels){const physical=pixels.width/minDpi*25.4,pct=Math.min(owner?100:80,physical/available*100,owner?.maxHeight?owner.maxHeight*pixels.width/pixels.height/available*100:100);patch.width=Math.max(10,Math.floor(pct*100)/100);if(pct<10)diagnostics.push({severity:'warning',code:'IMAGE_TOO_SMALL',blockId:b.id,message:'原图无法在最小宽度达到目标 DPI，需提供更清晰原图或调整图组。'});}
   else diagnostics.push({severity:'warning',code:'IMAGE_DIMENSIONS_UNKNOWN',blockId:b.id,message:'无法读取像素尺寸，请在 PDF 预检中核对。'});
  }
  if(!cellOwners.has(b.id)&&!b.captionIds?.length){
   const captions=[];
   if(b.type==='table'&&!b.cellImages?.length){let j=i-1;while(j>=0&&/^(表\s*\d|Tab(?:le)?\.?\s*\d)/i.test(text(blocks[j]))&&!owned.has(blocks[j].id)){captions.unshift(blocks[j].id);j--;}}
   else{let j=i+1;if(b.type==='table')while(j<blocks.length&&cellOwners.get(blocks[j].id)?.table.id===b.id)j++;while(j<blocks.length&&figureCaption(blocks[j])&&!owned.has(blocks[j].id)&&captions.length<8)captions.push(blocks[j++].id);}
   if(captions.length){patch.captionIds=captions;captions.forEach(id=>owned.add(id));if(b.type==='table'&&b.cellImages?.length)patch.captionPosition='below';}
  }
  if(Object.keys(patch).length)operations.push({op:'update_block',blockId:b.id,patch});
 }
 // A matching caption and explicit figure anchor establish a body reference.
 // Keep ambiguous text blocked; a different figure number is not evidence.
 const plannedCaptions=new Map(operations.filter(o=>o.op==='update_block'&&o.patch.captionIds).map(o=>[o.blockId,o.patch.captionIds]));
 const byId=new Map(blocks.map(b=>[b.id,b])),figureReferences=new Set();
 for(const asset of blocks){
  if(asset.type!=='image'&&!(asset.type==='table'&&asset.cellImages?.length))continue;
  const target=byId.get(asset.anchor?.targetId),number=text(target).match(/^图\s*(\d+)/)?.[1];
  if(!number||!['paragraph','heading'].includes(target?.type))continue;
  const captions=plannedCaptions.get(asset.id)||asset.captionIds||[];
  if(captions.some(id=>id!==target.id&&['paragraph','heading'].includes(byId.get(id)?.type)&&text(byId.get(id)).match(/^图\s*(\d+)/)?.[1]===number))figureReferences.add(target.id);
 }
 for(const b of blocks)if(b.type==='paragraph'&&figureTitle(b)&&!owned.has(b.id)&&!figureReferences.has(b.id))diagnostics.push({severity:'warning',code:'FIGURE_ASSET_UNASSIGNED',blockId:b.id,message:'图题尚未关联图件；补充原图或指定 captionIds 后才能通过校样检查。'});
 for(const role of ['title-zh','authors-zh','affiliation-zh','abstract-zh','keywords-zh','title-en','authors-en','affiliation-en','abstract-en','keywords-en'])if(![...assigned.values()].includes(role))diagnostics.push({severity:'error',code:'ROLE_UNRESOLVED',role,message:'请通过 roles 指定首面字段：'+role});
 return {operations,diagnostics,roles:Object.fromEntries(assigned),sourceContentChanged:false,publicationApproved:false,workflow:['apply_changes(dryRun=true)','apply_changes','start_journal_proof','get_journal_proof','get_journal_proof_page','download_journal_pdf']};
}
