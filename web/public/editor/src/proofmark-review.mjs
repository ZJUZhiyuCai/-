// Review-only bridge. No document mutation, network fetch or executable operation.
export const LIMITS=Object.freeze({packetBytes:2*1024*1024,imageBytes:12*1024*1024,assets:32,candidates:200,pixels:30_000_000,dimension:12000});
const fail=message=>{throw Error(message);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const str=(value,label,max=8000)=>typeof value==='string'&&value.length<=max?value:fail(`${label}格式或长度不正确`);
const id=value=>str(value,'标识',120)||fail('标识不能为空');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?value:fail('原图 SHA-256 不正确');
const list=(value,label,max)=>Array.isArray(value)&&value.length<=max?value:fail(`${label}数量不正确`);
function box(value){if(!Array.isArray(value)||value.length!==4||value.some(x=>!Number.isFinite(x)||x<0||x>1)||value[0]>=value[2]||value[1]>=value[3])fail('批注坐标必须是 0–1 范围内的有效矩形');return [...value];}
export const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?new TextEncoder().encode(bytes):bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export const canonical=value=>JSON.stringify(value,(_key,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);

export function parseReviewPacket(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>LIMITS.packetBytes)fail('识别结果不得超过 2 MiB');
 const source=JSON.parse(text);
 if(!object(source)||source.schema_version!=='proofmark-review/0.2'||source.packet_kind!=='review_draft'||source.executable!==false)fail('仅支持不可执行的 proofmark-review/0.2 待审结果');
 id(source.batch_id);
 const assets=list(source.assets,'原图',LIMITS.assets).map(a=>{
  if(!object(a))fail('原图格式不正确');
  if(!Number.isInteger(a.width_px)||!Number.isInteger(a.height_px)||a.width_px<1||a.height_px<1||a.width_px>LIMITS.dimension||a.height_px>LIMITS.dimension||a.width_px*a.height_px>LIMITS.pixels)fail('原图尺寸超出限制');
  const segments=list(a.page_segments,'页面区域',100).map(s=>({id:id(s.id),bbox:box(s.bbox)}));
  if(new Set(segments.map(s=>s.id)).size!==segments.length)fail('页面区域标识重复');
  return {id:id(a.id),sha256:hash(a.sha256),width:a.width_px,height:a.height_px,name:str(a.original_filename??a.id,'文件名',300),segments};
 });
 if(!assets.length||new Set(assets.map(a=>a.id)).size!==assets.length)fail('原图标识为空或重复');
 const items=list(source.candidates,'批注',LIMITS.candidates).map(c=>{
  if(!object(c)||!object(c.evidence)||!object(c.target)||!object(c.interpretation)||!object(c.action))fail('批注结构不完整');
  const e=c.evidence,a=assets.find(a=>a.id===e.asset_id);
  if(!a||!a.segments.some(s=>s.id===e.page_segment_id))fail('批注引用了不存在的原图或页面区域');
  const transcription=e.transcription===null?'':str(e.transcription,'识别文字');
  return {id:id(c.id),assetId:a.id,annotationBox:box(e.annotation_bbox),targetBox:c.target.region_bbox===null?null:box(c.target.region_bbox),
   originalText:transcription,text:transcription,observation:str(e.observation??'','观察'),summary:str(c.interpretation.summary??'','模型解释'),
   proposedAction:JSON.stringify(c.action),claimedBinding:str(c.target.match_status??'ambiguous','定位状态',100),
   decision:'pending',reviewer:'',reviewedAt:null,note:''};
 });
 if(!items.length||new Set(items.map(c=>c.id)).size!==items.length)fail('批注标识为空或重复');
 return {source,assets,items,verifiedAssets:new Map()};
}

export async function createReviewSession(text,document){
 const session=parseReviewPacket(text);
 session.sourcePacketSha256=await sha256(text);session.openedDocumentSha256=await sha256(canonical(document));
 return session;
}

// Inspect dimensions before decoding. Only raster PNG/JPEG are admitted.
export function imageInfo(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b.length>LIMITS.imageBytes)fail('原图不得超过 12 MiB');
 let width,height,mime;
 if(b.length>=24&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x)&&String.fromCharCode(...b.slice(12,16))==='IHDR'){
  width=v.getUint32(16);height=v.getUint32(20);mime='image/png';
 }else if(b.length>=4&&b[0]===255&&b[1]===216){
  let p=2;
  while(p+3<b.length){
   if(b[p++]!==255)fail('JPEG 结构不正确');while(b[p]===255)p++;
   const marker=b[p++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
   if(p+2>b.length)break;const length=v.getUint16(p);if(length<2||p+length>b.length)fail('JPEG 数据不完整');
   // Rotated EXIF coordinates need explicit normalization by the producer.
   if(marker===225&&length>=16&&String.fromCharCode(...b.slice(p+2,p+8))==='Exif\0\0'){
    const t=p+8,end=p+length,little=b[t]===73&&b[t+1]===73;
    if(!(little||(b[t]===77&&b[t+1]===77))||v.getUint16(t+2,little)!==42)fail('EXIF 结构不正确');
    const offset=t+v.getUint32(t+4,little);if(offset<t+8||offset+2>end)fail('EXIF 结构不正确');
    const count=v.getUint16(offset,little);if(offset+2+count*12>end)fail('EXIF 结构不正确');
    for(let i=0;i<count;i++){const q=offset+2+i*12;if(v.getUint16(q,little)===274&&(v.getUint16(q+2,little)!==3||v.getUint32(q+4,little)!==1||v.getUint16(q+8,little)!==1))fail('请先由识别端校正照片方向并重新生成结果');}
   }
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
    if(length<8)fail('JPEG 尺寸不正确');height=v.getUint16(p+3);width=v.getUint16(p+5);mime='image/jpeg';
   }
   p+=length;
  }
 }
 if(!mime||!width||!height||width>LIMITS.dimension||height>LIMITS.dimension||width*height>LIMITS.pixels)fail('请选择尺寸有效的 PNG / JPEG 原图');
 return {width,height,mime};
}

