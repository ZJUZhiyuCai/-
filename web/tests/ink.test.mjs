import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument,PDFName,PDFDict,decodePDFRawStream} from 'pdf-lib';
import {exportCompositionPdf} from '../lib/print-pdf.mjs';
import {applyOperations,checkDocument} from '../lib/operations.mjs';
import {compositionSchema} from '../lib/composition-schema.mjs';
import {previewInk,validateInk} from '../public/editor/src/ink.mjs';
const font=readFileSync(new URL('./fixtures/test-only.ttf',import.meta.url));
const spot={space:'spot',name:'Book Blue',tint:.6,alternate:[1,.3,0,0]};
const fixture=()=>checkDocument({format:'open-typesetter',version:3,title:'Ink test',blocks:[],composition:{masters:[],stories:[],pages:[{id:'p1',objects:[{id:'bg',type:'rect',x:20,y:20,width:50,height:30,fill:spot},{id:'text',type:'text',x:20,y:20,width:50,height:30,text:'ABC',fontSize:20,color:{space:'cmyk',values:[0,0,0,1]},overprint:true}]}]}});
test('ink model roundtrip and MCP updates retain device values and overprint',()=>{
 const d=fixture();assert.deepEqual(compositionSchema.parse(d.composition),d.composition);
 assert.deepEqual(checkDocument(JSON.parse(JSON.stringify(d))),d);
 const frame={...d.composition.pages[0].objects[0],fill:{...spot,tint:.25}};
 const changed=applyOperations(d,[{op:'upsert_frame',pageId:'p1',frame}]).document;
 assert.equal(changed.composition.pages[0].objects[0].fill.tint,.25);assert.equal(d.composition.pages[0].objects[0].fill.tint,.6);
 assert.equal(previewInk({space:'cmyk',values:[0,0,0,1]}),'rgb(0,0,0)');
});
test('invalid channels, reserved colorants and image overprint fail without mutation',()=>{
 for(const value of [{space:'cmyk',values:[0,0,0,2]},{space:'cmyk',values:[0,0,0]},{...spot,name:'All'},{...spot,tint:NaN},{...spot,alternate:[0,0,0,-1]},{...spot,secret:true}])assert.throws(()=>validateInk(value));
 const d=fixture(),before=structuredClone(d);const image={id:'image',type:'image',x:0,y:0,width:10,height:10,src:'data:image/png;base64,AAAA',overprint:true};assert.throws(()=>applyOperations(d,[{op:'upsert_frame',pageId:'p1',frame:image}]),/OVERPRINT/);assert.throws(()=>applyOperations(d,[{op:'upsert_frame',pageId:'p1',frame:{...d.composition.pages[0].objects[0],fill:{...spot,tint:-1}}}]));assert.deepEqual(d,before);
});
test('PDF preserves spot separation, tint transform, K-only text and scoped overprint',async()=>{
 const {bytes,report}=await exportCompositionPdf(fixture(),font);const pdf=await PDFDocument.load(bytes),page=pdf.getPage(0),resources=page.node.Resources();
 const spaces=resources.lookup(PDFName.of('ColorSpace'),PDFDict),separation=pdf.context.lookup(spaces.get(spaces.keys()[0]));
 assert.equal(separation.get(0).toString(),'/Separation');assert.equal(separation.get(1).decodeText(),'Book Blue');assert.equal(separation.get(2).toString(),'/DeviceCMYK');
 const fn=separation.lookup(3,PDFDict);assert.equal(fn.get(PDFName.of('C1')).toString(),'[ 1 0.3 0 0 ]');
 const states=resources.lookup(PDFName.of('ExtGState'),PDFDict),gs=states.lookup(states.keys()[0],PDFDict);assert.equal(gs.get(PDFName.of('op')).toString(),'true');assert.equal(gs.get(PDFName.of('OPM')).toString(),'1');
 const content=page.node.Contents(),stream=content.lookup(0);const ops=Buffer.from(decodePDFRawStream(stream).decode()).toString();assert.match(ops,/0 0 0 1 k/);assert.match(ops,/0.6 scn/);assert.equal((ops.match(/^q$/gm)||[]).length,(ops.match(/^Q$/gm)||[]).length);
 assert.equal(report.iccConverted,false);assert.equal(report.pdfX,false);assert.deepEqual(report.spotColors,[{name:'Book Blue',alternateCMYK:[1,.3,0,0]}]);assert.deepEqual(report.overprintObjects,[{pageId:'p1',id:'text'}]);
});
test('one named ink cannot silently use conflicting alternate definitions',async()=>{
 const d=fixture();d.composition.pages[0].objects.push({...d.composition.pages[0].objects[0],id:'conflict',fill:{...spot,alternate:[0,1,0,0]}});
 await assert.rejects(()=>exportCompositionPdf(d,font),/SPOT_ALTERNATE_CONFLICT/);
});
