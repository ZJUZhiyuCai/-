// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateTable,mergeCells,splitCell,resizeTable,cellDisplayText,tableRowGroups,headerRowCount,buildTableElement} from '../src/table-layout.mjs';
const base=()=>({type:'table',rows:[['甲','乙','丙'],['丁','戊','己'],['庚','辛','壬']],headerRows:1});
test('merging preserves every original cell and splitting restores locations',()=>{
  const original=base(),merged=mergeCells(original,{row:0,col:0,rowspan:2,colspan:2});
  assert.deepEqual(merged.rows,original.rows);
  assert.equal(cellDisplayText(merged,0,0),'甲\n乙\n丁\n戊');
  assert.equal(cellDisplayText(merged,1,1),'甲\n乙\n丁\n戊');
  const split=splitCell(merged,1,1);assert.deepEqual(split.rows,original.rows);assert.deepEqual(split.merges,[]);
  assert.equal(original.merges,undefined);
});
test('out-of-bounds, overlapping and malformed geometry are rejected',()=>{
  for(const merges of [
    [{row:2,col:1,rowspan:2,colspan:1}],
    [{row:0,col:0,rowspan:2,colspan:2},{row:1,col:1,rowspan:2,colspan:2}],
    [{row:0,col:0,rowspan:0,colspan:1}],
    [{row:.5,col:0,rowspan:1,colspan:1}],
  ])assert.throws(()=>validateTable({...base(),merges}));
  assert.throws(()=>validateTable({...base(),columnWidths:[0,1,2]}));
  assert.deepEqual(validateTable({...base(),columnWidths:[1,2,1]}).columnWidths,[25,50,25]);
});
test('partial merge intersection fails; fully containing selection absorbs merge',()=>{
  const merged=mergeCells(base(),{row:0,col:0,rowspan:2,colspan:2});
  assert.throws(()=>mergeCells(merged,{row:1,col:1,rowspan:2,colspan:2}),/切开/);
  const larger=mergeCells(merged,{row:0,col:0,rowspan:3,colspan:3});
  assert.equal(larger.merges.length,1);assert.equal(cellDisplayText(larger,0,0).split('\n').length,9);
});
test('row groups transitively connect vertical merges and expand headers',()=>{
  const table={rows:Array.from({length:5},()=>['','']),headerRows:1,merges:[{row:0,col:0,rowspan:2,colspan:1},{row:1,col:1,rowspan:3,colspan:1}]};
  assert.deepEqual(tableRowGroups(table),[{start:0,end:4},{start:4,end:5}]);
  assert.equal(headerRowCount(table).count,4);assert.equal(headerRowCount(table).warnings.length,1);
  assert.equal(headerRowCount({...table,headerRows:0}).count,0);
});
test('insertions grow interior spans and move later anchors',()=>{
  const table=mergeCells(base(),{row:0,col:0,rowspan:2,colspan:2});
  const interior=resizeTable(table,'row',1);assert.equal(interior.merges[0].rowspan,3);assert.deepEqual(interior.rows[2],base().rows[1]);
  const before=resizeTable(table,'col',0);assert.equal(before.merges[0].col,1);assert.equal(before.rows[0][1],'甲');
  assert.ok(Math.abs(before.columnWidths.reduce((a,b)=>a+b)-100)<1e-9);
});
test('deletions preserve remaining cells and cannot remove last row or column',()=>{
  const table=mergeCells(base(),{row:0,col:0,rowspan:2,colspan:2});
  const next=resizeTable(table,'row',0,true);assert.deepEqual(next.rows[0],['丁','戊','己']);assert.equal(next.merges[0].rowspan,1);
  const last=resizeTable(next,'col',0,true);assert.deepEqual(last.merges,[]);assert.deepEqual(last.rows[0],['戊','己']);
  assert.throws(()=>resizeTable({rows:[['唯一']]},'row',0,true));
  assert.throws(()=>resizeTable({rows:[['唯一']]},'col',0,true));
});
test('DOM builder represents spans, widths, full text, and rejects split merge fragments',()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>({tag,style:{},dataset:{},children:[],append(...items){this.children.push(...items);}})};
  try{
    const table=mergeCells(base(),{row:0,col:0,rowspan:2,colspan:2}),seen=[];
    const el=buildTableElement(table,{renderCell:(td,text,location)=>{td.textContent=text;seen.push(location);}});
    const td=el.children[1].children[0].children[0];assert.equal(td.rowSpan,2);assert.equal(td.colSpan,2);assert.equal(td.textContent,'甲\n乙\n丁\n戊');assert.equal(seen.length,6);
    assert.throws(()=>buildTableElement(table,{rowIndexes:[0,2]}),/切断/);
    assert.throws(()=>buildTableElement(table,{rowIndexes:[0,0]}),/索引/);
  }finally{globalThis.document=previous;}
});
test('DOCX gridSpan/vMerge imports coordinates, all text and grid widths',()=>{
  const script=String.raw`
import io,zipfile,json
from docx_import import import_docx
def cell(text,props=''):
 return '<w:tc><w:tcPr>'+props+'</w:tcPr><w:p><w:r><w:t>'+text+'</w:t></w:r></w:p></w:tc>'
row1=cell('A','<w:gridSpan w:val="2"/><w:vMerge w:val="restart"/>')+cell('B')
row2=cell('C','<w:gridSpan w:val="2"/><w:vMerge/>')+cell('D')
row3=cell('E')+cell('F')+cell('G')
xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblGrid><w:gridCol w:w="100"/><w:gridCol w:w="200"/><w:gridCol w:w="100"/></w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>'+row1+'</w:tr><w:tr>'+row2+'</w:tr><w:tr>'+row3+'</w:tr></w:tbl></w:body></w:document>'
b=io.BytesIO()
with zipfile.ZipFile(b,'w') as z:z.writestr('word/document.xml',xml)
print(json.dumps(import_docx(b.getvalue()),ensure_ascii=True))
`;
  const result=spawnSync('python',['-c',script],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout),table=data.blocks[0];
  assert.deepEqual(table.rows,[['A','','B'],['C','','D'],['E','F','G']]);
  assert.deepEqual(table.merges,[{row:0,col:0,rowspan:2,colspan:2}]);
  assert.deepEqual(table.columnWidths,[25,50,25]);
  assert.equal(cellDisplayText(table,0,0),'A\nC');
  assert.equal(headerRowCount(table).count,2);
});
