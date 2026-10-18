import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDocument,applyOperations} from '../lib/operations.mjs';
import {assembleBook} from '../public/editor/src/workspace-tools.mjs';
const source=()=>({format:'open-typesetter',version:4,blocks:[
  {id:'table',type:'table',rows:[['A','B'],['C','D']],borderStyle:'none',cellImages:[{row:0,col:0,imageId:'a'}]},
  {id:'a',type:'image',text:'',src:'data:image/png;base64,AAAA',width:100}
]});
test('cell ownership round trips through the document and AI mutation schema',()=>{
  const doc=checkDocument(source());assert.equal(doc.version,4);assert.deepEqual(checkDocument(JSON.parse(JSON.stringify(doc))),doc);
  const changed=applyOperations(doc,[{op:'update_block',blockId:'table',patch:{cellImages:[{row:1,col:1,imageId:'a'}],borderStyle:'none'}}]).document;
  assert.deepEqual(changed.blocks[0].cellImages,[{row:1,col:1,imageId:'a'}]);
  for(const mutate of [d=>d.blocks.pop(),d=>d.blocks[0].cellImages.push({row:1,col:1,imageId:'a'}),d=>d.blocks[0].cellImages[0].row=9,d=>d.blocks[1].text='lost caption',d=>d.blocks[1].wrap='left',d=>d.blocks[0].merges=[{row:0,col:0,rowspan:2,colspan:1}]]){const d=source();mutate(d);assert.throws(()=>checkDocument(d),/单元格图片/);}
});
test('table edits reindex ownership and reject removing owned images or covering their cells',()=>{
  const doc=checkDocument(source());
  assert.throws(()=>applyOperations(doc,[{op:'table_resize',blockId:'table',axis:'row',index:0,remove:true}]),/图片/);
  assert.throws(()=>applyOperations(doc,[{op:'delete_blocks',blockIds:['a']}]),/图片/);
  const changed=applyOperations(doc,[{op:'table_resize',blockId:'table',axis:'row',index:0},{op:'table_resize',blockId:'table',axis:'col',index:0}]).document;
  assert.deepEqual(changed.blocks[0].cellImages,[{row:1,col:1,imageId:'a'}]);
  assert.throws(()=>applyOperations(changed,[{op:'table_merge',blockId:'table',range:{row:1,col:0,rowspan:1,colspan:2}}]),/图片/);
  const joined=applyOperations(doc,[{op:'table_merge',blockId:'table',range:{row:0,col:0,rowspan:1,colspan:2}},{op:'table_split',blockId:'table',row:0,col:0}]).document;
  assert.deepEqual(joined.blocks[0].cellImages,doc.blocks[0].cellImages);
});
test('chapter assembly remaps table image identities without collisions',()=>{
  const result=assembleBook(source(),[source()]).doc,tables=result.blocks.filter(b=>b.type==='table');
  assert.equal(tables.length,2);assert.notEqual(tables[0].cellImages[0].imageId,tables[1].cellImages[0].imageId);
  for(const t of tables)assert.ok(result.blocks.some(b=>b.id===t.cellImages[0].imageId&&b.type==='image'));
});
