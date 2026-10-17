import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCmykConverter,validateOutputIcc} from '../lib/icc.mjs';
import {exportCompositionPdf} from '../lib/print-pdf.mjs';
import {PDFDocument,PDFName,PDFDict,decodePDFRawStream} from 'pdf-lib';
import {readImage} from '../lib/print-image.mjs';
import UPNGModule from '@pdf-lib/upng';
import jpeg from 'jpeg-js';
import {deflateSync} from 'node:zlib';
import {decodeCmyk} from '../vendor/jpeg-cmyk/decoder.mjs';
const UPNG=UPNGModule.default||UPNGModule;
const icc=new Uint8Array(readFileSync(new URL('./fixtures/test-only-cmyk.icc',import.meta.url))),font=readFileSync(new URL('./fixtures/test-only.ttf',import.meta.url));
const wasmModule=await WebAssembly.compile(readFileSync(new URL('../vendor/lcms/lcms.wasm',import.meta.url)));
const fixture=()=>({format:'open-typesetter',version:3,title:'测试 & ICC',blocks:[],composition:{masters:[],stories:[],pages:[{id:'p',objects:[{id:'t',type:'text',x:10,y:10,width:100,height:50,text:'图书 ABC',fontSize:12},{id:'r',type:'rect',x:10,y:60,width:40,height:20,fill:'#ff0000'}]}]}});
test('actual WASM engine converts synthetic profile in 8/16-bit and frees closed handles',async()=>{
 const c=await createCmykConverter(icc,{wasmModule});const a=c.rgb8(new Uint8Array([255,0,0,0,255,0,0,0,255]));assert.equal(a.length,12);assert.notDeepEqual([...a.subarray(0,4)],[...a.subarray(4,8)]);const b=c.rgb16(new Uint16Array([65535,0,0]));for(let i=0;i<4;i++)assert.ok(Math.abs(a[i]-b[i]/257)<2);assert.equal(c.memoryBytes(),16777216);c.close();c.close();assert.throws(()=>c.rgb8(new Uint8Array(3)),/CLOSED/);
});
test('malformed ICC, unsupported class, duplicate and out-of-bounds tags fail before WASM',()=>{
 for(const mutate of [b=>b[36]=0,b=>b[8]=3,b=>b[12]=0,b=>new DataView(b.buffer).setUint32(136,b.length+1),b=>b.set(b.subarray(132,136),144),b=>new DataView(b.buffer).setUint32(128,99999)]){const b=icc.slice();mutate(b);assert.throws(()=>validateOutputIcc(b));}
 assert.throws(()=>validateOutputIcc(new Uint8Array(3)),/SIZE/);
});
test('PDF/X profile emits exact ICC, metadata, 1.6 header, IDs, CMYK streams and boxes',async()=>{
 const {bytes,report}=await exportCompositionPdf(fixture(),font,{iccProfile:icc,wasmModule,pdfX:true,booklet:true});assert.equal(new TextDecoder().decode(bytes.slice(0,8)),'%PDF-1.6');assert.equal(report.iccConverted,true);assert.equal(report.pdfX,'PDF/X-4');assert.ok(!report.colorSpaces.includes('DeviceRGB'));
 const pdf=await PDFDocument.load(bytes,{updateMetadata:false}),intent=pdf.catalog.lookup(PDFName.of('OutputIntents')).lookup(0,PDFDict),profile=pdf.context.lookup(intent.get(PDFName.of('DestOutputProfile')));assert.deepEqual(new Uint8Array(decodePDFRawStream(profile).decode()),icc);assert.ok(pdf.context.trailerInfo.ID);assert.match(new TextDecoder().decode(pdf.context.lookup(pdf.catalog.get(PDFName.of('Metadata'))).contents),/PDF\/X-4/);for(const p of pdf.getPages()){assert.ok(p.node.has(PDFName.of('TrimBox')));assert.ok(p.node.has(PDFName.of('BleedBox')));}
});
test('PDF/X requires profile; TAC rejects excessive manual CMYK without returning a file',async()=>{
 await assert.rejects(()=>exportCompositionPdf(fixture(),font,{pdfX:true}),/REQUIRES_OUTPUT_ICC/);const d=fixture();d.composition.pages[0].objects[1].fill={space:'cmyk',values:[1,1,1,1]};await assert.rejects(()=>exportCompositionPdf(d,font,{maxInk:300}),/TOTAL_INK/);
});
test('image pixel bombs reject before decoder allocation',()=>{
 const b=new Uint8Array(33);b.set([137,80,78,71,13,10,26,10]);const v=new DataView(b.buffer);v.setUint32(8,13);b.set([73,72,68,82],12);v.setUint32(16,100000);v.setUint32(20,100000);assert.throws(()=>readImage('data:image/png;base64,'+Buffer.from(b).toString('base64')),/PIXEL_LIMIT/);
});
test('PNG alpha and embedded source ICC plus JPEG convert into CMYK XObjects',async()=>{
 const srgb=readFileSync(new URL('./fixtures/test-srgb.icc',import.meta.url)),rgba=new Uint8Array([255,0,0,255,0,255,0,128,0,0,255,255,128,128,128,255]);
 let png=Buffer.from(UPNG.encode([rgba.buffer],2,2,0));const chunk=Buffer.concat([Buffer.from('test\0\0'),deflateSync(srgb)]),tag=Buffer.from('iCCP'),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(chunk.length);const payload=Buffer.concat([tag,chunk]);crc.writeUInt32BE(UPNG.crc.crc(payload,0,payload.length)>>>0);png=Buffer.concat([png.subarray(0,33),length,payload,crc,png.subarray(33)]);
 let jpg=jpeg.encode({data:rgba,width:2,height:2},90).data;const app=Buffer.concat([Buffer.from('ICC_PROFILE\0'),Buffer.from([1,1]),srgb]),appLength=Buffer.alloc(2);appLength.writeUInt16BE(app.length+2);jpg=Buffer.concat([jpg.subarray(0,2),Buffer.from([255,226]),appLength,app,jpg.subarray(2)]);
 for(const [type,bytes] of [['png',png],['jpeg',jpg]]){const data='data:image/'+type+';base64,'+bytes.toString('base64');assert.equal(readImage(data).embeddedICC,true);const d=fixture();d.composition.pages[0].objects=[{id:'i',type:'image',x:10,y:10,width:1,height:1,src:data}];const result=await exportCompositionPdf(d,font,{iccProfile:icc,wasmModule,pdfX:true,minDpi:1});assert.equal(result.report.images[0].iccConverted,true);const pdf=await PDFDocument.load(result.bytes),xs=pdf.getPage(0).node.Resources().lookup(PDFName.of('XObject'),PDFDict),image=pdf.context.lookup(xs.get(xs.keys()[0]));assert.equal(image.dict.get(PDFName.of('ColorSpace')).toString(),'/DeviceCMYK');if(type==='png')assert.ok(image.dict.has(PDFName.of('SMask')));}
});
test('CMYK JPEG samples retain ink channels and require a source profile for conversion',async()=>{
 const bytes=readFileSync(new URL('./fixtures/test-cmyk.jpg',import.meta.url)),decoded=decodeCmyk(bytes);assert.deepEqual([...decoded.data.subarray(0,16)],[0,255,255,0,255,0,255,0,255,255,0,0,0,0,0,255]);
 const d=fixture();d.composition.pages[0].objects=[{id:'i',type:'image',x:10,y:10,width:1,height:1,src:'data:image/jpeg;base64,'+bytes.toString('base64')}];await assert.rejects(()=>exportCompositionPdf(d,font,{iccProfile:icc,wasmModule,pdfX:true,minDpi:1}),/SOURCE_ICC_REQUIRED/);
 const result=await exportCompositionPdf(d,font,{iccProfile:icc,sourceCmykProfile:icc,wasmModule,pdfX:true,minDpi:1});assert.equal(result.report.images[0].colorSpace,'DeviceCMYK');assert.equal(result.report.images[0].iccConverted,true);
});
