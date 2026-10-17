import {parseFounderPdml,inspectFounderPdml} from './founder-pdml.mjs';
import {validateComposition} from '../public/editor/src/composition.mjs';

const NS='http://www.founder.com/PDMLSchema/2009/main';
const child=(n,name)=>Array.from(n?.childNodes||[]).filter(c=>c.nodeType===1&&c.namespaceURI===NS&&(!name||c.localName===name));
const below=(n,name)=>Array.from(n.getElementsByTagNameNS(NS,name));
const attrs=n=>Object.fromEntries(Array.from(n?.attributes||[],a=>[a.name,a.value]));
const fail=code=>{throw Error(code);};
const compatibility={preservingXmlEdit:true,editableCompositionSubset:true,ffxReadWrite:false,referenceApplicationVerified:false};
const encoder=new TextEncoder();
export async function founderPdmlHash(xml){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(xml))),b=>b.toString(16).padStart(2,'0')).join('');}
const checkText=s=>{if(typeof s!=='string'||s.length>300000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s))fail('PDML_TEXT_INVALID');};
const escapeText=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r/g,'&#13;');
const escapeAttr=(s,q)=>escapeText(s).replace(/\n/g,'&#10;').replace(/\t/g,'&#9;').replace(q==='"'?/"/g:/'/g,q==='"'?'&quot;':'&apos;');
const index=(n,max)=>{if(!Number.isInteger(n)||n<0||n>=max)fail('PDML_INDEX_RANGE');return n;};
const signature=s=>[Array.from(s,c=>c.length).join(':'),Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(s),g=>g.index).join(':')].join('|');
const styleRecords=n=>['basicCharFmt','basicParaFmt','activeFont'].flatMap(element=>below(n,element).map((e,elementIndex)=>({element,elementIndex,attributes:attrs(e)})));

