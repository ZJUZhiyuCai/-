import {createCmykConverter} from './icc.mjs';
import {embedPrintImage} from './print-image.mjs';
import {setPrintOutputIntent} from './pdfx.mjs';
import {createPdfInk} from './pdf-ink.mjs';
import {PDFDocument,PDFName,PDFDict,decodePDFRawStream,cmyk,pushGraphicsState,popGraphicsState,concatTransformationMatrix,rectangle,fill,beginText,endText,setFontAndSize,setTextMatrix,showText,setGraphicsState,drawObject} from 'pdf-lib';
import fontkit from './print-fontkit.mjs';
import {checkDocument} from './operations.mjs';
import {pageObjects,compositionRichText,flowStory} from '../public/editor/src/composition.mjs';
import {documentFingerprint} from '../public/editor/src/project-sync.mjs';
const pt=72/25.4;
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export const printLimitations=['PDF/X-4 为受限输出配置；完整 ISO 合规认证仍需独立专业预检','支持衬线、无衬线和楷体独立字体；缺少所用字体时拒绝输出','仅输出自由版面；正文顺序流须另行排入框','图片上限 200 万像素；支持 PNG、RGB/CMYK JPEG；CMYK 图像转换需要源 ICC，不支持 WebP','未标记 RGB 图像按 sRGB 解释；屏幕专色为近似显示，未提供 ICC 软打样'];
export function bookletOrder(count){if(!Number.isInteger(count)||count<1||count>1000)throw Error('PAGE_COUNT');const total=Math.ceil(count/4)*4,pairs=[];for(let i=0;i<total/4;i++){pairs.push([total-1-i*2,i*2],[i*2+1,total-2-i*2]);}return pairs.map(pair=>pair.map(i=>i<count?i:null));}
export async function exportCompositionPdf(raw,fontBytes,options={}){
 if(options.pdfX&&!options.iccProfile)throw Error('PDFX_REQUIRES_OUTPUT_ICC');
 if(options.maxInk!==undefined&&(!Number.isFinite(options.maxInk)||options.maxInk<100||options.maxInk>400))throw Error('PRINT_TOTAL_INK_RANGE');
 const converter=options.iccProfile?await createCmykConverter(options.iccProfile,{intent:options.intent??1,blackPointCompensation:options.blackPointCompensation??true,wasmModule:options.wasmModule}):null;
 try{return await exportPdf(raw,fontBytes,options,converter);}finally{converter?.close();}
}
async function exportPdf(raw,fontBytes,options,converter){
 const doc=checkDocument(raw);if(!doc.composition)throw Error('需要自由版面工程');
 const bodyBlocks=doc.blocks.filter(b=>b.type!=='pageBreak');
 if((bodyBlocks.length||doc.notes.length||doc.bibliography.length)&&options.acknowledgeBodyOmission!==true)throw Error('BODY_NOT_IN_COMPOSITION: 正文、注释或文献尚未排入自由版面；此出口不会输出这些内容。请使用正文浏览器校样，或明确确认仅输出自由版面。');
 if(!(fontBytes instanceof Uint8Array)||fontBytes.length<32||fontBytes.length>20*1024*1024)throw Error('字体文件须为有效 TTF/OTF，且不超过 20 MB');
 const bleed=options.bleedMm??3;if(!Number.isFinite(bleed)||bleed<0||bleed>20)throw Error('出血范围 0–20 mm');
 const mark=options.cropMarks===true?6:0,margin=bleed+mark,c=doc.composition;
 if(c.pages.length>200)throw Error('单次 PDF 输出最多 200 页，请分卷');
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);pdf.setTitle(doc.title);pdf.setProducer('Shuye / pdf-lib');pdf.setCreator('Shuye composition export');
 const fontEntries=new Map();
 for(const [family,bytes] of Object.entries({serif:fontBytes,...options.fontFiles})){
  if(!['serif','sans','kai'].includes(family)||!(bytes instanceof Uint8Array)||bytes.length<32||bytes.length>20*1024*1024)throw Error('FONT_RESOURCE_INVALID');
  const parsed=fontkit.create(bytes);if(!parsed?.layout||!parsed?.characterSet)throw Error('请选择单一 TTF/OTF 字体');const rights=parsed['OS/2']?.fsType;
  if((typeof rights==='number'&&(rights&2))||rights?.noEmbedding||rights?.bitmapOnly)throw Error('字体禁止轮廓嵌入');
  const subset=!(typeof rights==='number'?(rights&256):rights?.noSubsetting);const font=await pdf.embedFont(bytes,{subset});fontEntries.set(family,{font,parsed,subset,supported:new Set(parsed.characterSet)});
 }
 const {font,parsed}=fontEntries.get('serif');
 const ink=createPdfInk(pdf,converter,options);
 const diagnostics=[],runs=new Map(),frames=new Map(c.pages.flatMap(p=>p.objects).map(o=>[o.id,o]));
 const checkText=(text,id)=>{if(/\[\^|\[\[(?:ref|cite):/.test(text))diagnostics.push({code:'UNRESOLVED_REFERENCE',id});if(text.includes('\t'))diagnostics.push({code:'TAB_UNSUPPORTED',id});};
 const measure=(text,f)=>(fontEntries.get(f.fontFamily||'serif')||fontEntries.get('serif')).font.widthOfTextAtSize(text,f.fontSize||11);
 for(const s of c.stories){checkText(s.text,s.id);const r=flowStory(s,s.frameIds.map(id=>frames.get(id)),measure);r.runs.forEach(r=>runs.set(r.frameId,r));if(r.overset)diagnostics.push({code:'OVERSET',id:s.id,characters:[...r.overset].length});}
 const pages=c.pages.map((p,i)=>({id:p.id,objects:pageObjects(c,p.id).map(o=>{if(o.type==='text'){const rich=compositionRichText(doc,p.id,o.text||'',o.spans),text=rich.text;checkText(text,o.id);const r=runs.get(o.id)||flowStory(rich,[o],measure).runs[0];if(!runs.has(o.id)&&r.end<text.length)diagnostics.push({code:'OVERSET',id:o.id});for(const segment of r.lines.flatMap(l=>l.segments)){const resource=fontEntries.get(segment.style.fontFamily);if(!resource){diagnostics.push({code:'FONT_RESOURCE_MISSING',id:o.id,family:segment.style.fontFamily});continue;}for(const char of segment.text)if(!resource.supported.has(char.codePointAt(0)))diagnostics.push({code:'MISSING_GLYPH',id:o.id,character:char});}return {...o,run:r};}if(o.type==='image'&&o.src.startsWith('data:image/webp'))diagnostics.push({code:'WEBP_UNSUPPORTED',id:o.id});return o;})}));
 if(!pages.some(p=>p.objects.some(o=>o.type==='image'||o.fill||o.type==='text'&&o.run.lines.some(l=>l.segments.some(s=>s.text.trim())))))diagnostics.push({code:'EMPTY_COMPOSITION'});
 if(diagnostics.length){const error=Error('PRINT_PREFLIGHT_FAILED: '+JSON.stringify(diagnostics.slice(0,30)));error.diagnostics=diagnostics;throw error;}
 const width=doc.layout.width*pt,height=doc.layout.height*pt,m=margin*pt,b=bleed*pt;
 const report={pages:pages.length,trimMm:[doc.layout.width,doc.layout.height],bleedMm:bleed,fontName:parsed.postscriptName||'embedded',fontResources:[...fontEntries].map(([family,f])=>({family,name:f.parsed.postscriptName})),fontsEmbedded:true,colorSpace:'',pdfX:false,overprintObjects:[],limitations:printLimitations,images:[]};
 report.scope={kind:'composition-only',omittedBodyBlocks:bodyBlocks.length,omittedBodyNotes:doc.notes.length,omittedBibliography:doc.bibliography.length,bodyOmissionAcknowledged:options.acknowledgeBodyOmission===true};
 report.productionReady=false;
 report.status='INCOMPLETE';
 report.sourceSha256=await sha256(new TextEncoder().encode(documentFingerprint(doc)));
 for(const p of pages){const page=pdf.addPage([width+2*m,height+2*m]);page.setTrimBox(m,m,width,height);page.setBleedBox(m-b,m-b,width+2*b,height+2*b);const fontKeys=new Map([...fontEntries].map(([family,f])=>[family,page.node.newFontDictionary('ShuyeFont',f.font.ref)]));
  for(const o of p.objects){const w=o.width*pt,h=o.height*pt,rad=(o.rotation||0)*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad),cx=m+(o.x+o.width/2)*pt,cy=m+height-(o.y+o.height/2)*pt;
   // CSS rotates clockwise in top-left coordinates; PDF uses bottom-left coordinates.
   page.pushOperators(pushGraphicsState(),concatTransformationMatrix(cos,-sin,sin,cos,cx-cos*w/2-sin*h/2,cy+sin*w/2-cos*h/2));
   if(o.overprint){const gs=page.node.newExtGState('Overprint',pdf.context.register(pdf.context.obj({Type:'ExtGState',OP:true,op:true,OPM:1})));page.pushOperators(setGraphicsState(gs));report.overprintObjects.push({pageId:p.id,id:o.id});}
   if(o.fill)page.pushOperators(...ink.operators(page,o.fill),rectangle(0,0,w,h),fill());
   if(o.type==='text')for(const rule of o.run.rules||[]){const thickness=.35;page.pushOperators(...ink.operators(page,rule.color));if(rule.kind==='separator')page.pushOperators(rectangle(rule.x,h-rule.y-rule.height,rule.width,rule.height),fill());else for(const [x,y,rw,rh] of [[rule.x,h-rule.y-thickness,rule.width,thickness],[rule.x,h-rule.y-rule.height,rule.width,thickness],[rule.x,h-rule.y-rule.height,thickness,rule.height],[rule.x+rule.width-thickness,h-rule.y-rule.height,thickness,rule.height]])page.pushOperators(rectangle(x,y,rw,rh),fill());}
   if(o.type==='text')for(const line of o.run.lines)for(const s of line.segments){const size=s.style.fontSize;if(s.text)page.pushOperators(...ink.operators(page,s.style.color),beginText(),setFontAndSize(fontKeys.get(s.style.fontFamily),size),...(s.rotation?[setTextMatrix(0,-1,1,0,s.x,h-s.y)]:[setTextMatrix(1,0,0,1,s.x,h-s.y-size)]),showText(fontEntries.get(s.style.fontFamily).font.encodeText(s.text)),endText());}
   if(o.type==='image'){const converted=await embedPrintImage(pdf,o.src,converter,options),img=converted.image,pad=(o.padding||0)*pt,scale=Math.min((w-2*pad)/img.width,(h-2*pad)/img.height),iw=img.width*scale,ih=img.height*scale,dpi=72/scale;await img.embed();const imageSpace=pdf.context.lookup(img.ref).dict.get(PDFName.of('ColorSpace')).decodeText();ink.recordSpace(imageSpace);report.images.push({id:o.id,colorSpace:imageSpace,dpi:Math.round(dpi),widthPixels:img.width,heightPixels:img.height,iccConverted:converted.converted,maximumInk:converted.maximumInk,sourceProfile:converted.sourceProfile});if(dpi<(options.minDpi??150))throw Error(`PRINT_IMAGE_DPI: ${o.id} ${Math.round(dpi)} dpi`);if(img.raw){const key=page.node.newXObject('ShuyeImage',img.ref);page.pushOperators(pushGraphicsState(),concatTransformationMatrix(iw,0,0,ih,(w-iw)/2,(h-ih)/2),drawObject(key),popGraphicsState());}else page.drawImage(img,{x:(w-iw)/2,y:(h-ih)/2,width:iw,height:ih});}
   page.pushOperators(popGraphicsState());
  }
  if(mark){ink.recordSpace('DeviceCMYK');const offset=b+pt,length=4*pt;for(const x of [m,m+width])for(const y of [m,m+height]){const sx=x===m?-1:1,sy=y===m?-1:1;page.drawLine({start:{x:x+sx*offset,y},end:{x:x+sx*(offset+length),y},thickness:.25,color:cmyk(0,0,0,1)});page.drawLine({start:{x,y:y+sy*offset},end:{x,y:y+sy*(offset+length)},thickness:.25,color:cmyk(0,0,0,1)});}}
 }
 for(const {font,parsed,subset} of fontEntries.values())if(parsed.directory.tables['CFF ']){
  await pdf.flush();
  const root=pdf.context.lookup(font.ref,PDFDict),descendants=pdf.context.lookup(root.get(PDFName.of('DescendantFonts'))),descendant=descendants.lookup(0,PDFDict),descriptor=descendant.lookup(PDFName.of('FontDescriptor'),PDFDict);
  // CFF subsets are bare CID CFF; no-subsetting fonts retain the full SFNT wrapper.
  const streamRef=descriptor.get(PDFName.of('FontFile3'))||descriptor.get(PDFName.of('FontFile2'));
  descriptor.delete(PDFName.of('FontFile2'));descriptor.set(PDFName.of('FontFile3'),streamRef);
  descendant.set(PDFName.of('Subtype'),PDFName.of('CIDFontType0'));
  if(subset){
   // @pdf-lib/fontkit 1.1.1 writes CFF table length into header offSize.
   // CFF 1.0 requires 1..4, independent of each INDEX's own offSize. A valid
   // PDF FontFile3 alone does not make those embedded font bytes readable.
   const data=Uint8Array.from(decodePDFRawStream(pdf.context.lookup(streamRef)).decode());
   if(data.length<4||data[0]!==1||data[2]<4||data[2]>data.length)throw Error('CFF_SUBSET_HEADER_INVALID');
   data[3]=4;
   pdf.context.assign(streamRef,pdf.context.flateStream(data,{Subtype:'CIDFontType0C'}));
  }else pdf.context.lookup(streamRef).dict.set(PDFName.of('Subtype'),PDFName.of('OpenType'));
  descendant.delete(PDFName.of('CIDToGIDMap'));
 }
 Object.assign(report,ink.report());report.colorSpace=report.colorSpaces.join(' + ');
 let output=pdf;
 if(options.booklet){output=await PDFDocument.create();output.setTitle(doc.title+' · 骑马订');const embedded=await output.embedPages(pdf.getPages()),sheetW=width+2*m,sheetH=height+2*m;for(const pair of bookletOrder(embedded.length)){const p=output.addPage([sheetW*2,sheetH]);p.setTrimBox(0,0,sheetW*2,sheetH);p.setBleedBox(0,0,sheetW*2,sheetH);pair.forEach((index,i)=>{if(index!==null)p.drawPage(embedded[index],{x:i*sheetW,y:0,width:sheetW,height:sheetH});});}report.imposition={mode:'booklet',sheets:output.getPageCount()/2,paddedPages:Math.ceil(pages.length/4)*4,order:bookletOrder(pages.length)};}
 if(options.iccProfile){report.outputIntent=await setPrintOutputIntent(output,options.iccProfile,{pdfX:options.pdfX===true,condition:options.outputCondition||'Custom CMYK printing condition'});report.renderingIntent=options.intent??1;report.blackPointCompensation=options.blackPointCompensation??true;report.pdfX=options.pdfX?'PDF/X-4':false;report.pdfXIndependentCertification=false;}
 const bytes=await output.save();
 // pdf-lib's writer hardcodes 1.7 even when context.header is changed. This
 // restricted writer uses only PDF 1.6 features; equal-length header replacement
 // preserves every xref byte offset and is checked by an independent parser.
 if(options.pdfX){if(new TextDecoder().decode(bytes.subarray(0,8))!=='%PDF-1.7')throw Error('PDF_HEADER_UNEXPECTED');bytes[7]=54;}
 if(bytes.length>24*1024*1024)throw Error('PDF 超过 24 MB，请分卷');
 report.pdfSha256=await sha256(bytes);
 return {bytes,report};
}
