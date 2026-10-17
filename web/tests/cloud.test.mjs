import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {CloudStore} from '../lib/cloud-store.mjs';
import {callTool,toolList} from '../lib/cloud-tools.mjs';
import {handle} from '../lib/http.mjs';
import {makeTemplate} from '../public/editor/src/templates.mjs';
import {readZip} from '../public/editor/src/docx-web.mjs';
import {richFixture} from './fixtures/rich-composition.mjs';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0000_regular_quasimodo.sql',import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){
   const s=sql.prepare(q);
   return {async first(){return s.get(...args)},async all(){return {results:s.all(...args)}},async run(){return {meta:{changes:Number(s.run(...args).changes)}}}};
 }}}};
 const files=new Map(),bucket={async put(k,v){files.set(k,v)},async get(k){return files.has(k)?{text:async()=>files.get(k)}:null},async delete(k){files.delete(k)}};
 const store=new CloudStore(db,bucket,'alice');return {store,db,bucket,env:{DB:db,BUCKET:bucket}};
}
const doc=()=>makeTemplate('academic','测试出版物');
test('all templates satisfy strict document model',async()=>{const {store}=fixture();for(const t of ['book','academic','poetry','blank'])assert.equal((await store.create(t,makeTemplate(t,'测试'))).revision,1);});
test('create / list / duplicate / user isolation',async()=>{const {store,db,bucket}=fixture();await store.create('a',doc());assert.equal((await store.list()).length,1);await assert.rejects(()=>store.create('a',doc()),/ALREADY_EXISTS/);const bob=new CloudStore(db,bucket,'bob');assert.deepEqual(await bob.list(),[]);await assert.rejects(()=>bob.get('a'),/NOT_FOUND/);await bob.create('a',doc());assert.equal((await bob.list()).length,1);});
test('CAS conflict, atomic rollback, dry run and restore',async()=>{const {store}=fixture();await store.create('a',doc());const result=await store.edit('a',1,[{op:'set_title',title:'新书名'}],{dryRun:true});assert.equal(result.document.title,'新书名');assert.equal((await store.get('a')).revision,1);await assert.rejects(()=>store.edit('a',1,[{op:'set_title',title:'错误'},{op:'update_block',blockId:'missing',patch:{text:'x'}}]),/NOT_FOUND/);assert.equal((await store.get('a')).document.title,'测试出版物');await store.edit('a',1,[{op:'set_title',title:'已保存'}]);await assert.rejects(()=>store.edit('a',1,[{op:'set_title',title:'旧写入'}]),/CONFLICT/);assert.equal((await store.restore('a',2,1)).document.title,'测试出版物');assert.equal((await store.get('a')).revision,3);});
test('concurrent saves have exactly one winner',async()=>{const {store}=fixture();await store.create('a',doc());const r=await Promise.allSettled(['甲','乙'].map(title=>store.edit('a',1,[{op:'set_title',title}])));assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal((await store.get('a')).revision,2);});
test('history retains 10 selectable versions and archive is reversible',async()=>{const {store}=fixture();await store.create('a',doc());for(let i=1;i<=12;i++)await store.edit('a',i,[{op:'set_title',title:'版本'+i}]);assert.equal((await store.history('a')).versions.length,10);await store.archive('a',13,true);assert.equal((await store.list())[0].archived,true);await store.archive('a',14,false);assert.equal((await store.list())[0].archived,false);});
test('layout, notes, citations, comments, chapter, table and component operations',async()=>{const {store}=fixture();await store.create('a',doc());let rev=1;const run=async(name,args)=>{const r=await callTool(store,name,{projectId:'a',expectedRevision:rev,...args});rev=r.revision;return r;};await run('set_layout',{patch:{header:'页眉',headerEven:'偶页',footer:'第 {page} 页',columns:1}});await run('chapter_insert',{heading:{id:'newchapter',type:'heading',text:'新章节',level:1},blocks:[{id:'newbody',type:'paragraph',text:'正文'}]});await run('upsert_note',{note:{id:'n2',text:'注释'}});await run('insert_reference',{blockId:'newbody',offset:2,kind:'note',targetId:'n2'});await run('upsert_bibliography',{entry:{id:'book',text:'文献'}});await run('insert_reference',{blockId:'newbody',offset:0,kind:'cite',targetId:'book'});await run('upsert_comment',{comment:{id:'comment',blockId:'newbody',text:'审阅'}});await run('table_set_cell',{blockId:'data',row:1,col:1,text:'200'});await run('table_merge',{blockId:'data',range:{row:1,col:0,rowspan:1,colspan:2}});await run('table_split',{blockId:'data',row:1,col:0});await run('chapter_move',{headingId:'newchapter',beforeId:'title'});const r=await store.get('a');assert.equal(r.document.layout.header,'页眉');assert.equal(r.document.blocks[0].id,'newchapter');assert.equal(r.document.comments.length,1);assert.equal((await callTool(store,'validate_project',{projectId:'a'})).valid,true);await assert.rejects(()=>run('delete_note',{noteId:'n2'}),/DANGLING/);});
test('MCP schemas and JSON-RPC discovery, call, errors, authentication, origin',async()=>{const {env}=fixture();const send=(body,headers={},mcp=true)=>handle(new Request('https://site.example/mcp',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}),env,mcp);const discover=await (await send({jsonrpc:'2.0',id:1,method:'server/discover'})).json();assert.deepEqual(discover.result.supportedVersions,['2026-07-28']);const tools=toolList();assert.ok(tools.length>=40);assert.ok(tools.every(t=>t.inputSchema.type==='object'));const anon=await(await send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'list_projects'}})).json();assert.equal(anon.result.isError,true);const r=await(await send({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'create_project',arguments:{projectId:'from-agent',title:'agent'}}},{'oai-authenticated-user-id':'alice'})).json();assert.equal(r.result.structuredContent.revision,1);assert.equal((await send({tool:'list_projects'},{},false)).status,401);assert.equal((await send({tool:'list_projects'},{origin:'https://evil.example','oai-authenticated-user-id':'alice'},false)).status,403);assert.equal((await send(null)).status,400);});
test('ZIP parser rejects malformed and overlarge documents',async()=>{await assert.rejects(()=>readZip(new Uint8Array([1,2,3]).buffer));await assert.rejects(()=>readZip(new ArrayBuffer(21*1024*1024)),/20 MB/);});
test('cloud composition object listing resolves masters and is owner-isolated',async()=>{const {store,db,bucket}=fixture();await callTool(store,'create_project',{projectId:'frames',document:{format:'open-typesetter',version:3,blocks:[],composition:{pages:[{id:'p1',masterId:'m1',objects:[{id:'f1',type:'text',x:10,y:10,width:40,height:40}],overrides:[{objectId:'mh',patch:{text:'本页'}}]}],masters:[{id:'m1',name:'母版',objects:[{id:'mh',type:'text',x:10,y:1,width:40,height:8,text:'继承'}]}],stories:[{id:'s1',name:'文字流',text:'正文',frameIds:['f1']}]}}});assert.equal((await store.list())[0].blockCount,2);const r=await callTool(store,'list_page_objects',{projectId:'frames',pageId:'p1'});assert.equal(r.objects[0].text,'本页');assert.equal(r.objects[1].storyId,'s1');await assert.rejects(()=>callTool(new CloudStore(db,bucket,'bob'),'list_page_objects',{projectId:'frames',pageId:'p1'}),/NOT_FOUND/);});

