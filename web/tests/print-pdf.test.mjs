import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument,PDFName,PDFDict,decodePDFRawStream} from 'pdf-lib';
import {exportCompositionPdf,bookletOrder} from '../lib/print-pdf.mjs';
const font=readFileSync(new URL('./fixtures/test-only.ttf',import.meta.url));
const cffFont=readFileSync(new URL('./fixtures/test-only.otf',import.meta.url));
const fixture=()=>({format:'open-typesetter',version:3,title:'图书测试',blocks:[],composition:{masters:[],stories:[],pages:[{id:'p1',overrides:[],objects:[{id:'f1',type:'text',x:20,y:30,width:100,height:80,text:'图书排版测试 ABC 123',fontSize:12},{id:'rect1',type:'rect',x:-3,y:140,width:60,height:40,fill:'#ff0000',rotation:30}]}]}});
test('body omission requires explicit acknowledgement and empty compositions never export',async()=>{
 const doc=fixture();doc.blocks=[{id:'body',type:'paragraph',text:'正文不得遗漏'}];
 await assert.rejects(exportCompositionPdf(doc,font),/BODY_NOT_IN_COMPOSITION/);
 const {bytes,report}=await exportCompositionPdf(doc,font,{acknowledgeBodyOmission:true});
 assert.equal(report.scope.omittedBodyBlocks,1);assert.equal(report.scope.bodyOmissionAcknowledged,true);assert.equal(report.productionReady,false);assert.equal(report.status,'INCOMPLETE');
 assert.equal(report.pdfSha256,createHash('sha256').update(bytes).digest('hex'));assert.match(report.sourceSha256,/^[a-f0-9]{64}$/);
 doc.composition.pages[0].objects=[];
 await assert.rejects(exportCompositionPdf(doc,font,{acknowledgeBodyOmission:true}),/EMPTY_COMPOSITION/);
 doc.blocks=[];await assert.rejects(exportCompositionPdf(doc,font),/EMPTY_COMPOSITION/);
 for(const field of ['notes','bibliography']){const d=fixture();d[field]=[{id:'entry',text:'must not silently omit'}];await assert.rejects(exportCompositionPdf(d,font),/BODY_NOT_IN_COMPOSITION/);}
 await assert.rejects(exportCompositionPdf({...fixture(),blocks:[{id:'body',type:'paragraph',text:'body'}]},font,{acknowledgeBodyOmission:'true'}),/BODY_NOT_IN_COMPOSITION/);
});
test('PDF has exact Media/Trim/Bleed boxes, embedded font and vector content',async()=>{const {bytes,report}=await exportCompositionPdf(fixture(),font,{bleedMm:3,cropMarks:true});const pdf=await PDFDocument.load(bytes),page=pdf.getPage(0);assert.equal(pdf.getPageCount(),1);assert.ok(Math.abs(page.getTrimBox().width-185*72/25.4)<.001);assert.ok(Math.abs(page.getMediaBox().width-203*72/25.4)<.001);assert.ok(Math.abs(page.getBleedBox().width-191*72/25.4)<.001);const resources=page.node.Resources().lookup(PDFName.of('Font'),PDFDict);assert.equal(resources.keys().length,1);const f=resources.lookup(resources.keys()[0],PDFDict);assert.equal(f.get(PDFName.of('Subtype')).toString(),'/Type0');const descendant=pdf.context.lookup(f.get(PDFName.of('DescendantFonts'))).lookup(0,PDFDict),descriptor=descendant.lookup(PDFName.of('FontDescriptor'),PDFDict);assert.ok(descriptor.get(PDFName.of('FontFile2')));assert.ok(f.get(PDFName.of('ToUnicode')));assert.equal(report.pdfX,false);});
test('preflight rejects missing glyphs, overset, unresolved references and invalid fonts',async()=>{for(const text of ['\u{10ffff}','A'.repeat(10000),'[^note]']){const d=fixture();d.composition.pages[0].objects[0].text=text;await assert.rejects(()=>exportCompositionPdf(d,font),/PREFLIGHT/);}await assert.rejects(()=>exportCompositionPdf(fixture(),new Uint8Array(50)));});
test('preflight rejects low-resolution image and unsupported WebP',async()=>{const d=fixture();d.composition.pages[0].objects.push({id:'img',type:'image',x:10,y:10,width:100,height:100,src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='});await assert.rejects(()=>exportCompositionPdf(d,font),/DPI/);d.composition.pages[0].objects[2].src='data:image/webp;base64,AAAA';await assert.rejects(()=>exportCompositionPdf(d,font),/WEBP/);});
test('booklet covers every page once and fills blanks, PDF sheets have double width',async()=>{assert.deepEqual(bookletOrder(5),[[null,0],[1,null],[null,2],[3,4]]);for(let n=1;n<=100;n++){const ids=bookletOrder(n).flat().filter(x=>x!==null).sort((a,b)=>a-b);assert.deepEqual(ids,Array.from({length:n},(_,i)=>i));}const {bytes,report}=await exportCompositionPdf(fixture(),font,{booklet:true});const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),2);assert.equal(report.imposition.paddedPages,4);assert.ok(Math.abs(pdf.getPage(0).getWidth()-191*2*72/25.4)<.001);});
test('CFF subset bytes are embedded as FontFile3 CIDFontType0C with CIDFontType0',async()=>{const {bytes}=await exportCompositionPdf(fixture(),cffFont);const pdf=await PDFDocument.load(bytes),fonts=pdf.getPage(0).node.Resources().lookup(PDFName.of('Font'),PDFDict),f=fonts.lookup(fonts.keys()[0],PDFDict),desc=pdf.context.lookup(f.get(PDFName.of('DescendantFonts'))).lookup(0,PDFDict),descriptor=desc.lookup(PDFName.of('FontDescriptor'),PDFDict);assert.equal(desc.get(PDFName.of('Subtype')).toString(),'/CIDFontType0');assert.equal(descriptor.has(PDFName.of('FontFile2')),false);const stream=pdf.context.lookup(descriptor.get(PDFName.of('FontFile3')));assert.equal(stream.dict.get(PDFName.of('Subtype')).toString(),'/CIDFontType0C');const cff=decodePDFRawStream(stream).decode();assert.equal(cff[0],1);assert.equal(cff[3],4,'CFF offSize must be valid; fontkit incorrectly writes truncated table length');});
test('mixed family runs require matching font resources and embed each used family',async()=>{
 const d=fixture();d.composition.pages[0].objects[0].spans=[{start:0,end:2,style:{fontFamily:'sans',fontSize:20}},{start:2,end:4,style:{fontFamily:'kai'}}];await assert.rejects(()=>exportCompositionPdf(d,font),/FONT_RESOURCE_MISSING/);
 const {bytes,report}=await exportCompositionPdf(d,font,{fontFiles:{sans:font,kai:cffFont}});const pdf=await PDFDocument.load(bytes),resources=pdf.getPage(0).node.Resources().lookup(PDFName.of('Font'),PDFDict);assert.equal(resources.keys().length,3);assert.equal(report.fontResources.length,3);
});

test('CFF no-subsetting permission retains the complete OpenType font wrapper',async()=>{
 const data=Uint8Array.from(cffFont),view=new DataView(data.buffer);for(let i=0;i<view.getUint16(4);i++){const at=12+16*i;if(new TextDecoder().decode(data.subarray(at,at+4))==='OS/2')view.setUint16(view.getUint32(at+8)+8,256);}
 const {bytes}=await exportCompositionPdf(fixture(),data),pdf=await PDFDocument.load(bytes),fonts=pdf.getPage(0).node.Resources().lookup(PDFName.of('Font'),PDFDict),f=fonts.lookup(fonts.keys()[0],PDFDict),desc=pdf.context.lookup(f.get(PDFName.of('DescendantFonts'))).lookup(0,PDFDict),descriptor=desc.lookup(PDFName.of('FontDescriptor'),PDFDict),stream=pdf.context.lookup(descriptor.get(PDFName.of('FontFile3')));assert.equal(stream.dict.get(PDFName.of('Subtype')).toString(),'/OpenType');
});
