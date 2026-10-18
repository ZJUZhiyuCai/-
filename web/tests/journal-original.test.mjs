import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDocument} from '../public/editor/src/model.mjs';
import {documentSchema,operation} from '../lib/schema.mjs';
import {applyOperations} from '../lib/operations.mjs';
const document=()=>({format:'open-typesetter',version:4,journal:{template:'cn-academic',normalizeTypography:true,headSepMm:3.2,bodyWeight:'light',headingFamily:'sans',pageNumberStyle:'dots',yearSuffix:'年',captionBold:true,inlineDisplayThreshold:.9,tableWidthPercent:86,articleNoteId:'n',roleStyles:{'title-zh':{fontFamily:'sans',fontSize:14,leading:18,bold:false,spaceBefore:8,spaceAfter:4},reference:{leading:11.2}}},notes:[{id:'n',text:'合成脚注',marker:'*'}],blocks:[
{id:'p',type:'paragraph',text:'前文'},
{id:'q',type:'paragraph',text:'后文'},
{id:'image',type:'image',src:'data:image/png;base64,AA==',width:40,wrap:'right',sideTextIds:['p','q'],captionIds:['caption'],anchor:{targetId:'p',position:'after',maxPageDistance:0}},
{id:'caption',type:'paragraph',text:'图 1 合成题注'}]});
test('measured role styles and bounded side text survive schema, editor and MCP edits',()=>{
 const raw=document(),clean=validateDocument(documentSchema.parse(raw));assert.deepEqual(clean.journal,raw.journal);assert.deepEqual(clean.blocks[2].sideTextIds,['p','q']);
 const edited=applyOperations(clean,[operation.parse({op:'update_block',blockId:'image',patch:{wrap:'left'}})]).document;
 assert.equal(edited.blocks[2].wrap,'left');assert.deepEqual(edited.journal.roleStyles,raw.journal.roleStyles);
});
test('dangling, discontinuous and overlapping side ranges reject atomic edits',()=>{
 for(const change of [d=>d.blocks[2].sideTextIds=['p','missing'],d=>d.blocks[2].sideTextIds=['q','p'],d=>d.blocks[2].sideTextIds=['caption'],d=>d.blocks[2].width=90,d=>d.blocks[2].wrap='none',d=>d.blocks[1].role='reference',d=>d.blocks[1].text='正文[^n]',d=>d.blocks.splice(1,0,{id:'h',type:'heading',text:'不能跨越的标题'})]){const d=document();change(d);assert.throws(()=>validateDocument(d));}
 const d=validateDocument(document());assert.throws(()=>applyOperations(d,[{op:'delete_blocks',blockIds:['q']}]));assert.equal(d.blocks.length,4);
});
test('unsafe profile values cannot silently disappear during browser validation',()=>{
 for(const patch of [{headSepMm:0},{tableWidthPercent:101},{inlineDisplayThreshold:1},{articleNoteId:'missing'},{roleStyles:{arbitrary:{fontSize:8}}},{roleStyles:{reference:{fontFamily:'untrusted'}}},{roleStyles:{reference:{bold:'yes'}}},{bodyWeight:'thin'}]){assert.throws(()=>validateDocument({...document(),journal:{...document().journal,...patch}}));}
});
