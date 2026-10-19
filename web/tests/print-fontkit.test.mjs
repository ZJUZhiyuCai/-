import test from 'node:test';
import assert from 'node:assert/strict';
import {subsetCidFontdict,cffFdForGlyph} from '../lib/print-fontkit.mjs';

test('CFF FDSelect uses half-open ranges, including every boundary glyph',()=>{
 const select={version:3,ranges:[{first:0,fd:0},{first:5,fd:1},{first:6,fd:2},{first:10,fd:0}],sentinel:13};
 assert.deepEqual(Array.from({length:13},(_,gid)=>cffFdForGlyph(select,gid)),[0,0,0,0,0,1,2,2,2,2,0,0,0]);
 assert.throws(()=>cffFdForGlyph(select,13),/INVALID/);
});

test('CFF subsets preserve a revisited FD and collect its local subroutines by actual FD',()=>{
  const source=[{FontName:'a',Private:{Subrs:['a0','a1','a2']}},{FontName:'b',Private:{Subrs:['b0','b1','b2']}}];
  const subset={glyphs:[0,1,2,3],cff:{fdForGlyph:gid=>[0,1,0,1][gid],topDict:{FDArray:source}},font:{getGlyph:gid=>({get path(){return [];},_usedSubrs:{[gid%3]:true}})},subsetSubrs:(subrs,used)=>subrs.map((s,i)=>used[i]?s:null)};
  const dict={};subsetCidFontdict(subset,dict);
  assert.deepEqual(dict.FDSelect.fds,[0,1,0,1]);
  assert.deepEqual(dict.FDArray.map(d=>d.Private.Subrs),[['a0',null,'a2'],['b0','b1',null]]);
  assert.deepEqual(source[0].Private.Subrs,['a0','a1','a2']);
  assert.ok(dict.FDArray.every(d=>!('FontName' in d)));
});
