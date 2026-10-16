// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRuby,adjustRubyOnEdit,buildRuby} from '../public/editor/src/ruby.mjs';
test('ruby validation sorts UTF16 ranges without mutating originals',()=>{
  const ranges=[{start:3,end:4,text:'yǐ'},{start:0,end:1,text:'jiǎ'}];
  assert.deepEqual(validateRuby(ranges,'甲😀乙'),[ranges[1],ranges[0]]);
  assert.equal(ranges[0].start,3);assert.deepEqual(validateRuby(undefined,'甲'),[]);
});
test('ruby rejects overlap, invalid ranges, empty annotation and footnote reference',()=>{
  const failures=[[[{start:0,end:2,text:'a'},{start:1,end:3,text:'b'}],'甲乙丙'],[[{start:-1,end:1,text:'a'}],'甲'],[[{start:0,end:2,text:'a'}],'甲'],[[{start:0,end:1,text:' '}],'甲'],[[{start:0,end:1,text:'a\nb'}],'甲'],[[{start:0,end:3,text:'a'}],'甲\n乙'],[[{start:2,end:4,text:'a'}],'甲[^id]乙']];
  for(const [ranges,text] of failures)assert.throws(()=>validateRuby(ranges,text));
});
test('emoji surrogate, modifier, ZWJ, flag and combining graphemes are atomic',()=>{
  for(const text of ['😀','👍🏽','👩‍🔬','🇨🇳','e\u0301']){
    assert.equal(validateRuby([{start:0,end:text.length,text:'reading'}],text).length,1);
    for(let end=1;end<text.length;end++)assert.throws(()=>validateRuby([{start:0,end,text:'bad'}],text),/字素/);
  }
});
test('editing shifts untouched annotations and discards changed base annotations',()=>{
  const old='甲乙丙丁',ranges=[{start:0,end:1,text:'jiǎ'},{start:2,end:4,text:'bǐng dīng'}];
  assert.deepEqual(adjustRubyOnEdit(ranges,old,'甲新增乙丙丁'),[{start:0,end:1,text:'jiǎ'},{start:4,end:6,text:'bǐng dīng'}]);
  assert.deepEqual(adjustRubyOnEdit(ranges,old,'甲乙丙改'),[{start:0,end:1,text:'jiǎ'}]);
  assert.deepEqual(adjustRubyOnEdit(ranges,old,'甲乙'),[{start:0,end:1,text:'jiǎ'}]);
  assert.deepEqual(adjustRubyOnEdit(ranges,old,old),ranges);
});
test('edits at annotation edges stay outside; internal edits invalidate',()=>{
  const range=[{start:1,end:3,text:'yǐ bǐng'}];
  assert.deepEqual(adjustRubyOnEdit(range,'甲乙丙丁','甲新乙丙丁'),[{start:2,end:4,text:'yǐ bǐng'}]);
  assert.deepEqual(adjustRubyOnEdit(range,'甲乙丙丁','甲乙丙新丁'),range);
  assert.deepEqual(adjustRubyOnEdit(range,'甲乙丙丁','甲乙新丙丁'),[]);
});
test('changing emoji and adding combining marks never leaves partial ranges',()=>{
  assert.deepEqual(adjustRubyOnEdit([{start:0,end:2,text:'smile'}],'😀甲','😃甲'),[]);
  assert.deepEqual(adjustRubyOnEdit([{start:0,end:1,text:'e'}],'e','e\u0301'),[]);
  assert.deepEqual(adjustRubyOnEdit([{start:2,end:3,text:'jiǎ'}],'😀甲','👩‍🔬甲'),[{start:5,end:6,text:'jiǎ'}]);
});
test('DOM ruby uses textContent for annotation and supports styled base renderer',()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>({tag,children:[],append(...children){this.children.push(...children);}})};
  try{
    const ruby=buildRuby('重庆','chóng qìng <img>',{renderBase:(rb,text)=>{rb.textContent=text;rb.styled=true;}});
    assert.equal(ruby.tag,'ruby');assert.equal(ruby.children[0].tag,'rb');assert.equal(ruby.children[0].textContent,'重庆');assert.equal(ruby.children[0].styled,true);assert.equal(ruby.children[1].tag,'rt');assert.equal(ruby.children[1].textContent,'chóng qìng <img>');
  }finally{globalThis.document=previous;}
});

