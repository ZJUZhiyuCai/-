import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDocument,plainDocument,replaceBlockText} from '../src/model.mjs';
test('version one migrates and complex blocks survive a JSON roundtrip',()=>{
  const doc=validateDocument({...plainDocument('正文[^n]'),version:1,notes:[{id:'n',text:'注释'}],styles:[{name:'引文',fontSize:10}],blocks:[{type:'table',text:'数据',rows:[['A','B'],['1']],headerRows:1,borderStyle:'three-line'},{type:'equation',text:'\\frac{1}{2}'},{type:'toc',text:'目录'}]});
  assert.equal(doc.version,2);assert.deepEqual(doc.blocks[0].rows,[['A','B'],['1','']]);assert.equal(doc.notes[0].text,'注释');assert.equal(doc.styles[0].name,'引文');assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))),doc);
});
test('edits before and within rich ranges preserve correct Unicode offsets',()=>{
  const block={text:'前😀加粗文字后',marks:[{start:3,end:7,bold:true}]};
  replaceBlockText(block,'新增前😀加粗文字后');assert.deepEqual(block.marks,[{start:5,end:9,bold:true}]);
  replaceBlockText(block,'新增前😀加X粗文字后');assert.equal(block.marks[0].end,10);
  replaceBlockText(block,'新增前😀后');assert.deepEqual(block.marks,[]);
});
test('bad rich ranges, duplicate notes, oversized tables rejected',()=>{
  const doc=plainDocument('甲乙');
  assert.throws(()=>validateDocument({...doc,blocks:[{type:'paragraph',text:'甲',marks:[{start:0,end:9,bold:true}]}]}));
  assert.throws(()=>validateDocument({...doc,notes:[{id:'a',text:'一'},{id:'a',text:'二'}]}));
  assert.throws(()=>validateDocument({...doc,blocks:[{type:'table',rows:[Array(51).fill('')]}]}));
});
