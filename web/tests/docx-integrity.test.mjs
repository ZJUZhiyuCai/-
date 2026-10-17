import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
import {importDocx} from '../public/editor/src/docx-web.mjs';
import {assertDocxImportSafe} from '../public/editor/src/docx-safety.mjs';
globalThis.DOMParser=DOMParser;
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',M='http://schemas.openxmlformats.org/officeDocument/2006/math';
const document=body=>`<w:document xmlns:w="${W}" xmlns:m="${M}"><w:body>${body}</w:body></w:document>`;
const p=text=>`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
// Small uncompressed ZIP, containing only original synthetic OOXML.
function zip(parts){
  let offset=0;const files=[],central=[];
  for(const [path,text] of Object.entries(parts)){
    const name=Buffer.from(path),data=Buffer.from(text),header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
    files.push(header,name,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=30+name.length+data.length;
  }
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(parts).length,10);end.writeUInt32LE(Buffer.concat(central).length,12);end.writeUInt32LE(offset,16);
  const bytes=Buffer.concat([...files,...central,end]);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);
}
test('basic DOCX preserves paragraph order, superscripts, note paragraphs and table cells',async()=>{
  const result=await importDocx(zip({'word/document.xml':document(p('BEGIN')+'<w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p><w:tbl><w:tr><w:tc>'+p('甲')+'</w:tc><w:tc>'+p('乙')+'</w:tc></w:tr></w:tbl>'+p('END')),'word/footnotes.xml':`<w:footnotes xmlns:w="${W}"><w:footnote w:id="1">${p('注一')}${p('注二')}</w:footnote></w:footnotes>`}));
  assert.deepEqual(result.blocks.map(b=>b.text),['BEGIN','2[^fn1]','Word 表格','END']);
  assert.equal(result.blocks[1].marks[0].superscript,true);assert.equal(result.notes[0].text,'注一\n注二');assert.deepEqual(result.blocks[2].rows,[['甲','乙']]);
});
test('inline and display OMML reject atomically, including formulas in notes and tables',async()=>{
  const math='<m:oMath><m:r><m:t>x</m:t></m:r></m:oMath>';
  for(const body of ['<w:p><w:r><w:t>before</w:t></w:r>'+math+'</w:p>','<w:p><m:oMathPara>'+math+'</m:oMathPara></w:p>','<w:tbl><w:tr><w:tc><w:p>'+math+'</w:p></w:tc></w:tr></w:tbl>'])await assert.rejects(importDocx(zip({'word/document.xml':document(body)})),e=>e.code==='DOCX_IMPORT_UNSUPPORTED'&&e.issues.some(i=>i.feature==='oMath'));
  await assert.rejects(importDocx(zip({'word/document.xml':document(p('intact')),'word/footnotes.xml':document('<w:p>'+math+'</w:p>')})),/Word 公式/);
});
test('tracked changes, automatic labels, fields, OLE, vertical merges and hidden containers are not flattened',()=>{
  for(const tag of ['ins','del','numPr','fldChar','fldSimple','object','vMerge','sdt','pict','sym','ruby']){
    const root=new DOMParser().parseFromString(document(`<w:${tag}/>`),'application/xml');
    assert.throws(()=>assertDocxImportSafe([{root,part:'word/document.xml'}]),e=>e.issues.some(i=>i.feature===tag));
  }
});
test('nested tables and formatted table cells reject rather than lose structure or exponents',()=>{
  for(const body of ['<w:tbl><w:tr><w:tc><w:tbl/></w:tc></w:tr></w:tbl>','<w:tbl><w:tr><w:tc><w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'])assert.throws(()=>assertDocxImportSafe([{root:new DOMParser().parseFromString(document(body),'application/xml')}]),/DOCX_IMPORT_UNSUPPORTED/);
});
test('unsupported or missing pictures abort import',async()=>{
  const drawing='<w:p><w:r><w:drawing><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="r1"/></w:drawing></w:r></w:p>';
  for(const ext of ['tiff','png'])await assert.rejects(importDocx(zip({'word/document.xml':document(p('KEEP')+drawing),'word/_rels/document.xml.rels':`<Relationships><Relationship Id="r1" Target="media/image.${ext}"/></Relationships>`})),/未导入/);
});
test('charts, alternate content and note exponents cannot silently become plain text',async()=>{
  const chart='<w:p><w:r><w:drawing><a:graphicData xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></w:drawing></w:r></w:p>';
  const alternate='<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"/>';
  for(const body of [chart,alternate])await assert.rejects(importDocx(zip({'word/document.xml':document(body)})),/DOCX_IMPORT_UNSUPPORTED/);
  await assert.rejects(importDocx(zip({'word/document.xml':document(p('body')),'word/footnotes.xml':document('<w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r></w:p>')})),/注释中的上下标/);
});