// Offsets come from a lexical scan of already validated XML. Re-serializing the
// DOM would normalize CDATA, prefixes and attribute quoting in unknown records.
function sourceIndex(xml,all){
 const records=new Map(),stack=[];let cursor=0,pos=0;
 // A quoted > is legal, so use a small quote-aware tag scanner after recognizing <.
 while((pos=xml.indexOf('<',pos))!==-1){
  if(xml.startsWith('<!--',pos)){pos=xml.indexOf('-->',pos)+3;continue;}
  if(xml.startsWith('<![CDATA[',pos)){pos=xml.indexOf(']]>',pos)+3;continue;}
  if(xml.startsWith('<?',pos)){pos=xml.indexOf('?>',pos)+2;continue;}
  let end=pos+1,quote=null;
  for(;end<xml.length;end++){const c=xml[end];if(quote){if(c===quote)quote=null;}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
  if(end===xml.length)fail('PDML_SOURCE_INDEX');
  const tag=xml.slice(pos,end+1),closing=tag.startsWith('</'),name=/^<\/?([^\s/>]+)/.exec(tag)?.[1];
  if(closing){const r=stack.pop();if(!r||r.node.tagName!==name)fail('PDML_SOURCE_INDEX');r.closeStart=pos;r.end=end+1;}
  else{const node=all[cursor++];if(!node||node.tagName!==name)fail('PDML_SOURCE_INDEX');const selfClosing=/\/\s*>$/.test(tag),r={node,start:pos,tagEnd:end+1,closeStart:selfClosing?end+1:null,end:selfClosing?end+1:null,selfClosing};records.set(node,r);if(!selfClosing)stack.push(r);}
  pos=end+1;
 }
 if(cursor!==all.length||stack.length)fail('PDML_SOURCE_INDEX');return records;
}
function context(xml){const parsed=parseFounderPdml(xml);if(parsed.diagnostics.some(d=>d.code==='DUPLICATE_UID'))fail('PDML_DUPLICATE_UID_EDIT_UNSAFE');return {...parsed,source:sourceIndex(xml,parsed.all)};}
function articleNodes(root){return child(root,'article');}
function paragraphRecords(article){return child(article,'p').map((p,paragraphIndex)=>({paragraphIndex,attributes:attrs(p),texts:below(p,'t').map((t,textIndex)=>({textIndex,text:t.textContent||'',attributes:attrs(t)}))}));}

export async function openFounderPdml(xml,{offset=0,limit=50}={}){
 const c=context(xml),inspection=inspectFounderPdml(xml,{offset,limit});
 return {format:'Founder PDML preserving edit',sourceHash:await founderPdmlHash(xml),compatibility,
  articles:articleNodes(c.root).slice(offset,offset+limit).map(a=>({uid:a.getAttribute('uid'),preferences:attrs(child(a,'articlePref')[0]),paragraphs:paragraphRecords(a),styles:styleRecords(a)})),
  objects:inspection.objects,pages:inspection.pages,totals:inspection.totals,diagnostics:inspection.diagnostics,
  limitations:['未知 XML 及未改动片段逐字保留；未访问外部文件','文字修改保持各码点 UTF-16 宽度与字素边界，拒绝未经验证的原生锚点位移','保留的 flowRange 不代表修改后的断行结果；排版重算及飞翔打开/保存仍未通过原应用验收']};
}

export async function editFounderPdml(xml,{expectedHash,operations}={}){
 const c=context(xml),beforeHash=await founderPdmlHash(xml);if(typeof expectedHash!=='string'||expectedHash!==beforeHash)fail('PDML_SOURCE_CONFLICT');
 if(!Array.isArray(operations)||operations.length>1000)fail('PDML_OPERATIONS_LIMIT');
 const patches=[],changes=[];
 const uid=(id,type)=>{const n=c.uids.get(id);if(!n||n.namespaceURI!==NS||(type&&!type.includes(n.localName)))fail('PDML_TARGET_NOT_FOUND');return n;};
 const patchAttribute=(node,name,value)=>{
  if(!node.hasAttribute(name))fail('PDML_ATTRIBUTE_NOT_OBSERVED');
  if(node.getAttribute(name)===value)return;
  const r=c.source.get(node),tag=xml.slice(r.start,r.tagEnd),re=/([^\s=<>/'"]+)\s*=\s*(["'])([\s\S]*?)\2/g;let match;
  while((match=re.exec(tag))){if(match[1]!==name)continue;const valueAt=match.index+match[0].indexOf(match[2])+1;patches.push({start:r.start+valueAt,end:r.start+valueAt+match[3].length,text:escapeAttr(value,match[2])});return;}
  fail('PDML_SOURCE_ATTRIBUTE');
 };
 for(const op of operations){
  if(!op||typeof op!=='object')fail('PDML_OPERATION');
  if(op.op==='replace_text'){
   const article=uid(op.articleId,['article']);if(article.parentNode!==c.root)fail('PDML_TARGET_NOT_FOUND');const ps=child(article,'p'),p=ps[index(op.paragraphIndex,ps.length)],ts=below(p,'t'),t=ts[index(op.textIndex,ts.length)],old=t.textContent||'';
   if(op.expectedText!==old)fail('PDML_TEXT_CONFLICT');checkText(op.text);
   if(signature(op.text)!==signature(old))fail('PDML_NATIVE_ANCHOR_LENGTH_CHANGE_UNVERIFIED');
   if(op.text!==old){if(Array.from(t.childNodes||[]).some(n=>![3,4].includes(n.nodeType)))fail('PDML_TEXT_STRUCTURE_UNSUPPORTED');const r=c.source.get(t);if(r.selfClosing)fail('PDML_EMPTY_TEXT_STRUCTURE');patches.push({start:r.tagEnd,end:r.closeStart,text:escapeText(op.text)});}
   changes.push({op:op.op,articleId:op.articleId,paragraphIndex:op.paragraphIndex,textIndex:op.textIndex});
  }else if(op.op==='set_geometry'){
   const obj=uid(op.objectId,['textItem','imageItem','graphicsItem']),fmt=child(child(obj,'oPr')[0],'basicObjFmt')[0];if(!fmt)fail('PDML_GEOMETRY_NOT_OBSERVED');
   if(!op.patch||Object.keys(op.patch).length===0||Object.keys(op.patch).some(k=>!['xPos','yPos','width','height'].includes(k)))fail('PDML_GEOMETRY_PATCH');
   for(const [key,value]of Object.entries(op.patch)){if(!Number.isFinite(value)||Math.abs(value)>100000||(['width','height'].includes(key)&&value<=0))fail('PDML_GEOMETRY_RANGE');patchAttribute(fmt,key,String(value));}
   changes.push({op:op.op,objectId:op.objectId});
  }else if(op.op==='set_style'){
   const owner=uid(op.ownerId),allowed={basicCharFmt:['fontSize'],basicParaFmt:['align'],activeFont:['fontName']};if(!Object.hasOwn(allowed,op.element)||!allowed[op.element].includes(op.attribute))fail('PDML_STYLE_UNSUPPORTED');
   const nodes=below(owner,op.element),node=nodes[index(op.elementIndex,nodes.length)];if(node.getAttribute(op.attribute)!==op.expectedValue)fail('PDML_STYLE_CONFLICT');checkText(op.value);if(op.value.length>255)fail('PDML_STYLE_VALUE');
   if(op.attribute==='fontSize'){const m=/^\((\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\)$/.exec(op.value);if(!m||m.slice(1).some(n=>Number(n)<=0||Number(n)>1000))fail('PDML_STYLE_VALUE');}
   if(op.attribute==='align'&&!['left','center','right','leftJustify','rightJustify','centerJustify','fullJustify'].includes(op.value))fail('PDML_STYLE_VALUE');
   patchAttribute(node,op.attribute,op.value);changes.push({op:op.op,ownerId:op.ownerId,element:op.element,elementIndex:op.elementIndex,attribute:op.attribute});
  }else fail('PDML_OPERATION_UNSUPPORTED');
 }
 patches.sort((a,b)=>a.start-b.start);for(let i=1;i<patches.length;i++)if(patches[i].start<patches[i-1].end||(patches[i].start===patches[i-1].start))fail('PDML_OVERLAPPING_EDITS');
 let output='',cursor=0;for(const p of patches){output+=xml.slice(cursor,p.start)+p.text;cursor=p.end;}output+=xml.slice(cursor);parseFounderPdml(output);
 return {xml:output,sourceHash:await founderPdmlHash(output),previousHash:beforeHash,changed:patches.length>0,patchCount:patches.length,changes,compatibility};
}

// This is a strict, explicitly positioned plain-text subset. It rejects features
// it cannot render instead of silently dropping native objects or guessing origins.
export async function importFounderPdmlComposition(xml){
 const c=context(xml),composition={pages:[],masters:[],stories:[]},mapping=[],diagnostics=[];
 if(below(c.root,'masterSpread').length)fail('PDML_COMPOSITION_MASTERS_UNSUPPORTED');
 for(const tag of ['imageItem','graphicsItem','groupItem','table','equation','textVariable','transMatrix','bezierShape','shadow','transparencyEffect','gradColor'])if(below(c.root,tag).length)fail('PDML_COMPOSITION_FEATURE_UNSUPPORTED: '+tag);
 const spreads=below(c.root,'spread'),articles=new Map(articleNodes(c.root).map(a=>[a.getAttribute('uid'),a])),used=new Set();let width=null,height=null;
 for(const spread of spreads){const pages=child(spread,'page');if(pages.length!==1)fail('PDML_COMPOSITION_SPREAD_UNSUPPORTED');const page=pages[0],rect=/^\(\s*([-+\d.eE]+)\s*,\s*([-+\d.eE]+)\s*,\s*([-+\d.eE]+)\s*,\s*([-+\d.eE]+)\s*\)$/.exec(page.getAttribute('pageRect')||'')?.slice(1).map(Number);
  if(!rect||!rect.every(Number.isFinite)||rect[2]<=rect[0]||rect[3]<=rect[1])fail('PDML_PAGE_ORIGIN_UNVERIFIED');const w=rect[2]-rect[0],h=rect[3]-rect[1];if(w<100||w>320||h<140||h>450)fail('PDML_COMPOSITION_PAGE_SIZE_UNSUPPORTED');if(width!==null&&(w!==width||h!==height))fail('PDML_COMPOSITION_PAGE_SIZE_MIXED');width=w;height=h;
  if(page.getAttribute('appliedMaster')&&!['none','ms_0'].includes(page.getAttribute('appliedMaster')))fail('PDML_COMPOSITION_MASTERS_UNSUPPORTED');
  const outPage={id:'pdml-page-'+composition.pages.length,objects:[],overrides:[]};composition.pages.push(outPage);
  for(const item of child(spread,'textItem')){
   if(!item.getAttribute('uid'))fail('PDML_COMPOSITION_OBJECT_UID_REQUIRED');if(item.getAttribute('nextItem'))fail('PDML_COMPOSITION_THREAD_UNSUPPORTED');const articleId=item.getAttribute('parentArticle'),article=articles.get(articleId);if(!article||used.has(articleId))fail('PDML_COMPOSITION_ARTICLE_UNSUPPORTED');used.add(articleId);
   const ps=child(article,'p');if(ps.length!==1||child(ps[0],'r').length!==1||below(ps[0],'t').length!==1)fail('PDML_COMPOSITION_RICH_TEXT_UNSUPPORTED');const t=below(ps[0],'t')[0];
   const pref=child(article,'articlePref')[0];if(pref&&pref.getAttribute('textDirection')&&pref.getAttribute('textDirection')!=='forwardHorizontal')fail('PDML_COMPOSITION_DIRECTION_UNSUPPORTED');
   const fmt=child(child(item,'oPr')[0],'basicObjFmt')[0],g=attrs(fmt),values=['xPos','yPos','width','height'].map(k=>Number(g[k]));if(!fmt||values.some(v=>!Number.isFinite(v))||values.slice(2).some(v=>v<=0))fail('PDML_COMPOSITION_GEOMETRY_UNSUPPORTED');
   // Styles need an explicit user font mapping and native inheritance resolver.
   // Reject rather than replacing a native face/size with our default silently.
   if(below(article,'basicCharFmt').length||below(article,'basicParaFmt').length||pref?.getAttribute('appliedParaStyle'))fail('PDML_COMPOSITION_STYLE_UNSUPPORTED');
   const permitted=(n,names)=>child(n).every(e=>names.includes(e.localName));
   if(!permitted(article,['articlePref','p'])||!permitted(pref,[])||!permitted(ps[0],['r'])||!permitted(child(ps[0],'r')[0],['t'])||!permitted(t,[])||!permitted(item,['flowRange','oPr'])||!permitted(child(item,'oPr')[0],['basicObjFmt'])||!permitted(fmt,[])||Object.keys(g).some(k=>!['xPos','yPos','width','height'].includes(k)))fail('PDML_COMPOSITION_CONTENT_UNSUPPORTED');
   const [x,y,fw,fh]=values,frame={id:'pdml-frame-'+mapping.length,type:'text',x:x-fw/2-rect[0],y:y-fh/2-rect[1],width:fw,height:fh,text:t.textContent||'',fontSize:12,lineHeight:1.5,padding:0};outPage.objects.push(frame);
   mapping.push({frameId:frame.id,pageId:outPage.id,objectId:item.getAttribute('uid'),articleId,paragraphIndex:0,textIndex:0,pageOrigin:rect.slice(0,2),originalFrame:structuredClone(frame)});
  }
 }
 if(!composition.pages.length)fail('PDML_COMPOSITION_NO_PAGES');
 if(mapping.length!==below(c.root,'textItem').length)fail('PDML_COMPOSITION_NESTED_FRAME_UNSUPPORTED');
 diagnostics.push({code:'PLAIN_TEXT_PREVIEW_DEFAULT_STYLE',fontSize:12,lineHeight:1.5,detail:'原文未显式指定字号/字体，本工具预览使用 12 pt 默认字体；不代表飞翔样式等效。'});
 return {composition:validateComposition(composition),pageSize:{width,height},sourceHash:await founderPdmlHash(xml),mapping,diagnostics,compatibility};
}

export async function exportFounderPdmlComposition(xml,{expectedHash,composition}={}){
 const imported=await importFounderPdmlComposition(xml);if(imported.sourceHash!==expectedHash)fail('PDML_SOURCE_CONFLICT');const next=validateComposition(composition);
 if(next.masters.length||next.stories.length||next.sections?.length||next.pages.length!==imported.composition.pages.length)fail('PDML_COMPOSITION_STRUCTURE_CHANGE_UNSUPPORTED');
 const operations=[];
 for(let i=0;i<next.pages.length;i++){const page=next.pages[i],original=imported.composition.pages[i];if(page.id!==original.id||page.objects.length!==original.objects.length||page.masterId||page.overrides?.length||page.slotContents?.length)fail('PDML_COMPOSITION_STRUCTURE_CHANGE_UNSUPPORTED');
  for(let j=0;j<page.objects.length;j++){const frame=page.objects[j],m=imported.mapping.find(m=>m.frameId===frame.id),base=original.objects[j];if(!m||frame.id!==base.id)fail('PDML_COMPOSITION_STRUCTURE_CHANGE_UNSUPPORTED');
   const changed=Object.keys({...base,...frame}).filter(k=>JSON.stringify(base[k])!==JSON.stringify(frame[k]));if(changed.some(k=>!['x','y','width','height','text'].includes(k)))fail('PDML_COMPOSITION_STYLE_WRITE_UNSUPPORTED');
   if(changed.includes('text'))operations.push({op:'replace_text',articleId:m.articleId,paragraphIndex:0,textIndex:0,expectedText:base.text,text:frame.text||''});
   if(changed.some(k=>['x','y','width','height'].includes(k)))operations.push({op:'set_geometry',objectId:m.objectId,patch:{xPos:frame.x+frame.width/2+m.pageOrigin[0],yPos:frame.y+frame.height/2+m.pageOrigin[1],width:frame.width,height:frame.height}});
  }
 }
 return editFounderPdml(xml,{expectedHash,operations});
}
