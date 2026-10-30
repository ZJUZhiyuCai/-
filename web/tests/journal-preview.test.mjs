import test from 'node:test';
import assert from 'node:assert/strict';
import {journalPreviewStyle,journalFrontMatter} from '../public/editor/src/journal-preview.mjs';
import {styleBlock} from '../public/editor/src/pagination.mjs';
test('journal role typography is used for both measuring and rendering without changing source style',()=>{
 const block={type:'paragraph',role:'title-zh',text:'标题',fontSize:8},before=structuredClone(block);
 const style={setProperty(){}};styleBlock({style},block,{fontSize:9,lineHeight:1.6,height:240,top:16,bottom:16,_journal:{}});
 assert.equal(style.fontSize,'15pt');assert.equal(style.textAlign,'center');assert.equal(style.fontWeight,'700');assert.equal(style.textIndent,'0');assert.deepEqual(block,before);
 assert.equal(journalPreviewStyle(block,null),null);
});
test('journal front matter spans columns once and falls back for oversized or footnoted content',()=>{
 const doc={journal:{},layout:{columns:2},blocks:[{id:'title',type:'paragraph',role:'title-zh',text:'题名'},{id:'abstract',type:'paragraph',role:'abstract-zh',text:'摘要'},{id:'body',type:'paragraph',text:'正文'},{id:'ref',type:'paragraph',role:'reference',text:'参考文献'}]},before=structuredClone(doc);
 const front=journalFrontMatter(doc,()=>20,100);
 assert.deepEqual(front.parts.map(p=>p.block.id),['title','abstract']);assert.equal(front.height,40);assert.ok(front.parts.every(p=>p.fullWidth));assert.deepEqual(doc,before);
 assert.equal(journalFrontMatter(doc,()=>60,100).parts.length,0);
 assert.equal(journalFrontMatter({...doc,layout:{columns:1}},()=>20,100).parts.length,0);
 assert.equal(journalFrontMatter({...doc,layout:{columns:2,writingMode:'vertical-rl'}},()=>20,100).parts.length,0);
 doc.blocks[0].text+='[^note]';assert.equal(journalFrontMatter(doc,()=>20,100).parts.length,0);
});
test('explicit journal role overrides preserve false bold and zero spacing',()=>{
 const style=journalPreviewStyle({role:'title-zh'},{roleStyles:{'title-zh':{fontSize:16,leading:20,bold:false,spaceBefore:0,spaceAfter:0}}});
 assert.equal(style.fontSize,'16pt');assert.equal(style.lineHeight,'1.25');assert.equal(style.fontWeight,'400');assert.equal(style.paddingTop,'0pt');
});