function interruptedDb(db,afterCommit){let fault=true;return {prepare(sql){return {bind(...args){const stmt=db.prepare(sql).bind(...args);return {...stmt,async run(){if(fault&&/^(INSERT|UPDATE)/.test(sql)){fault=false;if(afterCommit)await stmt.run();throw Error('D1 transport interrupted');}return stmt.run();}};}};}};}
test('D1 response loss after commit recovers create/save without deleting the referenced R2 object',async()=>{
 const {db,bucket}=fixture();const created=new CloudStore(interruptedDb(db,true),bucket,'alice');const a=await created.create('lost-response',doc());assert.equal(a.recoveredAfterStorageError,true);assert.equal((await created.get('lost-response')).revision,1);
 const saved=new CloudStore(interruptedDb(db,true),bucket,'alice');const b=await saved.edit('lost-response',1,[{op:'set_title',title:'committed'}]);assert.equal(b.recoveredAfterStorageError,true);assert.equal((await saved.get('lost-response')).document.title,'committed');assert.equal((await saved.restore('lost-response',2,1)).document.title,'测试出版物');
});
test('D1 failure before commit preserves the old current document and revision',async()=>{
 const {store,db,bucket}=fixture();await store.create('no-commit',doc());const faulty=new CloudStore(interruptedDb(db,false),bucket,'alice');await assert.rejects(()=>faulty.edit('no-commit',1,[{op:'set_title',title:'never committed'}]),/interrupted/);const current=await store.get('no-commit');assert.equal(current.revision,1);assert.equal(current.document.title,'测试出版物');
});
test('rich story MCP edits address cells, merge/split, row insertion, paragraphs and notes with rollback',async()=>{
 const {store}=fixture();await store.create('rich-tools',{format:'open-typesetter',version:3,blocks:[],composition:richFixture()});let revision=1;
 const run=async(name,args)=>{const r=await callTool(store,name,{projectId:'rich-tools',expectedRevision:revision,storyId:'s',...args});revision=r.revision;return r;};
 await run('story_table_merge',{blockId:'table',range:{row:10,col:0,rowspan:1,colspan:2}});
 await run('story_table_split',{blockId:'table',row:10,col:0});
 await run('story_table_resize',{blockId:'table',axis:'row',index:32});
 await run('story_table_set_cell',{blockId:'table',row:32,col:0,text:'新增行'});
 await run('story_update_paragraph',{blockId:'intro',text:'已更新段落[^intro-note]与尾注[^end-note]。'});
 await run('story_update_note',{noteId:'intro-note',text:'更新注释内容'});
 const before=await store.get('rich-tools');await assert.rejects(()=>run('story_table_resize',{blockId:'table',axis:'row',index:7,remove:true}),/UNREFERENCED/);
 assert.deepEqual(await store.get('rich-tools'),before);assert.equal(before.document.composition.stories[0].blocks[1].rows[32][0],'新增行');
});
