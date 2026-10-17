import {mergeCells,splitCell,resizeTable} from './table-layout.mjs';
import {rebaseTextSpans} from './frame-flow.mjs';
import {validateInk} from './ink.mjs';
import {validateRichStory,validateRichFrames} from './rich-story.mjs';
export {flowStory} from './frame-flow.mjs';
// Page geometry is in mm; type is in pt. Stories own text, frames own geometry.
// Removing a frame never removes its story. Frame order is explicit, not page order.
const fail = message => { throw Error(message); };
const ident = x => typeof x === 'string' && /^[A-Za-z0-9][\w-]{0,79}$/.test(x);
const num = (x, min, max) => Number.isFinite(x) && x >= min && x <= max;
const keys = (o, allowed) => { if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(k => !allowed.includes(k))) fail('COMPOSITION_UNKNOWN_PROPERTY'); };
export function validateTextSpans(text,spans=[]) {
 if(!Array.isArray(spans)||spans.length>10000)fail('TEXT_SPANS_LIMIT');
 const boundaries=new Set([text.length,...[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text)].map(g=>g.index)]);let end=0;
 for(const span of spans){keys(span,['start','end','style']);if(!boundaries.has(span.start)||!boundaries.has(span.end)||span.start<end||span.end<=span.start)fail('TEXT_SPAN_RANGE');end=span.end;keys(span.style,['fontSize','fontFamily','color']);if(span.style.fontSize!==undefined&&!num(span.style.fontSize,5,144))fail('TEXT_SPAN_SIZE');if(span.style.fontFamily!==undefined&&!['serif','sans','kai'].includes(span.style.fontFamily))fail('COMPOSITION_FONT');if(span.style.color!==undefined)validateInk(span.style.color);}
}
export const emptyComposition = () => ({pages:[{id:'page-1',objects:[],overrides:[]}],masters:[],stories:[]});
export function validateComposition(raw) {
  keys(raw,['pages','masters','stories','sections']);
  const c=structuredClone(raw), ids=new Set();
  const take = id => { if(!ident(id)||ids.has(id)) fail('COMPOSITION_DUPLICATE_OR_INVALID_ID: '+id); ids.add(id); };
  const array=(a,max)=>{if(!Array.isArray(a)||a.length>max)fail('COMPOSITION_ARRAY_LIMIT');};
  array(c.pages,1000);array(c.masters,100);array(c.stories,1000);if(c.sections!==undefined)array(c.sections,1000);
  if(!c.pages.length)fail('COMPOSITION_NEEDS_PAGE');
  let objectCount=0;
  const object=(o,override=false)=>{
    keys(o,['id','type','x','y','width','height','rotation','locked','text','src','fontSize','lineHeight','fontFamily','color','fill','padding','overprint','spans','columns','columnGap','writingMode','align','shape','exclusions','slot']);if(!override)take(o.id);
    if(++objectCount>5000)fail('COMPOSITION_OBJECT_LIMIT');
    if(!['text','image','rect'].includes(o.type))fail('COMPOSITION_OBJECT_TYPE');
    for(const k of ['x','y'])if(!num(o[k],-450,900))fail('COMPOSITION_POSITION');
    for(const k of ['width','height'])if(!num(o[k],1,900))fail('COMPOSITION_SIZE');
    if(o.rotation!==undefined&&!num(o.rotation,-180,180))fail('COMPOSITION_ROTATION');
    if(o.locked!==undefined&&typeof o.locked!=='boolean')fail('COMPOSITION_LOCK');
    if(o.text!==undefined&&(o.type!=='text'||typeof o.text!=='string'||o.text.length>300000))fail('COMPOSITION_TEXT');
    if(o.src!==undefined&&(o.type!=='image'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(o.src)||o.src.length>7000000))fail('COMPOSITION_IMAGE');
    if(o.type==='image'&&!o.src)fail('COMPOSITION_IMAGE_REQUIRED');
    if(o.fontFamily!==undefined&&!['serif','sans','kai'].includes(o.fontFamily))fail('COMPOSITION_FONT');
    for(const k of ['color','fill'])if(o[k]!==undefined)validateInk(o[k]);
    if(o.overprint!==undefined&&(typeof o.overprint!=='boolean'||(o.overprint&&o.type==='image')))fail('COMPOSITION_OVERPRINT');
    for(const [k,min,max] of [['fontSize',5,144],['lineHeight',1,3],['padding',0,50]])if(o[k]!==undefined&&!num(o[k],min,max))fail('COMPOSITION_STYLE');
    if((o.padding||0)*2>=Math.min(o.width,o.height))fail('COMPOSITION_PADDING');
    for(const k of ['spans','columns','columnGap','writingMode','align','shape','exclusions'])if(o[k]!==undefined&&o.type!=='text')fail('TEXT_FRAME_PROPERTY');
    validateTextSpans(o.text||'',o.spans);if(o.slot!==undefined&&(o.type!=='text'||!ident(o.slot)))fail('MASTER_SLOT_NAME');
    if(o.writingMode!==undefined&&!['horizontal-tb','vertical-rl'].includes(o.writingMode))fail('WRITING_MODE');
    if(o.align!==undefined&&!['left','center','right'].includes(o.align))fail('TEXT_ALIGNMENT');
    if(o.columnGap!==undefined&&!num(o.columnGap,0,50))fail('COLUMN_GAP');
    if(o.columns!==undefined){array(o.columns,8);if(!o.columns.length||o.columns.some(x=>!num(x,.1,100)))fail('COLUMN_WEIGHTS');const inline=o.writingMode==='vertical-rl'?o.height:o.width;if(inline-2*(o.padding||0)-(o.columns.length-1)*(o.columnGap??4)<o.columns.length)fail('COLUMN_WIDTH');}
    if(o.shape!==undefined){array(o.shape,100);if(o.shape.length<3||o.shape.some(p=>!Array.isArray(p)||p.length!==2||!num(p[0],0,o.width)||!num(p[1],0,o.height)))fail('FRAME_SHAPE');}
    if(o.exclusions!==undefined){array(o.exclusions,100);for(const r of o.exclusions){keys(r,['x','y','width','height']);if(!num(r.x,-900,900)||!num(r.y,-900,900)||!num(r.width,.1,900)||!num(r.height,.1,900))fail('FRAME_EXCLUSION');}}
  };
  const checkOverrides=(overrides,bases)=>{array(overrides,5000);const seen=new Set();for(const ov of overrides){keys(ov,['objectId','hidden','patch']);if(seen.has(ov.objectId))fail('DUPLICATE_OVERRIDE');seen.add(ov.objectId);const base=bases.find(o=>o.id===ov.objectId);if(!base)fail('MASTER_OBJECT_NOT_FOUND');if(ov.hidden!==undefined&&typeof ov.hidden!=='boolean')fail('INVALID_OVERRIDE');if(ov.patch){keys(ov.patch,['x','y','width','height','rotation','text','src','fontSize','lineHeight','fontFamily','color','fill','padding','overprint','spans','columns','columnGap','writingMode','align','shape','exclusions','slot']);object({...base,...ov.patch},true);}}};
  for(const m of c.masters){keys(m,['id','name','baseMasterId','objects','overrides']);take(m.id);if(typeof m.name!=='string'||m.name.length>80)fail('MASTER_NAME');array(m.objects,5000);m.objects.forEach(o=>object(o));if(m.baseMasterId!==undefined&&!ident(m.baseMasterId))fail('MASTER_NOT_FOUND');}
  // Check unused chains too; they must not hide cycles or missing parents.
  for(const m of c.masters)masterObjects(c,m.id);
  for(const m of c.masters)checkOverrides(m.overrides||[],m.baseMasterId?masterObjects(c,m.baseMasterId):[]);
  const starts=new Set();for(const s of c.sections||[]){keys(s,['id','name','startPageId','firstMasterId','oddMasterId','evenMasterId','pageStart','numbering']);take(s.id);if(typeof s.name!=='string'||s.name.length>80)fail('SECTION_NAME');if(!c.pages.some(p=>p.id===s.startPageId)||starts.has(s.startPageId))fail('SECTION_START_PAGE');starts.add(s.startPageId);if(s.pageStart!==undefined&&(!Number.isInteger(s.pageStart)||!num(s.pageStart,1,99999)))fail('SECTION_PAGE_START');if(s.numbering!==undefined&&!['arabic','roman-lower','roman-upper','chinese'].includes(s.numbering))fail('SECTION_NUMBERING');for(const k of ['firstMasterId','oddMasterId','evenMasterId'])if(s[k]!==undefined&&s[k]!==null&&!c.masters.some(m=>m.id===s[k]))fail('MASTER_NOT_FOUND');}
  for(const p of c.pages){keys(p,['id','masterId','objects','overrides','slotContents']);take(p.id);array(p.objects,5000);p.objects.forEach(o=>object(o));p.overrides??=[];array(p.overrides,5000);
    if(p.slotContents!==undefined){array(p.slotContents,5000);const slots=new Set();for(const s of p.slotContents){keys(s,['name','text','spans']);if(!ident(s.name)||slots.has(s.name))fail('MASTER_SLOT_NAME');slots.add(s.name);if(typeof s.text!=='string'||s.text.length>300000)fail('COMPOSITION_TEXT');validateTextSpans(s.text,s.spans);}}
    if(p.masterId!==undefined&&p.masterId!==null&&!c.masters.some(m=>m.id===p.masterId))fail('MASTER_NOT_FOUND');
    const masterId=pageContext(c,p.id).masterId;checkOverrides(p.overrides,masterId?masterObjects(c,masterId):[]);
  }
  const frames=new Map(c.pages.flatMap(p=>p.objects).map(o=>[o.id,o])), assigned=new Set();
  for(const s of c.stories){keys(s,['id','name','text','frameIds','spans','blocks','notes']);take(s.id);if(typeof s.name!=='string'||s.name.length>80||typeof s.text!=='string'||s.text.length>300000)fail('STORY_TEXT');validateTextSpans(s.text,s.spans);validateRichStory(s,validateTextSpans);array(s.frameIds,5000);for(const f of s.frameIds){if(frames.get(f)?.type!=='text')fail('STORY_FRAME_NOT_FOUND');if(assigned.has(f))fail('FRAME_ALREADY_THREADED');if(frames.get(f).text||frames.get(f).spans?.length||frames.get(f).slot)fail('THREADED_FRAME_CANNOT_OWN_TEXT');assigned.add(f);}if(s.blocks)validateRichFrames(s.frameIds.map(id=>frames.get(id)));}
  return c;
}
const overridden=(objects,overrides=[])=>objects.flatMap(o=>{const ov=overrides.find(x=>x.objectId===o.id);return ov?.hidden?[]:[{...o,...ov?.patch}];});
export function masterObjects(c,masterId,ancestors=new Set()) {
  if(ancestors.has(masterId))fail('MASTER_INHERITANCE_CYCLE');
  const master=c.masters.find(m=>m.id===masterId);if(!master)fail('MASTER_NOT_FOUND');
  const chain=new Set(ancestors);chain.add(masterId);
  return [...overridden(master.baseMasterId?masterObjects(c,master.baseMasterId,chain):[],master.overrides),...master.objects];
}
export function pageContext(c,pageId) {
  const index=c.pages.findIndex(p=>p.id===pageId);if(index<0)fail('PAGE_NOT_FOUND');
  const section=(c.sections||[]).map(s=>({...s,start:c.pages.findIndex(p=>p.id===s.startPageId)})).filter(s=>s.start>=0&&s.start<=index).sort((a,b)=>b.start-a.start)[0];
  const sectionPage=section?index-section.start+1:index+1;
  // Odd/even rules use physical recto/verso, not the printed page-number offset.
  let masterId=section?.[index%2===0?'oddMasterId':'evenMasterId'];
  if(sectionPage===1&&section?.firstMasterId!==undefined)masterId=section.firstMasterId;
  if(c.pages[index].masterId!==undefined)masterId=c.pages[index].masterId;
  return {index,section,sectionPage,masterId};
}
export function compositionRichText(doc,pageId,text,spans=[]) {
  const context=pageContext(doc.composition,pageId);
  const numbered=(doc.composition.sections||[]).map(s=>({...s,start:doc.composition.pages.findIndex(p=>p.id===s.startPageId)})).filter(s=>s.pageStart!==undefined&&s.start<=context.index).sort((a,b)=>b.start-a.start)[0];
  const n=numbered?numbered.pageStart+context.index-numbered.start:doc.layout.pageStart+context.index;
  const values={page:formatPageNumber(n,context.section?.numbering),physicalPage:String(context.index+1),title:doc.title,section:context.section?.name||'',sectionPage:String(context.sectionPage)};
  let result='',ranges=[],cursor=0;
  const append=(from,to,replacement)=>{const offset=result.length,piece=replacement??text.slice(from,to);result+=piece;
    if(replacement!==undefined){const style=spans.find(s=>s.start<=from&&s.end>from)?.style;if(style&&piece.length)ranges.push({start:offset,end:result.length,style});}
    else for(const span of spans){const l=Math.max(from,span.start),r=Math.min(to,span.end);if(r>l)ranges.push({start:offset+l-from,end:offset+r-from,style:span.style});}
  };
  for(const match of text.matchAll(/\{(page|physicalPage|title|section|sectionPage)\}/g)){append(cursor,match.index);append(match.index,match.index+match[0].length,values[match[1]]);cursor=match.index+match[0].length;}
  append(cursor,text.length);return {text:result,spans:ranges};
}
export function compositionText(doc,pageId,text){return compositionRichText(doc,pageId,text).text;}
export function formatPageNumber(n,format='arabic'){
 if(format==='chinese'){const chars='零一二三四五六七八九',group=n=>{let out='',zero=false;for(let i=3;i>=0;i--){const power=10**i,d=Math.floor(n/power)%10;if(d){if(zero)out+='零';out+=chars[d]+['','十','百','千'][i];zero=false;}else if(out)zero=true;}return out;};const high=Math.floor(n/10000),low=n%10000;return ((high?group(high)+'万'+(low&&low<1000?'零':''):'')+group(low)).replace(/^一十/,'十')||'零';}
 if(format==='roman-lower'||format==='roman-upper'){if(n>3999)return String(n);let result='';for(const [value,glyph] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])while(n>=value){result+=glyph;n-=value;}return format==='roman-lower'?result.toLowerCase():result;}
 return String(n);
}
export function pageObjects(c,pageId) {
  const p=c.pages.find(p=>p.id===pageId);if(!p)fail('PAGE_NOT_FOUND');
  const {masterId}=pageContext(c,pageId);
  return [...overridden(masterId?masterObjects(c,masterId):[],p.overrides).map(o=>({...o,masterObject:true})),...p.objects].map(o=>{const content=o.slot&&(p.slotContents||[]).find(s=>s.name===o.slot);return content?{...o,text:content.text,spans:content.spans||[]}:o;});
}
export function applyCompositionOperation(doc,op) {
  const c=structuredClone(doc.composition||emptyComposition());
  const get=(a,id,label)=>a.find(x=>x.id===id)||fail(label+'_NOT_FOUND');
  const upsert=(a,x)=>{const i=a.findIndex(v=>v.id===x.id);if(i<0)a.push(structuredClone(x));else a[i]=structuredClone(x);};
  const page=id=>get(c.pages,id,'PAGE');
  const owner=()=>{if(!!op.masterId===!!op.pageId)fail('EXACTLY_ONE_FRAME_OWNER_REQUIRED');return op.masterId?get(c.masters,op.masterId,'MASTER'):page(op.pageId);};
  switch(op.op){
    case 'set_composition':doc.composition=validateComposition(op.composition);doc.version=3;return;
    case 'upsert_page':upsert(c.pages,op.page);break;
    case 'delete_page':{const p=page(op.pageId);if(c.sections?.some(s=>s.startPageId===p.id))fail('SECTION_START_PAGE_IN_USE');const removed=p.objects.map(o=>o.id);c.pages=c.pages.filter(x=>x.id!==p.id);for(const s of c.stories)s.frameIds=s.frameIds.filter(id=>!removed.includes(id));break;}
    case 'move_page':{const p=page(op.pageId);if(!Number.isInteger(op.index)||op.index<0||op.index>=c.pages.length)fail('PAGE_INDEX');c.pages=c.pages.filter(x=>x!==p);c.pages.splice(op.index,0,p);break;}
    case 'upsert_master':upsert(c.masters,op.master);break;
    case 'delete_master':if(c.pages.some(p=>p.masterId===op.masterId)||c.masters.some(m=>m.baseMasterId===op.masterId)||c.sections?.some(s=>['firstMasterId','oddMasterId','evenMasterId'].some(k=>s[k]===op.masterId)))fail('MASTER_IN_USE');get(c.masters,op.masterId,'MASTER');c.masters=c.masters.filter(m=>m.id!==op.masterId);break;
    case 'assign_master':{const p=page(op.pageId);p.masterId=op.inherit?undefined:op.masterId;p.overrides=[];break;}
    case 'upsert_section':c.sections??=[];upsert(c.sections,op.section);break;
    case 'set_slot_content':{const p=page(op.pageId);p.slotContents=(p.slotContents||[]).filter(s=>s.name!==op.name);if(!op.reset)p.slotContents.push({name:op.name,text:op.text??'',spans:op.spans||[]});break;}
    case 'master_from_page':{if(c.masters.some(m=>m.id===op.newMasterId))fail('MASTER_ALREADY_EXISTS');const p=page(op.pageId);if(c.stories.some(s=>s.frameIds.some(id=>p.objects.some(o=>o.id===id))))fail('THREADED_PAGE_REQUIRES_SNAPSHOT');const objects=pageObjects(c,p.id).map(({masterObject,...o})=>({...o,id:'f-'+crypto.randomUUID()}));c.masters.push({id:op.newMasterId,name:op.name,objects});break;}
    case 'align_section_start':{const s=get(c.sections||[],op.sectionId,'SECTION'),at=c.pages.findIndex(p=>p.id===s.startPageId);if(!['left','right'].includes(op.side))fail('SECTION_SIDE');if(at%2!==(op.side==='right'?0:1))c.pages.splice(at,0,{id:'p-'+crypto.randomUUID(),masterId:null,objects:[],overrides:[]});break;}
    case 'delete_section':get(c.sections||[],op.sectionId,'SECTION');c.sections=c.sections.filter(s=>s.id!==op.sectionId);break;
    case 'override_master_object':{const p=owner();p.overrides=(p.overrides||[]).filter(o=>o.objectId!==op.objectId);if(!op.reset)p.overrides.push({objectId:op.objectId,...(op.patch?{patch:op.patch}:{}),...(op.hidden!==undefined?{hidden:op.hidden}:{})});break;}
    case 'upsert_frame':{const p=owner(),existing=p.objects.find(o=>o.id===op.frame.id);if(existing?.locked)fail('OBJECT_LOCKED');upsert(p.objects,op.frame);break;}
    case 'set_frame_lock':get(owner().objects,op.frameId,'FRAME').locked=op.locked;break;
    case 'delete_frame':{const p=owner(),f=get(p.objects,op.frameId,'FRAME');if(f.locked)fail('OBJECT_LOCKED');p.objects=p.objects.filter(o=>o.id!==f.id);for(const s of c.stories)s.frameIds=s.frameIds.filter(id=>id!==f.id);if(op.masterId)for(const p of [...c.pages,...c.masters])if(p.overrides)p.overrides=p.overrides.filter(o=>o.objectId!==f.id);break;}
    case 'story_table_set_cell':case 'story_table_merge':case 'story_table_split':case 'story_table_resize':{
      const story=get(c.stories,op.storyId,'STORY'),b=get(story.blocks||[],op.blockId,'STORY_BLOCK');if(b.type!=='table')fail('NOT_A_TABLE');
      if(op.op==='story_table_set_cell'){if(b.rows[op.row]?.[op.col]===undefined)fail('CELL_NOT_FOUND');b.rows[op.row][op.col]=op.text;}
      if(op.op==='story_table_merge')Object.assign(b,mergeCells(b,op.range));
      if(op.op==='story_table_split')Object.assign(b,splitCell(b,op.row,op.col));
      if(op.op==='story_table_resize')Object.assign(b,resizeTable(b,op.axis,op.index,op.remove));break;
    }
    case 'story_update_paragraph':{const b=get(get(c.stories,op.storyId,'STORY').blocks||[],op.blockId,'STORY_BLOCK');if(b.type!=='paragraph')fail('NOT_A_PARAGRAPH');b.spans=rebaseTextSpans(b.text,op.text,b.spans);b.text=op.text;break;}
    case 'story_update_note':{const n=get(get(c.stories,op.storyId,'STORY').notes||[],op.noteId,'STORY_NOTE');n.text=op.text;if(op.kind)n.kind=op.kind;break;}
    case 'upsert_story':upsert(c.stories,op.story);break;
    case 'thread_frames':get(c.stories,op.storyId,'STORY').frameIds=op.frameIds;break;
    case 'split_story':{const s=get(c.stories,op.storyId,'STORY');if(s.blocks)fail('RICH_SPLIT_REQUIRES_BLOCK_BOUNDARY');const at=s.frameIds.indexOf(op.frameId);if(at<0)fail('STORY_FRAME_NOT_FOUND');const boundaries=new Set([s.text.length,...[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(s.text)].map(x=>x.index)]);if(!boundaries.has(op.offset))fail('INVALID_GRAPHEME_BOUNDARY');c.stories.push({id:op.newStoryId,name:s.name+'（续）',text:s.text.slice(op.offset),spans:(s.spans||[]).filter(r=>r.end>op.offset).map(r=>({...r,start:Math.max(0,r.start-op.offset),end:r.end-op.offset})),frameIds:s.frameIds.slice(at)});s.spans=(s.spans||[]).filter(r=>r.start<op.offset).map(r=>({...r,end:Math.min(r.end,op.offset)}));s.text=s.text.slice(0,op.offset);s.frameIds=s.frameIds.slice(0,at);break;}
    default:fail('UNKNOWN_COMPOSITION_OPERATION');
  }
  if(['move_page','delete_page','upsert_section','delete_section','align_section_start'].includes(op.op))for(const p of c.pages){const masterId=pageContext(c,p.id).masterId,ids=new Set(masterId?masterObjects(c,masterId).map(o=>o.id):[]);p.overrides=(p.overrides||[]).filter(o=>ids.has(o.objectId));}
  doc.composition=validateComposition(c);doc.version=3;
}

