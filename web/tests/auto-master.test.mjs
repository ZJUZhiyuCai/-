import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateStory} from '../public/editor/src/auto-flow.mjs';
import {applyOperations,checkDocument} from '../lib/operations.mjs';
import {pageObjects,compositionText,compositionRichText,formatPageNumber} from '../public/editor/src/composition.mjs';
const fixture=()=>checkDocument({format:'open-typesetter',version:3,title:'测试',blocks:[],composition:{pages:[{id:'p',objects:[{id:'f',type:'text',x:10,y:20,width:40,height:20,fontSize:12,columns:[1,1],columnGap:2}]}],masters:[],stories:[{id:'s',name:'long',text:'天地玄黄宇宙洪荒'.repeat(40),spans:[{start:5,end:30,style:{fontSize:20}}],frameIds:['f']}]}});
test('automatic continuation adds real pages, keeps original story and rolls back bounded failure',()=>{
 const d=fixture(),before=structuredClone(d.composition),measure=(s,f)=>[...s].length*f.fontSize;
 const result=paginateStory(d.composition,'s','f',measure,{maxNewPages:100});assert.ok(result.createdPageIds.length>5);assert.deepEqual(d.composition,before);assert.equal(result.composition.stories[0].text,before.stories[0].text);assert.deepEqual(result.composition.stories[0].spans,before.stories[0].spans);assert.equal(paginateStory(result.composition,'s','f',measure).createdPageIds.length,0);
 assert.throws(()=>paginateStory(d.composition,'s','f',measure,{maxNewPages:1}),/PAGE_LIMIT/);assert.deepEqual(d.composition,before);
});
test('master slots survive replacement and geometry updates; reset restores default',()=>{
 let d=fixture();d.composition.stories=[];d.composition.pages[0].objects=[];
 for(const id of ['a','b'])d=applyOperations(d,[{op:'upsert_master',master:{id,name:id,objects:[{id:'f'+id,type:'text',slot:'headline',x:10,y:10,width:60,height:20,text:'Default '+id}]}}]).document;
 d=applyOperations(d,[{op:'assign_master',pageId:'p',masterId:'a'},{op:'set_slot_content',pageId:'p',name:'headline',text:'本页内容'},{op:'assign_master',pageId:'p',masterId:'b'}]).document;
 assert.equal(pageObjects(d.composition,'p')[0].text,'本页内容');assert.equal(pageObjects(d.composition,'p')[0].id,'fb');
 d=applyOperations(d,[{op:'set_slot_content',pageId:'p',name:'headline',reset:true}]).document;assert.equal(pageObjects(d.composition,'p')[0].text,'Default b');
 d=applyOperations(d,[{op:'master_from_page',pageId:'p',newMasterId:'copy',name:'copy'}]).document;assert.equal(d.composition.masters[2].objects[0].text,'Default b');assert.notEqual(d.composition.masters[2].objects[0].id,'fb');
});
test('section numbering restarts, continues and recto/verso insertions preserve existing page IDs',()=>{
 let d=fixture();d=applyOperations(d,[{op:'upsert_page',page:{id:'p2',objects:[]}},{op:'upsert_section',section:{id:'sec',name:'前言',startPageId:'p',pageStart:9,numbering:'roman-lower'}},{op:'upsert_section',section:{id:'sec2',name:'续',startPageId:'p2',numbering:'roman-lower'}}]).document;
 assert.equal(compositionText(d,'p','{page} / {physicalPage}'),'ix / 1');assert.equal(compositionText(d,'p2','{page}'),'x');
 d=applyOperations(d,[{op:'align_section_start',sectionId:'sec',side:'left'}]).document;assert.equal(d.composition.pages[1].id,'p');assert.equal(d.composition.pages[0].masterId,null);assert.equal(compositionText(d,'p','{page} / {physicalPage}'),'ix / 2');
 const next=applyOperations(d,[{op:'align_section_start',sectionId:'sec',side:'left'}]).document;assert.equal(next.composition.pages.length,d.composition.pages.length);assert.equal(formatPageNumber(12,'chinese'),'十二');assert.equal(formatPageNumber(10009,'chinese'),'一万零九');
});

test('page variables preserve intermediate style ranges and never expand document text recursively',()=>{
 const d=fixture();d.title='标题 {page}';const text='{title} 中间 {page} 结尾';const rich=compositionRichText(d,'p',text,[{start:8,end:10,style:{color:'#ff0000'}},{start:11,end:17,style:{fontSize:20}}]);
 assert.equal(rich.text,'标题 {page} 中间 1 结尾');assert.equal(rich.text.slice(rich.spans[0].start,rich.spans[0].end),'中间');assert.equal(rich.text.slice(rich.spans[1].start,rich.spans[1].end),'1');
});

test('automatic continuation inserts before the following chapter, retaining its start page and numbering',()=>{
 let d=fixture();d=applyOperations(d,[{op:'upsert_page',page:{id:'next',objects:[]}},{op:'upsert_section',section:{id:'first',name:'第一章',startPageId:'p'}},{op:'upsert_section',section:{id:'second',name:'第二章',startPageId:'next',pageStart:1}}]).document;
 const result=paginateStory(d.composition,'s','f',(s,f)=>[...s].length*f.fontSize);assert.equal(result.composition.pages.at(-1).id,'next');assert.equal(result.composition.sections[1].startPageId,'next');const next={...d,composition:result.composition};assert.equal(compositionText(next,result.createdPageIds[0],'{section}'),'第一章');assert.equal(compositionText(next,'next','{page}'),'1');
});
