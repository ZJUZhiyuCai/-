import {DOMParser} from '@xmldom/xmldom';
const NS='http://www.founder.com/PDMLSchema/2009/main';
const attrs=n=>Object.fromEntries(Array.from(n.attributes||[],a=>[a.name,a.value]));
const children=(n,name)=>Array.from(n.childNodes||[]).filter(c=>c.nodeType===1&&c.namespaceURI===NS&&(!name||c.localName===name));
const descendants=(n,name)=>Array.from(n.getElementsByTagNameNS(NS,name));
function objectRecord(n) {
 const geometry=attrs(descendants(n,'basicObjFmt')[0]||{}),values=['xPos','yPos','width','height'].map(k=>geometry[k]!==undefined&&geometry[k].trim()!==''?Number(geometry[k]):NaN);
 const [x,y,w,h]=values,valid=values.every(Number.isFinite)&&w>=0&&h>=0;
 return {type:n.localName,attributes:attrs(n),geometry,
  coordinateSpace:'pasteboard-mm',canvasBounds:valid?[x-w/2,y-h/2,x+w/2,y+h/2]:null,
  flowRanges:children(n,'flowRange').map(attrs),imageReferences:children(n,'image').map(attrs)};
}

// An observed-schema inspector, not a lossy importer or a native-file writer.
// XML is never executed; file references are reported without being fetched.
export function inspectFounderPdml(xml,{offset=0,limit=50}={}) {
 const {root,all,uids,diagnostics,counts}=parseFounderPdml(xml);
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('PDML_PAGE_RANGE');
 return inspection(root,all,uids,diagnostics,counts,offset,limit);
}
export function parseFounderPdml(xml) {
 if(typeof xml!=='string'||xml.length>2_000_000)throw Error('PDML_XML_LIMIT');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('PDML_DTD_FORBIDDEN');
 if((xml.match(/</g)||[]).length>100_000)throw Error('PDML_NODE_LIMIT');
 const d=new DOMParser({onError:(level,message)=>{throw Error('PDML_XML_INVALID: '+message);}}).parseFromString(xml,'application/xml');
 const root=d.documentElement;if(root?.namespaceURI!==NS||root.localName!=='docRoot')throw Error('PDML_ROOT_UNSUPPORTED');
 const counts=Object.create(null),uids=new Map(),diagnostics=[],all=[],stack=[[root,0]];
 while(stack.length){const [n,depth]=stack.pop();if(depth>100)throw Error('PDML_DEPTH_LIMIT');if(all.length>=50_000)throw Error('PDML_NODE_LIMIT');all.push(n);const tag=n.namespaceURI===NS?n.localName:`{${n.namespaceURI}}${n.localName}`;counts[tag]=(counts[tag]||0)+1;
  const uid=n.getAttribute('uid');if(uid){if(uids.has(uid))diagnostics.push({code:'DUPLICATE_UID',uid});else uids.set(uid,n);}
  const elements=Array.from(n.childNodes||[]).filter(c=>c.nodeType===1);for(let i=elements.length-1;i>=0;i--)stack.push([elements[i],depth+1]);
 }
 return {document:d,root,all,uids,diagnostics,counts};
}
function inspection(root,all,uids,diagnostics,counts,offset,limit) {
 const pageSetting=descendants(root,'pageSetting')[0],objects=all.filter(n=>n.namespaceURI===NS&&['textItem','imageItem','graphicsItem'].includes(n.localName));
 const pages=descendants(root,'page'),masters=descendants(root,'masterSpread'),articles=children(root,'article');
 for(const n of pages)if(!n.hasAttribute('pageRect'))diagnostics.push({code:'PAGE_ORIGIN_UNVERIFIED',uid:n.getAttribute('uid')||null,master:n.parentNode.localName==='masterSpread'});
 for(const n of objects){const article=n.getAttribute('parentArticle'),next=n.getAttribute('nextItem');if(article&&!uids.has(article))diagnostics.push({code:'MISSING_ARTICLE',uid:n.getAttribute('uid'),reference:article});if(next&&!uids.has(next))diagnostics.push({code:'MISSING_NEXT_ITEM',uid:n.getAttribute('uid'),reference:next});}
 const features=['bezierShape','shadow','transparencyEffect','gradColor','table','equation','textVariable','transMatrix'].filter(t=>counts[t]);
 for(const feature of features)diagnostics.push({code:'NATIVE_RENDERING_NOT_IMPLEMENTED',feature,count:counts[feature]});
 const pageRecord=n=>({attributes:attrs(n),owner:n.parentNode.localName,ownerId:n.parentNode.getAttribute('uid'),hasExplicitPageRect:n.hasAttribute('pageRect')});
 return {format:'Founder PDML XML',version:root.getAttribute('version'),publicationType:root.getAttribute('publicationType'),namespace:NS,
  compatibility:{inspection:true,editableImport:false,nativeExport:false,referenceApplicationVerified:false},
  pageSetting:pageSetting?attrs(pageSetting):null,counts,
  totals:{pages:pages.filter(n=>n.parentNode.localName==='spread').length,masterPages:pages.filter(n=>n.parentNode.localName==='masterSpread').length,masters:masters.length,objects:objects.length,articles:articles.length},
  offset,limit,pages:pages.slice(offset,offset+limit).map(pageRecord),masters:masters.slice(offset,offset+limit).map(n=>({attributes:attrs(n),objects:children(n).filter(c=>['textItem','imageItem','graphicsItem'].includes(c.localName)).map(o=>o.getAttribute('uid'))})),
  objects:objects.slice(offset,offset+limit).map(objectRecord),
  articles:articles.slice(offset,offset+limit).map(n=>({uid:n.getAttribute('uid'),paragraphs:children(n,'p').length,textCharacters:descendants(n,'t').reduce((a,t)=>a+(t.textContent||'').length,0),preferences:attrs(children(n,'articlePref')[0]||{})})),
  fontNames:[...new Set(descendants(root,'activeFont').map(n=>n.getAttribute('fontName')))].sort(),
  diagnostics:diagnostics.slice(0,200),diagnosticTotal:diagnostics.length,
  limitations:['此结果是结构检查，不会导入、修改或保存原文件','缺失 pageRect 时不猜测默认纸板原点','未访问图片、字体或外部文件引用；未验证版面与飞翔一致'],
 };
}
