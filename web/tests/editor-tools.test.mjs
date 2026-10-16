// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {findMatches,replaceAll} from '../public/editor/src/editor-tools.mjs';
import {replaceBlockText} from '../public/editor/src/model.mjs';
const fixture=()=>({blocks:[
  {id:'p',type:'paragraph',text:'猫😀 cat CAT catfish [^cat] 猫',marks:[{start:4,end:7,bold:true}]},
  {id:'h',type:'heading',text:'cat标题'},
  {id:'t',type:'table',text:'cat表题',rows:[['cat','其他'],['[^cat]cat','CAT']]},
  {id:'i',type:'image',text:'cat图题'},
  {id:'e',type:'equation',text:'cat+1'},
],notes:[{id:'cat',text:'cat注释 [^cat]'}]});
test('literal Unicode matches keep original UTF16 positions',()=>{
  const doc=fixture();assert.deepEqual(findMatches(doc,'😀').map(m=>[m.start,m.end]),[[1,3]]);
  assert.equal(findMatches(doc,'[').length,0);
  assert.equal(findMatches(doc,'猫').length,2);
  assert.equal(findMatches(doc,'').length,0);
});
test('scope and case options exclude equations and protect references',()=>{
  const doc=fixture();assert.equal(findMatches(doc,'cat').length,10);
  assert.equal(findMatches(doc,'cat',{caseSensitive:true,scope:'body'}).length,2);
  assert.equal(findMatches(doc,'cat',{wholeWord:true,scope:'body'}).length,2);
  assert.equal(findMatches(doc,'cat',{scope:'notes'}).length,1);
  assert.equal(findMatches(doc,'cat',{scope:'caption'}).length,2);
  assert.equal(findMatches(doc,'cat',{scope:'table'}).length,3);
});
test('whole word boundaries use Unicode instead of ASCII word boundaries',()=>{
  const doc={blocks:[{id:'p',type:'paragraph',text:'猫 小猫 猫咪 猫。𠀀猫 Café Caféine'}]};
  assert.equal(findMatches(doc,'猫',{wholeWord:true}).length,2);
  assert.equal(findMatches(doc,'CAFÉ',{wholeWord:true}).length,1);
});
test('replace all preserves original, references, formulas, literal dollar replacement',()=>{
  const doc=fixture(),before=structuredClone(doc);
  const result=replaceAll(doc,'cat','$&',{},replaceBlockText);
  assert.equal(result.count,10);assert.deepEqual(doc,before);
  assert.equal(result.document.blocks[0].text,'猫😀 $& $& $&fish [^cat] 猫');
  assert.equal(result.document.blocks[3].text,'$&图题');
  assert.equal(result.document.blocks[4].text,'cat+1');
  assert.equal(result.document.notes[0].id,'cat');
  assert.equal(result.document.notes[0].text,'$&注释 [^cat]');
});
test('separate replacements preserve a mark between edits',()=>{
  const doc={blocks:[{id:'p',type:'paragraph',text:'cat BOLD cat',marks:[{start:4,end:8,bold:true}]}]};
  const {document}=replaceAll(doc,'cat','x',{},replaceBlockText);
  assert.equal(document.blocks[0].text,'x BOLD x');
  assert.deepEqual(document.blocks[0].marks,[{start:2,end:6,bold:true}]);
});
test('matching cannot partly overwrite a footnote reference',()=>{
  const doc={blocks:[{id:'p',type:'paragraph',text:'a[^id]b id'}]};
  for(const needle of ['id]','a[^','^id','[^id]b'])assert.equal(findMatches(doc,needle).length,0);
  assert.equal(replaceAll(doc,'id','new').document.blocks[0].text,'a[^id]b new');
});
test('replacement limits fail without mutating original',()=>{
  const doc={blocks:[{id:'t',type:'table',rows:[['a']],text:''}]};
  assert.throws(()=>replaceAll(doc,'a','x'.repeat(10001)),/限制/);
  assert.equal(doc.blocks[0].rows[0][0],'a');
});