export async function verifyAsset(asset,bytes){
 const info=imageInfo(bytes);
 if(info.width!==asset.width||info.height!==asset.height)fail('原图尺寸与识别记录不一致');
 if(await sha256(bytes)!==asset.sha256)fail('原图 SHA-256 不匹配，请选择识别时的原文件');
 return info;
}
export function editItem(session,itemId,{text,note}){
 const item=session.items.find(i=>i.id===itemId);if(!item)fail('批注不存在');
 item.text=str(text,'复核文字');item.note=str(note,'复核备注',2000);
 item.decision='pending';item.reviewer='';item.reviewedAt=null;
}
export function decideItem(session,itemId,decision,reviewer){
 const item=session.items.find(i=>i.id===itemId);if(!item||!['pending','checked','excluded'].includes(decision))fail('复核状态不正确');
 if(decision!=='pending'&&!session.verifiedAssets.has(item.assetId))fail('请先校验对应原图');
 reviewer=str(reviewer,'复核人',120).trim();if(decision!=='pending'&&!reviewer)fail('请填写复核人');
 item.decision=decision;item.reviewer=decision==='pending'?'':reviewer;item.reviewedAt=decision==='pending'?null:new Date().toISOString();
}
export async function exportReview(session,document){
 const current=await sha256(canonical(document));
 const decisions=await Promise.all(session.items.map(async item=>({candidate_id:item.id,transcription:item.text,note:item.note,
  status:item.decision,reviewer:item.reviewer||null,reviewed_at:item.reviewedAt,
  evidence_verified:session.verifiedAssets.has(item.assetId),source_binding:null,
  item_sha256:await sha256(canonical({candidate:session.source.candidates.find(c=>c.id===item.id),transcription:item.text,note:item.note}))})));
 return {schema_version:'shuye-proofmark-review/0.1',packet_kind:'human_review_draft',executable:false,created_at:new Date().toISOString(),
  source_packet_sha256:session.sourcePacketSha256,source_packet:structuredClone(session.source),
  context:{context_only:true,opened_document_sha256:session.openedDocumentSha256,current_document_sha256:current,document_changed:current!==session.openedDocumentSha256},
  source_binding:null,decisions};
}
